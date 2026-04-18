"use client";

import { Download, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DataPortability() {
  const router = useRouter();
  const t = useTranslations("profile.data");
  const input = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function onImport(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      toast.error(t("import.errors.tooLarge", { max: "50 MB" }));
      return;
    }
    setImporting(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/import", { method: "POST", body: fd });
    setImporting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: t("import.errors.generic") }));
      toast.error(data.error ?? t("import.errors.generic"));
      return;
    }
    const data = (await res.json()) as {
      spacesCreated: number;
      notesCreated: number;
      filesCreated: number;
      skipped: Array<{ path: string; reason: string }>;
    };
    const parts = [
      data.spacesCreated && t("import.summary.spaces", { count: data.spacesCreated }),
      data.notesCreated && t("import.summary.notes", { count: data.notesCreated }),
      data.filesCreated && t("import.summary.files", { count: data.filesCreated }),
    ].filter(Boolean);
    toast.success(
      t("import.success", {
        result: parts.length ? parts.join(", ") : t("import.summary.none"),
      }),
      {
        description: data.skipped.length
          ? t("import.skipped", { count: data.skipped.length })
          : undefined,
      },
    );
    if (data.skipped.length) {
      console.warn("[import] skipped:", data.skipped);
    }
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-foreground">
              <Download className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{t("export.title")}</CardTitle>
              <CardDescription>{t("export.description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("export.help")}</p>
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={<a href="/api/export">{t("export.download")}</a>}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-muted text-foreground">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>{t("import.title")}</CardTitle>
              <CardDescription>{t("import.description")}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("import.help")}</p>
          <input
            ref={input}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void onImport(file);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={importing}
            onClick={() => input.current?.click()}
          >
            {importing ? t("import.uploading") : t("import.upload")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
