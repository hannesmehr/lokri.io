/**
 * Der Wrapper delegiert an `lib/storage/encryption.ts`. Die Tests
 * prüfen genau das:
 *   1. Round-Trip-Kompatibilität (was reingeht kommt raus)
 *   2. Envelope-Format matched das Storage-/Embedding-Key-Format
 *      (Prefix `v1:`) — so bleibt der Shared-Helper-Contract sichtbar,
 *      falls jemand versucht, das hier mit Custom-Cipher zu forken.
 *   3. Integrität (Tamper führt zu Decrypt-Fehler)
 */

// Der storage/encryption-Helper braucht einen Master-Secret. In Tests
// setzen wir einen statischen Wert, bevor das Modul geladen wird.
process.env.STORAGE_CONFIG_KEY =
  process.env.STORAGE_CONFIG_KEY ??
  "test-secret-for-connector-encryption-roundtrip-only";

import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptConnectorCredentials,
  encryptConnectorCredentials,
} from "@/lib/connectors/encryption";

test("encrypt/decrypt round-trips arbitrary JSON payloads", () => {
  const credentials = {
    email: "jane@empro.ch",
    pat: "ATATT3x…",
    nested: { apiVersion: 2, flags: [true, false] },
  };
  const blob = encryptConnectorCredentials(credentials);
  const restored =
    decryptConnectorCredentials<typeof credentials>(blob);
  assert.deepEqual(restored, credentials);
});

test("encrypted envelope uses shared v1: prefix", () => {
  const blob = encryptConnectorCredentials({ pat: "x" });
  assert.match(
    blob,
    /^v1:/,
    "Connector credentials must use the same envelope version as storage/embedding keys",
  );
});

test("different calls produce different ciphertext for the same input", () => {
  // Salt + IV are random — two consecutive encrypts must not collide,
  // otherwise we'd leak "same credential reused" via ciphertext equality.
  const a = encryptConnectorCredentials({ pat: "same" });
  const b = encryptConnectorCredentials({ pat: "same" });
  assert.notEqual(a, b);
});

test("tampered ciphertext fails to decrypt (GCM auth tag catches it)", () => {
  const blob = encryptConnectorCredentials({ pat: "secret" });
  // Flip a single character in the base64-Teil (nach `v1:`).
  const tampered = `${blob.slice(0, -4)}AAAA`;
  assert.throws(() => decryptConnectorCredentials(tampered));
});
