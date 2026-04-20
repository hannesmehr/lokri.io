/**
 * `sanitizeArgs` — macht User-Args log-safe bevor sie in
 * `connector_usage_log.request_metadata` landen.
 *
 * **Zwei-Ebenen-Defense:**
 *
 * 1. **Key-Redaction** (historisches Verhalten): Objekt-Keys, die nach
 *    Secret riechen (`apiKey`, `authorization`, `password`, …), werden
 *    komplett `[REDACTED]`. Case-insensitive, separator-strip.
 *
 * 2. **Value-Pattern-Scrubbing** (neu, Paket A): Strings in Values
 *    werden auf bekannte Token-Formate gescannt — Matches werden durch
 *    `<redacted:<name>>` ersetzt. Fängt Tokens in Freitext-Feldern
 *    (`{ query: "zur Doku zum Token ATATT…" }`) und Array-Elementen,
 *    wo die Key-Redaction nicht greift.
 *
 * Reihenfolge pro String-Value: erst Value-Scrub (räumt Inline-Tokens
 * weg), dann landet der Rest im Output. Bei Objekten gilt: Key-Redact
 * hat Vorrang — ein Key wie `token` redactet den gesamten Wert,
 * unabhängig vom String-Inhalt.
 *
 * **Kein `generic-long`-Catch-All.** Eine Regel wie
 * `/\b[A-Za-z0-9]{40,}\b/` würde lange Hashes und base64-encoded
 * Content mit-redacten. Wir bleiben bei konkreten Prefix-Mustern;
 * false-negatives werden bei Auftreten ergänzt, nicht präventiv
 * mit einer Catch-All riskiert.
 *
 * **Depth-Cap** bleibt bei 16 (Zyklen-Schutz). Das greift für beide
 * Ebenen im selben Deep-Walk.
 */

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 16;
const TRUNCATED_DEPTH = "[DEPTH_EXCEEDED]";

// ---------------------------------------------------------------------------
// Ebene 1: Key-basierte Redaction
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Ebene 2: Value-Pattern-Scrubbing
// ---------------------------------------------------------------------------

/**
 * Acht spezifische Token-Formate. Word-Boundaries (`\b`) verhindern
 * Mittendrin-Matches wie `"myATATT…"` (kein match, weil vor ATATT ein
 * Word-Char steht). Alle haben `g`-Flag für Multi-Match innerhalb
 * desselben String-Values.
 *
 * **Reihenfolge relevant:** Bearer kommt zuerst, weil "Bearer ey…JWT…"
 * sonst nur den JWT-Teil redacten würde und das Prefix `Bearer `
 * stehen bliebe. Bearer scrub'd `Bearer <token>` als Einheit.
 */
const SECRET_VALUE_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  // Authorization-Header-Pattern (Bearer + ausreichend Token-Material)
  { name: "bearer", regex: /\bBearer\s+[A-Za-z0-9+/=_\-.]{16,}/g },
  // lokri-eigene API-Tokens (`lk_` + min. 20 chars)
  { name: "lokri", regex: /\blk_[A-Za-z0-9]{20,}/g },
  // Atlassian API Tokens (ATATT + ~150 chars base64-artig)
  { name: "atlassian", regex: /\bATATT[A-Za-z0-9]{150,}/g },
  // GitHub Tokens — alle Prefix-Varianten (pat/oauth/user/server/refresh)
  { name: "github", regex: /\bgh[pousr]_[A-Za-z0-9]{36,}/g },
  // Slack Tokens (xox[bpar]-…)
  { name: "slack", regex: /\bxox[bpar]-[A-Za-z0-9-]{16,}/g },
  // JWT — drei base64url-Segmente durch Punkte getrennt
  {
    name: "jwt",
    regex: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  },
  // AWS Access Key IDs (AKIA + 16 chars)
  { name: "aws", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  // OpenAI API Keys (sk- + min. 32 chars)
  { name: "openai", regex: /\bsk-[A-Za-z0-9]{32,}/g },
];

/**
 * Scan + Replace aller bekannten Token-Formate in einem String.
 * Exportiert für direkte Tests.
 */
export function scrubSecretValues(input: string): string {
  let out = input;
  for (const { name, regex } of SECRET_VALUE_PATTERNS) {
    out = out.replace(regex, `<redacted:${name}>`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API — Deep-walk mit beiden Ebenen
// ---------------------------------------------------------------------------

export function sanitizeArgs(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return TRUNCATED_DEPTH;
  if (value === null || value === undefined) return value;

  const t = typeof value;
  if (t === "string") return scrubSecretValues(value as string);
  if (t === "number" || t === "boolean") return value;
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
