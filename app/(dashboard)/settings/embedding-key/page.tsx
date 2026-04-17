import { eq } from "drizzle-orm";
import { KeyRound } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { embeddingKeys } from "@/lib/db/schema";
import { EmbeddingKeyManager } from "./_embedding-key-manager";

export default async function EmbeddingKeyPage() {
  const { ownerAccountId } = await requireSessionWithAccount();

  const [row] = await db
    .select({
      id: embeddingKeys.id,
      provider: embeddingKeys.provider,
      model: embeddingKeys.model,
      lastUsedAt: embeddingKeys.lastUsedAt,
      createdAt: embeddingKeys.createdAt,
    })
    .from(embeddingKeys)
    .where(eq(embeddingKeys.ownerAccountId, ownerAccountId))
    .limit(1);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/15 to-fuchsia-500/15 text-indigo-700 dark:text-indigo-300">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <CardTitle>Eigener Embedding-API-Key (BYOK)</CardTitle>
            <CardDescription>
              Statt über die Vercel AI Gateway läuft jede Embedding-Anfrage
              direkt gegen deinen OpenAI-Account. Keine zusätzlichen Gebühren
              bei uns, vollständige Audit-Spur bei dir. Solange kein Key
              hinterlegt ist, wird die Gateway-Default-Route verwendet.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <EmbeddingKeyManager
          initial={
            row
              ? {
                  id: row.id,
                  provider: row.provider,
                  model: row.model,
                  lastUsedAt: row.lastUsedAt
                    ? row.lastUsedAt.toISOString()
                    : null,
                  createdAt: row.createdAt.toISOString(),
                }
              : null
          }
        />
      </CardContent>
    </Card>
  );
}
