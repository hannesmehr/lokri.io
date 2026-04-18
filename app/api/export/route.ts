import { eq } from "drizzle-orm";
import JSZip from "jszip";
import { NextResponse } from "next/server";
import {  authErrorResponse,
 serverError} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import {
  files as filesTable,
  notes as notesTable,
  spaces as spacesTable} from "@/lib/db/schema";
import { getProviderForFile } from "@/lib/storage";

/**
 * GDPR Article 20 — Right to Data Portability.
 *
 * Bundles everything the account owns into a single ZIP:
 *
 *   manifest.json                   — top-level index with counts + exportedAt
 *   spaces.json                     — full space rows
 *   notes.json                      — notes with spaceId + content (no vectors)
 *   notes/<id>.md                   — the markdown content, file-per-note
 *   files.json                      — file metadata
 *   files/<id>-<filename>           — raw file bytes
 *
 * We deliberately drop `embedding` columns — they're deterministic from
 * content and would only bloat the archive. Everything else a reimport needs
 * is here.
 *
 * Streamed as `application/zip` so large accounts don't blow the node buffer.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const { session, ownerAccountId } = await requireSessionWithAccount();

    const [spaces, notes, files] = await Promise.all([
      db
        .select()
        .from(spacesTable)
        .where(eq(spacesTable.ownerAccountId, ownerAccountId)),
      db
        .select({
          id: notesTable.id,
          title: notesTable.title,
          contentText: notesTable.contentText,
          spaceId: notesTable.spaceId,
          createdAt: notesTable.createdAt,
          updatedAt: notesTable.updatedAt})
        .from(notesTable)
        .where(eq(notesTable.ownerAccountId, ownerAccountId)),
      db
        .select()
        .from(filesTable)
        .where(eq(filesTable.ownerAccountId, ownerAccountId)),
    ]);

    const zip = new JSZip();
    const manifest = {
      format: "lokri.io-export",
      version: 1,
      exportedAt: new Date().toISOString(),
      account: {
        userId: session.user.id,
        userEmail: session.user.email,
        ownerAccountId},
      counts: {
        spaces: spaces.length,
        notes: notes.length,
        files: files.length}};
    zip.file("manifest.json", JSON.stringify(manifest, null, 2));
    zip.file("spaces.json", JSON.stringify(spaces, null, 2));
    zip.file("notes.json", JSON.stringify(notes, null, 2));
    zip.file(
      "files.json",
      JSON.stringify(
        files.map((f) => ({
          id: f.id,
          filename: f.filename,
          mimeType: f.mimeType,
          sizeBytes: f.sizeBytes,
          spaceId: f.spaceId,
          createdAt: f.createdAt,
          // Relative path to the bytes inside the archive:
          path: `files/${f.id}-${f.filename}`,
          // storage_key + provider are deliberately *not* exported —
          // they leak our internal storage topology.
        })),
        null,
        2,
      ),
    );

    // One Markdown file per note — ergonomic for Obsidian / manual reads.
    const notesFolder = zip.folder("notes");
    for (const n of notes) {
      const fm = [
        "---",
        `id: ${n.id}`,
        `title: ${JSON.stringify(n.title)}`,
        n.spaceId ? `space_id: ${n.spaceId}` : null,
        `created: ${new Date(n.createdAt).toISOString()}`,
        `updated: ${new Date(n.updatedAt).toISOString()}`,
        "---",
        "",
      ]
        .filter(Boolean)
        .join("\n");
      notesFolder?.file(`${n.id}.md`, `${fm}${n.contentText}\n`);
    }

    // File blobs — per-file provider routing honors each file's original
    // storageProviderId (Vercel Blob + N named S3s can coexist in one
    // account).
    const filesFolder = zip.folder("files");
    for (const f of files) {
      try {
        const provider = await getProviderForFile(
          f.storageProviderId,
          ownerAccountId,
        );
        const { content } = await provider.get(f.storageKey);
        filesFolder?.file(`${f.id}-${f.filename}`, Buffer.from(content));
      } catch (err) {
        console.error(`[export] blob fetch failed for ${f.id}:`, err);
        // Continue — partial export is better than no export.
      }
    }

    const buf = await zip.generateAsync({ type: "nodebuffer" });
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(buf as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="lokri-export-${stamp}.zip"`,
        "cache-control": "private, no-store"}});
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}
