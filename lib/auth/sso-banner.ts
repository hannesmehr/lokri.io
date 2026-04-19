const STORAGE_PREFIX = "lokri:sso-available-banner:dismissed:";

export function getSsoAvailableBannerStorageKey(ownerAccountId: string) {
  return `${STORAGE_PREFIX}${ownerAccountId}`;
}

export function shouldShowSsoAvailableBanner(args: {
  accountType: "personal" | "team";
  ssoEnabled: boolean;
  hasSsoIdentity: boolean;
}): boolean {
  if (args.accountType !== "team") return false;
  if (!args.ssoEnabled) return false;
  if (args.hasSsoIdentity) return false;
  return true;
}
