import { and, desc, eq, isNull } from "drizzle-orm";
import { FileText, Key, Plus, StickyNote, Upload } from "lucide-react";
import Link from "next/link";
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
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {firstName ? `Hi, ${firstName}` : "Dashboard"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            MCP-Gateway für deine KI-Clients.
          </p>
        </div>
        <Link
          href="/billing"
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors hover:border-foreground/20"
          aria-label={`Plan: ${quota.planId} — zum Billing`}
        >
          <span className="text-muted-foreground">Plan</span>
          <span className="font-mono font-medium">{quota.planId}</span>
        </Link>
      </header>

      <OnboardingCard
        hasSpace={spaceCount > 0}
        hasNote={quota.notesCount > 0}
        hasToken={tokenCount > 0}
      />

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <QuickActionCard
          href="/notes/new"
          icon={<Plus className="h-4 w-4" />}
          label="Neue Note"
          description="Markdown oder Plaintext, wird automatisch embedded."
        />
        <QuickActionCard
          href="/files"
          icon={<Upload className="h-4 w-4" />}
          label="File hochladen"
          description="Drag & Drop, bis 10 MB pro Datei."
        />
        <QuickActionCard
          href="/settings/mcp"
          icon={<Key className="h-4 w-4" />}
          label="MCP-Token"
          description="Claude Desktop, ChatGPT, Cursor anbinden."
        />
      </div>

      {/* Kontingent */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Kontingent
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <KpiCard
            label="Storage"
            value={formatBytes(quota.usedBytes)}
            valueSuffix={<span className="font-mono">von {formatBytes(quota.maxBytes)}</span>}
            progress={{ used: quota.usedBytes, max: quota.maxBytes }}
          />
          <KpiCard
            label="Files"
            value={quota.filesCount.toLocaleString("de-DE")}
            valueSuffix={<span className="font-mono">von {quota.maxFiles}</span>}
            progress={{ used: quota.filesCount, max: quota.maxFiles }}
          />
          <KpiCard
            label="Notes"
            value={quota.notesCount.toLocaleString("de-DE")}
            valueSuffix={<span className="font-mono">von {quota.maxNotes}</span>}
            progress={{ used: quota.notesCount, max: quota.maxNotes }}
          />
        </div>
      </section>

      {/* Activity */}
      <div className="grid gap-3 lg:grid-cols-2">
        <ActivityList
          title="Letzte Notes"
          icon={<StickyNote className="h-4 w-4" />}
          moreHref="/notes"
        >
          {recentNotes.length === 0 ? (
            <ActivityEmpty
              icon={<StickyNote className="h-5 w-5" />}
              label="Noch keine Notes"
              cta="Erste anlegen"
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
          title="Letzte Files"
          icon={<FileText className="h-4 w-4" />}
          moreHref="/files"
        >
          {recentFiles.length === 0 ? (
            <ActivityEmpty
              icon={<FileText className="h-5 w-5" />}
              label="Noch keine Files"
              cta="Erste hochladen"
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
