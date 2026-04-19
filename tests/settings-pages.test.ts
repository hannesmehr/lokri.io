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
  // `/settings/embedding-key` wurde in Block 1 des Settings-Redesigns
  // entfernt — Inhalt lebt jetzt als Section in `/settings/general`
  // (siehe `_embedding-key-manager.tsx` unter settings/general).
  "app/(dashboard)/settings/general/page.tsx",
  "app/(dashboard)/settings/mcp/page.tsx",
  "app/(dashboard)/settings/storage/page.tsx",
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

test("SettingsTabs enthält Allgemein/MCP/Storage/Billing und NICHT team oder embedding-key", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/settings/_tabs.tsx"),
    "utf-8",
  );
  // Core-Routes (Block-1 Stand: Billing-Tab zielt noch auf Legacy
  // `/billing`; Block 2 flippt auf `/settings/billing`).
  for (const href of [
    "/settings/general",
    "/settings/mcp",
    "/settings/storage",
  ]) {
    assert.ok(
      src.includes(href),
      `SettingsTabs muss ${href} verlinken`,
    );
  }
  // Billing-Tab existiert — Ziel kann `/billing` oder
  // `/settings/billing` sein.
  assert.ok(
    src.includes("/billing"),
    "SettingsTabs muss einen Billing-Tab haben",
  );
  // Entfernte Tabs dürfen nicht mehr referenziert werden.
  assert.ok(
    !src.includes("/settings/team"),
    "SettingsTabs darf /settings/team nicht mehr verlinken",
  );
  assert.ok(
    !src.includes("/settings/embedding-key"),
    "SettingsTabs darf /settings/embedding-key nicht mehr verlinken (Content lebt jetzt in /settings/general)",
  );
});

test("/settings/embedding-key Legacy-Route existiert nicht mehr", () => {
  const path = resolve(
    root,
    "app/(dashboard)/settings/embedding-key/page.tsx",
  );
  assert.ok(
    !existsSync(path),
    "Die alte Embedding-Key-Sub-Route wurde in Block 1 ersatzlos entfernt — Inhalt lebt als Section auf /settings/general",
  );
});

test("EmbeddingKeyManager wohnt jetzt unter /settings/general", () => {
  const path = resolve(
    root,
    "app/(dashboard)/settings/general/_embedding-key-manager.tsx",
  );
  assert.ok(existsSync(path), "Manager muss in /settings/general/ leben");
  const src = readFileSync(path, "utf-8");
  // Namespace-Update: useTranslations zeigt auf den neuen Ort.
  assert.match(src, /useTranslations\(["']settings\.general\.embeddingKey["']\)/);
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
  // settings.embeddingKey.pageHeader entfernt in Block 1 — Route gibt's
  // nicht mehr, stattdessen lebt die Section auf /settings/general.
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

test("i18n: settings.navigation hat Billing, KEIN embeddingKey mehr", () => {
  const enNav = getNested(en, "settings.navigation");
  const deNav = getNested(de, "settings.navigation");
  assert.ok(enNav && deNav);
  assert.equal(typeof enNav!.billing, "string", "EN settings.navigation.billing fehlt");
  assert.equal(typeof deNav!.billing, "string", "DE settings.navigation.billing fehlt");
  assert.equal(enNav!.embeddingKey, undefined, "EN settings.navigation.embeddingKey sollte weg sein");
  assert.equal(deNav!.embeddingKey, undefined, "DE settings.navigation.embeddingKey sollte weg sein");
});

test("i18n: settings.embeddingKey entfernt, settings.general.embeddingKey vorhanden", () => {
  assert.equal(
    getNested(en, "settings.embeddingKey"),
    undefined,
    "EN settings.embeddingKey Top-Level sollte weg sein",
  );
  assert.equal(
    getNested(de, "settings.embeddingKey"),
    undefined,
    "DE settings.embeddingKey Top-Level sollte weg sein",
  );
  const enEek = getNested(en, "settings.general.embeddingKey");
  const deEek = getNested(de, "settings.general.embeddingKey");
  assert.ok(enEek && deEek);
  // Shape-Check: heading + description + sub-objects sind migrated.
  for (const key of ["heading", "description", "intro", "currentKey", "form", "actions", "toasts", "dialogs"]) {
    assert.ok(enEek![key] !== undefined, `EN settings.general.embeddingKey.${key} fehlt`);
    assert.ok(deEek![key] !== undefined, `DE settings.general.embeddingKey.${key} fehlt`);
  }
});

test("i18n: settings.general.widgets komplett mit account/plan/storage/embeddingKey", () => {
  const enW = getNested(en, "settings.general.widgets");
  const deW = getNested(de, "settings.general.widgets");
  assert.ok(enW && deW);
  for (const key of ["account", "plan", "storage", "embeddingKey"]) {
    assert.ok(enW![key] !== undefined, `EN widget ${key} fehlt`);
    assert.ok(deW![key] !== undefined, `DE widget ${key} fehlt`);
  }
  // plan hat Interpolations-Key für Renewal
  const enPlan = enW!.plan as Record<string, string>;
  const dePlan = deW!.plan as Record<string, string>;
  assert.match(enPlan.hintRenewal, /\{date\}/);
  assert.match(dePlan.hintRenewal, /\{date\}/);
});
