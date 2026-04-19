"use client";

import {
  Activity,
  FileText,
  Key,
  LayoutDashboard,
  Menu,
  Receipt,
  ScrollText,
  ShieldCheck,
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
 * Admin-Sidebar — post-Redesign.
 *
 * Auf Desktop (lg+) sitzt sie sticky links, 224 px breit. Auf < lg wird
 * sie zum Sheet-Drawer via `<AdminMobileNavTrigger>`. Der
 * Backoffice-Charakter wird durch:
 *
 *   1. eine 2-px breite Brand-Accent-Linie am linken Sidebar-Rand
 *      (`bg-brand/40`) signalisiert — dezent, aber peripher sichtbar
 *   2. einen `<ShieldCheck>`-Icon mit `text-brand` im Sidebar-Header
 *
 * kommuniziert. Die frühere Amber-Tint-Fläche ist komplett entfernt;
 * Active-/Hover-States folgen den neutralen Admin-Tokens (`bg-muted`
 * auf active, `bg-muted/60` auf hover). Siehe `docs/ADMIN_DESIGN.md`.
 *
 * Reihenfolge: Dashboard → Users → Accounts → Rechnungen → Tokens →
 * Audit → System.
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
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col border-r bg-muted/30 lg:flex relative">
      <BrandAccentLine />
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
        className="flex w-[260px] flex-col bg-muted/40 p-0 sm:max-w-xs"
      >
        <BrandAccentLine />
        <SheetHeader className="border-b p-4">
          <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-brand" />
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

/**
 * 2-px Brand-Accent-Linie am linken Sidebar-Rand. Läuft über die
 * gesamte Sidebar-Höhe, `pointer-events-none`, aria-hidden. Der
 * einzige verbleibende „du bist im Backoffice"-Farb-Indikator.
 */
function BrandAccentLine() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 left-0 w-[2px] bg-brand/40"
    />
  );
}

function AdminNavHeader() {
  return (
    <div className="flex items-center gap-2 border-b px-4 py-4">
      <ShieldCheck className="h-4 w-4 text-brand" />
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
                ? "bg-foreground/10 font-medium text-foreground"
                : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
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
      <div className="border-t px-2 py-2">
        <ThemeToggle variant="full" />
      </div>
      <div className="border-t px-4 py-3 text-[11px] text-muted-foreground">
        Nur für lokri-Admins. Aktionen werden im Audit-Log erfasst.
      </div>
    </>
  );
}
