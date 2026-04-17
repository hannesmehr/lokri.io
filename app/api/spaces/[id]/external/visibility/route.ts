import { and, eq, like, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  notFound,
  parseJsonBody,
  serverError,
  unauthorized,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files, spaces } from "@/lib/db/schema";

export const runtime = "nodejs";

const bodySchema = z.object({
  /**
   * Relative key. Trailing-slash entries are treated as directory
   * prefixes — all matching keys (and sub-keys) are affected.
   */
  key: z.string().min(1).max(1500),
  hidden: z.boolean(),
});

type Params = { params: Promise<{ id: string }> };

/**
 * Toggle an external key or directory on the space's hidden-list AND
 * propagate the flag to any imported `files` rows so the MCP tools
 * (`search`, `fetch`, `list_*`, `get_file_content`) skip them too.
 *
 * "Hidden in browser" and "hidden from MCP" are one concept — out-of-scope
 * for the user's workspace.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount();
    const { id } = await params;

    const body = await parseJsonBody(req, 4 * 1024);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const [space] = await db
      .select({
        id: spaces.id,
        storageProviderId: spaces.storageProviderId,
      })
      .from(spaces)
      .where(and(eq(spaces.id, id), eq(spaces.ownerAccountId, ownerAccountId)))
      .limit(1);
    if (!space) return notFound();

    // ── Update the space's hidden-list array ────────────────────────────
    if (parsed.data.hidden) {
      await db
        .update(spaces)
        .set({
          hiddenExternalKeys: sql`(
            SELECT ARRAY(SELECT DISTINCT UNNEST(array_append(${spaces.hiddenExternalKeys}, ${parsed.data.key})))
          )`,
        })
        .where(eq(spaces.id, id));
    } else {
      await db
        .update(spaces)
        .set({
          hiddenExternalKeys: sql`array_remove(${spaces.hiddenExternalKeys}, ${parsed.data.key})`,
        })
        .where(eq(spaces.id, id));
    }

    // ── Propagate to imported files: mcp_hidden mirrors browser-hidden ──
    if (space.storageProviderId) {
      const { loadBrowsableProvider } = await import("@/lib/storage");
      try {
        const { provider } = await loadBrowsableProvider(
          ownerAccountId,
          space.storageProviderId,
        );
        const rootPrefix = provider.rootPrefix;
        const isPrefix = parsed.data.key.endsWith("/");
        const absoluteKey = rootPrefix
          ? `${rootPrefix}/${parsed.data.key}`
          : parsed.data.key;

        const keyCondition = isPrefix
          ? like(files.storageKey, `${absoluteKey}%`)
          : eq(files.storageKey, absoluteKey);

        await db
          .update(files)
          .set({ mcpHidden: parsed.data.hidden })
          .where(
            and(
              eq(files.ownerAccountId, ownerAccountId),
              eq(files.storageProviderId, space.storageProviderId),
              keyCondition,
            ),
          );
      } catch {
        // Provider row missing — skip mirror, but the space-level hidden
        // list is still updated (above).
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[external.visibility]", err);
    return serverError(err);
  }
}
