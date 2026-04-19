import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { StorageStatsClient } from "./_client";

export default function AdminStorageStatsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Storage-Stats" },
        ]}
        title="Storage"
        description="Gesamt-Belegung, Pro-Provider-Aufteilung und die Accounts mit dem höchsten Storage-Verbrauch."
      />
      <StorageStatsClient />
    </div>
  );
}
