import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * Thrown by `requireSession` / `requireSessionWithAccount` when the
 * caller is unauthenticated (default 401) or lacks the required role
 * (`status: 403`). Lives here (not in `session.ts`) so tests and other
 * DB-free modules can import it without transitively loading the DB
 * client.
 */
export class ApiAuthError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor();
  constructor(message: string, status?: number);
  constructor(status: number, code: string, message?: string);
  constructor(
    arg1: string | number = "Unauthorized",
    arg2: number | string = 401,
    arg3?: string,
  ) {
    const isStructured = typeof arg1 === "number" && typeof arg2 === "string";
    const message = isStructured ? (arg3 ?? arg2) : (arg1 as string);
    super(message);
    this.name = "ApiAuthError";
    this.status = isStructured ? arg1 : (arg2 as number);
    this.code = isStructured ? arg2 : undefined;
  }
}

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

export function codedApiError(
  status: number,
  code: string,
  details?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({
    details: {
    code,
    status,
    ...(details ?? {}),
    },
  }, { status });
}

export function unauthorized(message = "Unauthorized") {
  return apiError(message, 401);
}

export function forbidden(message = "Forbidden", code = "forbidden") {
  return apiError(message, 403, { code });
}

/**
 * Map a thrown `ApiAuthError` to the correct HTTP response. `status === 403`
 * → `forbidden()` with a `code: 'forbidden.role'` marker so the frontend
 * can distinguish this from a missing session (`unauthorized`, `401`).
 *
 * Existing routes that still call `unauthorized(err.message)` directly
 * keep working — they just always respond 401 even on role mismatches.
 * New routes that use the `minRole` guard should prefer this helper.
 */
export function authErrorResponse(err: {
  message: string;
  status?: number;
  code?: string;
}) {
  if (err.code && err.status) {
    return NextResponse.json(
      {
        error: {
          code: err.code,
          status: err.status,
        },
      },
      { status: err.status },
    );
  }
  if (err.status === 403) return forbidden(err.message, "forbidden.role");
  return unauthorized(err.message);
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

/**
 * Parse a JSON body with an upper size limit. Prevents a malicious client
 * from streaming a 1 GB payload just to crash our JSON parser.
 *
 * Returns `null` on any error (bad JSON, oversize, no body). Callers then
 * run Zod validation against `null`, which fails predictably with a clear
 * 400 response.
 */
export async function parseJsonBody<T = unknown>(
  req: Request,
  maxBytes = 1024 * 1024, // 1 MB default
): Promise<T | null> {
  const cl = req.headers.get("content-length");
  if (cl && Number(cl) > maxBytes) return null;
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function zodError(err: ZodError) {
  return apiError("Validation failed", 400, err.flatten());
}

export function serverError(err: unknown) {
  console.error("[api] server error:", err);
  const message =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err instanceof Error
        ? err.message
        : "Internal server error";
  return apiError(message, 500);
}
