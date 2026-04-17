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
  Video,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
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
  providerName: string;
}

interface BrowseObject {
  key: string;
  size: number;
  lastModified: string | null;
  imported: boolean;
  hidden: boolean;
}

interface BrowseResult {
  attached: boolean;
  providerName: string;
  prefix: string;
  directories: string[];
  objects: BrowseObject[];
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

export function BucketBrowser({ spaceId, providerName }: Props) {
  const [prefix, setPrefix] = useState("");
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(
    async (p: string) => {
      setLoading(true);
      setError(null);
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

  useEffect(() => {
    void load(prefix);
  }, [prefix, load]);

  const segments = prefix.replace(/\/$/, "").split("/").filter(Boolean);

  function crumbPath(index: number): string {
    return segments.slice(0, index + 1).join("/") + "/";
  }

  function downloadUrl(key: string): string {
    return `/api/spaces/${spaceId}/object?key=${encodeURIComponent(key)}`;
  }

  async function copyUrl(key: string) {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    await navigator.clipboard.writeText(`${base}${downloadUrl(key)}`);
    toast.success("URL kopiert.");
  }

  async function importFile(key: string) {
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

  async function toggleHidden(key: string, hidden: boolean) {
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
    toast.success(hidden ? "Ausgeblendet." : "Wieder sichtbar.");
    void load(prefix);
  }

  const visibleObjects =
    data?.objects.filter((o) => showHidden || !o.hidden) ?? [];
  const hiddenCount = data?.objects.filter((o) => o.hidden).length ?? 0;

  return (
    <div className="space-y-3">
      {/* Breadcrumbs + show-hidden toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto text-sm">
          <button
            type="button"
            onClick={() => setPrefix("")}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Folder className="h-3.5 w-3.5" />
            {providerName}
          </button>
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

      {loading ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lade Bucket-Inhalt…
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : !data ||
        (data.directories.length === 0 && visibleObjects.length === 0) ? (
        <div className="rounded-md border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
          Dieser Pfad enthält keine sichtbaren Objekte.
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {prefix && (
            <button
              type="button"
              onClick={() => {
                const parts = prefix.replace(/\/$/, "").split("/");
                parts.pop();
                setPrefix(parts.length ? parts.join("/") + "/" : "");
              }}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              <FolderOpen className="h-4 w-4" />
              …/
            </button>
          )}

          {data.directories.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setPrefix(d)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50"
            >
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Folder className="h-4 w-4" />
              </div>
              <span className="flex-1 truncate font-medium">
                {d.replace(prefix, "").replace(/\/$/, "") ||
                  d.replace(/\/$/, "")}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}

          {visibleObjects.map((o) => {
            const name = o.key.replace(prefix, "") || o.key;
            const Icon = iconFor(name);
            const isBusy = busyKey === o.key;
            return (
              <div
                key={o.key}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5 text-sm",
                  o.hidden && "opacity-50",
                )}
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 text-indigo-700 dark:text-indigo-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{name}</span>
                    {o.imported ? (
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
                  href={downloadUrl(o.key)}
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
                    {o.imported ? (
                      <DropdownMenuItem disabled>
                        <Check className="h-3.5 w-3.5 text-emerald-500" />
                        Bereits importiert
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onClick={() => importFile(o.key)}>
                        <Sparkles className="h-3.5 w-3.5" />
                        In lokri importieren
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={() => copyUrl(o.key)}>
                      <Download className="h-3.5 w-3.5" />
                      URL kopieren
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {o.hidden ? (
                      <DropdownMenuItem
                        onClick={() => toggleHidden(o.key, false)}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Wieder einblenden
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => toggleHidden(o.key, true)}
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                        Aus Browser ausblenden
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>
      )}

      {data?.isTruncated ? (
        <p className="text-xs text-muted-foreground">
          Nur die ersten 1.000 Objekte werden angezeigt. Pagination kommt in
          einem Follow-up.
        </p>
      ) : null}
    </div>
  );
}
