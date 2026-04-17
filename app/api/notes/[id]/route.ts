import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  notFound,
  parseJsonBody,
  serverError,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { findOwnedNote, findOwnedSpace } from "@/lib/api/ownership";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { embedText } from "@/lib/embeddings";
import { applyQuotaDelta } from "@/lib/quota";
import { limit, rateLimitResponse } from "@/lib/rate-limit";

const patchBodySchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    content: z.string().min(1).max(1_000_000).optional(),
    spaceId: z.uuid().nullable().optional(),
    mcpHidden: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.content !== undefined ||
      v.spaceId !== undefined ||
      v.mcpHidden !== undefined,
    { message: "At least one field must be provided." },
  );

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;
    const note = await findOwnedNote(ownerAccountId, id);
    if (!note) return notFound();
    // Drop `embedding` from the response — it's huge and consumers don't need it.
    const { embedding: _e, ...rest } = note;
    void _e;
    return NextResponse.json({ note: rest });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const rl = await limit("noteWrite", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const { id } = await params;
    const existing = await findOwnedNote(ownerAccountId, id);
    if (!existing) return notFound();

    const json = await parseJsonBody(req, 2 * 1024 * 1024);
    const parsed = patchBodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    if (parsed.data.spaceId) {
      const space = await findOwnedSpace(ownerAccountId, parsed.data.spaceId);
      if (!space) return apiError("Space not found", 404);
    }

    // Re-embed only if title or content changed.
    const nextTitle = parsed.data.title ?? existing.title;
    const nextContent = parsed.data.content ?? existing.contentText;
    const textChanged =
      parsed.data.title !== undefined || parsed.data.content !== undefined;

    let embedding = existing.embedding;
    let embeddingModel = existing.embeddingModel;
    if (textChanged) {
      const result = await embedText(
        `${nextTitle}\n\n${nextContent}`,
        ownerAccountId,
      );
      embedding = result.embedding;
      embeddingModel = result.model;
    }

    const [updated] = await db
      .update(notes)
      .set({
        title: nextTitle,
        contentText: nextContent,
        spaceId:
          parsed.data.spaceId === undefined
            ? existing.spaceId
            : parsed.data.spaceId,
        embedding,
        embeddingModel,
        ...(parsed.data.mcpHidden !== undefined
          ? { mcpHidden: parsed.data.mcpHidden }
          : {}),
      })
      .where(eq(notes.id, id))
      .returning();

    const { embedding: _e, ...rest } = updated;
    void _e;
    return NextResponse.json({ note: rest });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;
    const existing = await findOwnedNote(ownerAccountId, id);
    if (!existing) return notFound();

    await db.delete(notes).where(eq(notes.id, id));
    await applyQuotaDelta(ownerAccountId, { notes: -1 });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
