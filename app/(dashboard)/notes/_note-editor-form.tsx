"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "./_markdown";

interface Props {
  noteId?: string;
  initialTitle?: string;
  initialContent?: string;
  initialSpaceId?: string | null;
  spaces: Array<{ id: string; name: string }>;
}

export function NoteEditorForm({
  noteId,
  initialTitle = "",
  initialContent = "",
  initialSpaceId = null,
  spaces,
}: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [spaceId, setSpaceId] = useState<string>(initialSpaceId ?? "");
  const [loading, setLoading] = useState(false);
  const isEdit = Boolean(noteId);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const body: Record<string, unknown> = {
      title,
      content,
      spaceId: spaceId || null,
    };
    const url = isEdit ? `/api/notes/${noteId}` : "/api/notes";
    const res = await fetch(url, {
      method: isEdit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error || "Konnte Note nicht speichern.");
      return;
    }
    toast.success(isEdit ? "Note aktualisiert." : "Note angelegt.");
    if (!isEdit) {
      const { note } = await res.json();
      router.push(`/notes/${note.id}`);
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">Titel</Label>
        <Input
          id="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="space">Space (optional)</Label>
        <select
          id="space"
          className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
          value={spaceId}
          onChange={(e) => setSpaceId(e.target.value)}
        >
          <option value="">— kein Space —</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="content">Inhalt (Markdown)</Label>
          <span className="text-xs text-muted-foreground">
            Unterstützt: <code>**bold**</code> <code>_italic_</code>{" "}
            <code># heading</code> <code>- list</code> <code>[link](url)</code>
          </span>
        </div>
        <Tabs defaultValue="edit" className="gap-2">
          <TabsList>
            <TabsTrigger value="edit">Bearbeiten</TabsTrigger>
            <TabsTrigger value="preview">Vorschau</TabsTrigger>
          </TabsList>
          <TabsContent value="edit">
            <Textarea
              id="content"
              required
              rows={16}
              className="font-mono text-[13px]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </TabsContent>
          <TabsContent value="preview">
            <div className="min-h-[16rem] rounded-md border bg-background p-4">
              {content.trim() ? (
                <Markdown>{content}</Markdown>
              ) : (
                <p className="text-sm italic text-muted-foreground">
                  Noch nichts zu rendern.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={loading}
        >
          Abbrechen
        </Button>
        <Button type="submit" disabled={loading || !title || !content}>
          {loading ? "Speichern…" : isEdit ? "Änderungen speichern" : "Anlegen"}
        </Button>
      </div>
    </form>
  );
}
