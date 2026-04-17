import { and, desc, eq } from "drizzle-orm";
import { Download, FileText, Image as ImageIcon, Music, Video, File as FileIcon } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files, spaces } from "@/lib/db/schema";
import { formatBytes, formatRelative } from "@/lib/format";
import { FileDeleteButton } from "./_file-delete-button";
import { FileUploader } from "./_file-uploader";

function iconFor(mimeType: string) {
  if (mimeType.startsWith("image/")) return ImageIcon;
  if (mimeType.startsWith("video/")) return Video;
  if (mimeType.startsWith("audio/")) return Music;
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/pdf"
  )
    return FileText;
  return FileIcon;
}

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ spaceId?: string }>;
}) {
  const { ownerAccountId } = await requireSessionWithAccount();
  const { spaceId } = await searchParams;

  const spacesList = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.ownerAccountId, ownerAccountId))
    .orderBy(desc(spaces.updatedAt));

  const conds = [eq(files.ownerAccountId, ownerAccountId)];
  if (spaceId) conds.push(eq(files.spaceId, spaceId));

  const rows = await db
    .select()
    .from(files)
    .where(and(...conds))
    .orderBy(desc(files.createdAt))
    .limit(200);

  const activeSpace = spaceId
    ? (spacesList.find((s) => s.id === spaceId) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Files</h1>
          {activeSpace ? (
            <Badge variant="secondary" className="gap-1">
              {activeSpace.name}
              <Link
                href="/files"
                className="opacity-60 hover:opacity-100"
                aria-label="Filter entfernen"
              >
                ×
              </Link>
            </Badge>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Private Blob-Storage. 10 MB pro File. Textinhalt (text/*, json) wird
          gechunked und embedded.
        </p>
      </div>

      <FileUploader spaces={spacesList} defaultSpaceId={spaceId ?? null} />

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="items-center text-center">
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <FileIcon className="h-6 w-6" />
            </div>
            <CardTitle>Noch keine Files</CardTitle>
            <CardDescription>
              Lade Dateien hoch — sie werden über MCP (<code>list_files</code>,
              <code> search</code>) erreichbar.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {rows.map((f) => {
            const Icon = iconFor(f.mimeType);
            return (
              <div
                key={f.id}
                className="flex items-center gap-4 px-4 py-3 text-sm"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 text-indigo-700 dark:text-indigo-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{f.filename}</div>
                  <div className="text-xs text-muted-foreground">
                    {f.mimeType} · {formatBytes(f.sizeBytes)} ·{" "}
                    {formatRelative(f.createdAt)}
                  </div>
                </div>
                <a
                  href={`/api/files/${f.id}/content`}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </a>
                <FileDeleteButton id={f.id} name={f.filename} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
