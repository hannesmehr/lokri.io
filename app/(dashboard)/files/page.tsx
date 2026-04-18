import { and, desc, eq } from "drizzle-orm";
import {
  Download,
  Ellipsis,
  File as FileIcon,
  FileText,
  Image as ImageIcon,
  Music,
  Video,
} from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { files, spaces } from "@/lib/db/schema";
import { formatBytes, formatRelative } from "@/lib/format";
import { McpHiddenToggle } from "../_mcp-hidden-toggle";
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
  const t = await getTranslations("files.list");
  const tEmpty = await getTranslations("files.empty");
  const tActions = await getTranslations("files.actions");
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
        <div className="flex items-center gap-3">
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">
            {t("title")}
          </h1>
          {activeSpace ? (
            <Badge variant="secondary" className="gap-1">
              {activeSpace.name}
              <Link
                href="/files"
                className="opacity-60 hover:opacity-100"
                aria-label={t("clearFilter")}
              >
                ×
              </Link>
            </Badge>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      <FileUploader spaces={spacesList} defaultSpaceId={spaceId ?? null} />

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="items-center text-center">
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <FileIcon className="h-6 w-6" />
            </div>
            <CardTitle>{tEmpty("title")}</CardTitle>
            <CardDescription>{tEmpty("body")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {rows.map((f) => {
            const Icon = iconFor(f.mimeType);
            return (
              <div
                key={f.id}
                className="flex items-start gap-3 px-4 py-3 text-sm md:items-center md:gap-4"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border bg-muted text-foreground">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{f.filename}</span>
                    {f.mcpHidden ? (
                      <span className="shrink-0 rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {t("hiddenFromMcp")}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
                    {f.mimeType} · {formatBytes(f.sizeBytes)} ·{" "}
                    {formatRelative(f.createdAt)}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <McpHiddenToggle
                    kind="files"
                    id={f.id}
                    hidden={f.mcpHidden}
                    compact
                  />
                </div>
                <div className="hidden items-center gap-1 md:flex">
                  <Button
                    variant="ghost"
                    size="sm"
                    render={
                      <a
                        href={`/api/files/${f.id}/content`}
                        target="_blank"
                        rel="noopener"
                        aria-label={t("downloadAriaLabel", { name: f.filename })}
                      />
                    }
                    className="gap-1.5 text-muted-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {tActions("download")}
                  </Button>
                  <FileDeleteButton id={f.id} name={f.filename} />
                </div>
                <div className="md:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={tActions("download")}
                          className="h-8 w-8 text-muted-foreground"
                        >
                          <Ellipsis className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end" className="min-w-44">
                      <DropdownMenuItem
                        render={
                          <a
                            href={`/api/files/${f.id}/content`}
                            target="_blank"
                            rel="noopener"
                          />
                        }
                      >
                        <Download className="h-4 w-4" />
                        {tActions("download")}
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <FileDeleteButton id={f.id} name={f.filename} mobile />
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
