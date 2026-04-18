import { and, desc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  parseJsonBody,
  paymentRequired,
  serverError,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { findOwnedSpace } from "@/lib/api/ownership";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { embedText } from "@/lib/embeddings";
import { reserveQuota } from "@/lib/quota";
import { limit, rateLimitResponse } from "@/lib/rate-limit";

const listQuerySchema = z.object({
  spaceId: z.uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

const createBodySchema = z.object({
  title: z.string().trim().min(1).max(300),
  content: z.string().min(1).max(1_000_000),
  spaceId: z.uuid().nullable().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const parsed = listQuerySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) return zodError(parsed.error);

    const conditions = [eq(notes.ownerAccountId, ownerAccountId)];
    if (parsed.data.spaceId) {
      conditions.push(eq(notes.spaceId, parsed.data.spaceId));
    }

    const rows = await db
      .select({
        id: notes.id,
        title: notes.title,
        spaceId: notes.spaceId,
        createdAt: notes.createdAt,
        updatedAt: notes.updatedAt,
      })
      .from(notes)
      .where(and(...conditions))
      .orderBy(desc(notes.updatedAt))
      .limit(parsed.data.limit);

    return NextResponse.json({ notes: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const rl = await limit("noteWrite", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    // Notes allow up to 1_000_000 chars of content — bump parse cap accordingly.
    const json = await parseJsonBody(req, 2 * 1024 * 1024);
    const parsed = createBodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    if (parsed.data.spaceId) {
      const space = await findOwnedSpace(ownerAccountId, parsed.data.spaceId);
      if (!space) return apiError("Space not found", 404);
    }

    // Embed the full note body. For very long notes we could chunk here too,
    // but the spec models notes as single-embedding entities.
    const embedInput = `${parsed.data.title}\n\n${parsed.data.content}`;
    const { embedding, model } = await embedText(embedInput, ownerAccountId);

    const note = await db.transaction(async (tx) => {
      const quotaCheck = await reserveQuota(ownerAccountId, { notes: 1 }, tx);
      if (!quotaCheck.ok) throw new Error(`QUOTA:${quotaCheck.reason}`);

      const [created] = await tx
        .insert(notes)
        .values({
          ownerAccountId,
          spaceId: parsed.data.spaceId ?? null,
          title: parsed.data.title,
          contentText: parsed.data.content,
          embedding,
          embeddingModel: model,
        })
        .returning();

      return created;
    });

    return NextResponse.json({ note }, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("QUOTA:")) {
      return paymentRequired(err.message.slice("QUOTA:".length));
    }
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
