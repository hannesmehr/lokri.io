import assert from "node:assert/strict";
import test from "node:test";
import { codedApiError } from "@/lib/api/errors";
import { assertEmbeddingKeyFormat, EmbeddingKeyError, maskEmbeddingKey } from "@/lib/embedding-key-errors";

test("maskEmbeddingKey keeps only prefix and suffix visible", () => {
  assert.equal(maskEmbeddingKey("sk-1234567890abcdef"), "sk-*************def");
});

test("assertEmbeddingKeyFormat rejects malformed keys with embeddingKey.invalidFormat", () => {
  assert.throws(
    () => assertEmbeddingKeyFormat("bad-key"),
    (err: unknown) =>
      err instanceof EmbeddingKeyError &&
      err.code === "embeddingKey.invalidFormat" &&
      err.message === "Der Embedding-Key hat ein ungültiges Format." &&
      err.status === 400,
  );
});

test("codedApiError serializes embeddingKey.notFound metadata", async () => {
  const res = codedApiError(404, "embeddingKey.notFound");

  assert.equal(res.status, 404);

  const body = (await res.json()) as {
    details: { code: string; status: number };
  };

  assert.deepEqual(body.details, {
    code: "embeddingKey.notFound",
    status: 404,
  });
});
