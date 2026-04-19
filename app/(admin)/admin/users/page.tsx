import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { CreateUserButton } from "./_create-dialog";
import { UsersExplorer } from "./_explorer";

/**
 * Admin-Seite Benutzerliste. Kapselt nur Layout-Rand + Breadcrumbs;
 * die komplette Interaktion (Suche, Filter, SWR, Toggle, Pagination)
 * lebt im Client-Island `UsersExplorer`. Der „Neuer User"-Button rendert
 * über den `actions`-Slot von `AdminPageHeader` — Dialog + Team-Picker
 * wohnen in `_create-dialog.tsx`.
 */
export default function AdminUsersPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "User" }]}
        title="User-Verwaltung"
        description="Alle User im System. Suche über Email + Name, Filter für Admin-Status, Team-Ersteller und Verifizierung."
        actions={<CreateUserButton />}
      />
      <UsersExplorer />
    </div>
  );
}
