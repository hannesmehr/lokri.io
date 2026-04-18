import { and, eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import {  authErrorResponse,
 notFound, serverError} from "@/lib/api/errors";
import { ApiAuthError, requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { invoices } from "@/lib/db/schema";
import { getStorageProvider } from "@/lib/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/** Session-gated proxy for the private invoice PDF in Vercel Blob. */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { ownerAccountId } = await requireSessionWithAccount({ minRole: "owner" });
    const { id } = await params;

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.id, id),
          eq(invoices.ownerAccountId, ownerAccountId),
        ),
      )
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
        "cache-control": "private, no-store"}});
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    return serverError(err);
  }
}
