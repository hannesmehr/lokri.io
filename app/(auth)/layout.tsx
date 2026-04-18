import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("auth.layout");
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6">
        <Link
          href="/"
          className="flex items-center justify-center gap-2 text-lg font-semibold"
        >
          <span className="grid h-8 w-8 place-items-center rounded-lg border border-border bg-foreground text-sm font-bold text-background">
            l
          </span>
          lokri.io
        </Link>
        {children}
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <Link href="/impressum" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("footer.impressum")}
          </Link>
          <Link href="/datenschutz" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("footer.datenschutz")}
          </Link>
          <a href="mailto:hello@lokri.io" className="underline-offset-4 hover:text-foreground hover:underline">
            {t("footer.contact")}
          </a>
        </nav>
      </div>
    </div>
  );
}
