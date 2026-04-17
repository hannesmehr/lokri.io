import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * Unified JSON error shape: `{ error: string, details?: unknown }`.
 * Keep messages stable — the Web-UI and MCP tool layer both consume these.
 */
export function apiError(
  message: string,
  status = 400,
  details?: unknown,
): NextResponse {
  return NextResponse.json(
    details !== undefined ? { error: message, details } : { error: message },
    { status },
  );
}

export function unauthorized(message = "Unauthorized") {
  return apiError(message, 401);
}

export function notFound(message = "Not found") {
  return apiError(message, 404);
}

export function paymentRequired(message: string) {
  // Used for quota violations — HTTP 402 is the standard-ish choice.
  return apiError(message, 402);
}

export function tooLarge(message = "Payload too large") {
  return apiError(message, 413);
}

export function zodError(err: ZodError) {
  return apiError("Validation failed", 400, err.flatten());
}

export function serverError(err: unknown) {
  console.error("[api] server error:", err);
  const message = err instanceof Error ? err.message : "Internal server error";
  return apiError(message, 500);
}
