import { and, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  notFound,
  parseJsonBody,
  serverError,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { spaces } from "@/lib/db/schema";

export const runtime = "nodejs";

const bodySchema = z.object({
  key: z.string().min(1).max(1500),
  hidden: z.boolean(),
});

type Params = { params: Promise<{ id: string }> };

/**
 * Toggle an external key's presence on the space's hidden-list. Uses
 * Postgres array_append / array_remove to avoid read-modify-write races.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;

    const body = await parseJsonBody(req, 4 * 1024);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    // Confirm ownership.
    const [space] = await db
      .select({ id: spaces.id })
      .from(spaces)
      .where(and(eq(spaces.id, id), eq(spaces.ownerAccountId, ownerAccountId)))
      .limit(1);
    if (!space) return notFound();

    if (parsed.data.hidden) {
      // array_append + deduplicate.
      await db
        .update(spaces)
        .set({
          hiddenExternalKeys: sql`(
            SELECT ARRAY(SELECT DISTINCT UNNEST(array_append(${spaces.hiddenExternalKeys}, ${parsed.data.key})))
          )`,
        })
        .where(eq(spaces.id, id));
    } else {
      await db
        .update(spaces)
        .set({
          hiddenExternalKeys: sql`array_remove(${spaces.hiddenExternalKeys}, ${parsed.data.key})`,
        })
        .where(eq(spaces.id, id));
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[external.visibility]", err);
    return serverError(err);
  }
}
