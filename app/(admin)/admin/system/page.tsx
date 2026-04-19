import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { SystemHealthClient } from "./_client";

/**
 * System-Health-Dashboard. Status der operativen Subsysteme +
 * Wartungs-Aktionen mit Dry-Run-Ansatz.
 */
export default function AdminSystemPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "System" }]}
        title="System-Health"
        description="Operative Übersicht über PayPal-Reconcile-Stand, Storage-/Embedding-/DB-Metriken und Wartungs-Operationen."
      />
      <SystemHealthClient />
    </div>
  );
}
