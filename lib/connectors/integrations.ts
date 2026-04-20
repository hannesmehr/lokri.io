/**
 * CRUD für `connector_integrations`.
 *
 * Scope:
 *   - Klartext-Credentials nehmen wir nur bei `create`/`updateCredentials`
 *     entgegen und verschlüsseln sie hier. Die Public-API gibt *nie*
 *     Klartext zurück — `getIntegration` + `listIntegrations` liefern
 *     den verschlüsselten Envelope. Caller, die die Credentials
 *     tatsächlich brauchen (Provider, Test-Flow), entschlüsseln
 *     punktuell per `decryptConnectorCredentials`.
 *
 *   - Authorization machen wir hier NICHT. Die API-Route (Team-Admin-
 *     Check) ist dafür zuständig. Hier gehen wir davon aus: wer
 *     aufruft, darf.
 *
 *   - `updateError` / `clearError` sind separate Helper, weil der
 *     Gateway (Block 2) diese aus dem Pipeline-Handler aufruft — nicht
 *     aus einem User-Flow.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connectorIntegrations } from "@/lib/db/schema";
import { encryptConnectorCredentials } from "./encryption";
import type {
  ConnectorAuthType,
  ConnectorIntegration,
} from "./types";

export interface CreateIntegrationInput {
  ownerAccountId: string;
  connectorType: string;
  displayName: string;
  authType: ConnectorAuthType;
  /** Plain credentials — werden hier verschlüsselt. Shape ist
   *  connector-spezifisch (z.B. `{ email, pat }` für Confluence). */
  credentials: unknown;
  /** Plain config (nicht verschlüsselt) — z.B. `{ siteUrl }`. */
  config: Record<string, unknown>;
  enabled?: boolean;
}

export async function createIntegration(
  input: CreateIntegrationInput,
): Promise<ConnectorIntegration> {
  const [row] = await db
    .insert(connectorIntegrations)
    .values({
      ownerAccountId: input.ownerAccountId,
      connectorType: input.connectorType,
      displayName: input.displayName,
      authType: input.authType,
      credentialsEncrypted: encryptConnectorCredentials(input.credentials),
      config: input.config,
      enabled: input.enabled ?? true,
    })
    .returning();
  return row;
}

export async function getIntegration(
  id: string,
): Promise<ConnectorIntegration | null> {
  const [row] = await db
    .select()
    .from(connectorIntegrations)
    .where(eq(connectorIntegrations.id, id))
    .limit(1);
  return row ?? null;
}

export async function getIntegrationForAccount(
  id: string,
  ownerAccountId: string,
): Promise<ConnectorIntegration | null> {
  const [row] = await db
    .select()
    .from(connectorIntegrations)
    .where(
      and(
        eq(connectorIntegrations.id, id),
        eq(connectorIntegrations.ownerAccountId, ownerAccountId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listIntegrations(
  ownerAccountId: string,
): Promise<ConnectorIntegration[]> {
  return db
    .select()
    .from(connectorIntegrations)
    .where(eq(connectorIntegrations.ownerAccountId, ownerAccountId))
    .orderBy(desc(connectorIntegrations.createdAt));
}

export interface UpdateIntegrationInput {
  displayName?: string;
  config?: Record<string, unknown>;
  enabled?: boolean;
}

export async function updateIntegration(
  id: string,
  updates: UpdateIntegrationInput,
): Promise<ConnectorIntegration | null> {
  const [row] = await db
    .update(connectorIntegrations)
    .set({
      ...(updates.displayName !== undefined
        ? { displayName: updates.displayName }
        : {}),
      ...(updates.config !== undefined ? { config: updates.config } : {}),
      ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
    })
    .where(eq(connectorIntegrations.id, id))
    .returning();
  return row ?? null;
}

/** Rotiert Credentials — separate Funktion, damit der Teiländerungs-
 *  Pfad klar vom Rotations-Pfad abgegrenzt ist (Audit-Trail, UX). */
export async function updateIntegrationCredentials(
  id: string,
  credentials: unknown,
): Promise<ConnectorIntegration | null> {
  const [row] = await db
    .update(connectorIntegrations)
    .set({
      credentialsEncrypted: encryptConnectorCredentials(credentials),
      // Rotation setzt den Error-State zurück: neues Token ⇒ frisch.
      lastError: null,
    })
    .where(eq(connectorIntegrations.id, id))
    .returning();
  return row ?? null;
}

export async function markIntegrationTested(
  id: string,
  ok: boolean,
  error?: string | null,
): Promise<void> {
  await db
    .update(connectorIntegrations)
    .set({
      lastTestedAt: new Date(),
      lastError: ok ? null : error ?? "Unknown error",
    })
    .where(eq(connectorIntegrations.id, id));
}

export async function recordIntegrationError(
  id: string,
  error: string,
): Promise<void> {
  await db
    .update(connectorIntegrations)
    .set({ lastError: error })
    .where(eq(connectorIntegrations.id, id));
}

export async function clearIntegrationError(id: string): Promise<void> {
  await db
    .update(connectorIntegrations)
    .set({ lastError: null })
    .where(eq(connectorIntegrations.id, id));
}

export async function deleteIntegration(id: string): Promise<void> {
  await db
    .delete(connectorIntegrations)
    .where(eq(connectorIntegrations.id, id));
}
