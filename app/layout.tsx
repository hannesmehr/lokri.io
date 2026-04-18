import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Geist_Mono, Instrument_Serif, Inter } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const OG_LOCALE: Record<string, string> = {
  de: "de_DE",
  en: "en_US",
};

/**
 * Metadata is locale-aware: title template, description, keywords, and
 * OpenGraph locale come from `messages/{locale}.json` under
 * `metadata.root.*`. The base URL is still driven by env because it's
 * request-independent.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.root");
  const locale = await getLocale();
  return {
    metadataBase: new URL(
      process.env.BETTER_AUTH_URL ??
        (process.env.VERCEL_PROJECT_PRODUCTION_URL
          ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
          : "http://localhost:3000"),
    ),
    title: {
      default: t("defaultTitle"),
      template: t("titleTemplate"),
    },
    description: t("description"),
    applicationName: "lokri.io",
    keywords: t.raw("keywords") as string[],
    authors: [{ name: "Hannes Mehr" }],
    creator: "Hannes Mehr",
    publisher: "Hannes Mehr",
    robots: { index: true, follow: true },
    openGraph: {
      type: "website",
      locale: OG_LOCALE[locale] ?? "de_DE",
      siteName: "lokri.io",
      title: t("ogTitle"),
      description: t("ogDescription"),
    },
    twitter: {
      card: "summary_large_image",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${instrumentSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
        {/* Auto no-ops in dev; ships only from the Vercel edge in prod. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
