import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * KPI-Card — wiederverwendbarer Building-Block für Zahlen-Tiles.
 *
 * Drei Bausteine von oben nach unten:
 *   1. Eyebrow-Label (uppercase, small, muted)
 *   2. Hauptwert — groß, tabular-nums, eigene Zeile
 *   3. Optional Suffix (z.B. „von 20 GB") als eigene Zeile darunter —
 *      nicht baseline-inline, damit schmale Cards den Value nicht
 *      umbrechen („544.0" / „KB" auf zwei Zeilen war die Regression)
 *   4. Optional Progress-Bar mit kleinem Prozent-Label rechts
 *
 * Progress-Farbe wechselt bei >80 % auf Amber, bei >95 % auf Destructive
 * — die einzigen zwei legitimen Tailwind-Hardcoded-Farben im User-
 * Bereich, weil Warn-Signale semantisch und nicht dekorativ sind (siehe
 * `docs/DESIGN_SYSTEM.md`).
 *
 * Die Komponente ist deliberately stateless und Server-Component-
 * fähig — kein „use client"-Klammerteil, damit sie auch in Server-
 * Komponenten unter Dashboard/Admin gleich eingesetzt werden kann.
 */
interface Props {
  label: string;
  value: ReactNode;
  /** „von 20 GB", „Files", „Notes" etc. — steht rechts neben dem Wert. */
  valueSuffix?: ReactNode;
  /** Wenn gesetzt, rendert eine Progress-Bar unter dem Wert. */
  progress?: {
    used: number;
    max: number;
  };
  /** Zusätzliche Info-Zeile unter der Progress-Bar, z.B. „noch 12 MB übrig". */
  meta?: ReactNode;
  className?: string;
}

export function KpiCard({
  label,
  value,
  valueSuffix,
  progress,
  meta,
  className,
}: Props) {
  const pct =
    progress && progress.max > 0
      ? Math.min(100, (progress.used / progress.max) * 100)
      : null;

  const barColor =
    pct == null
      ? "bg-foreground/80"
      : pct > 95
        ? "bg-destructive"
        : pct > 80
          ? "bg-amber-500 dark:bg-amber-400"
          : "bg-foreground/80";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-4 transition-colors",
        className,
      )}
    >
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums leading-none">
        {value}
      </div>
      {valueSuffix ? (
        <div className="mt-1 font-mono text-xs text-muted-foreground">
          {valueSuffix}
        </div>
      ) : null}
      {pct != null ? (
        <div className="mt-4 space-y-1">
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(pct)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${label}: ${Math.round(pct)}% belegt`}
          >
            <div
              className={cn("h-full transition-all", barColor)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-end">
            <span className="font-mono text-[10px] text-muted-foreground">
              {Math.round(pct)}%
            </span>
          </div>
        </div>
      ) : null}
      {meta ? (
        <div className="mt-2 text-xs text-muted-foreground">{meta}</div>
      ) : null}
    </div>
  );
}
