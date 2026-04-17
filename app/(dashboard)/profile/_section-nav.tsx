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
    <nav className="flex items-center gap-1 overflow-x-auto overflow-y-hidden border-b text-sm">
      {items.map((item) => {
        const active =
          pathname === item.href ||
          (item.href !== items[0]?.href && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "relative whitespace-nowrap px-3 py-2 transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
            {active ? (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
