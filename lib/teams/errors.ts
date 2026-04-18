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
  | "NAME_MISMATCH" // delete-confirm name doesn't match
  | "NOT_FOUND" // team doesn't exist or user isn't a member
  | "FORBIDDEN" // role insufficient
  | "ALREADY_MEMBER"
  | "OWNER_PROTECTED" // can't remove / demote the sole owner
  | "OWNER_TRANSFER_SELF" // can't transfer to yourself
  | "OWNER_TRANSFER_NOT_ADMIN" // target must already be admin
  | "OWNER_TRANSFER_NOT_OWNER"; // caller claims to be owner but isn't

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
    case "NAME_MISMATCH":
    case "OWNER_TRANSFER_SELF":
    case "OWNER_TRANSFER_NOT_ADMIN":
      return 400;
    case "OWNER_TRANSFER_NOT_OWNER":
      return 403;
    default:
      return 400;
  }
}

// ---------------------------------------------------------------------------
// Invite-specific errors. Separate class so the UI can switch on an
// `InviteError` without parsing strings.
// ---------------------------------------------------------------------------

export type InviteErrorCode =
  | "INVALID_TOKEN"
  | "EXPIRED"
  | "EMAIL_MISMATCH"
  | "ALREADY_MEMBER" // user already sits in the team via a different invite / direct add
  | "ALREADY_INVITED" // another pending invite for this email in this team
  | "INVALID_ROLE"; // owner is not a valid invite role; unknown strings also rejected

export class InviteError extends Error {
  readonly code: InviteErrorCode;

  constructor(code: InviteErrorCode, message?: string) {
    super(message ?? code);
    this.name = "InviteError";
    this.code = code;
  }
}

export function inviteErrorStatus(code: InviteErrorCode): number {
  switch (code) {
    case "INVALID_TOKEN":
    case "EXPIRED":
    case "EMAIL_MISMATCH":
      return 400;
    case "ALREADY_MEMBER":
    case "ALREADY_INVITED":
      return 409;
    case "INVALID_ROLE":
      return 400;
    default:
      return 400;
  }
}
