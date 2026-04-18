import { eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  authErrorResponse,
  codedApiError,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { logAuditEvent } from "@/lib/audit/log";
import { db } from "@/lib/db";
import {
  apiTokens,
  files as filesTable,
  ownerAccountMembers,
  ownerAccounts,
  users as usersTable,
} from "@/lib/db/schema";
import { getProviderForFile } from "@/lib/storage";
import { TeamError, teamErrorStatus } from "@/lib/teams/errors";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const patchBodySchema = z.object({
  name: z.string().trim().min(1).max(200),
});

const deleteBodySchema = z.object({
  confirmName: z.string().trim().min(1),
});

/** GET — team details (name, member count, plan). Any role in scope. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId, accountType } = await requireSessionWithAccount();
    const { id } = await params;
    if (id !== ownerAccountId || accountType !== "team") {
      return apiError("Team not in active context", 403);
    }
    const [row] = await db
      .select({
        id: ownerAccounts.id,
        name: ownerAccounts.name,
        planId: ownerAccounts.planId,
        createdAt: ownerAccounts.createdAt,
      })
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, ownerAccountId))
      .limit(1);
    if (!row) return apiError("Team not found", 404);
    const [mc] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(ownerAccountMembers)
      .where(eq(ownerAccountMembers.ownerAccountId, ownerAccountId));
    return NextResponse.json({
      team: { ...row, memberCount: Number(mc?.n ?? 0) },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}

/** PATCH — rename. `minRole: 'admin'`. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId, accountType, session } =
      await requireSessionWithAccount({ minRole: "admin" });
    const { id } = await params;
    if (id !== ownerAccountId || accountType !== "team") {
      return apiError("Team not in active context", 403);
    }
    const body = await parseJsonBody(req, 4096);
    const parsed = patchBodySchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const [updated] = await db
      .update(ownerAccounts)
      .set({ name: parsed.data.name })
      .where(eq(ownerAccounts.id, ownerAccountId))
      .returning({ id: ownerAccounts.id, name: ownerAccounts.name });
    if (!updated) return apiError("Team not found", 404);

    await logAuditEvent({
      ownerAccountId,
      actorUserId: session.user.id,
      action: "team.renamed",
      targetType: "team",
      targetId: ownerAccountId,
      metadata: { newName: parsed.data.name },
    });

    return NextResponse.json({ team: updated });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}

/**
 * DELETE — hard-delete the team. `minRole: 'owner'`. Requires the caller
 * to echo the team name back in the body as a sanity check (defence
 * against accidental DELETE-by-curl).
 *
 * Before dropping the DB row we best-effort wipe storage objects —
 * mirroring the user-delete flow in `lib/auth.ts`. Cascade handles the
 * rest (members, spaces, notes, files, tokens, invites, audit_events).
 */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId, accountType, session } =
      await requireSessionWithAccount({ minRole: "owner" });
    const { id } = await params;
    if (id !== ownerAccountId || accountType !== "team") {
      return apiError("Team not in active context", 403);
    }
    const body = await parseJsonBody(req, 4096);
    const parsed = deleteBodySchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const [team] = await db
      .select({ name: ownerAccounts.name })
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, ownerAccountId))
      .limit(1);
    if (!team) return apiError("Team not found", 404);
    if (team.name !== parsed.data.confirmName) {
      return codedApiError(
        teamErrorStatus("team.nameMismatch"),
        "team.nameMismatch",
        "Der eingetippte Name stimmt nicht überein.",
      );
    }

    // Storage-object cleanup — same pattern as auth.deleteUser.beforeDelete.
    const fileRows = await db
      .select({
        id: filesTable.id,
        storageKey: filesTable.storageKey,
        storageProviderId: filesTable.storageProviderId,
      })
      .from(filesTable)
      .where(eq(filesTable.ownerAccountId, ownerAccountId));
    await Promise.all(
      fileRows.map(async (f) => {
        try {
          const provider = await getProviderForFile(
            f.storageProviderId,
            ownerAccountId,
          );
          await provider.delete(f.storageKey);
        } catch (cleanupErr) {
          console.error(
            `[teams.delete] storage delete failed for ${f.id}:`,
            cleanupErr,
          );
        }
      }),
    );

    // Revoke any still-active tokens (paranoia — cascade handles the rows
    // but we want them clearly revoked before deletion in case of a
    // partial failure mid-cascade).
    await db
      .update(apiTokens)
      .set({ revokedAt: new Date() })
      .where(eq(apiTokens.ownerAccountId, ownerAccountId));

    // Unset active_owner_account_id for anyone pointing at this team.
    await db
      .update(usersTable)
      .set({ activeOwnerAccountId: null })
      .where(eq(usersTable.activeOwnerAccountId, ownerAccountId));

    // Hard delete. Cascade handles members/spaces/files/notes/tokens/
    // invites/audit_events. After this, the audit row below is useless
    // — so write it first.
    await logAuditEvent({
      ownerAccountId,
      actorUserId: session.user.id,
      action: "team.deleted",
      targetType: "team",
      targetId: ownerAccountId,
      metadata: { name: team.name },
    });

    await db.delete(ownerAccounts).where(eq(ownerAccounts.id, ownerAccountId));

    return NextResponse.json({ ok: true, redirectTo: "/dashboard" });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    if (err instanceof TeamError) {
      return codedApiError(teamErrorStatus(err.code), err.code, err.message);
    }
    console.error("[api/teams.DELETE]", err);
    return serverError(err);
  }
}
