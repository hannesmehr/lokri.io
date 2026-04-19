import { z } from "zod";

/**
 * Zod-Schema für `POST /api/admin/users`.
 *
 * Lebt in einer eigenen, DB-freien Datei, damit die Contract-Tests
 * (`tests/admin-user-create.test.ts`) die Validation pinnen können,
 * ohne den DB-Client zu initialisieren. Die Route importiert von
 * hier; sonst nichts.
 */
export const createUserSchema = z.object({
  email: z.string().trim().email().max(200),
  name: z.string().trim().max(120).optional(),
  canCreateTeams: z.boolean().default(true),
  /** `auto` ⇒ keine Präferenz, Resolver (Cookie / Header) entscheidet. */
  preferredLocale: z.enum(["de", "en", "auto"]).default("de"),
  setupMethod: z.discriminatedUnion("type", [
    z.object({ type: z.literal("magic_link") }),
    z.object({
      type: z.literal("initial_password"),
      password: z.string().min(12).max(256),
    }),
  ]),
  team: z
    .object({
      accountId: z.string().uuid(),
      // `owner` bewusst nicht erlaubt — Ownership wird nur via
      // expliziten Transfer-Flow vergeben, nie beim User-Create.
      role: z.enum(["admin", "member", "viewer"]),
    })
    .optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
