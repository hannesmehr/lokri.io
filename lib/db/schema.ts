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
// Plans
// ---------------------------------------------------------------------------

export const plans = pgTable("plans", {
  id: text("id").primaryKey(), // e.g. "free", "starter", "pro"
  name: text("name").notNull(),
  maxBytes: bigint("max_bytes", { mode: "number" }).notNull(),
  maxFiles: integer("max_files").notNull(),
  maxNotes: integer("max_notes").notNull(),
  priceEurMonthly: integer("price_eur_monthly").notNull().default(0),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("owner_accounts_plan_id_idx").on(t.planId)],
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdateFn(() => new Date()),
  },
  (t) => [index("spaces_account_id_idx").on(t.ownerAccountId)],
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
    storageProvider: text("storage_provider").notNull().default("vercel_blob"),
    storageKey: text("storage_key").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("files_account_id_idx").on(t.ownerAccountId),
    index("files_space_id_idx").on(t.spaceId),
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
