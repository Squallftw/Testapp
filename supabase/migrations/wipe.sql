-- DESTRUCTIVE — wipes the legacy single-blob persistence and all test auth users.
-- Run this ONCE, only after Gate 2 approval, before applying 0001_initial_schema.sql.
--
-- ──────────────────────────────────────────────────────────────────────
-- Pre-flight checklist (do these in the Supabase dashboard FIRST)
-- ──────────────────────────────────────────────────────────────────────
--
-- 1. Confirm no production data exists. This script deletes EVERY user
--    in auth.users and drops user_state. If anything real lives in this
--    project, take a snapshot first (Database → Backups → "Create
--    backup now"). Restoring later requires the same major Postgres
--    version, so don't skip this even on a fresh-looking project.
--
-- 2. Disable any cron jobs / scheduled functions / webhooks that read
--    user_state (Edge Functions → Scheduled, Database → Webhooks).
--    They will fail noisily after the drop.
--
-- 3. Tell anyone testing on this project to log out. Their session
--    tokens become invalid as soon as their auth.users row goes away.
--
-- ──────────────────────────────────────────────────────────────────────
-- What this script does
-- ──────────────────────────────────────────────────────────────────────
--
-- a) drops the legacy user_state table (the JSONB blob) and any FKs
--    that still reference it.
-- b) deletes every row in auth.users. The cascade also removes
--    auth.identities, auth.sessions, auth.refresh_tokens, etc.
--
-- It does NOT drop the auth schema itself, the storage schema, or any
-- Supabase-managed metadata.
--
-- ──────────────────────────────────────────────────────────────────────
-- Post-flight steps
-- ──────────────────────────────────────────────────────────────────────
--
-- 4. Apply the schema migration:
--      supabase db push                  (CLI)
--    OR paste 0001_initial_schema.sql into SQL Editor and run it.
--
-- 5. Sign up the first owner account through the new login UI. The
--    application flow creates the first organization and membership
--    automatically; if it doesn't yet (Gate 4 not done), insert the
--    membership manually as service_role.
--
-- 6. Re-enable any cron jobs / webhooks that you disabled in step 2,
--    repointing them at the new tables.
--
-- ──────────────────────────────────────────────────────────────────────

begin;

-- a) drop the legacy blob table
drop table if exists public.user_state cascade;

-- b) wipe auth users (cascades to identities, sessions, refresh tokens)
delete from auth.users;

commit;

-- Sanity check (uncomment to verify):
-- select count(*) as remaining_users from auth.users;
-- select to_regclass('public.user_state') as user_state_still_exists;
