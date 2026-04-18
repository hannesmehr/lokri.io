import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { ownerAccounts, users } from "@/lib/db/schema";
import { AccountSwitcher } from "./_account-switcher";
import { DashboardFooter } from "./_footer";
import { MobileNav } from "./_mobile-nav";
import { NavLink } from "./_nav-link";
import { SearchPalette, SearchTrigger } from "./_search-palette";
import { UserMenu } from "./_user-menu";

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  let ctx;
  try {
    ctx = await requireSessionWithAccount();
  } catch {
    redirect("/login");
  }
  const { session, ownerAccountId, accountType } = ctx;

  // Pull active account name + the user's can_create_teams + is_admin
  // flags. Two cheap lookups but the `requireSessionWithAccount`
  // helper doesn't expose the account row directly.
  const [[account], [userRow]] = await Promise.all([
    db
      .select({ name: ownerAccounts.name })
      .from(ownerAccounts)
      .where(eq(ownerAccounts.id, ownerAccountId))
      .limit(1),
    db
      .select({
        canCreateTeams: users.canCreateTeams,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1),
  ]);

  const t = await getTranslations("dashboard.nav");
  const NAV = [
    { href: "/dashboard", label: t("dashboard") },
    { href: "/spaces", label: t("spaces") },
    { href: "/notes", label: t("notes") },
    { href: "/files", label: t("files") },
  ];

  // Use the headers() to stop-request early if unauthenticated was a race
  await headers();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-4 py-3 sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-4">
            <MobileNav items={NAV} />
            <Link
              href="/dashboard"
              className="flex items-center gap-2 text-sm font-semibold tracking-tight"
            >
              <span className="grid h-6 w-6 place-items-center rounded-md bg-foreground text-xs font-bold text-background">
                l
              </span>
              <span className="hidden lg:inline">lokri.io</span>
            </Link>
            <AccountSwitcher
              activeAccountId={ownerAccountId}
              activeAccountType={accountType}
              activeAccountName={account?.name ?? "lokri.io"}
              canCreateTeams={userRow?.canCreateTeams ?? false}
            />
            {/* Horizontal nav ab md (768); darunter bleibt die Nav im
                MobileNav-Drawer, damit Nav + Search-Trigger sich nicht
                auf schmalen Tablet-Portrait-Breiten überlappen. */}
            <nav className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => (
                <NavLink key={item.href} href={item.href}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <SearchTrigger />
            <ThemeToggle />
            <UserMenu
              user={{ name: session.user.name, email: session.user.email }}
              isAdmin={userRow?.isAdmin ?? false}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
        {children}
      </main>
      <SearchPalette />
      <DashboardFooter />
    </div>
  );
}
