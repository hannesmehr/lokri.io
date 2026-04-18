import Link from "next/link";
import { Breadcrumbs } from "../../_breadcrumbs";
import { Button } from "@/components/ui/button";
import { InvoicesExplorer } from "./_explorer";

/**
 * Admin-Rechnungsliste. Alle Filter + Pagination laufen clientseitig.
 * Der Button rechts führt zum manuellen Team-Rechnungs-Wizard.
 */
export default function AdminInvoicesPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Rechnungen" }]} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl leading-tight">Rechnungen</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Alle Rechnungen im System mit Filter nach Status, Account und
            Zeitraum. PDF-Download ist admin-gatet.
          </p>
        </div>
        <Button
          size="sm"
          nativeButton={false}
          render={<Link href="/admin/billing/new-team-invoice" />}
        >
          Team-Rechnung erstellen
        </Button>
      </div>
      <InvoicesExplorer />
    </div>
  );
}
