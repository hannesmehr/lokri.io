/**
 * Error-Hierarchie für das Connector-Framework.
 *
 * Die Klassen sind flache Marker-Klassen — `instanceof`-Checks sind die
 * primäre Differenzierung. Der `kind`-Discriminator doppelt das als
 * serialisierbarer String für Logs/Metadaten (`connector_usage_log.
 * response_metadata.errorKind`).
 *
 * Welche Fehler wird wer wo?
 *   - `ConnectorAuthError`: Upstream lehnt ab (401/403). Provider wirft,
 *     Gateway (Block 2) setzt `connector_integrations.last_error` und
 *     liefert degraded result.
 *   - `ConnectorScopeError`: Request zielt auf nicht-allowlisted Scope.
 *     Wird vom `scopeEnforcementFilter` pre-translate geworfen — blockt
 *     den Upstream-Call komplett.
 *   - `ConnectorScopePostError`: Response enthält Daten ausserhalb der
 *     Allowlist. Defense-in-Depth, sollte in der Praxis nicht feuern —
 *     wenn doch, ist das ein Connector-Provider-Bug oder Upstream-API-
 *     Inkonsistenz. `scopePostFilter` wirft.
 *   - `ConnectorUpstreamError`: Alles andere vom Upstream — 5xx, Rate-
 *     Limit, Timeout, Netzwerk. Gateway kassiert und markiert `degraded`.
 *   - `ConnectorConfigError`: lokri-seitig: Integration nicht gefunden,
 *     auth_type unbekannt, Provider nicht registriert. Das sind
 *     Programmier-/Daten-Fehler und fliegen dem Caller um die Ohren.
 */

export type ConnectorErrorKind =
  | "auth"
  | "scope"
  | "scope-post"
  | "upstream"
  | "config";

export class ConnectorError extends Error {
  readonly kind: ConnectorErrorKind;

  constructor(kind: ConnectorErrorKind, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ConnectorError";
    this.kind = kind;
  }
}

export class ConnectorAuthError extends ConnectorError {
  constructor(message: string, options?: ErrorOptions) {
    super("auth", message, options);
    this.name = "ConnectorAuthError";
  }
}

export class ConnectorScopeError extends ConnectorError {
  /** Welcher Scope wurde angefordert — für Log + Message. */
  readonly requestedScope: { type: string; identifier: string };

  constructor(
    requestedScope: { type: string; identifier: string },
    message?: string,
  ) {
    super(
      "scope",
      message ??
        `Scope nicht in Allowlist: ${requestedScope.type}:${requestedScope.identifier}`,
    );
    this.name = "ConnectorScopeError";
    this.requestedScope = requestedScope;
  }
}

export class ConnectorScopePostError extends ConnectorError {
  /** Welcher Scope tauchte unerwartet in der Response auf. */
  readonly leakedScope: { type: string; identifier: string };

  constructor(
    leakedScope: { type: string; identifier: string },
    message?: string,
  ) {
    super(
      "scope-post",
      message ??
        `Response enthält Daten ausserhalb der Allowlist: ${leakedScope.type}:${leakedScope.identifier}`,
    );
    this.name = "ConnectorScopePostError";
    this.leakedScope = leakedScope;
  }
}

export class ConnectorUpstreamError extends ConnectorError {
  /** HTTP-Status falls vorhanden, sonst undefined. */
  readonly status?: number;

  constructor(message: string, options?: ErrorOptions & { status?: number }) {
    super("upstream", message, options);
    this.name = "ConnectorUpstreamError";
    this.status = options?.status;
  }
}

export class ConnectorConfigError extends ConnectorError {
  constructor(message: string, options?: ErrorOptions) {
    super("config", message, options);
    this.name = "ConnectorConfigError";
  }
}
