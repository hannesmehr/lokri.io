import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/**
 * Minimal public layout — while the full site is under construction, we
 * ship a coming-soon page with nothing but login access and the
 * legally-required links.
 */
export default async function MarketingLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("marketing.layout");
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="absolute inset-x-0 top-0 z-10">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-md border border-border bg-foreground text-xs font-bold text-background">
              l
            </span>
            lokri.io
          </Link>
          <Link
            href="/login"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {t("login")}
          </Link>
        </div>
      </header>
      {children}
      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-6 py-5 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <span>{t("copyright", { year: new Date().getFullYear() })}</span>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link href="/impressum" className="underline-offset-4 hover:text-foreground hover:underline">
              {t("impressum")}
            </Link>
            <Link href="/datenschutz" className="underline-offset-4 hover:text-foreground hover:underline">
              {t("datenschutz")}
            </Link>
            <a href="mailto:hello@lokri.io" className="underline-offset-4 hover:text-foreground hover:underline">
              {t("contact")}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
