import type { ReactNode } from "react";
import { Breadcrumbs, type Crumb } from "@/components/ui/breadcrumbs";

/**
 * PageHeader — Standard-Kopfzeile für Top-Level-Routen im User-Scope
 * (`/profile`, `/settings`, `/team`, ggf. künftig auch `/dashboard`,
 * `/spaces`, `/files`, `/notes`).
 *
 * Unterschied zu `AdminPageHeader` (`components/admin/admin-page-
 * header.tsx`): User-Scope nutzt größere, content-site-typische
 * Typografie (`text-3xl sm:text-4xl`), Admin bleibt bewusst enger
 * (`text-lg sm:text-xl` — Operator-Tool, Info-Dichte über Ästhetik).
 *
 * Nutzung (Settings-Refactor Block 1+2+3):
 *
 *     <PageHeader
 *       breadcrumbs={[
 *         { label: "Profil", href: "/profile" },
 *         { label: "Sicherheit" },
 *       ]}
 *       title="Profil-Sicherheit"
 *       description="Passwort, Zwei-Faktor-Authentifizierung, Sessions"
 *       actions={<Button>Alle Sessions beenden</Button>}
 *     />
 *
 * Regeln (siehe `docs/DESIGN_SYSTEM.md`, erweitert in Block 4):
 *   - Jede Top-Level-Route hat genau einen `<PageHeader>` oben
 *   - Breadcrumbs sind optional, aber wenn gesetzt: letztes Item
 *     ohne `href` (repräsentiert die aktuelle Seite)
 *   - Description max ein bis zwei Sätze
 *   - Actions-Slot wrappt auf Mobile unter Title/Description
 */
interface Props {
  /**
   * Breadcrumb-Trail. Leer lassen auf Top-Level-Routes wie
   * `/profile`, wo kein Parent-Kontext existiert; in dem Fall
   * rendert der Header nur Title + Description + Actions.
   */
  breadcrumbs?: Crumb[];
  title: string;
  description?: ReactNode;
  /** Primary-Actions — typischerweise 1–2 Buttons oder ein Dropdown. */
  actions?: ReactNode;
}

export function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
}: Props) {
  return (
    <header className="space-y-4">
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <Breadcrumbs items={breadcrumbs} />
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-3xl font-semibold tracking-tight leading-tight sm:text-4xl">
            {title}
          </h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
