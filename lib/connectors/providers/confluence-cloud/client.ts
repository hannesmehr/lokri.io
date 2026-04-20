/**
 * Dünner HTTP-Client für Confluence Cloud.
 *
 * Zuständig für:
 *   - Basic-Auth-Header-Konstruktion aus `email:apiToken`
 *   - URL-Konstruktion gegen den konfigurierten `siteUrl`
 *   - **Same-Origin-Assert** vor jedem Fetch: parse mit `new URL(input, site)`
 *     und vergleiche Protocol/Host/Port. Defense-in-Depth gegen SSRF aus
 *     Pagination-Links (`_links.next` in Confluence-v2-Responses), Redirects
 *     oder manipulierten Payloads. Findet auch Protocol-relative URLs
 *     (`//evil.com/path` → resolved zu `https://evil.com/path`).
 *   - Timeout-Enforcement via internem `AbortController` (Default 10s),
 *     kombinierbar mit einem externen `AbortSignal` aus dem Federation-
 *     Layer — frühester Abort gewinnt. Nutzt `AbortSignal.any(...)`
 *     (Node 22+, stable).
 *   - Mapping HTTP-Status → typisierte Connector-Errors:
 *       401/403 → `ConnectorAuthError` (Token ungültig/gesperrt)
 *       404     → `ConnectorUpstreamError` mit 404-Status (Caller
 *                 entscheidet, ob das ein Tool-Fehler oder
 *                 Config-Problem ist; v.a. read-page unterscheidet)
 *       429     → `ConnectorUpstreamError` mit `retryAfter`-Metadata
 *       5xx     → `ConnectorUpstreamError` mit Status
 *       Abort   → `ConnectorUpstreamError("request aborted…", { cause: AbortError })`
 *                 Keine Unterscheidung zwischen internem Timeout und
 *                 externem Signal — für den Caller ist beides „Upstream
 *                 hat nicht rechtzeitig geantwortet".
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
  /**
   * Externer AbortSignal aus dem Federation-Layer (runUnifiedSearch
   * erzeugt pro Source einen Controller + 5s-Timeout). Wird mit dem
   * internen Client-Timeout via `AbortSignal.any(...)` kombiniert,
   * der frühere von beiden gewinnt. Null/undefined = nur interner
   * Timeout greift.
   */
  abortSignal?: AbortSignal;
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
  private readonly abortSignal?: AbortSignal;
  private readonly baseOrigin: string;

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
    this.abortSignal = options.abortSignal;
    // Precompute origin für SSRF-Check (Hot-Path). URL-Parser
    // normalisiert Host-Casing (`EMPRO.atlassian.net` → `empro.atlassian.net`).
    this.baseOrigin = new URL(this.config.siteUrl).origin;
  }

  async get<T>(path: string, query?: URLSearchParams): Promise<T> {
    const url =
      query && query.toString().length > 0
        ? `${buildConfluenceUrl(this.config.siteUrl, path)}?${query.toString()}`
        : buildConfluenceUrl(this.config.siteUrl, path);
    return this.request<T>("GET", url);
  }

  /**
   * Für Pagination-Links aus Confluence-Responses (`_links.next`).
   * Akzeptiert relative Pfade (`/wiki/api/v2/spaces?cursor=…`) und
   * absolute URLs. Same-Origin-Check läuft in `request()` — hier nur
   * Parse + Normalisierung.
   */
  async getAbsolute<T>(urlOrPath: string): Promise<T> {
    return this.request<T>("GET", urlOrPath);
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    const url = buildConfluenceUrl(this.config.siteUrl, path);
    return this.request<T>("POST", url, body);
  }

  /**
   * Resolve + Validate: `input` kann relativ, absolut oder protocol-
   * relative (`//evil.com/…`) sein. Der URL-Konstruktor mit `base`
   * resolved alle drei Formen. Danach wird der Origin verglichen —
   * Mismatch ⇒ `ConnectorUpstreamError`.
   *
   * Wirft **bevor** fetch oder irgendein Auth-Header die Datei verlässt.
   * Credentials leaken nicht, selbst wenn ein Atlassian-Payload
   * manipuliert wurde.
   */
  private assertSameOriginOrThrow(input: string): URL {
    let parsed: URL;
    try {
      parsed = new URL(input, this.baseOrigin);
    } catch (err) {
      throw new ConnectorUpstreamError(
        `Invalid Confluence URL: ${input.slice(0, 80)}`,
        { cause: err instanceof Error ? err : new Error(String(err)) },
      );
    }
    if (parsed.origin !== this.baseOrigin) {
      throw new ConnectorUpstreamError(
        // Origin wird geloggt (bewusst), damit Ops den Angriffsversuch
        // diagnostizieren kann. Der Pfad kommt nicht mit rein — falls
        // der User-Input PII enthielt, bleibt er implizit.
        `Upstream URL rejected by same-origin guard: ${parsed.origin} (expected ${this.baseOrigin})`,
      );
    }
    return parsed;
  }

  private buildRequestSignal(): { signal: AbortSignal; cleanup: () => void } {
    const internal = new AbortController();
    const timer = setTimeout(() => internal.abort(), this.timeoutMs);
    const cleanup = () => clearTimeout(timer);
    // Keine externe Quelle → direkt der interne Controller.
    if (!this.abortSignal) {
      return { signal: internal.signal, cleanup };
    }
    // Mit externer Quelle: `AbortSignal.any` kombiniert — der erste
    // Abort propagiert. Kein Listener-Manual-Wiring nötig.
    const combined = AbortSignal.any([internal.signal, this.abortSignal]);
    return { signal: combined, cleanup };
  }

  private async request<T>(
    method: string,
    urlOrPath: string,
    body?: unknown,
  ): Promise<T> {
    // SSRF-Guard: Parse + Same-Origin-Check vor Fetch. Wirft
    // `ConnectorUpstreamError` bei Foreign-Host — Credentials werden
    // nie an fremde Hosts gesendet.
    const parsedUrl = this.assertSameOriginOrThrow(urlOrPath);
    const url = parsedUrl.toString();

    const { signal, cleanup } = this.buildRequestSignal();

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
        signal,
      });
    } catch (err) {
      const aborted = err instanceof Error && err.name === "AbortError";
      throw new ConnectorUpstreamError(
        aborted
          ? `Confluence request aborted (${describeRequest(method, url)})`
          : `Confluence request failed: ${describeRequest(method, url)}`,
        { cause: err },
      );
    } finally {
      cleanup();
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
