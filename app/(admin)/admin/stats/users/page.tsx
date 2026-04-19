import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { UserStatsClient } from "./_client";

/**
 * Detail-Seite hinter der "User gesamt"-Kachel. Vertieft die Signups-,
 * Verifizierungs- und Activity-Metriken.
 */
export default function AdminUserStatsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "User-Stats" },
        ]}
        title="User-Stats"
        description="Signup-Kurve, Verifizierungsrate und Activity-Indikatoren. Retention-Cohorts sind noch nicht sauber berechenbar — siehe Hinweise unten."
      />
      <UserStatsClient />
    </div>
  );
}
