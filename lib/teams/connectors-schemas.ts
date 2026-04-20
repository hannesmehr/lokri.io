/**
 * Zod-Schemas für die Team-Connector-Admin-API-Routen.
 *
 * Schemas landen hier (nicht in `lib/connectors/*`) weil sie die
 * HTTP-Layer-spezifische Shape tragen (snake_case Keys, Request-Body-
 * Shape mit `connector_type`-Discriminator, Ownership-Felder). Die
 * Provider-internen Schemas (`confluenceCloudCredentialsSchema` etc.)
 * sind zu technisch für Frontend-Validation.
 *
 * **Credentials-Discriminator:** `connector_type` bestimmt das Shape
 * von `credentials` + `config`. Aktuell nur `confluence-cloud`; Slack/
 * GitHub kommen mit eigenen Branches in die discriminated union.
 */

import { z } from "zod";
import { confluenceCloudConfigSchema } from "@/lib/connectors/providers/confluence-cloud/config";
import { confluenceCloudCredentialsSchema } from "@/lib/connectors/providers/confluence-cloud/credentials";

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

const displayNameSchema = z.string().trim().min(1).max(100);

/** Scope-Eintrag, wie er vom Client kommt (snake_case). */
export const connectorScopeInputSchema = z.object({
  scope_type: z.literal("confluence-space"),
  scope_identifier: z.string().min(1).max(200),
  scope_metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});
export type ConnectorScopeInput = z.infer<typeof connectorScopeInputSchema>;

/** Mapping im Setup-Request: referenziert Scope per Identifier, nicht
 *  per ID (die ID gibt es noch nicht, wenn die Integration pre-persist
 *  ist). Server resolved Identifier → ID nach Scope-Insert. */
export const connectorMappingInputSchema = z.object({
  space_id: z.string().uuid(),
  scope_identifier: z.string().min(1).max(200),
});
export type ConnectorMappingInput = z.infer<typeof connectorMappingInputSchema>;

// ---------------------------------------------------------------------------
// POST /connectors — atomar anlegen (integration + scopes + mappings)
// ---------------------------------------------------------------------------

/**
 * Per-connector-Type-Branch. Discriminated-union auf `connector_type`.
 * Neue Typen bekommen eigenen Branch mit ihren credentials/config-
 * Schemas.
 */
const confluenceCloudCreateBranch = z.object({
  connector_type: z.literal("confluence-cloud"),
  display_name: displayNameSchema,
  credentials: confluenceCloudCredentialsSchema,
  config: confluenceCloudConfigSchema,
});

export const createIntegrationSchema = z
  .discriminatedUnion("connector_type", [confluenceCloudCreateBranch])
  .and(
    z.object({
      scopes: z.array(connectorScopeInputSchema).min(1).max(500),
      mappings: z.array(connectorMappingInputSchema).max(500).default([]),
    }),
  );
export type CreateIntegrationInput = z.infer<typeof createIntegrationSchema>;

// ---------------------------------------------------------------------------
// PATCH /connectors/[id] — partial update (display_name, enabled)
// ---------------------------------------------------------------------------

export const patchIntegrationSchema = z
  .object({
    display_name: displayNameSchema.optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.display_name !== undefined || data.enabled !== undefined,
    { message: "At least one field must be provided" },
  );
export type PatchIntegrationInput = z.infer<typeof patchIntegrationSchema>;

// ---------------------------------------------------------------------------
// PUT /connectors/[id]/credentials — Credentials-Rotation
// ---------------------------------------------------------------------------

const confluenceCloudCredentialsRotateBranch = z.object({
  connector_type: z.literal("confluence-cloud"),
  credentials: confluenceCloudCredentialsSchema,
  config: confluenceCloudConfigSchema,
});

export const rotateCredentialsSchema = z.discriminatedUnion(
  "connector_type",
  [confluenceCloudCredentialsRotateBranch],
);
export type RotateCredentialsInput = z.infer<typeof rotateCredentialsSchema>;

// ---------------------------------------------------------------------------
// POST /connectors/validate — pre-persist test + discover in einem Aufruf
// ---------------------------------------------------------------------------

const confluenceCloudValidateBranch = z.object({
  connector_type: z.literal("confluence-cloud"),
  credentials: confluenceCloudCredentialsSchema,
  config: confluenceCloudConfigSchema,
});

export const validateCredentialsSchema = z.discriminatedUnion(
  "connector_type",
  [confluenceCloudValidateBranch],
);
export type ValidateCredentialsInput = z.infer<
  typeof validateCredentialsSchema
>;

// ---------------------------------------------------------------------------
// PUT /connectors/[id]/scopes — replace-all allowlist
// ---------------------------------------------------------------------------

export const replaceScopesSchema = z.object({
  scopes: z.array(connectorScopeInputSchema).min(1).max(500),
});
export type ReplaceScopesInput = z.infer<typeof replaceScopesSchema>;

// ---------------------------------------------------------------------------
// POST /connectors/[id]/mappings — einzelnes Mapping hinzufügen
// ---------------------------------------------------------------------------

export const addMappingSchema = z.object({
  space_id: z.string().uuid(),
  /** Referenz via Identifier — der Scope muss bereits in der
   *  Allowlist sein, sonst 400. */
  scope_identifier: z.string().min(1).max(200),
});
export type AddMappingInput = z.infer<typeof addMappingSchema>;
