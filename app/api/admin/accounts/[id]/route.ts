import { and, desc, eq, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ApiAuthError,
  authErrorResponse,
  notFound,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAdminActionOnAccount } from "@/lib/admin/audit";
import { db } from "@/lib/db";
import {
  apiTokens,
  invoices,
  ownerAccountMembers,
  ownerAccounts,
  plans,
  usageQuota,
  users,
} from "@/lib/db/schema";
import { getQuota } from "@/lib/quota";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Detailsicht eines Owner-Accounts für das Admin-Panel.
 *
 * Liefert Account-Metadata, den aktuellen Quota-Status (inkl. Override),
 * die letzten 20 Member, die letzten 10 Rechnungen und die aktiven
 * MCP-Tokens.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminSession();
    const { id } = await params;

    const [account] = await db
      .select({
        id: ownerAccounts.id,
        name: ownerAccounts.name,
        type: ownerAccounts.type,
        planId: ownerAccounts.planId,
        planName: plans.name,
        planExpiresAt: ownerAccounts.planExpiresAt,
        planRenewedAt: ownerAccounts.planRenewedAt,
        quotaOverride: ownerAccounts.quotaOverride,
        createdAt: ownerAccounts.createdAt,
        isSeatBased: plans.isSeatBased,
        planMaxBytes: plans.maxBytes,
        planMaxFiles: plans.maxFiles,
        planMaxNotes: plans.maxNotes,
      })
      .from(ownerAccounts)
      .innerJoin(plans, eq(plans.id, ownerAccounts.planId))
      .where(eq(ownerAccounts.id, id))
      .limit(1);
    if (!account) return notFound();

    const [members, recentInvoices, tokens, quota] = await Promise.all([
      db
        .select({
          userId: ownerAccountMembers.userId,
          email: users.email,
          name: users.name,
          role: ownerAccountMembers.role,
          joinedAt: ownerAccountMembers.joinedAt,
        })
        .from(ownerAccountMembers)
        .innerJoin(users, eq(users.id, ownerAccountMembers.userId))
        .where(eq(ownerAccountMembers.ownerAccountId, id))
        .orderBy(ownerAccountMembers.joinedAt)
        .limit(50),
      db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          description: invoices.description,
          grossCents: invoices.grossCents,
          status: invoices.status,
          issuedAt: invoices.issuedAt,
        })
        .from(invoices)
        .where(eq(invoices.ownerAccountId, id))
        .orderBy(desc(invoices.issuedAt))
        .limit(10),
      db
        .select({
          id: apiTokens.id,
          name: apiTokens.name,
          tokenPrefix: apiTokens.tokenPrefix,
          createdAt: apiTokens.createdAt,
          lastUsedAt: apiTokens.lastUsedAt,
          revokedAt: apiTokens.revokedAt,
          scopeType: apiTokens.scopeType,
          readOnly: apiTokens.readOnly,
        })
        .from(apiTokens)
        .where(eq(apiTokens.ownerAccountId, id))
        .orderBy(desc(apiTokens.createdAt))
        .limit(20),
      getQuota(id).catch(() => null),
    ]);

    // Belegte Bytes separat, falls der Quota-Helper fehlschlug.
    const [usage] = await db
      .select({
        usedBytes: usageQuota.usedBytes,
        filesCount: usageQuota.filesCount,
        notesCount: usageQuota.notesCount,
      })
      .from(usageQuota)
      .where(eq(usageQuota.ownerAccountId, id))
      .limit(1);

    return NextResponse.json({
      account: {
        ...account,
        createdAt: account.createdAt.toISOString(),
        planExpiresAt: account.planExpiresAt
          ? account.planExpiresAt.toISOString()
          : null,
        planRenewedAt: account.planRenewedAt
          ? account.planRenewedAt.toISOString()
          : null,
      },
      members: members.map((m) => ({
        ...m,
        joinedAt: m.joinedAt.toISOString(),
      })),
      invoices: recentInvoices.map((i) => ({
        ...i,
        issuedAt: i.issuedAt.toISOString(),
      })),
      tokens: tokens.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        lastUsedAt: t.lastUsedAt ? t.lastUsedAt.toISOString() : null,
        revokedAt: t.revokedAt ? t.revokedAt.toISOString() : null,
      })),
      usage: usage
        ? {
            usedBytes: Number(usage.usedBytes),
            filesCount: Number(usage.filesCount),
            notesCount: Number(usage.notesCount),
          }
        : null,
      effectiveQuota: quota,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.accounts.detail]", err);
    return serverError(err);
  }
}

const quotaOverrideSchema = z
  .object({
    bytes: z.number().int().min(0).nullable().optional(),
    files: z.number().int().min(0).nullable().optional(),
    notes: z.number().int().min(0).nullable().optional(),
  })
  .nullable();

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    planId: z.string().trim().min(1).max(50).optional(),
    planExpiresAt: z
      .union([z.string().datetime(), z.null()])
      .optional(),
    quotaOverride: quotaOverrideSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Mindestens ein Feld erforderlich",
  });

/**
 * Admin-PATCH: Name, Plan, Ablaufdatum, Quota-Override anpassen.
 *
 * Jede Änderung erzeugt ein separates Audit-Event mit dem Diff, damit
 * später im Audit-Viewer nachvollzogen werden kann, wer wann welchen
 * Override gesetzt hat.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const { id } = await params;

    const body = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);

    const [current] = await db
      .select({
        name: ownerAccounts.name,
        planId: ownerAccounts.planId,
        planExpiresAt: ownerAccounts.planExpiresAt,
        quotaOverride: ownerAccounts.quotaOverride,
      })
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, id))
      .limit(1);
    if (!current) return notFound();

    const updates: Record<string, unknown> = {};

    if (parsed.data.name !== undefined && parsed.data.name !== current.name) {
      updates.name = parsed.data.name;
    }
    if (
      parsed.data.planId !== undefined &&
      parsed.data.planId !== current.planId
    ) {
      const [planRow] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(eq(plans.id, parsed.data.planId))
        .limit(1);
      if (!planRow) {
        return NextResponse.json(
          { error: `Unbekannter Plan: ${parsed.data.planId}` },
          { status: 400 },
        );
      }
      updates.planId = parsed.data.planId;
    }
    if (parsed.data.planExpiresAt !== undefined) {
      const newExpiry =
        parsed.data.planExpiresAt === null
          ? null
          : new Date(parsed.data.planExpiresAt);
      const changed =
        (current.planExpiresAt?.toISOString() ?? null) !==
        (newExpiry?.toISOString() ?? null);
      if (changed) updates.planExpiresAt = newExpiry;
    }
    if (parsed.data.quotaOverride !== undefined) {
      // Null-Felder werden als "zurücksetzen" interpretiert → nicht ins
      // Overlay schreiben. Leeres Objekt → NULL in DB (kein Override).
      const cleaned = parsed.data.quotaOverride
        ? Object.fromEntries(
            Object.entries(parsed.data.quotaOverride).filter(
              ([, v]) => typeof v === "number",
            ),
          )
        : null;
      const normalised =
        cleaned && Object.keys(cleaned).length > 0 ? cleaned : null;

      const currentSerialised = JSON.stringify(current.quotaOverride ?? null);
      const nextSerialised = JSON.stringify(normalised);
      if (currentSerialised !== nextSerialised) {
        updates.quotaOverride = normalised;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ ok: true, noop: true });
    }

    await db.update(ownerAccounts).set(updates).where(eq(ownerAccounts.id, id));

    // Audit je geändertem Feld — macht spätere Filter nach `admin.account.
    // plan_changed` / `admin.account.quota_override_set` einfach.
    const auditJobs: Promise<unknown>[] = [];
    if ("name" in updates) {
      auditJobs.push(
        logAdminActionOnAccount({
          actorAdminUserId: actorId,
          ownerAccountId: id,
          action: "admin.account.name_changed",
          metadata: { from: current.name, to: updates.name },
        }),
      );
    }
    if ("planId" in updates) {
      auditJobs.push(
        logAdminActionOnAccount({
          actorAdminUserId: actorId,
          ownerAccountId: id,
          action: "admin.account.plan_changed",
          metadata: { from: current.planId, to: updates.planId },
        }),
      );
    }
    if ("planExpiresAt" in updates) {
      auditJobs.push(
        logAdminActionOnAccount({
          actorAdminUserId: actorId,
          ownerAccountId: id,
          action: "admin.account.plan_expiry_changed",
          metadata: {
            from: current.planExpiresAt?.toISOString() ?? null,
            to:
              (updates.planExpiresAt as Date | null)?.toISOString() ?? null,
          },
        }),
      );
    }
    if ("quotaOverride" in updates) {
      auditJobs.push(
        logAdminActionOnAccount({
          actorAdminUserId: actorId,
          ownerAccountId: id,
          action: "admin.account.quota_override_set",
          metadata: {
            from: current.quotaOverride ?? null,
            to: updates.quotaOverride ?? null,
          },
        }),
      );
    }
    await Promise.all(auditJobs);

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.accounts.patch]", err);
    return serverError(err);
  }
}

// Silence unused imports for lint — future filters may need these helpers.
void and;
