/**
 * `/connect` Onboarding-UI — Source-Shape + i18n-Parität.
 *
 * Matched das Pattern aus tests/team-connectors-pages.test.ts: lesen
 * Source-Dateien + Locale-JSONs, prüfen Contract-Eigenschaften
 * statisch.
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(process.cwd());
const de = JSON.parse(
  readFileSync(resolve(root, "messages/de.json"), "utf-8"),
) as Record<string, unknown>;
const en = JSON.parse(
  readFileSync(resolve(root, "messages/en.json"), "utf-8"),
) as Record<string, unknown>;

function getNested(
  obj: Record<string, unknown>,
  path: string,
): unknown {
  const parts = path.split(".");
  let curr: unknown = obj;
  for (const p of parts) {
    if (!curr || typeof curr !== "object") return undefined;
    curr = (curr as Record<string, unknown>)[p];
  }
  return curr;
}

function flatten(
  obj: unknown,
  prefix = "",
  out: string[] = [],
): string[] {
  if (typeof obj !== "object" || obj === null) {
    out.push(prefix);
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    flatten(v, prefix ? `${prefix}.${k}` : k, out);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Route-Existenz
// ---------------------------------------------------------------------------

for (const path of [
  "app/(dashboard)/connect/page.tsx",
  "app/(dashboard)/connect/claude-desktop/page.tsx",
  "app/(dashboard)/connect/claude-desktop/_wizard.tsx",
  "app/(dashboard)/connect/chatgpt/page.tsx",
  "app/(dashboard)/connect/chatgpt/_copy-url.tsx",
  "app/api/connect/claude-desktop/route.ts",
]) {
  test(`route exists: ${path}`, () => {
    assert.ok(existsSync(resolve(root, path)), `missing ${path}`);
  });
}

// ---------------------------------------------------------------------------
// i18n-Parität
// ---------------------------------------------------------------------------

test("connect: de + en haben gleiche Keys", () => {
  const deKeys = flatten(getNested(de, "connect")).sort();
  const enKeys = flatten(getNested(en, "connect")).sort();
  assert.deepEqual(deKeys, enKeys);
});

test("connect: beide Sprachen haben die Kern-Keys für Landing + Claude Desktop + ChatGPT", () => {
  const required = [
    "connect.landing.title",
    "connect.landing.claude.title",
    "connect.landing.chatgpt.title",
    "connect.claudeDesktop.title",
    "connect.claudeDesktop.step1.title",
    "connect.claudeDesktop.step1.allLabel",
    "connect.claudeDesktop.step1.selectedLabel",
    "connect.claudeDesktop.step1.readOnlyLabel",
    "connect.claudeDesktop.step1.expiryNote",
    "connect.claudeDesktop.step2.nameLabel",
    "connect.claudeDesktop.step2.createToken",
    "connect.claudeDesktop.step3.oneTimeWarning",
    "connect.claudeDesktop.step3.configLabel",
    "connect.claudeDesktop.step3.os.macos",
    "connect.claudeDesktop.step3.os.windows",
    "connect.claudeDesktop.step3.os.linux",
    "connect.claudeDesktop.step4.doneCta",
    // ChatGPT-Anleitungs-Keys (stub ist raus)
    "connect.chatgpt.title",
    "connect.chatgpt.scopeWarning.title",
    "connect.chatgpt.scopeWarning.body",
    "connect.chatgpt.prereq.plan",
    "connect.chatgpt.prereq.devMode",
    "connect.chatgpt.url.title",
    "connect.chatgpt.url.oauthNote",
    "connect.chatgpt.steps.step1",
    "connect.chatgpt.steps.step7",
    "connect.chatgpt.doneCta",
  ];
  for (const path of required) {
    assert.equal(
      typeof getNested(de, path),
      "string",
      `missing in de: ${path}`,
    );
    assert.equal(
      typeof getNested(en, path),
      "string",
      `missing in en: ${path}`,
    );
  }
});

// ---------------------------------------------------------------------------
// Token-Security-Guard in API-Route
// ---------------------------------------------------------------------------

test("/api/connect/claude-desktop: audit logs clientType for createdVia lookup", () => {
  const source = readFileSync(
    resolve(root, "app/api/connect/claude-desktop/route.ts"),
    "utf-8",
  );
  // Sicherheits-kritische Contracts:
  //  - clientType wird im audit-event gesetzt, damit Block 3 JOIN
  //    statt Schema-Migration das "Erstellt via" rekonstruieren kann
  assert.match(
    source,
    /user\.connect\.token_created/,
    "audit action missing",
  );
  assert.match(source, /clientType:\s*"claude-desktop"/, "clientType missing");
  // Tokens sind fest personal-scoped — keine team-tokens über diesen Flow
  assert.match(source, /scopeType:\s*"personal"/);
  // Rate-limit greift
  assert.match(source, /tokenCreate/);
});

test("/api/connect/claude-desktop: Response-Shape sendet plaintext nur einmal zurück", () => {
  const source = readFileSync(
    resolve(root, "app/api/connect/claude-desktop/route.ts"),
    "utf-8",
  );
  // Die Route returnt plaintext im 201-Body; keine anderen NextResponse.json-
  // Calls sollen den Plaintext nochmal durchreichen (defensive Prüfung).
  const responses = source.match(/NextResponse\.json\([\s\S]*?\)/g) ?? [];
  const plaintextResponses = responses.filter((r) => /plaintext/.test(r));
  assert.equal(plaintextResponses.length, 1, "plaintext should appear in exactly one response");
});

// ---------------------------------------------------------------------------
// ChatGPT-Page Contract-Guards
// ---------------------------------------------------------------------------

test("/connect/chatgpt page renders scope-warning + OAuth-auto-note + done-CTA", () => {
  const source = readFileSync(
    resolve(root, "app/(dashboard)/connect/chatgpt/page.tsx"),
    "utf-8",
  );
  // Warning-Banner ist sichtbar (verweist auf scopeWarning-Keys)
  assert.match(source, /scopeWarning\.title/);
  assert.match(source, /scopeWarning\.body/);
  // OAuth läuft automatisch — User soll wissen, dass er keinen Token kopiert
  assert.match(source, /url\.oauthNote/);
  // Done-CTA führt zurück zum Dashboard
  assert.match(source, /href="\/dashboard"/);
  // MCP-URL wird auf dem Server konstruiert (kein geheimer Token im Client)
  assert.match(source, /resolveAppOrigin\(\)/);
  assert.match(source, /\/api\/mcp/);
});

test("/connect/chatgpt uses no fetch/form — reine Anleitungs-UI", () => {
  const page = readFileSync(
    resolve(root, "app/(dashboard)/connect/chatgpt/page.tsx"),
    "utf-8",
  );
  // Page macht keine POSTs, kein Form — nur Anleitung + Copy-Button.
  assert.ok(!/fetch\(/.test(page), "page should not contain fetch() calls");
  assert.ok(!/<form/.test(page), "page should not contain a <form> element");
});

// ---------------------------------------------------------------------------
// Block 3: Dashboard + Settings-Integration
// ---------------------------------------------------------------------------

test("dashboard: quickActions.connect replaces the legacy mcpToken slot", () => {
  assert.equal(
    typeof getNested(de, "dashboard.home.quickActions.connect.label"),
    "string",
  );
  assert.equal(
    typeof getNested(en, "dashboard.home.quickActions.connect.label"),
    "string",
  );
  assert.equal(
    getNested(de, "dashboard.home.quickActions.mcpToken"),
    undefined,
    "mcpToken slot should be removed from de locale",
  );
  assert.equal(
    getNested(en, "dashboard.home.quickActions.mcpToken"),
    undefined,
    "mcpToken slot should be removed from en locale",
  );
});

test("dashboard page points the connect quick-action to /connect", () => {
  const source = readFileSync(
    resolve(root, "app/(dashboard)/dashboard/page.tsx"),
    "utf-8",
  );
  assert.match(source, /href="\/connect"/);
  assert.match(source, /quickActions\.connect/);
  // Icon-Import vom neuen Plug-Glyph, nicht mehr Key.
  assert.ok(
    !/import[^;]*\bKey\b[^;]*lucide-react/.test(source),
    "Key icon import should be gone after switching to Plug",
  );
});

test("settings/mcp page gained the connect-promo card and dropped McpInstructions", () => {
  const source = readFileSync(
    resolve(root, "app/(dashboard)/settings/mcp/page.tsx"),
    "utf-8",
  );
  assert.match(source, /connectPromo/);
  assert.match(source, /href="\/connect"/);
  // McpInstructions-Card + -File sind weg (Kommentar-Referenz
  // bleibt erlaubt; wir prüfen nur Import + JSX-Usage).
  assert.ok(!/import.*McpInstructions/.test(source));
  assert.ok(!/<McpInstructions\b/.test(source));
  assert.equal(
    existsSync(
      resolve(root, "app/(dashboard)/settings/mcp/_mcp-instructions.tsx"),
    ),
    false,
    "_mcp-instructions.tsx should be deleted",
  );
});

test("settings.mcp.connectPromo keys present in both locales", () => {
  for (const key of [
    "settings.mcp.connectPromo.title",
    "settings.mcp.connectPromo.description",
    "settings.mcp.connectPromo.cta",
    "settings.mcp.legacyTokens.createdVia.claude-desktop",
  ]) {
    assert.equal(typeof getNested(de, key), "string", `missing de: ${key}`);
    assert.equal(typeof getNested(en, key), "string", `missing en: ${key}`);
  }
});

test("settings/mcp page joins audit_events for createdVia attribution", () => {
  const source = readFileSync(
    resolve(root, "app/(dashboard)/settings/mcp/page.tsx"),
    "utf-8",
  );
  // LEFT-JOIN auf audit_events mit dem connect-spezifischen Action-Slug.
  assert.match(source, /leftJoin\s*\(\s*auditEvents/);
  assert.match(source, /user\.connect\.token_created/);
  // createdVia wird pro Token aus metadata.clientType extrahiert und
  // an den TokenList-Client weitergegeben.
  assert.match(source, /clientType/);
  assert.match(source, /createdVia/);
});

test("docs/MCP_ONBOARDING.md exists and covers both clients + scope caveat", () => {
  const p = resolve(root, "docs/MCP_ONBOARDING.md");
  assert.ok(existsSync(p));
  const source = readFileSync(p, "utf-8");
  assert.match(source, /Claude Desktop/);
  assert.match(source, /ChatGPT/);
  // Die Scope-Limitierung ist explizit dokumentiert
  assert.match(source, /Scope-Limitierung/i);
});
