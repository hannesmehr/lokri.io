import { desc, eq } from "drizzle-orm";
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
import { spaces } from "@/lib/db/schema";
import { SpaceCreateDialog } from "./_space-create-dialog";
import { SpaceDeleteButton } from "./_space-delete-button";

export default async function SpacesPage() {
  const { ownerAccountId } = await requireSessionWithAccount();
  const rows = await db
    .select()
    .from(spaces)
    .where(eq(spaces.ownerAccountId, ownerAccountId))
    .orderBy(desc(spaces.updatedAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Spaces</h1>
          <p className="text-sm text-muted-foreground">
            Sortiere Notes und Files in Spaces.
          </p>
        </div>
        <SpaceCreateDialog />
      </div>

      {rows.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Noch keine Spaces</CardTitle>
            <CardDescription>
              Spaces sind optional — Notes und Files funktionieren auch ohne.
              Lege deinen ersten Space an, um Inhalte zu gruppieren.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((s) => (
            <Card key={s.id} className="flex flex-col">
              <CardHeader className="flex-1">
                <CardTitle>
                  <Link href={`/notes?spaceId=${s.id}`} className="hover:underline">
                    {s.name}
                  </Link>
                </CardTitle>
                <CardDescription>
                  {s.description || (
                    <span className="italic">Keine Beschreibung</span>
                  )}
                </CardDescription>
              </CardHeader>
              <div className="flex items-center justify-between gap-2 px-6 pb-4 text-sm text-muted-foreground">
                <div>
                  <Link href={`/notes?spaceId=${s.id}`} className="hover:underline">
                    Notes
                  </Link>{" "}
                  ·{" "}
                  <Link href={`/files?spaceId=${s.id}`} className="hover:underline">
                    Files
                  </Link>
                </div>
                <SpaceDeleteButton id={s.id} name={s.name} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
