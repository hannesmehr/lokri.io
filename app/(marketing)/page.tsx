import { asc } from "drizzle-orm";
import {
  ArrowRight,
  Check,
  FileText,
  Globe,
  Keyboard,
  Lock,
  Plug,
  Search,
  Shield,
  Sparkles,
} from "lucide-react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { plans } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "lokri.io — DSGVO-konformer MCP-Gateway für Power-User",
  description:
    "Ein gemeinsames Gedächtnis für alle deine KI-Clients. Notes, Files und semantische Suche — erreichbar aus Claude Desktop, ChatGPT, Cursor. EU-hosted, DSGVO-konform.",
  openGraph: {
    title: "lokri.io — MCP-Gateway für alle deine KI-Clients",
    description:
      "Ein DSGVO-konformer Wissens-Pool. Claude Desktop, ChatGPT und Cursor teilen sich ein persistentes Memory — EU-hosted, privat, dir gehörend.",
    url: "/",
    siteName: "lokri.io",
    locale: "de_DE",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "lokri.io — MCP-Gateway für alle deine KI-Clients",
    description:
      "DSGVO-konformer Wissens-Pool für Claude Desktop, ChatGPT, Cursor.",
  },
};

function formatCents(c: number): string {
  return (c / 100).toFixed(2).replace(".", ",") + " €";
}

function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(0)} GB`;
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(0)} MB`;
  return `${(n / 1024).toFixed(0)} KB`;
}

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/dashboard");

  const allPlans = await db.select().from(plans).orderBy(asc(plans.sortOrder));

  return (
    <main className="flex-1">
      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <section
        className="relative overflow-hidden px-6 pt-20 pb-28 sm:pt-28 sm:pb-36"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 800px 400px at 15% 10%, color-mix(in oklch, var(--chart-1) 18%, transparent), transparent 60%)," +
            "radial-gradient(ellipse 700px 400px at 90% 20%, color-mix(in oklch, var(--chart-2) 20%, transparent), transparent 60%)," +
            "radial-gradient(ellipse 600px 300px at 60% 100%, color-mix(in oklch, var(--chart-3) 15%, transparent), transparent 60%)," +
            "radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--foreground) 7%, transparent) 1px, transparent 0)",
          backgroundSize: "auto, auto, auto, 22px 22px",
        }}
      >
        <div className="mx-auto max-w-4xl text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur-sm">
            <Sparkles className="h-3 w-3" />
            DSGVO · EU-hosted · Model Context Protocol
          </div>
          <h1 className="mt-6 font-display text-5xl leading-[1.02] sm:text-6xl md:text-7xl">
            Ein Gedächtnis.
            <br />
            <span className="italic text-brand">Alle deine KI-Clients.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            lokri.io ist ein DSGVO-konformer MCP-Gateway. Lege Notes und Files
            an einem Ort ab — Claude Desktop, ChatGPT, Cursor und jeder andere
            MCP-Client finden sie über semantische Suche.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-5 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Kostenlos starten <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="#features"
              className="inline-flex items-center gap-1.5 rounded-md border bg-background px-5 py-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              Wie funktioniert das?
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            20 MB Speicher kostenlos · Keine Kreditkarte · Kündbar mit einem Klick
          </p>
        </div>
      </section>

      {/* ── PROBLEM / AUDIENCE ─────────────────────────────────────────── */}
      <section className="border-y bg-muted/20 px-6 py-16">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl sm:text-4xl">
            Du nutzt Claude für das eine, ChatGPT für was anderes,{" "}
            <span className="italic text-brand">
              und keiner weiß was der andere weiß
            </span>
            .
          </h2>
          <p className="mt-4 text-muted-foreground">
            Jeder KI-Client hat sein eigenes Memory — isoliert, fragmentiert,
            mit überraschenden Datenschutzerklärungen. lokri ist der
            gemeinsame Speicher, über den sich alle drei verständigen.
          </p>
        </div>
      </section>

      {/* ── FEATURES GRID ─────────────────────────────────────────────── */}
      <section id="features" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Features
            </div>
            <h2 className="mt-2 font-display text-4xl leading-tight">
              Sauber abgegrenzt, schnell zugreifbar,{" "}
              <span className="italic text-brand">komplett dir gehörend</span>.
            </h2>
          </div>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <Feature
              icon={<Plug className="h-5 w-5" />}
              accent="from-indigo-500/15 to-fuchsia-500/15"
              title="MCP-native"
              body="Verbinde Claude Desktop, ChatGPT, Cursor oder jeden anderen MCP-Client per OAuth 2.1. 10 Tools: search, fetch, create_note, upload_file, list_spaces …"
            />
            <Feature
              icon={<Search className="h-5 w-5" />}
              accent="from-amber-500/15 to-rose-500/15"
              title="Semantische Suche"
              body="pgvector + HNSW-Index auf jedem Note und File-Chunk. Die KI findet auch, was du nie so formuliert hast."
            />
            <Feature
              icon={<FileText className="h-5 w-5" />}
              accent="from-emerald-500/15 to-teal-500/15"
              title="Notes &amp; Files"
              body="Markdown-Notes mit Preview, Files bis 10 MB im privaten Vercel-Blob. Text wird automatisch embedded."
            />
            <Feature
              icon={<Shield className="h-5 w-5" />}
              accent="from-sky-500/15 to-indigo-500/15"
              title="DSGVO-first"
              body="Neon Postgres in Frankfurt, private Blobs, keine Trainings-Weitergabe. Account-Delete löscht alles sofort."
            />
            <Feature
              icon={<Lock className="h-5 w-5" />}
              accent="from-violet-500/15 to-pink-500/15"
              title="2FA + OAuth"
              body="TOTP-2FA fürs Dashboard. Pro KI-Client eigener OAuth-Token — widerrufbar mit einem Klick."
            />
            <Feature
              icon={<Keyboard className="h-5 w-5" />}
              accent="from-lime-500/15 to-emerald-500/15"
              title="⌘K-Suche im Browser"
              body="Spotlight-artige Suche direkt im Dashboard. Findet Notes und Files in <200 ms."
            />
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────────────────────── */}
      <section className="border-y bg-muted/20 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              So funktioniert's
            </div>
            <h2 className="mt-2 font-display text-4xl leading-tight">
              In drei Minuten von Null zu produktiv.
            </h2>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <Step
              n={1}
              title="Account anlegen"
              body="Email + Passwort. Email verifizieren, 2FA optional aktivieren."
            />
            <Step
              n={2}
              title="Notes &amp; Files hochladen"
              body="Manuell über die UI, per Drag&Drop, oder via Obsidian-Vault-Import. Alles wird automatisch embedded."
            />
            <Step
              n={3}
              title="KI-Clients verbinden"
              body="OAuth-Flow in Claude Desktop / ChatGPT / Cursor starten — und sofort sehen die deine Spaces, Notes und Files."
            />
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────────────── */}
      <section id="pricing" className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Preise
            </div>
            <h2 className="mt-2 font-display text-4xl leading-tight">
              Fair, kündbar, keine Abo-Falle.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Einmalzahlung pro Jahr oder Monat. Keine Auto-Renewal-Hölle — du
              verlängerst aktiv, wenn du weiter nutzen willst.
            </p>
          </div>
          <div className="mt-12 grid gap-4 md:grid-cols-4">
            {allPlans.map((plan) => {
              const isPro = plan.id === "pro";
              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl border bg-card p-6 ${
                    isPro ? "border-indigo-500/30 shadow-lg" : ""
                  }`}
                >
                  {isPro ? (
                    <div className="absolute right-3 top-3 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background">
                      Empfohlen
                    </div>
                  ) : null}
                  <div className="font-display text-2xl">{plan.name}</div>
                  <p className="mt-1 min-h-[2.5rem] text-xs text-muted-foreground">
                    {plan.description}
                  </p>
                  <div className="mt-5">
                    {plan.priceMonthlyCents === 0 ? (
                      <div className="text-3xl font-semibold">Kostenlos</div>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1">
                          <span className="text-3xl font-semibold tabular-nums">
                            {formatCents(plan.priceMonthlyCents)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            /Monat
                          </span>
                        </div>
                        {plan.priceYearlyCents > 0 ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            oder{" "}
                            <strong className="text-foreground tabular-nums">
                              {formatCents(plan.priceYearlyCents)}
                            </strong>
                            /Jahr
                          </div>
                        ) : null}
                      </>
                    )}
                  </div>
                  <ul className="mt-5 space-y-1.5 text-sm">
                    <PlanFeature>
                      <strong className="tabular-nums">
                        {formatBytes(plan.maxBytes)}
                      </strong>{" "}
                      Speicher
                    </PlanFeature>
                    <PlanFeature>
                      {plan.maxFiles.toLocaleString("de-DE")} Files
                    </PlanFeature>
                    <PlanFeature>
                      {plan.maxNotes.toLocaleString("de-DE")} Notes
                    </PlanFeature>
                    <PlanFeature>Semantische Suche · MCP · 2FA</PlanFeature>
                  </ul>
                  <Link
                    href={plan.id === "free" ? "/register" : "/register?plan=" + plan.id}
                    className={`mt-6 inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-opacity ${
                      isPro
                        ? "bg-foreground text-background hover:opacity-90"
                        : "border hover:bg-muted"
                    }`}
                  >
                    {plan.id === "free" ? "Kostenlos starten" : "Plan wählen"}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section className="border-t bg-muted/20 px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Häufige Fragen
            </div>
            <h2 className="mt-2 font-display text-4xl leading-tight">
              Was du fragen würdest, wenn wir uns treffen.
            </h2>
          </div>
          <dl className="mt-12 space-y-4">
            <Faq
              q="Wo liegen meine Daten?"
              a="Datenbank in Neon (Frankfurt). Files in Vercel Blob (private access). Embeddings laufen über Vercel AI Gateway → OpenAI (Text wird laut Anbieter nicht für Trainings verwendet). Keine Datenübertragung außerhalb des MCP-Flows."
            />
            <Faq
              q="Was kann ich löschen?"
              a="Alles. Einzelne Notes/Files via UI oder MCP, den ganzen Account via Settings → Account löschen. DSGVO Art. 17 wird ohne Mail-Ping-Pong umgesetzt — Bestätigungsmail, Klick, alle Daten + Blobs weg."
            />
            <Faq
              q="Welche KI-Clients funktionieren?"
              a="Alles was Model Context Protocol (MCP) spricht: Claude Desktop (via mcp-remote-Bridge wegen Schema-Limit), ChatGPT Developer Tools, Cursor, Codex, Continue. Native OAuth 2.1 + Legacy-Bearer-Tokens beide supportet."
            />
            <Faq
              q="Kann ich exportieren?"
              a="Ja. Settings → Daten-Portabilität → ZIP-Download. Enthält ein JSON-Manifest + pro Note eine .md-Datei (Obsidian-kompatibel) + alle Files im Original. Import geht genauso zurück."
            />
            <Faq
              q="Kann ich eigenes Storage anbinden?"
              a="Geplant für V2. Das StorageProvider-Interface ist schon vorbereitet (S3, R2, eigener Server). Sag Bescheid wenn du früh in die Beta willst."
            />
            <Faq
              q="Wer steckt dahinter?"
              a={`Hannes Mehr aus Hamburg. Einzelunternehmer, Full-Stack-Entwickler. Fragen an ${"hello@lokri.io"}.`}
            />
          </dl>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div
          className="mx-auto max-w-4xl overflow-hidden rounded-3xl border bg-card p-12 text-center"
          style={{
            backgroundImage:
              "radial-gradient(ellipse 600px 200px at 50% 0%, color-mix(in oklch, var(--chart-1) 15%, transparent), transparent 60%)," +
              "radial-gradient(ellipse 500px 300px at 50% 100%, color-mix(in oklch, var(--chart-2) 18%, transparent), transparent 60%)",
          }}
        >
          <div className="flex items-center justify-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <Globe className="h-3 w-3" />
            DSGVO · EU-hosted · Open Source-Spirit
          </div>
          <h2 className="mt-3 font-display text-4xl leading-tight sm:text-5xl">
            Deine KI-Clients reden jetzt miteinander.
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            20 MB kostenlos, kein Zahlungsmittel nötig. Upgrade jederzeit —
            Kündigung genauso.
          </p>
          <Link
            href="/register"
            className="mt-8 inline-flex items-center gap-1.5 rounded-md bg-foreground px-6 py-3 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Account anlegen <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </main>
  );
}

function Feature({
  icon,
  title,
  body,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5 transition-colors hover:border-foreground/20">
      <div
        className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br text-foreground ${accent}`}
      >
        {icon}
      </div>
      <div className="mt-4 font-semibold">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-foreground font-semibold text-background">
          {n}
        </div>
        <div className="h-px flex-1 bg-border" />
      </div>
      <div className="mt-4 font-display text-xl leading-tight">{title}</div>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

function PlanFeature({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
      <span>{children}</span>
    </li>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl border bg-card px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
        <span>{q}</span>
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border text-muted-foreground transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <p className="mt-3 text-sm text-muted-foreground">{a}</p>
    </details>
  );
}
