import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  files as filesTable,
  ownerAccountMembers,
  users,
} from "@/lib/db/schema";
import { getProviderForFile } from "@/lib/storage";

/**
 * Admin-seitiger Hard-Delete eines Users.
 *
 * Unterscheidet sich vom User-eigenen Delete-Flow (Better-Auth mit Email-
 * Bestätigung): hier kein Confirmation-Loop. Admin klickt → nach Confirm
 * → Löschung sofort.
 *
 * Die Cleanup-Logik entspricht dem `beforeDelete`-Hook in `lib/auth.ts`
 * und ist bewusst hier dupliziert (statt dort importiert), um den
 * zirkulären Import auth ↔ admin zu vermeiden. Beide Pfade müssen sich
 * bei Änderungen konsistent halten.
 *
 * Was passiert:
 *   1. Alle Personal-owner_accounts des Users finden.
 *   2. Für jeden Account die Files durchgehen und Storage-Objekte
 *      best-effort löschen (Vercel Blob / S3 / GitHub).
 *   3. Den User löschen — FK-Cascade wischt alles DB-seitig mit weg:
 *      sessions, accounts, owner_account_members, personal
 *      owner_accounts (inkl. deren spaces/notes/files/tokens/invites/
 *      audit_events etc.).
 *
 * Team-Accounts, in denen der User "owner" ist, cascadiert *nicht* —
 * hier wird nur die Membership entfernt. Das Team existiert weiter.
 * Admin muss sich ggf. separat um die Übertragung kümmern.
 */
export async function adminDeleteUser(userId: string): Promise<void> {
  const memberships = await db
    .select({ accountId: ownerAccountMembers.ownerAccountId })
    .from(ownerAccountMembers)
    .where(
      and(
        eq(ownerAccountMembers.userId, userId),
        eq(ownerAccountMembers.role, "owner"),
      ),
    );

  // Only clean up storage for Personal-Accounts (they cascade-delete
  // with the user). Team-Accounts survive — their files stay.
  for (const m of memberships) {
    const fileRows = await db
      .select({
        id: filesTable.id,
        storageKey: filesTable.storageKey,
        storageProviderId: filesTable.storageProviderId,
      })
      .from(filesTable)
      .where(eq(filesTable.ownerAccountId, m.accountId));

    await Promise.all(
      fileRows.map(async (f) => {
        try {
          const provider = await getProviderForFile(
            f.storageProviderId,
            m.accountId,
          );
          await provider.delete(f.storageKey);
        } catch (err) {
          console.error(
            `[admin.deleteUser] blob delete failed for ${f.id}:`,
            err,
          );
        }
      }),
    );
  }

  // Hard delete — cascade wipes everything FK-linked.
  await db.delete(users).where(eq(users.id, userId));
}
