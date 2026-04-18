"use client";

import {
  BookOpenText,
  CreditCard,
  FileText,
  Folder,
  HardDrive,
  Home,
  Loader2,
  LogOut,
  Plus,
  Search as SearchIcon,
  Settings,
  StickyNote,
  User,
  Zap,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { signOut } from "@/lib/auth-client";

/**
 * ⌘K Command Palette. Three concurrent sources merge into one list:
 *   1. **Commands** — static navigation + actions (home, new note, logout…).
 *   2. **Entities** — spaces / notes / files owned by the account, loaded
 *      once on first open and filtered client-side (substring match).
 *   3. **Semantic hits** — POSTed to /api/search when the query is long
 *      enough; embeddings find conceptual matches no fuzzy filter would.
 *
 * We disable cmdk's own filter (`shouldFilter={false}`) because we need to
 * merge asynchronous semantic hits with client-filtered entities under one
 * list. Ranking is simple substring-position based — good enough for a few
 * hundred items. For thousands, switch to a real fuzzy scorer (fzf-style).
 */

interface PaletteSpace {
  id: string;
  name: string;
  updatedAt: string;
}
interface PaletteNote {
  id: string;
  title: string;
  spaceId: string | null;
  updatedAt: string;
}
interface PaletteFile {
  id: string;
  filename: string;
  spaceId: string | null;
  createdAt: string;
}
interface PaletteData {
  spaces: PaletteSpace[];
  notes: PaletteNote[];
  files: PaletteFile[];
}

interface SemanticHit {
  id: string;
  type: "note" | "file_chunk";
  title: string;
  snippet: string;
  similarity: number;
  spaceId: string | null;
  metadata: Record<string, unknown>;
}

interface CommandDef {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: (router: ReturnType<typeof useRouter>) => void | Promise<void>;
  keywords?: string[];
}

const COMMANDS: CommandDef[] = [
  {
    id: "nav-home",
    label: "Dashboard",
    icon: Home,
    run: (r) => r.push("/dashboard"),
    keywords: ["start", "übersicht"],
  },
  {
    id: "nav-spaces",
    label: "Spaces",
    icon: Folder,
    run: (r) => r.push("/spaces"),
  },
  {
    id: "nav-notes",
    label: "Notes",
    icon: StickyNote,
    run: (r) => r.push("/notes"),
  },
  {
    id: "nav-files",
    label: "Files",
    icon: FileText,
    run: (r) => r.push("/files"),
  },
  {
    id: "action-new-note",
    label: "Neue Note",
    icon: Plus,
    run: (r) => r.push("/notes/new"),
    keywords: ["create", "neu", "add"],
  },
  {
    id: "action-new-space",
    label: "Neuen Space anlegen",
    icon: Plus,
    run: (r) => r.push("/spaces"),
    hint: "Spaces-Seite öffnen",
    keywords: ["create", "neu", "add"],
  },
  {
    id: "nav-profile",
    label: "Profil",
    icon: User,
    run: (r) => r.push("/profile"),
    keywords: ["account", "einstellungen", "2fa"],
  },
  {
    id: "nav-billing",
    label: "Billing",
    icon: CreditCard,
    run: (r) => r.push("/billing"),
    keywords: ["plan", "rechnung", "payment"],
  },
  {
    id: "nav-settings",
    label: "Einstellungen",
    icon: Settings,
    run: (r) => r.push("/settings"),
    keywords: ["config", "storage", "mcp"],
  },
  {
    id: "nav-storage",
    label: "Storage-Provider",
    icon: HardDrive,
    run: (r) => r.push("/settings/storage"),
    keywords: ["s3", "bucket", "external"],
  },
  {
    id: "nav-mcp",
    label: "MCP-Verbindung einrichten",
    icon: Zap,
    run: (r) => r.push("/settings/mcp"),
    keywords: ["claude", "cursor", "chatgpt", "token"],
  },
  {
    id: "nav-impressum",
    label: "Impressum",
    icon: BookOpenText,
    run: (r) => r.push("/impressum"),
    keywords: ["legal", "kontakt"],
  },
  {
    id: "nav-datenschutz",
    label: "Datenschutz",
    icon: BookOpenText,
    run: (r) => r.push("/datenschutz"),
    keywords: ["privacy", "dsgvo", "gdpr"],
  },
  {
    id: "action-logout",
    label: "Abmelden",
    icon: LogOut,
    run: async (r) => {
      await signOut();
      r.push("/login");
      r.refresh();
    },
    keywords: ["logout", "sign out"],
  },
];

const DEBOUNCE_MS = 220;
const MIN_SEMANTIC_CHARS = 3;

/** Case-insensitive substring score. Lower = better. Returns null if no match. */
function score(haystack: string, needle: string): number | null {
  if (!needle) return 0;
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  const idx = h.indexOf(n);
  if (idx === -1) {
    // Token-wise fallback: every word in query must appear somewhere
    const tokens = n.split(/\s+/).filter(Boolean);
    if (tokens.length < 2) return null;
    for (const t of tokens) if (!h.includes(t)) return null;
    return 1000; // weak match — rank below direct substring hits
  }
  // Earlier match + shorter haystack = higher rank.
  return idx + h.length * 0.01;
}

export function SearchPalette() {
  const router = useRouter();
  const t = useTranslations("common.search");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState<PaletteData | null>(null);
  const [semanticHits, setSemanticHits] = useState<SemanticHit[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const dataLoadedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  // ⌘K / Ctrl+K shortcut
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

  // Lazy-load palette data on first open. Cache for the session — router
  // changes don't re-fetch. Stale by design (new space won't appear until
  // reload), but that's the trade-off for snappy open.
  useEffect(() => {
    if (!open || dataLoadedRef.current) return;
    dataLoadedRef.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/palette");
        if (res.ok) setData(await res.json());
      } catch {
        // swallow — palette still works with commands + semantic search
      }
    })();
  }, [open]);

  // Debounced semantic search
  const runSemantic = useCallback(async (q: string) => {
    if (q.trim().length < MIN_SEMANTIC_CHARS) {
      setSemanticHits([]);
      setSemanticLoading(false);
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setSemanticLoading(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: q, limit: 8 }),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body: { hits: SemanticHit[] } = await res.json();
      setSemanticHits(body.hits);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setSemanticHits([]);
    } finally {
      if (!ac.signal.aborted) setSemanticLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => runSemantic(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, runSemantic]);

  // Client-side filter + rank of static sources
  const filtered = useMemo(() => {
    const q = query.trim();
    function rankList<T>(items: T[], text: (i: T) => string): T[] {
      if (!q) return items;
      return items
        .map((i) => ({ i, s: score(text(i), q) }))
        .filter((x): x is { i: T; s: number } => x.s !== null)
        .sort((a, b) => a.s - b.s)
        .map((x) => x.i);
    }
    const cmds = rankList(COMMANDS, (c) =>
      [c.label, c.hint ?? "", ...(c.keywords ?? [])].join(" "),
    ).slice(0, q ? 6 : COMMANDS.length);
    const spaces = rankList(data?.spaces ?? [], (s) => s.name).slice(0, 8);
    const notes = rankList(data?.notes ?? [], (n) => n.title).slice(0, 10);
    const files = rankList(data?.files ?? [], (f) => f.filename).slice(0, 10);
    return { cmds, spaces, notes, files };
  }, [query, data]);

  function close() {
    setOpen(false);
    setQuery("");
    setSemanticHits([]);
  }

  function goto(path: string) {
    close();
    router.push(path);
  }

  const hasAny =
    filtered.cmds.length +
      filtered.spaces.length +
      filtered.notes.length +
      filtered.files.length +
      semanticHits.length >
    0;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogHeader className="sr-only">
        <DialogTitle>Command Palette</DialogTitle>
        <DialogDescription>
          Springe zu Spaces, Notes, Files oder führe Aktionen aus.
        </DialogDescription>
      </DialogHeader>
      <DialogContent
        className="top-1/4 translate-y-0 overflow-hidden rounded-xl p-0"
        showCloseButton={false}
      >
        <Command shouldFilter={false} className="bg-popover">
          <CommandInput
            placeholder={t("placeholder")}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {!hasAny && !semanticLoading ? (
              <CommandEmpty>
                <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <SearchIcon className="h-4 w-4" />
                  {t("noResults")}
                </span>
              </CommandEmpty>
            ) : null}

            {filtered.cmds.length > 0 ? (
              <CommandGroup heading={t("commands")}>
                {filtered.cmds.map((c) => {
                  const Icon = c.icon;
                  return (
                    <CommandItem
                      key={c.id}
                      value={c.id}
                      onSelect={() => {
                        close();
                        c.run(router);
                      }}
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.hint ? (
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {c.hint}
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {filtered.spaces.length > 0 ? (
              <CommandGroup heading="Spaces">
                {filtered.spaces.map((s) => (
                  <CommandItem
                    key={s.id}
                    value={`space-${s.id}`}
                    onSelect={() => goto(`/spaces/${s.id}`)}
                  >
                    <Folder className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                    <span className="flex-1 truncate">{s.name}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {filtered.notes.length > 0 ? (
              <CommandGroup heading="Notes">
                {filtered.notes.map((n) => (
                  <CommandItem
                    key={n.id}
                    value={`note-${n.id}`}
                    onSelect={() => goto(`/notes/${n.id}`)}
                  >
                    <StickyNote className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">{n.title}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {filtered.files.length > 0 ? (
              <CommandGroup heading="Files">
                {filtered.files.map((f) => (
                  <CommandItem
                    key={f.id}
                    value={`file-${f.id}`}
                    onSelect={() => {
                      if (f.spaceId) goto(`/files?spaceId=${f.spaceId}`);
                      else goto("/files");
                    }}
                  >
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="flex-1 truncate">{f.filename}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {semanticHits.length > 0 ? (
              <CommandGroup heading={t("contentSearch")}>
                {semanticHits.map((h) => {
                  const Icon = h.type === "note" ? StickyNote : FileText;
                  return (
                    <CommandItem
                      key={`sem-${h.type}-${h.id}`}
                      value={`sem-${h.id}`}
                      className="flex flex-col items-start gap-1 py-2"
                      onSelect={() => {
                        close();
                        if (h.type === "note") router.push(`/notes/${h.id}`);
                        else if (h.spaceId)
                          router.push(`/files?spaceId=${h.spaceId}`);
                        else router.push("/files");
                      }}
                    >
                      <div className="flex w-full items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="flex-1 truncate font-medium">
                          {h.title}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {(h.similarity * 100).toFixed(0)}%
                        </span>
                      </div>
                      {h.snippet ? (
                        <div className="line-clamp-2 w-full pl-5 text-xs text-muted-foreground">
                          {h.snippet}
                        </div>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : semanticLoading && query.length >= MIN_SEMANTIC_CHARS ? (
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("loading")}
              </div>
            ) : null}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

/** Inline trigger in the nav so users discover the shortcut. */
export function SearchTrigger() {
  const t = useTranslations("common.search");
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
      aria-label={t("triggerLabel")}
    >
      <SearchIcon className="h-3.5 w-3.5" />
      <span>{t("triggerLabel")}</span>
      <kbd className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
        {mac ? "⌘" : "Ctrl"} K
      </kbd>
    </button>
  );
}
