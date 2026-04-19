import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { RevenueStatsClient } from "./_client";

export default function AdminRevenueStatsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/admin" },
          { label: "Revenue-Stats" },
        ]}
        title="Revenue"
        description="MRR-Entwicklung, Top-Kunden, Refund-Quote und CSV-Export für einen wählbaren Zeitraum."
      />
      <RevenueStatsClient />
    </div>
  );
}
