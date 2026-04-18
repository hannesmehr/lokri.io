"use client";

import {
  Activity,
  FileText,
  Key,
  LayoutDashboard,
  Menu,
  Receipt,
  ScrollText,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useState } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

/**
 * Admin-Sidebar. Sitzt auf Desktop (lg+) links, 220px breit, eigene
 * Farbwelt (Amber-Tint auf dem aktiven Eintrag) — damit beim Tab-
 * Switch sofort klar ist, dass man im Backoffice ist.
 *
 * Auf < lg wird die Sidebar zum Sheet-Drawer. Der Hamburger-Trigger
 * sitzt im Admin-Layout-Header und ist als separater Export
 * `AdminMobileNavTrigger` nutzbar.
 *
 * Reihenfolge der Items: Dashboard → Users → Accounts → Rechnungen →
 * Tokens → Audit → System.
 */

const ITEMS: Array<{
  href: string;
  label: string;
  icon: ReactNode;
}> = [
  { href: "/admin", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: "/admin/users", label: "User", icon: <Users className="h-4 w-4" /> },
  { href: "/admin/accounts", label: "Accounts", icon: <Wallet className="h-4 w-4" /> },
  { href: "/admin/invoices", label: "Rechnungen", icon: <Receipt className="h-4 w-4" /> },
  { href: "/admin/tokens", label: "Tokens", icon: <Key className="h-4 w-4" /> },
  { href: "/admin/audit", label: "Audit", icon: <ScrollText className="h-4 w-4" /> },
  { href: "/admin/system", label: "System", icon: <Activity className="h-4 w-4" /> },
];

/** Desktop-Sidebar. Nur auf lg+ sichtbar. */
export function AdminSidebar() {
  return (
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r border-amber-500/20 bg-amber-50/40 lg:flex dark:bg-amber-950/10">
      <AdminNavHeader />
      <AdminNavList />
      <AdminNavFooter />
    </aside>
  );
}

/** Hamburger-Trigger + Sheet-Drawer für < lg. */
export function AdminMobileNavTrigger() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label="Backoffice-Navigation öffnen"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        }
      />
      <SheetContent
        side="left"
        className="flex w-[260px] flex-col border-r-amber-500/20 bg-amber-50/90 p-0 backdrop-blur-md dark:bg-amber-950/40 sm:max-w-xs"
      >
        <SheetHeader className="border-b border-amber-500/20 p-4">
          <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            Backoffice
          </SheetTitle>
        </SheetHeader>
        <AdminNavList onNavigate={() => setOpen(false)} />
        <AdminNavFooter />
      </SheetContent>
    </Sheet>
  );
}

/* ── Shared Sub-Komponenten ────────────────────────────────────────── */

function AdminNavHeader() {
  return (
    <div className="flex items-center gap-2 border-b border-amber-500/20 px-4 py-4">
      <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <div className="text-sm font-semibold tracking-tight">Backoffice</div>
    </div>
  );
}

function AdminNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-1 px-2 py-3">
      {ITEMS.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-md px-3 text-sm transition-colors",
              active
                ? "bg-amber-500/15 text-amber-900 dark:text-amber-100"
                : "text-muted-foreground hover:bg-amber-500/10 hover:text-foreground",
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function AdminNavFooter() {
  return (
    <>
      <div className="border-t border-amber-500/20 px-2 py-2">
        <ThemeToggle variant="full" />
      </div>
      <div className="border-t border-amber-500/20 px-4 py-3 text-[11px] text-muted-foreground">
        Nur für lokri-Admins. Aktionen werden im Audit-Log erfasst.
      </div>
    </>
  );
}
