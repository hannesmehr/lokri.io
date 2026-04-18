import { Breadcrumbs } from "../../../_breadcrumbs";
import { UserStatsClient } from "./_client";

/**
 * Detail-Seite hinter der "User gesamt"-Kachel. Vertieft die Signups-,
 * Verifizierungs- und Activity-Metriken.
 */
export default function AdminUserStatsPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "User-Stats" },
        ]}
      />
      <div>
        <h1 className="font-display text-3xl leading-tight">User-Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Signup-Kurve, Verifizierungsrate und Activity-Indikatoren. Retention-
          Cohorts sind noch nicht sauber berechenbar — siehe Hinweise unten.
        </p>
      </div>
      <UserStatsClient />
    </div>
  );
}
