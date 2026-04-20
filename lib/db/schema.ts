import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const ownerAccountTypeEnum = pgEnum("owner_account_type", [
  "personal",
  "team",
]);

/**
 * Role enum used by both `owner_account_members` (team-level) and
 * `space_members` (per-space ACL).
 *
 * Modern values: `owner | admin | member | viewer`.
 *
 * Legacy values `editor` and `reader` stay in the enum for backwards-compat
 * with existing `space_members` rows. At the application layer they are
 * aliased (`editor ≙ member`, `reader ≙ viewer`) via
 * `normalizeLegacyRole` in `lib/auth/roles.ts`. New `owner_account_members`
 * rows should always use the modern values.
 */
export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "editor",
  "reader",
  "admin",
  "member",
  "viewer",
]);

/**
 * SSO-Provider für Team-basierte Single-Sign-On-Konfiguration.
 *
 * Phase 1: nur `entra` (Microsoft Entra ID). Google Workspace und
 * ggf. SAML folgen in späteren Phasen — der Enum wird dann erweitert
 * (Drizzle `ALTER TYPE ADD VALUE`, non-breaking).
 */
export const ssoProviderEnum = pgEnum("sso_provider", ["entra"]);

// ---------------------------------------------------------------------------
// Better-Auth tables (plural naming per project spec)
//
// Field names use Better-Auth's expected camelCase so the Drizzle adapter
// picks them up without explicit remapping. Column names are snake_case.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // Added by the better-auth `twoFactor` plugin. Defaults to false;
  // flipped to true after the user finishes TOTP enrollment.
  twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
  /**
   * Manual beta-gate for team creation. Flipped via SQL by an admin
   * (`UPDATE users SET can_create_teams = true WHERE email = ?`). The
   * "Create team" button in the account switcher is only rendered when
   * this is true. Self-service + payment lands in a later release.
   */
  canCreateTeams: boolean("can_create_teams").notNull().default(false),
  /**
   * Last owner_account the user switched to via the account switcher.
   * Null → fall back to their personal account. FK set-null so deleting
   * a team transparently kicks the user back to personal.
   */
  activeOwnerAccountId: uuid("active_owner_account_id").references(
    () => ownerAccounts.id,
    { onDelete: "set null" },
  ),
  /**
   * User-chosen UI language. Wins over the browser `Accept-Language`
   * header. Null → no preference yet; resolver falls back to cookie
   * then to the header. Values are the `Locale` strings from
   * `lib/i18n/config.ts`; we keep the column as plain text to avoid an
   * enum migration every time we add a language.
   */
  preferredLocale: text("preferred_locale"),
  /**
   * Backoffice flag — gates every route under `app/(admin)/` and
   * `app/api/admin/*`. Flipped manually via SQL (`UPDATE users SET
   * is_admin = true WHERE email = …`). Never exposed to users
   * themselves; checked server-side via `requireAdminSession`.
   */
  isAdmin: boolean("is_admin").notNull().default(false),
  /**
   * Soft-disable marker. Non-null ⇒ the user is locked out:
   * `requireSession` rejects, Better-Auth `beforeSignIn` hook blocks
   * new sessions. The timestamp itself is admin-facing (audit +
   * "disabled since") — we don't key enforcement off the value, only
   * off its presence.
   */
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

// NOTE: This is Better-Auth's own "accounts" table for auth providers
// (email/password + OAuth). Not to be confused with `owner_accounts` below,
// which is our tenancy layer.
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

// Added by the better-auth `twoFactor` plugin. TOTP secret + backup codes are
// stored here; the returned:false flag on the plugin fields means the adapter
// never serialises them into API responses.
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("two_factor_user_id_idx").on(t.userId),
    index("two_factor_secret_idx").on(t.secret),
  ],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Better-Auth `mcp` plugin tables — OAuth 2.1 / OIDC provider for MCP clients.
// Field names match the plugin's declared schema (see
// better-auth/dist/plugins/mcp). Drizzle adapter maps camelCase → snake_case.
// ---------------------------------------------------------------------------

export const oauthApplication = pgTable(
  "oauth_application",
  {
    id: text("id").primaryKey(),
    // Better-Auth's mcp plugin passes `DEFAULT` for `name` when a DCR client
    // omits `client_name` (RFC 7591 allows that). We keep this nullable so
    // those requests succeed; the UI falls back to `client_id` for display.
    name: text("name"),
    icon: text("icon"),
    metadata: text("metadata"),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    redirectUrls: text("redirect_urls").notNull(),
    type: text("type").notNull(),
    disabled: boolean("disabled").notNull().default(false),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index("oauth_application_user_id_idx").on(t.userId)],
);

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    accessToken: text("access_token").notNull().unique(),
    refreshToken: text("refresh_token").notNull().unique(),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }).notNull(),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }).notNull(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("oauth_access_token_client_id_idx").on(t.clientId),
    index("oauth_access_token_user_id_idx").on(t.userId),
  ],
);

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    scopes: text("scopes").notNull(),
    consentGiven: boolean("consent_given").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("oauth_consent_client_id_idx").on(t.clientId),
    index("oauth_consent_user_id_idx").on(t.userId),
  ],
);

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // e.g. "free", "starter", "pro", "team"
  name: text("name").notNull(),
  description: text("description"),
  /**
   * Base per-account limits. When `isSeatBased` is true, the effective
   * limit at runtime is `maxBytes × seatCount` etc. (see `lib/quota.ts`).
   */
  maxBytes: bigint("max_bytes", { mode: "number" }).notNull(),
  maxFiles: integer("max_files").notNull(),
  maxNotes: integer("max_notes").notNull(),
  // Legacy column — kept so we don't have to drop it. New code uses cents
  // for correct decimal arithmetic.
  priceEurMonthly: integer("price_eur_monthly").notNull().default(0),
  priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
  priceYearlyCents: integer("price_yearly_cents").notNull().default(0),
  /**
   * Team/seat-priced plans multiply limits by active seat count and use
   * the `pricePerSeat*` columns instead of the flat `priceMonthly*`
   * columns. Single-seat plans (`free`, `starter`, `pro`, `business`)
   * stay `false`.
   */
  isSeatBased: boolean("is_seat_based").notNull().default(false),
  /** Null unless `isSeatBased` — otherwise in EUR cents per seat. */
  pricePerSeatMonthlyCents: integer("price_per_seat_monthly_cents"),
  pricePerSeatYearlyCents: integer("price_per_seat_yearly_cents"),
  /** Display order in the pricing table (ascending). */
  sortOrder: integer("sort_order").notNull().default(0),
  /**
   * False for `free`/deprecated tiers and for the `team` plan in V1
   * (teams are manually provisioned — no self-service checkout yet).
   */
  isPurchasable: boolean("is_purchasable").notNull().default(false),
});

// ---------------------------------------------------------------------------
// Owner Accounts (tenancy layer — prepared for teams in V2)
// ---------------------------------------------------------------------------

export const ownerAccounts = pgTable(
  "owner_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: ownerAccountTypeEnum("type").notNull().default("personal"),
    name: text("name").notNull(),
    /**
     * URL-safe, globally-unique handle for this account. Used as the team
     * identifier in `/api/mcp/team/[slug]` (so OAuth-MCP sessions can
     * target a specific team's connector integrations) and reserved for
     * future user-facing routes like `/team/[slug]/...`.
     *
     * **Immutable after creation.** Renaming the account does NOT re-slug —
     * MCP clients cache registrations keyed by URL, so a slug change would
     * silently break existing Claude-Desktop/Cursor configs. If a user
     * ever needs to "rename" the slug, we make them delete + recreate the
     * team.
     *
     * Backfilled from `name` via `slugifyOwnerAccountName` (lib/teams/slug.ts)
     * in migration 0020; new rows get a slug computed the same way at
     * insert time, with a numeric suffix on collision.
     */
    slug: text("slug").notNull(),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    /**
     * When the current paid plan expires. NULL means free plan (no expiry).
     * On expiry, quota helpers fall back to the free plan's limits but do
     * NOT touch the `plan_id` field (which stays as the last-paid tier for
     * accurate invoice history). A user can re-renew any time; on successful
     * capture, this is bumped by one billing period from `now()` (or from
     * the old expiry, if still in the future — i.e. grace stacking).
     */
    planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
    /** Last successful renewal — for UI ("zuletzt verlängert am …"). */
    planRenewedAt: timestamp("plan_renewed_at", { withTimezone: true }),
    /**
     * Admin-Override der Plan-Limits. Wenn gesetzt (eines oder mehrere
     * Felder), ersetzt der entsprechende Wert das Plan-Limit in
     * `getQuota` — auch nach Seat-Multiplikation bei Team-Plänen.
     *
     * Format: `{ bytes?: number; files?: number; notes?: number }`.
     * Wird vom Admin-Panel gepflegt; im Audit landet ein `admin.account.
     * quota_override_set`-Event mit diff.
     */
    quotaOverride: jsonb("quota_override").$type<{
      bytes?: number;
      files?: number;
      notes?: number;
    } | null>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("owner_accounts_plan_id_idx").on(t.planId),
    uniqueIndex("owner_accounts_slug_idx").on(t.slug),
  ],
);

/**
 * Per-account named storage providers. The internal Vercel Blob backend is
 * implicit (no row) and always available; rows here describe BYO-S3
 * endpoints the user added. Mapping semantics:
 *
 *   - `spaces.storage_provider_id` set → that provider is used for uploads
 *     into this space (regardless of account default).
 *   - else, `files` default to the internal Vercel Blob.
 *   - `files.storage_provider_id` records which row a specific file was
 *     stored with; reads/deletes honour that, so existing files remain
 *     reachable even after a provider is deleted (we lock deletion if any
 *     file still references it).
 */
export const storageProviderTypeEnum = pgEnum("storage_provider_type", [
  "s3",
  "github",
]);

/**
 * BYO-API-Key embeddings. One row per owner account. When present, the
 * embedding pipeline skips the Vercel AI Gateway and calls the upstream
 * provider directly with the user's key — cheaper for us, auditable for
 * them, useful for DSGVO-strict deployments that don't want a US-hosted
 * router in the path.
 *
 * The model must emit 1536-dim vectors — that's the hard-coded width of
 * `notes.embedding` + `file_chunks.embedding` (pgvector HNSW index). If we
 * ever want 3072-dim `text-embedding-3-large`, we have to add a second
 * set of columns + re-embed everything.
 */
export const embeddingProviderTypeEnum = pgEnum("embedding_provider_type", [
  "openai",
]);

export const storageProviders = pgTable(
  "storage_providers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    /** User-visible label — e.g. "Mein R2 Bucket". Unique per account. */
    name: text("name").notNull(),
    type: storageProviderTypeEnum("type").notNull(),
    /**
     * AES-256-GCM-encrypted JSON for the provider. Schema depends on `type`:
     *  - s3: `{ endpoint?, region, bucket, accessKeyId, secretAccessKey, pathPrefix?, forcePathStyle? }`
     * Decryption key from `STORAGE_CONFIG_KEY` (fallback `BETTER_AUTH_SECRET`).
     */
    configEncrypted: text("config_encrypted").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("storage_providers_owner_account_id_idx").on(t.ownerAccountId),
    uniqueIndex("storage_providers_owner_account_name_idx").on(
      t.ownerAccountId,
      t.name,
    ),
  ],
);

export const embeddingKeys = pgTable(
  "embedding_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    provider: embeddingProviderTypeEnum("provider").notNull(),
    /** Provider-specific model id, e.g. `"text-embedding-3-small"`. */
    model: text("model").notNull(),
    /** AES-256-GCM-encrypted JSON `{ apiKey }`. Same key-derivation as storage. */
    configEncrypted: text("config_encrypted").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    // One key per account — simpler than N + default. Users who want to
    // rotate upload a new key; the row is replaced.
    uniqueIndex("embedding_keys_owner_account_id_idx").on(t.ownerAccountId),
  ],
);

export const ownerAccountMembers = pgTable(
  "owner_account_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull(),
    /**
     * Who invited this member. Null for the initial `owner` row (they
     * created the team) and for members added before the invite flow
     * existed. FK set-null so deleting the inviter doesn't tear down
     * membership.
     */
    invitedByUserId: text("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("owner_account_members_account_id_idx").on(t.ownerAccountId),
    index("owner_account_members_user_id_idx").on(t.userId),
    uniqueIndex("owner_account_members_unique_idx").on(
      t.ownerAccountId,
      t.userId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Team invites (Magic-Link invitation flow)
//
// One row per outstanding email invite into a team. Token is hashed with
// bcrypt — the raw token (`inv_…`) lives only in the email that was sent
// out. Invites expire after 7 days by default; the `/invites/accept` route
// validates against the current state (not accepted, not revoked, not
// expired) before materialising the membership.
// ---------------------------------------------------------------------------

export const teamInvites = pgTable(
  "team_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    /** The invitee's email — used for display and as an identity claim
     *  (must match the accepting user's email on `acceptInvite`). */
    email: text("email").notNull(),
    /** Role the invitee will receive on accept. `owner` is not allowed
     *  here — ownership transfer is a separate flow. */
    role: memberRoleEnum("role").notNull(),
    /** bcrypt hash of the raw `inv_…` token. Lookups iterate pending
     *  rows and compare — same pattern as `api_tokens`. */
    tokenHash: text("token_hash").notNull().unique(),
    invitedByUserId: text("invited_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("team_invites_owner_account_id_idx").on(t.ownerAccountId),
    // Partial unique — only one pending invite per (account, email) at a
    // time. Accepted/revoked rows stay around for history and don't block
    // re-inviting the same address later.
    uniqueIndex("team_invites_pending_unique_idx")
      .on(t.ownerAccountId, t.email)
      .where(sql`accepted_at IS NULL AND revoked_at IS NULL`),
  ],
);

// ---------------------------------------------------------------------------
// API Tokens (Bearer tokens for MCP)
// ---------------------------------------------------------------------------

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(), // e.g. "Claude Desktop"
    tokenHash: text("token_hash").notNull().unique(),
    tokenPrefix: text("token_prefix").notNull(), // e.g. "lk_abc..."
    /**
     * `personal` = bound to the creating user; revoked automatically when
     * that user is removed from the team. `team` = account-scoped, survives
     * member churn (only `owner`/`admin` may create). Legacy tokens default
     * to `personal` (backfilled via migration 0014).
     */
    scopeType: text("scope_type").notNull().default("personal"),
    /**
     * Set for `scope_type = 'personal'` tokens so we can revoke the exact
     * rows when the member leaves. Null for team-scoped tokens and for
     * pre-0014 rows where the attribution was lost (those stay valid but
     * can't be auto-revoked on member removal).
     */
    createdByUserId: text("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * Null / empty = token has access to all spaces. Otherwise an array of
     * space UUIDs the token may read/write. Tools enforce this on every
     * call via the owner-account-scoped query.
     */
    spaceScope: uuid("space_scope").array(),
    /** True = mutation tools refuse (create/update/delete/upload/reindex/etc). */
    readOnly: boolean("read_only").notNull().default(false),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("api_tokens_account_id_idx").on(t.ownerAccountId)],
);

// ---------------------------------------------------------------------------
// Spaces
// ---------------------------------------------------------------------------

export const spaces = pgTable(
  "spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    /**
     * Space-scoped storage override. When set, uploads into this space land
     * on this provider instead of the internal Vercel Blob. Delete
     * cascades to `set null` so removing a provider doesn't orphan the
     * space, just reverts it to the internal default.
     */
    storageProviderId: uuid("storage_provider_id").references(
      () => storageProviders.id,
      { onDelete: "set null" },
    ),
    /**
     * Relative keys (to the provider's `pathPrefix`) that the user has
     * explicitly hidden from this space's external browser. Small array
     * kept inline on the row — no separate table until we need richer
     * metadata per override.
     */
    hiddenExternalKeys: text("hidden_external_keys")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("spaces_account_id_idx").on(t.ownerAccountId),
    index("spaces_storage_provider_id_idx").on(t.storageProviderId),
  ],
);

// Prep for V1.3 sharing. In MVP, exactly one row per space with role="owner"
// auto-created on space insert.
export const spaceMembers = pgTable(
  "space_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    role: memberRoleEnum("role").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("space_members_space_id_idx").on(t.spaceId),
    index("space_members_account_id_idx").on(t.ownerAccountId),
    uniqueIndex("space_members_unique_idx").on(t.spaceId, t.ownerAccountId),
  ],
);

// ---------------------------------------------------------------------------
// Files + chunks (with embeddings)
// ---------------------------------------------------------------------------

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").references(() => spaces.id, {
      onDelete: "set null",
    }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /**
     * Points at the row in `storage_providers` for S3-backed files. Null for
     * files on the internal Vercel Blob — the absence of a row discriminates.
     * `on delete restrict` so users can't delete a provider while files
     * still reference it; the UI forces a migrate-or-delete-files step.
     */
    storageProviderId: uuid("storage_provider_id").references(
      () => storageProviders.id,
      { onDelete: "restrict" },
    ),
    storageKey: text("storage_key").notNull(),
    /**
     * When `true`, MCP tools (`search`, `fetch`, `list_files`,
     * `get_file_content`) skip this file. The file is still visible in the
     * web UI — this is explicit "don't show to AI" marking.
     */
    mcpHidden: boolean("mcp_hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("files_account_id_idx").on(t.ownerAccountId),
    index("files_space_id_idx").on(t.spaceId),
    index("files_storage_provider_id_idx").on(t.storageProviderId),
  ],
);

export const fileChunks = pgTable(
  "file_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    contentText: text("content_text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    embeddingModel: text("embedding_model").notNull(),
  },
  (t) => [
    index("file_chunks_file_id_idx").on(t.fileId),
    index("file_chunks_embedding_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

// ---------------------------------------------------------------------------
// Notes (with embeddings)
// ---------------------------------------------------------------------------

export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    spaceId: uuid("space_id").references(() => spaces.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    contentText: text("content_text").notNull(),
    embedding: vector("embedding", { dimensions: 1536 }),
    embeddingModel: text("embedding_model").notNull(),
    /** See `files.mcp_hidden` — same semantics. */
    mcpHidden: boolean("mcp_hidden").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("notes_account_id_idx").on(t.ownerAccountId),
    index("notes_space_id_idx").on(t.spaceId),
    index("notes_embedding_hnsw_idx").using(
      "hnsw",
      t.embedding.op("vector_cosine_ops"),
    ),
  ],
);

// ---------------------------------------------------------------------------
// Usage quota (one row per owner_account)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Billing
// ---------------------------------------------------------------------------

export const billingPeriodEnum = pgEnum("billing_period", [
  "monthly",
  "yearly",
]);

export const orderStatusEnum = pgEnum("order_status", [
  "created",
  "captured",
  "refunded",
  "failed",
]);

/**
 * One row per PayPal Order (created). Captured orders unlock the associated
 * plan for the purchased period and generate an `invoices` row. Idempotency
 * lives on `payment_id` (PayPal Capture ID).
 */
export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    period: billingPeriodEnum("period").notNull(),
    /** Amount actually charged, in EUR cents. Matches PayPal capture. */
    amountCents: integer("amount_cents").notNull(),
    /** PayPal's `order.id` — returned on create. Not unique (one retry possible). */
    paypalOrderId: text("paypal_order_id").notNull(),
    /** PayPal Capture ID — unique once captured. Null for uncaptured orders. */
    paymentId: text("payment_id").unique(),
    status: orderStatusEnum("status").notNull().default("created"),
    capturedAt: timestamp("captured_at", { withTimezone: true }),
    /** Billing window this purchase opens. */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("orders_owner_account_id_idx").on(t.ownerAccountId),
    index("orders_user_id_idx").on(t.userId),
    index("orders_paypal_order_id_idx").on(t.paypalOrderId),
  ],
);

/**
 * Generated PDF invoices, one per captured order. Invoice numbers are
 * sequential per year: `LK-YYYY-NNNN`. PDFs live in Vercel Blob (private),
 * served via `/api/invoices/[id]/pdf` after auth check.
 */
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceNumber: text("invoice_number").notNull().unique(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull(),
    description: text("description").notNull(),
    /** Amounts in EUR cents — net (ohne Steuer), tax, gross (mit Steuer). */
    netCents: integer("net_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    grossCents: integer("gross_cents").notNull(),
    /** Tax rate as basis-points hundredth — 1900 = 19.00%. 0 for Kleinunternehmer. */
    taxRateBp: integer("tax_rate_bp").notNull(),
    /** Full URL (Vercel Blob private path) for the PDF. */
    storageKey: text("storage_key").notNull(),
    paymentId: text("payment_id").notNull().unique(),
    paymentMethod: text("payment_method").notNull().default("paypal"),
    status: text("status").notNull().default("paid"),
    issuedAt: timestamp("issued_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("invoices_owner_account_id_idx").on(t.ownerAccountId),
    index("invoices_user_id_idx").on(t.userId),
    index("invoices_order_id_idx").on(t.orderId),
  ],
);

// ---------------------------------------------------------------------------

export const usageQuota = pgTable("usage_quota", {
  ownerAccountId: uuid("owner_account_id")
    .primaryKey()
    .references(() => ownerAccounts.id, { onDelete: "cascade" }),
  usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),
  filesCount: integer("files_count").notNull().default(0),
  notesCount: integer("notes_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdateFn(() => new Date()),
});

// ---------------------------------------------------------------------------
// Audit log
//
// Security-relevant events — team lifecycle, membership changes, token
// operations, logins. Fire-and-forget writes from `lib/audit/log.ts`;
// reads are admin-only (no UI in V1 — query via SQL, see docs/OPS.md).
//
// `action` is a slug like "team.created" or "member.role_changed". Keep
// consistent — any `grep -r` on the codebase should turn up every action
// name and where it's written.
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Scope — which owner_account this event belongs to. */
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    /** Who did it. Null = system event (e.g. a cron or delete-cascade). */
    actorUserId: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Slug-style identifier — e.g. "team.created", "member.invited". */
    action: text("action").notNull(),
    /** Free-form. Common values: "user", "token", "space", "team", "invite". */
    targetType: text("target_type"),
    targetId: text("target_id"),
    /** Arbitrary structured context (old/new role, token IDs, etc.). */
    metadata: jsonb("metadata"),
    /**
     * Raw client IP extracted from forwarding headers. Stored as text,
     * not `inet`, so we don't care whether the header carries IPv4, IPv6,
     * a comma list, or junk — the column's job is diagnostics, not
     * perfect normalisation.
     */
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_events_owner_account_id_created_at_idx").on(
      t.ownerAccountId,
      t.createdAt.desc(),
    ),
    index("audit_events_action_idx").on(t.action),
  ],
);

// ---------------------------------------------------------------------------
// SSO — Team-basierte Single-Sign-On-Konfiguration + User-Identity-Linking
//
// Zwei Tabellen pro `docs/sso-overview-plan.md`:
//
//   * `team_sso_configs` — eine Row pro Team-Account (UNIQUE auf
//     `owner_account_id`), speichert Provider + Tenant-ID + erlaubte
//     Email-Domains. Nur existiert → Toggle `enabled` aktiviert SSO.
//   * `user_sso_identities` — verbindet lokri-User mit externer
//     Identity (Entra `sub` = Object-ID). Angelegt per JIT-Linking
//     beim ersten erfolgreichen SSO-Login. **Keine Token-Felder** —
//     wir speichern weder Access- noch Refresh-Tokens, nur die
//     stabile Subject-ID.
//
// Provider-Enum aktuell nur `entra`; bei späteren Phasen (Google
// Workspace, SAML) wird via Migration erweitert.
//
// Namenskonvention: Wir nennen die FK-Spalte bewusst
// `owner_account_id`, nicht `account_id` wie im Plan-Dokument.
// Grund: „accounts" bedeutet in unserem Schema die Better-Auth-
// Provider-Tabelle (auth_accounts); unsere Tenancy-Layer heißt
// durchgehend `owner_accounts`.
// ---------------------------------------------------------------------------

export const teamSsoConfigs = pgTable(
  "team_sso_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Unique pro Team: genau eine SSO-Config pro Owner-Account. */
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .unique()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    provider: ssoProviderEnum("provider").notNull(),
    /** Entra Tenant-ID (UUID-String) — wird gegen den `tid`-Claim
     *  im ID-Token validiert, um Tenant-Mismatch-Attacks zu
     *  verhindern. */
    tenantId: text("tenant_id").notNull(),
    /**
     * Email-Domains, für die dieses Team-SSO greift (z.B.
     * `["firma-x.de", "firma-x.com"]`). Leere Liste ⇒ kein Match
     * möglich ⇒ effektiv deaktiviert trotz `enabled=true`.
     *
     * Wir speichern als `text[]` statt jsonb, damit GIN-Index auf
     * Domain-Lookup in Phase 3 (Discovery-Endpoint) greifen kann.
     */
    allowedDomains: text("allowed_domains")
      .array()
      .notNull()
      .default(sql`ARRAY[]::text[]`),
    enabled: boolean("enabled").notNull().default(false),
    /** Letzter erfolgreicher Verbindungs-Test via Entra-Discovery.
     *  Null bis der Test zum ersten Mal läuft. */
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    /** Fehlertext des letzten fehlgeschlagenen Tests / Logins.
     *  Admin-facing im Team-SSO-Settings-Panel (Phase 2). */
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index("team_sso_configs_tenant_id_idx").on(t.tenantId)],
);

export const userSsoIdentities = pgTable(
  "user_sso_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: ssoProviderEnum("provider").notNull(),
    tenantId: text("tenant_id").notNull(),
    /**
     * Stabiler Identifier aus dem ID-Token:
     *   - Entra: `oid` (Object-ID) bzw. `sub` (je nach Token-Version)
     *   - Google (später): `sub`
     *
     * Nicht die Email — Emails wechseln, Subject bleibt. Die Email-
     * Verknüpfung läuft über JIT-Matching beim ersten Login; danach
     * reicht (provider, tenant_id, subject) als Identity-Lookup.
     */
    subject: text("subject").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastLogin: timestamp("last_login", { withTimezone: true }),
  },
  (t) => [
    index("user_sso_identities_user_id_idx").on(t.userId),
    // Eine Entra-Identity kann nur einem lokri-User gehören.
    // Verhindert Identity-Hijacking, falls zwei User denselben
    // externen `sub` claimen würden.
    uniqueIndex("user_sso_identities_provider_subject_unique_idx").on(
      t.provider,
      t.tenantId,
      t.subject,
    ),
    // Ein User hat pro (provider, tenant) genau eine Identity.
    // Verhindert Duplikate beim JIT-Linking, wenn der Callback
    // race-bedingt zweimal läuft.
    uniqueIndex("user_sso_identities_user_provider_tenant_unique_idx").on(
      t.userId,
      t.provider,
      t.tenantId,
    ),
  ],
);

// ---------------------------------------------------------------------------
// Connector Framework — externe Datenquellen (Confluence, Slack, GitHub, …)
// an lokri-Spaces mappen. Vier Tabellen pro `docs/CONNECTOR_FRAMEWORK.md`:
//
//   * `connector_integrations` — konfigurierte Instanz eines Connector-Typs
//     pro Team (z.B. „Empro Confluence"). `credentials_encrypted` hält die
//     verschlüsselten Upstream-Tokens (PAT im MVP, OAuth später), `config`
//     die plain-Params (site_url, etc.).
//   * `connector_scope_allowlist` — Whitelist-Einträge pro Integration.
//     Eine Row pro freigegebener Sub-Ressource (z.B. Confluence-Space-Key
//     „ENGINEERING"). Bildet die Defense-in-Depth gegen das naive
//     Token-Durchreichen an den Upstream.
//   * `space_external_sources` — Mapping lokri-Space ↔ Scope-Eintrag.
//     MVP: hartes 1:1 via Partial-Unique-Index auf `connector_scope_id`
//     (Phase 2 dropt den Index für n:1-Compositions).
//   * `connector_usage_log` — gemeinsame Audit+Usage-Tabelle. Schreibt
//     pro Tool-Execution eine Row mit status (success/failure/degraded).
//
// Abweichung vom Design-Doc: `credentials` ist `text` (nicht `jsonb`) —
// wir folgen dem Storage-Provider/Embedding-Key-Pattern, das schon einen
// versionierten Envelope `v1:<base64(...)>` + `encryptJson/decryptJson`-
// Helper in `lib/storage/encryption.ts` nutzt.
//
// `connector_type` und `auth_type` sind `text` ohne CHECK-Constraint —
// Enforcement via TS-Union (`ConnectorDefinition`). Neue Typen = Code-
// Deploy, keine Migration (Prinzip 3).
// ---------------------------------------------------------------------------

export const connectorIntegrations = pgTable(
  "connector_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    /** Connector-Typ-Slug aus der Code-Registry — z.B. `"confluence-cloud"`. */
    connectorType: text("connector_type").notNull(),
    /** User-definierter Label — z.B. `"Empro Confluence"`. */
    displayName: text("display_name").notNull(),
    /** Aktuell nur `"pat"`; `"oauth2"` kommt mit Phase 2. */
    authType: text("auth_type").notNull(),
    /**
     * AES-256-GCM-verschlüsselter JSON-Envelope mit den Upstream-Credentials
     * (PAT, OAuth-Tokens etc.). Format: `v1:<base64(salt ‖ iv ‖ tag ‖ ct)>`.
     * Ver-/Entschlüsselung über `encryptJson`/`decryptJson` aus
     * `lib/storage/encryption.ts` (gleicher Helper wie S3 + Embedding-Keys).
     */
    credentialsEncrypted: text("credentials_encrypted").notNull(),
    /**
     * Plain-structured Konfiguration (nicht verschlüsselt):
     *   - Confluence: `{ siteUrl, email }`
     *   - GitHub: `{ baseUrl, org }`
     * Schema connector-spezifisch — validiert vom jeweiligen Provider.
     */
    config: jsonb("config").notNull().default(sql`'{}'::jsonb`),
    enabled: boolean("enabled").notNull().default(true),
    /** Letzter erfolgreicher `testCredentials()`-Durchlauf. */
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    /** Fehlertext des letzten fehlgeschlagenen Tests oder Tool-Calls. */
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [
    index("connector_integrations_owner_account_id_idx").on(t.ownerAccountId),
  ],
);

export const connectorScopeAllowlist = pgTable(
  "connector_scope_allowlist",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    connectorIntegrationId: uuid("connector_integration_id")
      .notNull()
      .references(() => connectorIntegrations.id, { onDelete: "cascade" }),
    /** Provider-specific scope-type — z.B. `"confluence-space"`,
     *  `"github-repo"`, `"slack-channel"`. */
    scopeType: text("scope_type").notNull(),
    /** Provider-specific identifier — z.B. `"ENGINEERING"` (Confluence
     *  Space-Key), `"owner/repo"` (GitHub). */
    scopeIdentifier: text("scope_identifier").notNull(),
    /** Optionale Metadaten für UI-Display (display name, icon, etc.) —
     *  z.B. `{ displayName: "Engineering Wiki" }`. */
    scopeMetadata: jsonb("scope_metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("connector_scope_allowlist_integration_id_idx").on(
      t.connectorIntegrationId,
    ),
    // Idempotenz beim Scope-Discovery + Upsert.
    uniqueIndex("connector_scope_allowlist_unique_idx").on(
      t.connectorIntegrationId,
      t.scopeType,
      t.scopeIdentifier,
    ),
  ],
);

export const spaceExternalSources = pgTable(
  "space_external_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    spaceId: uuid("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    connectorScopeId: uuid("connector_scope_id")
      .notNull()
      .references(() => connectorScopeAllowlist.id, { onDelete: "cascade" }),
    /** Wer hat das Mapping angelegt. Set-null, damit Member-Leave das
     *  Mapping nicht wegräumt — bleibt für Audit sichtbar. */
    addedByUserId: text("added_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("space_external_sources_space_id_idx").on(t.spaceId),
    // Kein Space referenziert denselben Scope zweimal.
    uniqueIndex("space_external_sources_space_scope_unique_idx").on(
      t.spaceId,
      t.connectorScopeId,
    ),
    // MVP-Constraint: 1:1-Mapping zwischen Scope und Space.
    // Phase 2 entfernt diesen Index für n:1-Compositions.
    uniqueIndex("space_external_sources_scope_unique_idx").on(
      t.connectorScopeId,
    ),
  ],
);

export const connectorUsageLog = pgTable(
  "connector_usage_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerAccountId: uuid("owner_account_id")
      .notNull()
      .references(() => ownerAccounts.id, { onDelete: "cascade" }),
    /** Audit-Erhalt: user gelöscht ⇒ log bleibt. */
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Audit-Erhalt: integration entfernt ⇒ log bleibt mit Kontext. */
    connectorIntegrationId: uuid("connector_integration_id").references(
      () => connectorIntegrations.id,
      { onDelete: "set null" },
    ),
    /** Audit-Erhalt: space gelöscht ⇒ log bleibt. */
    spaceId: uuid("space_id").references(() => spaces.id, {
      onDelete: "set null",
    }),
    /** Slug: `"search"`, `"read-page"`, `"list-recent"`, … */
    action: text("action").notNull(),
    /** `"success"` | `"failure"` | `"degraded"`. TS-Union, kein CHECK. */
    status: text("status").notNull(),
    /** Sanitized Request-Args (keine Credentials, keine Secrets). */
    requestMetadata: jsonb("request_metadata"),
    /** Response-Metadata: Trefferanzahl, degradation_reason, etc. */
    responseMetadata: jsonb("response_metadata"),
    durationMs: integer("duration_ms"),
    /** Vorbereitung für spätere Abrechnung/Quota — MVP: immer 0. */
    tokensUsed: integer("tokens_used").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("connector_usage_log_owner_account_id_created_at_idx").on(
      t.ownerAccountId,
      t.createdAt.desc(),
    ),
    index("connector_usage_log_integration_id_created_at_idx").on(
      t.connectorIntegrationId,
      t.createdAt.desc(),
    ),
  ],
);
