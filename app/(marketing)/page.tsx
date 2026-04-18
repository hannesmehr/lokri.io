import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.marketing");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function ComingSoonPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");
  const t = await getTranslations("marketing.comingSoon");

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 700px 400px at 20% 20%, color-mix(in oklch, var(--chart-1) 14%, transparent), transparent 60%)," +
            "radial-gradient(ellipse 600px 400px at 80% 80%, color-mix(in oklch, var(--chart-2) 16%, transparent), transparent 60%)",
        }}
      />
      <div className="mx-auto max-w-xl text-center">
        <div className="inline-flex items-center gap-2 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          {t("title")}
        </div>
        <h1 className="mt-6 text-5xl font-semibold tracking-tight leading-[1.05] sm:text-6xl">
          lokri.<span className="italic text-brand">io</span>
        </h1>
        <p className="mt-4 text-sm text-muted-foreground sm:text-base">
          {t("tagline")}
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="inline-flex items-center rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            {t("loginCta")}
          </Link>
        </div>
      </div>
    </main>
  );
}
