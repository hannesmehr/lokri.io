import Link from "next/link";

/**
 * Dashboard footer — minimal, inline, only visible after scroll. Hosts the
 * two compulsory German-law links (Impressum, Datenschutz) so they're reachable
 * from every authenticated page.
 */
export function DashboardFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4 text-xs text-muted-foreground">
        <span>© {new Date().getFullYear()} lokri.io</span>
        <nav className="flex items-center gap-4">
          <Link href="/impressum" className="hover:text-foreground">
            Impressum
          </Link>
          <Link href="/datenschutz" className="hover:text-foreground">
            Datenschutz
          </Link>
          <a
            href="mailto:hello@lokri.io"
            className="hover:text-foreground"
          >
            Kontakt
          </a>
        </nav>
      </div>
    </footer>
  );
}
