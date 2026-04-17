CREATE TYPE "public"."embedding_provider_type" AS ENUM('openai');--> statement-breakpoint
CREATE TABLE "embedding_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"provider" "embedding_provider_type" NOT NULL,
	"model" text NOT NULL,
	"config_encrypted" text NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "embedding_keys" ADD CONSTRAINT "embedding_keys_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "embedding_keys_owner_account_id_idx" ON "embedding_keys" USING btree ("owner_account_id");