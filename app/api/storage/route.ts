import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  parseJsonBody,
  serverError,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccounts } from "@/lib/db/schema";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { encryptJson } from "@/lib/storage/encryption";
import { S3Provider, type S3Config } from "@/lib/storage/s3";

export const runtime = "nodejs";

// ---- GET current storage provider (type only, never the credentials) -------

export async function GET() {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const [row] = await db
      .select({
        storageProvider: ownerAccounts.storageProvider,
        hasConfig: ownerAccounts.storageConfigEncrypted,
      })
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, ownerAccountId))
      .limit(1);
    if (!row) return apiError("Account not found", 404);
    return NextResponse.json({
      provider: row.storageProvider,
      configured: row.hasConfig !== null,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    return serverError(err);
  }
}

// ---- PUT: switch provider / save S3 config (encrypted) ---------------------

const s3ConfigSchema = z.object({
  endpoint: z.string().url().optional(),
  region: z.string().min(1).max(50),
  bucket: z.string().min(1).max(200),
  accessKeyId: z.string().min(1).max(200),
  secretAccessKey: z.string().min(1).max(400),
  pathPrefix: z.string().max(200).optional(),
  forcePathStyle: z.boolean().optional(),
});

const putBodySchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("vercel_blob") }),
  z.object({
    provider: z.literal("s3"),
    s3: s3ConfigSchema,
    /** If true, do a HeadBucket round-trip before saving. Default true. */
    test: z.boolean().optional().default(true),
  }),
]);

export async function PUT(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    // Changing storage wiring is sensitive (could redirect all future uploads
    // to an attacker-controlled bucket). Tight limit — 5/h — slows mistakes
    // and malicious loops.
    const rl = await limit("tokenCreate", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const json = await parseJsonBody(req, 8 * 1024);
    const parsed = putBodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    if (parsed.data.provider === "vercel_blob") {
      await db
        .update(ownerAccounts)
        .set({ storageProvider: "vercel_blob", storageConfigEncrypted: null })
        .where(eq(ownerAccounts.id, ownerAccountId));
      return NextResponse.json({ provider: "vercel_blob", configured: true });
    }

    // S3 path. Optionally ping HeadBucket before persisting — wrong creds
    // should fail loudly here, not on the next upload.
    const cfg: S3Config = parsed.data.s3;
    if (parsed.data.test !== false) {
      try {
        await new S3Provider(cfg).testConnection();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return apiError(`S3 connection test failed: ${msg}`, 400);
      }
    }

    const encrypted = encryptJson(cfg);
    await db
      .update(ownerAccounts)
      .set({
        storageProvider: "s3",
        storageConfigEncrypted: encrypted,
      })
      .where(eq(ownerAccounts.id, ownerAccountId));

    return NextResponse.json({ provider: "s3", configured: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[storage.PUT]", err);
    return serverError(err);
  }
}
