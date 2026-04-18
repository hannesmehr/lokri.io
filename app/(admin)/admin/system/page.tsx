import { Breadcrumbs } from "../../_breadcrumbs";
import { SystemHealthClient } from "./_client";

/**
 * System-Health-Dashboard. Status der operativen Subsysteme +
 * Wartungs-Aktionen mit Dry-Run-Ansatz.
 */
export default function AdminSystemPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "System" }]} />
      <div>
        <h1 className="font-display text-3xl leading-tight">System-Health</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Operative Übersicht über PayPal-Reconcile-Stand,
          Storage-/Embedding-/DB-Metriken und Wartungs-Operationen.
        </p>
      </div>
      <SystemHealthClient />
    </div>
  );
}
