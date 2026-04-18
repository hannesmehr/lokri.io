import { Breadcrumbs } from "../_breadcrumbs";
import { AdminDashboardHome } from "./_home";

/**
 * Admin-Dashboard-Home (Part 2). KPIs + Charts werden client-seitig
 * über die Stats-APIs geladen — der Server liefert nur den Breadcrumb-
 * Rahmen.
 */
export default function AdminHomePage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Dashboard" }]} />
      <AdminDashboardHome />
    </div>
  );
}
