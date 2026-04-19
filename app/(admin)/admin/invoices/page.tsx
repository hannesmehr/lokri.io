import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { Button } from "@/components/ui/button";
import { InvoicesExplorer } from "./_explorer";

/**
 * Admin-Rechnungsliste. Alle Filter + Pagination laufen clientseitig.
 * Der Button rechts führt zum manuellen Team-Rechnungs-Wizard.
 */
export default function AdminInvoicesPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "Rechnungen" }]}
        title="Rechnungen"
        description="Alle Rechnungen im System mit Filter nach Status, Account und Zeitraum. PDF-Download ist admin-gatet."
        actions={
          <Button
            size="sm"
            nativeButton={false}
            render={<Link href="/admin/billing/new-team-invoice" />}
          >
            Team-Rechnung erstellen
          </Button>
        }
      />
      <InvoicesExplorer />
    </div>
  );
}
