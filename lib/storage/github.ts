import type { StorageGetResult, StorageProvider } from "./types";

/**
 * Read-only GitHub-repository storage provider. Treats a repo (optionally
 * narrowed to a sub-directory via `pathPrefix`) like a browsable object
 * store. Used for importing docs, markdown, code, configs into lokri so
 * the MCP gateway can search them.
 *
 * `put` and `delete` throw — lokri never writes back. Imports copy the
 * file's bytes into `files` + `file_chunks`; subsequent edits in GitHub
 * require a re-import (future: webhook-based auto-sync).
 *
 * Design notes:
 *  - Authenticates with a user-supplied PAT (classic or fine-grained).
 *    Unauthenticated read works for public repos too, but rate limits
 *    are harsh (60 req/hr per IP), so a token is strongly recommended.
 *  - Listings use the Git Trees API with `recursive=1` — one HTTP call
 *    for the whole tree. Large repos (>100k entries) will be truncated
 *    by GitHub itself; we surface that via `truncatedAt`.
 *  - File content fetched via `raw.githubusercontent.com`, bypassing
 *    the base64-encoded Contents API path (faster, no size limit for
 *    < 100 MB files).
 *  - No `file.file_sha`-tracking yet; idempotency via storage-key in
 *    the `files` table is enough for MVP.
 */

export interface GitHubConfig {
  /** Personal Access Token. Optional for public repos but strongly advised. */
  accessToken?: string;
  /** User or org that owns the repo, e.g. `"anthropics"`. */
  owner: string;
  /** Repo slug, e.g. `"claude-cookbooks"`. */
  repo: string;
  /**
   * Branch or tag or commit SHA. Omit to use the repo's default branch
   * (resolved once per provider instance — cached).
   */
  ref?: string;
  /** Optional subdirectory — e.g. `"docs/"`. Listings/reads are scoped to it. */
  pathPrefix?: string;
}

const API_BASE = "https://api.github.com";
const RAW_BASE = "https://raw.githubusercontent.com";

interface TreeEntry {
  path: string;
  mode: string;
  type: "blob" | "tree" | "commit";
  sha: string;
  size?: number;
  url?: string;
}

interface TreeResponse {
  sha: string;
  tree: TreeEntry[];
  truncated: boolean;
}

export class GitHubProvider implements StorageProvider {
  readonly name = "github" as const;

  private readonly owner: string;
  private readonly repo: string;
  private readonly prefix: string;
  private resolvedRef: string | null = null;

  constructor(private readonly config: GitHubConfig) {
    this.owner = config.owner;
    this.repo = config.repo;
    this.prefix = (config.pathPrefix ?? "").replace(/^\/+|\/+$/g, "");
    this.resolvedRef = config.ref ?? null;
  }

  /** The configured path-prefix, exposed for key rewriting by callers. */
  get rootPrefix(): string {
    return this.prefix;
  }

  private headers(): HeadersInit {
    const h: Record<string, string> = {
      "User-Agent": "lokri.io",
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (this.config.accessToken) {
      h.Authorization = `Bearer ${this.config.accessToken}`;
    }
    return h;
  }

  /** Resolve + cache the branch SHA/ref. Uses the repo's default branch when unspecified. */
  private async ref(): Promise<string> {
    if (this.resolvedRef) return this.resolvedRef;
    const res = await fetch(
      `${API_BASE}/repos/${this.owner}/${this.repo}`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      throw new Error(
        `GitHub: Repo ${this.owner}/${this.repo} nicht erreichbar (HTTP ${res.status}).`,
      );
    }
    const body = (await res.json()) as { default_branch?: string };
    if (!body.default_branch) {
      throw new Error("GitHub: Antwort ohne default_branch.");
    }
    this.resolvedRef = body.default_branch;
    return this.resolvedRef;
  }

  /**
   * HEAD-equivalent: fetch repo metadata. Throws on auth / not-found /
   * rate-limit errors so the "Test & Save" flow can surface them before
   * we persist.
   */
  async testConnection(): Promise<void> {
    const res = await fetch(
      `${API_BASE}/repos/${this.owner}/${this.repo}`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      if (res.status === 401) throw new Error("Token ungültig oder abgelaufen.");
      if (res.status === 403)
        throw new Error(
          "Zugriff verweigert — Token braucht `repo`-Scope, oder Rate-Limit erreicht.",
        );
      if (res.status === 404)
        throw new Error("Repo nicht gefunden — oder Token hat keinen Zugriff.");
      throw new Error(`GitHub HTTP ${res.status}`);
    }
    // Also verify the branch (if the user set a custom ref) by resolving it
    // via the refs API — early feedback beats failing at first import.
    if (this.config.ref) {
      const refRes = await fetch(
        `${API_BASE}/repos/${this.owner}/${this.repo}/git/refs/heads/${this.config.ref}`,
        { headers: this.headers() },
      );
      if (!refRes.ok && refRes.status !== 422) {
        // 422 = not a branch; could still be a tag/SHA — don't hard-fail.
        if (refRes.status === 404) {
          throw new Error(`Branch/Ref "${this.config.ref}" nicht gefunden.`);
        }
      }
    }
  }

  /**
   * Full-tree fetch for the configured ref. GitHub caches responses for
   * ~1 min server-side; we rely on that + the short lifetime of per-
   * request instances, so no in-process cache is needed.
   */
  private async tree(): Promise<TreeResponse> {
    const ref = await this.ref();
    const res = await fetch(
      `${API_BASE}/repos/${this.owner}/${this.repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
      { headers: this.headers() },
    );
    if (!res.ok) {
      throw new Error(`GitHub tree lookup HTTP ${res.status}`);
    }
    return (await res.json()) as TreeResponse;
  }

  /**
   * Directory-style listing. Both directories and files at the requested
   * level — matches the `S3Provider.listObjects` shape so the `/browse`
   * route doesn't need to branch.
   */
  async listObjects(
    relativePrefix: string,
  ): Promise<{
    directories: string[];
    objects: Array<{
      key: string;
      size: number;
      lastModified: string | null;
    }>;
    isTruncated: boolean;
    nextContinuationToken: string | null;
  }> {
    const tree = await this.tree();
    const cleanRel = relativePrefix.replace(/^\/+/, "");
    const normalized =
      cleanRel && !cleanRel.endsWith("/") ? `${cleanRel}/` : cleanRel;
    // "full" is what we compare tree paths against (tree paths are repo-root relative)
    const full = this.prefix
      ? normalized
        ? `${this.prefix}/${normalized}`
        : `${this.prefix}/`
      : normalized;

    const stripRoot = (repoPath: string): string => {
      if (!this.prefix) return repoPath;
      const p = `${this.prefix}/`;
      return repoPath.startsWith(p) ? repoPath.slice(p.length) : repoPath;
    };

    const dirSet = new Set<string>();
    const objects: Array<{
      key: string;
      size: number;
      lastModified: string | null;
    }> = [];

    for (const entry of tree.tree) {
      // Only files contribute; directory entries in the git tree are
      // derived from paths with slashes (we synthesise them below).
      if (entry.type !== "blob") continue;
      if (full && !entry.path.startsWith(full)) continue;
      const rel = stripRoot(entry.path);
      // `rel` is relative to rootPrefix. `relativeSub` further strips the
      // requested browse-prefix so we can split it.
      const relativeSub = normalized
        ? rel.startsWith(normalized)
          ? rel.slice(normalized.length)
          : null
        : rel;
      if (relativeSub === null) continue;

      const slashIdx = relativeSub.indexOf("/");
      if (slashIdx === -1) {
        objects.push({
          key: rel,
          size: entry.size ?? 0,
          lastModified: null, // tree response doesn't carry mtime
        });
      } else {
        // Entry lives in a sub-directory — record that dir and skip the file.
        const dirKey = (normalized ?? "") + relativeSub.slice(0, slashIdx + 1);
        dirSet.add(dirKey);
      }
    }

    const directories = [...dirSet].sort((a, b) => a.localeCompare(b));
    objects.sort((a, b) => a.key.localeCompare(b.key));

    return {
      directories,
      objects,
      // GitHub's tree is returned fully (or with `truncated:true` when >100k
      // items — handled by listRecursive for import, not an issue for typical
      // browsing). We don't page.
      isTruncated: false,
      nextContinuationToken: null,
    };
  }

  /**
   * Flat recursive listing — used by bulk-import of an entire directory.
   */
  async listRecursive(
    relativePrefix: string,
    limit = 500,
  ): Promise<{
    objects: Array<{
      key: string;
      size: number;
      lastModified: string | null;
    }>;
    truncatedAt: boolean;
  }> {
    const tree = await this.tree();
    const cleanRel = relativePrefix.replace(/^\/+/, "");
    const normalized =
      cleanRel && !cleanRel.endsWith("/") ? `${cleanRel}/` : cleanRel;
    const full = this.prefix
      ? normalized
        ? `${this.prefix}/${normalized}`
        : `${this.prefix}/`
      : normalized;

    const stripRoot = (repoPath: string): string => {
      if (!this.prefix) return repoPath;
      const p = `${this.prefix}/`;
      return repoPath.startsWith(p) ? repoPath.slice(p.length) : repoPath;
    };

    const collected: Array<{
      key: string;
      size: number;
      lastModified: string | null;
    }> = [];
    for (const entry of tree.tree) {
      if (entry.type !== "blob") continue;
      if (full && !entry.path.startsWith(full)) continue;
      collected.push({
        key: stripRoot(entry.path),
        size: entry.size ?? 0,
        lastModified: null,
      });
      if (collected.length >= limit) {
        return { objects: collected, truncatedAt: true };
      }
    }
    return { objects: collected, truncatedAt: tree.truncated };
  }

  /** Fetch raw bytes by repo-root-relative storage key. */
  async get(storageKey: string): Promise<StorageGetResult> {
    const ref = await this.ref();
    const url = `${RAW_BASE}/${this.owner}/${this.repo}/${encodeURIComponent(ref)}/${storageKey}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(
        `GitHub raw fetch failed (${res.status}) für ${storageKey}`,
      );
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    const mime = res.headers.get("content-type") ?? undefined;
    return { content: buf, mimeType: mime };
  }

  /** Path-prefix-aware fetch used by the import path. */
  async getByRelativeKey(relativeKey: string): Promise<{
    content: Uint8Array;
    mimeType?: string;
  }> {
    if (relativeKey.includes("..")) {
      throw new Error("Relative keys may not contain '..'.");
    }
    const cleanRel = relativeKey.replace(/^\/+/, "");
    const fullKey = this.prefix ? `${this.prefix}/${cleanRel}` : cleanRel;
    return this.get(fullKey);
  }

  async put(): Promise<never> {
    throw new Error("GitHub-Provider ist read-only — Uploads nicht möglich.");
  }

  async delete(): Promise<never> {
    throw new Error("GitHub-Provider ist read-only — Löschen nicht möglich.");
  }
}
