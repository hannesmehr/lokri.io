export interface TeamSsoConfigSnapshot {
  provider: "entra";
  tenantId: string;
  allowedDomains: string[];
  enabled: boolean;
  lastVerifiedAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamSsoFallbackAdminStatus {
  hasAnyNonSsoAdmin: boolean;
  adminCount: number;
  nonSsoAdminCount: number;
}

export function serializeTeamSsoConfig(
  config: TeamSsoConfigSnapshot | null,
  canManage: boolean,
) {
  if (!config) return null;

  const shared = {
    provider: config.provider,
    enabled: config.enabled,
    lastVerifiedAt: config.lastVerifiedAt
      ? config.lastVerifiedAt.toISOString()
      : null,
  };

  if (!canManage) return shared;

  return {
    ...shared,
    tenantId: config.tenantId,
    allowedDomains: config.allowedDomains,
    lastError: config.lastError,
    createdAt: config.createdAt.toISOString(),
    updatedAt: config.updatedAt.toISOString(),
  };
}

export function buildTeamSsoResponse(args: {
  accountId: string;
  config: TeamSsoConfigSnapshot | null;
  canManage: boolean;
  fallbackAdminStatus?: TeamSsoFallbackAdminStatus | null;
}) {
  return {
    accountId: args.accountId,
    config: serializeTeamSsoConfig(args.config, args.canManage),
    permissions: {
      canManage: args.canManage,
    },
    fallbackAdminStatus: args.canManage
      ? (args.fallbackAdminStatus ?? null)
      : null,
  };
}

export function consentTenantMatchesConfig(
  configuredTenantId: string | null | undefined,
  returnedTenantId: string | null | undefined,
): boolean {
  if (!configuredTenantId || !returnedTenantId) return false;
  return (
    configuredTenantId.trim().toLowerCase() ===
    returnedTenantId.trim().toLowerCase()
  );
}
