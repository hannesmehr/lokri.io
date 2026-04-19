import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * AdminHealthTile — Warn-/OK-Kachel für System-Health.
 *
 * Andere Semantik als `<AdminKpiTile>`:
 *   - Kein Link (Health ist Status, kein Drill-Down)
 *   - Warn-Predicate entscheidet Icon + Border-Tint
 *   - Zahlenwert-fokussiert, ohne Delta
 *
 * Border + Icon werden über den Status-Warn-Zustand eingefärbt:
 *   - warn === false → CheckCircle2 in emerald, neutrale Border
 *   - warn === true  → AlertTriangle in amber, amber-getönte Border
 *
 * Das ist eine der wenigen Stellen, an denen funktionale Farben im
 * Admin direkt ins Layout gehen (nicht nur in Badges) — weil die
 * Warn-Signalwirkung hier zentral ist.
 */
interface Props {
  label: string;
  value: number | string | undefined;
  /** True = Warning-Zustand, orange getönte Border + AlertTriangle. */
  warn?: boolean;
  className?: string;
}

export function AdminHealthTile({ label, value, warn, className }: Props) {
  return (
    <div
      className={cn(
        "rounded-md border p-3 bg-card",
        warn && "border-amber-500/40 bg-amber-500/5",
        className,
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {warn ? (
          <AlertTriangle className="h-3 w-3 text-amber-600 dark:text-amber-400" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
        )}
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value === undefined ? "—" : value}
      </div>
    </div>
  );
}
