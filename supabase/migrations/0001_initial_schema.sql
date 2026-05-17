-- BatiTrack — initial relational schema (Gate 2)
--
-- Replaces the JSONB blob in `public.user_state`. Multi-tenant via
-- `organizations` + `memberships`. RLS enforced. Audit log via triggers.
--
-- Money everywhere is numeric(14, 2). Lint test rejects float types.
-- Soft delete via `deleted_at`; FKs do NOT cascade on soft delete.
-- The DAL filters `deleted_at IS NULL` on every read.

set client_min_messages = warning;

-- ─── extensions & schemas ──────────────────────────────────────────────

create extension if not exists pgcrypto;

create schema if not exists app;
comment on schema app is 'Internal helpers: role checks, audit trigger, sync triggers.';

-- ─── enums ─────────────────────────────────────────────────────────────

create type public.org_role               as enum ('owner', 'admin', 'site_manager', 'worker');
create type public.member_status          as enum ('invited', 'active', 'revoked');
create type public.chantier_lifecycle     as enum ('active', 'paused', 'completed', 'cancelled');
create type public.worker_lifecycle       as enum ('active', 'inactive');
create type public.attendance_kind        as enum ('P', 'A');
create type public.task_lifecycle         as enum ('todo', 'ongoing', 'done', 'critical');
create type public.materiel_kind          as enum ('possede', 'loue');
create type public.purchase_payment_state as enum ('paid', 'pending', 'partial');
create type public.adjustment_category    as enum ('loss', 'theft', 'damage', 'correction');
create type public.labor_entry_source     as enum ('attendance', 'manual');

-- ─── tables (in FK dependency order) ───────────────────────────────────

-- 1. organizations
create table public.organizations (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  legal_name     text,
  ice            text,
  rc             text,
  cnss           text,
  address        text,
  phone          text,
  email          text,
  plan           text not null default 'free',
  currency       text not null default 'MAD',
  locale         text not null default 'fr-MA',
  timezone       text not null default 'Africa/Casablanca',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 2. memberships
-- Soft-delete-aware uniqueness is enforced by a partial unique index below,
-- so a revoked member can be re-invited without first hard-deleting their row.
create table public.memberships (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  org_id         uuid not null references public.organizations(id),
  role           public.org_role not null,
  status         public.member_status not null default 'invited',
  invited_at     timestamptz not null default now(),
  accepted_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 3. chantiers
create table public.chantiers (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  name              text not null,
  type              text,
  color             text,
  color_soft        text,
  client_name       text,
  manager_name      text,
  manager_user_id   uuid references auth.users(id) on delete set null,
  address           text,
  date_start        date,
  date_end_prev     date,
  budget_total      numeric(14, 2) not null default 0,
  budget_labor      numeric(14, 2) not null default 0,
  budget_materials  numeric(14, 2) not null default 0,
  contract_value    numeric(14, 2) not null default 0,
  status            public.chantier_lifecycle not null default 'active',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- 4. chantier_assignments (scopes site_manager to specific chantiers)
-- Soft-delete-aware uniqueness via partial unique index below.
create table public.chantier_assignments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  membership_id  uuid not null references public.memberships(id) on delete cascade,
  chantier_id    uuid not null references public.chantiers(id),
  granted_at     timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 5. workers (ouvriers)
create table public.workers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  full_name      text not null,
  role           text,
  daily_rate     numeric(14, 2) not null default 0,
  phone          text,
  cin            text,
  hire_date      date,
  status         public.worker_lifecycle not null default 'active',
  hue            integer,
  user_id        uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 6. attendance (pointage). No soft-delete: corrections happen via UPDATE,
-- accidental rows can be hard-deleted (the audit trigger still records it).
create table public.attendance (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  chantier_id     uuid not null references public.chantiers(id),
  worker_id       uuid not null references public.workers(id),
  attendance_date date not null,
  status          public.attendance_kind not null,
  absence_reason  text,
  prime_amount    numeric(14, 2) not null default 0 check (prime_amount >= 0),
  prime_motif     text,
  note            text,
  recorded_by     uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (worker_id, attendance_date)  -- one chantier per worker per day
);

-- 7. labor_entries (trigger-populated from attendance; manual source reserved)
create table public.labor_entries (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  chantier_id     uuid not null references public.chantiers(id),
  worker_id       uuid not null references public.workers(id),
  entry_date      date not null,
  days            numeric(5, 2) not null,
  computed_cost   numeric(14, 2) not null,
  source          public.labor_entry_source not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (chantier_id, worker_id, entry_date, source)
);

-- 8. tasks (planning — self-referential for group/leaf hierarchy)
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  chantier_id     uuid not null references public.chantiers(id),
  parent_task_id  uuid references public.tasks(id) on delete cascade,
  label           text not null,
  start_date      date,
  duration_days   integer,
  status          public.task_lifecycle not null default 'todo',
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz
);

-- 9. task_assignments (replaces blob's `assignments` key — workers↔tasks)
create table public.task_assignments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  task_id        uuid not null references public.tasks(id) on delete cascade,
  worker_id      uuid not null references public.workers(id),
  created_at     timestamptz not null default now(),
  unique (task_id, worker_id)
);

-- 10. materiels (equipment)
create table public.materiels (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  name           text not null,
  category       text,
  type           public.materiel_kind not null default 'loue',
  qty            numeric(10, 2),
  unit           text,
  cost_per_day   numeric(14, 2) not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 11. materiel_deployments
create table public.materiel_deployments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  materiel_id    uuid not null references public.materiels(id) on delete cascade,
  chantier_id    uuid not null references public.chantiers(id),
  start_date     date not null,
  end_date       date not null,
  qty            numeric(10, 2),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,
  check (end_date >= start_date),
  check (qty is null or qty > 0)
);

-- 12. suppliers
create table public.suppliers (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  name           text not null,
  type           text,
  phone          text,
  city           text,
  address        text,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 13. consumables_items
create table public.consumables_items (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id),
  name                  text not null,
  category              text,
  unit                  text,
  average_price         numeric(14, 2) not null default 0,
  default_supplier_id   uuid references public.suppliers(id) on delete set null,
  reorder_threshold     numeric(14, 2),
  has_expiry            boolean not null default false,
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- 14. consumables_purchases
create table public.consumables_purchases (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id),
  chantier_id       uuid references public.chantiers(id),  -- null = central depot
  supplier_id       uuid references public.suppliers(id) on delete set null,
  invoice_ref       text,
  purchased_at      date not null,
  payment_status    public.purchase_payment_state not null default 'pending',
  attachment_url    text,
  recorded_by       uuid references auth.users(id) on delete set null,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- 15. consumables_purchase_lines (extracted from purchases[].items[])
create table public.consumables_purchase_lines (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  purchase_id    uuid not null references public.consumables_purchases(id) on delete cascade,
  item_id        uuid not null references public.consumables_items(id),
  qty            numeric(14, 2) not null check (qty > 0),
  unit_price     numeric(14, 2) not null check (unit_price >= 0),
  total          numeric(14, 2) not null check (total >= 0),
  created_at     timestamptz not null default now()
);

-- 16. consumables_consumption
create table public.consumables_consumption (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  chantier_id    uuid not null references public.chantiers(id),
  task_id        uuid references public.tasks(id) on delete set null,
  item_id        uuid not null references public.consumables_items(id),
  qty            numeric(14, 2) not null check (qty > 0),
  used_at        date not null,
  recorded_by    uuid references auth.users(id) on delete set null,
  notes          text,
  is_loss        boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 17. consumables_transfers
create table public.consumables_transfers (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id),
  item_id             uuid not null references public.consumables_items(id),
  qty                 numeric(14, 2) not null check (qty > 0),
  from_chantier_id    uuid references public.chantiers(id),
  to_chantier_id      uuid references public.chantiers(id),
  transferred_at      date not null,
  notes               text,
  recorded_by         uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  check (
    (from_chantier_id is not null or to_chantier_id is not null)
    and (from_chantier_id is null
         or to_chantier_id is null
         or from_chantier_id <> to_chantier_id)
  )
);

-- 18. consumables_adjustments (loss / theft / damage / correction)
create table public.consumables_adjustments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  item_id        uuid not null references public.consumables_items(id),
  qty            numeric(14, 2) not null check (qty > 0),
  type           public.adjustment_category not null,
  adjusted_at    date not null,
  notes          text,
  recorded_by    uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 19. chantier_payments
create table public.chantier_payments (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  chantier_id    uuid not null references public.chantiers(id),
  payment_date   date not null,
  amount         numeric(14, 2) not null check (amount > 0),
  reference      text,
  attachment_url text,
  recorded_by    uuid references auth.users(id) on delete set null,
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);

-- 20. audit_log (append-only, populated by triggers, never client code)
--
-- This table will grow unbounded. When daily insert volume becomes painful
-- (rough rule of thumb: > 1M rows or > 5 GB), convert to a partitioned table:
--   CREATE TABLE audit_log (...) PARTITION BY RANGE (created_at);
-- with monthly partitions and a pg_partman-managed retention window. Not
-- worth the operational overhead at MVP scale.
create table public.audit_log (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id),
  user_id        uuid references auth.users(id) on delete set null,
  action         text not null,
  entity_type    text not null,
  entity_id      uuid,
  before         jsonb,
  after          jsonb,
  ip             inet,
  user_agent     text,
  created_at     timestamptz not null default now()
);

-- 21. user_preferences (replaces currentChantierId + similar UI state)
create table public.user_preferences (
  user_id            uuid not null references auth.users(id) on delete cascade,
  org_id             uuid not null references public.organizations(id),
  last_chantier_id   uuid references public.chantiers(id) on delete set null,
  locale_override    text,
  theme              text,
  updated_at         timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- ─── indexes ───────────────────────────────────────────────────────────

-- Soft-delete-aware unique constraints (one active row per logical key)
create unique index memberships_user_org_active_uq
  on public.memberships (user_id, org_id) where deleted_at is null;
create unique index chantier_assignments_member_chantier_active_uq
  on public.chantier_assignments (membership_id, chantier_id) where deleted_at is null;

create index on public.memberships              (org_id)                 where deleted_at is null;
create index on public.memberships              (user_id)                where deleted_at is null;
create index on public.chantiers                (org_id, status)         where deleted_at is null;
create index on public.chantier_assignments     (chantier_id)            where deleted_at is null;
create index on public.chantier_assignments     (membership_id)          where deleted_at is null;
create index on public.workers                  (org_id, status)         where deleted_at is null;
create index on public.workers                  (user_id)                where deleted_at is null and user_id is not null;
create index on public.attendance               (org_id, chantier_id, attendance_date);
create index on public.attendance               (worker_id, attendance_date);
create index on public.labor_entries            (org_id, chantier_id, entry_date);
create index on public.labor_entries            (worker_id, entry_date);
create index on public.tasks                    (chantier_id)            where deleted_at is null;
create index on public.tasks                    (parent_task_id)         where parent_task_id is not null;
create index on public.task_assignments         (worker_id);
create index on public.materiels                (org_id, type)           where deleted_at is null;
create index on public.materiel_deployments     (materiel_id)            where deleted_at is null;
create index on public.materiel_deployments     (chantier_id, start_date, end_date) where deleted_at is null;
create index on public.suppliers                (org_id)                 where deleted_at is null;
create index on public.consumables_items        (org_id)                 where deleted_at is null;
create index on public.consumables_purchases    (org_id, purchased_at desc) where deleted_at is null;
create index on public.consumables_purchases    (chantier_id)            where deleted_at is null and chantier_id is not null;
create index on public.consumables_purchases    (supplier_id)            where deleted_at is null and supplier_id is not null;
create index on public.consumables_purchase_lines (purchase_id);
create index on public.consumables_purchase_lines (item_id);
create index on public.consumables_consumption  (org_id, chantier_id, used_at) where deleted_at is null;
create index on public.consumables_consumption  (item_id)                where deleted_at is null;
create index on public.consumables_transfers    (org_id, transferred_at desc) where deleted_at is null;
create index on public.consumables_adjustments  (org_id, item_id, adjusted_at desc) where deleted_at is null;
create index on public.chantier_payments        (chantier_id, payment_date desc) where deleted_at is null;
create index on public.audit_log                (org_id, created_at desc);
create index on public.audit_log                (entity_type, entity_id, created_at desc);
create index on public.audit_log                (user_id, created_at desc);

-- ─── helper functions ──────────────────────────────────────────────────

-- All declared SECURITY DEFINER so RLS on memberships does not block
-- a user from discovering their own memberships during policy evaluation.

create or replace function app.user_orgs() returns setof uuid
language sql stable security definer set search_path = public as $$
  select org_id from public.memberships
  where user_id = auth.uid()
    and status = 'active'
    and deleted_at is null
$$;

create or replace function app.user_role_in_org(p_org_id uuid) returns public.org_role
language sql stable security definer set search_path = public as $$
  select role from public.memberships
  where user_id = auth.uid()
    and org_id  = p_org_id
    and status  = 'active'
    and deleted_at is null
  limit 1
$$;

create or replace function app.user_has_chantier(p_chantier_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select
    -- owner/admin auto-have every chantier in their org
    exists (
      select 1
      from public.memberships m
      join public.chantiers   c on c.org_id = m.org_id
      where m.user_id = auth.uid()
        and c.id      = p_chantier_id
        and m.status  = 'active'
        and m.deleted_at is null
        and m.role in ('owner', 'admin')
    )
    -- site_manager explicitly assigned
    or exists (
      select 1
      from public.chantier_assignments ca
      join public.memberships          m on m.id = ca.membership_id
      where m.user_id = auth.uid()
        and ca.chantier_id = p_chantier_id
        and m.status   = 'active'
        and m.deleted_at is null
        and ca.deleted_at is null
    )
$$;

create or replace function app.user_worker_id_in_org(p_org_id uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.workers
  where user_id = auth.uid()
    and org_id  = p_org_id
    and deleted_at is null
  limit 1
$$;

-- ─── trigger functions ─────────────────────────────────────────────────

create or replace function app.bump_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Audit writer. SECURITY DEFINER so it bypasses RLS on audit_log
-- (the audit_log has NO insert policy — only triggers may write).
--
-- Reads org_id from the row's JSONB representation rather than hard-coded
-- column refs, because the `organizations` table has no `org_id` column
-- (the row's own `id` IS the org_id). Special-cased explicitly below.
create or replace function app.write_audit() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare
  v_user uuid := auth.uid();
  v_org  uuid;
  v_id   uuid;
  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_row    := v_before;
    v_id     := old.id;
  elsif tg_op = 'UPDATE' then
    v_before := to_jsonb(old);
    v_after  := to_jsonb(new);
    v_row    := v_after;
    v_id     := new.id;
  else  -- INSERT
    v_after  := to_jsonb(new);
    v_row    := v_after;
    v_id     := new.id;
  end if;

  if tg_table_name = 'organizations' then
    v_org := v_id;
  else
    v_org := (v_row ->> 'org_id')::uuid;
  end if;

  insert into public.audit_log (org_id, user_id, action, entity_type, entity_id, before, after)
  values (v_org, v_user, lower(tg_op), tg_table_name, v_id, v_before, v_after);

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

-- Attendance → labor_entries sync.
-- Replicates current behaviour: cost = daily_rate + prime when status='P'.
-- Uses the worker's daily_rate AT TIME OF ATTENDANCE WRITE (snapshot).
-- If daily_rate changes later, prior entries are NOT retroactively recomputed.
-- This is a deliberate behavioural improvement over the current live-recompute
-- code; flag it if you'd prefer live computation in the DAL instead.
create or replace function app.sync_labor_entry() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_rate numeric(14, 2);
begin
  if tg_op = 'DELETE' then
    delete from public.labor_entries
    where source = 'attendance'
      and chantier_id = old.chantier_id
      and worker_id   = old.worker_id
      and entry_date  = old.attendance_date;
    return old;
  end if;

  if new.status = 'A' then
    -- absent → remove any prior attendance-sourced entry
    delete from public.labor_entries
    where source = 'attendance'
      and chantier_id = new.chantier_id
      and worker_id   = new.worker_id
      and entry_date  = new.attendance_date;
    return new;
  end if;

  -- status = 'P'
  select daily_rate into v_rate
  from public.workers where id = new.worker_id;

  insert into public.labor_entries
    (org_id, chantier_id, worker_id, entry_date, days, computed_cost, source)
  values
    (new.org_id, new.chantier_id, new.worker_id, new.attendance_date,
     1.0,
     coalesce(v_rate, 0) + coalesce(new.prime_amount, 0),
     'attendance')
  on conflict (chantier_id, worker_id, entry_date, source) do update set
    days          = excluded.days,
    computed_cost = excluded.computed_cost,
    updated_at    = now();

  return new;
end;
$$;

-- ─── RPC functions ─────────────────────────────────────────────────────

-- Atomic « create my first org »: inserts the organization AND the caller's
-- owner-membership in a single transaction. Necessary because:
--   1. `organizations_insert` policy allows anyone authenticated to create
--      an org, but
--   2. `memberships_insert` requires the caller to already be owner/admin
--      of the target org — chicken-and-egg without this SECURITY DEFINER.
--
-- Lives in `public` (not `app`) so PostgREST exposes it as an RPC —
-- Supabase only routes RPC calls to schemas in the "Exposed schemas"
-- list, which defaults to `public`. The internal helpers below stay in
-- `app` since they're called only from RLS policies, not from the client.
create or replace function public.create_organization_with_owner(p_input jsonb)
returns public.organizations
language plpgsql security definer set search_path = public, app as $$
declare
  v_user uuid := auth.uid();
  v_org  public.organizations;
begin
  if v_user is null then
    raise exception 'Must be authenticated to create an organisation';
  end if;

  if coalesce(p_input->>'name', '') = '' then
    raise exception 'Organisation name is required';
  end if;

  insert into public.organizations (
    name, legal_name, ice, rc, cnss, address, phone, email
  ) values (
    p_input->>'name',
    nullif(p_input->>'legal_name', ''),
    nullif(p_input->>'ice', ''),
    nullif(p_input->>'rc', ''),
    nullif(p_input->>'cnss', ''),
    nullif(p_input->>'address', ''),
    nullif(p_input->>'phone', ''),
    nullif(p_input->>'email', '')
  )
  returning * into v_org;

  insert into public.memberships (user_id, org_id, role, status, accepted_at)
  values (v_user, v_org.id, 'owner', 'active', now());

  return v_org;
end;
$$;

-- ─── enable RLS ────────────────────────────────────────────────────────

alter table public.organizations            enable row level security;
alter table public.memberships              enable row level security;
alter table public.chantiers                enable row level security;
alter table public.chantier_assignments     enable row level security;
alter table public.workers                  enable row level security;
alter table public.attendance               enable row level security;
alter table public.labor_entries            enable row level security;
alter table public.tasks                    enable row level security;
alter table public.task_assignments         enable row level security;
alter table public.materiels                enable row level security;
alter table public.materiel_deployments     enable row level security;
alter table public.suppliers                enable row level security;
alter table public.consumables_items        enable row level security;
alter table public.consumables_purchases    enable row level security;
alter table public.consumables_purchase_lines enable row level security;
alter table public.consumables_consumption  enable row level security;
alter table public.consumables_transfers    enable row level security;
alter table public.consumables_adjustments  enable row level security;
alter table public.chantier_payments        enable row level security;
alter table public.audit_log                enable row level security;
alter table public.user_preferences         enable row level security;

-- ─── policies ──────────────────────────────────────────────────────────
--
-- Convention:
--   <table>_select_member   : every active org-member can read
--   <table>_select_worker   : worker-narrowed read (only own rows)
--   <table>_write_admin     : owner / admin can INS/UPD/DEL
--   <table>_write_manager   : site_manager can INS/UPD (chantier-scoped)
-- Tables that workers MUST NOT read (consumables prices) have no worker policy.

-- organizations: members can read their own; only owners can update/delete.
create policy organizations_select on public.organizations
  for select to authenticated
  using (id in (select app.user_orgs()));

create policy organizations_insert on public.organizations
  for insert to authenticated
  with check (true);  -- anyone authenticated can create their own org (becomes owner via app flow)

create policy organizations_update on public.organizations
  for update to authenticated
  using (app.user_role_in_org(id) = 'owner')
  with check (app.user_role_in_org(id) = 'owner');

create policy organizations_delete on public.organizations
  for delete to authenticated
  using (app.user_role_in_org(id) = 'owner');

-- memberships: you can read your own; owners/admins can read/manage all in their orgs.
-- auth.uid() is wrapped in (select ...) so Postgres evaluates it once per
-- query instead of once per row — material speed-up on multi-row scans.
create policy memberships_select_self on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy memberships_select_admin on public.memberships
  for select to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy memberships_update_admin on public.memberships
  for update to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy memberships_update_self on public.memberships
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));  -- accept invite → set accepted_at + status='active'

create policy memberships_delete on public.memberships
  for delete to authenticated
  using (app.user_role_in_org(org_id) = 'owner');

-- chantiers: all members read; owner/admin write.
create policy chantiers_select on public.chantiers
  for select to authenticated
  using (org_id in (select app.user_orgs()));

create policy chantiers_write on public.chantiers
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

-- chantier_assignments: only owner/admin manage; manager can see own assignments.
create policy chantier_assignments_select_admin on public.chantier_assignments
  for select to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy chantier_assignments_select_self on public.chantier_assignments
  for select to authenticated
  using (membership_id in (select id from public.memberships where user_id = (select auth.uid())));

create policy chantier_assignments_write on public.chantier_assignments
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

-- workers: org members read names; only owner/admin write.
-- Workers see only their own row (so daily_rate of others stays hidden).
create policy workers_select_admin on public.workers
  for select to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'));

create policy workers_select_self on public.workers
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy workers_write on public.workers
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

-- attendance: owner/admin all; site_manager scoped to chantier; worker reads own.
create policy attendance_select_admin on public.attendance
  for select to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy attendance_select_manager on public.attendance
  for select to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  );

create policy attendance_select_worker on public.attendance
  for select to authenticated
  using (worker_id = app.user_worker_id_in_org(org_id));

create policy attendance_write_admin on public.attendance
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy attendance_write_manager on public.attendance
  for all to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  )
  with check (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  );

-- labor_entries: same access rules as attendance; never written by clients (trigger only).
create policy labor_entries_select_admin on public.labor_entries
  for select to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy labor_entries_select_manager on public.labor_entries
  for select to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  );

create policy labor_entries_select_worker on public.labor_entries
  for select to authenticated
  using (worker_id = app.user_worker_id_in_org(org_id));

-- Manual labor entries (source='manual') by owner/admin only.
create policy labor_entries_write_manual on public.labor_entries
  for all to authenticated
  using (
    source = 'manual'
    and app.user_role_in_org(org_id) in ('owner', 'admin')
  )
  with check (
    source = 'manual'
    and app.user_role_in_org(org_id) in ('owner', 'admin')
  );

-- tasks (planning): same as chantier scope.
create policy tasks_select_admin on public.tasks
  for select to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy tasks_select_manager on public.tasks
  for select to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  );

create policy tasks_select_worker_assigned on public.tasks
  for select to authenticated
  using (
    exists (
      select 1 from public.task_assignments ta
      where ta.task_id = tasks.id
        and ta.worker_id = app.user_worker_id_in_org(tasks.org_id)
    )
  );

create policy tasks_write_admin on public.tasks
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy tasks_write_manager on public.tasks
  for all to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  )
  with check (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  );

-- task_assignments
create policy task_assignments_select on public.task_assignments
  for select to authenticated
  using (org_id in (select app.user_orgs()));

create policy task_assignments_write_admin on public.task_assignments
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy task_assignments_write_manager on public.task_assignments
  for all to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and exists (
      select 1 from public.tasks t
      where t.id = task_assignments.task_id
        and app.user_has_chantier(t.chantier_id)
    )
  )
  with check (
    app.user_role_in_org(org_id) = 'site_manager'
    and exists (
      select 1 from public.tasks t
      where t.id = task_assignments.task_id
        and app.user_has_chantier(t.chantier_id)
    )
  );

-- materiels: org-wide visibility (owner/admin/manager); manager-write OK.
create policy materiels_select on public.materiels
  for select to authenticated
  using (
    org_id in (select app.user_orgs())
    and app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager')
  );

create policy materiels_write on public.materiels
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'));

-- materiel_deployments
create policy materiel_deployments_select on public.materiel_deployments
  for select to authenticated
  using (
    org_id in (select app.user_orgs())
    and app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager')
  );

create policy materiel_deployments_write_admin on public.materiel_deployments
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy materiel_deployments_write_manager on public.materiel_deployments
  for all to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  )
  with check (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  );

-- suppliers: owner/admin/manager read+write.
create policy suppliers_select on public.suppliers
  for select to authenticated
  using (
    org_id in (select app.user_orgs())
    and app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager')
  );

create policy suppliers_write on public.suppliers
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'));

-- consumables_items: owner/admin/manager read+write. Workers excluded.
create policy consumables_items_select on public.consumables_items
  for select to authenticated
  using (
    org_id in (select app.user_orgs())
    and app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager')
  );

create policy consumables_items_write on public.consumables_items
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'));

-- consumables_purchases: owner/admin all; manager only own chantiers + depot.
create policy consumables_purchases_select_admin on public.consumables_purchases
  for select to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy consumables_purchases_select_manager on public.consumables_purchases
  for select to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and (chantier_id is null or app.user_has_chantier(chantier_id))
  );

create policy consumables_purchases_write_admin on public.consumables_purchases
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy consumables_purchases_write_manager on public.consumables_purchases
  for all to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and (chantier_id is null or app.user_has_chantier(chantier_id))
  )
  with check (
    app.user_role_in_org(org_id) = 'site_manager'
    and (chantier_id is null or app.user_has_chantier(chantier_id))
  );

-- consumables_purchase_lines: inherit parent purchase access via org check.
create policy consumables_purchase_lines_select on public.consumables_purchase_lines
  for select to authenticated
  using (
    org_id in (select app.user_orgs())
    and app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager')
  );

create policy consumables_purchase_lines_write on public.consumables_purchase_lines
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'));

-- consumables_consumption
create policy consumables_consumption_select_admin on public.consumables_consumption
  for select to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy consumables_consumption_select_manager on public.consumables_consumption
  for select to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  );

create policy consumables_consumption_write_admin on public.consumables_consumption
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

create policy consumables_consumption_write_manager on public.consumables_consumption
  for all to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  )
  with check (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  );

-- consumables_transfers
create policy consumables_transfers_select on public.consumables_transfers
  for select to authenticated
  using (
    org_id in (select app.user_orgs())
    and app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager')
  );

create policy consumables_transfers_write on public.consumables_transfers
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'));

-- consumables_adjustments
create policy consumables_adjustments_select on public.consumables_adjustments
  for select to authenticated
  using (
    org_id in (select app.user_orgs())
    and app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager')
  );

create policy consumables_adjustments_write on public.consumables_adjustments
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin', 'site_manager'));

-- chantier_payments: owner/admin only (financial).
create policy chantier_payments_select on public.chantier_payments
  for select to authenticated
  using (
    app.user_role_in_org(org_id) in ('owner', 'admin')
    or (app.user_role_in_org(org_id) = 'site_manager' and app.user_has_chantier(chantier_id))
  );

create policy chantier_payments_write on public.chantier_payments
  for all to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'))
  with check (app.user_role_in_org(org_id) in ('owner', 'admin'));

-- audit_log: owner/admin SELECT only. No INSERT/UPDATE/DELETE policies =
-- those operations are denied except via SECURITY DEFINER triggers.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using (
    org_id in (select app.user_orgs())
    and app.user_role_in_org(org_id) in ('owner', 'admin')
  );

-- user_preferences: user's own only.
create policy user_preferences_select on public.user_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_preferences_write on public.user_preferences
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─── triggers ──────────────────────────────────────────────────────────

-- updated_at maintenance on every table that has the column
create trigger trg_bump_organizations             before update on public.organizations             for each row execute function app.bump_updated_at();
create trigger trg_bump_memberships               before update on public.memberships               for each row execute function app.bump_updated_at();
create trigger trg_bump_chantiers                 before update on public.chantiers                 for each row execute function app.bump_updated_at();
create trigger trg_bump_workers                   before update on public.workers                   for each row execute function app.bump_updated_at();
create trigger trg_bump_attendance                before update on public.attendance                for each row execute function app.bump_updated_at();
create trigger trg_bump_labor_entries             before update on public.labor_entries             for each row execute function app.bump_updated_at();
create trigger trg_bump_tasks                     before update on public.tasks                     for each row execute function app.bump_updated_at();
create trigger trg_bump_materiels                 before update on public.materiels                 for each row execute function app.bump_updated_at();
create trigger trg_bump_materiel_deployments      before update on public.materiel_deployments      for each row execute function app.bump_updated_at();
create trigger trg_bump_suppliers                 before update on public.suppliers                 for each row execute function app.bump_updated_at();
create trigger trg_bump_consumables_items         before update on public.consumables_items         for each row execute function app.bump_updated_at();
create trigger trg_bump_consumables_purchases     before update on public.consumables_purchases     for each row execute function app.bump_updated_at();
create trigger trg_bump_consumables_consumption   before update on public.consumables_consumption   for each row execute function app.bump_updated_at();
create trigger trg_bump_consumables_transfers     before update on public.consumables_transfers     for each row execute function app.bump_updated_at();
create trigger trg_bump_consumables_adjustments   before update on public.consumables_adjustments   for each row execute function app.bump_updated_at();
create trigger trg_bump_chantier_payments         before update on public.chantier_payments         for each row execute function app.bump_updated_at();
create trigger trg_bump_user_preferences          before update on public.user_preferences          for each row execute function app.bump_updated_at();

-- audit log triggers (excludes: audit_log itself, labor_entries [derived],
-- user_preferences [UI state])
create trigger trg_audit_organizations            after insert or update or delete on public.organizations            for each row execute function app.write_audit();
create trigger trg_audit_memberships              after insert or update or delete on public.memberships              for each row execute function app.write_audit();
create trigger trg_audit_chantier_assignments     after insert or update or delete on public.chantier_assignments     for each row execute function app.write_audit();
create trigger trg_audit_chantiers                after insert or update or delete on public.chantiers                for each row execute function app.write_audit();
create trigger trg_audit_chantier_payments        after insert or update or delete on public.chantier_payments        for each row execute function app.write_audit();
create trigger trg_audit_workers                  after insert or update or delete on public.workers                  for each row execute function app.write_audit();
create trigger trg_audit_attendance               after insert or update or delete on public.attendance               for each row execute function app.write_audit();
create trigger trg_audit_tasks                    after insert or update or delete on public.tasks                    for each row execute function app.write_audit();
create trigger trg_audit_task_assignments         after insert or update or delete on public.task_assignments         for each row execute function app.write_audit();
create trigger trg_audit_materiels                after insert or update or delete on public.materiels                for each row execute function app.write_audit();
create trigger trg_audit_materiel_deployments     after insert or update or delete on public.materiel_deployments     for each row execute function app.write_audit();
create trigger trg_audit_suppliers                after insert or update or delete on public.suppliers                for each row execute function app.write_audit();
create trigger trg_audit_consumables_items        after insert or update or delete on public.consumables_items        for each row execute function app.write_audit();
create trigger trg_audit_consumables_purchases    after insert or update or delete on public.consumables_purchases    for each row execute function app.write_audit();
create trigger trg_audit_consumables_purchase_lines after insert or update or delete on public.consumables_purchase_lines for each row execute function app.write_audit();
create trigger trg_audit_consumables_consumption  after insert or update or delete on public.consumables_consumption  for each row execute function app.write_audit();
create trigger trg_audit_consumables_transfers    after insert or update or delete on public.consumables_transfers    for each row execute function app.write_audit();
create trigger trg_audit_consumables_adjustments  after insert or update or delete on public.consumables_adjustments  for each row execute function app.write_audit();

-- attendance → labor_entries sync
create trigger trg_sync_labor_entry
  after insert or update or delete on public.attendance
  for each row execute function app.sync_labor_entry();

-- ─── grants ────────────────────────────────────────────────────────────

grant usage on schema app to authenticated;

-- Revoke from public first so we know exactly who can call these.
revoke execute on function app.user_orgs()                              from public;
revoke execute on function app.user_role_in_org(uuid)                   from public;
revoke execute on function app.user_has_chantier(uuid)                  from public;
revoke execute on function app.user_worker_id_in_org(uuid)              from public;
revoke execute on function app.bump_updated_at()                        from public;
revoke execute on function app.write_audit()                            from public;
revoke execute on function app.sync_labor_entry()                       from public;
revoke execute on function public.create_organization_with_owner(jsonb) from public;

grant execute on function app.user_orgs()                              to authenticated;
grant execute on function app.user_role_in_org(uuid)                   to authenticated;
grant execute on function app.user_has_chantier(uuid)                  to authenticated;
grant execute on function app.user_worker_id_in_org(uuid)              to authenticated;
grant execute on function public.create_organization_with_owner(jsonb) to authenticated;
-- Trigger-only functions (bump_updated_at, write_audit, sync_labor_entry)
-- are intentionally NOT granted to authenticated. Triggers run as the
-- function owner (SECURITY DEFINER) regardless of who fires them.

-- Table privileges. RLS gates per-row; table grants gate per-relation.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke insert, update, delete on public.audit_log from authenticated;  -- triggers only

-- Default privileges so future tables (later migrations) inherit grants.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
