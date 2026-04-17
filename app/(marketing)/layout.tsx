import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Landing / public marketing layout. Kept separate from the dashboard so
 * we can aggressively cache and pre-render (no session lookups on `/`).
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-xs font-bold text-white">
              l
            </span>
            lokri.io
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="#features"
              className="hidden text-muted-foreground hover:text-foreground sm:inline"
            >
              Features
            </Link>
            <Link
              href="#pricing"
              className="hidden text-muted-foreground hover:text-foreground sm:inline"
            >
              Preise
            </Link>
            <Link
              href="/login"
              className="text-muted-foreground hover:text-foreground"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="inline-flex items-center rounded-md bg-foreground px-3 py-1.5 text-xs font-medium text-background transition-opacity hover:opacity-90"
            >
              Kostenlos starten
            </Link>
          </nav>
        </div>
      </header>
      {children}
      <footer className="border-t bg-muted/20">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-8 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="grid h-5 w-5 place-items-center rounded bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-[9px] font-bold text-white">
              l
            </span>
            <span>© {new Date().getFullYear()} lokri.io — Hamburg</span>
          </div>
          <nav className="flex items-center gap-5">
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
