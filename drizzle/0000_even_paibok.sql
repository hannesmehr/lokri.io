CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."member_role" AS ENUM('owner', 'editor', 'reader');--> statement-breakpoint
CREATE TYPE "public"."owner_account_type" AS ENUM('personal', 'team');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"password" text,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "file_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_id" uuid NOT NULL,
	"chunk_index" integer NOT NULL,
	"content_text" text NOT NULL,
	"embedding" vector(1536),
	"embedding_model" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"space_id" uuid,
	"filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_provider" text DEFAULT 'vercel_blob' NOT NULL,
	"storage_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"space_id" uuid,
	"title" text NOT NULL,
	"content_text" text NOT NULL,
	"embedding" vector(1536),
	"embedding_model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_account_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "member_role" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "owner_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "owner_account_type" DEFAULT 'personal' NOT NULL,
	"name" text NOT NULL,
	"plan_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"max_bytes" bigint NOT NULL,
	"max_files" integer NOT NULL,
	"max_notes" integer NOT NULL,
	"price_eur_monthly" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "space_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"role" "member_role" NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_quota" (
	"owner_account_id" uuid PRIMARY KEY NOT NULL,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"files_count" integer DEFAULT 0 NOT NULL,
	"notes_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_chunks" ADD CONSTRAINT "file_chunks_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_account_members" ADD CONSTRAINT "owner_account_members_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_account_members" ADD CONSTRAINT "owner_account_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "owner_accounts" ADD CONSTRAINT "owner_accounts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_members" ADD CONSTRAINT "space_members_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_quota" ADD CONSTRAINT "usage_quota_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_tokens_account_id_idx" ON "api_tokens" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "file_chunks_file_id_idx" ON "file_chunks" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "file_chunks_embedding_hnsw_idx" ON "file_chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "files_account_id_idx" ON "files" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "files_space_id_idx" ON "files" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "notes_account_id_idx" ON "notes" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "notes_space_id_idx" ON "notes" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "notes_embedding_hnsw_idx" ON "notes" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "owner_account_members_account_id_idx" ON "owner_account_members" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "owner_account_members_user_id_idx" ON "owner_account_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "owner_account_members_unique_idx" ON "owner_account_members" USING btree ("owner_account_id","user_id");--> statement-breakpoint
CREATE INDEX "owner_accounts_plan_id_idx" ON "owner_accounts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "space_members_space_id_idx" ON "space_members" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "space_members_account_id_idx" ON "space_members" USING btree ("owner_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_members_unique_idx" ON "space_members" USING btree ("space_id","owner_account_id");--> statement-breakpoint
CREATE INDEX "spaces_account_id_idx" ON "spaces" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");