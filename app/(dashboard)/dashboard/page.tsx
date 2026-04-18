import { and, desc, eq, isNull } from "drizzle-orm";
import { FileText, Key, Plus, StickyNote, Upload } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  ActivityEmpty,
  ActivityList,
  ActivityRow,
} from "@/components/activity-list";
import { KpiCard } from "@/components/kpi-card";
import { QuickActionCard } from "@/components/quick-action-card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import {
  apiTokens,
  files as filesTable,
  notes as notesTable,
  spaces as spacesTable,
} from "@/lib/db/schema";
import { formatBytes, formatRelative } from "@/lib/format";
import { getQuota } from "@/lib/quota";
import { OnboardingCard } from "./_onboarding-card";

/**
 * Dashboard-Home — Phase-1-Showcase für das neue Design-System.
 *
 * Strukturell: Header (H1 + Sub + Plan-Badge) → Onboarding-Card (falls
 * aktiv) → Quick-Actions-Grid → KPI-Tiles → Activity-Grid. Alle Styles
 * laufen ausschließlich über semantische Tokens (CSS-Vars); Light +
 * Dark testen sich automatisch mit.
 */
export default async function DashboardPage() {
  const t = await getTranslations("dashboard.home");
  const { session, ownerAccountId } = await requireSessionWithAccount();
  const [quota, recentNotes, recentFiles, spaceCount, tokenCount] =
    await Promise.all([
      getQuota(ownerAccountId),
      db
        .select({
          id: notesTable.id,
          title: notesTable.title,
          updatedAt: notesTable.updatedAt,
        })
        .from(notesTable)
        .where(eq(notesTable.ownerAccountId, ownerAccountId))
        .orderBy(desc(notesTable.updatedAt))
        .limit(5),
      db
        .select({
          id: filesTable.id,
          filename: filesTable.filename,
          sizeBytes: filesTable.sizeBytes,
          mimeType: filesTable.mimeType,
          createdAt: filesTable.createdAt,
        })
        .from(filesTable)
        .where(eq(filesTable.ownerAccountId, ownerAccountId))
        .orderBy(desc(filesTable.createdAt))
        .limit(5),
      db.$count(spacesTable, eq(spacesTable.ownerAccountId, ownerAccountId)),
      db.$count(
        apiTokens,
        and(
          eq(apiTokens.ownerAccountId, ownerAccountId),
          isNull(apiTokens.revokedAt),
        ),
      ),
    ]);

  const firstName = session.user.name?.split(" ")[0] ?? null;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl lg:text-4xl">
            {firstName ? t("welcome", { name: firstName }) : t("titleFallback")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <Link
          href="/billing"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors hover:border-foreground/20"
          aria-label={t("planAriaLabel", { planId: quota.planId })}
        >
          <span className="text-muted-foreground">{t("planLabel")}</span>
          <span className="font-mono font-medium">{quota.planId}</span>
        </Link>
      </header>

      <OnboardingCard
        hasSpace={spaceCount > 0}
        hasNote={quota.notesCount > 0}
        hasToken={tokenCount > 0}
      />

      {/* Quick actions — 1 col Mobile, 2 cols ab sm, 3 cols ab lg */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <QuickActionCard
          href="/notes/new"
          icon={<Plus className="h-4 w-4" />}
          label={t("quickActions.newNote.label")}
          description={t("quickActions.newNote.description")}
        />
        <QuickActionCard
          href="/files"
          icon={<Upload className="h-4 w-4" />}
          label={t("quickActions.uploadFile.label")}
          description={t("quickActions.uploadFile.description")}
        />
        <QuickActionCard
          href="/settings/mcp"
          icon={<Key className="h-4 w-4" />}
          label={t("quickActions.mcpToken.label")}
          description={t("quickActions.mcpToken.description")}
        />
      </div>

      {/* Kontingent — 1 col bis md, 3 cols ab md (768+).
          sm:grid-cols-3 war zu eng: „544.0 KB" + „von 20.0 MB" brach
          bei 640–767px Card-Breite um. Ab 768px fits wieder sauber. */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("sections.quota")}
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <KpiCard
            label={t("kpis.storage")}
            value={formatBytes(quota.usedBytes)}
            valueSuffix={t("kpis.ofBytes", { max: formatBytes(quota.maxBytes) })}
            progress={{ used: quota.usedBytes, max: quota.maxBytes }}
            progressAriaLabel={t("kpis.progressAriaLabel", {
              label: t("kpis.storage"),
              percent: Math.round((quota.usedBytes / quota.maxBytes) * 100),
            })}
          />
          <KpiCard
            label={t("kpis.files")}
            value={quota.filesCount.toLocaleString("de-DE")}
            valueSuffix={t("kpis.ofCount", { max: quota.maxFiles })}
            progress={{ used: quota.filesCount, max: quota.maxFiles }}
            progressAriaLabel={t("kpis.progressAriaLabel", {
              label: t("kpis.files"),
              percent: Math.round((quota.filesCount / quota.maxFiles) * 100),
            })}
          />
          <KpiCard
            label={t("kpis.notes")}
            value={quota.notesCount.toLocaleString("de-DE")}
            valueSuffix={t("kpis.ofCount", { max: quota.maxNotes })}
            progress={{ used: quota.notesCount, max: quota.maxNotes }}
            progressAriaLabel={t("kpis.progressAriaLabel", {
              label: t("kpis.notes"),
              percent: Math.round((quota.notesCount / quota.maxNotes) * 100),
            })}
          />
        </div>
      </section>

      {/* Activity — 1 col bis md, 2 cols ab lg, volle Main-Breite.
          Eine frühere Iteration (4xl zentriert) sollte das „zu luftig"-
          Problem bei wenigen Einträgen lösen, erzeugte aber sichtbare
          Inkonsistenz zwischen den Sektionen gleicher Hierarchie —
          Activity wirkte eingerückt gegenüber Quick-Actions und KPIs
          darüber. Der 5xl-Main gibt das richtige Maß für alle Sektionen. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ActivityList
          title={t("sections.recentNotes")}
          icon={<StickyNote className="h-4 w-4" />}
          moreHref="/notes"
          moreLabel={t("viewAll")}
        >
          {recentNotes.length === 0 ? (
            <ActivityEmpty
              icon={<StickyNote className="h-5 w-5" />}
              label={t("empty.notes.label")}
              cta={t("empty.notes.cta")}
              ctaHref="/notes/new"
            />
          ) : (
            <ul>
              {recentNotes.map((n) => (
                <li key={n.id}>
                  <ActivityRow
                    href={`/notes/${n.id}`}
                    primary={n.title}
                    trailing={
                      <span className="font-mono text-[11px]">
                        {formatRelative(n.updatedAt)}
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </ActivityList>

        <ActivityList
          title={t("sections.recentFiles")}
          icon={<FileText className="h-4 w-4" />}
          moreHref="/files"
          moreLabel={t("viewAll")}
        >
          {recentFiles.length === 0 ? (
            <ActivityEmpty
              icon={<FileText className="h-5 w-5" />}
              label={t("empty.files.label")}
              cta={t("empty.files.cta")}
              ctaHref="/files"
            />
          ) : (
            <ul>
              {recentFiles.map((f) => (
                <li key={f.id}>
                  <ActivityRow
                    primary={f.filename}
                    secondary={
                      <span className="font-mono">
                        {f.mimeType} · {formatBytes(f.sizeBytes)}
                      </span>
                    }
                    trailing={
                      <span className="font-mono text-[11px]">
                        {formatRelative(f.createdAt)}
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </ActivityList>
      </div>
    </div>
  );
}
