import assert from "node:assert/strict";
import test from "node:test";
import {
  canManageSsoForTeam,
  canManageSsoRole,
} from "@/lib/teams/permissions";

test("canManageSsoRole: owner may manage SSO", () => {
  assert.equal(canManageSsoRole("owner"), true);
});

test("canManageSsoRole: admin may not manage SSO", () => {
  assert.equal(canManageSsoRole("admin"), false);
});

test("canManageSsoRole: member may not manage SSO", () => {
  assert.equal(canManageSsoRole("member"), false);
});

test("canManageSsoRole: non-member may not manage SSO", () => {
  assert.equal(canManageSsoRole(null), false);
});

test("canManageSsoForTeam exists with the expected async signature", () => {
  assert.equal(typeof canManageSsoForTeam, "function");
  assert.equal(canManageSsoForTeam.length, 2);
});
