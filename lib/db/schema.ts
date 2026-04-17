import {
  bigint,
  boolean,
  index,
  integer,
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

export const memberRoleEnum = pgEnum("member_role", [
  "owner",
  "editor",
  "reader",
]);

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
  id: text("id").primaryKey(), // e.g. "free", "starter", "pro"
  name: text("name").notNull(),
  description: text("description"),
  maxBytes: bigint("max_bytes", { mode: "number" }).notNull(),
  maxFiles: integer("max_files").notNull(),
  maxNotes: integer("max_notes").notNull(),
  // Legacy column — kept so we don't have to drop it. New code uses cents
  // for correct decimal arithmetic.
  priceEurMonthly: integer("price_eur_monthly").notNull().default(0),
  priceMonthlyCents: integer("price_monthly_cents").notNull().default(0),
  priceYearlyCents: integer("price_yearly_cents").notNull().default(0),
  /** Display order in the pricing table (ascending). */
  sortOrder: integer("sort_order").notNull().default(0),
  /** False for `free`/deprecated tiers — hides them from the upgrade UI. */
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("owner_accounts_plan_id_idx").on(t.planId)],
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
