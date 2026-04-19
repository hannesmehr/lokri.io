import { z } from "zod";

/**
 * Zod-Schema für `PUT /api/admin/accounts/[id]/sso`.
 *
 * Lebt DB-frei in `lib/admin/`, damit Contract-Tests die Shape pinnen
 * können (analog zu create-user-schema + create-account-schema).
 *
 * Domain-Regex akzeptiert:
 *   - Kleinbuchstaben, Ziffern, Bindestriche
 *   - mindestens ein Punkt (TLD-Required)
 *   - keine Underscores, kein @, keine Leerzeichen
 *
 * Case-Normalisierung findet in der Route statt (toLowerCase), weil
 * Zod-Transform bei z.string().regex die Shape leichter nachvollzieh-
 * bar hält.
 */
const domainRegex = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i;

export const ssoConfigSchema = z.object({
  tenantId: z
    .string()
    .uuid({ message: "Tenant-ID muss eine UUID sein" }),
  allowedDomains: z
    .array(z.string().trim().toLowerCase().regex(domainRegex))
    .min(1, "Mindestens eine Domain nötig")
    .max(10, "Maximal 10 Domains"),
  enabled: z.boolean(),
});

export type SsoConfigInput = z.infer<typeof ssoConfigSchema>;
