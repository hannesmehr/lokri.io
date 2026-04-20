/**
 * Next.js instrumentation hook — läuft einmal pro Server-Instance
 * beim Start (Node + Edge Runtime; siehe
 * `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md`).
 *
 * Aktuell nutzen wir den Hook ausschliesslich, um die Connector-
 * Framework-Registry zu befüllen. Weiteren Start-Side-Effect-Code
 * hier nicht rein — OTel, DB-Migrations-Checks, etc. bekommen ggf.
 * später ihre eigene Zeile in `register()`, aber jeweils klein und
 * ohne Scope-Creep.
 *
 * `registerAllProviders()` ist idempotent (Flag im Modul), darum
 * spielt es keine Rolle, wenn Next die Instrumentation in Node- und
 * Edge-Runtime separat initialisiert — die Registry ist pro Modul-
 * Context ein Singleton, und die Funktion blockt Doppel-Registrierung.
 *
 * Confluence-Cloud-Provider ist pures fetch/URL-Code — kein DB-
 * Touch. Das macht ihn in beiden Runtimes safe, auch wenn Edge-
 * Worker nur minimale Module laden dürfen.
 */

import { registerAllProviders } from "@/lib/connectors/providers/register";

export function register() {
  registerAllProviders();
}
