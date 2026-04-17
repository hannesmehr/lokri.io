import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { files, notes, spaces } from "@/lib/db/schema";

/**
 * Owner-scoped lookups. All of these return `null` when the row doesn't
 * exist OR belongs to a different owner_account — callers should treat both
 * as 404 from the client's perspective, which avoids leaking existence.
 */

export async function findOwnedSpace(
  ownerAccountId: string,
  spaceId: string,
) {
  const [row] = await db
    .select()
    .from(spaces)
    .where(
      and(eq(spaces.id, spaceId), eq(spaces.ownerAccountId, ownerAccountId)),
    )
    .limit(1);
  return row ?? null;
}

export async function findOwnedNote(ownerAccountId: string, noteId: string) {
  const [row] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), eq(notes.ownerAccountId, ownerAccountId)))
    .limit(1);
  return row ?? null;
}

export async function findOwnedFile(ownerAccountId: string, fileId: string) {
  const [row] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.ownerAccountId, ownerAccountId)))
    .limit(1);
  return row ?? null;
}
