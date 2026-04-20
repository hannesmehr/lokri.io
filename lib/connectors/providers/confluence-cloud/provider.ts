/**
 * `ConfluenceCloudProvider` — Skelett für Block 1.
 *
 * Implementiert `testCredentials` und `discoverScopes` gegen die echte
 * Confluence-Cloud-API. `executeTool` wirft — die vier MVP-Tools
 * kommen in Block 2 (dieses Connector-Plans).
 *
 * Endpoint-Wahl (mixed-mode, vereinbart):
 *   - `testCredentials` → v1 `/wiki/rest/api/user/current` (stabilstes
 *     „Who am I"-Endpoint quer über alle Cloud-Instanzen)
 *   - `discoverScopes`  → v2 `/wiki/api/v2/spaces?type=global` mit
 *     Cursor-Pagination via `_links.next`. v2 liefert die numerische
 *     `id`, die wir als `metadata.spaceId` persistieren — die v2-Tools
 *     in Block 2 (`list-recent`, `get-page-children`) brauchen die ID,
 *     nicht den Key.
 *
 * Dependency-Injection: `fetchImpl` wird durch den Konstruktor
 * durchgereicht und von allen internen `ConfluenceCloudClient`-
 * Instanzen geteilt. Tests injizieren eine Mock-Funktion.
 */

import {
  ConnectorAuthError,
  ConnectorConfigError,
  ConnectorUpstreamError,
} from "@/lib/connectors/errors";
import type { ConnectorProvider } from "@/lib/connectors/provider";
import type {
  DiscoveredScope,
  ExecutionContext,
  TestResult,
  ToolResult,
} from "@/lib/connectors/types";
import { ConfluenceCloudClient } from "./client";
import {
  confluenceCloudConfigSchema,
  type ConfluenceCloudConfig,
} from "./config";
import {
  confluenceCloudCredentialsSchema,
  type ConfluenceCloudCredentials,
} from "./credentials";
import { confluenceCloudDefinition } from "./definition";
import { decryptConnectorCredentials } from "@/lib/connectors/encryption";
import {
  CONFLUENCE_TOOLS,
  type ConfluenceTool,
  type ConfluenceToolName,
} from "./tools";

// ---------------------------------------------------------------------------
// Response-Shapes
// ---------------------------------------------------------------------------

interface UserCurrentResponse {
  type: string;
  accountId: string;
  accountType?: string;
  email?: string;
  publicName?: string;
  displayName?: string;
}

interface SpaceV2 {
  id: string; // numerisch als String geliefert
  key: string;
  name: string;
  type: string;
  status?: string;
  description?: unknown;
  _links?: Record<string, unknown>;
}

interface SpacesV2Response {
  results: SpaceV2[];
  _links?: {
    next?: string;
  };
}

// Sanity-Cap: wir paginieren max 4 Seiten à 250 (Enterprise-Instanzen
// mit >1000 Spaces sind Extremfälle; das Admin-UI würde ohnehin eine
// Suche brauchen — kommt in Block 3 oder später).
const MAX_SCOPES_PER_DISCOVERY = 1000;
const SPACES_PAGE_SIZE = 250;

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface ConfluenceCloudProviderOptions {
  /** DI für Tests + Live-Script. Default nutzt die interne Default-
   *  Logik von `ConfluenceCloudClient` (= `globalThis.fetch`). */
  fetchImpl?: typeof fetch;
  /** Timeout pro Upstream-Call in ms. Default 10_000. */
  timeoutMs?: number;
}

export class ConfluenceCloudProvider implements ConnectorProvider {
  readonly definition = confluenceCloudDefinition;

  constructor(
    private readonly options: ConfluenceCloudProviderOptions = {},
  ) {}

  // -------------------------------------------------------------------------
  // testCredentials — Setup-Flow
  // -------------------------------------------------------------------------

  async testCredentials(
    credentialsInput: unknown,
    configInput: unknown,
  ): Promise<TestResult> {
    // Eingabe-Validierung via Zod. Ungültige Inputs = Caller-Bug;
    // wir verpacken das nicht in TestResult, weil der Caller es
    // catch'en und als UX-Fehler ausweisen muss.
    const credentials = confluenceCloudCredentialsSchema.parse(credentialsInput);
    const config = confluenceCloudConfigSchema.parse(configInput);

    const client = this.buildClient(credentials, config);

    try {
      const me = await client.get<UserCurrentResponse>(
        "/wiki/rest/api/user/current",
      );
      const displayName = me.publicName ?? me.displayName ?? "Unbekannt";
      return {
        ok: true,
        message: `Eingeloggt als ${displayName}.`,
        diagnostics: {
          accountId: me.accountId,
          email: me.email ?? null,
          publicName: me.publicName ?? null,
          displayName: me.displayName ?? null,
          apiVersion: "v1",
        },
      };
    } catch (err) {
      if (err instanceof ConnectorAuthError) {
        return {
          ok: false,
          message: "Email oder API-Token wurden von Confluence abgelehnt.",
        };
      }
      if (err instanceof ConnectorUpstreamError) {
        return {
          ok: false,
          message: `Confluence ist aktuell nicht erreichbar: ${err.message}`,
          diagnostics: err.status ? { httpStatus: err.status } : undefined,
        };
      }
      // Alles andere ist ein Programmier-/Zod-Fehler → hochwerfen.
      throw err;
    }
  }

  // -------------------------------------------------------------------------
  // discoverScopes — Setup-Flow, nach testCredentials
  // -------------------------------------------------------------------------

  async discoverScopes(
    credentialsInput: unknown,
    configInput: unknown,
  ): Promise<DiscoveredScope[]> {
    const credentials = confluenceCloudCredentialsSchema.parse(credentialsInput);
    const config = confluenceCloudConfigSchema.parse(configInput);

    const client = this.buildClient(credentials, config);
    const collected: SpaceV2[] = [];

    // Erste Seite mit expliziten Query-Params.
    const firstParams = new URLSearchParams({
      type: "global",
      limit: String(SPACES_PAGE_SIZE),
    });

    let page: SpacesV2Response = await client.get<SpacesV2Response>(
      "/wiki/api/v2/spaces",
      firstParams,
    );
    collected.push(...page.results);

    // Folge-Seiten via `_links.next`. Der String enthält bereits alle
    // Query-Params inkl. Cursor.
    let nextLink = page._links?.next;
    while (nextLink && collected.length < MAX_SCOPES_PER_DISCOVERY) {
      page = await client.getAbsolute<SpacesV2Response>(nextLink);
      collected.push(...page.results);
      nextLink = page._links?.next;
    }

    // Fehler beim Discovery werden NICHT in TestResult verpackt — sie
    // fliegen hoch. Der Setup-Flow ruft testCredentials zuerst, und
    // wenn das grün war, ist ein Fehler in discoverScopes ein echtes
    // Problem, das der Caller (API-Route in Block 3) als HTTP-500 o.ä.
    // weiterreichen soll.

    return collected.slice(0, MAX_SCOPES_PER_DISCOVERY).map((s) => ({
      type: "confluence-space",
      identifier: s.key,
      metadata: {
        displayName: s.name,
        spaceId: s.id, // v2-ID für spätere v2-Tools
        confluenceType: s.type,
        status: s.status ?? null,
      },
    }));
  }

  // -------------------------------------------------------------------------
  // executeTool — Dispatch an Tool-Module
  // -------------------------------------------------------------------------

  async executeTool(
    toolName: string,
    args: unknown,
    context: ExecutionContext,
  ): Promise<ToolResult> {
    // Cast auf ConfluenceTool<unknown>: der Union-Type-Intersection-Effekt
    // von `CONFLUENCE_TOOLS[name]` kollabiert Args zu einem Und-Typ, der
    // niemals matcht. Einzeln würden Types sauber narrowen, aber der
    // Dispatch ist per Natur generisch. Der Cast ist unbedenklich, weil
    // `argsSchema.parse` die Shape per Runtime-Schema validiert.
    const tool = CONFLUENCE_TOOLS[toolName as ConfluenceToolName] as
      | ConfluenceTool<unknown>
      | undefined;
    if (!tool) {
      throw new ConnectorConfigError(
        `Unknown Confluence Cloud tool: "${toolName}". Known: [${Object.keys(CONFLUENCE_TOOLS).join(", ")}]`,
      );
    }

    // Credentials + Config aus der Integration ziehen. Klartext
    // bleibt stack-lokal — keine Speicherung auf der Provider-Instanz.
    const credentials = decryptConnectorCredentials<ConfluenceCloudCredentials>(
      context.integration.credentialsEncrypted,
    );
    const validatedCredentials =
      confluenceCloudCredentialsSchema.parse(credentials);
    const validatedConfig = confluenceCloudConfigSchema.parse(
      context.integration.config,
    );
    const parsedArgs = tool.argsSchema.parse(args);

    const client = this.buildClient(validatedCredentials, validatedConfig);
    return tool.execute(client, parsedArgs, context);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private buildClient(
    credentials: ConfluenceCloudCredentials,
    config: ConfluenceCloudConfig,
  ): ConfluenceCloudClient {
    return new ConfluenceCloudClient(credentials, config, {
      fetchImpl: this.options.fetchImpl,
      timeoutMs: this.options.timeoutMs,
    });
  }
}
