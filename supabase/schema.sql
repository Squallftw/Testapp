-- ============================================================================
--  Batitrack — Supabase schema
--  Run this in Supabase → SQL Editor → New query → Run
--  Safe to run multiple times. Drops & recreates app tables — fine while
--  in testing because there's no real client data yet. Once you go to
--  production, switch to ALTER migrations instead.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0. Clean slate — drop anything that might be left over from older attempts.
--    Cascade so dependent policies/triggers/sequences go with them.
-- ----------------------------------------------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;
drop function if exists public.touch_user_state_updated_at() cascade;

drop table if exists public.audit_log  cascade;
drop table if exists public.user_state cascade;

-- ----------------------------------------------------------------------------
-- 1. user_state — single row per user that stores the whole app state as JSONB
-- ----------------------------------------------------------------------------
create table public.user_state (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb        not null default '{}'::jsonb,
  schema_ver  integer      not null default 1,
  updated_at  timestamptz  not null default now(),
  created_at  timestamptz  not null default now(),
  constraint user_state_size_cap
    check (octet_length(data::text) < 4 * 1024 * 1024) -- 4 MiB hard cap
);

-- Auto-bump updated_at
create or replace function public.touch_user_state_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_user_state_touch on public.user_state;
create trigger trg_user_state_touch
  before update on public.user_state
  for each row execute function public.touch_user_state_updated_at();

-- ----------------------------------------------------------------------------
-- 2. audit_log — append-only audit trail of significant mutations
--    Useful for forensic review even if the JSONB blob gets overwritten.
-- ----------------------------------------------------------------------------
create table public.audit_log (
  id         bigserial primary key,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  ts         timestamptz not null default now(),
  action     text        not null check (char_length(action) between 1 and 64),
  entity     text        not null check (char_length(entity) between 1 and 64),
  label      text                 check (label is null or char_length(label) <= 512),
  meta       jsonb       not null default '{}'::jsonb
);

create index audit_log_user_ts_idx
  on public.audit_log (user_id, ts desc);

-- ----------------------------------------------------------------------------
-- 3. Row-Level Security
--    Lock everything down by default; users can only touch their own rows.
-- ----------------------------------------------------------------------------
alter table public.user_state enable row level security;
alter table public.audit_log  enable row level security;

-- user_state: full CRUD on own row only
drop policy if exists "user_state select own" on public.user_state;
create policy "user_state select own"
  on public.user_state for select
  using (auth.uid() = user_id);

drop policy if exists "user_state insert own" on public.user_state;
create policy "user_state insert own"
  on public.user_state for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_state update own" on public.user_state;
create policy "user_state update own"
  on public.user_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_state delete own" on public.user_state;
create policy "user_state delete own"
  on public.user_state for delete
  using (auth.uid() = user_id);

-- audit_log: insert + read own; updates/deletes forbidden (append-only)
drop policy if exists "audit_log select own" on public.audit_log;
create policy "audit_log select own"
  on public.audit_log for select
  using (auth.uid() = user_id);

drop policy if exists "audit_log insert own" on public.audit_log;
create policy "audit_log insert own"
  on public.audit_log for insert
  with check (auth.uid() = user_id);

-- (no update/delete policy → blocked by RLS)

-- ----------------------------------------------------------------------------
-- 4. Auto-provision an empty user_state row on signup
--    Trigger fires on auth.users insert, so a fresh user is ready immediately.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_state (user_id, data)
  values (new.id, '{}'::jsonb)
  on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 5. Revokes — make sure anon role has zero access, only authenticated does.
-- ----------------------------------------------------------------------------
revoke all on public.user_state from anon;
revoke all on public.audit_log  from anon;

grant select, insert, update, delete on public.user_state to authenticated;
grant select, insert                  on public.audit_log  to authenticated;
grant usage, select on sequence public.audit_log_id_seq    to authenticated;

-- ----------------------------------------------------------------------------
-- Done. After running, verify in Authentication → Policies that:
--   • user_state has 4 policies, all (auth.uid() = user_id)
--   • audit_log has 2 policies (select own + insert own)
-- ============================================================================
