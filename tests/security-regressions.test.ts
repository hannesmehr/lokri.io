import test from "node:test";
import assert from "node:assert/strict";
import { computeBillingWindow } from "@/lib/billing/window";
import { resolveAppOrigin } from "@/lib/origin";
import { serverError } from "@/lib/api/errors";

test("resolveAppOrigin prefers canonical configured origin", () => {
  const prevBetter = process.env.BETTER_AUTH_URL;
  const prevProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const prevVercel = process.env.VERCEL_URL;
  process.env.BETTER_AUTH_URL = "https://app.example.com";
  process.env.VERCEL_PROJECT_PRODUCTION_URL = "prod.vercel.app";
  process.env.VERCEL_URL = "preview.vercel.app";
  try {
    assert.equal(resolveAppOrigin(), "https://app.example.com");
  } finally {
    process.env.BETTER_AUTH_URL = prevBetter;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = prevProd;
    process.env.VERCEL_URL = prevVercel;
  }
});

test("resolveAppOrigin strips trailing slashes so path concat stays clean", () => {
  const prevBetter = process.env.BETTER_AUTH_URL;
  const prevProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const prevVercel = process.env.VERCEL_URL;
  process.env.BETTER_AUTH_URL = "https://www.lokri.io/";
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  delete process.env.VERCEL_URL;
  try {
    assert.equal(resolveAppOrigin(), "https://www.lokri.io");
    assert.equal(`${resolveAppOrigin()}/api/mcp`, "https://www.lokri.io/api/mcp");
  } finally {
    process.env.BETTER_AUTH_URL = prevBetter;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = prevProd;
    process.env.VERCEL_URL = prevVercel;
  }
});

test("serverError hides internal details in production", async () => {
  const prev = process.env.NODE_ENV;
  Object.assign(process.env, { NODE_ENV: "production" });
  try {
    const res = serverError(new Error("secret internals"));
    const body = await res.json();
    assert.equal(body.error, "Internal server error");
  } finally {
    if (prev === undefined) {
      delete (process.env as Record<string, string | undefined>).NODE_ENV;
    } else {
      Object.assign(process.env, { NODE_ENV: prev });
    }
  }
});

test("computeBillingWindow stacks on future expiry", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const currentExpiry = new Date("2026-01-10T00:00:00.000Z");
  const result = computeBillingWindow(currentExpiry, now, "monthly");
  assert.equal(result.startsAt.toISOString(), currentExpiry.toISOString());
  assert.equal(result.expiresAt.toISOString(), "2026-02-09T00:00:00.000Z");
});

test("computeBillingWindow starts immediately when current expiry is past", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");
  const currentExpiry = new Date("2025-12-10T00:00:00.000Z");
  const result = computeBillingWindow(currentExpiry, now, "yearly");
  assert.equal(result.startsAt.toISOString(), now.toISOString());
  assert.equal(result.expiresAt.toISOString(), "2027-01-01T00:00:00.000Z");
});
