import { Breadcrumbs } from "../../../_breadcrumbs";
import { RevenueStatsClient } from "./_client";

export default function AdminRevenueStatsPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/admin" },
          { label: "Revenue-Stats" },
        ]}
      />
      <div>
        <h1 className="font-display text-3xl leading-tight">Revenue</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          MRR-Entwicklung, Top-Kunden, Refund-Quote und CSV-Export für einen
          wählbaren Zeitraum.
        </p>
      </div>
      <RevenueStatsClient />
    </div>
  );
}
