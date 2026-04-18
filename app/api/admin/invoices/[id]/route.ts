import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {
  ApiAuthError,
  authErrorResponse,
  notFound,
  serverError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import { invoices, orders, ownerAccounts, users } from "@/lib/db/schema";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminSession();
    const { id } = await params;

    const [row] = await db
      .select({
        invoice: invoices,
        ownerAccountName: ownerAccounts.name,
        ownerAccountType: ownerAccounts.type,
        userEmail: users.email,
        userName: users.name,
        orderStatus: orders.status,
        orderPeriod: orders.period,
        orderPlanId: orders.planId,
        orderPaypalOrderId: orders.paypalOrderId,
        orderStartsAt: orders.startsAt,
        orderExpiresAt: orders.expiresAt,
      })
      .from(invoices)
      .innerJoin(ownerAccounts, eq(ownerAccounts.id, invoices.ownerAccountId))
      .innerJoin(orders, eq(orders.id, invoices.orderId))
      .leftJoin(users, eq(users.id, invoices.userId))
      .where(eq(invoices.id, id))
      .limit(1);
    if (!row) return notFound();

    return NextResponse.json({
      invoice: {
        ...row.invoice,
        issuedAt: row.invoice.issuedAt.toISOString(),
        createdAt: row.invoice.createdAt.toISOString(),
      },
      ownerAccount: {
        id: row.invoice.ownerAccountId,
        name: row.ownerAccountName,
        type: row.ownerAccountType,
      },
      user: { email: row.userEmail, name: row.userName },
      order: {
        status: row.orderStatus,
        period: row.orderPeriod,
        planId: row.orderPlanId,
        paypalOrderId: row.orderPaypalOrderId,
        startsAt: row.orderStartsAt ? row.orderStartsAt.toISOString() : null,
        expiresAt: row.orderExpiresAt ? row.orderExpiresAt.toISOString() : null,
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.invoices.detail]", err);
    return serverError(err);
  }
}
