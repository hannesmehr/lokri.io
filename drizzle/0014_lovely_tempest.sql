ALTER TABLE "api_tokens" ADD COLUMN "scope_type" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "created_by_user_id" text;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;