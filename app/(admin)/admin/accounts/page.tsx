import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CreateAccountButton } from "./_create-dialog";
import { AccountsExplorer } from "./_explorer";

/**
 * Admin-Seite Owner-Account-Liste. Zeigt Personal- und Team-Accounts
 * mit Plan, Member-Zahl und belegtem Speicher. Interaktion ist rein
 * client-seitig über SWR.
 *
 * Der „Neuer Team-Account"-Button sitzt im `actions`-Slot von
 * `AdminPageHeader`; der Dialog + Owner-Picker + Quota-Override-Form
 * wohnen in `_create-dialog.tsx`.
 */
export default function AdminAccountsPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "Accounts" }]}
        title="Account-Verwaltung"
        description="Alle Owner-Accounts — Personal und Team. Filter nach Typ und Plan, Detailansicht erlaubt Plan-Wechsel und Quota-Overrides."
        actions={<CreateAccountButton />}
      />
      <AccountsExplorer />
    </div>
  );
}
