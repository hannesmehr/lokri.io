import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { TokensExplorer } from "./_explorer";

/**
 * Globaler Admin-Überblick über alle API-Tokens. Enthält den Bulk-
 * Revoke-Inaktive-Flow rechts oben.
 */
export default function AdminTokensPage() {
  return (
    <div className="space-y-6">
      <AdminPageHeader
        breadcrumbs={[{ label: "Tokens" }]}
        title="Token-Übersicht"
        description="Alle API-Tokens systemweit. Filter nach Status, Scope, Inaktivität. Einzel-Revoke pro Zeile, Bulk-Revoke für inaktive Tokens über den Wizard rechts."
      />
      <TokensExplorer />
    </div>
  );
}
