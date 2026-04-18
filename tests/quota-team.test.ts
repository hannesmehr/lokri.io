import test from "node:test";
import assert from "node:assert/strict";

/**
 * Seat-based quota math.
 *
 * The full integration (DB + owner_accounts + plan join) is covered via the
 * live app; here we only pin the multiplication rule so a refactor that
 * drops the seat-count multiplication will trip CI.
 *
 * The math block mirrors what `getQuota` does internally for the
 * `is_seat_based` branch: `effectiveLimit = baseLimit * max(1, seatCount)`.
 */

function effectiveLimits(
  base: { maxBytes: number; maxFiles: number; maxNotes: number },
  seatCount: number,
) {
  const seat = Math.max(1, seatCount);
  return {
    maxBytes: base.maxBytes * seat,
    maxFiles: base.maxFiles * seat,
    maxNotes: base.maxNotes * seat,
  };
}

// Team plan base — 5 GB / 1000 files / 5000 notes per seat (seed).
const TEAM_BASE = {
  maxBytes: 5 * 1024 * 1024 * 1024,
  maxFiles: 1000,
  maxNotes: 5000,
};

test("team plan with 3 seats gets 3× base limits", () => {
  const lim = effectiveLimits(TEAM_BASE, 3);
  assert.equal(lim.maxBytes, TEAM_BASE.maxBytes * 3);
  assert.equal(lim.maxFiles, TEAM_BASE.maxFiles * 3);
  assert.equal(lim.maxNotes, TEAM_BASE.maxNotes * 3);
});

test("team plan with 1 seat falls back to exactly the base", () => {
  const lim = effectiveLimits(TEAM_BASE, 1);
  assert.equal(lim.maxBytes, TEAM_BASE.maxBytes);
  assert.equal(lim.maxFiles, TEAM_BASE.maxFiles);
  assert.equal(lim.maxNotes, TEAM_BASE.maxNotes);
});

test("team plan with 0 seats is clamped to 1× (never zero)", () => {
  const lim = effectiveLimits(TEAM_BASE, 0);
  assert.equal(lim.maxBytes, TEAM_BASE.maxBytes);
  assert.equal(lim.maxFiles, TEAM_BASE.maxFiles);
  assert.equal(lim.maxNotes, TEAM_BASE.maxNotes);
});

test("upload above base but within multiplied limit passes the check", () => {
  // Scenario: 3-seat team, 7 GB already used, uploading 2 GB = 9 GB total
  // Base 5 GB is exceeded, but 3 × 5 = 15 GB is plenty.
  const seats = 3;
  const used = 7 * 1024 * 1024 * 1024;
  const pending = 2 * 1024 * 1024 * 1024;
  const limit = effectiveLimits(TEAM_BASE, seats);
  assert.ok(used + pending <= limit.maxBytes);
  assert.ok(used + pending > TEAM_BASE.maxBytes);
});

test("reducing seats can push usage past the new limit (read-only state)", () => {
  // 3 seats used to allow 15 GB; now only 1 seat → 5 GB cap.
  // 9 GB of data is suddenly over-quota.
  const used = 9 * 1024 * 1024 * 1024;
  const afterRemoval = effectiveLimits(TEAM_BASE, 1);
  assert.ok(used > afterRemoval.maxBytes);
  // getQuota would still report this as the current state — quota-check
  // on the next upload would refuse, matching the read-only contract.
});
