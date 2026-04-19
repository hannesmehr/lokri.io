import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Breadcrumbs-Primitive für den User-Scope.
 *
 * Unterschied zum Admin-Pendant `app/(admin)/_breadcrumbs.tsx`: hier
 * wird **kein** Home-Crumb automatisch vorangestellt. Die Items kommen
 * komplett vom Caller. Grund: im Admin-Scope gibt's exakt einen
 * Entry-Point (`/admin`), im User-Scope dagegen drei (`/profile`,
 * `/settings`, `/team`), die jeweils ihre eigene Trail-Wurzel
 * bilden.
 *
 * Styling konsistent mit Admin (`text-xs text-muted-foreground`,
 * ChevronRight als Separator, letztes Item gefettet) — damit sich die
 * beiden Scopes visuell nicht beissen, wenn ein User zwischen Admin
 * und User-Bereichen wechselt.
 */
export interface Crumb {
  label: ReactNode;
  href?: string;
}

export function Breadcrumbs({
  items,
  className,
}: {
  items: Crumb[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <nav
      aria-label="Breadcrumbs"
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {items.map((crumb, i) => {
        const isLast = i === items.length - 1;
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
