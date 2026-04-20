/**
 * Dünner HTTP-Client für Confluence Cloud.
 *
 * Zuständig für:
 *   - Basic-Auth-Header-Konstruktion aus `email:apiToken`
 *   - URL-Konstruktion gegen den konfigurierten `siteUrl`
 *   - Timeout-Enforcement via `AbortSignal` (Default 10s)
 *   - Mapping HTTP-Status → typisierte Connector-Errors:
 *       401/403 → `ConnectorAuthError` (Token ungültig/gesperrt)
 *       404     → `ConnectorUpstreamError` mit 404-Status (Caller
 *                 entscheidet, ob das ein Tool-Fehler oder
 *                 Config-Problem ist; v.a. read-page unterscheidet)
 *       429     → `ConnectorUpstreamError` mit `retryAfter`-Metadata
 *       5xx     → `ConnectorUpstreamError` mit Status
 *       Timeout → `ConnectorUpstreamError("timeout", { cause: AbortError })`
 *       Netzwerk → `ConnectorUpstreamError(msg, { cause: err })`
 *
 * Security-Hinweis: Der Authorization-Header wird **nie** in Fehler-
 * Messages geschrieben. Wir schreiben Status + URL-Pfad (ohne Query-
 * Params, die PII enthalten könnten — Pfad reicht für Debugging).
 *
 * Die `fetchImpl`-Option ist für Tests: reine DI, keine globale
 * Mock-Mutation. Default `globalThis.fetch` (Node 22+).
 */

import { ConnectorAuthError, ConnectorUpstreamError } from "@/lib/connectors/errors";
import { buildConfluenceUrl, type ConfluenceCloudConfig } from "./config";
import type { ConfluenceCloudCredentials } from "./credentials";

export interface ConfluenceCloudClientOptions {
  /** Default 10_000. */
  timeoutMs?: number;
  /** DI für Tests. Default `globalThis.fetch`. */
  fetchImpl?: typeof fetch;
}

/** Pfad + Query aus Sicht des Loggings — ohne Auth-Header. */
function describeRequest(method: string, url: string): string {
  try {
    const u = new URL(url);
    return `${method} ${u.pathname}`;
  } catch {
    return `${method} ${url}`;
  }
}

export class ConfluenceCloudClient {
  private readonly authHeader: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(
    credentials: ConfluenceCloudCredentials,
    private readonly config: ConfluenceCloudConfig,
    options: ConfluenceCloudClientOptions = {},
  ) {
    // Basic <base64("email:apiToken")>. Node 22+ hat globales btoa.
    // Token lebt nur als Derivat in dieser Instanz; der Plaintext-
    // `apiToken` wird nicht gespeichert.
    const token = `${credentials.email}:${credentials.apiToken}`;
    this.authHeader = `Basic ${Buffer.from(token, "utf8").toString("base64")}`;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async get<T>(path: string, query?: URLSearchParams): Promise<T> {
    const url =
      query && query.toString().length > 0
        ? `${buildConfluenceUrl(this.config.siteUrl, path)}?${query.toString()}`
        : buildConfluenceUrl(this.config.siteUrl, path);
    return this.request<T>("GET", url);
  }

  /** Absolute Confluence-URL (z.B. aus `_links.next` in einer v2-Response,
   *  das kommt als relativer Pfad wie `/wiki/api/v2/spaces?cursor=…`). */
  async getAbsolute<T>(urlOrPath: string): Promise<T> {
    // `_links.next` in v2 ist relativ zum Host (beginnt mit `/wiki/…`).
    // Wir normalisieren beide Formen (absolute + relative).
    const url = /^https?:\/\//.test(urlOrPath)
      ? urlOrPath
      : buildConfluenceUrl(this.config.siteUrl, urlOrPath);
    return this.request<T>("GET", url);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = buildConfluenceUrl(this.config.siteUrl, path);
    return this.request<T>("POST", url, body);
  }

  private async request<T>(
    method: string,
    url: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method,
        headers: {
          Authorization: this.authHeader,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (err) {
      const abort = err instanceof Error && err.name === "AbortError";
      throw new ConnectorUpstreamError(
        abort
          ? `Confluence request timed out after ${this.timeoutMs}ms (${describeRequest(method, url)})`
          : `Confluence request failed: ${describeRequest(method, url)}`,
        { cause: err },
      );
    } finally {
      clearTimeout(timer);
    }

    if (response.ok) {
      // Manche v2-Endpoints liefern 204 für leere Responses. Defensiv:
      // bei 204 gib `null`-cast-als-T zurück, damit Caller crashen
      // falls sie doch JSON erwartet haben — wir wollen keinen stummen
      // undefined.
      if (response.status === 204) return null as T;
      return (await response.json()) as T;
    }

    // Fehler-Pfad — klassifizieren und werfen.
    if (response.status === 401 || response.status === 403) {
      // Body nicht durchreichen: 401/403-Responses enthalten oft den
      // maskierten Token-Hash ("X-AREQUESTID: …"); der gehört nicht
      // in User-facing Messages.
      throw new ConnectorAuthError(
        `Confluence rejected credentials (${response.status}) on ${describeRequest(method, url)}`,
      );
    }

    // 429 und 5xx → Upstream. Für 429 nehmen wir `Retry-After` aus dem
    // Header (Sekunden oder HTTP-Date) und packen es in `cause.retryAfter`
    // für später — MVP macht kein Retry, aber das Metadatum ist da.
    if (response.status === 429) {
      const retryAfter = response.headers.get("retry-after");
      throw new ConnectorUpstreamError(
        `Confluence rate-limited (429) on ${describeRequest(method, url)}`,
        {
          status: 429,
          cause: retryAfter ? { retryAfter } : undefined,
        },
      );
    }

    throw new ConnectorUpstreamError(
      `Confluence responded ${response.status} on ${describeRequest(method, url)}`,
      { status: response.status },
    );
  }
}
