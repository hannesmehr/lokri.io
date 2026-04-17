import { desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import {
  parseJsonBody,
  serverError,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { db } from "@/lib/db";
import { spaceMembers, spaces } from "@/lib/db/schema";

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
});

export async function GET() {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const rows = await db
      .select()
      .from(spaces)
      .where(eq(spaces.ownerAccountId, ownerAccountId))
      .orderBy(desc(spaces.updatedAt));
    return NextResponse.json({ spaces: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const json = await parseJsonBody(req, 64 * 1024);
    const parsed = createBodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    const [space] = await db
      .insert(spaces)
      .values({
        ownerAccountId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
      })
      .returning();

    // Auto-create the owner membership row (prep for V1.3 sharing).
    await db.insert(spaceMembers).values({
      spaceId: space.id,
      ownerAccountId,
      role: "owner",
    });

    return NextResponse.json({ space }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
