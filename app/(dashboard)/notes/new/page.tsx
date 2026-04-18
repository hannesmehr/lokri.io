import { desc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { spaces } from "@/lib/db/schema";
import { NoteEditorForm } from "../_note-editor-form";

export default async function NewNotePage({
  searchParams,
}: {
  searchParams: Promise<{ spaceId?: string }>;
}) {
  const t = await getTranslations("notes.editor");
  const { ownerAccountId } = await requireSessionWithAccount();
  const { spaceId } = await searchParams;

  const spacesList = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.ownerAccountId, ownerAccountId))
    .orderBy(desc(spaces.updatedAt));

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-semibold tracking-tight leading-tight">
        {t("newTitle")}
      </h1>
      <NoteEditorForm
        initialSpaceId={spaceId ?? null}
        spaces={spacesList}
      />
    </div>
  );
}
