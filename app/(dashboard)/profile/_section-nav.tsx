"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Horizontal sub-navigation — shared shape for profile/billing/settings.
 * Takes a list of tabs with href + label; the current route's tab is
 * underlined via active-state.
 */
export function SectionNav({
  items,
}: {
  items: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap items-center gap-1 border-b pb-1 text-sm">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== items[0]?.href && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative rounded-md px-3 py-2 transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {active ? (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-foreground" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
