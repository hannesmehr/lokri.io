import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  codedApiError,
  parseJsonBody,
  serverError,
  authErrorResponse,
  zodError} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { embeddingKeys } from "@/lib/db/schema";
import { EmbeddingKeyError, maskEmbeddingKey } from "@/lib/embedding-key-errors";
import {
  ALLOWED_BYOK_MODELS,
  testEmbeddingKey,
  type EmbeddingProviderKind} from "@/lib/embedding-keys";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { encryptJson } from "@/lib/storage/encryption";

export const runtime = "nodejs";

const bodySchema = z.object({
  provider: z.enum(["openai"] as const),
  model: z.string().min(1).max(100),
  /** Plaintext API key — stored AES-256-GCM-encrypted; never returned back. */
  apiKey: z.string().min(1).max(400)});

// ---- GET: current BYOK state (never returns the plaintext key) -------------

export async function GET() {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const [row] = await db
      .select({
        id: embeddingKeys.id,
        provider: embeddingKeys.provider,
        model: embeddingKeys.model,
        lastUsedAt: embeddingKeys.lastUsedAt,
        createdAt: embeddingKeys.createdAt})
      .from(embeddingKeys)
      .where(eq(embeddingKeys.ownerAccountId, ownerAccountId))
      .limit(1);
    return NextResponse.json({ key: row ?? null });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}

// ---- POST: create or replace (test required, then persist) ----------------

export async function POST(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount({ minRole: "admin" });
    const rl = await limit("tokenCreate", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const json = await parseJsonBody(req, 4 * 1024);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    const { provider, model, apiKey } = parsed.data;

    // Reject unknown models early — also guarded in `testEmbeddingKey`,
    // but erroring here skips an unnecessary network round-trip.
    const allowed = ALLOWED_BYOK_MODELS[provider as EmbeddingProviderKind];
    if (!allowed || !allowed.has(model)) {
      // TODO(i18n-rollout): `message`-Fallback entfernen nach Phase-2-Abschluss.
      return codedApiError(
        400,
        "embeddingKey.verificationFailed",
        "Embedding-Key konnte nicht verifiziert werden. Bitte prüfe ihn.",
      );
    }

    // Test before persisting — same story as storage providers: if the key
    // doesn't work, don't silently save a broken config.
    try {
      await testEmbeddingKey(provider as EmbeddingProviderKind, model, apiKey);
    } catch (err) {
      if (err instanceof EmbeddingKeyError) {
        // TODO(i18n-rollout): `message`-Fallback entfernen nach Phase-2-Abschluss.
        return codedApiError(err.status, err.code, err.message);
      }
      // TODO(i18n-rollout): `message`-Fallback entfernen nach Phase-2-Abschluss.
      return codedApiError(
        400,
        "embeddingKey.verificationFailed",
        "Embedding-Key konnte nicht verifiziert werden. Bitte prüfe ihn.",
      );
    }

    const configEncrypted = encryptJson({ apiKey });

    // Upsert: one row per account. If the user already had a key, the
    // unique index on `owner_account_id` forces a delete-then-insert so
    // the `last_used_at` / `created_at` reset correctly.
    await db
      .delete(embeddingKeys)
      .where(eq(embeddingKeys.ownerAccountId, ownerAccountId));

    const [row] = await db
      .insert(embeddingKeys)
      .values({
        ownerAccountId,
        provider,
        model,
        configEncrypted})
      .returning({
        id: embeddingKeys.id,
        provider: embeddingKeys.provider,
        model: embeddingKeys.model,
        createdAt: embeddingKeys.createdAt});

    return NextResponse.json({ key: row }, { status: 201 });
    return NextResponse.json(
      {
        key: {
          ...row,
          maskedKey: maskEmbeddingKey(apiKey),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[embedding-key.POST]", err);
    return serverError(err);
  }
}

// ---- DELETE: remove BYOK, fall back to gateway -----------------------------

export async function DELETE() {
  try {
    const { ownerAccountId } = await requireSessionWithAccount({ minRole: "admin" });
    const [existing] = await db
      .select({ id: embeddingKeys.id })
      .from(embeddingKeys)
      .where(eq(embeddingKeys.ownerAccountId, ownerAccountId))
      .limit(1);

    if (!existing) {
      // TODO(i18n-rollout): `message`-Fallback entfernen nach Phase-2-Abschluss.
      return codedApiError(
        404,
        "embeddingKey.notFound",
        "Kein Embedding-Key hinterlegt.",
      );
    }

    await db
      .delete(embeddingKeys)
      .where(eq(embeddingKeys.ownerAccountId, ownerAccountId));
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}
