import { Breadcrumbs } from "../../_breadcrumbs";
import { AccountsExplorer } from "./_explorer";

/**
 * Admin-Seite Owner-Account-Liste. Zeigt Personal- und Team-Accounts
 * mit Plan, Member-Zahl und belegtem Speicher. Interaktion ist rein
 * client-seitig über SWR.
 */
export default function AdminAccountsPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Accounts" }]} />
      <div>
        <h1 className="font-display text-3xl leading-tight">Account-Verwaltung</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alle Owner-Accounts — Personal und Team. Filter nach Typ und Plan,
          Detailansicht erlaubt Plan-Wechsel und Quota-Overrides.
        </p>
      </div>
      <AccountsExplorer />
    </div>
  );
}
