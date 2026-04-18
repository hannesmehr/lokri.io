import { Breadcrumbs } from "../../../_breadcrumbs";
import { StorageStatsClient } from "./_client";

export default function AdminStorageStatsPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Storage-Stats" },
        ]}
      />
      <div>
        <h1 className="font-display text-3xl leading-tight">Storage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Gesamt-Belegung, Pro-Provider-Aufteilung und die Accounts mit dem
          höchsten Storage-Verbrauch.
        </p>
      </div>
      <StorageStatsClient />
    </div>
  );
}
