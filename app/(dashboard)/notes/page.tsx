import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { notes, spaces } from "@/lib/db/schema";

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Notes</h1>
          <p className="text-sm text-muted-foreground">
            {activeSpace ? (
              <>
                Gefiltert auf Space{" "}
                <strong className="text-foreground">{activeSpace.name}</strong>
                {" · "}
                <Link href="/notes" className="underline hover:no-underline">
                  Filter entfernen
                </Link>
              </>
            ) : (
              "Alle Notes deines Accounts."
            )}
          </p>
        </div>
        <Button
          nativeButton={false}
          render={
            <Link
              href={
                activeSpace
                  ? `/notes/new?spaceId=${activeSpace.id}`
                  : "/notes/new"
              }
            >
              Neue Note
            </Link>
          }
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Notes</CardTitle>
            <CardDescription>
              Notes werden semantisch indiziert und über MCP durchsuchbar.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((n) => (
            <Link
              key={n.id}
              href={`/notes/${n.id}`}
              className="block rounded-md border p-4 transition-colors hover:bg-muted/50"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div className="font-medium">{n.title}</div>
                <div className="shrink-0 text-xs text-muted-foreground">
                  {new Date(n.updatedAt).toLocaleString("de-DE")}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
