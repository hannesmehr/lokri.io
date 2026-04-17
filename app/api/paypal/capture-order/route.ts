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
import { invoices, orders, ownerAccounts } from "@/lib/db/schema";
import { createInvoice } from "@/lib/invoices";
import { capturePayPalOrder } from "@/lib/paypal";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  paypalOrderId: z.string().min(1).max(200),
});

/**
 * Capture a PayPal order, activate the purchased plan, generate the invoice.
 *
 * Protections:
 *   - Session user must match the user who created the order (`users.id` in
 *     the customId). Otherwise 403 — we've already captured the payment
 *     at PayPal, so we log loudly.
 *   - Idempotent via `payment_id` (PayPal Capture ID): a second capture of
 *     the same order returns the existing invoice instead of re-upgrading.
 *   - `plan_expires_at` is extended: if the existing expiry is in the
 *     future, new period stacks on top; otherwise it starts at `now()`.
 */
export async function POST(req: NextRequest) {
  try {
    const { session, ownerAccountId } = await requireSessionWithAccount();
    const json = await parseJsonBody(req, 2048);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    const paypalOrderId = parsed.data.paypalOrderId;

    // Pull the intent row we stored in create-order.
    const [intent] = await db
      .select()
      .from(orders)
      .where(eq(orders.paypalOrderId, paypalOrderId))
      .limit(1);
    if (!intent) return apiError("Unknown order", 404);

    // Defense in depth: session user must match the user who started this.
    if (intent.userId !== session.user.id) {
      console.error(
        `[paypal/capture] user mismatch — session=${session.user.id} order.user=${intent.userId}`,
      );
      return apiError("Order does not belong to this user", 403);
    }

    // Idempotency: already captured → return the existing invoice.
    if (intent.status === "captured" && intent.paymentId) {
      const [existing] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.paymentId, intent.paymentId))
        .limit(1);
      return NextResponse.json({
        status: "already_captured",
        order: intent,
        invoice: existing ?? null,
      });
    }

    const captured = await capturePayPalOrder(paypalOrderId);
    if (captured.status !== "COMPLETED") {
      return apiError(
        `Unexpected PayPal status: ${captured.status ?? "unknown"}`,
        502,
      );
    }

    // Reconcile customId hints against our stored intent (belt + suspenders).
    if (
      captured.ownerAccountId &&
      captured.ownerAccountId !== intent.ownerAccountId
    ) {
      console.error(
        `[paypal/capture] account mismatch — intent=${intent.ownerAccountId} customId=${captured.ownerAccountId}`,
      );
      return apiError("Owner account mismatch", 403);
    }

    // Determine the new plan expiry. Stack on top if existing is in the
    // future — users who renew early don't lose the remainder.
    const [acct] = await db
      .select()
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, ownerAccountId))
      .limit(1);
    const now = new Date();
    const baseExpiry =
      acct?.planExpiresAt && acct.planExpiresAt > now
        ? acct.planExpiresAt
        : now;
    const periodMs =
      intent.period === "yearly"
        ? 365 * 24 * 60 * 60 * 1000
        : 30 * 24 * 60 * 60 * 1000;
    const newExpiry = new Date(baseExpiry.getTime() + periodMs);

    await db.transaction
      ? undefined // Neon HTTP does not support transactions — do sequentially.
      : undefined;

    // 1. mark order captured
    await db
      .update(orders)
      .set({
        status: "captured",
        capturedAt: now,
        startsAt: baseExpiry,
        expiresAt: newExpiry,
        paymentId: captured.paymentId,
      })
      .where(eq(orders.id, intent.id));

    // 2. upgrade the owner_account
    await db
      .update(ownerAccounts)
      .set({
        planId: intent.planId,
        planExpiresAt: newExpiry,
        planRenewedAt: now,
      })
      .where(eq(ownerAccounts.id, ownerAccountId));

    // 3. issue the invoice (retries on number collision internally)
    let invoice;
    try {
      invoice = await createInvoice({
        orderId: intent.id,
        ownerAccountId,
        userId: session.user.id,
        customerName: session.user.name,
        customerEmail: session.user.email,
        description: `lokri.io ${intent.planId} — ${intent.period === "yearly" ? "Jahresabo" : "Monatsabo"}`,
        grossCents: captured.amountCents || intent.amountCents,
        paymentId: captured.paymentId,
        payerEmail: captured.payerEmail,
      });
    } catch (err) {
      // Non-fatal: the plan is already active, we just couldn't generate
      // a PDF. Ops can regenerate later. Loud log for follow-up.
      console.error(
        `[paypal/capture] invoice generation failed for order ${intent.id}:`,
        err,
      );
    }

    return NextResponse.json({
      status: "captured",
      order: {
        ...intent,
        status: "captured",
        capturedAt: now,
        startsAt: baseExpiry,
        expiresAt: newExpiry,
        paymentId: captured.paymentId,
      },
      invoice: invoice ?? null,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[paypal/capture-order]", err);
    return serverError(err);
  }
}
