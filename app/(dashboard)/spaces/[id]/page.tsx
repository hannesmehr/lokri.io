import { and, eq } from "drizzle-orm";
import { CloudCog, FileText, Folder, HardDrive, StickyNote } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound as nextNotFound } from "next/navigation";
import { KpiCard } from "@/components/kpi-card";
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
import { ReindexSpaceButton } from "./_reindex-button";

type Params = { params: Promise<{ id: string }> };

export default async function SpaceDetailPage({ params }: Params) {
  const t = await getTranslations("spaces.detail");
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
            {t("back")}
          </Link>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight leading-tight">
            {space.name}
          </h1>
          {space.description ? (
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {space.description}
            </p>
          ) : null}
          <p className="mt-2 flex flex-wrap gap-1 font-mono text-xs text-muted-foreground">
            <span>{t("createdAt", { relative: formatRelative(space.createdAt) })}</span>
            <span>·</span>
            <span>{t("updatedAt", { relative: formatRelative(space.updatedAt) })}</span>
          </p>
        </div>
        {fileCount > 0 ? (
          <div className="flex items-center gap-2">
            <ReindexSpaceButton spaceId={space.id} />
          </div>
        ) : null}
      </div>

      {/* Quick stats */}
      <div className="grid gap-3 md:grid-cols-3">
        <Stat
          icon={<StickyNote className="h-4 w-4" />}
          label={t("stats.notes")}
          value={noteCount}
          href={`/notes?spaceId=${space.id}`}
        />
        <Stat
          icon={<FileText className="h-4 w-4" />}
          label={t("stats.files")}
          value={fileCount}
          href={`/files?spaceId=${space.id}`}
        />
        <KpiCard
          label={t("stats.storage")}
          value={
            provider ? (
              <span className="text-base font-semibold">{provider.name}</span>
            ) : (
              <span className="text-base font-semibold">{t("storageManaged")}</span>
            )
          }
          valueSuffix={
            provider ? (
              <span>{provider.type.toUpperCase()}</span>
            ) : undefined
          }
          meta={
            <span className="inline-flex items-center gap-1.5">
              {provider ? (
                <CloudCog className="h-3.5 w-3.5" />
              ) : (
                <HardDrive className="h-3.5 w-3.5" />
              )}
              {provider ? provider.name : t("stats.internal")}
            </span>
          }
        />
      </div>

      {/* Unified browser — internal and external behave identically */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-lg border bg-muted text-foreground">
              <Folder className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>
                {provider ? t("browserTitle") : t("browserTitleInternal")}
              </CardTitle>
              <CardDescription>
                {provider ? (
                  t("browserDescriptionExternal")
                ) : (
                  <>
                    {t("browserDescriptionInternalPrefix")}{" "}
                    <Link
                      href={`/files?spaceId=${space.id}`}
                      className="underline underline-offset-4"
                    >
                      {t("browserDescriptionInternalLink")}
                    </Link>
                    {t("browserDescriptionInternalSuffix")}
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
      className="rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20"
    >
      <KpiCard
        label={label}
        value={value}
        meta={<span className="inline-flex items-center gap-1.5">{icon}</span>}
        className="border-0 bg-transparent p-0"
      />
    </Link>
  );
}
