"use client";

import { Download, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function DataPortability() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  async function onImport(file: File) {
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Archiv ist zu groß (max 50 MB).");
      return;
    }
    setImporting(true);
    const fd = new FormData();
    fd.set("file", file);
    const res = await fetch("/api/import", { method: "POST", body: fd });
    setImporting(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(data.error ?? "Import fehlgeschlagen.");
      return;
    }
    const data = (await res.json()) as {
      spacesCreated: number;
      notesCreated: number;
      filesCreated: number;
      skipped: Array<{ path: string; reason: string }>;
    };
    const parts = [
      data.spacesCreated && `${data.spacesCreated} Spaces`,
      data.notesCreated && `${data.notesCreated} Notes`,
      data.filesCreated && `${data.filesCreated} Files`,
    ].filter(Boolean);
    toast.success(
      `Import fertig: ${parts.length ? parts.join(", ") : "nichts"} importiert.`,
      {
        description: data.skipped.length
          ? `${data.skipped.length} Einträge übersprungen — Details in der Browser-Console.`
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
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            <Download className="h-4 w-4" />
          </div>
          <div className="font-medium">Export</div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Lade alle deine Spaces, Notes und Files als ZIP herunter.
          Markdown-formatiert, ohne Vendor-Lock-in. DSGVO Artikel 20.
        </p>
        <div className="mt-3">
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <a href="/api/export">
                <Download className="h-3.5 w-3.5" />
                ZIP downloaden
              </a>
            }
          />
        </div>
      </div>

      <div className="rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-sky-500/10 text-sky-700 dark:text-sky-400">
            <Upload className="h-4 w-4" />
          </div>
          <div className="font-medium">Import</div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Lokri-Export-ZIP oder Obsidian-Vault (beliebige .md-Dateien im ZIP).
          Max 50 MB.
        </p>
        <div className="mt-3">
          <input
            ref={input}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImport(f);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={importing}
            onClick={() => input.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {importing ? "Importiere…" : "ZIP hochladen"}
          </Button>
        </div>
      </div>
    </div>
  );
}
