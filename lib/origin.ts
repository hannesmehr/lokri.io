/**
 * Resolve the canonical app origin for redirects and externally visible URLs.
 *
 * We prefer explicit deployment config over request headers so Host header
 * spoofing or proxy misconfiguration cannot influence security-sensitive
 * callback URLs.
 *
 * Trailing slashes werden defensiv getrimmt — sämtliche Call-sites
 * konkatenieren mit `/pfad`, und ein Wert wie `https://host/` würde sonst
 * `https://host//pfad` erzeugen (real beobachtet im MCP-Wizard-Snippet).
 */
export function resolveAppOrigin(): string {
  const raw = pickRawOrigin();
  return raw.replace(/\/+$/, "");
}

function pickRawOrigin(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
