/**
 * Next.js instrumentation hook — läuft einmal pro Server-Instance
 * beim Start. Stable seit Next 15.
 *
 * **Runtime-Guard ist pflicht.** Next instanziiert die instrumentation
 * in *beiden* Runtimes (Node + Edge). Unser Connector-Provider-Graph
 * zieht `lib/storage/encryption.ts` → `node:crypto` (scrypt, AES-GCM
 * via `createCipheriv`) — das existiert in der Edge-Runtime nicht.
 * Ohne Guard bricht der Vercel-Build beim Edge-Bundle mit
 * „edge runtime does not support Node.js 'crypto' module".
 *
 * Lösung:
 *   1. Frühes `return` wenn `NEXT_RUNTIME !== 'nodejs'`. Next macht
 *      Dead-Code-Elimination auf diese Condition — der gesamte
 *      Import-Subgraph hinter dem Guard wird aus dem Edge-Bundle
 *      gestrippt.
 *   2. Dynamischer `await import(...)` statt statischem Top-Level-
 *      Import. Verstärkt die DCE — Edge-Bundler sieht den Providers-
 *      Pfad gar nicht erst als Modul-Dependency.
 *
 * Consequence: Edge-Workers haben eine leere Connector-Registry. Das
 * ist für uns ok — MCP-Endpoints laufen in Node-Runtime (sie brauchen
 * DB + Encryption). Middleware + statische Routen, die eventuell in
 * Edge laufen, nutzen das Connector-Framework nicht.
 *
 * Idempotenz: `registerAllProviders()` hat einen Flag gegen Doppel-
 * Registrierung. Falls Next den Hook mehrfach triggert (Hot-Reload),
 * wird der zweite Call zum No-Op.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { registerAllProviders } = await import(
    "@/lib/connectors/providers/register"
  );
  registerAllProviders();
}
