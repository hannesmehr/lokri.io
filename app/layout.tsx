import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
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

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.BETTER_AUTH_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : "http://localhost:3000"),
  ),
  title: {
    default: "lokri.io — DSGVO-konformer MCP-Gateway",
    template: "%s · lokri.io",
  },
  description:
    "Ein gemeinsames Gedächtnis für Claude Desktop, ChatGPT und Cursor. EU-hosted, DSGVO-konform, dir gehörend.",
  applicationName: "lokri.io",
  keywords: [
    "MCP",
    "Model Context Protocol",
    "Claude Desktop",
    "ChatGPT",
    "Cursor",
    "Semantic search",
    "DSGVO",
    "EU-hosted",
    "KI-Memory",
    "pgvector",
  ],
  authors: [{ name: "Hannes Mehr" }],
  creator: "Hannes Mehr",
  publisher: "Hannes Mehr",
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "lokri.io",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`${inter.variable} ${instrumentSerif.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <Toaster />
        {/* Auto no-ops in dev; ships only from the Vercel edge in prod. */}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
