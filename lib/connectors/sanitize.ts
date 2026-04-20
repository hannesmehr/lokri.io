/**
 * `sanitizeArgs` — macht User-Args log-safe bevor sie in
 * `connector_usage_log.request_metadata` landen.
 *
 * Angriffs-Szenario: Ein Provider-Tool nimmt z.B. einen PAT als Argument
 * (ein Anti-Pattern, aber wir können's nicht ausschliessen — Custom-
 * MCP-Tools in Phase 4). Ohne Scrubbing würde der PAT im Usage-Log
 * landen, wäre Admin-sichtbar und Teil des Audit-Exports. Also: wir
 * redacten konservativ jede Key-Pattern, die nach Secret riecht.
 *
 * Ansatz: Deep-Walk mit **Key-basierter Redaction** — wir schauen nur
 * die Keys an, nicht die Values. Value-basierte Heuristik (z.B.
 * „sieht aus wie base64-Token") hätte zu viele false positives für
 * legitime Confluence-Page-IDs etc.
 *
 * Key-Normalisierung: `apiKey`, `api_key`, `api-key`, `APIKEY`,
 * `apikey` → alle identisch behandelt. Wir stripepen `_-` und vergleichen
 * case-insensitive gegen ein kleines Set.
 *
 * Fallback: Unbekannte Datentypen (Date, Map, Set, Buffer) → gecoerced
 * zu String via `String(v)`. Nicht perfekt, aber verhindert Crashes
 * und hält den Log lesbar.
 */

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 16;
const TRUNCATED_DEPTH = "[DEPTH_EXCEEDED]";

/**
 * Set der als Secret behandelten Key-Namen (normalisiert: lowercase,
 * ohne `_-`). Gerne paranoid — false positives sind egal, false
 * negatives wären schlimm.
 */
const SECRET_KEYS = new Set([
  "pat",
  "token",
  "accesstoken",
  "refreshtoken",
  "idtoken",
  "bearertoken",
  "password",
  "passwd",
  "secret",
  "apikey",
  "apisecret",
  "clientsecret",
  "clientkey",
  "privatekey",
  "sessionkey",
  "sessiontoken",
  "credentials",
  "credential",
  "authorization",
  "auth",
  "cookie",
  "setcookie",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_\-\s]/g, "");
}

function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(normalizeKey(key));
}

export function sanitizeArgs(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return TRUNCATED_DEPTH;
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return value;
  if (t === "bigint") return `${value.toString()}n`;
  if (t === "function" || t === "symbol") return String(value);

  if (Array.isArray(value)) {
    return value.map((v) => sanitizeArgs(v, depth + 1));
  }

  if (value instanceof Date) return value.toISOString();

  if (t === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSecretKey(key) ? REDACTED : sanitizeArgs(v, depth + 1);
    }
    return out;
  }

  return String(value);
}
