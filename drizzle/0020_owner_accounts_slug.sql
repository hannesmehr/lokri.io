-- 0020_owner_accounts_slug
--
-- Adds `slug` column to `owner_accounts`. Used by the team-scoped MCP
-- endpoint `/api/mcp/team/[slug]` (so OAuth-MCP sessions can target a
-- specific team's connector integrations) and reserved for future
-- user-facing routes like `/team/[slug]/...`.
--
-- Multi-step: add nullable column → backfill from name → enforce
-- NOT NULL + unique. Keeps us safe if the backfill hits an edge case
-- (e.g. `unaccent` missing on a weird DB) without leaving the table
-- in a broken state.
--
-- Rule of thumb for slug shape (must match `lib/teams/slug.ts`):
--   * NFKD normalise + strip diacritics (via `unaccent`)
--   * lowercase
--   * non-alnum → `-`
--   * collapse `-+` → `-`
--   * trim leading/trailing `-`
--   * min 2 chars (falls back to `account` / `user` / `team`)
--   * max 60 chars
--   * reserved slugs get `-team` suffix before collision check

CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint

ALTER TABLE "owner_accounts" ADD COLUMN "slug" text;
--> statement-breakpoint

-- Backfill all existing rows with a unique slug derived from `name`.
-- Collision resolution: base-slug → `base-2` → `base-3` … up to 200.
-- At 200 the migration aborts so the operator can inspect — never seen
-- in practice but prevents infinite loops if something goes wrong.
DO $backfill$
DECLARE
  r RECORD;
  base_slug text;
  candidate text;
  attempt int;
  -- Must match `RESERVED_SLUGS` in lib/teams/slug.ts.
  reserved text[] := ARRAY[
    'admin', 'api', 'app', 'auth', 'billing', 'connect', 'dashboard',
    'health', 'help', 'login', 'logout', 'mcp', 'new', 'oauth', 'public',
    'settings', 'signup', 'static', 'status', 'support', 'well-known'
  ];
BEGIN
  FOR r IN
    SELECT id, name FROM "owner_accounts" WHERE slug IS NULL ORDER BY created_at
  LOOP
    -- Step 1: baseline slug from name.
    base_slug := lower(regexp_replace(
      regexp_replace(unaccent(r.name), '[^a-zA-Z0-9]+', '-', 'g'),
      '(^-|-$)', '', 'g'
    ));
    IF base_slug IS NULL OR length(base_slug) < 2 THEN
      base_slug := 'account';
    END IF;
    IF length(base_slug) > 60 THEN
      base_slug := substring(base_slug for 60);
    END IF;

    -- Step 2: reserved-slug guard.
    IF base_slug = ANY(reserved) THEN
      base_slug := base_slug || '-team';
    END IF;

    -- Step 3: collision loop.
    candidate := base_slug;
    attempt := 1;
    WHILE EXISTS (SELECT 1 FROM "owner_accounts" WHERE slug = candidate) LOOP
      attempt := attempt + 1;
      IF attempt > 200 THEN
        RAISE EXCEPTION 'owner_accounts slug backfill: exhausted suffixes for name=%', r.name;
      END IF;
      candidate := substring(base_slug for (60 - (length(attempt::text) + 1))) || '-' || attempt;
    END LOOP;

    UPDATE "owner_accounts" SET slug = candidate WHERE id = r.id;
  END LOOP;
END
$backfill$;
--> statement-breakpoint

ALTER TABLE "owner_accounts" ALTER COLUMN "slug" SET NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX "owner_accounts_slug_idx" ON "owner_accounts" USING btree ("slug");
