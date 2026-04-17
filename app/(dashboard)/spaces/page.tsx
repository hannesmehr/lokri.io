import { desc, eq } from "drizzle-orm";
import { Folder, FolderPlus } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { spaces } from "@/lib/db/schema";
import { formatRelative } from "@/lib/format";
import { SpaceCreateDialog } from "./_space-create-dialog";
import { SpaceDeleteButton } from "./_space-delete-button";

// A few accent gradients cycled across space cards so the wall isn't grey.
const ACCENTS = [
  "from-indigo-500/15 to-fuchsia-500/10",
  "from-emerald-500/15 to-teal-500/10",
  "from-amber-500/15 to-rose-500/10",
  "from-sky-500/15 to-indigo-500/10",
  "from-violet-500/15 to-pink-500/10",
  "from-lime-500/15 to-emerald-500/10",
];

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
          <h1 className="text-2xl font-semibold tracking-tight">Spaces</h1>
          <p className="text-sm text-muted-foreground">
            Gruppiere Notes und Files zu Themen.
          </p>
        </div>
        <SpaceCreateDialog />
      </div>

      {rows.length === 0 ? (
        <Card className="border-dashed">
          <CardHeader className="items-center text-center">
            <div className="mb-2 grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
              <FolderPlus className="h-6 w-6" />
            </div>
            <CardTitle>Noch keine Spaces</CardTitle>
            <CardDescription>
              Spaces sind optional — lege deinen ersten an, um Inhalte
              thematisch zu gruppieren.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s, i) => (
            <Card
              key={s.id}
              className="group relative overflow-hidden transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br opacity-60 transition-opacity group-hover:opacity-80 ${ACCENTS[i % ACCENTS.length]}`}
                aria-hidden
              />
              <div className="relative">
                <CardHeader>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-md bg-background/70 text-foreground backdrop-blur-sm">
                      <Folder className="h-4 w-4" />
                    </div>
                    <span className="text-xs text-muted-foreground">
                      aktualisiert {formatRelative(s.updatedAt)}
                    </span>
                  </div>
                  <CardTitle className="line-clamp-1">
                    <Link
                      href={`/notes?spaceId=${s.id}`}
                      className="hover:underline"
                    >
                      {s.name}
                    </Link>
                  </CardTitle>
                  <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                    {s.description || (
                      <span className="italic">Keine Beschreibung</span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2 pb-4 text-sm text-muted-foreground">
                  <div className="flex gap-3">
                    <Link
                      href={`/notes?spaceId=${s.id}`}
                      className="hover:text-foreground"
                    >
                      Notes →
                    </Link>
                    <Link
                      href={`/files?spaceId=${s.id}`}
                      className="hover:text-foreground"
                    >
                      Files →
                    </Link>
                  </div>
                  <SpaceDeleteButton id={s.id} name={s.name} />
                </CardContent>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
