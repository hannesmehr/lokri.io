/**
 * Typed error for team + invite flows. The `code` is a stable slug the
 * frontend can switch on; `message` is the user-facing fallback for
 * raw-`throw`-to-5xx paths. Call sites translate `code` → HTTP status via
 * `teamErrorResponse()` below.
 */

export type TeamErrorCode =
  | "CREATE_DISABLED" // user.can_create_teams === false
  | "NAME_REQUIRED"
  | "NAME_TOO_LONG"
  | "NOT_FOUND" // team doesn't exist or user isn't a member
  | "FORBIDDEN" // role insufficient
  | "ALREADY_MEMBER"
  | "OWNER_PROTECTED"; // can't remove / demote the sole owner

export class TeamError extends Error {
  readonly code: TeamErrorCode;

  constructor(code: TeamErrorCode, message?: string) {
    super(message ?? code);
    this.name = "TeamError";
    this.code = code;
  }
}

export function teamErrorStatus(code: TeamErrorCode): number {
  switch (code) {
    case "CREATE_DISABLED":
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "ALREADY_MEMBER":
    case "OWNER_PROTECTED":
      return 409;
    case "NAME_REQUIRED":
    case "NAME_TOO_LONG":
      return 400;
    default:
      return 400;
  }
}
