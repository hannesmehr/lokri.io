import test from "node:test";
import assert from "node:assert/strict";
import { TeamError, teamErrorStatus } from "@/lib/teams/errors";

/**
 * Ownership-transfer regression suite.
 *
 * The live service (`lib/teams/ownership.ts`) needs a DB to exercise —
 * covered by manual QA and the Teams-Settings smoke path. Here we pin
 * the *shape of the contract* so a refactor can't silently drop one of
 * the guard codes: self-transfer, target-not-admin, claimed-but-not-
 * owner, or misrouted status codes.
 */

test("TeamError carries the code forward", () => {
  const e = new TeamError("team.ownerTransferSelf");
  assert.equal(e.code, "team.ownerTransferSelf");
  assert.equal(e.name, "TeamError");
  assert.ok(e instanceof Error);
});

test("Self-transfer maps to 400 (bad request, not a server fault)", () => {
  assert.equal(teamErrorStatus("team.ownerTransferSelf"), 400);
});

test("Transferring to a non-admin maps to 400 (client must promote first)", () => {
  assert.equal(teamErrorStatus("team.ownerTransferNotAdmin"), 400);
});

test("Caller-not-owner maps to 403 (role check, not a data problem)", () => {
  assert.equal(teamErrorStatus("team.ownerTransferNotOwner"), 403);
});

test("Custom message is preserved; code stays stable", () => {
  const e = new TeamError(
    "team.ownerTransferNotAdmin",
    "Promote the target to admin first.",
  );
  assert.equal(e.code, "team.ownerTransferNotAdmin");
  assert.equal(e.message, "Promote the target to admin first.");
});

test("Default message falls back to the code when none supplied", () => {
  const e = new TeamError("team.ownerTransferSelf");
  assert.equal(e.message, "team.ownerTransferSelf");
});
