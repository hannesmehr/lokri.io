import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invoices, orders, ownerAccounts } from "@/lib/db/schema";
import { createInvoice } from "@/lib/invoices";
import { reportOperationalIssue } from "@/lib/ops-alerts";
export { computeBillingWindow, type BillingPeriod } from "./window";

interface ReconcileInput {
  intent: typeof orders.$inferSelect;
  ownerAccountId: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  paymentId: string;
  grossCents: number;
  payerEmail: string | null;
}

export async function ensureInvoiceForCapturedOrder(
  input: ReconcileInput,
): Promise<typeof invoices.$inferSelect | null> {
  const [existing] = await db
    .select()
    .from(invoices)
    .where(eq(invoices.paymentId, input.paymentId))
    .limit(1);
  if (existing) return existing;

  try {
    return await createInvoice({
      orderId: input.intent.id,
      ownerAccountId: input.ownerAccountId,
      userId: input.user.id,
      customerName: input.user.name,
      customerEmail: input.user.email,
      description: `lokri.io ${input.intent.planId} — ${input.intent.period === "yearly" ? "Jahresabo" : "Monatsabo"}`,
      grossCents: input.grossCents,
      paymentId: input.paymentId,
      payerEmail: input.payerEmail,
    });
  } catch (err) {
    const [afterConflict] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.paymentId, input.paymentId))
      .limit(1);
    if (afterConflict) return afterConflict;
    throw err;
  }
}

export async function reconcileCapturedOrderState(
  input: ReconcileInput,
): Promise<{
  order: typeof orders.$inferSelect;
  invoice: typeof invoices.$inferSelect | null;
}> {
  if (!input.intent.startsAt || !input.intent.expiresAt || !input.intent.capturedAt) {
    throw new Error("Captured order is missing billing window metadata.");
  }

  await db
    .update(ownerAccounts)
    .set({
      planId: input.intent.planId,
      planExpiresAt: input.intent.expiresAt,
      planRenewedAt: input.intent.capturedAt,
    })
    .where(eq(ownerAccounts.id, input.ownerAccountId));

  let invoice: typeof invoices.$inferSelect | null = null;
  try {
    invoice = await ensureInvoiceForCapturedOrder(input);
  } catch (err) {
    reportOperationalIssue("billing.invoice_reconcile_failed", "error", {
      orderId: input.intent.id,
      ownerAccountId: input.ownerAccountId,
      paymentId: input.paymentId,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return { order: input.intent, invoice };
}
