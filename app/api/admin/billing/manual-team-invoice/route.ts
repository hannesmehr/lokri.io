import { eq } from "drizzle-orm";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  ApiAuthError,
  apiError,
  authErrorResponse,
  parseJsonBody,
  serverError,
  zodError,
} from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { logAdminActionOnAccount } from "@/lib/admin/audit";
import { db } from "@/lib/db";
import {
  ownerAccountMembers,
  ownerAccounts,
  orders,
  plans,
  users,
} from "@/lib/db/schema";
import { createInvoice } from "@/lib/invoices";
import { sendMail } from "@/lib/mailer";

export const runtime = "nodejs";

const TAX_RATE = Number(process.env.INVOICE_TAX_RATE ?? "0.19");

const createSchema = z.object({
  mode: z.enum(["preview", "commit"]),
  ownerAccountId: z.string().uuid(),
  planId: z.string().trim().min(1).max(50),
  period: z.enum(["monthly", "yearly"]),
  grossCents: z.number().int().min(0).max(1_000_000_00),
  description: z.string().trim().min(3).max(300),
  customerName: z.string().trim().min(1).max(200),
  customerEmail: z.string().email(),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional(),
  /** Wer soll als User in der Order stehen (für Audit + FK). Default:
   *  der Owner des Teams. */
  invoiceUserId: z.string().optional(),
  sendEmail: z.boolean().default(false),
  extendPlanExpiry: z.boolean().default(true),
});

/**
 * Manueller Team-Rechnungs-Wizard.
 *
 * `mode: "preview"` rechnet nur die Brutto/Netto-Splits und prüft
 * Plan-/Account-Konsistenz; `mode: "commit"` legt einen Order-Eintrag
 * (paymentMethod `manual`, status `captured`) an, erzeugt die Rechnung
 * via `createInvoice`, bumpt optional `plan_expires_at` und schickt
 * optional die PDF-Link-Mail an den Kunden.
 *
 * Team-Plans gehen nicht durch den PayPal-Flow — dieser Endpoint ist
 * die offizielle Brücke, um einen "wir haben eine Überweisung
 * bekommen"-Vorgang sauber abzubilden.
 */
export async function POST(req: NextRequest) {
  try {
    const { userId: actorId } = await requireAdminSession();
    const body = await parseJsonBody(req);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return zodError(parsed.error);
    const input = parsed.data;

    const [account] = await db
      .select({
        id: ownerAccounts.id,
        name: ownerAccounts.name,
        type: ownerAccounts.type,
        planId: ownerAccounts.planId,
        planExpiresAt: ownerAccounts.planExpiresAt,
      })
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, input.ownerAccountId))
      .limit(1);
    if (!account) {
      return apiError("Account nicht gefunden.", 404);
    }
    if (account.type !== "team") {
      return apiError(
        "Der manuelle Rechnungs-Flow ist nur für Team-Accounts gedacht.",
        400,
      );
    }

    const [plan] = await db
      .select({ id: plans.id, name: plans.name, isSeatBased: plans.isSeatBased })
      .from(plans)
      .where(eq(plans.id, input.planId))
      .limit(1);
    if (!plan) return apiError(`Unbekannter Plan: ${input.planId}`, 400);

    // Wer ist der User für die Order/Invoice? Entweder explizit gesetzt
    // oder der aktuelle Owner des Teams. Fällt kein Owner auf, bricht ab
    // (ein Team ohne Owner wäre ein Datenfehler).
    let invoiceUserId = input.invoiceUserId;
    if (!invoiceUserId) {
      const [owner] = await db
        .select({ userId: ownerAccountMembers.userId })
        .from(ownerAccountMembers)
        .where(eq(ownerAccountMembers.ownerAccountId, input.ownerAccountId))
        .limit(1);
      if (!owner) {
        return apiError(
          "Kein Team-Mitglied gefunden — Owner muss als `invoiceUserId` gesetzt werden.",
          400,
        );
      }
      invoiceUserId = owner.userId;
    } else {
      const [u] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, invoiceUserId))
        .limit(1);
      if (!u) return apiError("Unbekannte invoiceUserId.", 400);
    }

    const grossCents = input.grossCents;
    const netCents = Math.round(grossCents / (1 + TAX_RATE));
    const taxCents = grossCents - netCents;

    if (input.mode === "preview") {
      return NextResponse.json({
        ok: true,
        preview: {
          account: {
            id: account.id,
            name: account.name,
            currentPlan: account.planId,
            currentExpiry: account.planExpiresAt?.toISOString() ?? null,
          },
          plan: { id: plan.id, name: plan.name },
          period: input.period,
          grossCents,
          netCents,
          taxCents,
          taxRate: TAX_RATE,
          description: input.description,
          customer: {
            name: input.customerName,
            email: input.customerEmail,
          },
          newPlanExpiry: input.extendPlanExpiry
            ? (input.expiresAt ?? null)
            : null,
          sendEmail: input.sendEmail,
          invoiceUserId,
        },
      });
    }

    // Commit: Order + Invoice + optional expiry-bump + optional mail.
    const startsAt = input.startsAt ? new Date(input.startsAt) : new Date();
    const defaultExpiry = (() => {
      const d = new Date(startsAt);
      if (input.period === "yearly") d.setFullYear(d.getFullYear() + 1);
      else d.setMonth(d.getMonth() + 1);
      return d;
    })();
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : defaultExpiry;

    // paymentId muss unique sein — wir generieren einen manuellen
    // Präfix-basierten Identifier, der nie mit PayPal-Capture-IDs kollidiert.
    const manualPaymentId = `manual-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    const [orderRow] = await db
      .insert(orders)
      .values({
        ownerAccountId: account.id,
        userId: invoiceUserId,
        planId: plan.id,
        period: input.period,
        amountCents: grossCents,
        paypalOrderId: `MANUAL-${manualPaymentId}`,
        paymentId: manualPaymentId,
        status: "captured",
        capturedAt: new Date(),
        startsAt,
        expiresAt,
      })
      .returning();

    const invoiceRow = await createInvoice({
      orderId: orderRow.id,
      ownerAccountId: account.id,
      userId: invoiceUserId,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      description: input.description,
      grossCents,
      paymentId: manualPaymentId,
      paymentMethod: "manual",
      payerEmail: input.customerEmail,
    });

    if (input.extendPlanExpiry) {
      // Analog zum PayPal-Capture: Expiry wird vom späteren der beiden
      // Zeitpunkte (alt / neu) weitergetragen — Grace-Stacking.
      const newExpiry =
        account.planExpiresAt && account.planExpiresAt > expiresAt
          ? account.planExpiresAt
          : expiresAt;
      await db
        .update(ownerAccounts)
        .set({
          planId: plan.id,
          planExpiresAt: newExpiry,
          planRenewedAt: new Date(),
        })
        .where(eq(ownerAccounts.id, account.id));
    }

    await logAdminActionOnAccount({
      actorAdminUserId: actorId,
      ownerAccountId: account.id,
      action: "admin.billing.manual_invoice_created",
      targetType: "invoice",
      targetId: invoiceRow.id,
      metadata: {
        invoiceNumber: invoiceRow.invoiceNumber,
        planId: plan.id,
        period: input.period,
        grossCents,
        sendEmail: input.sendEmail,
        extendedExpiry: input.extendPlanExpiry,
      },
    });

    let emailSent = false;
    if (input.sendEmail) {
      try {
        const origin =
          process.env.NEXT_PUBLIC_APP_URL ?? "https://lokri.io";
        const pdfUrl = `${origin}/api/invoices/${invoiceRow.id}/pdf`;
        await sendMail({
          to: input.customerEmail,
          subject: `Deine lokri.io-Rechnung ${invoiceRow.invoiceNumber}`,
          text:
            `Hallo ${input.customerName},\n\n` +
            `vielen Dank — deine Rechnung zu "${input.description}" ist angelegt.\n\n` +
            `Rechnungsnummer: ${invoiceRow.invoiceNumber}\n` +
            `Betrag: ${(grossCents / 100).toFixed(2).replace(".", ",")} €\n` +
            `PDF: ${pdfUrl}\n\n` +
            `Das Team von lokri.io`,
          html:
            `<p>Hallo ${input.customerName},</p>` +
            `<p>vielen Dank — deine Rechnung zu "<strong>${input.description}</strong>" ist angelegt.</p>` +
            `<ul><li><strong>Rechnungsnummer:</strong> ${invoiceRow.invoiceNumber}</li>` +
            `<li><strong>Betrag:</strong> ${(grossCents / 100).toFixed(2).replace(".", ",")} €</li></ul>` +
            `<p><a href="${pdfUrl}">Rechnung als PDF öffnen</a></p>` +
            `<p>— Das Team von lokri.io</p>`,
        });
        emailSent = true;
      } catch (err) {
        console.error(
          "[admin.billing.manual-team-invoice] mail failed:",
          err,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      invoiceId: invoiceRow.id,
      invoiceNumber: invoiceRow.invoiceNumber,
      orderId: orderRow.id,
      emailSent,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return authErrorResponse(err);
    console.error("[admin.billing.manual-team-invoice]", err);
    return serverError(err);
  }
}
