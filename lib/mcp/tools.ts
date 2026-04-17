/**
 * MCP tool implementations. These reuse the same quota/storage/embedding
 * helpers as the REST API so the two surfaces stay in lockstep.
 *
 * Every tool is scoped to the `ownerAccountId` that `withMcpAuth` stashes on
 * `authInfo.extra` per request. Tools that see a missing/invalid context
 * return a loud error rather than silently operating on a wrong account.
 */

import { and, cosineDistance, desc, eq, inArray, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { fileChunks, files, notes, spaces } from "@/lib/db/schema";
import { chunkText, embedText, embedTexts } from "@/lib/embeddings";
import { applyQuotaDelta, checkQuota } from "@/lib/quota";
import { reindexFile } from "@/lib/reindex";
import {
  getProviderForFile,
  getProviderForNewUpload,
} from "@/lib/storage";

const MAX_FILE_BYTES = 10 * 1024 * 1024;

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

type ToolExtra = {
  authInfo?: {
    extra?: {
      ownerAccountId?: string;
      spaceScope?: string[] | null;
      readOnly?: boolean;
    };
  };
};

interface AuthCtx {
  ownerAccountId: string;
  /** Null = unrestricted; Array = only these spaces are accessible. */
  spaceScope: string[] | null;
  readOnly: boolean;
}

function requireAuth(extra: ToolExtra): AuthCtx {
  const id = extra?.authInfo?.extra?.ownerAccountId;
  if (!id || typeof id !== "string") {
    throw new Error(
      "Missing auth context (expected ownerAccountId on authInfo.extra).",
    );
  }
  return {
    ownerAccountId: id,
    spaceScope: extra?.authInfo?.extra?.spaceScope ?? null,
    readOnly: extra?.authInfo?.extra?.readOnly ?? false,
  };
}

/**
 * Add a `space_id IN (scope)` clause when a scoped token is in play. Null
 * spaces (account-level, unassigned) are excluded from scoped tokens —
 * scoping is strict. Returns the extra condition or `undefined` when the
 * token is unrestricted.
 */
function scopeCondition(
  column: AnyColumn,
  scope: string[] | null,
): SQL | undefined {
  if (!scope || scope.length === 0) return undefined;
  return inArray(column, scope);
}

/** Guard for mutations — returns a tool error when the token is read-only. */
function readOnlyGuard(ctx: AuthCtx): ToolResult | null {
  if (ctx.readOnly) {
    return toolError("This token is read-only — mutations are refused.");
  }
  return null;
}

/** Guard for tools that explicitly target a space — refuses out-of-scope IDs. */
function spaceInScope(scope: string[] | null, spaceId: string): boolean {
  if (!scope || scope.length === 0) return true;
  return scope.includes(spaceId);
}

/** Back-compat shim for tools that only need the account id. */
function requireOwnerAccountId(extra: ToolExtra): string {
  return requireAuth(extra).ownerAccountId;
}

function ok(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent:
      data && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)
        : { value: data },
  };
}

function toolError(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

// ---------------------------------------------------------------------------

export function registerTools(server: McpServer): void {
  // ----- search ------------------------------------------------------------
  server.registerTool(
    "search",
    {
      title: "Search",
      description:
        "Semantic search across all notes and file chunks in the account. " +
        "Returns an array of opaque IDs usable with `fetch`.",
      inputSchema: {
        query: z.string().min(1).describe("Natural-language search query"),
        limit: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe("Max results (default 10)"),
      },
    },
    async ({ query, limit }, extra) => {
      const auth = requireAuth(extra as ToolExtra);
      const { ownerAccountId, spaceScope } = auth;
      const n = limit ?? 10;
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
            ...(noteScope ? [noteScope] : []),
          ),
        )
        .orderBy(desc(noteSim))
        .limit(n);

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
            ...(fileScope ? [fileScope] : []),
          ),
        )
        .orderBy(desc(chunkSim))
        .limit(n);

      const snippet = (t: string) => {
        const s = t.trim().replace(/\s+/g, " ");
        return s.length <= 300 ? s : `${s.slice(0, 300)}…`;
      };

      const merged = [
        ...noteRows.map((r) => ({
          id: r.id,
          type: "note" as const,
          title: r.title,
          snippet: snippet(r.contentText),
          similarity: Number(r.similarity),
        })),
        ...chunkRows.map((r) => ({
          id: r.id,
          type: "file_chunk" as const,
          title: r.filename,
          snippet: snippet(r.contentText),
          similarity: Number(r.similarity),
        })),
      ]
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, n);

      // `ids` is returned for ChatGPT-style consumers; `results` now carries
      // snippets so agents don't need a second round-trip via `fetch` for a
      // quick decision.
      return ok({ ids: merged.map((m) => m.id), results: merged });
    },
  );

  // ----- fetch -------------------------------------------------------------
  server.registerTool(
    "fetch",
    {
      title: "Fetch",
      description:
        "Retrieve a note or file chunk by ID. IDs come from `search`.",
      inputSchema: {
        id: z.string().min(1).describe("Note or file_chunk ID"),
      },
    },
    async ({ id }, extra) => {
      const { ownerAccountId, spaceScope } = requireAuth(extra as ToolExtra);
      const noteScope = scopeCondition(notes.spaceId, spaceScope);
      const fileScope = scopeCondition(files.spaceId, spaceScope);

      const [note] = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.ownerAccountId, ownerAccountId),
            eq(notes.mcpHidden, false),
            ...(noteScope ? [noteScope] : []),
          ),
        )
        .limit(1);

      if (note) {
        return ok({
          id: note.id,
          type: "note",
          title: note.title,
          content: note.contentText,
          metadata: {
            spaceId: note.spaceId,
            createdAt: note.createdAt,
            updatedAt: note.updatedAt,
          },
        });
      }

      const [chunk] = await db
        .select({
          id: fileChunks.id,
          contentText: fileChunks.contentText,
          chunkIndex: fileChunks.chunkIndex,
          fileId: fileChunks.fileId,
          filename: files.filename,
          mimeType: files.mimeType,
          spaceId: files.spaceId,
          createdAt: files.createdAt,
        })
        .from(fileChunks)
        .innerJoin(files, eq(files.id, fileChunks.fileId))
        .where(
          and(
            eq(fileChunks.id, id),
            eq(files.ownerAccountId, ownerAccountId),
            eq(files.mcpHidden, false),
            ...(fileScope ? [fileScope] : []),
          ),
        )
        .limit(1);

      if (chunk) {
        return ok({
          id: chunk.id,
          type: "file_chunk",
          title: chunk.filename,
          content: chunk.contentText,
          metadata: {
            fileId: chunk.fileId,
            chunkIndex: chunk.chunkIndex,
            mimeType: chunk.mimeType,
            spaceId: chunk.spaceId,
            createdAt: chunk.createdAt,
          },
        });
      }

      return toolError(`No note or file chunk found with id=${id}`);
    },
  );

  // ----- list_spaces -------------------------------------------------------
  server.registerTool(
    "list_spaces",
    {
      title: "List spaces",
      description: "All spaces belonging to the authenticated account.",
      inputSchema: {},
    },
    async (_args, extra) => {
      const { ownerAccountId, spaceScope } = requireAuth(extra as ToolExtra);
      const scopeCond = scopeCondition(spaces.id, spaceScope);
      const rows = await db
        .select({
          id: spaces.id,
          name: spaces.name,
          description: spaces.description,
          createdAt: spaces.createdAt,
          updatedAt: spaces.updatedAt,
        })
        .from(spaces)
        .where(
          and(
            eq(spaces.ownerAccountId, ownerAccountId),
            ...(scopeCond ? [scopeCond] : []),
          ),
        )
        .orderBy(desc(spaces.updatedAt));
      return ok({ spaces: rows });
    },
  );

  // ----- list_files --------------------------------------------------------
  server.registerTool(
    "list_files",
    {
      title: "List files",
      description:
        "Files belonging to the account, optionally scoped to a space.",
      inputSchema: {
        space_id: z.string().uuid().optional(),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ space_id, limit }, extra) => {
      const { ownerAccountId, spaceScope } = requireAuth(extra as ToolExtra);
      if (space_id && !spaceInScope(spaceScope, space_id)) {
        return toolError(`space_id ${space_id} is outside this token's scope.`);
      }
      const n = limit ?? 50;
      const scopeCond = scopeCondition(files.spaceId, spaceScope);
      const conds = [
        eq(files.ownerAccountId, ownerAccountId),
        eq(files.mcpHidden, false),
      ];
      if (space_id) conds.push(eq(files.spaceId, space_id));
      if (scopeCond) conds.push(scopeCond);
      const rows = await db
        .select({
          id: files.id,
          filename: files.filename,
          mimeType: files.mimeType,
          sizeBytes: files.sizeBytes,
          spaceId: files.spaceId,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(and(...conds))
        .orderBy(desc(files.createdAt))
        .limit(n);
      return ok({ files: rows });
    },
  );

  // ----- list_notes --------------------------------------------------------
  server.registerTool(
    "list_notes",
    {
      title: "List notes",
      description:
        "Notes belonging to the account, optionally scoped to a space.",
      inputSchema: {
        space_id: z.string().uuid().optional(),
        limit: z.number().int().positive().max(200).optional(),
      },
    },
    async ({ space_id, limit }, extra) => {
      const { ownerAccountId, spaceScope } = requireAuth(extra as ToolExtra);
      if (space_id && !spaceInScope(spaceScope, space_id)) {
        return toolError(`space_id ${space_id} is outside this token's scope.`);
      }
      const n = limit ?? 50;
      const scopeCond = scopeCondition(notes.spaceId, spaceScope);
      const conds = [
        eq(notes.ownerAccountId, ownerAccountId),
        eq(notes.mcpHidden, false),
      ];
      if (space_id) conds.push(eq(notes.spaceId, space_id));
      if (scopeCond) conds.push(scopeCond);
      const rows = await db
        .select({
          id: notes.id,
          title: notes.title,
          spaceId: notes.spaceId,
          createdAt: notes.createdAt,
          updatedAt: notes.updatedAt,
        })
        .from(notes)
        .where(and(...conds))
        .orderBy(desc(notes.updatedAt))
        .limit(n);
      return ok({ notes: rows });
    },
  );

  // ----- create_note -------------------------------------------------------
  server.registerTool(
    "create_note",
    {
      title: "Create note",
      description: "Create a new note. Content is embedded for search.",
      inputSchema: {
        title: z.string().min(1).max(300),
        content: z.string().min(1).max(1_000_000),
        space_id: z.string().uuid().optional(),
      },
    },
    async ({ title, content, space_id }, extra) => {
      const auth = requireAuth(extra as ToolExtra);
      const ro = readOnlyGuard(auth);
      if (ro) return ro;
      const { ownerAccountId, spaceScope } = auth;
      if (space_id && !spaceInScope(spaceScope, space_id)) {
        return toolError(`space_id ${space_id} is outside this token's scope.`);
      }
      // Scoped tokens must target one of their spaces — no account-level notes.
      if (!space_id && spaceScope && spaceScope.length > 0) {
        return toolError(
          "Scoped token requires `space_id` (account-level notes are outside scope).",
        );
      }

      if (space_id) {
        const [space] = await db
          .select({ id: spaces.id })
          .from(spaces)
          .where(
            and(
              eq(spaces.id, space_id),
              eq(spaces.ownerAccountId, ownerAccountId),
            ),
          )
          .limit(1);
        if (!space) return toolError(`Space not found: ${space_id}`);
      }

      const quota = await checkQuota(ownerAccountId, { notes: 1 });
      if (!quota.ok) return toolError(`Quota exceeded: ${quota.reason}`);

      const { embedding, model } = await embedText(
        `${title}\n\n${content}`,
        ownerAccountId,
      );
      const [row] = await db
        .insert(notes)
        .values({
          ownerAccountId,
          spaceId: space_id ?? null,
          title,
          contentText: content,
          embedding,
          embeddingModel: model,
        })
        .returning({
          id: notes.id,
          title: notes.title,
          spaceId: notes.spaceId,
          createdAt: notes.createdAt,
        });

      await applyQuotaDelta(ownerAccountId, { notes: 1 });
      return ok({ note: row });
    },
  );

  // ----- update_note -------------------------------------------------------
  server.registerTool(
    "update_note",
    {
      title: "Update note",
      description: "Update title and/or content. Re-embeds if text changed.",
      inputSchema: {
        id: z.string().uuid(),
        title: z.string().min(1).max(300).optional(),
        content: z.string().min(1).max(1_000_000).optional(),
      },
    },
    async ({ id, title, content }, extra) => {
      const auth = requireAuth(extra as ToolExtra);
      const ro = readOnlyGuard(auth);
      if (ro) return ro;
      const { ownerAccountId, spaceScope } = auth;
      if (title === undefined && content === undefined) {
        return toolError("Provide at least one of: title, content.");
      }

      const noteScope = scopeCondition(notes.spaceId, spaceScope);
      const [existing] = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.ownerAccountId, ownerAccountId),
            ...(noteScope ? [noteScope] : []),
          ),
        )
        .limit(1);
      if (!existing) return toolError(`Note not found: ${id}`);

      const nextTitle = title ?? existing.title;
      const nextContent = content ?? existing.contentText;
      const { embedding, model } = await embedText(
        `${nextTitle}\n\n${nextContent}`,
        ownerAccountId,
      );

      const [row] = await db
        .update(notes)
        .set({
          title: nextTitle,
          contentText: nextContent,
          embedding,
          embeddingModel: model,
        })
        .where(eq(notes.id, id))
        .returning({
          id: notes.id,
          title: notes.title,
          spaceId: notes.spaceId,
          updatedAt: notes.updatedAt,
        });
      return ok({ note: row });
    },
  );

  // ----- delete_note -------------------------------------------------------
  server.registerTool(
    "delete_note",
    {
      title: "Delete note",
      description: "Permanently delete a note.",
      inputSchema: {
        id: z.string().uuid(),
      },
    },
    async ({ id }, extra) => {
      const auth = requireAuth(extra as ToolExtra);
      const ro = readOnlyGuard(auth);
      if (ro) return ro;
      const { ownerAccountId, spaceScope } = auth;
      const noteScope = scopeCondition(notes.spaceId, spaceScope);
      const [row] = await db
        .delete(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.ownerAccountId, ownerAccountId),
            ...(noteScope ? [noteScope] : []),
          ),
        )
        .returning({ id: notes.id });
      if (!row) return toolError(`Note not found: ${id}`);
      await applyQuotaDelta(ownerAccountId, { notes: -1 });
      return ok({ deleted: row.id });
    },
  );

  // ----- get_file_content --------------------------------------------------
  server.registerTool(
    "get_file_content",
    {
      title: "Get file content",
      description:
        "Download the raw bytes of a file by ID. Returns base64 + mime type. " +
        "Use this when `search`/`fetch` on chunks is not enough (e.g. image, PDF).",
      inputSchema: {
        id: z.string().uuid(),
      },
    },
    async ({ id }, extra) => {
      const { ownerAccountId, spaceScope } = requireAuth(extra as ToolExtra);
      const fileScope = scopeCondition(files.spaceId, spaceScope);
      const [file] = await db
        .select({
          id: files.id,
          filename: files.filename,
          mimeType: files.mimeType,
          sizeBytes: files.sizeBytes,
          storageKey: files.storageKey,
          storageProviderId: files.storageProviderId,
          mcpHidden: files.mcpHidden,
        })
        .from(files)
        .where(
          and(
            eq(files.id, id),
            eq(files.ownerAccountId, ownerAccountId),
            ...(fileScope ? [fileScope] : []),
          ),
        )
        .limit(1);
      if (!file || file.mcpHidden) return toolError(`File not found: ${id}`);

      const provider = await getProviderForFile(file.storageProviderId);
      const { content } = await provider.get(file.storageKey);
      return ok({
        id: file.id,
        filename: file.filename,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        content_base64: Buffer.from(content).toString("base64"),
      });
    },
  );

  // ----- upload_file -------------------------------------------------------
  server.registerTool(
    "upload_file",
    {
      title: "Upload file",
      description:
        "Upload a base64-encoded file. Textual content is chunked + embedded for search.",
      inputSchema: {
        filename: z.string().min(1).max(300),
        content_base64: z.string().min(1),
        mime_type: z.string().min(1).max(200),
        space_id: z.string().uuid().optional(),
      },
    },
    async ({ filename, content_base64, mime_type, space_id }, extra) => {
      const auth = requireAuth(extra as ToolExtra);
      const ro = readOnlyGuard(auth);
      if (ro) return ro;
      const { ownerAccountId, spaceScope } = auth;
      if (space_id && !spaceInScope(spaceScope, space_id)) {
        return toolError(`space_id ${space_id} is outside this token's scope.`);
      }
      if (!space_id && spaceScope && spaceScope.length > 0) {
        return toolError(
          "Scoped token requires `space_id` (account-level uploads are outside scope).",
        );
      }
      let content: Buffer;
      try {
        content = Buffer.from(content_base64, "base64");
      } catch {
        return toolError("content_base64 is not valid base64.");
      }
      if (content.byteLength === 0) return toolError("Empty file.");
      if (content.byteLength > MAX_FILE_BYTES) {
        return toolError(
          `File exceeds per-file limit of ${MAX_FILE_BYTES} bytes.`,
        );
      }

      if (space_id) {
        const [space] = await db
          .select({ id: spaces.id })
          .from(spaces)
          .where(
            and(
              eq(spaces.id, space_id),
              eq(spaces.ownerAccountId, ownerAccountId),
            ),
          )
          .limit(1);
        if (!space) return toolError(`Space not found: ${space_id}`);
      }

      const quota = await checkQuota(ownerAccountId, {
        bytes: content.byteLength,
        files: 1,
      });
      if (!quota.ok) return toolError(`Quota exceeded: ${quota.reason}`);

      const { provider, providerId } = await getProviderForNewUpload(
        ownerAccountId,
        space_id ?? null,
      );
      const putResult = await provider.put({
        ownerAccountId,
        filename,
        content,
        mimeType: mime_type,
      });

      const [row] = await db
        .insert(files)
        .values({
          ownerAccountId,
          spaceId: space_id ?? null,
          filename,
          mimeType: mime_type,
          sizeBytes: putResult.sizeBytes,
          storageProviderId: providerId,
          storageKey: putResult.storageKey,
        })
        .returning({
          id: files.id,
          filename: files.filename,
          mimeType: files.mimeType,
          sizeBytes: files.sizeBytes,
          spaceId: files.spaceId,
          createdAt: files.createdAt,
        });

      const isTextual =
        mime_type.startsWith("text/") || mime_type === "application/json";
      if (isTextual) {
        try {
          const text = content.toString("utf-8");
          const chunks = chunkText(text);
          if (chunks.length > 0) {
            const { embeddings, model } = await embedTexts(chunks, ownerAccountId);
            await db.insert(fileChunks).values(
              chunks.map((c, i) => ({
                fileId: row.id,
                chunkIndex: i,
                contentText: c,
                embedding: embeddings[i],
                embeddingModel: model,
              })),
            );
          }
        } catch (err) {
          console.error(
            `[mcp/upload_file] embedding failed for ${row.id}, stored without chunks:`,
            err,
          );
        }
      }

      await applyQuotaDelta(ownerAccountId, {
        bytes: putResult.sizeBytes,
        files: 1,
      });
      return ok({ file: row });
    },
  );

  // ----- delete_file -------------------------------------------------------
  server.registerTool(
    "delete_file",
    {
      title: "Delete file",
      description: "Permanently delete a file and its chunks.",
      inputSchema: {
        id: z.string().uuid(),
      },
    },
    async ({ id }, extra) => {
      const auth = requireAuth(extra as ToolExtra);
      const ro = readOnlyGuard(auth);
      if (ro) return ro;
      const { ownerAccountId, spaceScope } = auth;
      const fileScope = scopeCondition(files.spaceId, spaceScope);
      const [existing] = await db
        .select({
          id: files.id,
          storageKey: files.storageKey,
          sizeBytes: files.sizeBytes,
          storageProviderId: files.storageProviderId,
        })
        .from(files)
        .where(
          and(
            eq(files.id, id),
            eq(files.ownerAccountId, ownerAccountId),
            ...(fileScope ? [fileScope] : []),
          ),
        )
        .limit(1);
      if (!existing) return toolError(`File not found: ${id}`);

      const provider = await getProviderForFile(existing.storageProviderId);
      await provider.delete(existing.storageKey);
      await db.delete(files).where(eq(files.id, id));
      await applyQuotaDelta(ownerAccountId, {
        bytes: -existing.sizeBytes,
        files: -1,
      });
      return ok({ deleted: existing.id });
    },
  );

  // ----- reindex_file ------------------------------------------------------
  server.registerTool(
    "reindex_file",
    {
      title: "Re-index file",
      description:
        "Re-extract text and re-embed a file's chunks. Use when a source " +
        "file changed but the underlying bytes are already stored, or after " +
        "a text-extraction fix.",
      inputSchema: {
        id: z.string().uuid(),
      },
    },
    async ({ id }, extra) => {
      const auth = requireAuth(extra as ToolExtra);
      const ro = readOnlyGuard(auth);
      if (ro) return ro;
      const { ownerAccountId, spaceScope } = auth;
      const fileScope = scopeCondition(files.spaceId, spaceScope);
      const [file] = await db
        .select()
        .from(files)
        .where(
          and(
            eq(files.id, id),
            eq(files.ownerAccountId, ownerAccountId),
            ...(fileScope ? [fileScope] : []),
          ),
        )
        .limit(1);
      if (!file) return toolError(`File not found: ${id}`);
      const result = await reindexFile(file);
      if (result.status === "failed") {
        return toolError(result.reason ?? "Reindex failed");
      }
      return ok({
        id: result.fileId,
        chunks: result.chunks,
        noText: result.status === "no_text",
        reason: result.reason,
      });
    },
  );

  // ----- update_file -------------------------------------------------------
  server.registerTool(
    "update_file",
    {
      title: "Update file contents",
      description:
        "Replace a file's bytes in-place. Keeps the same id + storage key — " +
        "old chunks are deleted and new ones embedded. Useful for updating " +
        "an MCP-accessible text document without creating a fresh id.",
      inputSchema: {
        id: z.string().uuid(),
        content_base64: z.string().min(1),
        mime_type: z.string().min(1).max(200).optional(),
      },
    },
    async ({ id, content_base64, mime_type }, extra) => {
      const auth = requireAuth(extra as ToolExtra);
      const ro = readOnlyGuard(auth);
      if (ro) return ro;
      const { ownerAccountId, spaceScope } = auth;
      const fileScope = scopeCondition(files.spaceId, spaceScope);
      let content: Buffer;
      try {
        content = Buffer.from(content_base64, "base64");
      } catch {
        return toolError("content_base64 is not valid base64.");
      }
      if (content.byteLength === 0) return toolError("Empty file.");
      if (content.byteLength > MAX_FILE_BYTES) {
        return toolError(
          `File exceeds per-file limit of ${MAX_FILE_BYTES} bytes.`,
        );
      }

      const [existing] = await db
        .select()
        .from(files)
        .where(
          and(
            eq(files.id, id),
            eq(files.ownerAccountId, ownerAccountId),
            ...(fileScope ? [fileScope] : []),
          ),
        )
        .limit(1);
      if (!existing) return toolError(`File not found: ${id}`);

      // Read-only providers (GitHub) can't be written back to.
      if (existing.storageProviderId) {
        // Attempt a write via `put`; GitHubProvider.put will throw with a
        // clear message. S3 is fine.
      }

      const nextMime = mime_type ?? existing.mimeType;
      const sizeDelta = content.byteLength - existing.sizeBytes;
      if (sizeDelta > 0) {
        const quota = await checkQuota(ownerAccountId, { bytes: sizeDelta });
        if (!quota.ok) return toolError(`Quota exceeded: ${quota.reason}`);
      }

      const provider = await getProviderForFile(existing.storageProviderId);
      try {
        // Re-put. For vercel-blob + S3 this writes at the same storage key.
        // For GitHub (read-only) we bail out here with a clear error.
        await provider.put({
          ownerAccountId,
          filename: existing.filename,
          content,
          mimeType: nextMime,
        });
      } catch (err) {
        return toolError(
          err instanceof Error ? err.message : "Upload failed.",
        );
      }

      await db
        .update(files)
        .set({
          sizeBytes: content.byteLength,
          mimeType: nextMime,
        })
        .where(eq(files.id, id));

      // Refresh chunks — same path as the REST reindex route.
      await db.delete(fileChunks).where(eq(fileChunks.fileId, id));
      const isTextual =
        nextMime.startsWith("text/") || nextMime === "application/json";
      if (isTextual) {
        try {
          const text = content.toString("utf-8");
          const chunks = chunkText(text);
          if (chunks.length > 0) {
            const { embeddings, model } = await embedTexts(chunks, ownerAccountId);
            await db.insert(fileChunks).values(
              chunks.map((c, i) => ({
                fileId: id,
                chunkIndex: i,
                contentText: c,
                embedding: embeddings[i],
                embeddingModel: model,
              })),
            );
          }
        } catch (err) {
          console.error(`[mcp/update_file] reindex failed for ${id}:`, err);
        }
      }

      if (sizeDelta !== 0) {
        await applyQuotaDelta(ownerAccountId, { bytes: sizeDelta });
      }
      return ok({ id, sizeBytes: content.byteLength, mimeType: nextMime });
    },
  );

  // ----- move_file ---------------------------------------------------------
  server.registerTool(
    "move_file",
    {
      title: "Move file to space",
      description:
        "Change which space a file belongs to. Pass `space_id: null` to " +
        "detach (file becomes account-level). Bytes + chunks stay intact.",
      inputSchema: {
        id: z.string().uuid(),
        space_id: z.string().uuid().nullable(),
      },
    },
    async ({ id, space_id }, extra) => {
      const auth = requireAuth(extra as ToolExtra);
      const ro = readOnlyGuard(auth);
      if (ro) return ro;
      const { ownerAccountId, spaceScope } = auth;
      const fileScope = scopeCondition(files.spaceId, spaceScope);
      if (space_id && !spaceInScope(spaceScope, space_id)) {
        return toolError(`space_id ${space_id} is outside this token's scope.`);
      }
      if (!space_id && spaceScope && spaceScope.length > 0) {
        return toolError(
          "Scoped token can't detach files to account-level — pass a `space_id` inside scope.",
        );
      }

      if (space_id) {
        const [space] = await db
          .select({ id: spaces.id })
          .from(spaces)
          .where(
            and(
              eq(spaces.id, space_id),
              eq(spaces.ownerAccountId, ownerAccountId),
            ),
          )
          .limit(1);
        if (!space) return toolError(`Space not found: ${space_id}`);
      }

      const [row] = await db
        .update(files)
        .set({ spaceId: space_id })
        .where(
          and(
            eq(files.id, id),
            eq(files.ownerAccountId, ownerAccountId),
            ...(fileScope ? [fileScope] : []),
          ),
        )
        .returning({
          id: files.id,
          filename: files.filename,
          spaceId: files.spaceId,
        });
      if (!row) return toolError(`File not found: ${id}`);
      return ok({ file: row });
    },
  );

  // ----- summarize_space ---------------------------------------------------
  server.registerTool(
    "summarize_space",
    {
      title: "Summarize space",
      description:
        "Build a structured digest of everything in a space — recent notes " +
        "+ file titles + file-chunk excerpts — suitable as a prompt context. " +
        "Returns plain text you can feed straight back into a chat.",
      inputSchema: {
        space_id: z.string().uuid(),
        max_notes: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe("Default 15."),
        max_files: z
          .number()
          .int()
          .positive()
          .max(50)
          .optional()
          .describe("Default 20."),
      },
    },
    async ({ space_id, max_notes, max_files }, extra) => {
      const { ownerAccountId, spaceScope } = requireAuth(extra as ToolExtra);
      if (!spaceInScope(spaceScope, space_id)) {
        return toolError(`space_id ${space_id} is outside this token's scope.`);
      }
      const [space] = await db
        .select()
        .from(spaces)
        .where(
          and(
            eq(spaces.id, space_id),
            eq(spaces.ownerAccountId, ownerAccountId),
          ),
        )
        .limit(1);
      if (!space) return toolError(`Space not found: ${space_id}`);

      const nNotes = max_notes ?? 15;
      const nFiles = max_files ?? 20;

      const [noteRows, fileRows] = await Promise.all([
        db
          .select({
            id: notes.id,
            title: notes.title,
            contentText: notes.contentText,
            updatedAt: notes.updatedAt,
          })
          .from(notes)
          .where(
            and(
              eq(notes.ownerAccountId, ownerAccountId),
              eq(notes.spaceId, space_id),
              eq(notes.mcpHidden, false),
            ),
          )
          .orderBy(desc(notes.updatedAt))
          .limit(nNotes),
        db
          .select({
            id: files.id,
            filename: files.filename,
            mimeType: files.mimeType,
            sizeBytes: files.sizeBytes,
            createdAt: files.createdAt,
          })
          .from(files)
          .where(
            and(
              eq(files.ownerAccountId, ownerAccountId),
              eq(files.spaceId, space_id),
              eq(files.mcpHidden, false),
            ),
          )
          .orderBy(desc(files.createdAt))
          .limit(nFiles),
      ]);

      const abbrev = (s: string, n = 280) => {
        const t = s.trim().replace(/\s+/g, " ");
        return t.length <= n ? t : `${t.slice(0, n)}…`;
      };

      const lines: string[] = [];
      lines.push(`# Space: ${space.name}`);
      if (space.description) lines.push(space.description);
      lines.push("");
      lines.push(`## Notes (${noteRows.length})`);
      if (noteRows.length === 0) lines.push("— none —");
      for (const n of noteRows) {
        lines.push(`- **${n.title}** (note:${n.id})`);
        lines.push(`  ${abbrev(n.contentText)}`);
      }
      lines.push("");
      lines.push(`## Files (${fileRows.length})`);
      if (fileRows.length === 0) lines.push("— none —");
      for (const f of fileRows) {
        lines.push(
          `- **${f.filename}** · ${f.mimeType} · ${(f.sizeBytes / 1024).toFixed(1)} KB (file:${f.id})`,
        );
      }

      const digest = lines.join("\n");
      return {
        content: [{ type: "text", text: digest }],
        structuredContent: {
          spaceId: space.id,
          spaceName: space.name,
          noteCount: noteRows.length,
          fileCount: fileRows.length,
          digest,
        },
      } as ToolResult;
    },
  );
}
