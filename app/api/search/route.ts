import { and, cosineDistance, desc, eq, gt, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  parseJsonBody,
  serverError,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { fileChunks, files, notes } from "@/lib/db/schema";
import { embedText } from "@/lib/embeddings";
import { limit as rateLimit, rateLimitResponse } from "@/lib/rate-limit";

const bodySchema = z.object({
  query: z.string().trim().min(1).max(2000),
  limit: z.number().int().positive().max(50).optional().default(10),
  spaceId: z.uuid().optional(),
  /** Minimum cosine similarity (0..1). Default 0 — keep everything. */
  minSimilarity: z.number().min(0).max(1).optional().default(0),
});

export interface SearchHit {
  id: string;
  type: "note" | "file_chunk";
  title: string;
  snippet: string;
  similarity: number;
  spaceId: string | null;
  metadata: Record<string, unknown>;
}

function makeSnippet(text: string, maxChars = 400): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  return trimmed.length <= maxChars ? trimmed : `${trimmed.slice(0, maxChars)}…`;
}

export async function POST(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const rl = await rateLimit("search", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const json = await parseJsonBody(req, 64 * 1024);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    const { query, limit, spaceId, minSimilarity } = parsed.data;
    const { embedding } = await embedText(query, ownerAccountId);

    // ----- Notes -----
    const noteSim = sql<number>`1 - (${cosineDistance(notes.embedding, embedding)})`;
    const noteConditions = [eq(notes.ownerAccountId, ownerAccountId)];
    if (spaceId) noteConditions.push(eq(notes.spaceId, spaceId));
    if (minSimilarity > 0) noteConditions.push(gt(noteSim, minSimilarity));

    const noteHits = await db
      .select({
        id: notes.id,
        title: notes.title,
        content: notes.contentText,
        spaceId: notes.spaceId,
        similarity: noteSim,
      })
      .from(notes)
      .where(and(...noteConditions))
      .orderBy(desc(noteSim))
      .limit(limit);

    // ----- File chunks (scoped via files join) -----
    const chunkSim = sql<number>`1 - (${cosineDistance(fileChunks.embedding, embedding)})`;
    const chunkConditions = [eq(files.ownerAccountId, ownerAccountId)];
    if (spaceId) chunkConditions.push(eq(files.spaceId, spaceId));
    if (minSimilarity > 0) chunkConditions.push(gt(chunkSim, minSimilarity));

    const chunkHits = await db
      .select({
        chunkId: fileChunks.id,
        fileId: fileChunks.fileId,
        chunkIndex: fileChunks.chunkIndex,
        content: fileChunks.contentText,
        filename: files.filename,
        spaceId: files.spaceId,
        similarity: chunkSim,
      })
      .from(fileChunks)
      .innerJoin(files, eq(files.id, fileChunks.fileId))
      .where(and(...chunkConditions))
      .orderBy(desc(chunkSim))
      .limit(limit);

    const hits: SearchHit[] = [
      ...noteHits.map<SearchHit>((h) => ({
        id: h.id,
        type: "note",
        title: h.title,
        snippet: makeSnippet(h.content),
        similarity: Number(h.similarity),
        spaceId: h.spaceId,
        metadata: {},
      })),
      ...chunkHits.map<SearchHit>((h) => ({
        id: h.chunkId,
        type: "file_chunk",
        title: h.filename,
        snippet: makeSnippet(h.content),
        similarity: Number(h.similarity),
        spaceId: h.spaceId,
        metadata: { fileId: h.fileId, chunkIndex: h.chunkIndex },
      })),
    ];

    hits.sort((a, b) => b.similarity - a.similarity);
    return NextResponse.json({ hits: hits.slice(0, limit) });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
