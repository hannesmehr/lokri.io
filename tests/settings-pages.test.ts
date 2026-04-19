import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

/**
 * Block-2-Refactor-Guard für `/settings/*`. Analog zu
 * `tests/profile-pages.test.ts` — wir pinnen Source-Shape + i18n-
 * Parität, weil echte Server-Component-Snapshots an DB + next-intl-
 * Runtime scheitern.
 *
 * Spezifisch für Block 2:
 *   1. Alle vier Sub-Pages (`general`, `mcp`, `storage`,
 *      `embedding-key`) nutzen `<PageHeader>` + `<SettingsTabs />` +
 *      `<SettingsScopeHint />`, in dieser Reihenfolge
 *   2. Die DangerZone-Duplikat-Seite unter `/settings/page.tsx` ist
 *      ersatzlos weg
 *   3. Das Settings-Layout rendert keinen eigenen H1 oder SectionNav
 *      mehr (analog zu Profile in Block 1)
 *   4. `next.config.ts` redirected `/settings` permanent auf
 *      `/settings/general`
 *   5. i18n: `settings.{general,mcp,storage,embeddingKey}.pageHeader`
 *      + `settings.scopeHint.{personal, team}` existieren shape-
 *      identisch in DE + EN
 */

const root = resolve(process.cwd());
const en = JSON.parse(
  readFileSync(resolve(root, "messages/en.json"), "utf-8"),
) as Record<string, unknown>;
const de = JSON.parse(
  readFileSync(resolve(root, "messages/de.json"), "utf-8"),
) as Record<string, unknown>;

const subPages = [
  "app/(dashboard)/settings/general/page.tsx",
  "app/(dashboard)/settings/mcp/page.tsx",
  "app/(dashboard)/settings/storage/page.tsx",
  "app/(dashboard)/settings/embedding-key/page.tsx",
] as const;

function getNested(
  obj: Record<string, unknown>,
  path: string,
): Record<string, unknown> | undefined {
  const parts = path.split(".");
  let curr: unknown = obj;
  for (const p of parts) {
    if (!curr || typeof curr !== "object") return undefined;
    curr = (curr as Record<string, unknown>)[p];
  }
  return curr as Record<string, unknown> | undefined;
}

// ── Source-Shape ───────────────────────────────────────────────────────

for (const path of subPages) {
  test(`${path} rendert PageHeader + SettingsTabs + SettingsScopeHint in Reihenfolge`, () => {
    const src = readFileSync(resolve(root, path), "utf-8");
    assert.match(src, /<PageHeader\s/);
    assert.match(src, /<SettingsTabs\s*\/>/);
    assert.match(src, /<SettingsScopeHint\s/);
    const headerIdx = src.indexOf("<PageHeader");
    const tabsIdx = src.indexOf("<SettingsTabs");
    const hintIdx = src.indexOf("<SettingsScopeHint");
    assert.ok(
      headerIdx >= 0 && tabsIdx >= 0 && hintIdx >= 0,
      `${path}: alle drei Komponenten müssen gerendert werden`,
    );
    assert.ok(
      headerIdx < tabsIdx,
      `${path}: <PageHeader> muss vor <SettingsTabs /> stehen`,
    );
    assert.ok(
      tabsIdx < hintIdx,
      `${path}: <SettingsTabs /> muss vor <SettingsScopeHint /> stehen`,
    );
  });
}

// ── DangerZone-Duplikat ist weg ───────────────────────────────────────

test("/settings/page.tsx existiert nicht mehr (DangerZone-Duplikat gelöscht)", () => {
  const path = resolve(root, "app/(dashboard)/settings/page.tsx");
  assert.ok(
    !existsSync(path),
    "Alte Settings-Root-Page mit DangerZone soll gelöscht sein — nur /profile/data ist jetzt die einzige Konto-Löschen-Stelle",
  );
});

// ── Settings-Layout-Slimdown ──────────────────────────────────────────

test("Settings-Layout rendert keinen eigenen H1 oder SectionNav mehr", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/settings/layout.tsx"),
    "utf-8",
  );
  assert.ok(!/<h1\b/.test(src), "Layout-H1 soll durch PageHeader ersetzt sein");
  assert.ok(
    !/<SectionNav/.test(src),
    "Layout soll SectionNav nicht mehr selbst rendern (wird per-Page via SettingsTabs injiziert)",
  );
});

// ── SettingsTabs-Shape ─────────────────────────────────────────────────

test("SettingsTabs enthält genau die vier sub-routes und NICHT /settings/team", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/settings/_tabs.tsx"),
    "utf-8",
  );
  // Core-Routes
  for (const href of [
    "/settings/general",
    "/settings/mcp",
    "/settings/storage",
    "/settings/embedding-key",
  ]) {
    assert.ok(
      src.includes(href),
      `SettingsTabs muss ${href} verlinken`,
    );
  }
  // Team-Tab ist entfernt (i18n-Key settings.navigation.team bleibt
  // vorhanden, wird aber nicht mehr referenziert).
  assert.ok(
    !src.includes("/settings/team"),
    "SettingsTabs darf /settings/team nicht mehr verlinken (Umzug nach /team in Block 3)",
  );
});

// ── next.config Redirect ──────────────────────────────────────────────

test("next.config.ts redirected /settings auf /settings/general (permanent)", () => {
  const src = readFileSync(resolve(root, "next.config.ts"), "utf-8");
  assert.match(src, /async redirects\(\)/);
  assert.match(src, /source:\s*["']\/settings["']/);
  assert.match(src, /destination:\s*["']\/settings\/general["']/);
  assert.match(src, /permanent:\s*true/);
});

// ── i18n-Shape-Parity ──────────────────────────────────────────────────

for (const ns of [
  "settings.general.pageHeader",
  "settings.mcp.pageHeader",
  "settings.storage.pageHeader",
  "settings.embeddingKey.pageHeader",
]) {
  test(`i18n: ${ns} existiert in beiden Locales mit identischer Shape`, () => {
    const enObj = getNested(en, ns);
    const deObj = getNested(de, ns);
    assert.ok(enObj, `EN: ${ns} fehlt`);
    assert.ok(deObj, `DE: ${ns} fehlt`);
    assert.deepEqual(
      Object.keys(enObj!).sort(),
      Object.keys(deObj!).sort(),
    );
    assert.ok(
      typeof (enObj as Record<string, unknown>).title === "string",
      `${ns}.title fehlt in EN`,
    );
    assert.ok(
      typeof (deObj as Record<string, unknown>).title === "string",
      `${ns}.title fehlt in DE`,
    );
    assert.ok(
      typeof (enObj as Record<string, unknown>).description === "string",
      `${ns}.description fehlt in EN`,
    );
    assert.ok(
      typeof (deObj as Record<string, unknown>).description === "string",
      `${ns}.description fehlt in DE`,
    );
  });
}

test("i18n: settings.scopeHint.{personal, team} in beiden Locales", () => {
  const enHint = getNested(en, "settings.scopeHint");
  const deHint = getNested(de, "settings.scopeHint");
  assert.ok(enHint && deHint);
  assert.ok(typeof enHint!.personal === "string");
  assert.ok(typeof enHint!.team === "string");
  assert.ok(typeof deHint!.personal === "string");
  assert.ok(typeof deHint!.team === "string");
  // Interpolation: der team-Text nutzt {name}.
  assert.match(
    enHint!.team as string,
    /\{name\}/,
    "EN settings.scopeHint.team muss {name}-Interpolation enthalten",
  );
  assert.match(
    deHint!.team as string,
    /\{name\}/,
    "DE settings.scopeHint.team muss {name}-Interpolation enthalten",
  );
});

test("i18n: settings.navigation.team bleibt im Katalog (Block-3-Umzug)", () => {
  // Block-3 zieht den Key zusammen mit settings.team.* nach team.*.
  // Bis dahin: Key muss weiterhin existieren, auch wenn er nicht mehr
  // von SettingsTabs referenziert wird.
  const enNav = getNested(en, "settings.navigation");
  const deNav = getNested(de, "settings.navigation");
  assert.ok(enNav && deNav);
  assert.equal(typeof enNav!.team, "string");
  assert.equal(typeof deNav!.team, "string");
});
