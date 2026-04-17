/**
 * MCP tool implementations. These reuse the same quota/storage/embedding
 * helpers as the REST API so the two surfaces stay in lockstep.
 *
 * Every tool is scoped to the `ownerAccountId` that `withMcpAuth` stashes on
 * `authInfo.extra` per request. Tools that see a missing/invalid context
 * return a loud error rather than silently operating on a wrong account.
 */

import { and, cosineDistance, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { fileChunks, files, notes, spaces } from "@/lib/db/schema";
import { chunkText, embedText, embedTexts } from "@/lib/embeddings";
import { applyQuotaDelta, checkQuota } from "@/lib/quota";
import {
  getCurrentStorageProvider,
  getStorageProviderForFile,
  loadStorageContext,
} from "@/lib/storage";
import type { StorageProviderName } from "@/lib/storage/types";

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
    };
  };
};

function requireOwnerAccountId(extra: ToolExtra): string {
  const id = extra?.authInfo?.extra?.ownerAccountId;
  if (!id || typeof id !== "string") {
    throw new Error(
      "Missing auth context (expected ownerAccountId on authInfo.extra).",
    );
  }
  return id;
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
      const ownerAccountId = requireOwnerAccountId(extra as ToolExtra);
      const n = limit ?? 10;
      const { embedding } = await embedText(query);

      const noteSim = sql<number>`1 - (${cosineDistance(notes.embedding, embedding)})`;
      const noteRows = await db
        .select({
          id: notes.id,
          title: notes.title,
          contentText: notes.contentText,
          similarity: noteSim,
        })
        .from(notes)
        .where(eq(notes.ownerAccountId, ownerAccountId))
        .orderBy(desc(noteSim))
        .limit(n);

      const chunkSim = sql<number>`1 - (${cosineDistance(fileChunks.embedding, embedding)})`;
      const chunkRows = await db
        .select({
          id: fileChunks.id,
          filename: files.filename,
          contentText: fileChunks.contentText,
          similarity: chunkSim,
        })
        .from(fileChunks)
        .innerJoin(files, eq(files.id, fileChunks.fileId))
        .where(eq(files.ownerAccountId, ownerAccountId))
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
      const ownerAccountId = requireOwnerAccountId(extra as ToolExtra);

      const [note] = await db
        .select()
        .from(notes)
        .where(and(eq(notes.id, id), eq(notes.ownerAccountId, ownerAccountId)))
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
          and(eq(fileChunks.id, id), eq(files.ownerAccountId, ownerAccountId)),
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
      const ownerAccountId = requireOwnerAccountId(extra as ToolExtra);
      const rows = await db
        .select({
          id: spaces.id,
          name: spaces.name,
          description: spaces.description,
          createdAt: spaces.createdAt,
          updatedAt: spaces.updatedAt,
        })
        .from(spaces)
        .where(eq(spaces.ownerAccountId, ownerAccountId))
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
      const ownerAccountId = requireOwnerAccountId(extra as ToolExtra);
      const n = limit ?? 50;
      const conds = [eq(files.ownerAccountId, ownerAccountId)];
      if (space_id) conds.push(eq(files.spaceId, space_id));
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
      const ownerAccountId = requireOwnerAccountId(extra as ToolExtra);
      const n = limit ?? 50;
      const conds = [eq(notes.ownerAccountId, ownerAccountId)];
      if (space_id) conds.push(eq(notes.spaceId, space_id));
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
      const ownerAccountId = requireOwnerAccountId(extra as ToolExtra);

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

      const { embedding, model } = await embedText(`${title}\n\n${content}`);
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
      const ownerAccountId = requireOwnerAccountId(extra as ToolExtra);
      if (title === undefined && content === undefined) {
        return toolError("Provide at least one of: title, content.");
      }

      const [existing] = await db
        .select()
        .from(notes)
        .where(and(eq(notes.id, id), eq(notes.ownerAccountId, ownerAccountId)))
        .limit(1);
      if (!existing) return toolError(`Note not found: ${id}`);

      const nextTitle = title ?? existing.title;
      const nextContent = content ?? existing.contentText;
      const { embedding, model } = await embedText(
        `${nextTitle}\n\n${nextContent}`,
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
      const ownerAccountId = requireOwnerAccountId(extra as ToolExtra);
      const [row] = await db
        .delete(notes)
        .where(and(eq(notes.id, id), eq(notes.ownerAccountId, ownerAccountId)))
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
      const ownerAccountId = requireOwnerAccountId(extra as ToolExtra);
      const [file] = await db
        .select({
          id: files.id,
          filename: files.filename,
          mimeType: files.mimeType,
          sizeBytes: files.sizeBytes,
          storageKey: files.storageKey,
          storageProvider: files.storageProvider,
        })
        .from(files)
        .where(and(eq(files.id, id), eq(files.ownerAccountId, ownerAccountId)))
        .limit(1);
      if (!file) return toolError(`File not found: ${id}`);

      const storageCtx = await loadStorageContext(ownerAccountId);
      const provider = getStorageProviderForFile(
        file.storageProvider as StorageProviderName,
        storageCtx,
      );
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
      const ownerAccountId = requireOwnerAccountId(extra as ToolExtra);
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

      const storageCtx = await loadStorageContext(ownerAccountId);
      const provider = getCurrentStorageProvider(storageCtx);
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
          storageProvider: provider.name,
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
            const { embeddings, model } = await embedTexts(chunks);
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
      const ownerAccountId = requireOwnerAccountId(extra as ToolExtra);
      const [existing] = await db
        .select({
          id: files.id,
          storageKey: files.storageKey,
          sizeBytes: files.sizeBytes,
          storageProvider: files.storageProvider,
        })
        .from(files)
        .where(and(eq(files.id, id), eq(files.ownerAccountId, ownerAccountId)))
        .limit(1);
      if (!existing) return toolError(`File not found: ${id}`);

      const storageCtx = await loadStorageContext(ownerAccountId);
      const provider = getStorageProviderForFile(
        existing.storageProvider as StorageProviderName,
        storageCtx,
      );
      await provider.delete(existing.storageKey);
      await db.delete(files).where(eq(files.id, id));
      await applyQuotaDelta(ownerAccountId, {
        bytes: -existing.sizeBytes,
        files: -1,
      });
      return ok({ deleted: existing.id });
    },
  );
}
