#!/usr/bin/env tsx
/**
 * DEV-SHORTCUT — enable SSO for a team directly via the database.
 *
 * For production configuration use the Admin-UI at
 * `/admin/accounts/[id]` (Team-SSO section). This script exists only
 * for local testing and debugging when the Admin-UI flow is
 * impractical — scripted test setups, bulk operations, or recovery
 * scenarios where the UI itself is broken.
 *
 * Usage:
 *
 *   pnpm tsx --env-file=.env.local scripts/enable-sso-for-team.ts \
 *     <owner-account-uuid> <entra-tenant-uuid> <domain-1>[,<domain-2>,...]
 *
 * Example:
 *
 *   pnpm tsx --env-file=.env.local scripts/enable-sso-for-team.ts \
 *     0193cf5a-7f3d-7d8a-a8b5-4c9e7e12ab34 \
 *     3fa85f64-5717-4562-b3fc-2c963f66afa6 \
 *     firma-x.de,firma-x.com
 *
 * Idempotent — a second call updates the existing row instead of
 * duplicating (via `onConflictDoUpdate` against the UNIQUE index on
 * `owner_account_id`).
 *
 * Fallback-Admin guard: if the team has no owner/admin with a
 * credential-login account, this script aborts. Pass `--force` to
 * bypass the check (use carefully — Phase 2 UI uses the same guard
 * as a blocking-rule, not an opt-out).
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { hasFallbackAdmin } from "@/lib/auth/sso";
import { ownerAccounts, teamSsoConfigs } from "@/lib/db/schema";

interface Args {
  ownerAccountId: string;
  tenantId: string;
  allowedDomains: string[];
  force: boolean;
}

function parseArgs(argv: string[]): Args | null {
  const positional: string[] = [];
  let force = false;
  for (const a of argv) {
    if (a === "--force") force = true;
    else positional.push(a);
  }
  if (positional.length !== 3) return null;
  const [ownerAccountId, tenantId, domainsCsv] = positional;
  const allowedDomains = domainsCsv
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (allowedDomains.length === 0) return null;
  return { ownerAccountId, tenantId, allowedDomains, force };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error(
      "Usage: pnpm tsx scripts/enable-sso-for-team.ts <owner-account-id> <tenant-id> <domain1>[,<domain2>,...] [--force]",
    );
    process.exit(1);
  }

  // Team-Account prüfen.
  const [account] = await db
    .select({ id: ownerAccounts.id, type: ownerAccounts.type, name: ownerAccounts.name })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, args.ownerAccountId))
    .limit(1);
  if (!account) {
    console.error(`✗ Owner-Account ${args.ownerAccountId} nicht gefunden.`);
    process.exit(1);
  }
  if (account.type !== "team") {
    console.error(
      `✗ Account ${args.ownerAccountId} ist ein "${account.type}"-Account; SSO nur für Teams.`,
    );
    process.exit(1);
  }

  // Fallback-Admin-Check.
  const hasFallback = await hasFallbackAdmin(args.ownerAccountId);
  if (!hasFallback && !args.force) {
    console.error(
      `✗ Team "${account.name}" hat keinen Owner/Admin mit Email-Passwort-Zugang.\n` +
        `  SSO-Aktivierung blockiert (Lockout-Schutz). Mit --force übergehen\n` +
        `  NUR wenn du weisst, was du tust (Dev/Test-Szenarien).`,
    );
    process.exit(1);
  }
  if (!hasFallback && args.force) {
    console.warn(
      `⚠  Team "${account.name}" hat keinen Fallback-Admin — trotzdem weiter (--force).`,
    );
  }

  // Upsert.
  const now = new Date();
  await db
    .insert(teamSsoConfigs)
    .values({
      ownerAccountId: args.ownerAccountId,
      provider: "entra",
      tenantId: args.tenantId,
      allowedDomains: args.allowedDomains,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: teamSsoConfigs.ownerAccountId,
      set: {
        provider: "entra",
        tenantId: args.tenantId,
        allowedDomains: args.allowedDomains,
        enabled: true,
        lastError: null,
        updatedAt: now,
      },
    });

  console.log(`✓ SSO enabled für "${account.name}" (${args.ownerAccountId}).`);
  console.log(`  Provider:       entra`);
  console.log(`  Tenant-ID:      ${args.tenantId}`);
  console.log(`  Allowed Domains: ${args.allowedDomains.join(", ")}`);
  console.log("");
  console.log(
    `  Test-Flow: /api/auth/sso-discovery?email=test@${args.allowedDomains[0]}`,
  );

  // Clean exit für Neon-HTTP-Driver.
  process.exit(0);
}

main().catch((err) => {
  console.error("[enable-sso-for-team]", err);
  process.exit(1);
});

// Suppresses lint about unused import when Drizzle-tree-shakes.
void and;
