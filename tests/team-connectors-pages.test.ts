/**
 * Team-Connectors UI — Source-Shape + i18n-Parität.
 *
 * Matched das Pattern aus `tests/team-pages.test.ts`: lesen Source-
 * Dateien + Locale-JSONs, prüfen Contract-Eigenschaften statisch.
 * Kein React-Render (gibt's im Projekt nicht als Test-Pattern).
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

// ---------------------------------------------------------------------------
// Route-Dateien existieren
// ---------------------------------------------------------------------------

for (const path of [
  // Block 1 Pages
  "app/(dashboard)/team/connectors/page.tsx",
  "app/(dashboard)/team/connectors/new/page.tsx",
  "app/(dashboard)/team/connectors/new/confluence/page.tsx",
  "app/(dashboard)/team/connectors/new/confluence/_wizard.tsx",
  // Block 2 Pages
  "app/(dashboard)/team/connectors/[integrationId]/page.tsx",
  "app/(dashboard)/team/connectors/[integrationId]/_controls.tsx",
  "app/(dashboard)/team/connectors/[integrationId]/_scopes-manager.tsx",
  "app/(dashboard)/team/connectors/[integrationId]/_mappings-manager.tsx",
  // API
  "app/api/teams/[id]/connectors/route.ts",
  "app/api/teams/[id]/connectors/validate/route.ts",
  "app/api/teams/[id]/connectors/[integrationId]/route.ts",
  "app/api/teams/[id]/connectors/[integrationId]/credentials/route.ts",
  "app/api/teams/[id]/connectors/[integrationId]/test/route.ts",
  "app/api/teams/[id]/connectors/[integrationId]/discover/route.ts",
  "app/api/teams/[id]/connectors/[integrationId]/scopes/route.ts",
  "app/api/teams/[id]/connectors/[integrationId]/mappings/route.ts",
  "app/api/teams/[id]/connectors/[integrationId]/mappings/[mappingId]/route.ts",
]) {
  test(`route exists: ${path}`, () => {
    assert.ok(existsSync(resolve(root, path)), `missing ${path}`);
  });
}

// Dev-Script ist auf Debug-Only reduziert (Block 2)
test("dev-setup-script is flagged as debug-only, not the primary setup path", () => {
  const p = resolve(root, "scripts/confluence-setup-dev.ts");
  assert.ok(existsSync(p));
  const source = readFileSync(p, "utf-8");
  assert.match(source, /DEBUG-ONLY/i);
  assert.match(source, /Admin-UI.*produktive/i);
});

// ---------------------------------------------------------------------------
// TeamTabs hat den neuen Connectors-Tab
// ---------------------------------------------------------------------------

test("TeamTabs includes the connectors tab between members and security", () => {
  const source = readFileSync(
    resolve(root, "app/(dashboard)/team/_tabs.tsx"),
    "utf-8",
  );
  const members = source.indexOf("/team/members");
  const connectors = source.indexOf("/team/connectors");
  const security = source.indexOf("/team/security");
  assert.ok(members > 0, "members tab missing");
  assert.ok(connectors > members, "connectors tab must come after members");
  assert.ok(
    security > connectors,
    "security tab must come after connectors",
  );
});

// ---------------------------------------------------------------------------
// i18n-Parität de ↔ en
// ---------------------------------------------------------------------------

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

test("team.connectors: de + en haben gleiche Keys", () => {
  const deKeys = flatten(getNested(de, "team.connectors")).sort();
  const enKeys = flatten(getNested(en, "team.connectors")).sort();
  assert.deepEqual(deKeys, enKeys);
});

test("team.connectors: beide Sprachen haben die Kern-Setup-Keys", () => {
  const required = [
    "team.connectors.tabLabel",
    "team.connectors.overview.title",
    "team.connectors.overview.newConnection",
    "team.connectors.overview.emptyTitle",
    "team.connectors.setup.title",
    "team.connectors.setup.step1.title",
    "team.connectors.setup.step1.validateCta",
    "team.connectors.setup.step2.title",
    "team.connectors.setup.step3.title",
    "team.connectors.setup.step4.submitCta",
    "team.connectors.errors.connector.integration.notFound",
    "team.connectors.errors.connector.integration.credentialsRejected",
    "team.connectors.errors.connector.integration.unknownError",
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

test("team.connectors.detail: Block-2-Keys in beiden Sprachen", () => {
  const required = [
    "team.connectors.detail.subtitle",
    "team.connectors.detail.overviewTitle",
    "team.connectors.detail.displayNameLabel",
    "team.connectors.detail.enabledLabel",
    "team.connectors.detail.testCta",
    "team.connectors.detail.credentialsTitle",
    "team.connectors.detail.credentialsRotateCta",
    "team.connectors.detail.scopesTitle",
    "team.connectors.detail.scopesRefreshCta",
    "team.connectors.detail.scopesCascadeWarning",
    "team.connectors.detail.mappingsTitle",
    "team.connectors.detail.mappingsAddCta",
    "team.connectors.detail.mappingsAlreadyMapped",
    "team.connectors.detail.deleteTitle",
    "team.connectors.detail.deleteConfirmSubmit",
    "team.connectors.detail.errorBannerTitle",
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

test("team.layout.navigation.connectors: both locales have the nav label", () => {
  assert.equal(
    typeof getNested(de, "team.layout.navigation.connectors"),
    "string",
  );
  assert.equal(
    typeof getNested(en, "team.layout.navigation.connectors"),
    "string",
  );
});

// ---------------------------------------------------------------------------
// Security-Contracts: keine Credentials in Response-Shape
// ---------------------------------------------------------------------------

test("GET /connectors route does NOT return credentials in response fields", () => {
  const source = readFileSync(
    resolve(root, "app/api/teams/[id]/connectors/route.ts"),
    "utf-8",
  );
  // Response-shape sollte keine `credentials` oder `credentialsEncrypted`
  // keys enthalten. Wir checken das grob via String-Match auf dem File —
  // formal ein Smoke-Test, aber fängt eine ganze Klasse von Regressionen
  // ab.
  // `s`-Flag (dotAll) wird von unserer TS-Target nicht gemappt;
  // stattdessen Zeilenumbrüche explizit zulassen via `[\s\S]`.
  const responseShapes = source.match(/NextResponse\.json\([\s\S]*?\)/g) ?? [];
  for (const block of responseShapes) {
    assert.ok(
      !/credentialsEncrypted|(["'])credentials\1\s*:/.test(block),
      `credentials leaked in response block: ${block.slice(0, 120)}...`,
    );
  }
});

test("GET /connectors/[id] route does NOT return credentials in response", () => {
  const source = readFileSync(
    resolve(root, "app/api/teams/[id]/connectors/[integrationId]/route.ts"),
    "utf-8",
  );
  // `s`-Flag (dotAll) wird von unserer TS-Target nicht gemappt;
  // stattdessen Zeilenumbrüche explizit zulassen via `[\s\S]`.
  const responseShapes = source.match(/NextResponse\.json\([\s\S]*?\)/g) ?? [];
  for (const block of responseShapes) {
    assert.ok(
      !/credentialsEncrypted|(["'])credentials\1\s*:/.test(block),
      `credentials leaked in response block: ${block.slice(0, 120)}...`,
    );
  }
});

// ---------------------------------------------------------------------------
// Rate-Limit-Bucket registriert
// ---------------------------------------------------------------------------

test("rate-limit has connectorAction bucket", () => {
  const source = readFileSync(
    resolve(root, "lib/rate-limit.ts"),
    "utf-8",
  );
  assert.match(source, /connectorAction:\s*makeLimiter/);
  assert.match(source, /"connector-action"/);
});
