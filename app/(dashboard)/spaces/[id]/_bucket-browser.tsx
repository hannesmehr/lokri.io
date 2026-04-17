"use client";

import {
  Check,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  File as FileIcon,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  MoreHorizontal,
  Music,
  Sparkles,
  Trash2,
  Upload,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatBytes, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  spaceId: string;
  defaultProviderName: string;
}

interface ObjectEntry {
  kind: "internal" | "external";
  key: string;
  fileId: string | null;
  size: number;
  lastModified: string | null;
  mimeType: string | null;
  imported: boolean;
  hidden: boolean;
}

interface DirEntry {
  key: string;
  hidden: boolean;
}

interface BrowseResult {
  source: "internal" | "external";
  providerName: string;
  providerType?: "internal" | "s3" | "github";
  readOnly?: boolean;
  prefix: string;
  directories: DirEntry[];
  objects: ObjectEntry[];
  isTruncated: boolean;
  nextContinuationToken: string | null;
}

function iconFor(filename: string) {
  const lower = filename.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|svg|heic|avif)$/.test(lower)) return ImageIcon;
  if (/\.(mp4|mov|webm|mkv|avi)$/.test(lower)) return Video;
  if (/\.(mp3|wav|flac|ogg|m4a)$/.test(lower)) return Music;
  if (/\.(txt|md|json|csv|log|pdf|html?|yml|yaml|toml)$/.test(lower))
    return FileText;
  return FileIcon;
}

export function BucketBrowser({ spaceId, defaultProviderName }: Props) {
  const [prefix, setPrefix] = useState("");
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);
  // Counter-based drag tracking — `dragleave` fires when moving over child
  // elements too, so a boolean flicker. We enter/leave by depth.
  const [dragDepth, setDragDepth] = useState(0);
  const [uploading, setUploading] = useState(false);

  const source = data?.source ?? "external";
  const supportsDirectories = source === "external";
  const readOnly = data?.readOnly ?? false;

  const load = useCallback(
    async (p: string) => {
      setLoading(true);
      setError(null);
      setSelected(new Set());
      const res = await fetch(
        `/api/spaces/${spaceId}/browse?prefix=${encodeURIComponent(p)}`,
      );
      setLoading(false);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: "Fehler" }));
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setData(await res.json());
    },
    [spaceId],
  );

  const loadMore = useCallback(async () => {
    if (!data?.nextContinuationToken) return;
    setLoadingMore(true);
    const url = new URL(`/api/spaces/${spaceId}/browse`, window.location.origin);
    url.searchParams.set("prefix", prefix);
    url.searchParams.set("cursor", data.nextContinuationToken);
    const res = await fetch(url);
    setLoadingMore(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(body.error ?? "Paging fehlgeschlagen.");
      return;
    }
    const next: BrowseResult = await res.json();
    setData((prev) =>
      prev
        ? {
            ...next,
            directories: [...prev.directories, ...next.directories],
            objects: [...prev.objects, ...next.objects],
          }
        : next,
    );
  }, [data?.nextContinuationToken, prefix, spaceId]);

  useEffect(() => {
    void load(prefix);
  }, [prefix, load]);

  const segments = prefix.replace(/\/$/, "").split("/").filter(Boolean);
  const crumbPath = (i: number) => segments.slice(0, i + 1).join("/") + "/";

  function downloadUrl(entry: ObjectEntry): string {
    if (entry.kind === "internal" && entry.fileId) {
      return `/api/files/${entry.fileId}/content`;
    }
    return `/api/spaces/${spaceId}/object?key=${encodeURIComponent(entry.key)}`;
  }

  async function copyUrl(entry: ObjectEntry) {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    await navigator.clipboard.writeText(`${base}${downloadUrl(entry)}`);
    toast.success("URL kopiert.");
  }

  async function importKey(key: string) {
    setBusyKey(key);
    const res = await fetch(`/api/spaces/${spaceId}/external/import`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key }),
    });
    setBusyKey(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(body.error ?? "Import fehlgeschlagen.");
      return;
    }
    const body: { alreadyImported: boolean } = await res.json();
    toast.success(
      body.alreadyImported
        ? "War schon importiert."
        : "Importiert — wird jetzt indiziert + via MCP durchsuchbar.",
    );
    void load(prefix);
  }

  async function toggleHiddenExternal(key: string, hidden: boolean) {
    setBusyKey(key);
    const res = await fetch(`/api/spaces/${spaceId}/external/visibility`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key, hidden }),
    });
    setBusyKey(null);
    if (!res.ok) {
      toast.error("Konnte Sichtbarkeit nicht ändern.");
      return;
    }
    toast.success(
      hidden ? "Ausgeblendet (auch für MCP)." : "Wieder sichtbar.",
    );
    void load(prefix);
  }

  async function toggleMcpHiddenInternal(fileId: string, hidden: boolean) {
    setBusyKey(fileId);
    const res = await fetch(`/api/files/${fileId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mcpHidden: hidden }),
    });
    setBusyKey(null);
    if (!res.ok) {
      toast.error("Konnte Sichtbarkeit nicht ändern.");
      return;
    }
    toast.success(hidden ? "Für MCP ausgeblendet." : "Für MCP sichtbar.");
    void load(prefix);
  }

  async function deleteInternal(fileId: string, name: string) {
    if (!confirm(`"${name}" wirklich löschen?`)) return;
    setBusyKey(fileId);
    const res = await fetch(`/api/files/${fileId}`, { method: "DELETE" });
    setBusyKey(null);
    if (!res.ok) {
      toast.error("Löschen fehlgeschlagen.");
      return;
    }
    toast.success("Gelöscht.");
    void load(prefix);
  }

  async function reindexFile(fileId: string) {
    setBusyKey(fileId);
    const res = await fetch(`/api/files/${fileId}/reindex`, { method: "POST" });
    setBusyKey(null);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(body.error ?? "Re-Index fehlgeschlagen.");
      return;
    }
    const body: { chunks: number } = await res.json();
    toast.success(
      body.chunks > 0
        ? `Neu indiziert — ${body.chunks} Chunks embedded.`
        : "Kein Text extrahierbar.",
    );
    void load(prefix);
  }

  async function bulkImport() {
    const keys = [...selected];
    if (keys.length === 0) return;
    setBulkRunning(true);
    const res = await fetch(`/api/spaces/${spaceId}/external/import-batch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ keys }),
    });
    setBulkRunning(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Fehler" }));
      toast.error(body.error ?? "Bulk-Import fehlgeschlagen.");
      return;
    }
    const body: {
      summary: {
        total: number;
        imported: number;
        alreadyImported: number;
        skippedQuota: number;
        failed: number;
        truncatedExpansion?: boolean;
      };
    } = await res.json();
    const parts = [
      body.summary.imported && `${body.summary.imported} importiert`,
      body.summary.alreadyImported &&
        `${body.summary.alreadyImported} schon vorhanden`,
      body.summary.skippedQuota &&
        `${body.summary.skippedQuota} Quota übersprungen`,
      body.summary.failed && `${body.summary.failed} fehlgeschlagen`,
    ].filter(Boolean);
    toast.success(`Bulk-Import: ${parts.join(", ") || "nichts zu tun"}`, {
      description: body.summary.truncatedExpansion
        ? "Limit 200 expandierte Dateien pro Batch erreicht — weitere Auswahl nötig."
        : undefined,
    });
    setSelected(new Set());
    void load(prefix);
  }

  /**
   * Upload one or more files into this space via the regular `/api/files`
   * endpoint. For external-storage spaces, this writes through to S3 via
   * `getProviderForNewUpload`; for internal, it hits Vercel Blob. After
   * all uploads finish, we refresh the browse listing.
   *
   * Sequential upload keeps quota accounting + rate-limit predictable.
   */
  async function uploadFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => f.size > 0);
    if (files.length === 0) {
      toast.error("Keine gültigen Dateien (Ordner werden nicht unterstützt).");
      return;
    }
    setUploading(true);
    const toastId = toast.loading(`Lade 0/${files.length} hoch…`);
    let ok = 0;
    let failed = 0;
    const errors: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      toast.loading(`${i + 1}/${files.length} · ${f.name}`, { id: toastId });
      const fd = new FormData();
      fd.set("file", f);
      fd.set("space_id", spaceId);
      // External (S3) spaces: land the file at the currently-browsed
      // sub-prefix with its original name. Internal spaces ignore this
      // — Vercel Blob has no user-visible key hierarchy.
      if (source === "external") {
        fd.set("target_prefix", prefix);
      }
      try {
        const res = await fetch("/api/files", { method: "POST", body: fd });
        if (res.ok) {
          ok++;
        } else {
          failed++;
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          errors.push(`${f.name}: ${body.error ?? `HTTP ${res.status}`}`);
        }
      } catch (err) {
        failed++;
        errors.push(`${f.name}: ${err instanceof Error ? err.message : "Netzwerkfehler"}`);
      }
    }
    setUploading(false);
    if (failed === 0) {
      toast.success(`${ok} Datei(en) hochgeladen.`, { id: toastId });
    } else if (ok === 0) {
      toast.error(`Upload fehlgeschlagen.`, {
        id: toastId,
        description: errors.slice(0, 2).join(" · "),
      });
    } else {
      toast.warning(`${ok} hochgeladen, ${failed} fehlgeschlagen.`, {
        id: toastId,
        description: errors.slice(0, 2).join(" · "),
      });
    }
    void load(prefix);
  }

  function onDragEnter(e: React.DragEvent) {
    if (readOnly) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragDepth((d) => d + 1);
  }
  function onDragOver(e: React.DragEvent) {
    if (readOnly) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }
  function onDragLeave(e: React.DragEvent) {
    if (readOnly) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    setDragDepth((d) => Math.max(0, d - 1));
  }
  function onDrop(e: React.DragEvent) {
    if (readOnly) return;
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    setDragDepth(0);
    if (uploading) {
      toast.error("Warte bis der laufende Upload fertig ist.");
      return;
    }
    void uploadFiles(e.dataTransfer.files);
  }

  async function bulkHide(hidden: boolean) {
    const keys = [...selected];
    if (keys.length === 0) return;
    setBulkRunning(true);
    for (const key of keys) {
      if (source === "external") {
        await fetch(`/api/spaces/${spaceId}/external/visibility`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ key, hidden }),
        });
      } else {
        const entry = data?.objects.find((o) => o.key === key);
        if (entry?.fileId) {
          await fetch(`/api/files/${entry.fileId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ mcpHidden: hidden }),
          });
        }
      }
    }
    setBulkRunning(false);
    toast.success(
      hidden
        ? `${keys.length} ausgeblendet.`
        : `${keys.length} wieder sichtbar.`,
    );
    setSelected(new Set());
    void load(prefix);
  }

  const visibleObjects = useMemo(
    () => data?.objects.filter((o) => showHidden || !o.hidden) ?? [],
    [data?.objects, showHidden],
  );
  const visibleDirectories = useMemo(
    () => data?.directories.filter((d) => showHidden || !d.hidden) ?? [],
    [data?.directories, showHidden],
  );
  const hiddenCount =
    (data?.objects.filter((o) => o.hidden).length ?? 0) +
    (data?.directories.filter((d) => d.hidden).length ?? 0);

  const allVisibleKeys = useMemo(
    () => [
      ...visibleDirectories.map((d) => d.key),
      ...visibleObjects.map((o) => o.key),
    ],
    [visibleDirectories, visibleObjects],
  );
  const allSelected =
    allVisibleKeys.length > 0 && allVisibleKeys.every((k) => selected.has(k));

  function toggleOne(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(allVisibleKeys));
  }

  const selectedImportableCount = useMemo(() => {
    if (source !== "external") return 0;
    let count = 0;
    for (const k of selected) {
      if (k.endsWith("/")) {
        count++;
      } else {
        const obj = data?.objects.find((o) => o.key === k);
        if (obj && !obj.imported) count++;
      }
    }
    return count;
  }, [selected, source, data?.objects]);

  const dragActive = dragDepth > 0;

  return (
    <div
      className={cn(
        "relative space-y-3 rounded-lg transition-colors",
        dragActive && "ring-2 ring-indigo-500 ring-offset-2 ring-offset-background",
      )}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center rounded-lg bg-indigo-500/10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2 rounded-xl border border-indigo-500/40 bg-background/95 px-6 py-4 shadow-lg">
            <Upload className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
            <div className="text-sm font-medium">Dateien ablegen zum Hochladen</div>
            <div className="text-xs text-muted-foreground">
              {source === "external"
                ? "Landen im verbundenen Bucket und werden sofort indiziert."
                : "Werden in diesem Space gespeichert und sofort indiziert."}
            </div>
          </div>
        </div>
      ) : null}
      {uploading ? (
        <div className="pointer-events-none absolute right-2 top-2 z-20 flex items-center gap-1.5 rounded-md border bg-background/95 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          <Loader2 className="h-3 w-3 animate-spin" />
          Upload läuft…
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
          <button
            type="button"
            onClick={() => setPrefix("")}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Folder className="h-3.5 w-3.5" />
            {data?.providerName ?? defaultProviderName}
          </button>
          {readOnly ? (
            <span
              className="ml-2 inline-flex items-center rounded border border-slate-500/30 bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300"
              title="Quelle ist read-only — nur Import in lokri, keine Uploads/Löschungen."
            >
              read-only
            </span>
          ) : null}
          {segments.map((seg, i) => (
            <span key={i} className="inline-flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <button
                type="button"
                onClick={() => setPrefix(crumbPath(i))}
                className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {seg}
              </button>
            </span>
          ))}
        </div>
        {hiddenCount > 0 ? (
          <button
            type="button"
            onClick={() => setShowHidden((v) => !v)}
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {showHidden ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {showHidden
              ? `Ausgeblendete verstecken (${hiddenCount})`
              : `${hiddenCount} ausgeblendet — anzeigen`}
          </button>
        ) : null}
      </div>

      {selected.size > 0 ? (
        <div className="sticky top-16 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/95 px-4 py-2.5 shadow-sm backdrop-blur">
          <div className="text-sm">
            <strong>{selected.size}</strong> ausgewählt
            {selectedImportableCount > 0 ? (
              <span className="text-muted-foreground">
                {" · "}
                {selectedImportableCount} importierbar
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {source === "external" && selectedImportableCount > 0 ? (
              <Button size="sm" onClick={bulkImport} disabled={bulkRunning}>
                {bulkRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                {bulkRunning ? "Importiere…" : "Alle importieren"}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkHide(true)}
              disabled={bulkRunning}
            >
              <EyeOff className="h-3.5 w-3.5" />
              Ausblenden
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkHide(false)}
              disabled={bulkRunning}
            >
              <Eye className="h-3.5 w-3.5" />
              Einblenden
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSelected(new Set())}
              disabled={bulkRunning}
            >
              Abwählen
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lade Inhalt…
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : !data ||
        (visibleDirectories.length === 0 && visibleObjects.length === 0) ? (
        <div className="rounded-md border border-dashed bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          {!readOnly ? (
            <Upload className="mx-auto mb-2 h-6 w-6 opacity-50" />
          ) : null}
          {readOnly
            ? "Dieser Pfad enthält keine sichtbaren Objekte (Quelle ist read-only)."
            : source === "internal"
              ? "Noch keine Dateien — zieh sie hier rein oder lade sie über die Files-Seite hoch."
              : "Dieser Pfad enthält keine sichtbaren Objekte — Dateien hier ablegen, um sie in den Bucket hochzuladen."}
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={allSelected}
              onChange={toggleAll}
              aria-label="Alle auswählen"
            />
            <span>{allVisibleKeys.length} Einträge</span>
          </div>

          {prefix && supportsDirectories ? (
            <button
              type="button"
              onClick={() => {
                const parts = prefix.replace(/\/$/, "").split("/");
                parts.pop();
                setPrefix(parts.length ? parts.join("/") + "/" : "");
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <span className="inline-block w-4" />
              <FolderOpen className="h-4 w-4" />
              …/
            </button>
          ) : null}

          {visibleDirectories.map((d) => {
            const isBusy = busyKey === d.key;
            const selected_ = selected.has(d.key);
            const shortName = d.key.replace(prefix, "").replace(/\/$/, "");
            return (
              <div
                key={d.key}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm transition-colors",
                  d.hidden && "opacity-50",
                  selected_ && "bg-indigo-500/5",
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  checked={selected_}
                  onChange={() => toggleOne(d.key)}
                  aria-label={`${shortName} auswählen`}
                />
                <button
                  type="button"
                  onClick={() => setPrefix(d.key)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                >
                  <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Folder className="h-4 w-4" />
                  </div>
                  <span className="flex-1 truncate font-medium">
                    {shortName || d.key.replace(/\/$/, "")}
                  </span>
                  {d.hidden ? (
                    <span className="shrink-0 rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      ausgeblendet
                    </span>
                  ) : null}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        disabled={isBusy}
                        aria-label="Verzeichnis-Aktionen"
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        )}
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" className="min-w-56">
                    <DropdownMenuItem
                      onClick={async () => {
                        setBusyKey(d.key);
                        const res = await fetch(
                          `/api/spaces/${spaceId}/external/import-batch`,
                          {
                            method: "POST",
                            headers: { "content-type": "application/json" },
                            body: JSON.stringify({ keys: [d.key] }),
                          },
                        );
                        setBusyKey(null);
                        if (!res.ok) {
                          toast.error("Import fehlgeschlagen.");
                          return;
                        }
                        const body = await res.json();
                        const s = body.summary ?? {};
                        toast.success(
                          `Rekursiv: ${s.imported ?? 0} importiert, ${s.alreadyImported ?? 0} schon da${
                            s.skippedQuota
                              ? `, ${s.skippedQuota} Quota übersprungen`
                              : ""
                          }`,
                        );
                        void load(prefix);
                      }}
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Rekursiv importieren
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {d.hidden ? (
                      <DropdownMenuItem
                        onClick={() => toggleHiddenExternal(d.key, false)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Wieder einblenden
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => toggleHiddenExternal(d.key, true)}
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        Verzeichnis ausblenden
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}

          {visibleObjects.map((o) => {
            const name = o.key.replace(prefix, "") || o.key;
            const Icon = iconFor(name);
            const isBusy = busyKey === o.key || busyKey === o.fileId;
            const selected_ = selected.has(o.key);
            return (
              <div
                key={o.key + (o.fileId ?? "")}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm",
                  o.hidden && "opacity-50",
                  selected_ && "bg-indigo-500/5",
                )}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 shrink-0"
                  checked={selected_}
                  onChange={() => toggleOne(o.key)}
                  aria-label={`${name} auswählen`}
                />
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 text-indigo-700 dark:text-indigo-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{name}</span>
                    {o.imported && o.kind === "external" ? (
                      <span className="inline-flex shrink-0 items-center gap-0.5 rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                        <Sparkles className="h-2.5 w-2.5" />
                        importiert
                      </span>
                    ) : null}
                    {o.hidden ? (
                      <span className="shrink-0 rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        ausgeblendet
                      </span>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatBytes(o.size)}</span>
                    {o.lastModified ? (
                      <> · geändert {formatRelative(o.lastModified)}</>
                    ) : null}
                  </div>
                </div>
                <a
                  href={downloadUrl(o)}
                  target="_blank"
                  rel="noopener"
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Öffnen"
                >
                  <Download className="h-3.5 w-3.5" />
                </a>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <button
                        type="button"
                        className="rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        disabled={isBusy}
                        aria-label="Aktionen"
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        )}
                      </button>
                    }
                  />
                  <DropdownMenuContent align="end" className="min-w-52">
                    {o.kind === "external" ? (
                      o.imported ? (
                        <DropdownMenuItem disabled>
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          Bereits importiert
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onClick={() => importKey(o.key)}>
                          <Sparkles className="h-3.5 w-3.5" />
                          In lokri importieren
                        </DropdownMenuItem>
                      )
                    ) : null}
                    <DropdownMenuItem onClick={() => copyUrl(o)}>
                      <Download className="h-3.5 w-3.5" />
                      URL kopieren
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {o.hidden ? (
                      <DropdownMenuItem
                        onClick={() =>
                          o.kind === "external"
                            ? toggleHiddenExternal(o.key, false)
                            : o.fileId &&
                              toggleMcpHiddenInternal(o.fileId, false)
                        }
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Wieder einblenden
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() =>
                          o.kind === "external"
                            ? toggleHiddenExternal(o.key, true)
                            : o.fileId &&
                              toggleMcpHiddenInternal(o.fileId, true)
                        }
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        Ausblenden (auch für MCP)
                      </DropdownMenuItem>
                    )}
                    {o.fileId ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => reindexFile(o.fileId!)}
                        >
                          <Sparkles className="h-3.5 w-3.5" />
                          Neu indizieren
                        </DropdownMenuItem>
                        {o.kind === "internal" ? (
                          <DropdownMenuItem
                            onClick={() => deleteInternal(o.fileId!, name)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Löschen
                          </DropdownMenuItem>
                        ) : null}
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}

          {data.isTruncated && data.nextContinuationToken ? (
            <div className="px-4 py-3">
              <Button
                variant="outline"
                size="sm"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full"
              >
                {loadingMore ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : null}
                {loadingMore ? "Lade…" : "Weitere laden"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
