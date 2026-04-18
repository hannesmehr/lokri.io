import assert from "node:assert/strict";
import test from "node:test";
import { ApiAuthError, authErrorResponse } from "@/lib/api/errors";

test("disabled-user flow serializes session.accountDisabled with fallback message", async () => {
  const err = new ApiAuthError(
    403,
    "session.accountDisabled",
    "Dein Konto ist gesperrt. Wende dich an den Support.",
  );

  assert.equal(err.status, 403);
  assert.equal(err.code, "session.accountDisabled");
  assert.equal(
    err.message,
    "Dein Konto ist gesperrt. Wende dich an den Support.",
  );

  const res = authErrorResponse(err);
  assert.equal(res.status, 403);

  const body = (await res.json()) as {
    error: { code: string; message: string; status: number };
  };

  assert.deepEqual(body, {
    error: {
      code: "session.accountDisabled",
      message: "Dein Konto ist gesperrt. Wende dich an den Support.",
      status: 403,
    },
  });
});

test("structured session auth errors keep explicit code and message in the response body", async () => {
  const err = new ApiAuthError(
    401,
    "session.sessionExpired",
    "Deine Session ist abgelaufen. Bitte erneut anmelden.",
  );

  const res = authErrorResponse(err);
  assert.equal(res.status, 401);

  const body = (await res.json()) as {
    error: { code: string; message: string; status: number };
  };

  assert.equal(body.error.code, "session.sessionExpired");
  assert.equal(
    body.error.message,
    "Deine Session ist abgelaufen. Bitte erneut anmelden.",
  );
  assert.equal(body.error.status, 401);
});
