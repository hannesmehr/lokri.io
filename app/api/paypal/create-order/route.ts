import { eq } from "drizzle-orm";
import { headers } from "next/headers";
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
import { orders, plans } from "@/lib/db/schema";
import { createPayPalOrder } from "@/lib/paypal";
import { limit, rateLimitResponse } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  planId: z.string().min(1).max(50),
  period: z.enum(["monthly", "yearly"]),
});

export async function POST(req: NextRequest) {
  try {
    const { session, ownerAccountId } = await requireSessionWithAccount();
    const rl = await limit("tokenCreate", `u:${ownerAccountId}`);
    if (!rl.ok) return rateLimitResponse(rl);

    const json = await parseJsonBody(req, 4096);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) return zodError(parsed.error);

    const [plan] = await db
      .select()
      .from(plans)
      .where(eq(plans.id, parsed.data.planId))
      .limit(1);
    if (!plan) return apiError("Plan not found", 404);
    if (!plan.isPurchasable)
      return apiError("Plan is not available for purchase", 400);

    const amountCents =
      parsed.data.period === "yearly"
        ? plan.priceYearlyCents
        : plan.priceMonthlyCents;
    if (amountCents <= 0) return apiError("Plan has no price set", 400);

    // Persist the intent first so we can cross-check on capture.
    const [orderRow] = await db
      .insert(orders)
      .values({
        ownerAccountId,
        userId: session.user.id,
        planId: plan.id,
        period: parsed.data.period,
        amountCents,
        paypalOrderId: "pending",
        status: "created",
      })
      .returning({ id: orders.id });

    const h = await headers();
    const proto = h.get("x-forwarded-proto") ?? "http";
    const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
    const origin = `${proto}://${host}`;

    const paypal = await createPayPalOrder({
      orderId: orderRow.id,
      ownerAccountId,
      userId: session.user.id,
      planId: plan.id,
      planName: plan.name,
      period: parsed.data.period,
      amountCents,
      returnUrl: `${origin}/billing/success`,
      cancelUrl: `${origin}/billing?cancelled=1`,
    });

    // Bind the PayPal order ID back to our row.
    await db
      .update(orders)
      .set({ paypalOrderId: paypal.paypalOrderId })
      .where(eq(orders.id, orderRow.id));

    return NextResponse.json({
      orderId: orderRow.id,
      paypalOrderId: paypal.paypalOrderId,
      status: paypal.status,
      approveUrl: paypal.approveUrl,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return unauthorized(err.message);
    console.error("[paypal/create-order]", err);
    return serverError(err);
  }
}
