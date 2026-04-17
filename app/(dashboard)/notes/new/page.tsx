import { desc, eq } from "drizzle-orm";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { spaces } from "@/lib/db/schema";
import { NoteEditorForm } from "../_note-editor-form";

export default async function NewNotePage({
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

  return (
    <div className="space-y-6">
      <h1 className="font-display text-4xl leading-tight">Neue Note</h1>
      <NoteEditorForm
        initialSpaceId={spaceId ?? null}
        spaces={spacesList}
      />
    </div>
  );
}
