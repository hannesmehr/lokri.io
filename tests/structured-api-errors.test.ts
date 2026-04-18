import assert from "node:assert/strict";
import test from "node:test";
import { codedApiError } from "@/lib/api/errors";
import { GitHubProvider, GitHubProviderError } from "@/lib/storage/github";
import { TeamError, teamErrorStatus } from "@/lib/teams/errors";

test("codedApiError serializes code-based details without fallback message", async () => {
  const res = codedApiError(409, "storageProvider.inUse", { fileCount: 3 });

  assert.equal(res.status, 409);

  const body = (await res.json()) as {
    details: {
      code: string;
      status: number;
      fileCount: number;
    };
  };

  assert.deepEqual(body.details, {
    code: "storageProvider.inUse",
    status: 409,
    fileCount: 3,
  });
});

test("GitHubProvider maps 401 to invalidToken", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(null, { status: 401 })) as typeof fetch;

  try {
    const provider = new GitHubProvider({
      owner: "octocat",
      repo: "hello-world",
      accessToken: "bad-token",
    });

    await assert.rejects(
      () => provider.testConnection(),
      (err: unknown) =>
        err instanceof GitHubProviderError &&
        err.code === "storageProvider.github.invalidToken" &&
        err.message === "GitHub-Token ungültig oder abgelaufen.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHubProvider maps exhausted 403 responses to rateLimit", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(null, {
      status: 403,
      headers: { "x-ratelimit-remaining": "0" },
    })) as typeof fetch;

  try {
    const provider = new GitHubProvider({
      owner: "octocat",
      repo: "hello-world",
    });

    await assert.rejects(
      () => provider.testConnection(),
      (err: unknown) =>
        err instanceof GitHubProviderError &&
        err.code === "storageProvider.github.rateLimit" &&
        err.message === "GitHub-Rate-Limit erreicht. Bitte später erneut versuchen.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHubProvider maps non-rate-limited 403 responses to insufficientScope", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(null, {
      status: 403,
      headers: { "x-ratelimit-remaining": "42" },
    })) as typeof fetch;

  try {
    const provider = new GitHubProvider({
      owner: "octocat",
      repo: "hello-world",
      accessToken: "token",
    });

    await assert.rejects(
      () => provider.testConnection(),
      (err: unknown) =>
        err instanceof GitHubProviderError &&
        err.code === "storageProvider.github.insufficientScope" &&
        err.message === "GitHub-Token hat nicht die benötigten Berechtigungen.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHubProvider maps 404 responses to repoNotFound", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(null, { status: 404 })) as typeof fetch;

  try {
    const provider = new GitHubProvider({
      owner: "octocat",
      repo: "missing",
    });

    await assert.rejects(
      () => provider.testConnection(),
      (err: unknown) =>
        err instanceof GitHubProviderError &&
        err.code === "storageProvider.github.repoNotFound" &&
        err.message === "Repository nicht gefunden oder nicht zugänglich.",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("team create-disabled errors keep code and status metadata", async () => {
  const err = new TeamError("team.createDisabled");

  const res = codedApiError(teamErrorStatus(err.code), err.code);
  assert.equal(res.status, 403);

  const body = (await res.json()) as {
    details: { code: string; status: number };
  };

  assert.deepEqual(body.details, {
    code: "team.createDisabled",
    status: 403,
  });
});
