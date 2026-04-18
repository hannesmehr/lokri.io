"use client";

import {
  Activity,
  FileText,
  Key,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

/**
 * Admin-Sidebar. Sitzt links, 220px breit, eigene Farbwelt (Amber-Tint
 * auf dem aktiven Eintrag) — damit beim Tab-Switch sofort klar ist,
 * dass man im Backoffice ist.
 *
 * Reihenfolge wie im Prompt: Dashboard → Users → Accounts → Rechnungen →
 * Tokens.
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

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-amber-500/20 bg-amber-50/40 dark:bg-amber-950/10">
      <div className="flex items-center gap-2 border-b border-amber-500/20 px-4 py-4">
        <FileText className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <div className="text-sm font-semibold tracking-tight">Backoffice</div>
      </div>
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
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
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
      <div className="border-t border-amber-500/20 px-2 py-2">
        <ThemeToggle variant="full" />
      </div>
      <div className="border-t border-amber-500/20 px-4 py-3 text-[11px] text-muted-foreground">
        Nur für lokri-Admins. Aktionen werden im Audit-Log erfasst.
      </div>
    </aside>
  );
}
