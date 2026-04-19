import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * WidgetCard — kompakte Info-Card für Landing-Dashboards.
 *
 * Pattern: Label (kleiner Uppercase-Kopf) + Value (große Zahl/Text) +
 * optional Hint + optional Action. Gedacht für den `/settings/general`-
 * und `/team`-Widget-Grid (siehe `docs/USER_SETTINGS_DESIGN.md`).
 *
 * Analog zu `AdminKpiTile` aus dem Admin-Scope, aber mit User-Scope-
 * Typografie (größer, zurückhaltender). Unterschied zu einer normalen
 * Card: WidgetCard hat keine separate `CardTitle` — der Label-Style ist
 * bewusst klein und uppercase (Dashboard-Metrik-Look).
 *
 * Grid-Nutzung:
 *
 *     <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>*]:h-full">
 *       <WidgetCard label="Plan" value="Team" hint="Abrechnungs-Tier" action={...} />
 *       <WidgetCard label="Speicher" value="5 GB" hint="Verfügbar" />
 *       <WidgetCard label="Mitglieder" value="3 / 5" hint="Seats belegt" />
 *     </div>
 *
 * Der `[&>*]:h-full`-Trick gibt allen direkten Grid-Kindern gleiche
 * Höhe — ohne das sieht ein Widget mit Action optisch größer aus als
 * eines ohne.
 */
export interface WidgetCardProps {
  /** Kleine Überschrift oben — typischerweise in Uppercase. */
  label: ReactNode;
  /** Die eigentliche Metrik oder der Haupt-Wert. */
  value: ReactNode;
  /** Optionaler beschreibender Kleintext unter dem Value. */
  hint?: ReactNode;
  /**
   * Optional: Link, Button oder Badge rechts/unten. Position ist
   * flex-ausgerichtet so, dass die Action am unteren Card-Rand landet,
   * auch wenn der Value oder Hint kurz ist.
   */
  action?: ReactNode;
  /** Zusätzliche Klassen auf dem `Card`-Root. Für Layout-Tweaks. */
  className?: string;
}

export function WidgetCard({
  label,
  value,
  hint,
  action,
  className,
}: WidgetCardProps) {
  return (
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader className="pb-2">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col justify-between gap-3">
        <div className="space-y-1">
          <div className="text-2xl font-semibold leading-tight">{value}</div>
          {hint ? (
            <p className="text-sm text-muted-foreground">{hint}</p>
          ) : null}
        </div>
        {action ? (
          <div className="flex items-center justify-end text-sm">{action}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
