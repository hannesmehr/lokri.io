import { and, eq, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  serverError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAuditEvent } from "@/lib/audit/log";
import { invalidateStatsCache } from "@/lib/admin/stats-cache";
import { reconcileCapturedOrderState } from "@/lib/billing/reconcile";
import { db } from "@/lib/db";
import { orders, users } from "@/lib/db/schema";

export const runtime = "nodejs";

/**
 * Triggert den PayPal-Reconcile-Lauf (gleiches Verhalten wie
 * `scripts/reconcile-paypal-orders.ts`). Ergebnis-Snapshot wird
 * zurückgegeben; pro betroffenen Owner-Account ein Audit-Event
 * `admin.system.reconcile_paypal`.
 */
export async function POST() {
  try {
    const { userId: actorId } = await requireAdminSession();

    const captured = await db
      .select({
        order: orders,
        user: { id: users.id, name: users.name, email: users.email },
      })
      .from(orders)
      .innerJoin(users, eq(users.id, orders.userId))
      .where(and(eq(orders.status, "captured"), isNotNull(orders.paymentId)));

    let repaired = 0;
    let failed = 0;
    const byAccount = new Map<string, { repaired: number; failed: number }>();

    for (const entry of captured) {
      const paymentId = entry.order.paymentId;
      if (!paymentId) continue;
      const key = entry.order.ownerAccountId;
      const agg = byAccount.get(key) ?? { repaired: 0, failed: 0 };
      try {
        await reconcileCapturedOrderState({
          intent: entry.order,
          ownerAccountId: entry.order.ownerAccountId,
          user: entry.user,
          paymentId,
          grossCents: entry.order.amountCents,
          payerEmail: null,
        });
        repaired++;
        agg.repaired++;
      } catch (err) {
        failed++;
        agg.failed++;
        console.error("[admin.system.reconcile-paypal] failed:", err, {
          orderId: entry.order.id,
        });
      }
      byAccount.set(key, agg);
    }

    await Promise.all(
      [...byAccount.entries()].map(([ownerAccountId, agg]) =>
        logAuditEvent({
          ownerAccountId,
          actorUserId: actorId,
          action: "admin.system.reconcile_paypal",
          metadata: { repaired: agg.repaired, failed: agg.failed },
        }),
      ),
    );

    // KPI-Cache busten, damit die neuen Invoices/Orders sichtbar werden.
    invalidateStatsCache("kpi.");
    invalidateStatsCache("ts.");
    invalidateStatsCache("system.health");

    return NextResponse.json({
      ok: true,
      totalCaptured: captured.length,
      repaired,
      failed,
      at: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.system.reconcile-paypal]", err);
    return serverError(err);
  }
}
