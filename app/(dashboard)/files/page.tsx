import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files, spaces } from "@/lib/db/schema";
import { FileUploader } from "./_file-uploader";
import { FileDeleteButton } from "./_file-delete-button";

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
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
    ? spacesList.find((s) => s.id === spaceId) ?? null
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Files</h1>
        <p className="text-sm text-muted-foreground">
          {activeSpace ? (
            <>
              Gefiltert auf Space{" "}
              <strong className="text-foreground">{activeSpace.name}</strong>
              {" · "}
              <Link href="/files" className="underline hover:no-underline">
                Filter entfernen
              </Link>
            </>
          ) : (
            "10 MB pro File · text/* und application/json werden chunked + embedded."
          )}
        </p>
      </div>

      <FileUploader spaces={spacesList} defaultSpaceId={spaceId ?? null} />

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Files</CardTitle>
            <CardDescription>
              Lade Dateien hoch, um sie über MCP abrufbar zu machen.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((f) => (
            <div
              key={f.id}
              className="flex items-center justify-between gap-4 rounded-md border p-3 text-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{f.filename}</div>
                <div className="text-xs text-muted-foreground">
                  {f.mimeType} · {formatBytes(f.sizeBytes)} ·{" "}
                  {new Date(f.createdAt).toLocaleString("de-DE")}
                </div>
              </div>
              <a
                href={`/api/files/${f.id}/content`}
                target="_blank"
                rel="noopener"
                className="text-xs underline hover:no-underline"
              >
                Download
              </a>
              <FileDeleteButton id={f.id} name={f.filename} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
