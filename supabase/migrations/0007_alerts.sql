-- 0007_alerts.sql
-- Adds the alerts table: persistent alert state for the Watchdog engine.
-- Three-state lifecycle (active / resolved / dismissed) enforced via a
-- partial unique index on (org_id, fingerprint) WHERE alert is active.

create type public.alert_severity as enum ('info', 'warning', 'critical');

create type public.alert_kind as enum (
  'budget_burn_forecast',
  'budget_category_exceeded',
  'chantier_overdue',
  'task_overdue',
  'stock_low',
  'cash_negative',
  'supplier_purchase_aging',
  'consumption_anomaly',
  'daily_entry_missing'   -- declared now; Phase 2 wires the rule
);

create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations(id),
  chantier_id     uuid references public.chantiers(id),
  kind            public.alert_kind not null,
  severity        public.alert_severity not null,
  title           text not null,
  body            text,
  payload         jsonb not null default '{}'::jsonb,
  entity_id       uuid,
  fingerprint     text not null,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  resolved_at     timestamptz,
  dismissed_at    timestamptz,
  dismissed_by    uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index alerts_active_fingerprint
  on public.alerts (org_id, fingerprint)
  where resolved_at is null and dismissed_at is null;

create index alerts_chantier_active
  on public.alerts (org_id, chantier_id)
  where resolved_at is null and dismissed_at is null;

create index alerts_org_created
  on public.alerts (org_id, created_at desc);

alter table public.alerts enable row level security;

-- SELECT: org-scoped + role-aware. site_manager sees only their assigned
-- chantiers (or org-wide alerts with chantier_id NULL).
create policy alerts_select on public.alerts for select to authenticated
  using (
    app.user_role_in_org(org_id) in ('owner','admin')
    or (
      app.user_role_in_org(org_id) = 'site_manager'
      and (chantier_id is null or app.user_has_chantier(chantier_id))
    )
  );

-- INSERT/DELETE/UPDATE: no policy means PostgREST denies for end users.
-- Dismiss/undismiss happen via SECURITY DEFINER RPCs below so we can
-- column-scope the state transition (Postgres has no column-level RLS;
-- a permissive UPDATE policy would let callers overwrite title/body/etc).
-- The Edge Function uses the service_role key which bypasses RLS for
-- INSERT/DELETE.

-- ─── dismiss_alert(p_id) ──────────────────────────────────────────────
--
-- State transition RPC. Verifies the caller has SELECT access to the row
-- (same predicate as alerts_select), then flips dismissed_at / dismissed_by
-- and nothing else. Raises if the alert is already resolved or dismissed.

create or replace function public.dismiss_alert(p_id uuid)
returns public.alerts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_caller uuid := auth.uid();
  v_row    public.alerts;
begin
  if v_caller is null then
    raise exception 'Must be authenticated' using errcode = '42501';
  end if;

  -- Lock the target row so the visibility check and the update see the
  -- same state (prevents TOCTOU between SELECT and UPDATE).
  select * into v_row from public.alerts where id = p_id for update;

  if v_row.id is null then
    raise exception 'Alerte introuvable' using errcode = 'P0002';
  end if;

  -- Same visibility predicate as alerts_select.
  if not (
    app.user_role_in_org(v_row.org_id) in ('owner','admin')
    or (
      app.user_role_in_org(v_row.org_id) = 'site_manager'
      and (v_row.chantier_id is null or app.user_has_chantier(v_row.chantier_id))
    )
  ) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  if v_row.resolved_at is not null then
    raise exception 'Cette alerte est déjà résolue' using errcode = '22000';
  end if;
  if v_row.dismissed_at is not null then
    raise exception 'Cette alerte est déjà ignorée' using errcode = '22000';
  end if;

  update public.alerts
     set dismissed_at = now(),
         dismissed_by = v_caller,
         updated_at   = now()
   where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.dismiss_alert(uuid) from public;
grant  execute on function public.dismiss_alert(uuid) to authenticated;

-- ─── undismiss_alert(p_id) ────────────────────────────────────────────
--
-- Reverses a dismissal: clears dismissed_at / dismissed_by. Same caller
-- visibility check as dismiss_alert.

create or replace function public.undismiss_alert(p_id uuid)
returns public.alerts
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_caller uuid := auth.uid();
  v_row    public.alerts;
begin
  if v_caller is null then
    raise exception 'Must be authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.alerts where id = p_id for update;

  if v_row.id is null then
    raise exception 'Alerte introuvable' using errcode = 'P0002';
  end if;

  if not (
    app.user_role_in_org(v_row.org_id) in ('owner','admin')
    or (
      app.user_role_in_org(v_row.org_id) = 'site_manager'
      and (v_row.chantier_id is null or app.user_has_chantier(v_row.chantier_id))
    )
  ) then
    raise exception 'Access denied' using errcode = '42501';
  end if;

  if v_row.dismissed_at is null then
    raise exception 'Cette alerte n''est pas ignorée' using errcode = '22000';
  end if;

  update public.alerts
     set dismissed_at = null,
         dismissed_by = null,
         updated_at   = now()
   where id = p_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.undismiss_alert(uuid) from public;
grant  execute on function public.undismiss_alert(uuid) to authenticated;

-- ─── triggers ─────────────────────────────────────────────────────────
-- Match conventions from 0001: every table with updated_at gets a bump
-- trigger; every state-bearing table gets an audit trigger.

create trigger trg_bump_alerts
  before update on public.alerts
  for each row execute function app.bump_updated_at();

create trigger trg_audit_alerts
  after insert or update or delete on public.alerts
  for each row execute function app.write_audit();
