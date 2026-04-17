ALTER TABLE "api_tokens" ADD COLUMN "space_scope" uuid[];--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "read_only" boolean DEFAULT false NOT NULL;