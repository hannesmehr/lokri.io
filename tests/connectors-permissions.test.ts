/**
 * Tests für `canManageConnectorsRole` — pure role-based gate.
 *
 * Matched SSO-Gate-Semantik (owner-only). Members, Admins, Viewers
 * dürfen keine Connectors verwalten.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { canManageConnectorsRole } from "@/lib/teams/permissions";

test("canManageConnectorsRole: owner → true", () => {
  assert.equal(canManageConnectorsRole("owner"), true);
});

test("canManageConnectorsRole: admin → false (owner-only)", () => {
  assert.equal(canManageConnectorsRole("admin"), false);
});

test("canManageConnectorsRole: member → false", () => {
  assert.equal(canManageConnectorsRole("member"), false);
});

test("canManageConnectorsRole: viewer → false", () => {
  assert.equal(canManageConnectorsRole("viewer"), false);
});

test("canManageConnectorsRole: null (kein Mitglied) → false", () => {
  assert.equal(canManageConnectorsRole(null), false);
});
