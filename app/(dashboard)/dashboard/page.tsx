import { desc, eq } from "drizzle-orm";
import { FileText, Key, Plus, Sparkles, StickyNote, Upload } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files as filesTable, notes as notesTable } from "@/lib/db/schema";
import { formatBytes, formatRelative } from "@/lib/format";
import { getQuota } from "@/lib/quota";
import { QuotaRing } from "./_quota-ring";

export default async function DashboardPage() {
  const { session, ownerAccountId } = await requireSessionWithAccount();
  const [quota, recentNotes, recentFiles] = await Promise.all([
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
  ]);

  const firstName = session.user.name?.split(" ")[0] ?? "Hallo";

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-indigo-500/8 via-background to-fuchsia-500/10 p-8 sm:p-10"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 600px 200px at 20% 0%, color-mix(in oklch, var(--chart-1) 15%, transparent), transparent 70%)," +
            "radial-gradient(ellipse 500px 300px at 100% 100%, color-mix(in oklch, var(--chart-2) 18%, transparent), transparent 60%)," +
            "radial-gradient(circle at 1px 1px, color-mix(in oklch, var(--foreground) 8%, transparent) 1px, transparent 0)",
          backgroundSize: "auto, auto, 20px 20px",
        }}
      >
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Dashboard
            </div>
            <h1 className="font-display mt-2 text-4xl leading-[1.05] sm:text-5xl">
              Willkommen,{" "}
              <span className="italic text-brand">{firstName}</span>.
            </h1>
            <p className="mt-3 max-w-xl text-sm text-muted-foreground sm:text-base">
              Dein persönlicher MCP-Wissens-Pool — erreichbar aus allen
              KI-Clients, die du über{" "}
              <em className="font-display italic">Settings → MCP-Tokens</em>{" "}
              verbindest.
            </p>
          </div>
          <Badge
            variant="secondary"
            className="border-indigo-500/20 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300"
          >
            Plan: {quota.planId}
          </Badge>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid gap-3 sm:grid-cols-3">
        <QuickAction
          href="/notes/new"
          icon={<Plus className="h-4 w-4" />}
          label="Neue Note"
          description="Markdown oder Plaintext, wird automatisch embedded."
        />
        <QuickAction
          href="/files"
          icon={<Upload className="h-4 w-4" />}
          label="File hochladen"
          description="Drag & Drop, bis 10 MB pro Datei."
        />
        <QuickAction
          href="/settings"
          icon={<Key className="h-4 w-4" />}
          label="MCP-Token"
          description="Claude Desktop, ChatGPT, Cursor anbinden."
        />
      </div>

      {/* Quota rings */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Kontingent
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <QuotaRing
                label="Speicher"
                value={quota.usedBytes}
                max={quota.maxBytes}
                colorVar="var(--chart-1)"
                kind="bytes"
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <QuotaRing
                label="Files"
                value={quota.filesCount}
                max={quota.maxFiles}
                colorVar="var(--chart-2)"
                kind="count"
                unitSuffix="Dateien"
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <QuotaRing
                label="Notes"
                value={quota.notesCount}
                max={quota.maxNotes}
                colorVar="var(--chart-3)"
                kind="count"
                unitSuffix="Notes"
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Letzte Notes</CardTitle>
              </div>
              <Link
                href="/notes"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Alle ansehen
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentNotes.length === 0 ? (
              <EmptyActivity
                icon={<StickyNote className="h-6 w-6 text-muted-foreground" />}
                label="Noch keine Notes"
                cta="Erste anlegen"
                href="/notes/new"
              />
            ) : (
              <ul className="space-y-1">
                {recentNotes.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={`/notes/${n.id}`}
                      className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
                    >
                      <span className="truncate">{n.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {formatRelative(n.updatedAt)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Letzte Files</CardTitle>
              </div>
              <Link
                href="/files"
                className="text-xs text-muted-foreground underline-offset-4 hover:underline"
              >
                Alle ansehen
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentFiles.length === 0 ? (
              <EmptyActivity
                icon={<FileText className="h-6 w-6 text-muted-foreground" />}
                label="Noch keine Files"
                cta="Erste hochladen"
                href="/files"
              />
            ) : (
              <ul className="space-y-1">
                {recentFiles.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{f.filename}</div>
                      <div className="text-xs text-muted-foreground">
                        {f.mimeType} · {formatBytes(f.sizeBytes)}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatRelative(f.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({
  href,
  icon,
  label,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group relative overflow-hidden rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {description}
          </div>
        </div>
      </div>
    </Link>
  );
}

function EmptyActivity({
  icon,
  label,
  cta,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  cta: string;
  href: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-8 text-center">
      {icon}
      <div className="text-sm text-muted-foreground">{label}</div>
      <Button
        size="sm"
        variant="outline"
        nativeButton={false}
        render={<Link href={href}>{cta}</Link>}
      />
    </div>
  );
}
