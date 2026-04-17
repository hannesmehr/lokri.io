"use client";

import { CheckCircle2, CloudUpload, FileUp, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";

const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  spaces: Array<{ id: string; name: string }>;
  defaultSpaceId?: string | null;
}

type Status = "idle" | "uploading" | "success" | "error";

export function FileUploader({ spaces, defaultSpaceId = null }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [spaceId, setSpaceId] = useState<string>(defaultSpaceId ?? "");
  const [dragDepth, setDragDepth] = useState(0);
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState<{ name: string; size: number } | null>(
    null,
  );
  const dragOver = dragDepth > 0;

  function validate(file: File): string | null {
    if (file.size === 0) return "Datei ist leer.";
    if (file.size > MAX_BYTES)
      return `Datei ist zu groß (max ${(MAX_BYTES / 1024 / 1024).toFixed(0)} MB).`;
    return null;
  }

  function uploadWithProgress(file: File, extraSpaceId: string) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const form = new FormData();
      form.set("file", file);
      if (extraSpaceId) form.set("space_id", extraSpaceId);

      xhr.upload.addEventListener("progress", (e) => {
        if (e.lengthComputable) {
          setProgress(Math.round((e.loaded / e.total) * 100));
        }
      });
      xhr.addEventListener("load", () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else {
          let message = `Upload fehlgeschlagen (${xhr.status})`;
          try {
            const data = JSON.parse(xhr.responseText);
            if (data?.error) message = data.error;
          } catch {
            // ignore JSON parse errors
          }
          reject(new Error(message));
        }
      });
      xhr.addEventListener("error", () => reject(new Error("Netzwerkfehler")));
      xhr.addEventListener("abort", () => reject(new Error("Abgebrochen")));
      xhr.open("POST", "/api/files");
      xhr.send(form);
    });
  }

  async function uploadFile(file: File) {
    const err = validate(file);
    if (err) {
      toast.error(err);
      return;
    }
    setStatus("uploading");
    setProgress(0);
    setActive({ name: file.name, size: file.size });
    try {
      await uploadWithProgress(file, spaceId);
      setStatus("success");
      setProgress(100);
      toast.success(`${file.name} hochgeladen.`);
      if (fileInput.current) fileInput.current.value = "";
      router.refresh();
      // Reset banner after a beat
      setTimeout(() => {
        setStatus("idle");
        setActive(null);
        setProgress(0);
      }, 1800);
    } catch (e) {
      setStatus("error");
      const message = e instanceof Error ? e.message : "Upload fehlgeschlagen.";
      toast.error(message);
    }
  }

  function onDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragDepth(0);
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
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            disabled={status === "uploading"}
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

      <label
        htmlFor="file-upload-input"
        onDragEnter={(e) => {
          e.preventDefault();
          setDragDepth((d) => d + 1);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragDepth((d) => Math.max(0, d - 1))}
        onDrop={onDrop}
        className={cn(
          "relative block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed bg-gradient-to-br from-indigo-500/5 via-fuchsia-500/5 to-amber-500/5 px-6 py-10 transition-all",
          dragOver
            ? "scale-[1.01] border-indigo-500 bg-indigo-500/10 shadow-lg"
            : "border-muted-foreground/25 hover:border-muted-foreground/40",
          status === "uploading" && "pointer-events-none",
        )}
      >
        <input
          ref={fileInput}
          id="file-upload-input"
          type="file"
          className="sr-only"
          disabled={status === "uploading"}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadFile(f);
          }}
        />
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className={cn(
              "grid h-14 w-14 place-items-center rounded-full transition-all",
              status === "uploading"
                ? "bg-indigo-500/15 text-indigo-600 dark:text-indigo-300"
                : status === "success"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : status === "error"
                    ? "bg-red-500/15 text-red-600 dark:text-red-400"
                    : dragOver
                      ? "bg-indigo-500/20 text-indigo-600 dark:text-indigo-300"
                      : "bg-muted text-muted-foreground",
            )}
          >
            {status === "uploading" ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : status === "success" ? (
              <CheckCircle2 className="h-6 w-6" />
            ) : status === "error" ? (
              <XCircle className="h-6 w-6" />
            ) : dragOver ? (
              <FileUp className="h-6 w-6" />
            ) : (
              <CloudUpload className="h-6 w-6" />
            )}
          </div>
          <div>
            <div className="text-sm font-medium">
              {status === "uploading" && active
                ? `${active.name} wird hochgeladen…`
                : status === "success" && active
                  ? `${active.name} hochgeladen`
                  : dragOver
                    ? "Loslassen zum Hochladen"
                    : "Datei hier hinziehen oder klicken"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Max 10 MB. Textdateien und JSON werden automatisch embedded.
            </div>
          </div>
          {active ? (
            <div className="mt-1 w-full max-w-sm space-y-1">
              <Progress value={progress} />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{formatBytes(active.size)}</span>
                <span>{progress}%</span>
              </div>
            </div>
          ) : null}
        </div>
      </label>
    </div>
  );
}
