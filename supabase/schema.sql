-- ============================================================================
--  Batitrack — Supabase schema (testing-phase)
--
--  Tables:
--    user_state  : single JSONB blob per user (legacy, current source of truth).
--    chantiers   : relational chantier table — drives the hard onboarding gate
--                  and supports defense-in-depth RLS so the mandatory-chantier
--                  policy survives a compromised front-end.
--    audit_log   : append-only audit trail.
--
--  Apply via Supabase → SQL Editor → New query → paste → Run.
--  Re-runnable: this file is idempotent. Tables introduced by THIS refactor
--  (chantiers, audit_log) are dropped-and-recreated; user_state keeps its
--  data and only gains any missing columns.
-- ============================================================================

-- ── Reset tables that the previous schema attempt may have left in a partial
--    or wrong-shape state. Both are introduced (or restructured) by this
--    refactor and contain no production data yet. user_state is preserved.
drop table if exists public.chantiers cascade;
drop table if exists public.audit_log cascade;

-- ── user_state (preserve existing data, ensure columns) ─────────────────────
create table if not exists public.user_state (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  data        jsonb not null default '{}'::jsonb,
  schema_ver  integer not null default 1,
  updated_at  timestamptz not null default now()
);

-- Self-heal if a pre-existing user_state table was missing any of our columns.
alter table public.user_state add column if not exists data       jsonb not null default '{}'::jsonb;
alter table public.user_state add column if not exists schema_ver integer not null default 1;
alter table public.user_state add column if not exists updated_at timestamptz not null default now();

-- Re-add the size-cap constraint idempotently.
alter table public.user_state drop constraint if exists user_state_data_size_cap;
alter table public.user_state add  constraint user_state_data_size_cap check (octet_length(data::text) < 4194304);

alter table public.user_state enable row level security;

drop policy if exists user_state_self_select on public.user_state;
drop policy if exists user_state_self_insert on public.user_state;
drop policy if exists user_state_self_update on public.user_state;
drop policy if exists user_state_self_delete on public.user_state;

create policy user_state_self_select on public.user_state
  for select using (auth.uid() = user_id);
create policy user_state_self_insert on public.user_state
  for insert with check (auth.uid() = user_id);
create policy user_state_self_update on public.user_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_state_self_delete on public.user_state
  for delete using (auth.uid() = user_id);

revoke all on public.user_state from anon;
grant  select, insert, update, delete on public.user_state to authenticated;


-- ── chantiers ────────────────────────────────────────────────────────────────
-- The relational source-of-truth for the mandatory-chantier gate. Even if a
-- malicious client bypasses the front-end gate, every mutation of any
-- chantier-scoped entity (pointage, plans, materiels, ...) can be wired to a
-- foreign key on this table, so the database refuses writes when no chantier
-- exists for the user.
create table if not exists public.chantiers (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  name            text not null,
  client          text not null,
  address         text not null,
  date_start      date not null,
  date_end_prev   date not null,
  budget_mo       numeric(14,2) not null,
  type            text not null,
  manager         text,
  status          text not null default 'on-track',
  color           text,
  color_soft      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint chantiers_name_length        check (char_length(name) between 1 and 120),
  constraint chantiers_client_length      check (char_length(client) between 1 and 120),
  constraint chantiers_address_length     check (char_length(address) between 1 and 200),
  constraint chantiers_date_order         check (date_end_prev >= date_start),
  constraint chantiers_budget_positive    check (budget_mo > 0 and budget_mo <= 1e12),
  constraint chantiers_type_enum          check (type in ('Villa','Immeuble','Bureau','Industriel','Autre'))
);

create index if not exists chantiers_user_id_idx on public.chantiers (user_id);

alter table public.chantiers enable row level security;

drop policy if exists chantiers_self_select on public.chantiers;
drop policy if exists chantiers_self_insert on public.chantiers;
drop policy if exists chantiers_self_update on public.chantiers;
drop policy if exists chantiers_self_delete on public.chantiers;

create policy chantiers_self_select on public.chantiers
  for select using (auth.uid() = user_id);
create policy chantiers_self_insert on public.chantiers
  for insert with check (auth.uid() = user_id);
create policy chantiers_self_update on public.chantiers
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy chantiers_self_delete on public.chantiers
  for delete using (auth.uid() = user_id);

revoke all on public.chantiers from anon;
grant  select, insert, update, delete on public.chantiers to authenticated;


-- ── audit_log (append-only) ─────────────────────────────────────────────────
create table if not exists public.audit_log (
  id          bigserial primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  action      text not null,
  entity      text,
  label       text,
  meta        jsonb default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  constraint audit_log_action_length check (char_length(action) <= 64),
  constraint audit_log_entity_length check (entity is null or char_length(entity) <= 64),
  constraint audit_log_label_length  check (label  is null or char_length(label)  <= 512)
);

alter table public.audit_log enable row level security;

drop policy if exists audit_log_self_select on public.audit_log;
drop policy if exists audit_log_self_insert on public.audit_log;

create policy audit_log_self_select on public.audit_log
  for select using (auth.uid() = user_id);
create policy audit_log_self_insert on public.audit_log
  for insert with check (auth.uid() = user_id);

-- intentionally no update / delete policies → append-only.

revoke all on public.audit_log from anon;
grant  select, insert on public.audit_log to authenticated;


-- ── Triggers: auto-create empty user_state on signup ────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.user_state (user_id, data) values (new.id, '{}'::jsonb)
    on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ── Trigger: keep updated_at fresh ──────────────────────────────────────────
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists chantiers_touch_updated_at on public.chantiers;
create trigger chantiers_touch_updated_at
  before update on public.chantiers
  for each row execute function public.touch_updated_at();

drop trigger if exists user_state_touch_updated_at on public.user_state;
create trigger user_state_touch_updated_at
  before update on public.user_state
  for each row execute function public.touch_updated_at();
