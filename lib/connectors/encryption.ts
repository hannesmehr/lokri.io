/**
 * Dünner Wrapper um `lib/storage/encryption.ts` für Connector-Credentials.
 *
 * Bewusst **keine** eigene Cipher-Logik — wir nutzen exakt denselben
 * `v1:<base64(salt ‖ iv ‖ tag ‖ ciphertext)>`-Envelope wie
 * `storage_providers.config_encrypted` und `embedding_keys.
 * config_encrypted`. Ein zweiter Cipher-Pfad hätte nur die Angriffs-
 * und Bug-Fläche vergrössert, ohne Mehrwert.
 *
 * Die Funktionen hier existieren aus zwei Gründen:
 *   1. Named Import-Signatur am Call-Site — `encryptConnectorCredentials`
 *      liest klarer als `encryptJson` an einer Stelle, die mit S3-
 *      Credentials nichts zu tun hat.
 *   2. TypeScript-Enge — Generic-Parameter bindet an das Connector-
 *      Credential-Shape pro Connector-Typ (z.B. Confluence PAT wird
 *      als `{ email, pat }` entschlüsselt).
 *
 * Wenn wir je einen connector-spezifischen Cipher brauchen sollten
 * (z.B. HSM-gestützt für Enterprise), lebt die Entscheidung dann hier
 * und nicht verstreut über die Provider.
 */

import {
  decryptJson,
  encryptJson,
} from "@/lib/storage/encryption";

export function encryptConnectorCredentials(plaintext: unknown): string {
  return encryptJson(plaintext);
}

export function decryptConnectorCredentials<T = unknown>(
  encrypted: string,
): T {
  return decryptJson<T>(encrypted);
}
