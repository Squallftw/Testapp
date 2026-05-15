-- ─────────────────────────────────────────────────────────────────────
-- BatiTrack — Normalized schema (FUTURE migration target)
--
-- This is NOT the script you run today. It's the design for when you
-- outgrow the JSONB-blob approach in schema.sql:
--   • You need cross-row queries (e.g. "average labour cost per project")
--   • You need multi-tenant orgs (D4 in the plan)
--   • You need to share rows between users
--
-- A migration script that copies data from app_state.data → these tables
-- is provided at the bottom (commented out — adapt before running).
-- ─────────────────────────────────────────────────────────────────────

-- 1. Projects ──────────────────────────────────────────────────────────
create table if not exists public.projects (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  name           text not null,
  start_date     date not null,
  devis_client   numeric default 0,
  budget_interne numeric default 0,
  budget_locked  boolean default false,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);
create index if not exists idx_projects_user on public.projects(user_id);

-- 2. UI state per user ────────────────────────────────────────────────
create table if not exists public.ui_state (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  active_tab         text default 'overview',
  ressources_subtab  text default 'apercu',
  pointage_date      date default current_date,
  gantt_day_px       int  default 36,
  gantt_scroll       int  default 0,
  active_project_id  uuid references public.projects(id) on delete set null,
  updated_at         timestamptz default now()
);

-- 3. Tasks (Gantt) ────────────────────────────────────────────────────
create table if not exists public.tasks (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete cascade,
  name            text not null,
  duration        int default 1,
  status          text default 'todo' check (status in ('todo','in_progress','done')),
  parent_id       uuid references public.tasks(id) on delete cascade,
  order_index     int default 0,
  start_date      date,          -- manual override; null = sequential auto-placement
  workforce       jsonb,         -- { unit, qty, prod_rate, loc }
  assigned_workers uuid[] default '{}',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists idx_tasks_user on public.tasks(user_id);
create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_tasks_parent on public.tasks(parent_id);

-- 4. Workers ──────────────────────────────────────────────────────────
create table if not exists public.workers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  role       text,
  skill      text,
  rate       numeric default 0,
  avail      text default 'disponible',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_workers_user on public.workers(user_id);

-- 5. Pointages (daily timesheet) ──────────────────────────────────────
create table if not exists public.pointages (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  worker_id   uuid not null references public.workers(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete set null,
  date        date not null,
  present     boolean default false,
  hours       numeric default 0,
  bonus       numeric default 0,
  note        text default '',
  rate_snapshot numeric,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (worker_id, date)  -- one pointage per worker per day
);
create index if not exists idx_pointages_user on public.pointages(user_id);
create index if not exists idx_pointages_date on public.pointages(date);
create index if not exists idx_pointages_worker on public.pointages(worker_id);

-- 6. Sous-traitants ───────────────────────────────────────────────────
create table if not exists public.soustraitants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  name        text not null,
  specialite  text,
  forfait     numeric default 0,
  task_id     uuid references public.tasks(id) on delete set null,
  note        text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_soustraitants_user on public.soustraitants(user_id);

-- 6b. Sous-traitant payments ──────────────────────────────────────────
create table if not exists public.soustraitant_payments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  soustraitant_id uuid not null references public.soustraitants(id) on delete cascade,
  date            date not null,
  amount          numeric not null default 0,
  note            text default '',
  created_at      timestamptz default now()
);
create index if not exists idx_strait_pay_strait on public.soustraitant_payments(soustraitant_id);

-- 7. Matériaux ────────────────────────────────────────────────────────
create table if not exists public.materials (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,
  task_id     uuid references public.tasks(id) on delete set null,
  date        date,
  name        text not null,
  category    text default 'autre',
  qty         numeric default 0,
  unit        text default 'unité',
  unit_price  numeric default 0,
  cost        numeric default 0,
  supplier    text default '',
  note        text default '',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);
create index if not exists idx_materials_user on public.materials(user_id);

-- 8. Matériel (equipment) ─────────────────────────────────────────────
create table if not exists public.equipment (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  project_id      uuid references public.projects(id) on delete cascade,
  task_id         uuid references public.tasks(id) on delete set null,
  kind            text not null check (kind in ('location','propriete')),
  name            text not null,
  category        text default 'autre',
  -- location-only
  supplier        text,
  daily_rate      numeric,
  start_date      date,
  end_date        date,
  -- propriete-only
  purchase_date   date,
  purchase_cost   numeric,
  allocation_pct  numeric default 100,
  note            text default '',
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists idx_equipment_user on public.equipment(user_id);

-- 9. updated_at trigger (shared) ──────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array[
      'projects','ui_state','tasks','workers','pointages',
      'soustraitants','materials','equipment'
    ]) loop
    execute format('drop trigger if exists %I_touch on public.%I', t, t);
    execute format('create trigger %I_touch before update on public.%I for each row execute function public.touch_updated_at()', t, t);
  end loop;
end $$;

-- 10. RLS policies (uniform: owner can do anything) ──────────────────
do $$
declare t text;
begin
  for t in select unnest(array[
      'projects','ui_state','tasks','workers','pointages',
      'soustraitants','soustraitant_payments','materials','equipment'
    ]) loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

-- 11. Auto-seed on signup ────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare proj_id uuid;
begin
  insert into public.projects (user_id, name, start_date, devis_client, budget_interne)
  values (new.id, 'Nouveau chantier', current_date, 0, 0)
  returning id into proj_id;

  insert into public.ui_state (user_id, active_project_id)
  values (new.id, proj_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────
-- MIGRATION FROM JSONB BLOB → NORMALIZED (uncomment + adapt)
-- ─────────────────────────────────────────────────────────────────────
-- This block reads each user's app_state.data and explodes it into the
-- tables above. Run it ONCE after schema is in place and BEFORE
-- switching the client to the normalized adapter.
--
-- do $mig$
-- declare
--   r record;
--   t jsonb;
--   pid uuid;
-- begin
--   for r in select user_id, data from public.app_state loop
--     insert into public.projects (id, user_id, name, start_date, devis_client, budget_interne, budget_locked)
--     values (
--       (r.data->'project'->>'id')::uuid,
--       r.user_id,
--       r.data->'project'->>'name',
--       (r.data->'project'->>'start_date')::date,
--       coalesce((r.data->'project'->>'devis_client')::numeric, 0),
--       coalesce((r.data->'project'->>'budget_interne')::numeric, 0),
--       coalesce((r.data->'project'->>'budget_locked')::boolean, false)
--     ) on conflict (id) do nothing returning id into pid;
--
--     for t in select jsonb_array_elements(r.data->'workers') loop
--       insert into public.workers (id, user_id, name, role, skill, rate, avail)
--       values ((t->>'id')::uuid, r.user_id, t->>'name', t->>'role', t->>'skill',
--               coalesce((t->>'rate')::numeric, 0), coalesce(t->>'avail', 'disponible'))
--       on conflict (id) do nothing;
--     end loop;
--
--     -- repeat for tasks, pointages, soustraitants, materials, equipment …
--   end loop;
-- end $mig$;
