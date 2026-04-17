import { put } from "@vercel/blob";
import { desc, sql } from "drizzle-orm";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { db } from "./db";
import { invoices } from "./db/schema";

/**
 * Invoice generation. Sequential numbering per year (`LK-2026-0001`),
 * PDF via pdf-lib, upload to Vercel Blob (private), metadata row in DB.
 *
 * This module is deliberately self-contained — orders route imports just
 * `createInvoice({...})`, gets back the row.
 */

const TAX_RATE = Number(process.env.INVOICE_TAX_RATE ?? "0.19");

function euro(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",") + " €";
}

// ---- Invoice number ---------------------------------------------------------

async function nextInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LK-${year}-`;
  const [row] = await db
    .select({ invoiceNumber: invoices.invoiceNumber })
    .from(invoices)
    .where(sql`${invoices.invoiceNumber} LIKE ${prefix + "%"}`)
    .orderBy(desc(invoices.invoiceNumber))
    .limit(1);
  let n = 1;
  if (row) {
    const parsed = parseInt(row.invoiceNumber.replace(prefix, ""), 10);
    if (!Number.isNaN(parsed)) n = parsed + 1;
  }
  return `${prefix}${String(n).padStart(4, "0")}`;
}

// ---- PDF --------------------------------------------------------------------

interface PdfInput {
  invoiceNumber: string;
  issuedAt: Date;
  customerName: string;
  customerEmail: string;
  description: string;
  netCents: number;
  taxCents: number;
  grossCents: number;
  taxRate: number;
  paymentMethod: string;
  payerEmail: string | null;
}

async function renderPdf(input: PdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]); // A4 portrait
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const BLACK = rgb(0, 0, 0);
  const GREY = rgb(0.45, 0.45, 0.45);
  const BRAND = rgb(0.39, 0.4, 0.95); // indigo-ish

  const issuer = {
    name: process.env.INVOICE_COMPANY_NAME ?? "lokri.io",
    street: process.env.INVOICE_STREET ?? "",
    city: process.env.INVOICE_CITY ?? "",
    country: process.env.INVOICE_COUNTRY ?? "",
    email: process.env.INVOICE_EMAIL ?? "",
    taxId: process.env.INVOICE_TAX_ID ?? "",
    bankName: process.env.INVOICE_BANK_NAME ?? "",
    iban: process.env.INVOICE_IBAN ?? "",
    bic: process.env.INVOICE_BIC ?? "",
  };

  let y = 800;
  const left = 50;
  const right = 545;

  // ── Header: brand mark
  page.drawRectangle({
    x: left,
    y: y - 8,
    width: 18,
    height: 18,
    color: BRAND,
  });
  page.drawText("l", {
    x: left + 6,
    y: y - 4,
    size: 14,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("lokri.io", {
    x: left + 28,
    y: y - 4,
    size: 14,
    font: bold,
    color: BLACK,
  });

  // ── Issuer block (right aligned)
  const issuerLines = [
    issuer.name,
    issuer.street,
    issuer.city,
    issuer.country,
    issuer.email,
  ].filter(Boolean);
  issuerLines.forEach((line, i) => {
    const text = String(line);
    const width = font.widthOfTextAtSize(text, 9);
    page.drawText(text, {
      x: right - width,
      y: y - i * 11,
      size: 9,
      font,
      color: GREY,
    });
  });

  y -= 80;

  // ── Customer
  page.drawText("Rechnungsempfänger", {
    x: left,
    y,
    size: 9,
    font,
    color: GREY,
  });
  y -= 14;
  page.drawText(input.customerName, {
    x: left,
    y,
    size: 11,
    font: bold,
    color: BLACK,
  });
  y -= 13;
  page.drawText(input.customerEmail, { x: left, y, size: 10, font, color: BLACK });

  // ── Invoice meta (right)
  const metaLines: Array<[string, string]> = [
    ["Rechnungs-Nr.", input.invoiceNumber],
    ["Datum", input.issuedAt.toLocaleDateString("de-DE")],
    ["Zahlungsart", input.paymentMethod.toUpperCase()],
  ];
  let metaY = y + 27;
  for (const [k, v] of metaLines) {
    const vw = font.widthOfTextAtSize(v, 10);
    page.drawText(k, {
      x: right - 180,
      y: metaY,
      size: 9,
      font,
      color: GREY,
    });
    page.drawText(v, { x: right - vw, y: metaY, size: 10, font, color: BLACK });
    metaY -= 14;
  }

  y -= 50;

  // ── Title
  page.drawText("Rechnung", { x: left, y, size: 22, font: bold, color: BLACK });
  y -= 30;

  // ── Line items header
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 16;
  page.drawText("Beschreibung", { x: left, y, size: 9, font, color: GREY });
  page.drawText("Netto", { x: right - 230, y, size: 9, font, color: GREY });
  page.drawText("USt.", { x: right - 140, y, size: 9, font, color: GREY });
  page.drawText("Brutto", { x: right - 55, y, size: 9, font, color: GREY });
  y -= 16;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 20;

  // ── Line item
  page.drawText(input.description, {
    x: left,
    y,
    size: 11,
    font,
    color: BLACK,
  });
  const netStr = euro(input.netCents);
  const taxStr = euro(input.taxCents);
  const grossStr = euro(input.grossCents);
  page.drawText(netStr, {
    x: right - 230 + 85 - font.widthOfTextAtSize(netStr, 10),
    y,
    size: 10,
    font,
    color: BLACK,
  });
  page.drawText(taxStr, {
    x: right - 140 + 85 - font.widthOfTextAtSize(taxStr, 10),
    y,
    size: 10,
    font,
    color: BLACK,
  });
  page.drawText(grossStr, {
    x: right - font.widthOfTextAtSize(grossStr, 10),
    y,
    size: 10,
    font: bold,
    color: BLACK,
  });

  y -= 36;
  page.drawLine({
    start: { x: left, y },
    end: { x: right, y },
    thickness: 0.5,
    color: rgb(0.85, 0.85, 0.85),
  });
  y -= 20;

  // ── Summary (right column)
  const summary: Array<[string, string, boolean]> = [
    ["Zwischensumme", netStr, false],
    [
      input.taxRate > 0
        ? `USt. (${(input.taxRate * 100).toFixed(0)}%)`
        : "USt.",
      taxStr,
      false,
    ],
    ["Gesamtbetrag", grossStr, true],
  ];
  for (const [k, v, strong] of summary) {
    const vw = font.widthOfTextAtSize(v, strong ? 12 : 10);
    page.drawText(k, {
      x: right - 200,
      y,
      size: strong ? 11 : 10,
      font: strong ? bold : font,
      color: BLACK,
    });
    page.drawText(v, {
      x: right - vw,
      y,
      size: strong ? 12 : 10,
      font: strong ? bold : font,
      color: BLACK,
    });
    y -= strong ? 22 : 16;
  }

  y -= 10;

  if (input.taxRate === 0) {
    page.drawText(
      "Gemäß § 19 UStG wird keine Umsatzsteuer ausgewiesen (Kleinunternehmerregelung).",
      { x: left, y, size: 9, font, color: GREY },
    );
    y -= 16;
  }

  page.drawText(
    input.paymentMethod === "paypal"
      ? `Bezahlt via PayPal${input.payerEmail ? ` (${input.payerEmail})` : ""}.`
      : `Bezahlt via ${input.paymentMethod}.`,
    { x: left, y, size: 9, font, color: GREY },
  );

  // ── Footer
  const footerLines = [
    [issuer.name, issuer.taxId ? `USt-IdNr.: ${issuer.taxId}` : null]
      .filter(Boolean)
      .join("  ·  "),
    [issuer.street, issuer.city, issuer.country].filter(Boolean).join("  ·  "),
    [
      issuer.email,
      issuer.bankName,
      issuer.iban ? `IBAN ${issuer.iban}` : null,
      issuer.bic ? `BIC ${issuer.bic}` : null,
    ]
      .filter(Boolean)
      .join("  ·  "),
  ].filter((l) => l.length > 0);
  let footerY = 60;
  for (const line of footerLines) {
    page.drawText(line, { x: left, y: footerY, size: 8, font, color: GREY });
    footerY -= 11;
  }

  return await pdf.save();
}

// ---- Main create ------------------------------------------------------------

export interface CreateInvoiceInput {
  orderId: string;
  ownerAccountId: string;
  userId: string;
  customerName: string;
  customerEmail: string;
  description: string;
  /** Gross amount (what the customer actually paid) in EUR cents. */
  grossCents: number;
  paymentId: string; // PayPal Capture ID
  paymentMethod?: string;
  payerEmail?: string | null;
}

/**
 * Generate a fresh invoice: allocate a number, render the PDF, upload to
 * Vercel Blob (private), persist the row. Retry-safe on unique-number
 * collisions (rare under parallel captures) up to 3 attempts.
 */
export async function createInvoice(input: CreateInvoiceInput) {
  const taxRate = TAX_RATE;
  // Gross → net split (PayPal always quotes gross in our flow).
  const grossCents = input.grossCents;
  const netCents = Math.round(grossCents / (1 + taxRate));
  const taxCents = grossCents - netCents;

  const issuedAt = new Date();
  const paymentMethod = input.paymentMethod ?? "paypal";

  // Allocate + insert up to 3 times (handles number collisions)
  let attempt = 0;
  while (attempt < 3) {
    attempt++;
    const invoiceNumber = await nextInvoiceNumber();

    const pdfBytes = await renderPdf({
      invoiceNumber,
      issuedAt,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      description: input.description,
      netCents,
      taxCents,
      grossCents,
      taxRate,
      paymentMethod,
      payerEmail: input.payerEmail ?? null,
    });

    const blobKey = `invoices/${input.ownerAccountId}/${invoiceNumber}.pdf`;
    const blob = await put(blobKey, Buffer.from(pdfBytes), {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
      allowOverwrite: true,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    try {
      const [row] = await db
        .insert(invoices)
        .values({
          invoiceNumber,
          orderId: input.orderId,
          ownerAccountId: input.ownerAccountId,
          userId: input.userId,
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          description: input.description,
          netCents,
          taxCents,
          grossCents,
          taxRateBp: Math.round(taxRate * 10000),
          storageKey: blob.pathname,
          paymentId: input.paymentId,
          paymentMethod,
          status: "paid",
          issuedAt,
        })
        .returning();
      return row;
    } catch (err) {
      // Unique violation on invoice_number → retry with fresh allocation.
      const msg = err instanceof Error ? err.message : "";
      if (/unique|duplicate/i.test(msg) && attempt < 3) continue;
      throw err;
    }
  }
  throw new Error("Invoice creation failed after 3 attempts.");
}
