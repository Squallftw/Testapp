-- supabase/tests/rls/alerts.sql
-- pgTAP scope tests: alerts visibility is org+role+chantier scoped.
-- Prereq: `create extension if not exists pgtap;` on the test DB.
--
-- PLACEHOLDERS: <uuid-of-owner-a>, <uuid-of-owner-b>, <uuid-of-worker-a>,
-- <uuid-of-manager-a-x> must be replaced with actual auth.users IDs from
-- the test fixture once supabase/tests/fixtures/ is wired up (see
-- FOLLOW_UPS.md → "RLS cross-tenant test suite").

begin;
select plan(6);

-- Setup: two orgs, three users (owner_a, owner_b, manager_a_chantierX),
-- one alert per org plus one chantier-scoped alert each.
set local role postgres;

-- Reset
delete from public.alerts where fingerprint like 'test:%';
-- (Assume orgs A and B exist from prior fixture; otherwise create here.)

-- Insert two test alerts via service role
insert into public.alerts (org_id, kind, severity, title, fingerprint)
  select id, 'chantier_overdue', 'warning', 'test', 'test:org-a'
  from public.organizations where name = 'Org A' limit 1;
insert into public.alerts (org_id, kind, severity, title, fingerprint)
  select id, 'chantier_overdue', 'warning', 'test', 'test:org-b'
  from public.organizations where name = 'Org B' limit 1;

-- Test 1: owner of A sees A's alert
set local role authenticated;
set local request.jwt.claims = '{ "sub": "<uuid-of-owner-a>", "role": "authenticated" }';
select is(
  (select count(*) from public.alerts where fingerprint = 'test:org-a'),
  1::bigint,
  'owner of org A sees their alert'
);

-- Test 2: owner of A does NOT see B's alert (cross-tenant)
select is(
  (select count(*) from public.alerts where fingerprint = 'test:org-b'),
  0::bigint,
  'owner of org A does NOT see org B alert'
);

-- Test 3: owner of B sees B's alert
set local request.jwt.claims = '{ "sub": "<uuid-of-owner-b>", "role": "authenticated" }';
select is(
  (select count(*) from public.alerts where fingerprint = 'test:org-b'),
  1::bigint,
  'owner of org B sees their alert'
);

-- Test 4: worker of A sees no alerts (alerts_select policy excludes worker)
set local request.jwt.claims = '{ "sub": "<uuid-of-worker-a>", "role": "authenticated" }';
select is(
  (select count(*) from public.alerts),
  0::bigint,
  'worker sees zero alerts'
);

-- Test 5: site_manager only sees alerts for their assigned chantiers
-- (use a chantier-scoped alert)
set local role postgres;
insert into public.alerts (org_id, chantier_id, kind, severity, title, fingerprint)
  select c.org_id, c.id, 'chantier_overdue', 'warning', 'test',
         'test:org-a-chantier-x'
  from public.chantiers c
  where c.name = 'Chantier X (org A)' limit 1;

set local role authenticated;
set local request.jwt.claims = '{ "sub": "<uuid-of-manager-a-x>", "role": "authenticated" }';
select is(
  (select count(*) from public.alerts where chantier_id is not null),
  1::bigint,
  'site_manager sees their assigned chantier alert'
);

-- Test 6: site_manager does NOT see another chantier's alert
set local role postgres;
insert into public.alerts (org_id, chantier_id, kind, severity, title, fingerprint)
  select c.org_id, c.id, 'chantier_overdue', 'warning', 'test',
         'test:org-a-chantier-y'
  from public.chantiers c
  where c.name = 'Chantier Y (org A, NOT assigned to manager)' limit 1;

set local role authenticated;
set local request.jwt.claims = '{ "sub": "<uuid-of-manager-a-x>", "role": "authenticated" }';
select is(
  (select count(*) from public.alerts
     where fingerprint = 'test:org-a-chantier-y'),
  0::bigint,
  'site_manager does NOT see unassigned chantier alert'
);

-- Cleanup
set local role postgres;
delete from public.alerts where fingerprint like 'test:%';

select * from finish();
rollback;
