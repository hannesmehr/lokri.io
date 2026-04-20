/**
 * Lokri-interner Such-Teil der Unified-Search-Federation.
 *
 * Bis Block 4/1 lebte diese Logik inline im `search`-Tool-Handler
 * (`lib/mcp/tools.ts`). Mit dem Refactor ist sie hier als pure Funktion
 * — der Federation-Code ruft sie auf, gleichzeitig ruft er parallel
 * pro External-Source den Gateway auf, und mischt Results am Ende.
 *
 * Semantik 1:1 zum bisherigen Verhalten:
 *   - pgvector-Cosine-Similarity über `notes.embedding` +
 *     `file_chunks.embedding`
 *   - `mcp_hidden = false`-Filter (Admin-seitige Ausblendung
 *     respektieren)
 *   - `isNotNull(embedding)` (Rows ohne Embedding werden ignoriert,
 *     passiert bei Legacy-Daten oder In-Flight-Reindex)
 *   - Scope-Filter via `spaceScope` (wenn nicht-null: `spaceId IN (…)`)
 *   - Sort + Slice bei `limit`
 *
 * Returnt `InternalSearchHit[]` — das ist die lokri-Seite des
 * aggregierten Results. Der Federation-Code mappt daraus den
 * `source: "lokri"`-Marker und den Hybrid-Score.
 */

import {
  and,
  cosineDistance,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
  type AnyColumn,
  type SQL,
} from "drizzle-orm";
import { db } from "@/lib/db";
import { fileChunks, files, notes } from "@/lib/db/schema";
import { embedText } from "@/lib/embeddings";

export type InternalSearchHitType = "note" | "file_chunk";

export interface InternalSearchHit {
  id: string;
  type: InternalSearchHitType;
  title: string;
  snippet: string;
  /** pgvector cosine similarity in [0, 1] — 1 = identisch. */
  similarity: number;
}

function scopeCondition(
  column: AnyColumn,
  scope: string[] | null,
): SQL | undefined {
  if (!scope || scope.length === 0) return undefined;
  return inArray(column, scope);
}

function truncSnippet(text: string, max = 300): string {
  const s = text.trim().replace(/\s+/g, " ");
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

export interface InternalSearchInput {
  ownerAccountId: string;
  /** Null = alle Spaces des Teams; Array = strict allowlist. */
  spaceScope: string[] | null;
  query: string;
  limit: number;
}

export async function internalSearch(
  input: InternalSearchInput,
): Promise<InternalSearchHit[]> {
  const { ownerAccountId, spaceScope, query, limit } = input;

  const { embedding } = await embedText(query, ownerAccountId);

  const noteSim = sql<number>`1 - (${cosineDistance(notes.embedding, embedding)})`;
  const noteScope = scopeCondition(notes.spaceId, spaceScope);
  const noteRows = await db
    .select({
      id: notes.id,
      title: notes.title,
      contentText: notes.contentText,
      similarity: noteSim,
    })
    .from(notes)
    .where(
      and(
        eq(notes.ownerAccountId, ownerAccountId),
        eq(notes.mcpHidden, false),
        isNotNull(notes.embedding),
        ...(noteScope ? [noteScope] : []),
      ),
    )
    .orderBy(desc(noteSim))
    .limit(limit);

  const chunkSim = sql<number>`1 - (${cosineDistance(fileChunks.embedding, embedding)})`;
  const fileScope = scopeCondition(files.spaceId, spaceScope);
  const chunkRows = await db
    .select({
      id: fileChunks.id,
      filename: files.filename,
      contentText: fileChunks.contentText,
      similarity: chunkSim,
    })
    .from(fileChunks)
    .innerJoin(files, eq(files.id, fileChunks.fileId))
    .where(
      and(
        eq(files.ownerAccountId, ownerAccountId),
        eq(files.mcpHidden, false),
        isNotNull(fileChunks.embedding),
        ...(fileScope ? [fileScope] : []),
      ),
    )
    .orderBy(desc(chunkSim))
    .limit(limit);

  return [
    ...noteRows.map(
      (r): InternalSearchHit => ({
        id: r.id,
        type: "note",
        title: r.title,
        snippet: truncSnippet(r.contentText),
        similarity: Number(r.similarity),
      }),
    ),
    ...chunkRows.map(
      (r): InternalSearchHit => ({
        id: r.id,
        type: "file_chunk",
        title: r.filename,
        snippet: truncSnippet(r.contentText),
        similarity: Number(r.similarity),
      }),
    ),
  ]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}
