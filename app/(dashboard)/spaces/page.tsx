import { desc, eq } from "drizzle-orm";
import { Folder, FolderPlus } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
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

export default async function SpacesPage() {
  const t = await getTranslations("spaces.list");
  const tEmpty = await getTranslations("spaces.empty");
  const { ownerAccountId } = await requireSessionWithAccount();
  const rows = await db
    .select()
    .from(spaces)
    .where(eq(spaces.ownerAccountId, ownerAccountId))
    .orderBy(desc(spaces.updatedAt));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight leading-tight">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle")}
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
            <CardTitle>{tEmpty("title")}</CardTitle>
            <CardDescription>{tEmpty("body")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((s) => (
            <Card
              key={s.id}
              className="group border bg-card transition-colors hover:border-foreground/20"
            >
              <div>
                <CardHeader>
                  <div className="mb-2 flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-md border bg-muted text-foreground">
                      <Folder className="h-4 w-4" />
                    </div>
                    <span className="font-mono text-xs text-muted-foreground">
                      {t("updatedAt", { relative: formatRelative(s.updatedAt) })}
                    </span>
                  </div>
                  <CardTitle className="line-clamp-1">
                    <Link
                      href={`/spaces/${s.id}`}
                      className="hover:underline"
                    >
                      {s.name}
                    </Link>
                  </CardTitle>
                  <CardDescription className="line-clamp-2 min-h-[2.5rem]">
                    {s.description || (
                      <span className="italic">{t("emptyDescription")}</span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-2 pb-4 text-sm text-muted-foreground">
                  <div className="flex gap-3">
                    <Link
                      href={`/spaces/${s.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {t("open")} →
                    </Link>
                    <Link
                      href={`/notes?spaceId=${s.id}`}
                      className="hover:text-foreground"
                    >
                      {t("notes")}
                    </Link>
                    <Link
                      href={`/files?spaceId=${s.id}`}
                      className="hover:text-foreground"
                    >
                      {t("files")}
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
