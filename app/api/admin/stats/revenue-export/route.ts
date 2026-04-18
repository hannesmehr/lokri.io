import { and, eq, gte, lte } from "drizzle-orm";
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
  from: z.string().datetime(),
  to: z.string().datetime(),
  status: z.string().trim().max(30).optional(),
});

/**
 * CSV-Export aller Rechnungen im angegebenen Zeitraum. Spaltenformat
 * ist deutsch-lesbar (";" als Separator, Komma als Dezimaltrenner —
 * Excel-DE-kompatibel).
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdminSession();
    const parsed = querySchema.safeParse(
      Object.fromEntries(req.nextUrl.searchParams),
    );
    if (!parsed.success) return zodError(parsed.error);
    const { from, to, status } = parsed.data;

    const conditions = [
      gte(invoices.issuedAt, new Date(from)),
      lte(invoices.issuedAt, new Date(to)),
    ];
    if (status) conditions.push(eq(invoices.status, status));

    const rows = await db
      .select({
        invoiceNumber: invoices.invoiceNumber,
        ownerAccountId: invoices.ownerAccountId,
        ownerAccountName: ownerAccounts.name,
        customerEmail: invoices.customerEmail,
        description: invoices.description,
        netCents: invoices.netCents,
        taxCents: invoices.taxCents,
        grossCents: invoices.grossCents,
        paymentMethod: invoices.paymentMethod,
        status: invoices.status,
        issuedAt: invoices.issuedAt,
      })
      .from(invoices)
      .innerJoin(ownerAccounts, eq(ownerAccounts.id, invoices.ownerAccountId))
      .where(and(...conditions))
      .orderBy(invoices.issuedAt);

    const header = [
      "Nummer",
      "Datum",
      "Account",
      "Kunde",
      "Beschreibung",
      "Netto (EUR)",
      "USt. (EUR)",
      "Brutto (EUR)",
      "Zahlungsart",
      "Status",
    ].join(";");

    const lines = rows.map((r) => {
      const euros = (c: number) => (c / 100).toFixed(2).replace(".", ",");
      const esc = (v: string) => {
        // CSV-quote nur wenn nötig (enthält ; " oder \n)
        if (/[;"\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
        return v;
      };
      return [
        r.invoiceNumber,
        r.issuedAt.toLocaleDateString("de-DE"),
        esc(r.ownerAccountName),
        esc(r.customerEmail),
        esc(r.description),
        euros(r.netCents),
        euros(r.taxCents),
        euros(r.grossCents),
        r.paymentMethod,
        r.status,
      ].join(";");
    });

    const csv = "\uFEFF" + [header, ...lines].join("\r\n"); // UTF-8 BOM für Excel
    const filename = `umsatz_${from.slice(0, 10)}_${to.slice(0, 10)}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="${filename}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.stats.revenue-export]", err);
    return serverError(err);
  }
}
