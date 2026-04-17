/**
 * MCP resources expose lokri entities under stable URIs so the client can
 * attach them as context without explicit tool-calling. Claude Desktop /
 * Cursor render them in an "attach resource" UI.
 *
 * URI schemes used:
 *   - `lokri://note/{id}`               — plaintext note body
 *   - `lokri://file/{id}`               — raw file bytes (binary or text)
 *   - `lokri://space/{id}/digest`       — structured space summary (text)
 *
 * Listing:
 *   Each template exposes a `list` callback so clients can enumerate
 *   available URIs. Lists are capped at 200 entries per call — beyond
 *   that the user should use `search` / `list_*` tools.
 */

import { and, desc, eq, inArray, type AnyColumn, type SQL } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { db } from "@/lib/db";
import { files, notes, spaces } from "@/lib/db/schema";
import { getProviderForFile } from "@/lib/storage";

type ExtraWithAuth = {
  authInfo?: {
    extra?: {
      ownerAccountId?: string;
      spaceScope?: string[] | null;
    };
  };
};

interface AuthLite {
  ownerAccountId: string;
  spaceScope: string[] | null;
}

function requireAuth(extra: ExtraWithAuth): AuthLite {
  const id = extra?.authInfo?.extra?.ownerAccountId;
  if (!id || typeof id !== "string") {
    throw new Error("Missing auth context.");
  }
  const scope = extra?.authInfo?.extra?.spaceScope ?? null;
  return {
    ownerAccountId: id,
    spaceScope: scope && scope.length > 0 ? scope : null,
  };
}

function scopeCondition(
  column: AnyColumn,
  scope: string[] | null,
): SQL | undefined {
  if (!scope || scope.length === 0) return undefined;
  return inArray(column, scope);
}

export function registerResources(server: McpServer): void {
  // ----- lokri://note/{id} ------------------------------------------------
  server.registerResource(
    "note",
    new ResourceTemplate("lokri://note/{id}", {
      list: async (extra) => {
        const { ownerAccountId, spaceScope } = requireAuth(extra as ExtraWithAuth);
        const sc = scopeCondition(notes.spaceId, spaceScope);
        const rows = await db
          .select({
            id: notes.id,
            title: notes.title,
            updatedAt: notes.updatedAt,
          })
          .from(notes)
          .where(
            and(
              eq(notes.ownerAccountId, ownerAccountId),
              eq(notes.mcpHidden, false),
              ...(sc ? [sc] : []),
            ),
          )
          .orderBy(desc(notes.updatedAt))
          .limit(200);
        return {
          resources: rows.map((r) => ({
            uri: `lokri://note/${r.id}`,
            name: r.title,
            description: `Note (updated ${r.updatedAt.toISOString()})`,
            mimeType: "text/plain",
          })),
        };
      },
    }),
    {
      title: "Note",
      description: "A lokri note. Body is plain text.",
      mimeType: "text/plain",
    },
    async (uri, variables, extra) => {
      const { ownerAccountId, spaceScope } = requireAuth(extra as ExtraWithAuth);
      const sc = scopeCondition(notes.spaceId, spaceScope);
      const id = String(variables.id);
      const [note] = await db
        .select()
        .from(notes)
        .where(
          and(
            eq(notes.id, id),
            eq(notes.ownerAccountId, ownerAccountId),
            eq(notes.mcpHidden, false),
            ...(sc ? [sc] : []),
          ),
        )
        .limit(1);
      if (!note) throw new Error(`Note not found: ${id}`);
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/plain",
            text: `# ${note.title}\n\n${note.contentText}`,
          },
        ],
      };
    },
  );

  // ----- lokri://file/{id} ------------------------------------------------
  server.registerResource(
    "file",
    new ResourceTemplate("lokri://file/{id}", {
      list: async (extra) => {
        const { ownerAccountId, spaceScope } = requireAuth(extra as ExtraWithAuth);
        const sc = scopeCondition(files.spaceId, spaceScope);
        const rows = await db
          .select({
            id: files.id,
            filename: files.filename,
            mimeType: files.mimeType,
            sizeBytes: files.sizeBytes,
            createdAt: files.createdAt,
          })
          .from(files)
          .where(
            and(
              eq(files.ownerAccountId, ownerAccountId),
              eq(files.mcpHidden, false),
              ...(sc ? [sc] : []),
            ),
          )
          .orderBy(desc(files.createdAt))
          .limit(200);
        return {
          resources: rows.map((r) => ({
            uri: `lokri://file/${r.id}`,
            name: r.filename,
            description: `${r.mimeType} · ${(r.sizeBytes / 1024).toFixed(1)} KB`,
            mimeType: r.mimeType,
          })),
        };
      },
    }),
    {
      title: "File",
      description:
        "A file stored in lokri. Text-like MIME types are delivered as text, " +
        "others as base64 blob.",
    },
    async (uri, variables, extra) => {
      const { ownerAccountId, spaceScope } = requireAuth(extra as ExtraWithAuth);
      const sc = scopeCondition(files.spaceId, spaceScope);
      const id = String(variables.id);
      const [file] = await db
        .select()
        .from(files)
        .where(
          and(
            eq(files.id, id),
            eq(files.ownerAccountId, ownerAccountId),
            eq(files.mcpHidden, false),
            ...(sc ? [sc] : []),
          ),
        )
        .limit(1);
      if (!file) throw new Error(`File not found: ${id}`);

      const provider = await getProviderForFile(file.storageProviderId);
      const { content } = await provider.get(file.storageKey);
      const isTextual =
        file.mimeType.startsWith("text/") ||
        file.mimeType === "application/json" ||
        file.mimeType === "application/xml";

      if (isTextual) {
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: file.mimeType,
              text: Buffer.from(content).toString("utf-8"),
            },
          ],
        };
      }
      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: file.mimeType,
            blob: Buffer.from(content).toString("base64"),
          },
        ],
      };
    },
  );

  // ----- lokri://space/{id}/digest ----------------------------------------
  server.registerResource(
    "space-digest",
    new ResourceTemplate("lokri://space/{id}/digest", {
      list: async (extra) => {
        const { ownerAccountId, spaceScope } = requireAuth(extra as ExtraWithAuth);
        const sc = scopeCondition(spaces.id, spaceScope);
        const rows = await db
          .select({
            id: spaces.id,
            name: spaces.name,
            updatedAt: spaces.updatedAt,
          })
          .from(spaces)
          .where(
            and(
              eq(spaces.ownerAccountId, ownerAccountId),
              ...(sc ? [sc] : []),
            ),
          )
          .orderBy(desc(spaces.updatedAt))
          .limit(200);
        return {
          resources: rows.map((r) => ({
            uri: `lokri://space/${r.id}/digest`,
            name: `${r.name} — Digest`,
            description: "Kurze Zusammenfassung aller Notes + Files im Space.",
            mimeType: "text/markdown",
          })),
        };
      },
    }),
    {
      title: "Space Digest",
      description:
        "Strukturierte Zusammenfassung aller Inhalte eines Spaces — dieselben " +
        "Daten wie das `summarize_space`-Tool, aber als lesbare Ressource.",
      mimeType: "text/markdown",
    },
    async (uri, variables, extra) => {
      const { ownerAccountId, spaceScope } = requireAuth(extra as ExtraWithAuth);
      const id = String(variables.id);
      if (spaceScope && !spaceScope.includes(id)) {
        throw new Error(`Space out of scope: ${id}`);
      }
      const [space] = await db
        .select()
        .from(spaces)
        .where(
          and(eq(spaces.id, id), eq(spaces.ownerAccountId, ownerAccountId)),
        )
        .limit(1);
      if (!space) throw new Error(`Space not found: ${id}`);

      const [noteRows, fileRows] = await Promise.all([
        db
          .select({
            id: notes.id,
            title: notes.title,
            contentText: notes.contentText,
          })
          .from(notes)
          .where(
            and(
              eq(notes.ownerAccountId, ownerAccountId),
              eq(notes.spaceId, id),
              eq(notes.mcpHidden, false),
            ),
          )
          .orderBy(desc(notes.updatedAt))
          .limit(15),
        db
          .select({
            id: files.id,
            filename: files.filename,
            mimeType: files.mimeType,
            sizeBytes: files.sizeBytes,
          })
          .from(files)
          .where(
            and(
              eq(files.ownerAccountId, ownerAccountId),
              eq(files.spaceId, id),
              eq(files.mcpHidden, false),
            ),
          )
          .orderBy(desc(files.createdAt))
          .limit(20),
      ]);

      const abbrev = (s: string, n = 280) => {
        const t = s.trim().replace(/\s+/g, " ");
        return t.length <= n ? t : `${t.slice(0, n)}…`;
      };

      const lines: string[] = [];
      lines.push(`# ${space.name}`);
      if (space.description) lines.push(`\n${space.description}`);
      lines.push(`\n## Notes (${noteRows.length})`);
      for (const n of noteRows) {
        lines.push(`- **${n.title}** — ${abbrev(n.contentText)}`);
      }
      lines.push(`\n## Files (${fileRows.length})`);
      for (const f of fileRows) {
        lines.push(
          `- ${f.filename} · ${f.mimeType} · ${(f.sizeBytes / 1024).toFixed(1)} KB`,
        );
      }

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "text/markdown",
            text: lines.join("\n"),
          },
        ],
      };
    },
  );
}
