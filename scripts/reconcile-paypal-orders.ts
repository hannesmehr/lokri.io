import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { orders, users } from "@/lib/db/schema";
import { reconcileCapturedOrderState } from "@/lib/billing/reconcile";
import { reportOperationalIssue } from "@/lib/ops-alerts";

async function main() {
  const capturedOrders = await db
    .select({
      order: orders,
      user: {
        id: users.id,
        name: users.name,
        email: users.email,
      },
    })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(and(eq(orders.status, "captured"), isNotNull(orders.paymentId)));

  let repaired = 0;
  let failed = 0;

  for (const entry of capturedOrders) {
    const paymentId = entry.order.paymentId;
    if (!paymentId) continue;
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
    } catch (err) {
      failed++;
      reportOperationalIssue("billing.repair_failed", "error", {
        orderId: entry.order.id,
        ownerAccountId: entry.order.ownerAccountId,
        paymentId,
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        scanned: capturedOrders.length,
        repaired,
        failed,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  reportOperationalIssue("billing.repair_script_failed", "error", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
});
