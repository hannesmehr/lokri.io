#!/usr/bin/env tsx
/**
 * DEV-SHORTCUT — create/update a Confluence-Cloud integration + scope
 * allowlist + space mappings for a team, directly via the database.
 *
 * For production the Admin-UI (Block 5) owns this flow. This script
 * exists for local/dev/CI: setting up an E2E-Test fixture, recovery
 * scenarios, and Hannes' personal Empro-Instance wiring.
 *
 * Usage:
 *
 *   pnpm tsx --env-file=.env.local scripts/confluence-setup-dev.ts \
 *     <owner-account-id> \
 *     <space-key-1>,<space-key-2>,...       # whitelist scopes
 *     <space-key>:<lokri-space-uuid>,...    # 1:1 mappings
 *
 * Example (Empro):
 *
 *   pnpm tsx --env-file=.env.local scripts/confluence-setup-dev.ts \
 *     0193cf5a-7f3d-7d8a-a8b5-4c9e7e12ab34 \
 *     KnowHow,intern \
 *     KnowHow:0193d01a-aaaa-7000-bbbb-000000000001,intern:0193d01a-aaaa-7000-bbbb-000000000002
 *
 * Credentials + site-url kommen aus Env (gleicher Satz wie der Live-
 * Smoke-Test):
 *
 *   CONFLUENCE_LIVE_TEST_EMAIL=<atlassian-account-email>
 *   CONFLUENCE_LIVE_TEST_API_TOKEN=<token aus id.atlassian.com>
 *   CONFLUENCE_LIVE_TEST_SITE_URL=https://<tenant>.atlassian.net
 *
 * Idempotenz:
 *  - Bestehende Integration derselben `(owner_account_id,
 *    connector_type='confluence-cloud', display_name=siteUrl)` wird
 *    aktualisiert (credentials rotated, `lastError` cleared)
 *  - Scope-Allowlist wird atomar ersetzt via
 *    `replaceIntegrationScopes` — cascaded löscht ungemappt gewordene
 *    `space_external_sources`-Rows
 *  - Space-Mappings: idempotent via `ON CONFLICT DO NOTHING` auf dem
 *    Unique-Index `(space_id, connector_scope_id)`
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  connectorIntegrations,
  ownerAccounts,
  spaceExternalSources,
  spaces,
} from "@/lib/db/schema";
import {
  createIntegration,
  getIntegrationForAccount,
  updateIntegrationCredentials,
} from "@/lib/connectors/integrations";
import { findScopeByRef, replaceIntegrationScopes } from "@/lib/connectors/scopes";
import { ConfluenceCloudProvider } from "@/lib/connectors/providers/confluence-cloud/provider";
import type { ConnectorIntegration } from "@/lib/connectors/types";

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

interface ParsedMapping {
  scopeKey: string;
  lokriSpaceId: string;
}

interface Args {
  ownerAccountId: string;
  scopeKeys: string[];
  mappings: ParsedMapping[];
}

function parseArgs(argv: string[]): Args | null {
  if (argv.length !== 3) return null;
  const [ownerAccountId, scopeCsv, mappingsCsv] = argv;

  const scopeKeys = scopeCsv
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  if (scopeKeys.length === 0) return null;

  const mappings: ParsedMapping[] = [];
  for (const raw of mappingsCsv.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [scopeKey, lokriSpaceId, ...rest] = raw.split(":");
    if (!scopeKey || !lokriSpaceId || rest.length > 0) return null;
    mappings.push({ scopeKey, lokriSpaceId });
  }
  if (mappings.length === 0) return null;

  return { ownerAccountId, scopeKeys, mappings };
}

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ Missing env var: ${name}`);
    console.error("  Required:");
    console.error("    CONFLUENCE_LIVE_TEST_EMAIL");
    console.error("    CONFLUENCE_LIVE_TEST_API_TOKEN");
    console.error("    CONFLUENCE_LIVE_TEST_SITE_URL");
    process.exit(1);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requireTeamAccount(ownerAccountId: string): Promise<void> {
  const [row] = await db
    .select({ id: ownerAccounts.id, type: ownerAccounts.type, name: ownerAccounts.name })
    .from(ownerAccounts)
    .where(eq(ownerAccounts.id, ownerAccountId))
    .limit(1);
  if (!row) {
    console.error(`✗ Owner-Account ${ownerAccountId} not found.`);
    process.exit(1);
  }
  console.log(`  ✓ Owner-Account: "${row.name}" (${row.type})`);
}

async function requireSpacesBelongToAccount(
  spaceIds: string[],
  ownerAccountId: string,
): Promise<void> {
  // Jede Space-ID muss zum Account gehören — sonst könnte man via
  // Setup einen external-source auf fremde Spaces mappen.
  const rows = await db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(eq(spaces.ownerAccountId, ownerAccountId));
  const ownedIds = new Set(rows.map((r) => r.id));
  for (const id of spaceIds) {
    if (!ownedIds.has(id)) {
      console.error(
        `✗ Space ${id} does not belong to account ${ownerAccountId}.`,
      );
      console.error(`  Available spaces for this account:`);
      for (const r of rows) console.error(`    ${r.id}  ${r.name}`);
      process.exit(1);
    }
  }
}

async function findExistingIntegration(
  ownerAccountId: string,
  displayName: string,
): Promise<ConnectorIntegration | null> {
  const [row] = await db
    .select()
    .from(connectorIntegrations)
    .where(
      and(
        eq(connectorIntegrations.ownerAccountId, ownerAccountId),
        eq(connectorIntegrations.connectorType, "confluence-cloud"),
        eq(connectorIntegrations.displayName, displayName),
      ),
    )
    .limit(1);
  return row ?? null;
}

async function upsertIntegration(params: {
  ownerAccountId: string;
  displayName: string;
  email: string;
  apiToken: string;
  siteUrl: string;
}): Promise<ConnectorIntegration> {
  const existing = await findExistingIntegration(
    params.ownerAccountId,
    params.displayName,
  );
  if (existing) {
    console.log(`  → Updating existing integration ${existing.id}`);
    const updated = await updateIntegrationCredentials(existing.id, {
      email: params.email,
      apiToken: params.apiToken,
    });
    if (!updated) {
      // Sollte nicht passieren, weil existing vorhin da war. Defensive.
      throw new Error(`Failed to update integration ${existing.id}`);
    }
    return updated;
  }
  console.log(`  → Creating new integration`);
  return createIntegration({
    ownerAccountId: params.ownerAccountId,
    connectorType: "confluence-cloud",
    displayName: params.displayName,
    authType: "pat",
    credentials: { email: params.email, apiToken: params.apiToken },
    config: { siteUrl: params.siteUrl },
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args) {
    console.error(
      "Usage: pnpm tsx --env-file=.env.local scripts/confluence-setup-dev.ts \\\n" +
        "  <owner-account-id> \\\n" +
        "  <scope-key>[,<scope-key>...] \\\n" +
        "  <scope-key>:<lokri-space-uuid>[,<scope-key>:<lokri-space-uuid>...]",
    );
    process.exit(1);
  }

  const email = readEnv("CONFLUENCE_LIVE_TEST_EMAIL");
  const apiToken = readEnv("CONFLUENCE_LIVE_TEST_API_TOKEN");
  const siteUrl = readEnv("CONFLUENCE_LIVE_TEST_SITE_URL");

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Confluence Cloud — Dev-Setup");
  console.log(`Account: ${args.ownerAccountId}`);
  console.log(`Site:    ${siteUrl}`);
  console.log(`Email:   ${email}`);
  console.log(`Scopes:  ${args.scopeKeys.join(", ")}`);
  console.log(`Maps:    ${args.mappings.length} mapping(s)`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // 1. Account + spaces sanity
  console.log("\n[1/6] Validating account + target spaces…");
  await requireTeamAccount(args.ownerAccountId);
  await requireSpacesBelongToAccount(
    args.mappings.map((m) => m.lokriSpaceId),
    args.ownerAccountId,
  );

  // 2. testCredentials
  console.log("\n[2/6] Verifying Confluence credentials…");
  const provider = new ConfluenceCloudProvider({ timeoutMs: 15_000 });
  const test = await provider.testCredentials(
    { email, apiToken },
    { siteUrl },
  );
  if (!test.ok) {
    console.error(`✗ testCredentials failed: ${test.message}`);
    process.exit(2);
  }
  console.log(`  ✓ ${test.message}`);

  // 3. discoverScopes
  console.log("\n[3/6] Discovering Confluence spaces…");
  const discovered = await provider.discoverScopes(
    { email, apiToken },
    { siteUrl },
  );
  console.log(`  ✓ ${discovered.length} space(s) visible`);

  // 4. Validate requested scope-keys actually exist
  const discoveredByKey = new Map<string, (typeof discovered)[number]>();
  for (const s of discovered) discoveredByKey.set(s.identifier, s);
  for (const key of args.scopeKeys) {
    if (!discoveredByKey.has(key)) {
      console.error(`✗ Space-Key "${key}" not found in Confluence discovery.`);
      console.error("  Available keys:");
      for (const s of discovered) console.error(`    ${s.identifier}`);
      process.exit(3);
    }
  }
  // Mapping-Keys müssen Subset der Scope-Keys sein
  const scopeKeySet = new Set(args.scopeKeys);
  for (const m of args.mappings) {
    if (!scopeKeySet.has(m.scopeKey)) {
      console.error(
        `✗ Mapping references scope-key "${m.scopeKey}" that is not in the allowlist.`,
      );
      process.exit(3);
    }
  }

  // 5. Integration + allowlist atomar schreiben
  console.log("\n[4/6] Upserting integration + allowlist…");
  const integration = await upsertIntegration({
    ownerAccountId: args.ownerAccountId,
    displayName: siteUrl.replace(/\/+$/, ""),
    email,
    apiToken,
    siteUrl,
  });
  console.log(`  ✓ Integration: ${integration.id}`);

  const scopeInputs = args.scopeKeys.map((key) => {
    const disc = discoveredByKey.get(key)!; // checked above
    return {
      scopeType: "confluence-space",
      scopeIdentifier: key,
      scopeMetadata: disc.metadata ?? null,
    };
  });
  const allowlistRows = await replaceIntegrationScopes(
    integration.id,
    scopeInputs,
  );
  console.log(`  ✓ Allowlist: ${allowlistRows.length} scope(s)`);

  // 6. Mappings — idempotent
  console.log("\n[5/6] Writing space mappings…");
  let upserted = 0;
  for (const m of args.mappings) {
    const scope = await findScopeByRef(
      integration.id,
      "confluence-space",
      m.scopeKey,
    );
    if (!scope) {
      // Shouldn't happen since we just wrote the allowlist, but
      // defensive for race/retry edge cases.
      console.error(`✗ Scope for "${m.scopeKey}" missing after upsert.`);
      process.exit(4);
    }
    // INSERT … ON CONFLICT DO NOTHING to keep the unique index happy
    // when re-running the script with the same mappings.
    const inserted = await db
      .insert(spaceExternalSources)
      .values({
        spaceId: m.lokriSpaceId,
        connectorScopeId: scope.id,
        // addedByUserId ist nullable — wir haben keinen User-Context
        // im Dev-Script; in Admin-UI würde hier der Session-User stehen.
        addedByUserId: null,
      })
      .onConflictDoNothing()
      .returning({ id: spaceExternalSources.id });
    if (inserted.length > 0) {
      console.log(
        `  + mapped ${m.scopeKey} → ${m.lokriSpaceId}  (${inserted[0].id})`,
      );
      upserted++;
    } else {
      console.log(`  = already mapped: ${m.scopeKey} → ${m.lokriSpaceId}`);
    }
  }
  console.log(`  ✓ ${args.mappings.length} mapping(s) processed, ${upserted} new`);

  // 7. Summary
  console.log("\n[6/6] Summary");
  console.log(`  Integration:  ${integration.id}`);
  console.log(`  Scopes:       ${args.scopeKeys.join(", ")}`);
  console.log(`  Mappings:     ${args.mappings.length}`);
  console.log("\n✅ Setup complete.");
  console.log(
    "\nNow run the E2E test (requires the same env vars plus\n" +
      "CONFLUENCE_LIVE_TEST_OWNER_ACCOUNT_ID):\n\n" +
      "  pnpm tsx --env-file=.env.local --test tests/mcp-confluence-e2e.test.ts",
  );
}

main().catch((err) => {
  console.error("\n❌ Setup failed:");
  if (err instanceof Error) {
    console.error(`  ${err.name}: ${err.message}`);
    if (err.stack) console.error(err.stack);
  } else {
    console.error(err);
  }
  process.exit(5);
});
