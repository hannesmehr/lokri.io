import assert from "node:assert/strict";
import test from "node:test";
import { ApiAuthError, authErrorResponse } from "@/lib/api/errors";

test("disabled-user flow serializes session.accountDisabled without fallback message", async () => {
  const err = new ApiAuthError(403, "session.accountDisabled");

  assert.equal(err.status, 403);
  assert.equal(err.code, "session.accountDisabled");
  const res = authErrorResponse(err);
  assert.equal(res.status, 403);

  const body = (await res.json()) as {
    error: { code: string; status: number };
  };

  assert.deepEqual(body, {
    error: {
      code: "session.accountDisabled",
      status: 403,
    },
  });
});

test("structured session auth errors keep explicit code and status in the response body", async () => {
  const err = new ApiAuthError(401, "session.sessionExpired");

  const res = authErrorResponse(err);
  assert.equal(res.status, 401);

  const body = (await res.json()) as {
    error: { code: string; status: number };
  };

  assert.equal(body.error.code, "session.sessionExpired");
  assert.equal(body.error.status, 401);
});
