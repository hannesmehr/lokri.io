import test from "node:test";
import assert from "node:assert/strict";
import {
  canCreateSpace,
  canCreateTeamTokens,
  canDeleteTeam,
  canEditContent,
  canManageBilling,
  canManageMembers,
  hasRole,
  normalizeLegacyRole,
} from "@/lib/auth/roles";
import {
  ApiAuthError,
  authErrorResponse,
  forbidden,
  unauthorized,
} from "@/lib/api/errors";

/**
 * Viewer-hardening regression suite. These tests pin the capability
 * *source of truth* (`lib/auth/roles.ts`) plus the error-response
 * mapping (`ApiAuthError` → 401/403). The 18 fixed routes all call
 * `requireSessionWithAccount({ minRole: … })`, which in turn calls
 * `hasRole` — so if `hasRole` says "viewer can't", every route inherits
 * the correct 403.
 *
 * We deliberately test the helpers rather than spinning up Next routes:
 *   - Pure, synchronous, no DB, no Better-Auth session mock.
 *   - When a capability predicate flips, ALL routes that delegate to
 *     `minRole: 'member'` flip with it — that's a feature of the design
 *     we want to lock in.
 */

test("viewer cannot create a space", () => {
  assert.equal(canCreateSpace("viewer"), false);
});

test("viewer cannot edit content", () => {
  assert.equal(canEditContent("viewer"), false);
});

test("viewer cannot manage members (invite / remove / role-change)", () => {
  assert.equal(canManageMembers("viewer"), false);
});

test("viewer cannot create team-wide tokens", () => {
  assert.equal(canCreateTeamTokens("viewer"), false);
});

test("viewer cannot manage billing or delete the team", () => {
  assert.equal(canManageBilling("viewer"), false);
  assert.equal(canDeleteTeam("viewer"), false);
});

test("member can do content work but not team management", () => {
  assert.equal(canCreateSpace("member"), true);
  assert.equal(canEditContent("member"), true);
  assert.equal(canManageMembers("member"), false);
  assert.equal(canCreateTeamTokens("member"), false);
  assert.equal(canManageBilling("member"), false);
});

test("admin can manage members + team tokens but not billing or delete-team", () => {
  assert.equal(canManageMembers("admin"), true);
  assert.equal(canCreateTeamTokens("admin"), true);
  assert.equal(canManageBilling("admin"), false);
  assert.equal(canDeleteTeam("admin"), false);
});

test("owner clears every gate", () => {
  for (const cap of [
    canCreateSpace,
    canEditContent,
    canManageMembers,
    canCreateTeamTokens,
    canManageBilling,
    canDeleteTeam,
  ]) {
    assert.equal(cap("owner"), true, `owner should pass ${cap.name}`);
  }
});

test("role hierarchy is strictly linear: viewer < member < admin < owner", () => {
  assert.equal(hasRole("viewer", "member"), false);
  assert.equal(hasRole("member", "admin"), false);
  assert.equal(hasRole("admin", "owner"), false);

  assert.equal(hasRole("owner", "admin"), true);
  assert.equal(hasRole("admin", "member"), true);
  assert.equal(hasRole("member", "viewer"), true);

  // A role always satisfies its own minimum.
  for (const r of ["viewer", "member", "admin", "owner"] as const) {
    assert.equal(hasRole(r, r), true);
  }
});

test("legacy roles map to modern equivalents", () => {
  // `editor` rows in `space_members` must be treated as `member`.
  assert.equal(normalizeLegacyRole("editor"), "member");
  assert.equal(canEditContent(normalizeLegacyRole("editor")), true);

  // `reader` → `viewer` → cannot mutate.
  assert.equal(normalizeLegacyRole("reader"), "viewer");
  assert.equal(canEditContent(normalizeLegacyRole("reader")), false);

  // Unknown strings default to the most restrictive (`viewer`) — safer
  // than throwing when the DB contains a stray value.
  assert.equal(normalizeLegacyRole("galactic-overlord"), "viewer");
});

test("ApiAuthError with status 403 maps to forbidden response with forbidden.role code", async () => {
  const err = new ApiAuthError("Requires role admin, have viewer.", 403);
  const res = authErrorResponse(err);
  assert.equal(res.status, 403);
  const body = (await res.json()) as { error: string; details?: { code?: string } };
  assert.equal(body.error, "Requires role admin, have viewer.");
  assert.equal(body.details?.code, "forbidden.role");
});

test("ApiAuthError default (no status) maps to 401 unauthorized", async () => {
  const err = new ApiAuthError(); // status defaults to 401
  const res = authErrorResponse(err);
  assert.equal(res.status, 401);
});

test("forbidden() helper lets callers pass a custom code", async () => {
  const res = forbidden("Only owners may …", "billing.owner_only");
  assert.equal(res.status, 403);
  const body = (await res.json()) as { details?: { code?: string } };
  assert.equal(body.details?.code, "billing.owner_only");
});

test("unauthorized() shape is unchanged (401, no forced code)", async () => {
  const res = unauthorized();
  assert.equal(res.status, 401);
});
