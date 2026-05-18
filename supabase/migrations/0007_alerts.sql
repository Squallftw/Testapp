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
  dismissed_by    uuid references auth.users(id),
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

-- UPDATE: dismiss only, same scope as SELECT, dismissed_by must be self.
create policy alerts_dismiss on public.alerts for update to authenticated
  using (
    app.user_role_in_org(org_id) in ('owner','admin')
    or (
      app.user_role_in_org(org_id) = 'site_manager'
      and (chantier_id is null or app.user_has_chantier(chantier_id))
    )
  )
  with check (
    dismissed_by = auth.uid()
  );

-- INSERT/DELETE: service role only — no policy means PostgREST denies.
-- The Edge Function uses the service_role key which bypasses RLS.
