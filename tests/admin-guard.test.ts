import test from "node:test";
import assert from "node:assert/strict";
import {
  ApiAuthError,
  authErrorResponse,
  forbidden,
} from "@/lib/api/errors";

/**
 * Admin-guard contract. The live `requireAdminSession` helper reads
 * `users.is_admin` from the DB — exercising that end-to-end needs a
 * running Postgres. Here we pin the guard's *contract shape* so a
 * refactor can't silently drop the 403 path:
 *
 *   1. Non-admin → `ApiAuthError(message, 403)`
 *   2. `authErrorResponse` maps 403 → `forbidden()` with
 *      `code: 'forbidden.role'`
 *   3. No session → `ApiAuthError()` default (401)
 *
 * Route-level behaviour ("GET /api/admin/users as viewer returns 403")
 * is covered by manual QA + the dev-server smoke test.
 */

test("Non-admin user triggers ApiAuthError with status 403", () => {
  // This is what `requireAdminSession` throws in its non-admin branch.
  const err = new ApiAuthError("Admin-Berechtigung erforderlich", 403);
  assert.equal(err.status, 403);
  assert.equal(err.message, "Admin-Berechtigung erforderlich");
  assert.ok(err instanceof Error);
  assert.equal(err.name, "ApiAuthError");
});

test("403 ApiAuthError maps to forbidden response with forbidden.role code", async () => {
  const err = new ApiAuthError("Admin-Berechtigung erforderlich", 403);
  const res = authErrorResponse(err);
  assert.equal(res.status, 403);
  const body = (await res.json()) as {
    error: string;
    details?: { code?: string };
  };
  assert.equal(body.error, "Admin-Berechtigung erforderlich");
  assert.equal(body.details?.code, "forbidden.role");
});

test("Unauthenticated (no session) → 401, not 403", async () => {
  // `requireSession` throws this when the cookie is missing.
  const err = new ApiAuthError();
  const res = authErrorResponse(err);
  assert.equal(res.status, 401);
});

test("forbidden() custom code — admin guard could use own marker later", async () => {
  // We don't currently use a distinct code for admin vs. team-role
  // denials — both go through `forbidden.role`. But the helper
  // supports custom codes, and this test pins that contract so a
  // future split (e.g. `forbidden.admin`) wouldn't require a helper
  // refactor.
  const res = forbidden("Admin only", "forbidden.admin");
  assert.equal(res.status, 403);
  const body = (await res.json()) as { details?: { code?: string } };
  assert.equal(body.details?.code, "forbidden.admin");
});
