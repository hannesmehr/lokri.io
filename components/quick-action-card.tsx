import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Quick-Action — Link-Card für zentrale Einstiege.
 *
 * Layout: Icon links, Label + Description Mitte, Chevron rechts (der
 * erst bei Hover sichtbar wird). Icon sitzt in einem neutralen
 * Bordered-Square, keine Pastell-Tints. Hover-Effekt: nur Border-Color
 * wechselt, kein Shadow-Lift, kein Translate.
 */
interface Props {
  href: string;
  icon: ReactNode;
  label: string;
  description: string;
  className?: string;
}

export function QuickActionCard({
  href,
  icon,
  label,
  description,
  className,
}: Props) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex items-start gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20",
        className,
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40 text-muted-foreground transition-colors group-hover:border-foreground/30 group-hover:text-foreground">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 self-center text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60" />
    </Link>
  );
}
