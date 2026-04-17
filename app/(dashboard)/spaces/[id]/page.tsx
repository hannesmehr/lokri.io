import { and, desc, eq } from "drizzle-orm";
import { CloudCog, FileText, Folder, HardDrive, StickyNote } from "lucide-react";
import Link from "next/link";
import { notFound as nextNotFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files, notes, spaces, storageProviders } from "@/lib/db/schema";
import { formatRelative } from "@/lib/format";
import { BucketBrowser } from "./_bucket-browser";

type Params = { params: Promise<{ id: string }> };

export default async function SpaceDetailPage({ params }: Params) {
  const { ownerAccountId } = await requireSessionWithAccount();
  const { id } = await params;

  const [space] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.id, id), eq(spaces.ownerAccountId, ownerAccountId)))
    .limit(1);
  if (!space) nextNotFound();

  const [provider, noteCount, fileCount] = await Promise.all([
    space.storageProviderId
      ? db
          .select({
            id: storageProviders.id,
            name: storageProviders.name,
            type: storageProviders.type,
          })
          .from(storageProviders)
          .where(eq(storageProviders.id, space.storageProviderId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    db.$count(
      notes,
      and(
        eq(notes.ownerAccountId, ownerAccountId),
        eq(notes.spaceId, id),
      ),
    ),
    db.$count(
      files,
      and(
        eq(files.ownerAccountId, ownerAccountId),
        eq(files.spaceId, id),
      ),
    ),
  ]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            href="/spaces"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            ← Spaces
          </Link>
          <h1 className="mt-1 font-display text-4xl leading-tight">
            {space.name}
          </h1>
          {space.description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {space.description}
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            Erstellt {formatRelative(space.createdAt)} · zuletzt geändert{" "}
            {formatRelative(space.updatedAt)}
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          icon={<StickyNote className="h-4 w-4" />}
          label="Notes"
          value={noteCount}
          href={`/notes?spaceId=${space.id}`}
        />
        <Stat
          icon={<FileText className="h-4 w-4" />}
          label="Files (intern)"
          value={fileCount}
          href={`/files?spaceId=${space.id}`}
        />
        <div className="rounded-xl border bg-card/60 p-4">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {provider ? (
              <CloudCog className="h-3.5 w-3.5" />
            ) : (
              <HardDrive className="h-3.5 w-3.5" />
            )}
            Storage
          </div>
          <div className="mt-1.5 text-sm">
            {provider ? (
              <span className="inline-flex items-center gap-1">
                <span className="font-medium">{provider.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({provider.type.toUpperCase()})
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                lokri-managed (Standard)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Unified browser — internal and external behave identically */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-emerald-500/15 to-teal-500/15 text-emerald-700 dark:text-emerald-400">
              <Folder className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>
                {provider ? "Bucket-Inhalt" : "Dateien"}
              </CardTitle>
              <CardDescription>
                {provider ? (
                  <>
                    Live-Listing deines Buckets unter dem konfigurierten
                    Path-Prefix. Dateien, die andere Tools bereits hochgeladen
                    haben, tauchen hier automatisch auf.
                  </>
                ) : (
                  <>
                    Alle Dateien im Space. Uploads macht du weiterhin auf der
                    <Link
                      href={`/files?spaceId=${space.id}`}
                      className="ml-1 underline underline-offset-4"
                    >
                      Files-Seite
                    </Link>
                    .
                  </>
                )}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <BucketBrowser
            spaceId={space.id}
            defaultProviderName={provider?.name ?? "lokri-managed"}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border bg-card/60 p-4 transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
    </Link>
  );
}
