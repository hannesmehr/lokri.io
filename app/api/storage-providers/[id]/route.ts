import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  apiError,
  notFound,
  serverError,
  authErrorResponse} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files, storageProviders } from "@/lib/db/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Delete a storage provider. Forbidden if any file still references it —
 * the UI surfaces that case so the user can migrate or delete the files first.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount({ minRole: "admin" });
    const { id } = await params;

    const [existing] = await db
      .select({ id: storageProviders.id })
      .from(storageProviders)
      .where(
        and(
          eq(storageProviders.id, id),
          eq(storageProviders.ownerAccountId, ownerAccountId),
        ),
      )
      .limit(1);
    if (!existing) return notFound();

    // Count files still pointing at this provider.
    const fileCount = await db.$count(
      files,
      and(
        eq(files.ownerAccountId, ownerAccountId),
        eq(files.storageProviderId, id),
      ),
    );
    if (fileCount > 0) {
      return apiError(
        `Provider kann nicht gelöscht werden — ${fileCount} Datei(en) liegen noch darauf.`,
        409,
      );
    }

    await db.delete(storageProviders).where(eq(storageProviders.id, id));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}
