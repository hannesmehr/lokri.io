"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  spaces: Array<{ id: string; name: string }>;
  defaultSpaceId?: string | null;
}

export function FileUploader({ spaces, defaultSpaceId = null }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [spaceId, setSpaceId] = useState<string>(defaultSpaceId ?? "");
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function uploadFile(file: File) {
    if (file.size === 0) return toast.error("Datei ist leer.");
    if (file.size > MAX_BYTES)
      return toast.error(
        `Datei ist zu groß (max ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB).`,
      );

    setUploading(true);
    const form = new FormData();
    form.set("file", file);
    if (spaceId) form.set("space_id", spaceId);

    const res = await fetch("/api/files", { method: "POST", body: form });
    setUploading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error || "Upload fehlgeschlagen.");
      return;
    }
    toast.success(`${file.name} hochgeladen.`);
    if (fileInput.current) fileInput.current.value = "";
    router.refresh();
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void uploadFile(file);
  }

  return (
    <div className="space-y-3">
      {spaces.length > 0 && (
        <div className="flex items-center gap-2 text-sm">
          <Label htmlFor="upload-space" className="text-muted-foreground">
            Space:
          </Label>
          <select
            id="upload-space"
            className="h-8 rounded-md border bg-transparent px-2 text-sm"
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            disabled={uploading}
          >
            <option value="">— keiner —</option>
            {spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver ? "border-foreground bg-muted/40" : "border-muted"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <p className="text-sm text-muted-foreground">
          {uploading ? "Lädt hoch…" : "Drag & Drop oder klicken zum Hochladen."}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Max 10 MB pro Datei.
        </p>
        <div className="mt-4">
          <input
            ref={fileInput}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void uploadFile(f);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            Datei auswählen
          </Button>
        </div>
      </div>
    </div>
  );
}
