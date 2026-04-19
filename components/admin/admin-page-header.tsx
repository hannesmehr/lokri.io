import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/app/(admin)/_breadcrumbs";

/**
 * AdminPageHeader — Standard-Kopfzeile für jede Admin-Seite.
 *
 * Ersetzt das 12× wiederholte Breadcrumb + `font-display`-H1 + Subtitle +
 * optional-rechts-Action-Pattern. Typo explizit kleiner als im User-
 * Scope (Admin ist Operator-Tool, nicht Content-Site — siehe
 * `docs/ADMIN_DESIGN.md`).
 *
 * Actions-Slot wrappt auf Mobile unter die Description; Desktop hat
 * Actions rechts-oben auf Höhe des Titels.
 */
interface Props {
  breadcrumbs: Crumb[];
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}

export function AdminPageHeader({
  breadcrumbs,
  title,
  description,
  actions,
}: Props) {
  return (
    <header className="space-y-4">
      <Breadcrumbs items={breadcrumbs} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">
            {title}
          </h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
