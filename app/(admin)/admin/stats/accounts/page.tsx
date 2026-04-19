import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AccountStatsClient } from "./_client";

export default function AdminAccountStatsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Account-Stats" },
        ]}
        title="Account-Stats"
        description="Plan-Verteilung, Team-Größen und die größten Teams im System."
      />
      <AccountStatsClient />
    </div>
  );
}
