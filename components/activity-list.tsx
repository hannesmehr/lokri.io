import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Generische Aktivitäts-Liste für Dashboard-Kontexte.
 *
 * Aufbau: Card mit Header (Icon + Titel + optional „Alle ansehen"-Link),
 * Liste der Items als Rows (Primary links, Secondary klein drunter,
 * Trailing rechts — typisch relative Zeit in Mono), oder Empty-State
 * mit CTA.
 *
 * Das Rendering einzelner Items übernimmt der Caller — dieses Modul
 * kapselt nur den Container. So bleiben Notes-Rows (Titel + relative
 * Zeit) und Files-Rows (Name + MIME·Size + relative Zeit) unabhängig
 * gestaltbar, ohne ein komplexes Props-Schema aufzuspannen.
 */
interface Props {
  title: string;
  icon: ReactNode;
  moreHref?: string;
  moreLabel?: string;
  children: ReactNode;
  className?: string;
}

export function ActivityList({
  title,
  icon,
  moreHref,
  moreLabel = "Alle ansehen",
  children,
  className,
}: Props) {
  return (
    <section
      className={cn(
        "flex flex-col rounded-lg border bg-card",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        {moreHref ? (
          <Link
            href={moreHref}
            className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {moreLabel}
          </Link>
        ) : null}
      </header>
      <div className="flex-1 p-2">{children}</div>
    </section>
  );
}

/**
 * Einzelner Listen-Eintrag. `href` macht den ganzen Row klickbar; ohne
 * `href` bleibt der Row statisch (z.B. bei reinen Anzeige-Items).
 */
export function ActivityRow({
  href,
  primary,
  secondary,
  trailing,
  className,
}: {
  href?: string;
  primary: ReactNode;
  secondary?: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm">{primary}</div>
        {secondary ? (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {secondary}
          </div>
        ) : null}
      </div>
      {trailing ? (
        <div className="shrink-0 text-xs text-muted-foreground">{trailing}</div>
      ) : null}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          "flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-muted/60",
          className,
        )}
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className={cn("flex items-center gap-3 px-2 py-1.5", className)}>
      {inner}
    </div>
  );
}

/**
 * Empty-State — wird innerhalb einer ActivityList gezeigt, wenn keine
 * Items existieren. Bewusst dezent: dashed Border, Icon + Label + CTA,
 * keine farbigen Illustrationen.
 */
export function ActivityEmpty({
  icon,
  label,
  cta,
  ctaHref,
}: {
  icon: ReactNode;
  label: string;
  cta: string;
  ctaHref: string;
}) {
  return (
    <div className="m-2 flex flex-col items-center gap-3 rounded-md border border-dashed py-8 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <div className="text-sm text-muted-foreground">{label}</div>
      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={<Link href={ctaHref}>{cta}</Link>}
      />
    </div>
  );
}
