import { Loader2, TrendingDown, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * AdminKpiTile — klickbare Admin-KPI-Kachel mit Delta-Indikator.
 *
 * Unterschied zur User-`<KpiCard>`:
 *   - `href` statt static: Tile ist Drill-Down-Link, kein reines Info-
 *     Panel
 *   - `delta` + `deltaDirection`: Trend-Anzeige statt Progress-Bar
 *   - Kompakter: `text-2xl` statt `text-3xl`, Admin-Dichte
 *
 * Hover: subtile Border-Color, kein Shadow, kein Lift. Identisch zum
 * User-Scope-Hover-Pattern (siehe `docs/DESIGN_SYSTEM.md`).
 */
interface Props {
  href: string;
  icon: ReactNode;
  label: string;
  value: string | null;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  loading?: boolean;
  className?: string;
}

export function AdminKpiTile({
  href,
  icon,
  label,
  value,
  delta,
  deltaDirection = "flat",
  loading,
  className,
}: Props) {
  const deltaColor =
    deltaDirection === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : deltaDirection === "down"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums leading-none">
        {loading ? (
          <Loader2
            aria-label="Lädt"
            className="h-6 w-6 animate-spin text-muted-foreground"
          />
        ) : value == null ? (
          "—"
        ) : (
          value
        )}
      </div>
      {delta ? (
        <div
          className={cn(
            "mt-2 inline-flex items-center gap-1 text-xs",
            deltaColor,
          )}
        >
          {deltaDirection === "up" ? (
            <TrendingUp className="h-3 w-3" />
          ) : deltaDirection === "down" ? (
            <TrendingDown className="h-3 w-3" />
          ) : null}
          {delta}
        </div>
      ) : null}
    </Link>
  );
}
