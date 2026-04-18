import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ApiAuthError } from "@/lib/api/errors";
import { requireAdminSession } from "@/lib/api/session";
import { AdminMobileNavTrigger, AdminSidebar } from "./_sidebar";

/**
 * Admin-Layout.
 *
 *   • Sidebar links (fix, scrollt nicht mit), Content rechts.
 *   • Eigenes Header-Band mit Admin-Badge + Rücksprung ins User-Dashboard.
 *   • Ausdrücklich **deutsch** (keine next-intl) — Backoffice bleibt
 *     einsprachig, Prompt vorgibt.
 *   • Route-Guard zentral hier: `requireAdminSession` wirft 403, wir
 *     redirecten auf `/login` (unauth) bzw. `/dashboard` (nicht-admin).
 *     Der Redirect ist bewusst generisch — ein neugieriger Viewer soll
 *     nicht wissen, dass es eine Admin-Surface überhaupt gibt.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  try {
    await requireAdminSession();
  } catch (err) {
    if (err instanceof ApiAuthError && err.status === 401) {
      redirect("/login");
    }
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-background via-background to-amber-50/30 dark:to-amber-950/10">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-amber-500/20 bg-background/90 backdrop-blur-md">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2 text-xs">
              <AdminMobileNavTrigger />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-medium text-amber-800 dark:text-amber-200">
                <ShieldCheck className="h-3 w-3" />
                Admin-Modus
              </span>
              <span className="hidden text-muted-foreground sm:inline">
                Aktionen hier werden protokolliert.
              </span>
            </div>
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-3 w-3" />
              <span className="hidden sm:inline">Zurück zum User-Dashboard</span>
              <span className="sm:hidden">Zurück</span>
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
          {children}
        </main>
      </div>
    </div>
  );
}
