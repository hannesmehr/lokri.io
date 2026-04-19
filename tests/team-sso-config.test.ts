import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildTeamSsoResponse,
  consentTenantMatchesConfig,
} from "@/lib/teams/sso-config";
import { getEntraAdminConsentUrl } from "@/lib/auth/sso-consent";

const root = resolve(process.cwd());

test("buildTeamSsoResponse: owner gets full config including tenant and domains", () => {
  const result = buildTeamSsoResponse({
    accountId: "team_1",
    canManage: true,
    config: {
      provider: "entra",
      tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      allowedDomains: ["firma.de"],
      enabled: true,
      lastVerifiedAt: new Date("2026-01-02T03:04:05.000Z"),
      lastError: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    },
    fallbackAdminStatus: {
      hasAnyNonSsoAdmin: true,
      adminCount: 2,
      nonSsoAdminCount: 1,
    },
  });

  assert.equal(result.permissions.canManage, true);
  assert.equal(result.config?.provider, "entra");
  assert.equal("tenantId" in (result.config ?? {}), true);
  assert.equal("allowedDomains" in (result.config ?? {}), true);
  assert.equal(result.fallbackAdminStatus?.nonSsoAdminCount, 1);
});

test("buildTeamSsoResponse: non-owner gets filtered config only", () => {
  const result = buildTeamSsoResponse({
    accountId: "team_1",
    canManage: false,
    config: {
      provider: "entra",
      tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      allowedDomains: ["firma.de"],
      enabled: true,
      lastVerifiedAt: new Date("2026-01-02T03:04:05.000Z"),
      lastError: "bad",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    },
    fallbackAdminStatus: null,
  });

  assert.equal(result.permissions.canManage, false);
  assert.deepEqual(result.config, {
    provider: "entra",
    enabled: true,
    lastVerifiedAt: "2026-01-02T03:04:05.000Z",
  });
  assert.equal(result.fallbackAdminStatus, null);
});

test("consentTenantMatchesConfig requires exact configured tenant", () => {
  assert.equal(
    consentTenantMatchesConfig(
      "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    ),
    true,
  );
  assert.equal(
    consentTenantMatchesConfig(
      "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "aaaaaaaa-5717-4562-b3fc-2c963f66afa6",
    ),
    false,
  );
});

test("getEntraAdminConsentUrl builds the expected redirect URL", () => {
  const url = getEntraAdminConsentUrl("tenant-123", {
    clientId: "client-abc",
    appOrigin: "https://lokri.test",
  });
  assert.match(
    url,
    /^https:\/\/login\.microsoftonline\.com\/tenant-123\/adminconsent\?/,
  );
  assert.match(url, /client_id=client-abc/);
  assert.match(
    url,
    /redirect_uri=https%3A%2F%2Flokri\.test%2Fteam%2Fsecurity%3Fconsent%3Dreturned/,
  );
});

test("team sso routes call server-side permission helpers", () => {
  const routeSrc = readFileSync(
    resolve(root, "app/api/teams/[id]/sso/route.ts"),
    "utf-8",
  );
  const verifySrc = readFileSync(
    resolve(root, "app/api/teams/[id]/sso/verify/route.ts"),
    "utf-8",
  );

  assert.match(routeSrc, /canManageSsoForTeam/);
  assert.match(routeSrc, /getTeamRoleForUser/);
  assert.match(verifySrc, /canManageSsoForTeam/);
  assert.match(verifySrc, /getTeamRoleForUser/);
});
