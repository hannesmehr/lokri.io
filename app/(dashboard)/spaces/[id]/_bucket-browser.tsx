"use client";

import {
  ChevronRight,
  Download,
  File as FileIcon,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Loader2,
  Music,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { formatBytes, formatRelative } from "@/lib/format";

interface Props {
  spaceId: string;
  providerName: string;
}

interface BrowseResult {
  attached: boolean;
  providerName: string;
  prefix: string;
  directories: string[];
  objects: Array<{ key: string; size: number; lastModified: string | null }>;
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

/**
 * Directory-style browser for an S3-backed space. Path stays in the
 * URL-agnostic component state; each navigate fetches `?prefix=…` again so
 * the server's prefix-scoping is always honoured.
 */
export function BucketBrowser({ spaceId, providerName }: Props) {
  const [prefix, setPrefix] = useState(""); // relative to provider root
  const [data, setData] = useState<BrowseResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: string) => {
    setLoading(true);
    setError(null);
    const url = `/api/spaces/${spaceId}/browse?prefix=${encodeURIComponent(p)}`;
    const res = await fetch(url);
    setLoading(false);
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: "Fehler" }));
      setError(body.error ?? `HTTP ${res.status}`);
      return;
    }
    const json: BrowseResult = await res.json();
    setData(json);
  }, [spaceId]);

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

  return (
    <div className="space-y-3">
      {/* Breadcrumbs */}
      <div className="flex items-center gap-1 overflow-x-auto text-sm">
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

      {/* State */}
      {loading ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Lade Bucket-Inhalt…
        </div>
      ) : error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </div>
      ) : !data || (data.directories.length === 0 && data.objects.length === 0) ? (
        <div className="rounded-md border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
          Dieser Pfad enthält keine Objekte.
        </div>
      ) : (
        <div className="divide-y rounded-md border">
          {/* Go-up row when inside a subfolder */}
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
                {/* Directory comes in as absolute relative path (e.g. "a/b/") —
                    show only the last segment */}
                {d.replace(prefix, "").replace(/\/$/, "") || d.replace(/\/$/, "")}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          ))}

          {data.objects.map((o) => {
            const name = o.key.replace(prefix, "") || o.key;
            const Icon = iconFor(name);
            return (
              <div
                key={o.key}
                className="flex items-center gap-3 px-4 py-2.5 text-sm"
              >
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-gradient-to-br from-indigo-500/10 to-fuchsia-500/10 text-indigo-700 dark:text-indigo-300">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{name}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="tabular-nums">{formatBytes(o.size)}</span>
                    {o.lastModified ? (
                      <> · geändert {formatRelative(o.lastModified)}</>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => copyUrl(o.key)}
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Download-URL kopieren"
                >
                  URL
                </button>
                <a
                  href={downloadUrl(o.key)}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Öffnen"
                >
                  <Download className="h-3.5 w-3.5" />
                  Öffnen
                </a>
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
