import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { serverError, unauthorized } from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files, notes, spaces } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Data source for the ⌘K command palette. One round-trip, loaded once on
 * first open — small-enough for pure client-side fuzzy filtering (no per-
 * keystroke DB hit). Files truncated to the 200 most recent to cap payload
 * size; full-text/semantic search picks up the long tail via /api/search.
 */
export async function GET() {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();

    const [spaceRows, noteRows, fileRows] = await Promise.all([
      db
        .select({
          id: spaces.id,
          name: spaces.name,
          updatedAt: spaces.updatedAt,
        })
        .from(spaces)
        .where(eq(spaces.ownerAccountId, ownerAccountId))
        .orderBy(desc(spaces.updatedAt))
        .limit(200),
      db
        .select({
          id: notes.id,
          title: notes.title,
          spaceId: notes.spaceId,
          updatedAt: notes.updatedAt,
        })
        .from(notes)
        .where(
          and(
            eq(notes.ownerAccountId, ownerAccountId),
            eq(notes.mcpHidden, false),
          ),
        )
        .orderBy(desc(notes.updatedAt))
        .limit(200),
      db
        .select({
          id: files.id,
          filename: files.filename,
          spaceId: files.spaceId,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(eq(files.ownerAccountId, ownerAccountId))
        .orderBy(desc(files.createdAt))
        .limit(200),
    ]);

    return NextResponse.json({
      spaces: spaceRows,
      notes: noteRows,
      files: fileRows,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
