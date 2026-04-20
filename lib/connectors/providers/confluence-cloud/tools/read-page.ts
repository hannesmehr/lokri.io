/**
 * `read-page` — Einzelne Confluence-Page per ID laden.
 *
 * Endpoint: v2 `/wiki/api/v2/pages/{id}?body-format=view`
 *
 * Scope-Strategie: Pre-Filter-Check ist **nicht möglich**, weil wir
 * erst nach dem Fetch wissen, in welcher Space die Page liegt. Zwei
 * Konsequenzen:
 *
 *   1. `requiredScopes` liefert `[]` — der Pre-Filter ist ein No-Op
 *   2. `extractObservedScopes` macht die ganze Arbeit: es emittiert
 *      exakt die Space der Page (via spaceId→Key-Lookup gegen
 *      context.scopes). Ist die Space nicht in der Allowlist, kommt
 *      ein ScopeRef mit dem unbekannten `spaceId` als Identifier
 *      heraus — der Post-Filter matcht dann garantiert nicht und
 *      wirft `ConnectorScopePostError`. Damit ist auch ein Page-ID-
 *      Guess-Attack abgedeckt.
 *
 * Body-Format `view`: Confluence rendert zu HTML. Das ist für MCP-
 * Konsumenten (Claude Desktop etc.) besser als `storage` (XML-ähnliches
 * Confluence-Markup) oder `atlas_doc_format` (JSON-AST). HTML wird
 * im Post-Mapper zu Plain-Text gestrippt.
 */

import { z } from "zod";
import { ConnectorUpstreamError } from "@/lib/connectors/errors";
import type { ScopeRef } from "@/lib/connectors/filters";
import type { ExecutionContext, ToolResult } from "@/lib/connectors/types";
import type { ConfluenceCloudClient } from "../client";
import {
  extractSpaceKeyFromWebui,
  resolveSpaceIdToKey,
  siteWikiPrefix,
  stripHtml,
  type ConfluenceTool,
} from "./types";

// ---------------------------------------------------------------------------
// args schema
// ---------------------------------------------------------------------------

const readPageArgsSchema = z.object({
  pageId: z
    .string()
    .trim()
    .min(1)
    .max(64)
    // Confluence page-IDs sind numerische Strings; strikter als free-text
    // reduziert Missbrauch (Injection in URL-Pfad)
    .regex(/^\d+$/, "pageId must be a numeric Confluence page ID"),
});

type ReadPageArgs = z.infer<typeof readPageArgsSchema>;

// ---------------------------------------------------------------------------
// v2 page response shape (verkürzt auf die Felder, die wir nutzen)
// ---------------------------------------------------------------------------

interface V2PageResponse {
  id: string;
  status: string;
  title: string;
  spaceId: string;
  parentId?: string | null;
  authorId?: string;
  createdAt?: string;
  version?: {
    number?: number;
    createdAt?: string;
    authorId?: string;
    message?: string | null;
  };
  body?: {
    view?: {
      representation?: string;
      value?: string;
    };
  };
  _links?: {
    webui?: string;
    base?: string;
  };
}

// ---------------------------------------------------------------------------
// Result-Shape
// ---------------------------------------------------------------------------

export interface ReadPageData {
  pageId: string;
  title: string;
  /** HTML-gerenderter Body (view-Format). */
  bodyHtml: string;
  /** Plain-Text-Extrakt aus `bodyHtml` — für MCP-Tools, die keinen
   *  HTML-Renderer haben. */
  bodyText: string;
  spaceId: string;
  /** Null, falls `spaceId` nicht gegen die Allowlist auflösbar —
   *  Post-Filter wird das eh blocken, aber wir geben es ehrlich an. */
  spaceKey: string | null;
  url: string;
  version: number | null;
  lastModified: string | null;
  parentId: string | null;
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export const confluenceReadPageTool: ConfluenceTool<ReadPageArgs> = {
  name: "read-page",
  argsSchema: readPageArgsSchema,

  requiredScopes(): ScopeRef[] {
    // Absichtlich leer — Scope-Check passiert erst nach dem Fetch.
    return [];
  },

  extractObservedScopes(result): ScopeRef[] {
    const data = result.data as ReadPageData | null;
    if (!data) return [];
    // Wir emittieren den Scope auf Basis der spaceId. Wenn die im
    // context.scopes nicht auflösbar war, nehmen wir die spaceId als
    // Identifier — garantiert kein Allowlist-Match → Post-Filter blockt.
    return [
      {
        type: "confluence-space",
        identifier: data.spaceKey ?? `__unknown_space_id:${data.spaceId}`,
      },
    ];
  },

  async execute(client, args, context): Promise<ToolResult> {
    // body-format=view braucht zusätzlich `include-version=true`, damit
    // `version`-Objekt kommt. Wir setzen gezielt, was wir brauchen.
    const params = new URLSearchParams({
      "body-format": "view",
      "include-version": "true",
    });

    let response: V2PageResponse;
    try {
      response = await client.get<V2PageResponse>(
        `/wiki/api/v2/pages/${encodeURIComponent(args.pageId)}`,
        params,
      );
    } catch (err) {
      // 404 → Page existiert nicht oder ist nicht sichtbar. Wir werfen
      // nicht auf, sondern geben `failure` zurück — dann landet's im
      // Usage-Log ohne `last_error`-Update auf der Integration.
      if (
        err instanceof ConnectorUpstreamError &&
        err.status === 404
      ) {
        return {
          status: "failure",
          data: null,
          reason: `Page ${args.pageId} nicht gefunden oder nicht zugänglich.`,
        };
      }
      throw err;
    }

    if (!response || typeof response.id !== "string") {
      return {
        status: "failure",
        data: null,
        reason: "Confluence lieferte eine unerwartete Response.",
      };
    }

    const bodyHtml = response.body?.view?.value ?? "";
    const prefix = siteWikiPrefix(context);
    const webui = response._links?.webui ?? "";
    // Primär: spaceId → Key-Lookup gegen Allowlist
    const spaceKeyFromScopes = resolveSpaceIdToKey(response.spaceId, context);
    // Fallback: aus `_links.webui` parsen (nur wenn Key matched, sonst
    // könnte ein Leak Richtung Allowlist-externe Space aufkommen — wir
    // vertrauen dem webui-Parse aber NICHT für Scope-Checks; er dient
    // nur fürs UI-URL, nicht für Enforcement)
    const spaceKeyFromWebui = webui ? extractSpaceKeyFromWebui(webui) : null;
    const effectiveKey = spaceKeyFromScopes ?? spaceKeyFromWebui;

    return {
      status: "success",
      data: {
        pageId: response.id,
        title: response.title,
        bodyHtml,
        bodyText: stripHtml(bodyHtml),
        spaceId: response.spaceId,
        spaceKey: spaceKeyFromScopes, // NUR dieser Wert zählt für Enforcement
        url: webui ? `${prefix}${webui}` : "",
        version: response.version?.number ?? null,
        lastModified: response.version?.createdAt ?? response.createdAt ?? null,
        parentId: response.parentId ?? null,
        // Read-only non-enforcement-Feld, rein für UI/URL-Display:
        _displayHintSpaceKey: effectiveKey,
      } satisfies ReadPageData & { _displayHintSpaceKey: string | null },
    };
  },
};
