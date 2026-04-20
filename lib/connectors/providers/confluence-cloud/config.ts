/**
 * Config-Shape für Confluence Cloud — nicht verschlüsselt (landet in
 * `connector_integrations.config` als JSON).
 *
 * `siteUrl` ist die Basis, an die `/wiki/…`-Pfade angehängt werden.
 * Wir erlauben trailing slash und normalisieren ihn weg; das hält die
 * UX entspannt (User kopiert die Browser-URL wie sie ist).
 *
 * MVP-Begrenzung auf `*.atlassian.net`: Confluence Cloud hostet dort.
 * Custom-Domains (Enterprise-Feature, selten) würden die Regex
 * brechen — wir öffnen das dann gezielt, nicht präventiv. Die Regex
 * prüft nur den Host, nicht den Pfad — deshalb separat via
 * URL-Parsing.
 */

import { z } from "zod";

const ATLASSIAN_HOST_RE = /^[a-z0-9-]+\.atlassian\.net$/i;

export const confluenceCloudConfigSchema = z
  .object({
    siteUrl: z
      .string()
      .trim()
      .url()
      .refine(
        (value) => {
          try {
            const u = new URL(value);
            if (u.protocol !== "https:") return false;
            if (!ATLASSIAN_HOST_RE.test(u.host)) return false;
            // Nur Pfad-Wurzel erlaubt — sonst würde `/wiki/...`-Konstruktion
            // den User-Pfad doppeln. Leere Strings und `"/"` sind ok.
            if (u.pathname !== "" && u.pathname !== "/") return false;
            if (u.search !== "" || u.hash !== "") return false;
            return true;
          } catch {
            return false;
          }
        },
        {
          message: "Expected an https://<subdomain>.atlassian.net URL (no path, query or fragment)",
        },
      )
      .transform((value) => value.replace(/\/+$/, "")),
  })
  .strict();

export type ConfluenceCloudConfig = z.infer<
  typeof confluenceCloudConfigSchema
>;

/** Konstruiert die Basis-URL für einen v1- oder v2-Call, trimmt
 *  trailing slash, setzt führenden slash am Pfad. Zentral gehalten,
 *  damit niemand ausversehen Pfad-Konstruktion inline macht. */
export function buildConfluenceUrl(
  siteUrl: string,
  path: string,
): string {
  const base = siteUrl.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
