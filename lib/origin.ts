/**
 * Resolve the canonical app origin for redirects and externally visible URLs.
 *
 * We prefer explicit deployment config over request headers so Host header
 * spoofing or proxy misconfiguration cannot influence security-sensitive
 * callback URLs.
 */
export function resolveAppOrigin(): string {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}
