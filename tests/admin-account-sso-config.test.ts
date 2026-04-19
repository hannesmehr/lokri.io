import test from "node:test";
import assert from "node:assert/strict";
import { ssoConfigSchema } from "@/lib/admin/sso-config-schema";

/**
 * Contract-Tests für `PUT /api/admin/accounts/[id]/sso`.
 *
 * DB-abhängige Bits (GET-Response-Shape, PUT-Fallback-Admin-Guard,
 * DELETE-Cascade, Verify-Route mit Entra-Fetch-Mock) laufen über
 * manuellen E2E + Dev-Server-Smoke — analog zu den anderen
 * admin-*-Tests.
 *
 * Gepinnte Invarianten:
 *   1. Tenant-ID ist UUID-Format
 *   2. allowedDomains: 1..10 Einträge, jeder ein Domain-Regex-Match
 *   3. enabled ist Pflicht-Boolean
 *   4. Domains werden in der Route-Seitigen .toLowerCase()-Transform
 *      normalisiert (Zod transform greift)
 *   5. Innere Whitespace / Underscores / '@' in Domains abgelehnt
 */

test("minimal valid payload", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: ["firma-x.de"],
    enabled: false,
  });
  assert.equal(parsed.success, true);
});

test("enabled: true akzeptiert (Fallback-Guard läuft route-seitig)", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: ["firma-x.de"],
    enabled: true,
  });
  assert.equal(parsed.success, true);
});

test("Tenant-ID kein UUID → abgelehnt", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "not-a-uuid",
    allowedDomains: ["firma-x.de"],
    enabled: false,
  });
  assert.equal(parsed.success, false);
});

test("Tenant-ID leer → abgelehnt", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "",
    allowedDomains: ["firma-x.de"],
    enabled: false,
  });
  assert.equal(parsed.success, false);
});

test("Domains leer → abgelehnt", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: [],
    enabled: false,
  });
  assert.equal(parsed.success, false);
});

test("Domains mit 10 Einträgen akzeptiert", () => {
  const tenDomains = Array.from({ length: 10 }, (_, i) => `d${i}.example.com`);
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: tenDomains,
    enabled: false,
  });
  assert.equal(parsed.success, true);
});

test("Domains mit 11 Einträgen abgelehnt", () => {
  const elevenDomains = Array.from(
    { length: 11 },
    (_, i) => `d${i}.example.com`,
  );
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: elevenDomains,
    enabled: false,
  });
  assert.equal(parsed.success, false);
});

test("Domain mit Leerzeichen im Inneren → abgelehnt", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: ["fir ma-x.de"],
    enabled: false,
  });
  assert.equal(parsed.success, false);
});

test("Domain mit @ → abgelehnt (das ist Email-Teil)", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: ["user@firma-x.de"],
    enabled: false,
  });
  assert.equal(parsed.success, false);
});

test("Domain mit Underscore → abgelehnt", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: ["firma_x.de"],
    enabled: false,
  });
  assert.equal(parsed.success, false);
});

test("Domain ohne Punkt (keine TLD) → abgelehnt", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: ["localhost"],
    enabled: false,
  });
  assert.equal(parsed.success, false);
});

test("Subdomain akzeptiert (explizit listen)", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: ["mail.firma-x.de"],
    enabled: false,
  });
  assert.equal(parsed.success, true);
});

test("Domain wird getrimmt + auf lowercase normalisiert", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: ["  FIRMA-X.DE  "],
    enabled: false,
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.deepEqual(parsed.data.allowedDomains, ["firma-x.de"]);
});

test("enabled fehlt → abgelehnt", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: ["firma-x.de"],
  });
  assert.equal(parsed.success, false);
});

test("enabled als String statt Boolean → abgelehnt (kein Coerce)", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: ["firma-x.de"],
    enabled: "true",
  });
  assert.equal(parsed.success, false);
});

test("mehrere Domains akzeptiert", () => {
  const parsed = ssoConfigSchema.safeParse({
    tenantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    allowedDomains: ["firma-x.de", "firma-x.com", "firma-x.at"],
    enabled: true,
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.allowedDomains.length, 3);
});
