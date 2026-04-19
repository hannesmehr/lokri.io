import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AuditExplorer } from "./_explorer";

/**
 * Audit-Viewer. Volltextsuche, Action/Actor/Account-Filter, Zeitraum,
 * Detail-Popup und CSV/JSON-Export. Events wachsen schnell — der
 * Hinweis oben weist auf die fehlende Retention-Policy hin.
 */
export default function AdminAuditPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "Audit" }]}
        title="Audit-Events"
        description="Sicherheitsrelevante Events systemweit. Jede Admin-Mutation schreibt hier einen `admin.*`-Eintrag."
      />
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
        Hinweis: Audit-Events werden aktuell unbegrenzt aufbewahrt.
        Retention-Policy ist geplant.
      </div>
      <AuditExplorer />
    </div>
  );
}
