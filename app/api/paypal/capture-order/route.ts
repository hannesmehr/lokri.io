import { and, eq, isNull } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  apiError,
  parseJsonBody,
  serverError,
  authErrorResponse,
  zodError} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import {
  computeBillingWindow,
  ensureInvoiceForCapturedOrder,
  reconcileCapturedOrderState} from "@/lib/billing/reconcile";
import { db } from "@/lib/db";
import { orders, ownerAccounts } from "@/lib/db/schema";
import { reportOperationalIssue } from "@/lib/ops-alerts";
import { capturePayPalOrder } from "@/lib/paypal";

export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  paypalOrderId: z.string().min(1).max(200)});

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
    const { session, ownerAccountId } = await requireSessionWithAccount({ minRole: "owner" });
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
    if (intent.ownerAccountId !== ownerAccountId) {
      console.error(
        `[paypal/capture] account mismatch — session=${ownerAccountId} order.account=${intent.ownerAccountId}`,
      );
      return apiError("Order does not belong to this account", 403);
    }

    // Idempotency / reconciliation: already captured → make sure the
    // owner_account + invoice are in the expected final state.
    if (intent.status === "captured" && intent.paymentId) {
      const reconciled = await reconcileCapturedOrderState({
        intent,
        ownerAccountId,
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email},
        paymentId: intent.paymentId,
        grossCents: intent.amountCents,
        payerEmail: null});
      return NextResponse.json({
        status: "already_captured",
        order: reconciled.order,
        invoice: reconciled.invoice});
    }
    if (intent.status !== "created") {
      return apiError(`Unexpected order status: ${intent.status}`, 409);
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
    if (captured.userId && captured.userId !== intent.userId) {
      console.error(
        `[paypal/capture] user mismatch in customId — intent=${intent.userId} customId=${captured.userId}`,
      );
      return apiError("User mismatch", 403);
    }
    if (captured.orderId && captured.orderId !== intent.id) {
      console.error(
        `[paypal/capture] order mismatch in customId — intent=${intent.id} customId=${captured.orderId}`,
      );
      return apiError("Order mismatch", 403);
    }
    if (captured.planId && captured.planId !== intent.planId) {
      console.error(
        `[paypal/capture] plan mismatch — intent=${intent.planId} customId=${captured.planId}`,
      );
      return apiError("Plan mismatch", 403);
    }
    if (captured.period && captured.period !== intent.period) {
      console.error(
        `[paypal/capture] period mismatch — intent=${intent.period} customId=${captured.period}`,
      );
      return apiError("Billing period mismatch", 403);
    }

    // Determine the new plan expiry. Stack on top if existing is in the
    // future — users who renew early don't lose the remainder.
    const [acct] = await db
      .select()
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, ownerAccountId))
      .limit(1);
    const now = new Date();
    const { startsAt: baseExpiry, expiresAt: newExpiry } = computeBillingWindow(
      acct?.planExpiresAt,
      now,
      intent.period,
    );

    // 1. mark order captured, but only if this request still owns the
    // created -> captured transition.
    const [updatedOrder] = await db
      .update(orders)
      .set({
        status: "captured",
        capturedAt: now,
        startsAt: baseExpiry,
        expiresAt: newExpiry,
        paymentId: captured.paymentId})
      .where(and(eq(orders.id, intent.id), eq(orders.status, "created"), isNull(orders.paymentId)))
      .returning();

    const effectiveOrder = updatedOrder ?? {
      ...intent,
      status: "captured" as const,
      capturedAt: now,
      startsAt: baseExpiry,
      expiresAt: newExpiry,
      paymentId: captured.paymentId};

    // 2. upgrade the owner_account
    await db
      .update(ownerAccounts)
      .set({
        planId: intent.planId,
        planExpiresAt: newExpiry,
        planRenewedAt: now})
      .where(eq(ownerAccounts.id, ownerAccountId));

    // 3. issue or recover the invoice row
    let invoice = null;
    try {
      invoice = await ensureInvoiceForCapturedOrder({
        intent: effectiveOrder,
        ownerAccountId,
        user: {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email},
        paymentId: captured.paymentId,
        grossCents: captured.amountCents || intent.amountCents,
        payerEmail: captured.payerEmail});
    } catch (err) {
      reportOperationalIssue("billing.invoice_generation_failed", "error", {
        orderId: intent.id,
        ownerAccountId,
        paymentId: captured.paymentId,
        message: err instanceof Error ? err.message : String(err)});
    }

    return NextResponse.json({
      status: "captured",
      order: effectiveOrder,
      invoice});
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[paypal/capture-order]", err);
    return serverError(err);
  }
}
