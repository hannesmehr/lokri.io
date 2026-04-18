import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ApiAuthError,
  authErrorResponse,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import { invoices, ownerAccounts } from "@/lib/db/schema";

export const runtime = "nodejs";

const querySchema = z.object({
  q: z.string().trim().max(200).optional(),
  ownerAccountId: z.string().uuid().optional(),
  status: z.string().trim().max(30).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sort: z.enum(["issued", "amount"]).default("issued"),
  order: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * Admin-Liste aller Rechnungen. Suche matcht auf `invoice_number`,
 * `customer_email` oder `description`; Filter für Account, Status und
 * Zeitraum.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) return zodError(parsed.error);
    const q = parsed.data;

    const conditions = [];
    if (q.q) {
      const pattern = `%${q.q}%`;
      conditions.push(
        or(
          ilike(invoices.invoiceNumber, pattern),
          ilike(invoices.customerEmail, pattern),
          ilike(invoices.description, pattern),
        ),
      );
    }
    if (q.ownerAccountId)
      conditions.push(eq(invoices.ownerAccountId, q.ownerAccountId));
    if (q.status) conditions.push(eq(invoices.status, q.status));
    if (q.from) conditions.push(gte(invoices.issuedAt, new Date(q.from)));
    if (q.to) conditions.push(lte(invoices.issuedAt, new Date(q.to)));

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const orderCol =
      q.sort === "amount" ? invoices.grossCents : invoices.issuedAt;
    const orderExpr = q.order === "asc" ? orderCol : desc(orderCol);

    const offset = (q.page - 1) * q.pageSize;

    const [rows, [{ total }]] = await Promise.all([
      db
        .select({
          id: invoices.id,
          invoiceNumber: invoices.invoiceNumber,
          ownerAccountId: invoices.ownerAccountId,
          ownerAccountName: ownerAccounts.name,
          customerName: invoices.customerName,
          customerEmail: invoices.customerEmail,
          description: invoices.description,
          grossCents: invoices.grossCents,
          netCents: invoices.netCents,
          taxCents: invoices.taxCents,
          status: invoices.status,
          paymentMethod: invoices.paymentMethod,
          issuedAt: invoices.issuedAt,
        })
        .from(invoices)
        .innerJoin(
          ownerAccounts,
          eq(ownerAccounts.id, invoices.ownerAccountId),
        )
        .where(where)
        .orderBy(orderExpr)
        .limit(q.pageSize)
        .offset(offset),
      db
        .select({ total: sql<number>`count(*)::int` })
        .from(invoices)
        .where(where),
    ]);

    return NextResponse.json({
      invoices: rows.map((r) => ({
        ...r,
        issuedAt: r.issuedAt.toISOString(),
      })),
      total: Number(total),
      page: q.page,
      pageSize: q.pageSize,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.invoices.list]", err);
    return serverError(err);
  }
}
