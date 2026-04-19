import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AccountsExplorer } from "./_explorer";

/**
 * Admin-Seite Owner-Account-Liste. Zeigt Personal- und Team-Accounts
 * mit Plan, Member-Zahl und belegtem Speicher. Interaktion ist rein
 * client-seitig über SWR.
 */
export default function AdminAccountsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "Accounts" }]}
        title="Account-Verwaltung"
        description="Alle Owner-Accounts — Personal und Team. Filter nach Typ und Plan, Detailansicht erlaubt Plan-Wechsel und Quota-Overrides."
      />
      <AccountsExplorer />
    </div>
  );
}
