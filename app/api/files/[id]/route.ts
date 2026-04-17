import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { notFound, serverError, unauthorized } from "@/lib/api/errors";
import { findOwnedFile } from "@/lib/api/ownership";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files } from "@/lib/db/schema";
import { applyQuotaDelta } from "@/lib/quota";
import { getStorageProvider } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;
    const file = await findOwnedFile(ownerAccountId, id);
    if (!file) return notFound();
    // Download link is a same-origin proxy — auth-checked on each request.
    return NextResponse.json({
      file,
      downloadUrl: `/api/files/${file.id}/content`,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;
    const existing = await findOwnedFile(ownerAccountId, id);
    if (!existing) return notFound();

    // Delete from object storage first. If that 404s it's fine (idempotent);
    // any other failure aborts so we don't get orphaned DB rows.
    const provider = getStorageProvider();
    await provider.delete(existing.storageKey);

    // DB cascades file_chunks.
    await db.delete(files).where(eq(files.id, id));
    await applyQuotaDelta(ownerAccountId, {
      bytes: -existing.sizeBytes,
      files: -1,
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}
