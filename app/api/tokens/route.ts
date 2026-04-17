import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { serverError, unauthorized, zodError } from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { apiTokens } from "@/lib/db/schema";
import { generateApiToken } from "@/lib/tokens";

const createBodySchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function GET() {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();

    const rows = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
        revokedAt: apiTokens.revokedAt,
      })
      .from(apiTokens)
      .where(
        and(
          eq(apiTokens.ownerAccountId, ownerAccountId),
          isNull(apiTokens.revokedAt),
        ),
      )
      .orderBy(desc(apiTokens.createdAt));

    return NextResponse.json({ tokens: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const json = await req.json().catch(() => null);
    const parsed = createBodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    const { plaintext, prefix, hash } = await generateApiToken();

    const [row] = await db
      .insert(apiTokens)
      .values({
        ownerAccountId,
        name: parsed.data.name,
        tokenHash: hash,
        tokenPrefix: prefix,
      })
      .returning({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        createdAt: apiTokens.createdAt,
      });

    // `token` is returned ONCE — clients must copy it now.
    return NextResponse.json(
      { token: { ...row, plaintext } },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
