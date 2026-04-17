ALTER TABLE "owner_accounts" ADD COLUMN "storage_provider" text DEFAULT 'vercel_blob' NOT NULL;--> statement-breakpoint
ALTER TABLE "owner_accounts" ADD COLUMN "storage_config_encrypted" text;