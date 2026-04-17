/**
 * MCP prompts are guided tasks the user can pick from Claude Desktop's
 * ⁄-menu, Cursor's prompt picker, etc. Each prompt yields a list of
 * `user`/`assistant` messages the client prepends to the next turn —
 * think of them as saved system-prompt templates with typed arguments.
 *
 * Keep prompts dumb: they return *messages*, not tool calls. The client
 * then chooses which tools to invoke. This keeps lokri's surface small
 * and lets the host's LLM orchestrate.
 */

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  // ----- summarize_space --------------------------------------------------
  server.registerPrompt(
    "summarize_space",
    {
      title: "Summarize a space",
      description:
        "Digest a lokri space: builds the context via `summarize_space`, " +
        "then asks the model for a tight, actionable summary.",
      argsSchema: {
        space_id: z
          .string()
          .uuid()
          .describe("Space UUID. Get one from list_spaces."),
        focus: z
          .string()
          .optional()
          .describe(
            "Optional angle — e.g. 'open questions', 'decisions', 'TODOs'.",
          ),
      },
    },
    ({ space_id, focus }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Rufe erst das Tool \`summarize_space\` mit \`space_id=${space_id}\` auf, ` +
              `um den aktuellen Stand zu lesen. Fasse das Ergebnis danach kompakt zusammen — ` +
              `kein Geschwätz, nur was wirklich drinsteht.` +
              (focus
                ? `\n\nSchwerpunkt: **${focus}**.`
                : `\n\nFormat: kurze Bullet-Liste, gruppiert nach Thema. Am Ende 1–3 Vorschläge, was als Nächstes Sinn ergibt.`),
          },
        },
      ],
    }),
  );

  // ----- triage_notes ------------------------------------------------------
  server.registerPrompt(
    "triage_notes",
    {
      title: "Triage recent notes",
      description:
        "Sichtet die letzten Notes im Account, sortiert nach: erledigt / offen " +
        "/ veraltet / duplikate. Optional space-scoped.",
      argsSchema: {
        space_id: z
          .string()
          .uuid()
          .optional()
          .describe("Optional — nur diesen Space triagen."),
        limit: z.string().optional().describe("Default 30."),
      },
    },
    ({ space_id, limit }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Lade die letzten Notes per \`list_notes\`` +
              (space_id ? ` mit \`space_id=${space_id}\`` : "") +
              ` (${limit ?? "30"} Stück). ` +
              `Hole für jede interessante Note den vollen Inhalt via \`fetch\` nach. ` +
              `Gruppiere die Notes dann in vier Buckets:\n\n` +
              `1. **Offen** — aktuell, Aktion steht noch aus.\n` +
              `2. **Erledigt** — kann archiviert werden.\n` +
              `3. **Veraltet** — Inhalt stimmt vermutlich nicht mehr.\n` +
              `4. **Duplikate** — mehrere Notes zum gleichen Thema.\n\n` +
              `Pro Bucket: Titel + Note-ID + ein Satz Begründung. Schlage am Ende ` +
              `konkrete Merge/Delete-Operationen vor, aber führe sie nicht aus.`,
          },
        },
      ],
    }),
  );

  // ----- daily_digest ------------------------------------------------------
  server.registerPrompt(
    "daily_digest",
    {
      title: "Daily digest",
      description:
        "Tages-Zusammenfassung aller Spaces: was wurde hinzugefügt, worauf sollte man achten.",
      argsSchema: {
        hours: z
          .string()
          .optional()
          .describe("Rückschau in Stunden, default 24."),
      },
    },
    ({ hours }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Baue mir einen Tages-Digest über die letzten ${hours ?? "24"} Stunden:\n\n` +
              `1. \`list_spaces\` — welche Spaces existieren?\n` +
              `2. Für jeden Space: \`list_notes\` + \`list_files\` (nach createdAt/updatedAt sortiert), ` +
              `nur Einträge im genannten Zeitfenster.\n` +
              `3. Ziehe 1–2 Zeilen zu jedem neu/geänderten Eintrag — über \`fetch\` ` +
              `wenn der Titel nicht aussagekräftig ist.\n\n` +
              `Gib dann eine Bulletliste aus, pro Space eine Überschrift. Schließe mit ` +
              `**"Was fällt auf?"** — max 3 Punkten, die mir heute tatsächlich helfen.`,
          },
        },
      ],
    }),
  );

  // ----- find_related ------------------------------------------------------
  server.registerPrompt(
    "find_related",
    {
      title: "Find related content",
      description:
        "Gegeben eine Note- oder File-ID: finde ähnliche Inhalte im Account.",
      argsSchema: {
        id: z.string().describe("Note- oder Chunk-ID, wie von `search` geliefert."),
      },
    },
    ({ id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text:
              `Hol dir den Inhalt von \`${id}\` per \`fetch\`. ` +
              `Nimm aus dem Inhalt die wichtigsten 3–5 Schlüsselbegriffe und feuere ` +
              `pro Begriff einen \`search\`-Call ab (parallel ok). Dedupe die Hits, ` +
              `lass die Ursprungs-ID weg, und präsentiere die 5 relevantesten Treffer ` +
              `mit Titel, Similarity und einer Zeile warum sie relevant sind.`,
          },
        },
      ],
    }),
  );
}
