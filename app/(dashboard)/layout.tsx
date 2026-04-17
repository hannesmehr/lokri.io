import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { DashboardFooter } from "./_footer";
import { NavLink } from "./_nav-link";
import { SearchPalette, SearchTrigger } from "./_search-palette";
import { UserMenu } from "./_user-menu";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/spaces", label: "Spaces" },
  { href: "/notes", label: "Notes" },
  { href: "/files", label: "Files" },
];

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-background via-background to-muted/30">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-7">
            <Link
              href="/dashboard"
              className="flex items-center gap-2 font-semibold"
            >
              <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white">
                l
              </span>
              lokri.io
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map((item) => (
                <NavLink key={item.href} href={item.href}>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <SearchTrigger />
            <UserMenu
              user={{ name: session.user.name, email: session.user.email }}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
      <SearchPalette />
      <DashboardFooter />
    </div>
  );
}
