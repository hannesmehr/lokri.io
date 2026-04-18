import { Breadcrumbs } from "../../../_breadcrumbs";
import { requireAdminSession } from "@/lib/api/session";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";
import { NewTeamInvoiceWizard } from "./_wizard";

/**
 * Admin-Flow zum manuellen Anlegen einer Team-Rechnung ohne PayPal.
 * Die Plan-Auswahl wird server-seitig vorgeladen; alles andere spielt
 * sich im Client-Wizard ab.
 */
export default async function NewTeamInvoicePage() {
  await requireAdminSession();

  const planRows = await db
    .select({
      id: plans.id,
      name: plans.name,
      isSeatBased: plans.isSeatBased,
      priceMonthlyCents: plans.priceMonthlyCents,
      priceYearlyCents: plans.priceYearlyCents,
      pricePerSeatMonthlyCents: plans.pricePerSeatMonthlyCents,
      pricePerSeatYearlyCents: plans.pricePerSeatYearlyCents,
    })
    .from(plans)
    .orderBy(plans.sortOrder);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Rechnungen", href: "/admin/invoices" },
          { label: "Team-Rechnung erstellen" },
        ]}
      />
      <div>
        <h1 className="font-display text-3xl leading-tight">
          Team-Rechnung erstellen
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Fünf Schritte: Account wählen, Parameter setzen, Preview prüfen,
          bestätigen, Ergebnis. Optional wird eine Mail mit PDF-Link an
          den Kunden geschickt.
        </p>
      </div>
      <NewTeamInvoiceWizard plans={planRows} />
    </div>
  );
}
