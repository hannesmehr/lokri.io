import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  notFound,
  parseJsonBody,
  paymentRequired,
  serverError,
  authErrorResponse,
  zodError} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { spaces } from "@/lib/db/schema";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { importExternalKey } from "@/lib/space-import";
import { loadBrowsableProvider } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  /** Key relative to the provider's path_prefix (same as browse UI). */
  key: z.string().min(1).max(1500)});

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount({
      minRole: "member"});
    const { id } = await params;

    const rl = await limit("fileUpload", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const body = await parseJsonBody(req, 4 * 1024);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const [space] = await db
      .select({
        id: spaces.id,
        storageProviderId: spaces.storageProviderId})
      .from(spaces)
      .where(and(eq(spaces.id, id), eq(spaces.ownerAccountId, ownerAccountId)))
      .limit(1);
    if (!space || !space.storageProviderId) return notFound();

    const { provider } = await loadBrowsableProvider(
      ownerAccountId,
      space.storageProviderId,
    );

    const result = await importExternalKey(
      {
        ownerAccountId,
        spaceId: space.id,
        providerId: space.storageProviderId,
        provider,
        rootPrefix: provider.rootPrefix},
      parsed.data.key,
    );

    if (result.status === "skipped_quota") {
      return paymentRequired(result.reason ?? "Quota exceeded");
    }
    if (result.status === "failed") {
      return serverError(new Error(result.reason ?? "Import failed"));
    }
    return NextResponse.json({
      fileId: result.fileId,
      alreadyImported: result.status === "already_imported"});
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[external.import]", err);
    return serverError(err);
  }
}
