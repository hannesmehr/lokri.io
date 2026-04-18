"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("notes.editor");
  const tToasts = useTranslations("toasts");
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [spaceId, setSpaceId] = useState<string>(initialSpaceId ?? "");
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
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
      const data = await res.json().catch(() => ({ error: tToasts("error.generic") }));
      toast.error(data.error || t("errors.saveFailed"));
      return;
    }
    setSaved(true);
    toast.success(isEdit ? t("success.updated") : t("success.created"));
    if (!isEdit) {
      const { note } = await res.json();
      router.push(`/notes/${note.id}`);
    } else {
      router.refresh();
      setTimeout(() => setSaved(false), 1800);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">{t("titleLabel")}</Label>
        <Input
          id="title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoComplete="off"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="space">{t("spaceLabel")}</Label>
        <select
          id="space"
          className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs"
          value={spaceId}
          onChange={(e) => setSpaceId(e.target.value)}
        >
          <option value="">{t("noSpace")}</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="content">{t("contentLabel")}</Label>
          <span className="text-xs text-muted-foreground">
            {t("markdownHelp")}
          </span>
        </div>
        <Tabs defaultValue="edit" className="gap-2">
          <TabsList>
            <TabsTrigger value="edit">{t("tabs.edit")}</TabsTrigger>
            <TabsTrigger value="preview">{t("tabs.preview")}</TabsTrigger>
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
                  {t("previewEmpty")}
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-h-5 items-center gap-1.5 text-xs text-muted-foreground">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {!loading && saved ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
          <span>
            {loading
              ? t("submitSaving")
              : saved
                ? t("success.updated")
                : ""}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={loading}
        >
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={loading || !title || !content}>
          {loading
            ? t("submitSaving")
            : isEdit
              ? t("submitUpdate")
              : t("submitCreate")}
        </Button>
      </div>
    </form>
  );
}
