import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import de from "../messages/de.json";
import en from "../messages/en.json";
import {
  getSsoAvailableBannerStorageKey,
  shouldShowSsoAvailableBanner,
} from "../lib/auth/sso-banner";

const root = process.cwd();

function read(rel: string) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function getNested(obj: Record<string, unknown>, dotted: string) {
  return dotted
    .split(".")
    .reduce<Record<string, unknown> | undefined>((acc, key) => {
      if (!acc || typeof acc !== "object") return undefined;
      return acc[key] as Record<string, unknown> | undefined;
    }, obj);
}

test("login page uses email-first SSO discovery flow", () => {
  const src = read("app/(auth)/login/page.tsx");
  assert.match(src, /\/api\/auth\/sso-discovery\?email=/);
  assert.match(src, /setRedirectingToSso\(true\)/);
  assert.match(src, /window\.setTimeout\(/);
  assert.match(src, /window\.location\.assign\(body\.signInUrl!\)/);
  assert.match(src, /step1\.ssoRedirecting/);
  assert.match(src, /setStep\(2\)/);
});

test("login page renders localized sso.* query errors", () => {
  const src = read("app/(auth)/login/page.tsx");
  assert.match(src, /useSearchParams\(/);
  assert.match(src, /errors\.api\.sso/);
  assert.match(src, /queryError/);
});

test("callback maps verifyIdToken=false to sso.tokenVerificationFailed", () => {
  const src = read("app/api/auth/sso/callback/route.ts");
  assert.match(src, /reason:\s*"sso\.tokenVerificationFailed"/);
  assert.match(src, /redirectError\(req,\s*"sso\.tokenVerificationFailed"\)/);
});

test("dashboard banner helper only shows for team users without linked SSO identity", () => {
  assert.equal(
    shouldShowSsoAvailableBanner({
      accountType: "team",
      ssoEnabled: true,
      hasSsoIdentity: false,
    }),
    true,
  );
  assert.equal(
    shouldShowSsoAvailableBanner({
      accountType: "team",
      ssoEnabled: true,
      hasSsoIdentity: true,
    }),
    false,
  );
  assert.equal(
    shouldShowSsoAvailableBanner({
      accountType: "team",
      ssoEnabled: false,
      hasSsoIdentity: false,
    }),
    false,
  );
  assert.equal(
    shouldShowSsoAvailableBanner({
      accountType: "personal",
      ssoEnabled: true,
      hasSsoIdentity: false,
    }),
    false,
  );
});

test("dashboard banner storage key is stable and namespaced", () => {
  assert.equal(
    getSsoAvailableBannerStorageKey("team-123"),
    "lokri:sso-available-banner:dismissed:team-123",
  );
});

test("i18n: auth.login has email-first step keys in DE + EN", () => {
  const deLogin = getNested(de as Record<string, unknown>, "auth.login");
  const enLogin = getNested(en as Record<string, unknown>, "auth.login");
  assert.ok(deLogin && enLogin);
  for (const key of ["step1", "step2"]) {
    assert.ok((deLogin as Record<string, unknown>)[key] !== undefined);
    assert.ok((enLogin as Record<string, unknown>)[key] !== undefined);
  }
});

test("i18n: errors.api.sso.tokenVerificationFailed exists in DE + EN", () => {
  const deKey = getNested(
    de as Record<string, unknown>,
    "errors.api.sso.tokenVerificationFailed",
  );
  const enKey = getNested(
    en as Record<string, unknown>,
    "errors.api.sso.tokenVerificationFailed",
  );
  assert.equal(typeof deKey, "string");
  assert.equal(typeof enKey, "string");
});

test("i18n: dashboard.banner.ssoAvailable exists in DE + EN", () => {
  const deBanner = getNested(
    de as Record<string, unknown>,
    "dashboard.banner.ssoAvailable",
  );
  const enBanner = getNested(
    en as Record<string, unknown>,
    "dashboard.banner.ssoAvailable",
  );
  assert.ok(deBanner && enBanner);
  for (const key of ["title", "description", "learnMore", "dismiss"]) {
    assert.ok((deBanner as Record<string, unknown>)[key] !== undefined);
    assert.ok((enBanner as Record<string, unknown>)[key] !== undefined);
  }
});
