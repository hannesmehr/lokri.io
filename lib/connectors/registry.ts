/**
 * Connector-Registry — die eine Stelle, an der alle `ConnectorProvider`
 * bekannt sind.
 *
 * Design:
 *   - Module-level Map, kein DI-Container. Simpler Lookup.
 *   - `register()` idempotent mit Overwrite-Schutz: ein zweiter Register
 *     mit derselben ID wirft `ConnectorConfigError`. Verhindert, dass
 *     eine zweite Connector-Implementation still das Original überschreibt.
 *   - `get()` wirft bei unbekanntem Typ — der Gateway-Caller hat
 *     `connector_integrations.connector_type` gerade erst aus der DB
 *     gelesen, also sollte der Provider immer existieren. Exception ist
 *     angemessener als Null-Return.
 *   - `__resetForTests()` ist der Test-Escape-Hatch. Keine andere
 *     Möglichkeit, die Map zu leeren — Prod-Code soll sich nicht
 *     auf Reset-Fähigkeit verlassen.
 *
 * Registrierung passiert in `lib/connectors/index.ts` (kommt mit dem
 * ersten Connector in einem späteren Block). In Block 1 ist die Registry
 * leer — Tests nutzen Mock-Provider.
 */

import { ConnectorConfigError } from "./errors";
import type { ConnectorProvider } from "./provider";

const providers = new Map<string, ConnectorProvider>();

export function register(provider: ConnectorProvider): void {
  const id = provider.definition.id;
  if (providers.has(id)) {
    throw new ConnectorConfigError(
      `Connector "${id}" is already registered. Duplicate registration is refused to avoid silent overrides.`,
    );
  }
  providers.set(id, provider);
}

export function get(connectorType: string): ConnectorProvider {
  const provider = providers.get(connectorType);
  if (!provider) {
    throw new ConnectorConfigError(
      `No connector provider registered for "${connectorType}". ` +
        `Known: [${[...providers.keys()].join(", ") || "<none>"}].`,
    );
  }
  return provider;
}

export function has(connectorType: string): boolean {
  return providers.has(connectorType);
}

export function list(): ConnectorProvider[] {
  return [...providers.values()];
}

/**
 * Test-only: Leert die Registry. Niemals im Prod-Code aufrufen.
 * Der Unterstrich-Prefix signalisiert das API-Versprechen: kein
 * stabiles Contract.
 */
export function __resetForTests(): void {
  providers.clear();
}
