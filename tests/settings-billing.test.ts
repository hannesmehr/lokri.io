import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

/**
 * Settings-Redesign Block 2: Billing-Umzug /billing → /settings/billing.
 *
 * Contract-Guards für die Migrations-Invarianten, die ohne DB testbar
 * sind — Shape der neuen Routen, Absenz der alten, i18n-Umbenennung,
 * 308-Redirects in next.config.ts, und alle externen Link-References.
 */

const root = resolve(process.cwd());
const en = JSON.parse(
  readFileSync(resolve(root, "messages/en.json"), "utf-8"),
) as Record<string, unknown>;
const de = JSON.parse(
  readFileSync(resolve(root, "messages/de.json"), "utf-8"),
) as Record<string, unknown>;

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

// ── Neue Routen existieren ─────────────────────────────────────────────

for (const path of [
  "app/(dashboard)/settings/billing/page.tsx",
  "app/(dashboard)/settings/billing/plans/page.tsx",
  "app/(dashboard)/settings/billing/success/page.tsx",
  "app/(dashboard)/settings/billing/_upgrade-button.tsx",
]) {
  test(`${path} existiert`, () => {
    assert.ok(existsSync(resolve(root, path)), `${path} fehlt`);
  });
}

// ── Alte Routen sind weg ───────────────────────────────────────────────

for (const path of [
  "app/(dashboard)/billing/page.tsx",
  "app/(dashboard)/billing/plans/page.tsx",
  "app/(dashboard)/billing/invoices/page.tsx",
  "app/(dashboard)/billing/success/page.tsx",
  "app/(dashboard)/billing/layout.tsx",
  "app/(dashboard)/billing/_upgrade-button.tsx",
]) {
  test(`${path} ist geloescht`, () => {
    assert.ok(
      !existsSync(resolve(root, path)),
      `${path} sollte nach Block-2-Umzug weg sein`,
    );
  });
}

// ── /settings/billing Single-Page-Shape ────────────────────────────────

test("/settings/billing rendert Plan- + Invoices-Sections in einer Seite", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/settings/billing/page.tsx"),
    "utf-8",
  );
  // PageHeader + SettingsTabs + ScopeHint in Reihenfolge
  const phIdx = src.indexOf("<PageHeader");
  const tabsIdx = src.indexOf("<SettingsTabs");
  const hintIdx = src.indexOf("<SettingsScopeHint");
  assert.ok(phIdx >= 0 && tabsIdx > phIdx && hintIdx > tabsIdx);
  // Beide Sections sind im selben File
  assert.match(src, /planSection/);
  assert.match(src, /invoicesSection/);
  // Link zu /plans-Sub-Route existiert
  assert.match(src, /href="\/settings\/billing\/plans"/);
});

test("/settings/billing/plans hat Breadcrumbs + KEINE SettingsTabs (Conversion-Flow)", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/settings/billing/plans/page.tsx"),
    "utf-8",
  );
  assert.match(src, /breadcrumbs=\{/);
  // Conversion-Flow-Sub-Route soll keine Tabs haben (Prinzip 5).
  assert.ok(
    !src.includes("<SettingsTabs"),
    "Plans-Sub-Route soll keine SettingsTabs rendern (Conversion-Flow, nicht Tab-Ebene)",
  );
});

// ── SettingsTabs zeigt jetzt auf /settings/billing ─────────────────────

test("SettingsTabs billing-Tab zeigt auf /settings/billing (nicht mehr Legacy-/billing)", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/settings/_tabs.tsx"),
    "utf-8",
  );
  assert.match(src, /href: "\/settings\/billing"/);
  assert.ok(
    !/href: "\/billing"/.test(src),
    "SettingsTabs darf nicht mehr auf Legacy-`/billing` zeigen",
  );
});

// ── Externe Refs ──────────────────────────────────────────────────────

for (const { file, pattern, desc } of [
  {
    file: "app/(dashboard)/dashboard/page.tsx",
    pattern: /href="\/settings\/billing"/,
    desc: "Dashboard-Home-Link",
  },
  {
    file: "app/(dashboard)/_user-menu.tsx",
    pattern: /href="\/settings\/billing"/,
    desc: "User-Menu-Dropdown",
  },
  {
    file: "app/(dashboard)/_search-palette.tsx",
    pattern: /r\.push\("\/settings\/billing"\)/,
    desc: "Search-Palette",
  },
  {
    file: "app/(dashboard)/settings/general/page.tsx",
    pattern: /href="\/settings\/billing"/,
    desc: "Plan-Widget auf /settings/general",
  },
  {
    file: "app/api/paypal/create-order/route.ts",
    pattern: /\/settings\/billing\/success/,
    desc: "PayPal-Return-URL",
  },
]) {
  test(`${file}: ${desc} zeigt auf /settings/billing`, () => {
    const src = readFileSync(resolve(root, file), "utf-8");
    assert.match(src, pattern);
  });
}

// ── i18n-Shape ─────────────────────────────────────────────────────────

test("i18n: billing Top-Level weg, settings.billing mit allen Sub-Namespaces", () => {
  assert.equal(getNested(en, "billing"), undefined, "EN billing.* sollte weg sein");
  assert.equal(getNested(de, "billing"), undefined, "DE billing.* sollte weg sein");
  const enB = getNested(en, "settings.billing");
  const deB = getNested(de, "settings.billing");
  assert.ok(enB && deB);
  for (const sub of [
    "pageHeader",
    "planSection",
    "invoicesSection",
    "plansPage",
    "successPage",
    "errors",
    "upgradeButton",
  ]) {
    assert.ok(enB![sub] !== undefined, `EN settings.billing.${sub} fehlt`);
    assert.ok(deB![sub] !== undefined, `DE settings.billing.${sub} fehlt`);
  }
});

test("i18n: settings.billing.pageHeader.{title, description} in beiden Locales", () => {
  const enPh = getNested(en, "settings.billing.pageHeader");
  const dePh = getNested(de, "settings.billing.pageHeader");
  assert.ok(enPh && dePh);
  assert.equal(typeof enPh!.title, "string");
  assert.equal(typeof enPh!.description, "string");
  assert.equal(typeof dePh!.title, "string");
  assert.equal(typeof dePh!.description, "string");
});

// ── next.config Redirects ─────────────────────────────────────────────

test("next.config redirected /billing + /billing/* auf /settings/billing[/*]", () => {
  const src = readFileSync(resolve(root, "next.config.ts"), "utf-8");
  assert.match(src, /source:\s*["']\/billing["']/);
  assert.match(src, /source:\s*["']\/billing\/:path\*["']/);
  assert.match(src, /destination:\s*["']\/settings\/billing["']/);
  assert.match(src, /destination:\s*["']\/settings\/billing\/:path\*["']/);
  // Permanent
  const redirectBlock = src.match(/async redirects[\s\S]*?\}\;/);
  assert.ok(redirectBlock, "redirects-Block fehlt");
  assert.ok(
    (redirectBlock![0].match(/permanent:\s*true/g) ?? []).length >= 3,
    "Alle 3 Redirects sollen permanent: true sein",
  );
});

// ── robots.txt — /billing-Eintrag soll weg sein ────────────────────────

test("robots.ts: /billing-Disallow-Eintrag entfernt", () => {
  const src = readFileSync(resolve(root, "app/robots.ts"), "utf-8");
  assert.ok(
    !/"\/billing"/.test(src),
    "robots.ts soll keinen `/billing`-Disallow-Eintrag mehr haben (Route gibt's nicht mehr)",
  );
  // /settings deckt /settings/billing als Substring-Match ab.
  assert.match(src, /"\/settings"/);
});
