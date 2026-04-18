import { Breadcrumbs } from "../../../_breadcrumbs";
import { AccountStatsClient } from "./_client";

export default function AdminAccountStatsPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Account-Stats" },
        ]}
      />
      <div>
        <h1 className="font-display text-3xl leading-tight">Account-Stats</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan-Verteilung, Team-Größen und die größten Teams im System.
        </p>
      </div>
      <AccountStatsClient />
    </div>
  );
}
