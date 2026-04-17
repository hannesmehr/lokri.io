import { asc, eq } from "drizzle-orm";
import { HardDrive } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { storageProviders } from "@/lib/db/schema";
import { ProviderList } from "./_provider-list";

export default async function StorageSettingsPage() {
  const { ownerAccountId } = await requireSessionWithAccount();
  const providers = await db
    .select({
      id: storageProviders.id,
      name: storageProviders.name,
      type: storageProviders.type,
      createdAt: storageProviders.createdAt,
    })
    .from(storageProviders)
    .where(eq(storageProviders.ownerAccountId, ownerAccountId))
    .orderBy(asc(storageProviders.createdAt));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-cyan-500/15 to-sky-500/15 text-cyan-700 dark:text-cyan-400">
            <HardDrive className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Storage-Provider</CardTitle>
            <CardDescription>
              Der interne Vercel-Blob-Storage ist immer aktiv. Externe
              S3-Provider kannst du hinzufügen und anschließend einzelnen
              Spaces zuweisen — Daten in dem Space gehen dann in deinen
              eigenen Bucket.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ProviderList initial={providers} />
      </CardContent>
    </Card>
  );
}
