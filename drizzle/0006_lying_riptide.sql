CREATE TYPE "public"."storage_provider_type" AS ENUM('s3');--> statement-breakpoint
CREATE TABLE "storage_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"name" text NOT NULL,
	"type" "storage_provider_type" NOT NULL,
	"config_encrypted" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "storage_provider_id" uuid;--> statement-breakpoint
ALTER TABLE "files" ADD COLUMN "mcp_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "mcp_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "spaces" ADD COLUMN "storage_provider_id" uuid;--> statement-breakpoint
ALTER TABLE "storage_providers" ADD CONSTRAINT "storage_providers_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "storage_providers_owner_account_id_idx" ON "storage_providers" USING btree ("owner_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_providers_owner_account_name_idx" ON "storage_providers" USING btree ("owner_account_id","name");--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_storage_provider_id_storage_providers_id_fk" FOREIGN KEY ("storage_provider_id") REFERENCES "public"."storage_providers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_storage_provider_id_storage_providers_id_fk" FOREIGN KEY ("storage_provider_id") REFERENCES "public"."storage_providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "files_storage_provider_id_idx" ON "files" USING btree ("storage_provider_id");--> statement-breakpoint
CREATE INDEX "spaces_storage_provider_id_idx" ON "spaces" USING btree ("storage_provider_id");