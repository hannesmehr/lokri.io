import { Breadcrumbs } from "../../_breadcrumbs";
import { AuditExplorer } from "./_explorer";

/**
 * Audit-Viewer. Volltextsuche, Action/Actor/Account-Filter, Zeitraum,
 * Detail-Popup und CSV/JSON-Export. Events wachsen schnell — der
 * Hinweis oben weist auf die fehlende Retention-Policy hin.
 */
export default function AdminAuditPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Audit" }]} />
      <div>
        <h1 className="font-display text-3xl leading-tight">Audit-Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sicherheitsrelevante Events systemweit. Jede Admin-Mutation
          schreibt hier einen `admin.*`-Eintrag.
        </p>
      </div>
      <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-xs text-amber-900 dark:text-amber-100">
        Hinweis: Audit-Events werden aktuell unbegrenzt aufbewahrt.
        Retention-Policy ist geplant.
      </div>
      <AuditExplorer />
    </div>
  );
}
