import { and, asc, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  parseJsonBody,
  serverError,
  authErrorResponse,
  zodError} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { storageProviders } from "@/lib/db/schema";
import { limit, rateLimitResponse } from "@/lib/rate-limit";
import { encryptJson } from "@/lib/storage/encryption";
import { GitHubProvider, type GitHubConfig } from "@/lib/storage/github";
import { S3Provider, type S3Config } from "@/lib/storage/s3";

export const runtime = "nodejs";

const s3ConfigSchema = z.object({
  endpoint: z.string().url().optional(),
  region: z.string().min(1).max(50),
  bucket: z.string().min(1).max(200),
  accessKeyId: z.string().min(1).max(200),
  secretAccessKey: z.string().min(1).max(400),
  pathPrefix: z.string().max(200).optional(),
  forcePathStyle: z.boolean().optional()});

const githubConfigSchema = z.object({
  accessToken: z.string().min(1).max(400).optional(),
  owner: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .regex(/^[\w.-]+$/, "Ungültiger GitHub-Owner"),
  repo: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[\w.-]+$/, "Ungültiger Repo-Name"),
  ref: z.string().trim().max(200).optional(),
  pathPrefix: z.string().max(200).optional()});

const createSchema = z.discriminatedUnion("type", [
  z.object({
    name: z.string().trim().min(1).max(80),
    type: z.literal("s3"),
    s3: s3ConfigSchema}),
  z.object({
    name: z.string().trim().min(1).max(80),
    type: z.literal("github"),
    github: githubConfigSchema}),
]);

// ---- List -----------------------------------------------------------------

export async function GET() {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const rows = await db
      .select({
        id: storageProviders.id,
        name: storageProviders.name,
        type: storageProviders.type,
        createdAt: storageProviders.createdAt,
        updatedAt: storageProviders.updatedAt})
      .from(storageProviders)
      .where(eq(storageProviders.ownerAccountId, ownerAccountId))
      .orderBy(asc(storageProviders.createdAt));
    return NextResponse.json({ providers: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}

// ---- Create (test required, then persist) ----------------------------------

export async function POST(req: NextRequest) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount({ minRole: "admin" });
    const rl = await limit("tokenCreate", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const json = await parseJsonBody(req, 8 * 1024);
    const parsed = createSchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    // Unique name per account.
    const [existing] = await db
      .select({ id: storageProviders.id })
      .from(storageProviders)
      .where(
        and(
          eq(storageProviders.ownerAccountId, ownerAccountId),
          eq(storageProviders.name, parsed.data.name),
        ),
      )
      .limit(1);
    if (existing) {
      return apiError("Ein Provider mit diesem Namen existiert bereits.", 409);
    }

    // HARD requirement: connection must succeed before we persist.
    let configToEncrypt: S3Config | GitHubConfig;
    if (parsed.data.type === "s3") {
      const cfg: S3Config = parsed.data.s3;
      try {
        await new S3Provider(cfg).testConnection();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return apiError(`Verbindungstest fehlgeschlagen: ${msg}`, 400);
      }
      configToEncrypt = cfg;
    } else {
      const cfg: GitHubConfig = parsed.data.github;
      try {
        await new GitHubProvider(cfg).testConnection();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        return apiError(`GitHub-Verbindungstest fehlgeschlagen: ${msg}`, 400);
      }
      configToEncrypt = cfg;
    }

    const encrypted = encryptJson(configToEncrypt);
    const [row] = await db
      .insert(storageProviders)
      .values({
        ownerAccountId,
        name: parsed.data.name,
        type: parsed.data.type,
        configEncrypted: encrypted})
      .returning({
        id: storageProviders.id,
        name: storageProviders.name,
        type: storageProviders.type,
        createdAt: storageProviders.createdAt});
    return NextResponse.json({ provider: row }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[storage-providers.POST]", err);
    return serverError(err);
  }
}
