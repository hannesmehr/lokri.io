CREATE TYPE "public"."sso_provider" AS ENUM('entra');--> statement-breakpoint
CREATE TABLE "team_sso_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"provider" "sso_provider" NOT NULL,
	"tenant_id" text NOT NULL,
	"allowed_domains" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_verified_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_sso_configs_owner_account_id_unique" UNIQUE("owner_account_id")
);
--> statement-breakpoint
CREATE TABLE "user_sso_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" "sso_provider" NOT NULL,
	"tenant_id" text NOT NULL,
	"subject" text NOT NULL,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "team_sso_configs" ADD CONSTRAINT "team_sso_configs_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sso_identities" ADD CONSTRAINT "user_sso_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_sso_configs_tenant_id_idx" ON "team_sso_configs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "user_sso_identities_user_id_idx" ON "user_sso_identities" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sso_identities_provider_subject_unique_idx" ON "user_sso_identities" USING btree ("provider","tenant_id","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sso_identities_user_provider_tenant_unique_idx" ON "user_sso_identities" USING btree ("user_id","provider","tenant_id");