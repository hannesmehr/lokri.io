import {
  AdminStatusBadge,
  type AdminBadgeVariant,
} from "./admin-status-badge";

/**
 * AdminActionBadge — Mono-Badge für Audit-Event-Action-Strings.
 *
 * Dünner Wrapper über `<AdminStatusBadge>` mit Variant-Auswahl basierend
 * auf dem Action-Prefix:
 *   - `admin.*`   → warning (Admin-Aktion, erhöhte Aufmerksamkeit)
 *   - `login.*`   → info (Login-Event, neutral-positiv)
 *   - sonst       → neutral
 *
 * Font ist immer mono (`font-mono`), weil Action-Strings strukturiert
 * sind (`admin.user.disabled`, `login.success`, `team.member.removed`)
 * und Operatoren Patterns in Mono schneller scannen.
 */
export function AdminActionBadge({ action }: { action: string }) {
  const variant: AdminBadgeVariant = action.startsWith("admin.")
    ? "warning"
    : action.startsWith("login.")
      ? "info"
      : "neutral";
  return (
    <AdminStatusBadge variant={variant} mono>
      {action}
    </AdminStatusBadge>
  );
}
