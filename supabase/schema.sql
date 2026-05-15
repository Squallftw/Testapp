-- ─────────────────────────────────────────────────────────────────────
-- BatiTrack — Supabase schema (MVP: JSONB-blob per user)
-- Run this script ONCE in the Supabase SQL editor for a new project.
--
-- Strategy: each authenticated user owns ONE row in `app_state`
-- holding their entire state object (project, tasks, workers, …).
-- The app reads/writes this blob exactly as it currently reads/writes
-- localStorage, so the client-side code stays small.
--
-- Row-level security restricts each user to their own row.
-- When you later need to query across rows (analytics, multi-tenant
-- dashboards), migrate to schema-normalized.sql.
-- ─────────────────────────────────────────────────────────────────────

-- 1. The table ─────────────────────────────────────────────────────────
create table if not exists public.app_state (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  data          jsonb not null default '{}'::jsonb,
  state_version int   not null default 4,
  updated_at    timestamptz not null default now()
);

comment on table  public.app_state            is 'One row per user; holds the full BatiTrack state as JSON.';
comment on column public.app_state.data       is 'Full state object: { project, ganttTasks, workers, pointages, soustraitants, materials, equipment, ui }.';
comment on column public.app_state.state_version is 'Mirrors STATE_VERSION constant in app.js; bump triggers a client-side migration.';

-- 2. updated_at trigger ────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_state_touch on public.app_state;
create trigger app_state_touch
  before update on public.app_state
  for each row execute function public.touch_updated_at();

-- 3. Row-level security ────────────────────────────────────────────────
alter table public.app_state enable row level security;

drop policy if exists "owner_select" on public.app_state;
drop policy if exists "owner_insert" on public.app_state;
drop policy if exists "owner_update" on public.app_state;
drop policy if exists "owner_delete" on public.app_state;

create policy "owner_select"
  on public.app_state for select
  using (auth.uid() = user_id);

create policy "owner_insert"
  on public.app_state for insert
  with check (auth.uid() = user_id);

create policy "owner_update"
  on public.app_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "owner_delete"
  on public.app_state for delete
  using (auth.uid() = user_id);

-- 4. Auto-create an empty state row when a user signs up ───────────────
-- Without this, the first save() must INSERT; with it, the client only
-- ever UPDATEs, which is simpler.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.app_state (user_id, data, state_version)
  values (new.id, '{}'::jsonb, 4)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 5. Optional helper view for dashboards ──────────────────────────────
-- (uncomment if you want to query labour totals across users, etc.)
-- create or replace view public.user_summary as
--   select user_id,
--          data->'project'->>'name'             as project_name,
--          jsonb_array_length(data->'workers')  as worker_count,
--          jsonb_array_length(data->'pointages') as pointage_count,
--          updated_at
--   from public.app_state;

-- ─────────────────────────────────────────────────────────────────────
-- Done.  Verify in the Supabase Dashboard:
--   1. Authentication → Sign up a test user.
--   2. Table editor → app_state should have one row for that user.
--   3. SQL editor → SELECT * FROM app_state;  -- should be readable
--      only when authenticated as that user.
-- ─────────────────────────────────────────────────────────────────────
