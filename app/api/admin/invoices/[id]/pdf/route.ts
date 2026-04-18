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
import { invoices } from "@/lib/db/schema";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Admin-gated PDF-Download. Unterscheidet sich nur durch den Admin-Guard
 * vom Kunden-Endpoint — das User-Routing in `/api/invoices/[id]/pdf`
 * erzwingt `ownerAccountId == session.ownerAccountId`, hier reicht die
 * Admin-Rolle.
 */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireAdminSession();
    const { id } = await params;

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, id))
      .limit(1);
    if (!invoice) return notFound();

    const provider = getStorageProvider();
    const { content } = await provider.get(invoice.storageKey);

    return new NextResponse(content as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-length": String(content.byteLength),
        "content-disposition": `inline; filename="${invoice.invoiceNumber}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.invoices.pdf]", err);
    return serverError(err);
  }
}
