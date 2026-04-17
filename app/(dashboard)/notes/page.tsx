import { and, desc, eq } from "drizzle-orm";
import { ChevronRight, Plus, StickyNote } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { notes, spaces } from "@/lib/db/schema";
import { formatRelative } from "@/lib/format";

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ spaceId?: string }>;
}) {
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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Notes</h1>
            {activeSpace ? (
              <Badge variant="secondary" className="gap-1">
                {activeSpace.name}
                <Link
                  href="/notes"
                  className="opacity-60 hover:opacity-100"
                  aria-label="Filter entfernen"
                >
                  ×
                </Link>
              </Badge>
            ) : null}
          </div>
          <p className="text-sm text-muted-foreground">
            {activeSpace
              ? `Notes aus dem Space "${activeSpace.name}".`
              : "Alle Notes deines Accounts."}
          </p>
        </div>
        <Button
          nativeButton={false}
          render={
            <Link href={newHref}>
              <Plus className="h-4 w-4" />
              Neue Note
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
            <CardTitle>Noch keine Notes</CardTitle>
            <CardDescription>
              Notes werden automatisch semantisch indiziert und über MCP
              durchsuchbar.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="divide-y rounded-xl border bg-card">
          {rows.map((n) => (
            <Link
              key={n.id}
              href={`/notes/${n.id}`}
              className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
                <StickyNote className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{n.title}</div>
                <div className="line-clamp-1 text-xs text-muted-foreground">
                  {n.contentText.replace(/\s+/g, " ").slice(0, 140)}
                </div>
              </div>
              <div className="shrink-0 text-xs text-muted-foreground">
                {formatRelative(n.updatedAt)}
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
