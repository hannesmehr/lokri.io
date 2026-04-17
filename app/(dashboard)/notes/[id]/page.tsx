import { and, desc, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { requireSessionWithAccount } from "@/lib/api/session";
import { db } from "@/lib/db";
import { notes, spaces } from "@/lib/db/schema";
import { NoteEditorForm } from "../_note-editor-form";
import { NoteDeleteButton } from "../_note-delete-button";

export default async function NoteEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { ownerAccountId } = await requireSessionWithAccount();
  const { id } = await params;

  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.ownerAccountId, ownerAccountId)))
    .limit(1);
  if (!note) notFound();

  const spacesList = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.ownerAccountId, ownerAccountId))
    .orderBy(desc(spaces.updatedAt));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{note.title}</h1>
          <p className="text-sm text-muted-foreground">
            Zuletzt aktualisiert:{" "}
            {new Date(note.updatedAt).toLocaleString("de-DE")}
          </p>
        </div>
        <NoteDeleteButton id={note.id} />
      </div>
      <NoteEditorForm
        noteId={note.id}
        initialTitle={note.title}
        initialContent={note.contentText}
        initialSpaceId={note.spaceId}
        spaces={spacesList}
      />
    </div>
  );
}
