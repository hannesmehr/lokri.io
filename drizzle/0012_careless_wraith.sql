ALTER TYPE "public"."member_role" ADD VALUE 'admin';--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE 'member';--> statement-breakpoint
ALTER TYPE "public"."member_role" ADD VALUE 'viewer';--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_account_id" uuid NOT NULL,
	"email" text NOT NULL,
	"role" "member_role" NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "owner_account_members" ADD COLUMN "invited_by_user_id" text;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "is_seat_based" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "price_per_seat_monthly_cents" integer;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "price_per_seat_yearly_cents" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "can_create_teams" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "active_owner_account_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invites" ADD CONSTRAINT "team_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_owner_account_id_created_at_idx" ON "audit_events" USING btree ("owner_account_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "audit_events_action_idx" ON "audit_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "team_invites_owner_account_id_idx" ON "team_invites" USING btree ("owner_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "team_invites_pending_unique_idx" ON "team_invites" USING btree ("owner_account_id","email") WHERE accepted_at IS NULL AND revoked_at IS NULL;--> statement-breakpoint
ALTER TABLE "owner_account_members" ADD CONSTRAINT "owner_account_members_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_active_owner_account_id_owner_accounts_id_fk" FOREIGN KEY ("active_owner_account_id") REFERENCES "public"."owner_accounts"("id") ON DELETE set null ON UPDATE no action;