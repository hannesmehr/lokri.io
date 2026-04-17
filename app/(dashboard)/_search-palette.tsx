"use client";

import { FileText, Loader2, Search as SearchIcon, StickyNote } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

interface Hit {
  id: string;
  type: "note" | "file_chunk";
  title: string;
  snippet: string;
  similarity: number;
  spaceId: string | null;
  metadata: Record<string, unknown>;
}

const DEBOUNCE_MS = 180;
const MIN_QUERY_CHARS = 2;

/**
 * ⌘K / Ctrl+K spotlight. Lives globally in the dashboard layout. On open:
 * - empty state shows a hint
 * - as you type (debounced), posts to /api/search and renders hits
 * - hits are clickable: notes navigate to /notes/<id>, file chunks to the
 *   file overview with the space filter + anchor
 */
export function SearchPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ⌘K / Ctrl+K keyboard shortcut.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < MIN_QUERY_CHARS) {
      setHits([]);
      setLoading(false);
      setError(null);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q, limit: 12 }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      const data: { hits: Hit[] } = await res.json();
      setHits(data.hits);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Suche fehlgeschlagen.");
      setHits([]);
    } finally {
      if (ac.signal.aborted === false) setLoading(false);
    }
  }, []);

  // Debounced effect — only trigger once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  function select(hit: Hit) {
    setOpen(false);
    if (hit.type === "note") {
      router.push(`/notes/${hit.id}`);
      return;
    }
    // file_chunk → bring user to the file list, filtered by space if any
    const fileId = (hit.metadata.fileId as string | undefined) ?? "";
    if (hit.spaceId) {
      router.push(`/files?spaceId=${hit.spaceId}`);
    } else {
      router.push(`/files`);
    }
    // Let the user locate the specific file visually. Jumping to a single
    // file page isn't needed for MVP — we don't have one. V1.1 can add that.
    void fileId;
  }

  const notes = hits.filter((h) => h.type === "note");
  const chunks = hits.filter((h) => h.type === "file_chunk");

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) {
          setQuery("");
          setHits([]);
          setError(null);
        }
      }}
      title="Semantische Suche"
      description="Durchsuche Notes und Files deines Accounts mit natürlicher Sprache."
    >
      <CommandInput
        placeholder="Suche nach Inhalten, Themen, Ideen…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {query.length < MIN_QUERY_CHARS ? (
          <CommandEmpty>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <SearchIcon className="h-4 w-4" />
              Tipp mindestens {MIN_QUERY_CHARS} Buchstaben.
            </span>
          </CommandEmpty>
        ) : loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Suche läuft…
          </div>
        ) : error ? (
          <div className="px-3 py-6 text-sm text-destructive">
            {error === "Rate limit exceeded"
              ? "Zu viele Suchen hintereinander. Gleich nochmal versuchen."
              : error}
          </div>
        ) : hits.length === 0 ? (
          <CommandEmpty>Keine Treffer.</CommandEmpty>
        ) : (
          <>
            {notes.length > 0 && (
              <CommandGroup heading="Notes">
                {notes.map((h) => (
                  <CommandItem
                    key={h.id}
                    value={`note-${h.id}-${h.title}`}
                    onSelect={() => select(h)}
                    className="flex flex-col items-start gap-1 py-2"
                  >
                    <div className="flex w-full items-center gap-2">
                      <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate font-medium">
                        {h.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {(h.similarity * 100).toFixed(0)}%
                      </span>
                    </div>
                    {h.snippet && (
                      <div className="line-clamp-2 w-full pl-5 text-xs text-muted-foreground">
                        {h.snippet}
                      </div>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {chunks.length > 0 && (
              <CommandGroup heading="Files">
                {chunks.map((h) => (
                  <CommandItem
                    key={h.id}
                    value={`file-${h.id}-${h.title}`}
                    onSelect={() => select(h)}
                    className="flex flex-col items-start gap-1 py-2"
                  >
                    <div className="flex w-full items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate font-medium">
                        {h.title}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        {(h.similarity * 100).toFixed(0)}%
                      </span>
                    </div>
                    {h.snippet && (
                      <div className="line-clamp-2 w-full pl-5 text-xs text-muted-foreground">
                        {h.snippet}
                      </div>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** Inline trigger in the nav so users discover the shortcut. */
export function SearchTrigger() {
  const [mac, setMac] = useState(false);
  useEffect(() => {
    setMac(
      typeof navigator !== "undefined" &&
        /Mac|iPod|iPhone|iPad/.test(navigator.platform),
    );
  }, []);
  function open() {
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: mac,
        ctrlKey: !mac,
      }),
    );
  }
  return (
    <button
      type="button"
      onClick={open}
      className="hidden items-center gap-2 rounded-md border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
      aria-label="Suchen"
    >
      <SearchIcon className="h-3.5 w-3.5" />
      <span>Suchen…</span>
      <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
        {mac ? "⌘" : "Ctrl"} K
      </kbd>
    </button>
  );
}
