/**
 * Live-Smoke-Test für den ConfluenceCloudProvider gegen eine echte
 * Atlassian-Cloud-Instanz.
 *
 * Aufruf:
 *
 *   pnpm tsx --env-file=.env.local scripts/confluence-live-test.ts
 *
 * Erwartete Env-Vars in `.env.local`:
 *
 *   CONFLUENCE_LIVE_TEST_EMAIL=<Atlassian-Account-Email>
 *   CONFLUENCE_LIVE_TEST_API_TOKEN=<aus id.atlassian.com generiert>
 *   CONFLUENCE_LIVE_TEST_SITE_URL=https://<tenant>.atlassian.net
 *
 * Was das Script tut:
 *   1. testCredentials() → loggt Display-Name + Diagnostics
 *   2. discoverScopes() → loggt Anzahl + erste 10 Spaces (Key + ID)
 *
 * Schreibt **nichts** in die DB; keine Integrationen werden gespeichert.
 *
 * Bewusst simpel gehalten — wenn das Script grünes Licht gibt, wissen
 * wir, dass die Unit-Test-Fixtures die reale API korrekt abbilden.
 * Bei Shape-Abweichungen (seltene Felder, unterschiedliche Pagination-
 * Keys) hier zuerst auffallen statt erst in Block 2.
 */

import { ConfluenceCloudProvider } from "@/lib/connectors/providers/confluence-cloud/provider";

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing env var: ${name}`);
    console.error("Setze die Werte in .env.local; siehe Skript-Header.");
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  const credentials = {
    email: readEnv("CONFLUENCE_LIVE_TEST_EMAIL"),
    apiToken: readEnv("CONFLUENCE_LIVE_TEST_API_TOKEN"),
  };
  const config = {
    siteUrl: readEnv("CONFLUENCE_LIVE_TEST_SITE_URL"),
  };

  const provider = new ConfluenceCloudProvider({ timeoutMs: 15_000 });

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("Confluence Cloud — Live-Smoke-Test");
  console.log(`Site: ${config.siteUrl}`);
  console.log(`Email: ${credentials.email}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

  // Step 1: testCredentials
  console.log("\n[1/2] testCredentials() …");
  const t0 = Date.now();
  const result = await provider.testCredentials(credentials, config);
  const dt = Date.now() - t0;
  console.log(`  result.ok: ${result.ok}`);
  console.log(`  result.message: ${result.message}`);
  if (result.diagnostics) {
    console.log("  diagnostics:");
    for (const [key, value] of Object.entries(result.diagnostics)) {
      console.log(`    ${key}: ${JSON.stringify(value)}`);
    }
  }
  console.log(`  duration: ${dt}ms`);

  if (!result.ok) {
    console.error("\n❌ testCredentials failed — stopping before discoverScopes.");
    process.exit(2);
  }

  // Step 2: discoverScopes
  console.log("\n[2/2] discoverScopes() …");
  const t1 = Date.now();
  const scopes = await provider.discoverScopes(credentials, config);
  const dt2 = Date.now() - t1;
  console.log(`  ${scopes.length} spaces discovered (duration: ${dt2}ms)`);
  const preview = scopes.slice(0, 10);
  for (const scope of preview) {
    const displayName = scope.metadata?.displayName ?? "—";
    const spaceId = scope.metadata?.spaceId ?? "—";
    console.log(`    ${scope.identifier.padEnd(12)} id=${spaceId}  ${displayName}`);
  }
  if (scopes.length > preview.length) {
    console.log(`    … and ${scopes.length - preview.length} more`);
  }

  console.log("\n✅ Live-Test durchgelaufen.");
}

main().catch((err) => {
  console.error("\n❌ Live-Test schlug fehl:");
  if (err instanceof Error) {
    console.error(`  ${err.name}: ${err.message}`);
    if (err.cause) console.error(`  cause: ${String(err.cause)}`);
    if (err.stack) console.error(err.stack);
  } else {
    console.error(err);
  }
  process.exit(3);
});
