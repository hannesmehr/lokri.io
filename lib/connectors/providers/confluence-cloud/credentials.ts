/**
 * Credentials-Shape für Confluence Cloud.
 *
 * Atlassian Cloud nutzt Basic-Auth mit `email:apiToken` — **nicht**
 * den reinen PAT wie manche anderen Atlassian-Produkte. Der User
 * generiert den Token in `id.atlassian.com` (nicht in Confluence
 * selbst). Die UI muss das in Block 3 klar kommunizieren.
 *
 * Das Zod-Schema wird hier definiert, weil es sowohl:
 *   - vom Provider (beim Encrypt + Decrypt + Pre-Tool-Check) genutzt
 *     wird, als auch
 *   - in Block 3 von der Admin-API-Route zur Input-Validierung
 *     herangezogen wird.
 *
 * Keine zu strikte Email-Regex — Atlassian validiert serverseitig,
 * und wir wollen nicht bei Edge-Case-Adressen falsche Fehler werfen.
 * Die Minimum-Länge des API-Tokens ist eine Sanity-Grenze; echte
 * Atlassian-Tokens sind deutlich länger (192 Zeichen+), aber 16 als
 * Untergrenze schützt gegen Copy-Paste-Abbrüche ohne die Domain zu
 * kennen.
 */

import { z } from "zod";

export const confluenceCloudCredentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  apiToken: z.string().min(16).max(4096),
});

export type ConfluenceCloudCredentials = z.infer<
  typeof confluenceCloudCredentialsSchema
>;
