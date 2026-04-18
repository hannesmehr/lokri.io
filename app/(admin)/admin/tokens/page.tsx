import { Breadcrumbs } from "../../_breadcrumbs";
import { TokensExplorer } from "./_explorer";

/**
 * Globaler Admin-Überblick über alle API-Tokens. Enthält den Bulk-
 * Revoke-Inaktive-Flow rechts oben.
 */
export default function AdminTokensPage() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "Tokens" }]} />
      <div>
        <h1 className="font-display text-3xl leading-tight">Token-Übersicht</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alle API-Tokens systemweit. Filter nach Status, Scope, Inaktivität.
          Einzel-Revoke pro Zeile, Bulk-Revoke für inaktive Tokens über den
          Wizard rechts.
        </p>
      </div>
      <TokensExplorer />
    </div>
  );
}
