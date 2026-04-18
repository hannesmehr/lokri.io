import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Breadcrumbs-Strip für Admin-Seiten. Pfad-Trail oben, damit der Weg
 * zurück ins Layout nie mehr als ein Klick ist — besonders wichtig bei
 * den tiefen Detail-Routen (Admin → User → Hannes Mehr).
 *
 * `items` sind immer ohne Home-Prefix; der Admin-Eintrag wird
 * automatisch vorangestellt.
 */

export interface Crumb {
  label: ReactNode;
  href?: string;
}

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  const chain: Crumb[] = [{ label: "Admin", href: "/admin" }, ...items];
  return (
    <nav
      aria-label="Breadcrumbs"
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
    >
      {chain.map((crumb, i) => {
        const isLast = i === chain.length - 1;
        return (
          <span key={i} className="inline-flex items-center gap-1.5">
            {i > 0 ? <ChevronRight className="h-3 w-3 opacity-50" /> : null}
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className={isLast ? "font-medium text-foreground" : ""}>
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
