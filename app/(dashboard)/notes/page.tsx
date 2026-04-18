import { and, desc, eq } from "drizzle-orm";
import { ChevronRight, Plus, StickyNote } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { McpHiddenToggle } from "../_mcp-hidden-toggle";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { notes, spaces } from "@/lib/db/schema";
import { formatRelative } from "@/lib/format";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ spaceId?: string }>;
}) {
  const t = await getTranslations("notes.list");
  const tEmpty = await getTranslations("notes.empty");
  const tActions = await getTranslations("notes.actions");
  const { ownerAccountId } = await requireSessionWithAccount();
  const { spaceId } = await searchParams;

  const conds = [eq(notes.ownerAccountId, ownerAccountId)];
  if (spaceId) conds.push(eq(notes.spaceId, spaceId));

  const rows = await db
    .select({
      id: notes.id,
      title: notes.title,
      contentText: notes.contentText,
      spaceId: notes.spaceId,
      mcpHidden: notes.mcpHidden,
      createdAt: notes.createdAt,
      updatedAt: notes.updatedAt,
    })
    .from(notes)
    .where(and(...conds))
    .orderBy(desc(notes.updatedAt))
    .limit(100);

  let activeSpace: { id: string; name: string } | null = null;
  if (spaceId) {
    const [space] = await db
      .select({ id: spaces.id, name: spaces.name })
      .from(spaces)
      .where(and(eq(spaces.id, spaceId), eq(spaces.ownerAccountId, ownerAccountId)))
      .limit(1);
    activeSpace = space ?? null;
  }

  const newHref = activeSpace
    ? `/notes/new?spaceId=${activeSpace.id}`
    : "/notes/new";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-semibold tracking-tight leading-tight">
              {t("title")}
            </h1>
            {activeSpace ? (
              <Badge variant="secondary" className="gap-1">
                {activeSpace.name}
                <Link
                  href="/notes"
                  className="opacity-60 hover:opacity-100"
                  aria-label={t("clearFilter")}
                >
                  ×
                </Link>
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeSpace
              ? t("subtitleFiltered", { name: activeSpace.name })
              : t("subtitleAll")}
          </p>
        </div>
        <Button
          nativeButton={false}
          render={
            <Link href={newHref}>
              <Plus className="h-4 w-4" />
              {t("new")}
            </Link>
          }
        />
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="items-center text-center">
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <StickyNote className="h-6 w-6" />
            </div>
            <CardTitle>{tEmpty("title")}</CardTitle>
            <CardDescription>{tEmpty("body")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {rows.map((n) => (
            <div
              key={n.id}
              className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <Link
                href={`/notes/${n.id}`}
                className="flex min-w-0 flex-1 items-center gap-4"
              >
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border bg-muted text-foreground">
                  <StickyNote className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{n.title}</span>
                    {n.mcpHidden ? (
                      <span className="shrink-0 rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {tActions("hiddenFromMcp")}
                      </span>
                    ) : null}
                  </div>
                  <div className="line-clamp-2 text-xs text-muted-foreground">
                    {n.contentText.replace(/\s+/g, " ").slice(0, 140)}
                  </div>
                </div>
                <div className="shrink-0 font-mono text-xs text-muted-foreground">
                  {formatRelative(n.updatedAt)}
                </div>
              </Link>
              <McpHiddenToggle
                kind="notes"
                id={n.id}
                hidden={n.mcpHidden}
                compact
              />
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
