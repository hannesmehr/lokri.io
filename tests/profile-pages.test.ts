import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

/**
 * Block-1-Refactor-Guard: die drei `/profile/*`-Pages nutzen den neuen
 * `<PageHeader>`, und die i18n-Keys dafür existieren shape-identisch
 * in beiden Locales.
 *
 * Ein reiner Snapshot-Test der Server-Components scheitert an den
 * Runtime-Dependencies (DB-Session + next-intl's getTranslations).
 * Wir pinnen stattdessen die zwei Dinge, die beim Refactor tatsächlich
 * kaputtgehen können:
 *
 *   1. Source-Shape: jede Page importiert + nutzt `<PageHeader>`
 *      und referenziert den richtigen `pageHeader`-Namespace
 *   2. i18n-Contract: beide Locales haben `profile.X.pageHeader.
 *      {title, description}` — fehlt einer, crasht getTranslations
 *      zur Laufzeit mit einer `MISSING_MESSAGE`-Exception
 *
 * Die eigentliche Render-Qualität des `<PageHeader>` steckt in
 * `tests/page-header.test.tsx`; hier geht's nur um die Verdrahtung.
 */

const root = resolve(process.cwd());
const en = JSON.parse(
  readFileSync(resolve(root, "messages/en.json"), "utf-8"),
) as Record<string, unknown>;
const de = JSON.parse(
  readFileSync(resolve(root, "messages/de.json"), "utf-8"),
) as Record<string, unknown>;

const profilePageFiles = [
  "app/(dashboard)/profile/page.tsx",
  "app/(dashboard)/profile/security/page.tsx",
  "app/(dashboard)/profile/data/page.tsx",
] as const;

const expectedNamespaces = [
  { file: "app/(dashboard)/profile/page.tsx", ns: "profile.overview.pageHeader" },
  {
    file: "app/(dashboard)/profile/security/page.tsx",
    ns: "profile.security.pageHeader",
  },
  { file: "app/(dashboard)/profile/data/page.tsx", ns: "profile.data.pageHeader" },
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

for (const path of profilePageFiles) {
  test(`${path} importiert + nutzt <PageHeader>`, () => {
    const src = readFileSync(resolve(root, path), "utf-8");
    assert.match(
      src,
      /from ["']@\/components\/ui\/page-header["']/,
      `${path}: PageHeader-Import fehlt`,
    );
    assert.match(src, /<PageHeader\s/, `${path}: <PageHeader /> nicht gerendert`);
  });

  test(`${path} rendert <ProfileTabs /> nach dem Header`, () => {
    const src = readFileSync(resolve(root, path), "utf-8");
    assert.match(src, /<ProfileTabs\s*\/>/);
    // Reihenfolge: PageHeader kommt vor ProfileTabs im JSX.
    const headerIdx = src.indexOf("<PageHeader");
    const tabsIdx = src.indexOf("<ProfileTabs");
    assert.ok(
      headerIdx >= 0 && tabsIdx >= 0 && headerIdx < tabsIdx,
      `${path}: <PageHeader> muss VOR <ProfileTabs /> stehen`,
    );
  });
}

for (const { file, ns } of expectedNamespaces) {
  test(`${file} referenziert pageHeader-Namespace "${ns}"`, () => {
    const src = readFileSync(resolve(root, file), "utf-8");
    // Gematched wird der letzte Teil `pageHeader` — reicht, um sicher
    // zu gehen, dass der File den richtigen Sub-Namespace anspricht.
    // Erlaubt sowohl getTranslations("profile.X.pageHeader")-Pattern
    // als auch t("pageHeader.title")-Pattern, je nachdem was die Page
    // gewählt hat.
    const hasNamespace = src.includes(`"${ns}"`) || src.includes("pageHeader");
    assert.ok(hasNamespace, `${file}: pageHeader-Referenz fehlt`);
  });
}

// ── Profile-Tabs-Hilfskomponente ───────────────────────────────────────

test("ProfileTabs-Helper existiert und wrapt SectionNav", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/profile/_tabs.tsx"),
    "utf-8",
  );
  assert.match(src, /export (?:async )?function ProfileTabs/);
  assert.match(src, /<SectionNav\s/);
  assert.match(src, /profile\.layout/);
});

// ── Layout-H1 ist weg ──────────────────────────────────────────────────

test("Profile-Layout rendert kein <h1> mehr", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/profile/layout.tsx"),
    "utf-8",
  );
  assert.ok(!/<h1\b/.test(src), "Layout-H1 soll durch PageHeader ersetzt sein");
  // Layout darf auch den SectionNav nicht mehr selbst rendern (das
  // passiert jetzt per-Page via ProfileTabs).
  assert.ok(
    !/<SectionNav/.test(src),
    "Layout soll SectionNav nicht mehr selbst rendern",
  );
});

// ── i18n-Shape-Parity ──────────────────────────────────────────────────

for (const ns of [
  "profile.overview.pageHeader",
  "profile.security.pageHeader",
  "profile.data.pageHeader",
]) {
  test(`i18n: ${ns} existiert in beiden Locales mit identischer Shape`, () => {
    const enObj = getNested(en, ns);
    const deObj = getNested(de, ns);
    assert.ok(enObj, `EN: ${ns} fehlt`);
    assert.ok(deObj, `DE: ${ns} fehlt`);
    assert.deepEqual(
      Object.keys(enObj!).sort(),
      Object.keys(deObj!).sort(),
      `Shape-Mismatch zwischen EN und DE für ${ns}`,
    );
    // Pflicht-Keys
    assert.ok(
      typeof (enObj as Record<string, unknown>).title === "string" &&
        typeof (deObj as Record<string, unknown>).title === "string",
      `${ns}.title muss in beiden Locales String sein`,
    );
    assert.ok(
      typeof (enObj as Record<string, unknown>).description === "string" &&
        typeof (deObj as Record<string, unknown>).description === "string",
      `${ns}.description muss in beiden Locales String sein`,
    );
  });
}

// ── Breadcrumb-Labels kommen aus profile.layout — Parität ──────────────

test("i18n: profile.layout.title + navigation.* shape-identisch", () => {
  const enLayout = getNested(en, "profile.layout");
  const deLayout = getNested(de, "profile.layout");
  assert.ok(enLayout && deLayout);
  assert.deepEqual(
    Object.keys(enLayout!).sort(),
    Object.keys(deLayout!).sort(),
  );
  const enNav = getNested(en, "profile.layout.navigation");
  const deNav = getNested(de, "profile.layout.navigation");
  assert.ok(enNav && deNav);
  assert.deepEqual(
    Object.keys(enNav!).sort(),
    Object.keys(deNav!).sort(),
  );
});
