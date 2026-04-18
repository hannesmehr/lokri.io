"use client";

import { CheckCircle2, CloudUpload, FileUp, Loader2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_BYTES = 10 * 1024 * 1024;

interface Props {
  spaces: Array<{ id: string; name: string }>;
  defaultSpaceId?: string | null;
}

type Status = "idle" | "uploading" | "success" | "error";

export function FileUploader({ spaces, defaultSpaceId = null }: Props) {
  const t = useTranslations("files.uploader");
  const tToasts = useTranslations("toasts");
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
  const maxSize = formatBytes(MAX_BYTES);

  function validate(file: File): string | null {
    if (file.size === 0) return t("errors.empty");
    if (file.size > MAX_BYTES)
      return t("errors.tooLarge", { max: maxSize });
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
          let message = t("errors.uploadFailedWithStatus", { status: xhr.status });
          try {
            const data = JSON.parse(xhr.responseText);
            if (data?.error) message = data.error;
          } catch {
            // ignore JSON parse errors
          }
          reject(new Error(message));
        }
      });
      xhr.addEventListener("error", () => reject(new Error(tToasts("error.networkFailed"))));
      xhr.addEventListener("abort", () => reject(new Error(t("errors.aborted"))));
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
      toast.success(t("success.uploaded", { name: file.name }));
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
      const message =
        e instanceof Error ? e.message : tToasts("error.generic");
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
            {t("spaceLabel")}:
          </Label>
          <select
            id="upload-space"
            className="h-8 rounded-md border bg-background px-2 text-sm"
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            disabled={status === "uploading"}
          >
            <option value="">{t("noSpace")}</option>
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
          "relative block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed bg-card px-6 py-10 transition-all",
          dragOver
            ? "border-foreground/50 bg-muted/40"
            : "border-muted-foreground/30 hover:border-foreground/50",
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
                ? "bg-muted text-foreground"
                : status === "success"
                  ? "bg-muted text-foreground"
                  : status === "error"
                    ? "bg-muted text-foreground"
                    : dragOver
                      ? "bg-muted text-foreground"
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
                ? t("status.uploading", { name: active.name })
                : status === "success" && active
                  ? t("status.uploaded", { name: active.name })
                  : dragOver
                    ? t("dropActive")
                    : t("idle")}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {t("hint", { max: maxSize })}
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
