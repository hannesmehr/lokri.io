import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Minimal public layout — while the full site is under construction, we
 * ship a coming-soon page with nothing but login access and the
 * legally-required links.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white">
              l
            </span>
            lokri.io
          </Link>
          <Link
            href="/login"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Login
          </Link>
        </div>
      </header>
      {children}
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-5 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} lokri.io</span>
          <nav className="flex items-center gap-4">
            <Link href="/impressum" className="hover:text-foreground">
              Impressum
            </Link>
            <Link href="/datenschutz" className="hover:text-foreground">
              Datenschutz
            </Link>
            <a href="mailto:hello@lokri.io" className="hover:text-foreground">
              hello@lokri.io
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
