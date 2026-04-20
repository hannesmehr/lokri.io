/**
 * Zentraler Registration-Hook für alle konkreten Connector-Provider.
 *
 * Wird in Block 3 von einem Boot-Punkt (vermutlich `instrumentation.ts`)
 * einmal pro Prozess-Start aufgerufen. Hier in Block 2 (Confluence)
 * nur die Funktion — **kein Side-Effect-Call** auf Module-Load.
 *
 * Idempotenz:
 *   - `registered`-Flag verhindert Doppel-Registrierung bei Hot-Reload
 *     oder Test-Szenarien, die den Hook mehrfach aufrufen
 *   - Die Registry selbst throwt bei Duplicate-Register — das Flag
 *     fängt das ab, bevor die Exception fliegt
 *
 * Wenn in späteren Blöcken weitere Provider (Slack, GitHub, …) dazu
 * kommen, registrieren sie sich hier in der gleichen Funktion. Eine
 * Datei pro Provider zu importieren hält den Aufruf-Graph klar.
 */

import { register as registerConnectorProvider } from "@/lib/connectors/registry";
import { ConfluenceCloudProvider } from "./confluence-cloud";

let registered = false;

export function registerAllProviders(): void {
  if (registered) return;
  registered = true;
  registerConnectorProvider(new ConfluenceCloudProvider());
}

/** Test-only: setzt das `registered`-Flag zurück, damit Tests den
 *  Hook erneut aufrufen können. Nicht in Prod-Code verwenden. */
export function __resetProvidersForTests(): void {
  registered = false;
}
