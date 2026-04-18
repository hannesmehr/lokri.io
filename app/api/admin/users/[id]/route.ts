import { desc, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  ApiAuthError,
  authErrorResponse,
  notFound,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAdminActionOnUser } from "@/lib/admin/audit";
import { adminDeleteUser } from "@/lib/admin/delete-user";
import { db } from "@/lib/db";
import {
  apiTokens,
  ownerAccountMembers,
  ownerAccounts,
  sessions,
  users,
} from "@/lib/db/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    isAdmin: z.boolean().optional(),
    canCreateTeams: z.boolean().optional(),
    preferredLocale: z.enum(["de", "en"]).nullable().optional(),
    disabled: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.isAdmin !== undefined ||
      v.canCreateTeams !== undefined ||
      v.preferredLocale !== undefined ||
      v.disabled !== undefined,
    { message: "Mindestens ein Feld muss gesetzt sein." },
  );

/** GET — Detail-Ansicht mit allen Sektionen: Flags, Accounts, Tokens, Sessions. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminSession();
    const { id } = await params;

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        emailVerified: users.emailVerified,
        isAdmin: users.isAdmin,
        canCreateTeams: users.canCreateTeams,
        disabledAt: users.disabledAt,
        preferredLocale: users.preferredLocale,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) return notFound();

    // Accounts, where this user sits as a member.
    const accounts = await db
      .select({
        accountId: ownerAccounts.id,
        accountName: ownerAccounts.name,
        accountType: ownerAccounts.type,
        planId: ownerAccounts.planId,
        role: ownerAccountMembers.role,
        joinedAt: ownerAccountMembers.joinedAt,
      })
      .from(ownerAccountMembers)
      .innerJoin(
        ownerAccounts,
        eq(ownerAccountMembers.ownerAccountId, ownerAccounts.id),
      )
      .where(eq(ownerAccountMembers.userId, id))
      .orderBy(desc(ownerAccountMembers.joinedAt));

    // Tokens this user created. Team-scoped tokens where createdBy is
    // null (legacy / pre-migration) won't show up — that's intended,
    // they're account-scoped not user-scoped.
    const tokens = await db
      .select({
        id: apiTokens.id,
        name: apiTokens.name,
        tokenPrefix: apiTokens.tokenPrefix,
        scopeType: apiTokens.scopeType,
        ownerAccountId: apiTokens.ownerAccountId,
        readOnly: apiTokens.readOnly,
        lastUsedAt: apiTokens.lastUsedAt,
        createdAt: apiTokens.createdAt,
        revokedAt: apiTokens.revokedAt,
      })
      .from(apiTokens)
      .where(eq(apiTokens.createdByUserId, id))
      .orderBy(desc(apiTokens.createdAt))
      .limit(200);

    const activeSessions = await db
      .select({
        id: sessions.id,
        ipAddress: sessions.ipAddress,
        userAgent: sessions.userAgent,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(eq(sessions.userId, id))
      .orderBy(desc(sessions.createdAt))
      .limit(50);

    return NextResponse.json({
      user: {
        ...user,
        createdAt: user.createdAt.toISOString(),
        disabledAt: user.disabledAt ? user.disabledAt.toISOString() : null,
      },
      accounts: accounts.map((a) => ({
        ...a,
        joinedAt: a.joinedAt.toISOString(),
      })),
      tokens: tokens.map((t) => ({
        ...t,
        lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
        revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
      })),
      sessions: activeSessions.map((s) => ({
        ...s,
        createdAt: s.createdAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
      })),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.users.get]", err);
    return serverError(err);
  }
}

/** PATCH — Flags & disabled-Zustand ändern. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const { id } = await params;
    const isSelf = actorId === id;

    const body = await parseJsonBody(req, 4096);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    // Self-protection: Admin kann sich nicht selbst entflaggen
    // (Notbremse gegen Selbstaussperrung), disablen oder das eigene
    // Flag-Set ändern. Delete-Action hat ihren eigenen Guard weiter unten.
    if (isSelf) {
      if (parsed.data.isAdmin === false) {
        return apiError(
          "Du kannst deinen eigenen Admin-Status nicht entfernen.",
          400,
        );
      }
      if (parsed.data.disabled === true) {
        return apiError("Du kannst dich nicht selbst sperren.", 400);
      }
    }

    const [current] = await db
      .select({
        id: users.id,
        isAdmin: users.isAdmin,
        canCreateTeams: users.canCreateTeams,
        disabledAt: users.disabledAt,
        preferredLocale: users.preferredLocale,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!current) return notFound();

    const updates: {
      isAdmin?: boolean;
      canCreateTeams?: boolean;
      preferredLocale?: string | null;
      disabledAt?: Date | null;
    } = {};

    if (parsed.data.isAdmin !== undefined) updates.isAdmin = parsed.data.isAdmin;
    if (parsed.data.canCreateTeams !== undefined)
      updates.canCreateTeams = parsed.data.canCreateTeams;
    if (parsed.data.preferredLocale !== undefined)
      updates.preferredLocale = parsed.data.preferredLocale;
    if (parsed.data.disabled !== undefined) {
      updates.disabledAt = parsed.data.disabled ? new Date() : null;
    }

    await db.update(users).set(updates).where(eq(users.id, id));

    // When disabling: kill all the user's active sessions immediately
    // so they're booted mid-flight. Same thing `requireSession` would
    // do on the next request, but we want the logout visible *now*.
    if (parsed.data.disabled === true) {
      await db.delete(sessions).where(eq(sessions.userId, id));
    }

    // Audit — one event per changed field for easy querying.
    const changed: string[] = [];
    const diffMeta: Record<string, unknown> = {};
    if (
      parsed.data.isAdmin !== undefined &&
      parsed.data.isAdmin !== current.isAdmin
    ) {
      changed.push("isAdmin");
      diffMeta.isAdminFrom = current.isAdmin;
      diffMeta.isAdminTo = parsed.data.isAdmin;
    }
    if (
      parsed.data.canCreateTeams !== undefined &&
      parsed.data.canCreateTeams !== current.canCreateTeams
    ) {
      changed.push("canCreateTeams");
      diffMeta.canCreateTeamsFrom = current.canCreateTeams;
      diffMeta.canCreateTeamsTo = parsed.data.canCreateTeams;
    }
    if (
      parsed.data.preferredLocale !== undefined &&
      parsed.data.preferredLocale !== current.preferredLocale
    ) {
      changed.push("preferredLocale");
      diffMeta.preferredLocaleFrom = current.preferredLocale;
      diffMeta.preferredLocaleTo = parsed.data.preferredLocale;
    }
    if (changed.length > 0) {
      await logAdminActionOnUser({
        actorAdminUserId: actorId,
        targetUserId: id,
        action: "admin.user.flag_changed",
        metadata: { fields: changed, ...diffMeta },
      });
    }
    if (parsed.data.disabled !== undefined) {
      const wasDisabled = current.disabledAt !== null;
      if (parsed.data.disabled !== wasDisabled) {
        await logAdminActionOnUser({
          actorAdminUserId: actorId,
          targetUserId: id,
          action: parsed.data.disabled
            ? "admin.user.disabled"
            : "admin.user.enabled",
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.users.patch]", err);
    return serverError(err);
  }
}

/** DELETE — hard-delete via Better-Auth. Self-protection: Admin kann sich
 *  nicht selbst löschen. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const { id } = await params;
    if (actorId === id) {
      return apiError("Du kannst dich nicht selbst löschen.", 400);
    }

    const [user] = await db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    if (!user) return notFound();

    // Audit *before* the delete — otherwise the personal-account is
    // gone via cascade and `logAdminActionOnUser` can't resolve the
    // scope.
    await logAdminActionOnUser({
      actorAdminUserId: actorId,
      targetUserId: id,
      action: "admin.user.deleted",
      metadata: { email: user.email },
    });

    // Our own cleanup helper — mirrors the Better-Auth beforeDelete
    // hook but skips the email-verification round-trip (admin has
    // explicit intent).
    await adminDeleteUser(id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.users.delete]", err);
    return serverError(err);
  }
}

// Shake-out marker — satisfies Drizzle's re-export tracker.
void sql;
