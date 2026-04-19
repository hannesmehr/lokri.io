import { AdminDashboardHome } from "./_home";

/**
 * Admin-Dashboard-Home. KPIs + Charts werden client-seitig über die
 * Stats-APIs geladen; der Server rendert nur den Einstieg. Breadcrumbs
 * + Page-Header liegen im Client-Island (`<AdminPageHeader>`).
 */
export default function AdminHomePage() {
  return <AdminDashboardHome />;
}
