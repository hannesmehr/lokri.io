/**
 * CQL-Builder für Confluence-`search`-Tool.
 *
 * CQL (Confluence Query Language) ist SQL-ähnlich, hat aber eigene
 * Escape-Regeln:
 *   - String-Literale in Double-Quotes
 *   - Innerhalb von Quotes: `\` und `"` müssen escaped werden
 *     (`\\` bzw. `\"`)
 *
 * Der Builder ist bewusst restriktiv — wir werfen bei leerer Space-
 * Liste statt eine Query zu bauen, die *alle* Spaces scannen würde.
 * Leere Allowlist = keine Berechtigung = keine Ergebnisse. Der Gateway-
 * Pre-Filter fängt das normalerweise schon ab, aber defense-in-depth.
 *
 * Escape-Reihenfolge: **Backslash zuerst, dann Double-Quote.** Würde
 * man Quote zuerst ersetzen, würde der eingefügte Backslash im
 * nächsten Schritt nochmal verdoppelt → Over-Escape.
 */

export class CqlBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CqlBuilderError";
  }
}

/**
 * Escape für String-Werte innerhalb `"..."`.
 * Public, damit Tests gezielt drangehen können.
 */
export function escapeCqlString(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/**
 * Space-Keys sind technisch Identifier, werden aber in CQL genauso
 * wie Strings in Quotes gewrappt. Die Escape-Logik ist identisch —
 * wir halten die Funktion trotzdem separat, weil:
 *   - semantische Lesbarkeit am Call-Site (`escapeCqlIdentifier(key)`
 *     vs `escapeCqlString(key)`)
 *   - falls Atlassian jemals eigene Regeln für Identifier einführt
 *     (z.B. Backtick statt Quote), ändern wir nur hier
 *
 * Empro-Spaces haben Whitespace in Keys (`KnowHow`, `intern`) — das
 * passiert zwar nicht häufig, aber der Quote-Wrap macht's robust.
 */
export function escapeCqlIdentifier(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export interface BuildSearchCqlInput {
  /** User-Query aus args.query. Wird als text-Filter eingesetzt. */
  query: string;
  /** Space-Keys (nicht numerische IDs). Muss non-empty sein. */
  spaceKeys: string[];
}

/**
 * Baut eine CQL-Query der Form:
 *
 *   type = "page" AND space IN ("KEY1", "KEY2") AND text ~ "user query"
 *
 * - `type = "page"` filtert Comments + Attachments raus (MVP-Scope)
 * - `space IN (...)` enforcet die Allowlist — jeder Space in Quotes
 * - `text ~ "..."` ist CQL's Full-Text-Operator
 */
export function buildSearchCql(input: BuildSearchCqlInput): string {
  if (input.spaceKeys.length === 0) {
    throw new CqlBuilderError(
      "buildSearchCql refuses to build an unscoped query; pass at least one space key.",
    );
  }

  const spaceList = input.spaceKeys
    .map((key) => `"${escapeCqlIdentifier(key)}"`)
    .join(", ");

  const escapedQuery = escapeCqlString(input.query);

  return `type = "page" AND space IN (${spaceList}) AND text ~ "${escapedQuery}"`;
}
