/**
 * Typed error for team + invite flows. The `code` is a stable slug the
 * frontend can switch on; `message` is the user-facing fallback for
 * raw-`throw`-to-5xx paths. Call sites translate `code` → HTTP status via
 * `teamErrorResponse()` below.
 */

export type TeamErrorCode =
  | "team.createDisabled" // user.can_create_teams === false
  | "team.nameRequired"
  | "team.nameTooLong"
  | "team.nameMismatch" // delete-confirm name doesn't match
  | "team.notFound" // team doesn't exist or user isn't a member
  | "team.forbidden" // role insufficient
  | "team.alreadyMember"
  | "team.ownerProtected" // can't remove / demote the sole owner
  | "team.ownerTransferSelf" // can't transfer to yourself
  | "team.ownerTransferNotAdmin" // target must already be admin
  | "team.ownerTransferNotOwner" // caller claims to be owner but isn't
  | "team.roleChangeForbidden"
  | "team.selfRoleChange"
  | "team.selfRemove";

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
    case "team.createDisabled":
    case "team.forbidden":
    case "team.roleChangeForbidden":
      return 403;
    case "team.notFound":
      return 404;
    case "team.alreadyMember":
    case "team.ownerProtected":
      return 409;
    case "team.nameRequired":
    case "team.nameTooLong":
    case "team.nameMismatch":
    case "team.ownerTransferSelf":
    case "team.ownerTransferNotAdmin":
    case "team.selfRoleChange":
    case "team.selfRemove":
      return 400;
    case "team.ownerTransferNotOwner":
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
