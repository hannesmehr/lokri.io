import JSZip from "jszip";
import { NextResponse, type NextRequest } from "next/server";
import {
  apiError,
  serverError,
  tooLarge,
  unauthorized,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import {
  fileChunks,
  files as filesTable,
  notes as notesTable,
  spaces as spacesTable,
} from "@/lib/db/schema";
import { chunkText, embedText, embedTexts } from "@/lib/embeddings";
import { applyQuotaDelta, checkQuota } from "@/lib/quota";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { getProviderForNewUpload } from "@/lib/storage";

/**
 * Import endpoint.
 *
 * Two archive shapes are auto-detected:
 *   1. lokri.io-export format — identified by `manifest.json` at the root
 *      with `format: "lokri.io-export"`. Recreates spaces, notes, and files
 *      as closely as possible. Original IDs are NOT preserved (we always
 *      mint fresh UUIDs) to avoid collisions.
 *   2. Plain Markdown vault (Obsidian / Bear / Logseq) — every `.md` file
 *      anywhere in the archive becomes a note. Directory structure maps to
 *      spaces (top-level directory = space name, when the archive has any).
 *
 * All content passes through quota + embedding just like normal upload.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024; // 50 MB — generous for MVP
const MAX_FILES_PER_ARCHIVE = 500;

interface ImportSummary {
  spacesCreated: number;
  notesCreated: number;
  filesCreated: number;
  skipped: Array<{ path: string; reason: string }>;
}

export async function POST(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const rl = await limit("fileUpload", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const ctype = req.headers.get("content-type") ?? "";
    if (!ctype.startsWith("multipart/form-data")) {
      return apiError("Expected multipart/form-data.", 415);
    }

    const form = await req.formData();
    const archive = form.get("file");
    if (!(archive instanceof File)) {
      return apiError("Missing `file` field.", 400);
    }
    if (archive.size === 0) return apiError("Empty archive.", 400);
    if (archive.size > MAX_ARCHIVE_BYTES) {
      return tooLarge(
        `Archive exceeds ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB limit.`,
      );
    }

    const zip = await JSZip.loadAsync(await archive.arrayBuffer());

    const manifestFile = zip.file("manifest.json");
    const isLokriExport = Boolean(manifestFile);

    const summary: ImportSummary = {
      spacesCreated: 0,
      notesCreated: 0,
      filesCreated: 0,
      skipped: [],
    };

    if (isLokriExport) {
      await importLokriExport(zip, ownerAccountId, summary);
    } else {
      await importMarkdownVault(zip, ownerAccountId, summary);
    }

    return NextResponse.json(summary);
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

// ---------------------------------------------------------------------------

async function importLokriExport(
  zip: JSZip,
  ownerAccountId: string,
  summary: ImportSummary,
) {
  const readJson = async <T>(path: string): Promise<T | null> => {
    const f = zip.file(path);
    if (!f) return null;
    try {
      return JSON.parse(await f.async("string")) as T;
    } catch {
      return null;
    }
  };

  // Spaces — recreate with fresh UUIDs but remember the old→new mapping so
  // notes can be re-linked.
  const oldSpaces =
    (await readJson<
      Array<{ id: string; name: string; description: string | null }>
    >("spaces.json")) ?? [];

  const idMap = new Map<string, string>();
  for (const s of oldSpaces) {
    const [row] = await db
      .insert(spacesTable)
      .values({
        ownerAccountId,
        name: s.name,
        description: s.description,
      })
      .returning({ id: spacesTable.id });
    idMap.set(s.id, row.id);
    summary.spacesCreated++;
  }

  const oldNotes =
    (await readJson<
      Array<{
        id: string;
        title: string;
        contentText: string;
        spaceId: string | null;
      }>
    >("notes.json")) ?? [];
  for (const n of oldNotes) {
    const quota = await checkQuota(ownerAccountId, { notes: 1 });
    if (!quota.ok) {
      summary.skipped.push({
        path: `notes/${n.id}.md`,
        reason: "quota: " + quota.reason,
      });
      continue;
    }
    try {
      const { embedding, model } = await embedText(
        `${n.title}\n\n${n.contentText}`,
      );
      await db.insert(notesTable).values({
        ownerAccountId,
        spaceId: n.spaceId ? (idMap.get(n.spaceId) ?? null) : null,
        title: n.title,
        contentText: n.contentText,
        embedding,
        embeddingModel: model,
      });
      await applyQuotaDelta(ownerAccountId, { notes: 1 });
      summary.notesCreated++;
    } catch (err) {
      summary.skipped.push({
        path: `notes/${n.id}.md`,
        reason: `embed failed: ${(err as Error).message}`,
      });
    }
  }

  const oldFiles =
    (await readJson<
      Array<{
        id: string;
        filename: string;
        mimeType: string;
        spaceId: string | null;
        path: string;
      }>
    >("files.json")) ?? [];
  await importFiles(
    zip,
    ownerAccountId,
    oldFiles.map((f) => ({
      archivePath: f.path,
      filename: f.filename,
      mimeType: f.mimeType,
      spaceId: f.spaceId ? (idMap.get(f.spaceId) ?? null) : null,
    })),
    summary,
  );
}

async function importMarkdownVault(
  zip: JSZip,
  ownerAccountId: string,
  summary: ImportSummary,
) {
  // Collect every *.md file anywhere in the zip. Group by top-level folder
  // to auto-create spaces (Obsidian vaults commonly store everything at the
  // root — then we just skip space creation).
  const mdPaths: string[] = [];
  zip.forEach((path) => {
    if (path.toLowerCase().endsWith(".md")) mdPaths.push(path);
  });

  if (mdPaths.length === 0) {
    summary.skipped.push({
      path: "(archive)",
      reason: "Keine .md-Dateien gefunden.",
    });
    return;
  }
  if (mdPaths.length > MAX_FILES_PER_ARCHIVE) {
    summary.skipped.push({
      path: "(archive)",
      reason: `Zu viele Dateien (max ${MAX_FILES_PER_ARCHIVE}).`,
    });
    return;
  }

  // spaceName → spaceId map (lazily created)
  const spaceByName = new Map<string, string>();
  async function getSpaceId(name: string): Promise<string> {
    const existing = spaceByName.get(name);
    if (existing) return existing;
    const [row] = await db
      .insert(spacesTable)
      .values({ ownerAccountId, name })
      .returning({ id: spacesTable.id });
    spaceByName.set(name, row.id);
    summary.spacesCreated++;
    return row.id;
  }

  for (const path of mdPaths) {
    const topFolder = path.includes("/") ? path.split("/")[0] : null;
    const title = path
      .split("/")
      .pop()!
      .replace(/\.md$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    const file = zip.file(path);
    if (!file) continue;
    const body = await file.async("string");
    // Strip Obsidian/Jekyll front-matter if present
    const clean = body.replace(/^---[\s\S]*?---\n?/, "").trim();
    if (clean.length === 0) {
      summary.skipped.push({ path, reason: "Leere Note" });
      continue;
    }
    const quota = await checkQuota(ownerAccountId, { notes: 1 });
    if (!quota.ok) {
      summary.skipped.push({ path, reason: "quota: " + quota.reason });
      continue;
    }
    const spaceId = topFolder ? await getSpaceId(topFolder) : null;
    try {
      const { embedding, model } = await embedText(`${title}\n\n${clean}`);
      await db.insert(notesTable).values({
        ownerAccountId,
        spaceId,
        title,
        contentText: clean,
        embedding,
        embeddingModel: model,
      });
      await applyQuotaDelta(ownerAccountId, { notes: 1 });
      summary.notesCreated++;
    } catch (err) {
      summary.skipped.push({
        path,
        reason: `embed failed: ${(err as Error).message}`,
      });
    }
  }
}

async function importFiles(
  zip: JSZip,
  ownerAccountId: string,
  entries: Array<{
    archivePath: string;
    filename: string;
    mimeType: string;
    spaceId: string | null;
  }>,
  summary: ImportSummary,
) {
  for (const entry of entries) {
    // Pick provider per file — space-override may route to different buckets.
    const { provider, providerId } = await getProviderForNewUpload(
      ownerAccountId,
      entry.spaceId,
    );
    const zipped = zip.file(entry.archivePath);
    if (!zipped) {
      summary.skipped.push({
        path: entry.archivePath,
        reason: "Datei fehlt im Archiv",
      });
      continue;
    }
    const bytes = await zipped.async("nodebuffer");
    const quota = await checkQuota(ownerAccountId, {
      bytes: bytes.byteLength,
      files: 1,
    });
    if (!quota.ok) {
      summary.skipped.push({
        path: entry.archivePath,
        reason: "quota: " + quota.reason,
      });
      continue;
    }

    try {
      const put = await provider.put({
        ownerAccountId,
        filename: entry.filename,
        content: bytes,
        mimeType: entry.mimeType,
      });
      const [row] = await db
        .insert(filesTable)
        .values({
          ownerAccountId,
          spaceId: entry.spaceId,
          filename: entry.filename,
          mimeType: entry.mimeType,
          sizeBytes: put.sizeBytes,
          storageProvider: provider.name,
          storageProviderId: providerId,
          storageKey: put.storageKey,
        })
        .returning({ id: filesTable.id });

      // Auto-chunk+embed textual content so search works immediately.
      const isTextual =
        entry.mimeType.startsWith("text/") ||
        entry.mimeType === "application/json";
      if (isTextual) {
        try {
          const text = bytes.toString("utf-8");
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
            `[import] embed failed for ${entry.archivePath}, file kept without chunks:`,
            err,
          );
        }
      }
      await applyQuotaDelta(ownerAccountId, {
        bytes: put.sizeBytes,
        files: 1,
      });
      summary.filesCreated++;
    } catch (err) {
      summary.skipped.push({
        path: entry.archivePath,
        reason: `upload failed: ${(err as Error).message}`,
      });
    }
  }
}
