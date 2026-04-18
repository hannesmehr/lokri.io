"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
}

/**
 * Mobile-Nav — Hamburger-Trigger + Side-Sheet mit den Dashboard-Nav-
 * Links. Nur auf < sm sichtbar; auf sm+ sitzt die horizontale Nav
 * direkt in der Top-Bar.
 *
 * Das Panel ist bewusst schlicht: Titel („Navigation"), Link-Liste,
 * keine Sekundär-Aktionen. Sprach-/Account-/Theme-Controls bleiben in
 * der Top-Bar, damit sie auch im Drawer-offen-Zustand erreichbar sind.
 */
export function MobileNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label="Navigation öffnen"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        }
      />
      <SheetContent
        side="left"
        className="flex w-[280px] flex-col p-0 sm:max-w-xs"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="text-sm font-semibold">Navigation</SheetTitle>
        </SheetHeader>
        <nav className="flex-1 space-y-1 p-2">
          {items.map((item) => {
            const active =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex min-h-11 items-center rounded-md px-3 text-sm transition-colors",
                  active
                    ? "bg-muted font-medium text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
