CREATE TABLE "connector_integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"connector_type" text NOT NULL,
	"display_name" text NOT NULL,
	"auth_type" text NOT NULL,
	"credentials_encrypted" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"last_tested_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_scope_allowlist" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connector_integration_id" uuid NOT NULL,
	"scope_type" text NOT NULL,
	"scope_identifier" text NOT NULL,
	"scope_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connector_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"user_id" text,
	"connector_integration_id" uuid,
	"space_id" uuid,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"request_metadata" jsonb,
	"response_metadata" jsonb,
	"duration_ms" integer,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "space_external_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"connector_scope_id" uuid NOT NULL,
	"added_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connector_integrations" ADD CONSTRAINT "connector_integrations_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_scope_allowlist" ADD CONSTRAINT "connector_scope_allowlist_connector_integration_id_connector_integrations_id_fk" FOREIGN KEY ("connector_integration_id") REFERENCES "public"."connector_integrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_usage_log" ADD CONSTRAINT "connector_usage_log_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_usage_log" ADD CONSTRAINT "connector_usage_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_usage_log" ADD CONSTRAINT "connector_usage_log_connector_integration_id_connector_integrations_id_fk" FOREIGN KEY ("connector_integration_id") REFERENCES "public"."connector_integrations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector_usage_log" ADD CONSTRAINT "connector_usage_log_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_external_sources" ADD CONSTRAINT "space_external_sources_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_external_sources" ADD CONSTRAINT "space_external_sources_connector_scope_id_connector_scope_allowlist_id_fk" FOREIGN KEY ("connector_scope_id") REFERENCES "public"."connector_scope_allowlist"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "space_external_sources" ADD CONSTRAINT "space_external_sources_added_by_user_id_users_id_fk" FOREIGN KEY ("added_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "connector_integrations_owner_account_id_idx" ON "connector_integrations" USING btree ("owner_account_id");--> statement-breakpoint
CREATE INDEX "connector_scope_allowlist_integration_id_idx" ON "connector_scope_allowlist" USING btree ("connector_integration_id");--> statement-breakpoint
CREATE UNIQUE INDEX "connector_scope_allowlist_unique_idx" ON "connector_scope_allowlist" USING btree ("connector_integration_id","scope_type","scope_identifier");--> statement-breakpoint
CREATE INDEX "connector_usage_log_owner_account_id_created_at_idx" ON "connector_usage_log" USING btree ("owner_account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "connector_usage_log_integration_id_created_at_idx" ON "connector_usage_log" USING btree ("connector_integration_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "space_external_sources_space_id_idx" ON "space_external_sources" USING btree ("space_id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_external_sources_space_scope_unique_idx" ON "space_external_sources" USING btree ("space_id","connector_scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "space_external_sources_scope_unique_idx" ON "space_external_sources" USING btree ("connector_scope_id");