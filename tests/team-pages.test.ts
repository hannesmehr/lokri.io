import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

/**
 * Settings-Redesign Block 3: /settings/team/* → /team/*.
 *
 * Contract-Guards analog zu den Block-1/2-Tests: Source-Shape,
 * i18n-Umzug, Redirect-Regeln, externe Ref-Updates. Die Render-
 * Qualität der Widgets + PageHeader ist in den jeweiligen Komponenten-
 * Tests (tests/widget-card.test.tsx, tests/page-header.test.tsx)
 * abgedeckt.
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
  "app/(dashboard)/team/layout.tsx",
  "app/(dashboard)/team/page.tsx",
  "app/(dashboard)/team/members/page.tsx",
  "app/(dashboard)/team/security/page.tsx",
  "app/(dashboard)/team/_tabs.tsx",
  "app/(dashboard)/team/_name-form.tsx",
  "app/(dashboard)/team/_delete-card.tsx",
  "app/(dashboard)/team/members/_members-table.tsx",
  "app/(dashboard)/team/members/_pending-invites.tsx",
]) {
  test(`${path} existiert`, () => {
    assert.ok(existsSync(resolve(root, path)));
  });
}

// ── Alte Routen sind weg ───────────────────────────────────────────────

for (const path of [
  "app/(dashboard)/settings/team/page.tsx",
  "app/(dashboard)/settings/team/members/page.tsx",
  "app/(dashboard)/settings/team/_name-form.tsx",
  "app/(dashboard)/settings/team/_delete-card.tsx",
]) {
  test(`${path} ist geloescht`, () => {
    assert.ok(
      !existsSync(resolve(root, path)),
      `${path} sollte weg sein`,
    );
  });
}

// ── Layout-Guard ───────────────────────────────────────────────────────

test("/team/layout.tsx ruft requireTeamAccount() serverseitig auf", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/team/layout.tsx"),
    "utf-8",
  );
  assert.match(src, /requireTeamAccount/);
  // Async default export — Server Component.
  assert.match(src, /export default async function/);
});

// ── Pages rendern PageHeader + TeamTabs ────────────────────────────────

for (const path of [
  "app/(dashboard)/team/page.tsx",
  "app/(dashboard)/team/members/page.tsx",
  "app/(dashboard)/team/security/page.tsx",
]) {
  test(`${path} rendert PageHeader + TeamTabs`, () => {
    const src = readFileSync(resolve(root, path), "utf-8");
    assert.match(src, /<PageHeader/);
    assert.match(src, /<TeamTabs\s*\/>/);
    const phIdx = src.indexOf("<PageHeader");
    const tabsIdx = src.indexOf("<TeamTabs");
    assert.ok(phIdx < tabsIdx, `${path}: PageHeader muss vor TeamTabs stehen`);
  });
}

// ── Team-Overview hat Widgets + NameForm + DangerZone ──────────────────

test("/team/page.tsx rendert 3 WidgetCards + NameForm + DeleteCard", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/team/page.tsx"),
    "utf-8",
  );
  // 3 WidgetCards (Team, Plan, Role)
  const widgetCount = (src.match(/<WidgetCard\s/g) ?? []).length;
  assert.equal(widgetCount, 3, "genau 3 WidgetCards erwartet");
  assert.match(src, /<TeamNameForm/);
  // DeleteCard nur bei role=owner — aber Import muss da sein.
  assert.match(src, /TeamDeleteCard/);
});

// ── AccountSwitcher zeigt auf /team mit neuem Label-Key ────────────────

test("AccountSwitcher: Team-Link zeigt auf /team, Label teamManage", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/_account-switcher.tsx"),
    "utf-8",
  );
  assert.match(src, /href="\/team"/);
  assert.match(src, /t\("teamManage"\)/);
  assert.ok(
    !/href="\/settings\/team"/.test(src),
    "AccountSwitcher darf nicht mehr auf Legacy-/settings/team zeigen",
  );
});

test("AccountSwitcher: Auto-Redirect von /team auf /dashboard bei Team→Personal", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/_account-switcher.tsx"),
    "utf-8",
  );
  // Redirect-Logik: Team→Personal + pathname startsWith /team.
  assert.match(src, /pathname\.startsWith\("\/team"\)/);
  assert.match(src, /router\.push\("\/dashboard"\)/);
  assert.match(src, /target\?\.type === "personal"/);
});

// ── Email-Template-URL atomar aktualisiert ─────────────────────────────

test("lib/teams/ownership.ts: teamSettingsUrl zeigt auf /team (nicht mehr /settings/team)", () => {
  const src = readFileSync(resolve(root, "lib/teams/ownership.ts"), "utf-8");
  assert.match(src, /resolveAppOrigin\(\)\}\/team`/);
  assert.ok(
    !/\/settings\/team/.test(src),
    "Email-Template darf keine /settings/team-URL mehr bauen",
  );
});

// ── Dashboard-Toast ────────────────────────────────────────────────────

test("Dashboard liest searchParams.teamRequired + rendert TeamRequiredToast", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/dashboard/page.tsx"),
    "utf-8",
  );
  assert.match(src, /searchParams/);
  assert.match(src, /teamRequired/);
  assert.match(src, /<TeamRequiredToast/);
});

test("TeamRequiredToast macht router.replace um Query-Param zu entfernen", () => {
  const src = readFileSync(
    resolve(root, "app/(dashboard)/dashboard/_team-required-toast.tsx"),
    "utf-8",
  );
  assert.match(src, /router\.replace\("\/dashboard"\)/);
  assert.match(src, /toast\.info/);
  // useRef-Guard gegen React-StrictMode-Double-Fire
  assert.match(src, /useRef/);
});

// ── next.config Redirects ─────────────────────────────────────────────

test("next.config redirected /settings/team[/*] auf /team[/*]", () => {
  const src = readFileSync(resolve(root, "next.config.ts"), "utf-8");
  assert.match(src, /source:\s*["']\/settings\/team["']/);
  assert.match(src, /source:\s*["']\/settings\/team\/:path\*["']/);
  assert.match(src, /destination:\s*["']\/team["']/);
  assert.match(src, /destination:\s*["']\/team\/:path\*["']/);
});

// ── i18n-Shape ─────────────────────────────────────────────────────────

test("i18n: settings.team entfernt, team.* Top-Level vollstaendig", () => {
  assert.equal(getNested(en, "settings.team"), undefined);
  assert.equal(getNested(de, "settings.team"), undefined);
  const enT = getNested(en, "team");
  const deT = getNested(de, "team");
  assert.ok(enT && deT);
  for (const sub of [
    "layout",
    "pageHeader",
    "widgets",
    "security",
    "overview",
    "members",
    "invites",
    "invite",
    "ownership",
    "danger",
    "redirects",
  ]) {
    assert.ok(enT![sub] !== undefined, `EN team.${sub} fehlt`);
    assert.ok(deT![sub] !== undefined, `DE team.${sub} fehlt`);
  }
});

test("i18n: team.widgets enthält team/plan/role mit Interpolation", () => {
  const enW = getNested(en, "team.widgets");
  const deW = getNested(de, "team.widgets");
  assert.ok(enW && deW);
  for (const key of ["team", "plan", "role"]) {
    assert.ok(enW![key] !== undefined);
    assert.ok(deW![key] !== undefined);
  }
  const enTeam = enW!.team as Record<string, string>;
  const deTeam = deW!.team as Record<string, string>;
  assert.match(enTeam.hintMembers, /\{count/);
  assert.match(deTeam.hintMembers, /\{count/);
});

test("i18n: team.redirects.teamRequired in beiden Locales", () => {
  const en_ = getNested(en, "team.redirects");
  const de_ = getNested(de, "team.redirects");
  assert.ok(en_ && de_);
  assert.equal(typeof en_!.teamRequired, "string");
  assert.equal(typeof de_!.teamRequired, "string");
});

test("i18n: accountSwitcher.teamManage (neuer Key) in beiden Locales", () => {
  const en_ = getNested(en, "accountSwitcher");
  const de_ = getNested(de, "accountSwitcher");
  assert.ok(en_ && de_);
  assert.equal(typeof en_!.teamManage, "string");
  assert.equal(typeof de_!.teamManage, "string");
});
