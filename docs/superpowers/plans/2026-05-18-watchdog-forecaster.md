# Watchdog & Forecaster Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an alert engine that detects 8 operational conditions on a cron schedule, persists alerts in a new `alerts` table, and surfaces them through a topbar bell + per-chantier badge + `/alertes` inbox page + HomePage panel.

**Architecture:** Supabase Edge Function (Deno) invoked by `pg_cron` every 15 min. Each rule is split into a **pure logic function** (testable with fixtures) + a **fetch wrapper** + an **async recompute** that ties them together. The engine orchestrator loops orgs × rules, UPSERTs into `alerts` via a partial-unique-indexed slot, and auto-resolves stale alerts. Frontend reads via React Query with a 60 s poll.

**Tech Stack:**
- **DB:** Postgres 15 / Supabase, `pg_cron`, `pg_net`
- **Engine:** Supabase Edge Functions (Deno runtime), `@supabase/supabase-js`
- **Frontend:** React 18 + TypeScript + Tailwind, `@tanstack/react-query`, `@radix-ui/react-popover`
- **Tests:** Deno `std/assert` for rule unit tests, Vitest for frontend component tests, pgTAP for RLS

**Reference spec:** `docs/superpowers/specs/2026-05-18-watchdog-forecaster-design.md`

---

## File structure

```
supabase/
├── migrations/
│   └── 0007_alerts.sql                    # types + table + indexes + RLS
├── functions/
│   └── recompute-alerts/
│       ├── deno.json                      # imports map
│       ├── index.ts                       # HTTP entry
│       ├── engine.ts                      # orchestrator + upsert
│       ├── engine.test.ts
│       ├── types.ts                       # AlertCandidate, AlertKind, Severity
│       ├── helpers.ts                     # date math, MAD/% formatters
│       ├── helpers.test.ts
│       └── rules/
│           ├── budget_burn_forecast.ts
│           ├── budget_burn_forecast.test.ts
│           ├── budget_category_exceeded.ts
│           ├── budget_category_exceeded.test.ts
│           ├── chantier_overdue.ts
│           ├── chantier_overdue.test.ts
│           ├── task_overdue.ts
│           ├── task_overdue.test.ts
│           ├── stock_low.ts
│           ├── stock_low.test.ts
│           ├── cash_negative.ts
│           ├── cash_negative.test.ts
│           ├── supplier_purchase_aging.ts
│           ├── supplier_purchase_aging.test.ts
│           ├── consumption_anomaly.ts
│           └── consumption_anomaly.test.ts
└── tests/
    └── rls/
        └── alerts.sql                     # pgTAP RLS scope tests

src/
├── data/
│   └── alerts.ts                          # DAL: list, listForChantier, dismiss, undismiss
├── components/
│   └── alerts/
│       ├── AlertCard.tsx                  # reusable, size='compact' | 'default'
│       ├── AlertCard.test.tsx
│       ├── AlertsBell.tsx                 # topbar bell + Radix popover
│       ├── AlertsPanel.tsx                # inline per-chantier list
│       └── AlertesSection.tsx             # HomePage top-5 block
└── pages/
    └── alertes/
        └── AlertsPage.tsx                 # full inbox at /alertes

EDITS:
- src/App.tsx                                # add /alertes route
- src/components/Sidebar.tsx                 # « Alertes » nav item with badge
- src/components/AppShell.tsx                # mount bell in topbar
- src/pages/HomePage.tsx                     # slot <AlertesSection />
- src/pages/chantiers/ChantiersListPage.tsx  # alert pill on rows
- src/pages/chantiers/ChantierDetailPage.tsx # « N alertes » chip in header
- src/pages/budget/ChantierBudgetView.tsx    # <AlertsPanel /> at top of Budget tab
- FOLLOW_UPS.md                              # tick off watchdog/alerts items
```

**Rule structure pattern** — every rule splits IO from logic:

```ts
// pure logic (tested with fixtures)
export function computeXxx(input: XxxInput): AlertCandidate[]
// IO (smoke-tested manually)
export async function fetchXxxData(supabase, orgId): Promise<XxxInput>
// wrapper used by engine.ts
export async function recompute(supabase, orgId): Promise<AlertCandidate[]>
```

This pattern makes tests pure functions over fixtures — no Supabase mocking required.

---

## Task 1: SQL migration `0007_alerts.sql`

**Files:**
- Create: `supabase/migrations/0007_alerts.sql`

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Apply the migration locally**

Open the Supabase SQL Editor for your dev project and paste the contents of `supabase/migrations/0007_alerts.sql`. Run.

Expected: no errors. Confirm with this query:

```sql
select column_name, data_type
  from information_schema.columns
 where table_schema='public' and table_name='alerts'
 order by ordinal_position;
```

Expected output includes `id`, `org_id`, `chantier_id`, `kind`, `severity`, `title`, `body`, `payload`, `entity_id`, `fingerprint`, `first_seen_at`, `last_seen_at`, `resolved_at`, `dismissed_at`, `dismissed_by`, `created_at`, `updated_at`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0007_alerts.sql
git commit -m "feat(alerts): add 0007_alerts.sql migration"
```

---

## Task 2: pgTAP RLS test for the alerts table

**Files:**
- Create: `supabase/tests/rls/alerts.sql`

Note: The pgTAP CI integration is listed in `FOLLOW_UPS.md` as not-yet-set-up. Write the test file even if you can't yet run it via CI — it lands as soon as that infra arrives. Manual runs are possible if `pgtap` extension is installed (`create extension pgtap;` on the dev DB).

- [ ] **Step 1: Write the RLS test file**

```sql
-- supabase/tests/rls/alerts.sql
-- pgTAP scope tests: alerts visibility is org+role+chantier scoped.
-- Prereq: `create extension if not exists pgtap;` on the test DB.

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
```

**NOTE for the implementer:** Replace `<uuid-of-owner-a>`, etc. with the actual user UUIDs from your `auth.users` fixture, or convert this into a fixture-aware template once `supabase/tests/fixtures/` is set up. The replacement strategy is described in `FOLLOW_UPS.md` under "RLS cross-tenant test suite".

- [ ] **Step 2: Commit**

```bash
git add supabase/tests/rls/alerts.sql
git commit -m "test(alerts): add pgTAP RLS scope tests"
```

---

## Task 3: Edge Function scaffold + types + helpers

**Files:**
- Create: `supabase/functions/recompute-alerts/deno.json`
- Create: `supabase/functions/recompute-alerts/types.ts`
- Create: `supabase/functions/recompute-alerts/helpers.ts`
- Create: `supabase/functions/recompute-alerts/helpers.test.ts`

- [ ] **Step 1: Write `deno.json`**

```json
{
  "imports": {
    "std/": "https://deno.land/std@0.220.0/",
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.45.4"
  }
}
```

- [ ] **Step 2: Write `types.ts`**

```ts
// supabase/functions/recompute-alerts/types.ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type AlertKind =
  | 'budget_burn_forecast'
  | 'budget_category_exceeded'
  | 'chantier_overdue'
  | 'task_overdue'
  | 'stock_low'
  | 'cash_negative'
  | 'supplier_purchase_aging'
  | 'consumption_anomaly';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertCandidate {
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string;
  chantier_id: string | null;
  entity_id: string | null;
  fingerprint: string;
  payload: Record<string, unknown>;
}

export interface Rule {
  kind: AlertKind;
  recompute: (sb: SupabaseClient, orgId: string) => Promise<AlertCandidate[]>;
}

export interface EngineSummary {
  orgs: number;
  inserted: number;
  refreshed: number;
  resolved: number;
  skipped_cooldown: number;
  errors: number;
}
```

- [ ] **Step 3: Write `helpers.test.ts` (TDD — failing test first)**

```ts
// supabase/functions/recompute-alerts/helpers.test.ts
import { assertEquals } from 'std/assert/mod.ts';
import { daysBetween, formatMAD, formatPercent, todayIso } from './helpers.ts';

Deno.test('daysBetween: inclusive of both ends', () => {
  assertEquals(daysBetween('2026-05-01', '2026-05-10'), 10);
  assertEquals(daysBetween('2026-05-01', '2026-05-01'), 1);
});

Deno.test('daysBetween: negative when end < start', () => {
  assertEquals(daysBetween('2026-05-10', '2026-05-01'), -8);
});

Deno.test('formatMAD: integer MAD with thousands sep', () => {
  assertEquals(formatMAD(12345), '12 345 MAD');
  assertEquals(formatMAD(0), '0 MAD');
  assertEquals(formatMAD(1000000), '1 000 000 MAD');
});

Deno.test('formatPercent: integer percent', () => {
  assertEquals(formatPercent(0.928), '93 %');
  assertEquals(formatPercent(1.123), '112 %');
  assertEquals(formatPercent(0), '0 %');
});

Deno.test('todayIso: yyyy-mm-dd in UTC', () => {
  // Smoke check: matches /^\d{4}-\d{2}-\d{2}$/
  const t = todayIso();
  assertEquals(/^\d{4}-\d{2}-\d{2}$/.test(t), true);
});
```

- [ ] **Step 4: Run the test — verify it fails (file doesn't exist yet)**

Run: `deno test supabase/functions/recompute-alerts/helpers.test.ts`
Expected: FAIL with "Cannot find module './helpers.ts'" or similar.

- [ ] **Step 5: Write `helpers.ts` to make the tests pass**

```ts
// supabase/functions/recompute-alerts/helpers.ts

/** Inclusive day count from start to end. Negative when end < start. */
export function daysBetween(startIso: string, endIso: string): number {
  const start = new Date(startIso + 'T00:00:00Z').getTime();
  const end = new Date(endIso + 'T00:00:00Z').getTime();
  return Math.round((end - start) / 86_400_000) + (end >= start ? 1 : -1);
}

/** Format an amount in MAD with non-breaking thousand separators. */
export function formatMAD(amount: number): string {
  const rounded = Math.round(amount);
  const withSep = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${withSep} MAD`;
}

/** Format a ratio (0.93 → "93 %"). Always rounds to integer percent. */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)} %`;
}

/** Today as yyyy-mm-dd in UTC. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
```

- [ ] **Step 6: Run the test — verify it passes**

Run: `deno test supabase/functions/recompute-alerts/helpers.test.ts`
Expected: PASS (5 ok).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/recompute-alerts/
git commit -m "feat(alerts): scaffold Edge Function with types + helpers"
```

---

## Task 4: Engine orchestrator

**Files:**
- Create: `supabase/functions/recompute-alerts/engine.ts`
- Create: `supabase/functions/recompute-alerts/engine.test.ts`

The engine takes a list of `Rule`s and for each org:
1. Calls each rule's `recompute(supabase, orgId)` to get candidates.
2. For each candidate: UPSERT into the active slot, honouring the 7-day dismiss cooldown.
3. Auto-resolves active alerts whose `kind` matches the rule but whose fingerprint isn't in this pass's candidates.

We test the orchestrator using stub rules + a stub Supabase client.

- [ ] **Step 1: Write `engine.test.ts` (failing test first)**

```ts
// supabase/functions/recompute-alerts/engine.test.ts
import { assertEquals } from 'std/assert/mod.ts';
import { runEngine } from './engine.ts';
import type { Rule, AlertCandidate } from './types.ts';

// Minimal stub of the Supabase API surface our engine uses.
// We record calls and return canned data per query path.
function makeStub() {
  const calls: Array<{ op: string; table: string; args: unknown }> = [];
  const orgs = [{ id: 'org-1' }, { id: 'org-2' }];
  const existing: any[] = [];
  const upserts: any[] = [];
  const updates: any[] = [];

  const stub = {
    calls, upserts, updates,
    from(table: string) {
      return {
        select(_: string) {
          calls.push({ op: 'select', table, args: null });
          if (table === 'organizations') {
            return Promise.resolve({ data: orgs, error: null });
          }
          if (table === 'alerts') {
            return {
              eq: () => ({
                is: () => ({
                  is: () => ({
                    in: () => Promise.resolve({ data: existing, error: null }),
                  }),
                }),
              }),
            };
          }
          return Promise.resolve({ data: [], error: null });
        },
        upsert(rows: any, _opts: any) {
          calls.push({ op: 'upsert', table, args: rows });
          upserts.push(...(Array.isArray(rows) ? rows : [rows]));
          return Promise.resolve({ data: null, error: null });
        },
        update(patch: any) {
          calls.push({ op: 'update', table, args: patch });
          updates.push(patch);
          return {
            eq: () => ({ is: () => ({ is: () => ({ in: () => Promise.resolve({ data: null, error: null }) }) }) }),
          };
        },
      };
    },
  };
  return stub;
}

Deno.test('runEngine: rule with one candidate inserts one alert per org', async () => {
  const sb = makeStub();
  const rule: Rule = {
    kind: 'chantier_overdue',
    recompute: async (_sb, orgId) => [{
      kind: 'chantier_overdue',
      severity: 'warning',
      title: 'test',
      body: 'body',
      chantier_id: `${orgId}-chantier`,
      entity_id: null,
      fingerprint: `chantier_overdue:${orgId}-chantier`,
      payload: {},
    } as AlertCandidate],
  };
  const summary = await runEngine(sb as any, [rule]);
  assertEquals(summary.orgs, 2);
  assertEquals(sb.upserts.length, 2);
  assertEquals(sb.upserts[0].fingerprint, 'chantier_overdue:org-1-chantier');
  assertEquals(sb.upserts[1].fingerprint, 'chantier_overdue:org-2-chantier');
});

Deno.test('runEngine: rule with zero candidates triggers auto-resolve update', async () => {
  const sb = makeStub();
  const rule: Rule = {
    kind: 'chantier_overdue',
    recompute: async () => [],
  };
  await runEngine(sb as any, [rule]);
  // Auto-resolve issues an update setting resolved_at on stale rows.
  assertEquals(sb.updates.length >= 2, true); // one per org
  assertEquals(sb.updates[0].resolved_at !== undefined, true);
});

Deno.test('runEngine: rule errors do not crash the engine', async () => {
  const sb = makeStub();
  const ruleOk: Rule = {
    kind: 'chantier_overdue',
    recompute: async () => [],
  };
  const ruleBad: Rule = {
    kind: 'stock_low',
    recompute: async () => { throw new Error('boom'); },
  };
  const summary = await runEngine(sb as any, [ruleBad, ruleOk]);
  assertEquals(summary.errors >= 1, true);
  assertEquals(summary.orgs, 2);
});
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `deno test supabase/functions/recompute-alerts/engine.test.ts`
Expected: FAIL — `engine.ts` doesn't exist.

- [ ] **Step 3: Write `engine.ts`**

```ts
// supabase/functions/recompute-alerts/engine.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate, EngineSummary, Rule } from './types.ts';

const COOLDOWN_DAYS = 7;

export async function runEngine(
  sb: SupabaseClient,
  rules: Rule[]
): Promise<EngineSummary> {
  const summary: EngineSummary = {
    orgs: 0, inserted: 0, refreshed: 0, resolved: 0, skipped_cooldown: 0, errors: 0,
  };

  const orgsRes = await sb.from('organizations').select('id');
  const orgs = (orgsRes.data ?? []) as Array<{ id: string }>;
  summary.orgs = orgs.length;

  for (const org of orgs) {
    for (const rule of rules) {
      try {
        const candidates = await rule.recompute(sb, org.id);
        await reconcileRule(sb, org.id, rule, candidates, summary);
      } catch (err) {
        summary.errors += 1;
        console.error(`[engine] rule ${rule.kind} failed for org ${org.id}:`, err);
      }
    }
  }

  return summary;
}

async function reconcileRule(
  sb: SupabaseClient,
  orgId: string,
  rule: Rule,
  candidates: AlertCandidate[],
  summary: EngineSummary
): Promise<void> {
  // 1. Upsert each candidate. Honor 7-day cooldown after dismissal.
  for (const c of candidates) {
    // Check for a recent dismissal of the same fingerprint
    const dismissed = await sb
      .from('alerts')
      .select('id, dismissed_at')
      .eq('org_id', orgId)
      .eq('fingerprint', c.fingerprint)
      .is('resolved_at', null)
      .order('dismissed_at', { ascending: false })
      .limit(1);
    const recent = (dismissed.data as Array<{ dismissed_at: string | null }> | null)?.[0];
    if (recent?.dismissed_at) {
      const dismissedAt = new Date(recent.dismissed_at).getTime();
      const cutoff = Date.now() - COOLDOWN_DAYS * 86_400_000;
      if (dismissedAt > cutoff) {
        summary.skipped_cooldown += 1;
        continue;
      }
    }

    // UPSERT into the active slot.
    const row = {
      org_id: orgId,
      chantier_id: c.chantier_id,
      kind: c.kind,
      severity: c.severity,
      title: c.title,
      body: c.body,
      entity_id: c.entity_id,
      fingerprint: c.fingerprint,
      payload: c.payload,
      last_seen_at: new Date().toISOString(),
      resolved_at: null,
      dismissed_at: null,
    };
    const up = await sb
      .from('alerts')
      .upsert(row, { onConflict: 'org_id,fingerprint', ignoreDuplicates: false });
    if (up.error) {
      summary.errors += 1;
      console.error(`[engine] upsert failed for ${c.fingerprint}:`, up.error);
      continue;
    }
    summary.inserted += 1; // approx; refreshed vs inserted not distinguishable without RETURNING
  }

  // 2. Auto-resolve stale active alerts with this kind whose fingerprint isn't in the candidate set.
  const activeFingerprints = candidates.map((c) => c.fingerprint);
  const upd = await sb
    .from('alerts')
    .update({ resolved_at: new Date().toISOString() })
    .eq('org_id', orgId)
    .eq('kind', rule.kind)
    .is('resolved_at', null)
    .is('dismissed_at', null)
    .not('fingerprint', 'in', `(${activeFingerprints.map((f) => `"${f}"`).join(',') || '""'})`);
  if (upd.error) {
    summary.errors += 1;
  } else {
    summary.resolved += 1;
  }
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `deno test supabase/functions/recompute-alerts/engine.test.ts`
Expected: PASS (3 ok).

If the stub's chained query mocks don't match the real engine call shape, adjust the stub OR the engine until they agree — the test is the contract for the call sequence.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/recompute-alerts/engine.ts supabase/functions/recompute-alerts/engine.test.ts
git commit -m "feat(alerts): engine orchestrator with cooldown + auto-resolve"
```

---

## Task 5: Rule — `budget_burn_forecast`

**Files:**
- Create: `supabase/functions/recompute-alerts/rules/budget_burn_forecast.ts`
- Create: `supabase/functions/recompute-alerts/rules/budget_burn_forecast.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// supabase/functions/recompute-alerts/rules/budget_burn_forecast.test.ts
import { assertEquals } from 'std/assert/mod.ts';
import { computeBudgetBurnForecast } from './budget_burn_forecast.ts';

Deno.test('budget_burn_forecast: fires as warning when projected 100-110%', () => {
  // 31 days elapsed of 62 → spent 52k extrapolated to 104k → 104% of 100k budget.
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa', date_start: '2026-04-18', date_end_prev: '2026-06-18',
      budget_total: 100_000, total_spent: 52_000, status: 'active',
    }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].kind, 'budget_burn_forecast');
  assertEquals(result[0].severity, 'warning');
  assertEquals(result[0].fingerprint, 'budget_burn_forecast:c1');
});

Deno.test('budget_burn_forecast: critical when projected > 110%', () => {
  // 31 days elapsed of 62 → spent 60k extrapolated to 120k → 120% of 100k budget.
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa', date_start: '2026-04-18', date_end_prev: '2026-06-18',
      budget_total: 100_000, total_spent: 60_000, status: 'active',
    }],
  });
  assertEquals(result[0].severity, 'critical');
});

Deno.test('budget_burn_forecast: skips chantier <7 days elapsed', () => {
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa', date_start: '2026-05-15', date_end_prev: '2026-08-15',
      budget_total: 100_000, total_spent: 50_000, status: 'active',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('budget_burn_forecast: skips chantier >95% through timeline', () => {
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa',
      date_start: '2026-01-01', date_end_prev: '2026-05-20',
      budget_total: 100_000, total_spent: 200_000, status: 'active',
    }],
  });
  // 99% through timeline → covered by category_exceeded, not the forecast rule
  assertEquals(result.length, 0);
});

Deno.test('budget_burn_forecast: skips inactive chantier', () => {
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Atelier',
      date_start: '2026-01-01', date_end_prev: '2026-04-01',
      budget_total: 100_000, total_spent: 200_000, status: 'completed',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('budget_burn_forecast: skips chantier without dates', () => {
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa', date_start: null, date_end_prev: '2026-08-15',
      budget_total: 100_000, total_spent: 50_000, status: 'active',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('budget_burn_forecast: skips chantier with zero budget', () => {
  const today = '2026-05-18';
  const result = computeBudgetBurnForecast({
    today,
    chantiers: [{
      id: 'c1', name: 'Villa', date_start: '2026-04-01', date_end_prev: '2026-07-01',
      budget_total: 0, total_spent: 50_000, status: 'active',
    }],
  });
  assertEquals(result.length, 0);
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `deno test supabase/functions/recompute-alerts/rules/budget_burn_forecast.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `budget_burn_forecast.ts`**

```ts
// supabase/functions/recompute-alerts/rules/budget_burn_forecast.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, formatMAD, formatPercent, todayIso } from '../helpers.ts';

export interface ForecastChantier {
  id: string;
  name: string;
  date_start: string | null;
  date_end_prev: string | null;
  budget_total: number;
  total_spent: number;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
}

export interface ForecastInput {
  today: string;
  chantiers: ForecastChantier[];
}

export function computeBudgetBurnForecast(input: ForecastInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const c of input.chantiers) {
    if (c.status !== 'active') continue;
    if (!c.date_start || !c.date_end_prev) continue;
    if (c.budget_total <= 0) continue;

    const daysElapsed = daysBetween(c.date_start, input.today);
    const daysTotal = daysBetween(c.date_start, c.date_end_prev);
    if (daysElapsed < 7) continue;
    if (daysTotal <= 0) continue;
    if (daysElapsed / daysTotal >= 0.95) continue;

    const projected = (c.total_spent / daysElapsed) * daysTotal;
    const pct = projected / c.budget_total;
    if (pct <= 1.0) continue;

    out.push({
      kind: 'budget_burn_forecast',
      severity: pct > 1.1 ? 'critical' : 'warning',
      title: 'Risque de dépassement de budget',
      body: `Au rythme actuel, ${c.name} terminera à ${formatMAD(projected)} (${formatPercent(pct)} du budget de ${formatMAD(c.budget_total)}).`,
      chantier_id: c.id,
      entity_id: null,
      fingerprint: `budget_burn_forecast:${c.id}`,
      payload: {
        projected: Math.round(projected),
        budget_total: c.budget_total,
        pct,
        days_elapsed: daysElapsed,
        days_total: daysTotal,
      },
    });
  }
  return out;
}

export async function fetchForecastData(
  sb: SupabaseClient,
  orgId: string
): Promise<ForecastInput> {
  // Fetch active chantiers + their per-chantier spent totals.
  const { data: chantiers, error: cErr } = await sb
    .from('chantiers')
    .select('id, name, date_start, date_end_prev, budget_total, status')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'active');
  if (cErr) throw cErr;

  // total_spent comes from the existing budget engine view OR a per-chantier
  // RPC. For v1 we recompute it here via a single grouped query against
  // attendance + consumption + deployments (mirrors src/data/budget-engine.ts).
  // To keep the rule simple, we call a Postgres function:
  //   create function public.chantier_total_spent(p_chantier_id uuid) returns numeric
  // Since that function doesn't exist yet, v1 uses a simpler approach:
  //   it fetches and sums on the function side. See helper below.
  const result: ForecastInput = { today: todayIso(), chantiers: [] };
  for (const c of (chantiers ?? []) as Array<{ id: string; name: string; date_start: string | null; date_end_prev: string | null; budget_total: number; status: string }>) {
    const total_spent = await computeTotalSpent(sb, orgId, c.id);
    result.chantiers.push({
      id: c.id,
      name: c.name,
      date_start: c.date_start,
      date_end_prev: c.date_end_prev,
      budget_total: Number(c.budget_total),
      total_spent,
      status: c.status as ForecastChantier['status'],
    });
  }
  return result;
}

async function computeTotalSpent(sb: SupabaseClient, orgId: string, chantierId: string): Promise<number> {
  // Labour: sum daily_rate × P attendance + prime_amount
  const { data: att } = await sb
    .from('attendance')
    .select('worker_id, status, prime_amount')
    .eq('org_id', orgId)
    .eq('chantier_id', chantierId);
  const { data: workers } = await sb
    .from('workers')
    .select('id, daily_rate')
    .eq('org_id', orgId);
  const rates = new Map<string, number>((workers ?? []).map((w: any) => [w.id, Number(w.daily_rate) || 0]));
  let labour = 0;
  for (const a of (att ?? []) as any[]) {
    if (a.status === 'P') labour += rates.get(a.worker_id) ?? 0;
    labour += Number(a.prime_amount) || 0;
  }

  // Materials: sum qty × average_price
  const { data: cons } = await sb
    .from('consumables_consumption')
    .select('item_id, qty')
    .eq('org_id', orgId)
    .eq('chantier_id', chantierId)
    .is('deleted_at', null);
  const { data: items } = await sb
    .from('consumables_items')
    .select('id, average_price')
    .eq('org_id', orgId);
  const prices = new Map<string, number>((items ?? []).map((i: any) => [i.id, Number(i.average_price) || 0]));
  let materials = 0;
  for (const c of (cons ?? []) as any[]) {
    materials += Number(c.qty) * (prices.get(c.item_id) ?? 0);
  }

  // Equipment: sum deployment days × cost_per_day × qty
  const { data: deps } = await sb
    .from('materiel_deployments')
    .select('materiel_id, start_date, end_date, qty')
    .eq('org_id', orgId)
    .eq('chantier_id', chantierId)
    .is('deleted_at', null);
  const { data: materiels } = await sb
    .from('materiels')
    .select('id, cost_per_day')
    .eq('org_id', orgId);
  const costs = new Map<string, number>((materiels ?? []).map((m: any) => [m.id, Number(m.cost_per_day) || 0]));
  let equipment = 0;
  for (const d of (deps ?? []) as any[]) {
    const days = daysBetween(d.start_date, d.end_date);
    const cpd = costs.get(d.materiel_id) ?? 0;
    const q = Number(d.qty) || 1;
    equipment += Math.max(days, 0) * cpd * q;
  }

  return labour + materials + equipment;
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchForecastData(sb, orgId);
  return computeBudgetBurnForecast(input);
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `deno test supabase/functions/recompute-alerts/rules/budget_burn_forecast.test.ts`
Expected: PASS (7 ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/recompute-alerts/rules/budget_burn_forecast*
git commit -m "feat(alerts): budget_burn_forecast rule with pure logic + IO split"
```

---

## Task 6: Rule — `budget_category_exceeded`

**Files:**
- Create: `supabase/functions/recompute-alerts/rules/budget_category_exceeded.ts`
- Create: `supabase/functions/recompute-alerts/rules/budget_category_exceeded.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// supabase/functions/recompute-alerts/rules/budget_category_exceeded.test.ts
import { assertEquals } from 'std/assert/mod.ts';
import { computeCategoryExceeded } from './budget_category_exceeded.ts';

Deno.test('category_exceeded: fires only for categories where spent > budget', () => {
  // labor: 52/50 = 104% → warning; materials: 20/25 = 80% → skip; equipment: 0 budget → skip.
  const result = computeCategoryExceeded({
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active',
      budget_labor: 50_000, labor_spent: 52_000,
      budget_materials: 25_000, materials_spent: 20_000,
      budget_equipment: 0, equipment_spent: 0,
    }],
  });
  assertEquals(result.length, 1);
  const labor = result.find((r) => r.fingerprint === 'budget_category_exceeded:c1:labor')!;
  assertEquals(labor.severity, 'warning');
});

Deno.test('category_exceeded: critical when > 110%', () => {
  const result = computeCategoryExceeded({
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active',
      budget_labor: 50_000, labor_spent: 60_000,
      budget_materials: 25_000, materials_spent: 20_000,
      budget_equipment: 0, equipment_spent: 0,
    }],
  });
  const labor = result.find((r) => r.fingerprint === 'budget_category_exceeded:c1:labor')!;
  assertEquals(labor.severity, 'critical'); // 120% > 110%
});

Deno.test('category_exceeded: warning when 100% < pct <= 110%', () => {
  const result = computeCategoryExceeded({
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active',
      budget_labor: 50_000, labor_spent: 52_000,  // 104%
      budget_materials: 0, materials_spent: 0,
      budget_equipment: 0, equipment_spent: 0,
    }],
  });
  assertEquals(result[0].severity, 'warning');
});

Deno.test('category_exceeded: skips when budget = 0', () => {
  const result = computeCategoryExceeded({
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active',
      budget_labor: 0, labor_spent: 5000,
      budget_materials: 0, materials_spent: 0,
      budget_equipment: 0, equipment_spent: 0,
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('category_exceeded: skips inactive chantier', () => {
  const result = computeCategoryExceeded({
    chantiers: [{
      id: 'c1', name: 'Atelier', status: 'completed',
      budget_labor: 50_000, labor_spent: 60_000,
      budget_materials: 0, materials_spent: 0,
      budget_equipment: 0, equipment_spent: 0,
    }],
  });
  assertEquals(result.length, 0);
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `deno test supabase/functions/recompute-alerts/rules/budget_category_exceeded.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `budget_category_exceeded.ts`**

```ts
// supabase/functions/recompute-alerts/rules/budget_category_exceeded.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, formatMAD, formatPercent } from '../helpers.ts';

const CATEGORIES = [
  { key: 'labor',     label: 'main d\'œuvre' },
  { key: 'materials', label: 'matériaux' },
  { key: 'equipment', label: 'matériels' },
] as const;

export interface CategoryChantier {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  budget_labor: number;
  labor_spent: number;
  budget_materials: number;
  materials_spent: number;
  budget_equipment: number;
  equipment_spent: number;
}

export interface CategoryInput {
  chantiers: CategoryChantier[];
}

export function computeCategoryExceeded(input: CategoryInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const c of input.chantiers) {
    if (c.status !== 'active') continue;
    for (const cat of CATEGORIES) {
      const budget = c[`budget_${cat.key}` as keyof CategoryChantier] as number;
      const spent = c[`${cat.key}_spent` as keyof CategoryChantier] as number;
      if (budget <= 0) continue;
      if (spent <= budget) continue;
      const pct = spent / budget;
      out.push({
        kind: 'budget_category_exceeded',
        severity: pct > 1.1 ? 'critical' : 'warning',
        title: `Budget ${cat.label} dépassé`,
        body: `${cat.label} a consommé ${formatMAD(spent)} sur un budget de ${formatMAD(budget)} (${formatPercent(pct)}).`,
        chantier_id: c.id,
        entity_id: null,
        fingerprint: `budget_category_exceeded:${c.id}:${cat.key}`,
        payload: { category: cat.key, spent, budget, pct },
      });
    }
  }
  return out;
}

export async function fetchCategoryData(
  sb: SupabaseClient,
  orgId: string
): Promise<CategoryInput> {
  const { data: chantiers, error } = await sb
    .from('chantiers')
    .select('id, name, status, budget_labor, budget_materials, budget_equipment')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'active');
  if (error) throw error;

  // Compute per-category spent for each chantier — reuses the same approach
  // as budget_burn_forecast's computeTotalSpent but returns 3 numbers.
  const out: CategoryChantier[] = [];
  for (const c of (chantiers ?? []) as any[]) {
    const spent = await computeCategorySpent(sb, orgId, c.id);
    out.push({
      id: c.id,
      name: c.name,
      status: c.status,
      budget_labor: Number(c.budget_labor) || 0,
      labor_spent: spent.labor,
      budget_materials: Number(c.budget_materials) || 0,
      materials_spent: spent.materials,
      budget_equipment: Number(c.budget_equipment) || 0,
      equipment_spent: spent.equipment,
    });
  }
  return { chantiers: out };
}

async function computeCategorySpent(
  sb: SupabaseClient,
  orgId: string,
  chantierId: string
): Promise<{ labor: number; materials: number; equipment: number }> {
  // Labour
  const { data: att } = await sb
    .from('attendance')
    .select('worker_id, status, prime_amount')
    .eq('org_id', orgId).eq('chantier_id', chantierId);
  const { data: workers } = await sb.from('workers').select('id, daily_rate').eq('org_id', orgId);
  const rates = new Map((workers ?? []).map((w: any) => [w.id, Number(w.daily_rate) || 0]));
  let labor = 0;
  for (const a of (att ?? []) as any[]) {
    if (a.status === 'P') labor += rates.get(a.worker_id) ?? 0;
    labor += Number(a.prime_amount) || 0;
  }

  // Materials
  const { data: cons } = await sb
    .from('consumables_consumption')
    .select('item_id, qty')
    .eq('org_id', orgId).eq('chantier_id', chantierId)
    .is('deleted_at', null);
  const { data: items } = await sb.from('consumables_items').select('id, average_price').eq('org_id', orgId);
  const prices = new Map((items ?? []).map((i: any) => [i.id, Number(i.average_price) || 0]));
  let materials = 0;
  for (const c of (cons ?? []) as any[]) {
    materials += Number(c.qty) * (prices.get(c.item_id) ?? 0);
  }

  // Equipment
  const { data: deps } = await sb
    .from('materiel_deployments')
    .select('materiel_id, start_date, end_date, qty')
    .eq('org_id', orgId).eq('chantier_id', chantierId)
    .is('deleted_at', null);
  const { data: materiels } = await sb.from('materiels').select('id, cost_per_day').eq('org_id', orgId);
  const costs = new Map((materiels ?? []).map((m: any) => [m.id, Number(m.cost_per_day) || 0]));
  let equipment = 0;
  for (const d of (deps ?? []) as any[]) {
    const days = Math.max(0, daysBetween(d.start_date, d.end_date));
    equipment += days * (costs.get(d.materiel_id) ?? 0) * (Number(d.qty) || 1);
  }

  return { labor, materials, equipment };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchCategoryData(sb, orgId);
  return computeCategoryExceeded(input);
}
```

- [ ] **Step 4: Run test — verify it passes**

Run: `deno test supabase/functions/recompute-alerts/rules/budget_category_exceeded.test.ts`
Expected: PASS (5 ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/recompute-alerts/rules/budget_category_exceeded*
git commit -m "feat(alerts): budget_category_exceeded rule"
```

---

## Task 7: Rule — `chantier_overdue`

**Files:**
- Create: `supabase/functions/recompute-alerts/rules/chantier_overdue.ts`
- Create: `supabase/functions/recompute-alerts/rules/chantier_overdue.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// supabase/functions/recompute-alerts/rules/chantier_overdue.test.ts
import { assertEquals } from 'std/assert/mod.ts';
import { computeChantierOverdue } from './chantier_overdue.ts';

Deno.test('chantier_overdue: fires when date_end_prev passed and active', () => {
  const result = computeChantierOverdue({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_end_prev: '2026-05-15',
    }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'warning');  // 3 days late
  assertEquals(result[0].payload.days_late, 3);
});

Deno.test('chantier_overdue: critical when > 7 days late', () => {
  const result = computeChantierOverdue({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_end_prev: '2026-05-01',
    }],
  });
  assertEquals(result[0].severity, 'critical');
});

Deno.test('chantier_overdue: skips on-time chantier', () => {
  const result = computeChantierOverdue({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_end_prev: '2026-06-18',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('chantier_overdue: skips inactive chantier', () => {
  const result = computeChantierOverdue({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'completed', date_end_prev: '2026-05-01',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('chantier_overdue: skips chantier without date_end_prev', () => {
  const result = computeChantierOverdue({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_end_prev: null,
    }],
  });
  assertEquals(result.length, 0);
});
```

- [ ] **Step 2: Run — verify fails**

Run: `deno test supabase/functions/recompute-alerts/rules/chantier_overdue.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// supabase/functions/recompute-alerts/rules/chantier_overdue.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, todayIso } from '../helpers.ts';

export interface OverdueChantier {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  date_end_prev: string | null;
}

export interface OverdueInput {
  today: string;
  chantiers: OverdueChantier[];
}

export function computeChantierOverdue(input: OverdueInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const c of input.chantiers) {
    if (c.status !== 'active') continue;
    if (!c.date_end_prev) continue;
    const daysLate = daysBetween(c.date_end_prev, input.today) - 1;
    if (daysLate <= 0) continue;
    out.push({
      kind: 'chantier_overdue',
      severity: daysLate > 7 ? 'critical' : 'warning',
      title: 'Chantier en retard',
      body: `${c.name} devait se terminer le ${c.date_end_prev}, soit ${daysLate} jour${daysLate > 1 ? 's' : ''} de retard.`,
      chantier_id: c.id,
      entity_id: null,
      fingerprint: `chantier_overdue:${c.id}`,
      payload: { days_late: daysLate, date_end_prev: c.date_end_prev },
    });
  }
  return out;
}

export async function fetchOverdueData(sb: SupabaseClient, orgId: string): Promise<OverdueInput> {
  const { data, error } = await sb
    .from('chantiers')
    .select('id, name, status, date_end_prev')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'active');
  if (error) throw error;
  return {
    today: todayIso(),
    chantiers: (data ?? []) as OverdueChantier[],
  };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchOverdueData(sb, orgId);
  return computeChantierOverdue(input);
}
```

- [ ] **Step 4: Run — verify passes**

Run: `deno test supabase/functions/recompute-alerts/rules/chantier_overdue.test.ts`
Expected: PASS (5 ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/recompute-alerts/rules/chantier_overdue*
git commit -m "feat(alerts): chantier_overdue rule"
```

---

## Task 8: Rule — `task_overdue`

**Files:**
- Create: `supabase/functions/recompute-alerts/rules/task_overdue.ts`
- Create: `supabase/functions/recompute-alerts/rules/task_overdue.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { assertEquals } from 'std/assert/mod.ts';
import { computeTaskOverdue } from './task_overdue.ts';

Deno.test('task_overdue: fires when task end < today and not done', () => {
  // start 5-01 + (10-1) days = ends 5-10, today 5-18 → 8 days late → critical.
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Fondations', chantier_id: 'c1', chantier_name: 'Villa',
      chantier_status: 'active',
      start_date: '2026-05-01', duration_days: 10, status: 'ongoing',
    }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'critical');
  assertEquals(result[0].payload.days_late, 8);
});

Deno.test('task_overdue: info severity 1-2 days late', () => {
  // start 5-09 + (8-1) = ends 5-16, today 5-18 → 2 days late → info.
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Murs', chantier_id: 'c1', chantier_name: 'Villa',
      chantier_status: 'active',
      start_date: '2026-05-09', duration_days: 8, status: 'ongoing',
    }],
  });
  assertEquals(result[0].severity, 'info');
});

Deno.test('task_overdue: warning 3-7 days late', () => {
  // start 5-03 + (11-1) = ends 5-13, today 5-18 → 5 days late → warning.
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Murs', chantier_id: 'c1', chantier_name: 'Villa',
      chantier_status: 'active',
      start_date: '2026-05-03', duration_days: 11, status: 'ongoing',
    }],
  });
  assertEquals(result[0].severity, 'warning');
});

Deno.test('task_overdue: skips done task', () => {
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Fondations', chantier_id: 'c1', chantier_name: 'Villa',
      chantier_status: 'active',
      start_date: '2026-05-01', duration_days: 10, status: 'done',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('task_overdue: skips when chantier inactive', () => {
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Fondations', chantier_id: 'c1', chantier_name: 'Atelier',
      chantier_status: 'completed',
      start_date: '2026-05-01', duration_days: 10, status: 'ongoing',
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('task_overdue: skips on-time task', () => {
  const result = computeTaskOverdue({
    today: '2026-05-18',
    tasks: [{
      id: 't1', label: 'Fondations', chantier_id: 'c1', chantier_name: 'Villa',
      chantier_status: 'active',
      start_date: '2026-05-10', duration_days: 20, status: 'ongoing',
    }],
  });
  assertEquals(result.length, 0);
});
```

- [ ] **Step 2: Run — verify fails**

Run: `deno test supabase/functions/recompute-alerts/rules/task_overdue.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// supabase/functions/recompute-alerts/rules/task_overdue.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, todayIso } from '../helpers.ts';

export interface OverdueTask {
  id: string;
  label: string;
  chantier_id: string;
  chantier_name: string;
  chantier_status: 'active' | 'paused' | 'completed' | 'cancelled';
  start_date: string | null;
  duration_days: number | null;
  status: 'todo' | 'ongoing' | 'done' | 'cancelled';
}

export interface TaskOverdueInput {
  today: string;
  tasks: OverdueTask[];
}

export function computeTaskOverdue(input: TaskOverdueInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const t of input.tasks) {
    if (t.status === 'done' || t.status === 'cancelled') continue;
    if (t.chantier_status !== 'active') continue;
    if (!t.start_date || !t.duration_days) continue;

    // duration_days is inclusive of the start day (10 days starting 5-01 ends 5-10).
    const startMs = new Date(t.start_date + 'T00:00:00Z').getTime();
    const endMs = startMs + (t.duration_days - 1) * 86_400_000;
    const endIso = new Date(endMs).toISOString().slice(0, 10);
    const daysLate = daysBetween(endIso, input.today) - 1;
    if (daysLate <= 0) continue;

    const sev = daysLate > 7 ? 'critical' : daysLate >= 3 ? 'warning' : 'info';
    out.push({
      kind: 'task_overdue',
      severity: sev,
      title: 'Tâche en retard',
      body: `${t.label} (${t.chantier_name}) devait se terminer le ${endIso}.`,
      chantier_id: t.chantier_id,
      entity_id: t.id,
      fingerprint: `task_overdue:${t.id}`,
      payload: { days_late: daysLate, task_label: t.label, task_status: t.status },
    });
  }
  return out;
}

export async function fetchTaskOverdueData(
  sb: SupabaseClient,
  orgId: string
): Promise<TaskOverdueInput> {
  const { data, error } = await sb
    .from('tasks')
    .select('id, label, chantier_id, start_date, duration_days, status, chantiers!inner(name, status)')
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw error;
  const tasks: OverdueTask[] = (data ?? []).map((r: any) => ({
    id: r.id,
    label: r.label,
    chantier_id: r.chantier_id,
    chantier_name: r.chantiers.name,
    chantier_status: r.chantiers.status,
    start_date: r.start_date,
    duration_days: r.duration_days,
    status: r.status,
  }));
  return { today: todayIso(), tasks };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchTaskOverdueData(sb, orgId);
  return computeTaskOverdue(input);
}
```

- [ ] **Step 4: Run — verify passes**

Run: `deno test supabase/functions/recompute-alerts/rules/task_overdue.test.ts`
Expected: PASS (6 ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/recompute-alerts/rules/task_overdue*
git commit -m "feat(alerts): task_overdue rule"
```

---

## Task 9: Rule — `stock_low`

**Files:**
- Create: `supabase/functions/recompute-alerts/rules/stock_low.ts`
- Create: `supabase/functions/recompute-alerts/rules/stock_low.test.ts`

Note: this rule reads from the existing view `public.stock_on_hand_total` (created in migration `0003_consumables_views.sql`).

- [ ] **Step 1: Write failing test**

```ts
import { assertEquals } from 'std/assert/mod.ts';
import { computeStockLow } from './stock_low.ts';

Deno.test('stock_low: fires when on_hand < threshold', () => {
  const result = computeStockLow({
    items: [{ item_id: 'i1', name: 'Ciment', unit: 'sac', reorder_threshold: 50, on_hand: 12 }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'warning');
  assertEquals(result[0].chantier_id, null);
  assertEquals(result[0].fingerprint, 'stock_low:i1');
});

Deno.test('stock_low: critical when on_hand <= 0', () => {
  const result = computeStockLow({
    items: [{ item_id: 'i1', name: 'Ciment', unit: 'sac', reorder_threshold: 50, on_hand: -3 }],
  });
  assertEquals(result[0].severity, 'critical');
});

Deno.test('stock_low: skips when threshold is 0', () => {
  const result = computeStockLow({
    items: [{ item_id: 'i1', name: 'Ciment', unit: 'sac', reorder_threshold: 0, on_hand: 12 }],
  });
  assertEquals(result.length, 0);
});

Deno.test('stock_low: skips when on_hand >= threshold', () => {
  const result = computeStockLow({
    items: [{ item_id: 'i1', name: 'Ciment', unit: 'sac', reorder_threshold: 50, on_hand: 100 }],
  });
  assertEquals(result.length, 0);
});
```

- [ ] **Step 2: Run — verify fails**

Run: `deno test supabase/functions/recompute-alerts/rules/stock_low.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// supabase/functions/recompute-alerts/rules/stock_low.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';

export interface StockItem {
  item_id: string;
  name: string;
  unit: string | null;
  reorder_threshold: number;
  on_hand: number;
}

export interface StockInput {
  items: StockItem[];
}

export function computeStockLow(input: StockInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const i of input.items) {
    if (i.reorder_threshold <= 0) continue;
    if (i.on_hand >= i.reorder_threshold) continue;
    out.push({
      kind: 'stock_low',
      severity: i.on_hand <= 0 ? 'critical' : 'warning',
      title: 'Stock bas',
      body: `${i.name} : ${i.on_hand} ${i.unit ?? ''} restant(s), seuil de réapprovisionnement à ${i.reorder_threshold} ${i.unit ?? ''}.`,
      chantier_id: null,
      entity_id: i.item_id,
      fingerprint: `stock_low:${i.item_id}`,
      payload: {
        item_id: i.item_id,
        current_stock: i.on_hand,
        threshold: i.reorder_threshold,
        unit: i.unit,
      },
    });
  }
  return out;
}

export async function fetchStockData(sb: SupabaseClient, orgId: string): Promise<StockInput> {
  const { data, error } = await sb
    .from('stock_on_hand_total')
    .select('item_id, name, unit, reorder_threshold, on_hand')
    .eq('org_id', orgId);
  if (error) throw error;
  return {
    items: (data ?? []).map((r: any) => ({
      item_id: r.item_id,
      name: r.name,
      unit: r.unit,
      reorder_threshold: Number(r.reorder_threshold) || 0,
      on_hand: Number(r.on_hand) || 0,
    })),
  };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchStockData(sb, orgId);
  return computeStockLow(input);
}
```

- [ ] **Step 4: Run — verify passes**

Run: `deno test supabase/functions/recompute-alerts/rules/stock_low.test.ts`
Expected: PASS (4 ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/recompute-alerts/rules/stock_low*
git commit -m "feat(alerts): stock_low rule"
```

---

## Task 10: Rule — `cash_negative`

**Files:**
- Create: `supabase/functions/recompute-alerts/rules/cash_negative.ts`
- Create: `supabase/functions/recompute-alerts/rules/cash_negative.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { assertEquals } from 'std/assert/mod.ts';
import { computeCashNegative } from './cash_negative.ts';

Deno.test('cash_negative: fires when received < 70% of spent past day 14', () => {
  const result = computeCashNegative({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_start: '2026-04-15',
      total_spent: 100_000, payments_received: 50_000,
    }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'warning');
  assertEquals(result[0].payload.deficit, 50_000);
});

Deno.test('cash_negative: skips chantier <14 days since start', () => {
  const result = computeCashNegative({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_start: '2026-05-10',
      total_spent: 50_000, payments_received: 0,
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('cash_negative: skips when received >= 70% of spent', () => {
  const result = computeCashNegative({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_start: '2026-04-15',
      total_spent: 100_000, payments_received: 80_000,
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('cash_negative: skips when total_spent = 0', () => {
  const result = computeCashNegative({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Villa', status: 'active', date_start: '2026-04-15',
      total_spent: 0, payments_received: 0,
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('cash_negative: skips inactive chantier', () => {
  const result = computeCashNegative({
    today: '2026-05-18',
    chantiers: [{
      id: 'c1', name: 'Atelier', status: 'completed', date_start: '2026-01-01',
      total_spent: 100_000, payments_received: 30_000,
    }],
  });
  assertEquals(result.length, 0);
});
```

- [ ] **Step 2: Run — verify fails**

Run: `deno test supabase/functions/recompute-alerts/rules/cash_negative.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// supabase/functions/recompute-alerts/rules/cash_negative.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, formatMAD, todayIso } from '../helpers.ts';

export interface CashChantier {
  id: string;
  name: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  date_start: string | null;
  total_spent: number;
  payments_received: number;
}

export interface CashInput {
  today: string;
  chantiers: CashChantier[];
}

export function computeCashNegative(input: CashInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const c of input.chantiers) {
    if (c.status !== 'active') continue;
    if (c.total_spent <= 0) continue;
    if (!c.date_start) continue;
    const daysSinceStart = daysBetween(c.date_start, input.today);
    if (daysSinceStart <= 14) continue;
    const ratio = c.payments_received / c.total_spent;
    if (ratio >= 0.70) continue;
    const deficit = c.total_spent - c.payments_received;
    out.push({
      kind: 'cash_negative',
      severity: 'warning',
      title: 'Trésorerie négative sur ce chantier',
      body: `${c.name} : paiements reçus ${formatMAD(c.payments_received)} pour ${formatMAD(c.total_spent)} de coûts engagés. Découvert de ${formatMAD(deficit)}.`,
      chantier_id: c.id,
      entity_id: null,
      fingerprint: `cash_negative:${c.id}`,
      payload: {
        received: c.payments_received,
        spent: c.total_spent,
        deficit,
        ratio,
      },
    });
  }
  return out;
}

export async function fetchCashData(sb: SupabaseClient, orgId: string): Promise<CashInput> {
  const { data: chantiers, error } = await sb
    .from('chantiers')
    .select('id, name, status, date_start')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .eq('status', 'active');
  if (error) throw error;

  const out: CashChantier[] = [];
  for (const c of (chantiers ?? []) as any[]) {
    const total_spent = await computeTotalSpentForCashRule(sb, orgId, c.id);
    const { data: pays } = await sb
      .from('chantier_payments')
      .select('amount')
      .eq('org_id', orgId).eq('chantier_id', c.id)
      .is('deleted_at', null);
    const payments_received = (pays ?? []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    out.push({
      id: c.id, name: c.name, status: c.status, date_start: c.date_start,
      total_spent, payments_received,
    });
  }
  return { today: todayIso(), chantiers: out };
}

async function computeTotalSpentForCashRule(sb: SupabaseClient, orgId: string, chantierId: string): Promise<number> {
  // Identical to other rules' total-spent computations. Duplicated for clarity;
  // could be extracted to a shared helper in a future refactor.
  const { data: att } = await sb.from('attendance')
    .select('worker_id, status, prime_amount')
    .eq('org_id', orgId).eq('chantier_id', chantierId);
  const { data: workers } = await sb.from('workers').select('id, daily_rate').eq('org_id', orgId);
  const rates = new Map((workers ?? []).map((w: any) => [w.id, Number(w.daily_rate) || 0]));
  let total = 0;
  for (const a of (att ?? []) as any[]) {
    if (a.status === 'P') total += rates.get(a.worker_id) ?? 0;
    total += Number(a.prime_amount) || 0;
  }
  const { data: cons } = await sb.from('consumables_consumption')
    .select('item_id, qty').eq('org_id', orgId).eq('chantier_id', chantierId).is('deleted_at', null);
  const { data: items } = await sb.from('consumables_items').select('id, average_price').eq('org_id', orgId);
  const prices = new Map((items ?? []).map((i: any) => [i.id, Number(i.average_price) || 0]));
  for (const c of (cons ?? []) as any[]) total += Number(c.qty) * (prices.get(c.item_id) ?? 0);
  const { data: deps } = await sb.from('materiel_deployments')
    .select('materiel_id, start_date, end_date, qty')
    .eq('org_id', orgId).eq('chantier_id', chantierId).is('deleted_at', null);
  const { data: mats } = await sb.from('materiels').select('id, cost_per_day').eq('org_id', orgId);
  const costs = new Map((mats ?? []).map((m: any) => [m.id, Number(m.cost_per_day) || 0]));
  for (const d of (deps ?? []) as any[]) {
    const days = Math.max(0, daysBetween(d.start_date, d.end_date));
    total += days * (costs.get(d.materiel_id) ?? 0) * (Number(d.qty) || 1);
  }
  return total;
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchCashData(sb, orgId);
  return computeCashNegative(input);
}
```

- [ ] **Step 4: Run — verify passes**

Run: `deno test supabase/functions/recompute-alerts/rules/cash_negative.test.ts`
Expected: PASS (5 ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/recompute-alerts/rules/cash_negative*
git commit -m "feat(alerts): cash_negative rule with 14-day floor + 70% ratio"
```

---

## Task 11: Rule — `supplier_purchase_aging`

**Files:**
- Create: `supabase/functions/recompute-alerts/rules/supplier_purchase_aging.ts`
- Create: `supabase/functions/recompute-alerts/rules/supplier_purchase_aging.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { assertEquals } from 'std/assert/mod.ts';
import { computeSupplierAging } from './supplier_purchase_aging.ts';

Deno.test('supplier_aging: fires at 30-60 days as warning', () => {
  const result = computeSupplierAging({
    today: '2026-05-18',
    purchases: [{
      id: 'p1', supplier_id: 's1', supplier_name: 'Ciments Maroc',
      invoice_ref: 'CDM-001', purchased_at: '2026-04-10',
      payment_status: 'pending', total: 12_000,
    }],
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'warning');
  assertEquals(result[0].payload.days_aging, 38);
});

Deno.test('supplier_aging: critical past 60 days', () => {
  const result = computeSupplierAging({
    today: '2026-05-18',
    purchases: [{
      id: 'p1', supplier_id: 's1', supplier_name: 'Ciments Maroc',
      invoice_ref: 'CDM-001', purchased_at: '2026-03-01',
      payment_status: 'pending', total: 12_000,
    }],
  });
  assertEquals(result[0].severity, 'critical');
});

Deno.test('supplier_aging: skips paid purchases', () => {
  const result = computeSupplierAging({
    today: '2026-05-18',
    purchases: [{
      id: 'p1', supplier_id: 's1', supplier_name: 'Ciments Maroc',
      invoice_ref: null, purchased_at: '2026-03-01',
      payment_status: 'paid', total: 12_000,
    }],
  });
  assertEquals(result.length, 0);
});

Deno.test('supplier_aging: skips purchases <30 days old', () => {
  const result = computeSupplierAging({
    today: '2026-05-18',
    purchases: [{
      id: 'p1', supplier_id: 's1', supplier_name: 'Ciments Maroc',
      invoice_ref: null, purchased_at: '2026-05-01',
      payment_status: 'pending', total: 12_000,
    }],
  });
  assertEquals(result.length, 0);
});
```

- [ ] **Step 2: Run — verify fails**

Run: `deno test supabase/functions/recompute-alerts/rules/supplier_purchase_aging.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// supabase/functions/recompute-alerts/rules/supplier_purchase_aging.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { daysBetween, formatMAD, todayIso } from '../helpers.ts';

export interface AgingPurchase {
  id: string;
  supplier_id: string;
  supplier_name: string;
  invoice_ref: string | null;
  purchased_at: string;
  payment_status: 'paid' | 'pending' | 'partial';
  total: number;
}

export interface AgingInput {
  today: string;
  purchases: AgingPurchase[];
}

export function computeSupplierAging(input: AgingInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const p of input.purchases) {
    if (p.payment_status === 'paid') continue;
    const aging = daysBetween(p.purchased_at, input.today) - 1;
    if (aging <= 30) continue;
    out.push({
      kind: 'supplier_purchase_aging',
      severity: aging > 60 ? 'critical' : 'warning',
      title: 'Facture fournisseur en retard',
      body: `Facture ${p.invoice_ref ?? 'sans réf.'} de ${p.supplier_name} pour ${formatMAD(p.total)}, en attente depuis ${aging} jours.`,
      chantier_id: null,
      entity_id: p.id,
      fingerprint: `supplier_purchase_aging:${p.id}`,
      payload: {
        supplier_id: p.supplier_id,
        supplier_name: p.supplier_name,
        invoice_ref: p.invoice_ref,
        total: p.total,
        days_aging: aging,
      },
    });
  }
  return out;
}

export async function fetchAgingData(sb: SupabaseClient, orgId: string): Promise<AgingInput> {
  const { data, error } = await sb
    .from('consumables_purchases')
    .select(`
      id, supplier_id, purchased_at, payment_status, invoice_ref,
      lines:consumables_purchase_lines(total),
      suppliers!inner(name)
    `)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .neq('payment_status', 'paid');
  if (error) throw error;
  const purchases: AgingPurchase[] = (data ?? []).map((p: any) => ({
    id: p.id,
    supplier_id: p.supplier_id,
    supplier_name: p.suppliers.name,
    invoice_ref: p.invoice_ref,
    purchased_at: p.purchased_at,
    payment_status: p.payment_status,
    total: (p.lines ?? []).reduce((s: number, l: any) => s + (Number(l.total) || 0), 0),
  }));
  return { today: todayIso(), purchases };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchAgingData(sb, orgId);
  return computeSupplierAging(input);
}
```

- [ ] **Step 4: Run — verify passes**

Run: `deno test supabase/functions/recompute-alerts/rules/supplier_purchase_aging.test.ts`
Expected: PASS (4 ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/recompute-alerts/rules/supplier_purchase_aging*
git commit -m "feat(alerts): supplier_purchase_aging rule"
```

---

## Task 12: Rule — `consumption_anomaly`

**Files:**
- Create: `supabase/functions/recompute-alerts/rules/consumption_anomaly.ts`
- Create: `supabase/functions/recompute-alerts/rules/consumption_anomaly.test.ts`

- [ ] **Step 1: Write failing test**

```ts
import { assertEquals } from 'std/assert/mod.ts';
import { computeConsumptionAnomaly } from './consumption_anomaly.ts';

Deno.test('consumption_anomaly: fires when today qty > 3× avg AND above floor', () => {
  const result = computeConsumptionAnomaly({
    today: '2026-05-18',
    consumptionToday: [{
      chantier_id: 'c1', chantier_name: 'Villa',
      item_id: 'i1', item_name: 'Ciment', unit: 'sac',
      today_qty: 100,
    }],
    avgByItem: { 'i1': 25 },  // avg 25/day, today 100 = 4× → fires
  });
  assertEquals(result.length, 1);
  assertEquals(result[0].severity, 'info');
  assertEquals(result[0].payload.ratio, 4);
});

Deno.test('consumption_anomaly: skips when ratio <= 3', () => {
  const result = computeConsumptionAnomaly({
    today: '2026-05-18',
    consumptionToday: [{
      chantier_id: 'c1', chantier_name: 'Villa',
      item_id: 'i1', item_name: 'Ciment', unit: 'sac',
      today_qty: 60,
    }],
    avgByItem: { 'i1': 25 },  // 60/25 = 2.4× → skip
  });
  assertEquals(result.length, 0);
});

Deno.test('consumption_anomaly: skips when below floor', () => {
  // Floor for "sac" is 5.
  const result = computeConsumptionAnomaly({
    today: '2026-05-18',
    consumptionToday: [{
      chantier_id: 'c1', chantier_name: 'Villa',
      item_id: 'i1', item_name: 'Ciment', unit: 'sac',
      today_qty: 4,
    }],
    avgByItem: { 'i1': 0.5 },  // 4/0.5 = 8× but below floor 5
  });
  assertEquals(result.length, 0);
});

Deno.test('consumption_anomaly: uses DEFAULT_FLOOR for unknown unit', () => {
  // Unknown unit → default floor = 5.
  const result = computeConsumptionAnomaly({
    today: '2026-05-18',
    consumptionToday: [{
      chantier_id: 'c1', chantier_name: 'Villa',
      item_id: 'i1', item_name: 'X', unit: 'farfelu',
      today_qty: 6,
    }],
    avgByItem: { 'i1': 1 },  // 6× above avg, above default floor of 5
  });
  assertEquals(result.length, 1);
});

Deno.test('consumption_anomaly: fingerprint includes date', () => {
  const result = computeConsumptionAnomaly({
    today: '2026-05-18',
    consumptionToday: [{
      chantier_id: 'c1', chantier_name: 'V', item_id: 'i1', item_name: 'X', unit: 'sac', today_qty: 100,
    }],
    avgByItem: { 'i1': 10 },
  });
  assertEquals(result[0].fingerprint, 'consumption_anomaly:c1:i1:2026-05-18');
});
```

- [ ] **Step 2: Run — verify fails**

Run: `deno test supabase/functions/recompute-alerts/rules/consumption_anomaly.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write implementation**

```ts
// supabase/functions/recompute-alerts/rules/consumption_anomaly.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AlertCandidate } from '../types.ts';
import { todayIso } from '../helpers.ts';

const FLOOR_BY_UNIT: Record<string, number> = {
  'sac': 5,
  'pièce': 10,
  'm³': 0.5,
  'kg': 5,
  'm': 10,
  'm²': 5,
  'unité': 2,
  'pot': 1,
  'lot': 1,
  'litre': 5,
};
const DEFAULT_FLOOR = 5;

export interface AnomalyConsumption {
  chantier_id: string;
  chantier_name: string;
  item_id: string;
  item_name: string;
  unit: string | null;
  today_qty: number;
}

export interface AnomalyInput {
  today: string;
  consumptionToday: AnomalyConsumption[];
  avgByItem: Record<string, number>;
}

export function computeConsumptionAnomaly(input: AnomalyInput): AlertCandidate[] {
  const out: AlertCandidate[] = [];
  for (const c of input.consumptionToday) {
    const avg = input.avgByItem[c.item_id] ?? 0;
    if (avg <= 0) continue;
    const ratio = c.today_qty / avg;
    if (ratio <= 3) continue;
    const floor = c.unit ? (FLOOR_BY_UNIT[c.unit] ?? DEFAULT_FLOOR) : DEFAULT_FLOOR;
    if (c.today_qty < floor) continue;
    out.push({
      kind: 'consumption_anomaly',
      severity: 'info',
      title: 'Consommation anormale',
      body: `${c.item_name} sur ${c.chantier_name} : ${c.today_qty} ${c.unit ?? ''} aujourd'hui (moyenne ${avg.toFixed(1)} ${c.unit ?? ''}/jour sur 30 jours).`,
      chantier_id: c.chantier_id,
      entity_id: c.item_id,
      fingerprint: `consumption_anomaly:${c.chantier_id}:${c.item_id}:${input.today}`,
      payload: {
        item_id: c.item_id,
        today_qty: c.today_qty,
        avg_qty: avg,
        ratio,
      },
    });
  }
  return out;
}

export async function fetchAnomalyData(sb: SupabaseClient, orgId: string): Promise<AnomalyInput> {
  const today = todayIso();
  // Today's consumption rows with joined item + chantier names
  const { data: todayRows, error: e1 } = await sb
    .from('consumables_consumption')
    .select('chantier_id, item_id, qty, chantiers!inner(name), consumables_items!inner(name, unit)')
    .eq('org_id', orgId)
    .eq('used_at', today)
    .is('deleted_at', null);
  if (e1) throw e1;

  const consumptionToday: AnomalyConsumption[] = (todayRows ?? []).map((r: any) => ({
    chantier_id: r.chantier_id,
    chantier_name: r.chantiers.name,
    item_id: r.item_id,
    item_name: r.consumables_items.name,
    unit: r.consumables_items.unit,
    today_qty: Number(r.qty) || 0,
  }));

  // 30-day rolling average qty per item (excluding today)
  const itemIds = Array.from(new Set(consumptionToday.map((r) => r.item_id)));
  const avgByItem: Record<string, number> = {};
  if (itemIds.length > 0) {
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const { data: hist, error: e2 } = await sb
      .from('consumables_consumption')
      .select('item_id, qty, used_at')
      .eq('org_id', orgId)
      .in('item_id', itemIds)
      .gte('used_at', cutoff)
      .lt('used_at', today)
      .is('deleted_at', null);
    if (e2) throw e2;
    const sumByItem: Record<string, number> = {};
    const daysByItem: Record<string, Set<string>> = {};
    for (const r of (hist ?? []) as any[]) {
      sumByItem[r.item_id] = (sumByItem[r.item_id] ?? 0) + (Number(r.qty) || 0);
      (daysByItem[r.item_id] ??= new Set()).add(r.used_at);
    }
    for (const id of itemIds) {
      const days = (daysByItem[id]?.size ?? 0) || 1; // avoid div-by-zero
      avgByItem[id] = (sumByItem[id] ?? 0) / days;
    }
  }

  return { today, consumptionToday, avgByItem };
}

export async function recompute(sb: SupabaseClient, orgId: string): Promise<AlertCandidate[]> {
  const input = await fetchAnomalyData(sb, orgId);
  return computeConsumptionAnomaly(input);
}
```

- [ ] **Step 4: Run — verify passes**

Run: `deno test supabase/functions/recompute-alerts/rules/consumption_anomaly.test.ts`
Expected: PASS (5 ok).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/recompute-alerts/rules/consumption_anomaly*
git commit -m "feat(alerts): consumption_anomaly rule with per-unit floor"
```

---

## Task 13: Edge Function entry point

**Files:**
- Create: `supabase/functions/recompute-alerts/index.ts`

- [ ] **Step 1: Write `index.ts`**

```ts
// supabase/functions/recompute-alerts/index.ts
import { createClient } from '@supabase/supabase-js';
import { runEngine } from './engine.ts';
import type { Rule } from './types.ts';

import { recompute as budgetBurnForecast } from './rules/budget_burn_forecast.ts';
import { recompute as budgetCategoryExceeded } from './rules/budget_category_exceeded.ts';
import { recompute as chantierOverdue } from './rules/chantier_overdue.ts';
import { recompute as taskOverdue } from './rules/task_overdue.ts';
import { recompute as stockLow } from './rules/stock_low.ts';
import { recompute as cashNegative } from './rules/cash_negative.ts';
import { recompute as supplierAging } from './rules/supplier_purchase_aging.ts';
import { recompute as consumptionAnomaly } from './rules/consumption_anomaly.ts';

const RULES: Rule[] = [
  { kind: 'budget_burn_forecast',     recompute: budgetBurnForecast },
  { kind: 'budget_category_exceeded', recompute: budgetCategoryExceeded },
  { kind: 'chantier_overdue',         recompute: chantierOverdue },
  { kind: 'task_overdue',             recompute: taskOverdue },
  { kind: 'stock_low',                recompute: stockLow },
  { kind: 'cash_negative',            recompute: cashNegative },
  { kind: 'supplier_purchase_aging',  recompute: supplierAging },
  { kind: 'consumption_anomaly',      recompute: consumptionAnomaly },
];

Deno.serve(async (_req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing env vars' }), { status: 500 });
  }
  const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const summary = await runEngine(sb, RULES);
  console.log('[recompute-alerts]', summary);
  return new Response(JSON.stringify(summary), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add supabase/functions/recompute-alerts/index.ts
git commit -m "feat(alerts): Edge Function entry wiring all 8 rules"
```

---

## Task 14: Deploy + cron registration + smoke test

**Files:** *(no code changes — operational task)*

- [ ] **Step 1: Deploy the function**

Run from project root:

```bash
supabase functions deploy recompute-alerts --no-verify-jwt
```

The `--no-verify-jwt` flag is required because `pg_cron` invokes the function with a service-role bearer that doesn't match a user JWT. The function still requires the `SUPABASE_SERVICE_ROLE_KEY` env var, which Supabase Functions provide automatically — no manual secret-set needed.

Expected: `Deployed Function: recompute-alerts`.

- [ ] **Step 2: Register pg_cron schedule (one-time SQL)**

In the Supabase SQL Editor:

```sql
-- Enable extensions if not already enabled (idempotent)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the service role key as a session-level setting (set once)
-- (Service role key is available in Supabase Dashboard → Settings → API)
alter database postgres set app.recompute_alerts_url =
  'https://<project-ref>.supabase.co/functions/v1/recompute-alerts';

-- Schedule every 15 min
select cron.schedule(
  'recompute-alerts',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := current_setting('app.recompute_alerts_url'),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

Replace `<project-ref>` with the actual Supabase project ref.

Expected: query returns a job id.

- [ ] **Step 3: Manually invoke for first smoke**

```bash
supabase functions invoke recompute-alerts
```

Expected output JSON: `{"orgs": N, "inserted": M, "refreshed": ..., "resolved": ..., "skipped_cooldown": ..., "errors": 0}`.

- [ ] **Step 4: Verify alerts populated**

Open the SQL Editor and run:

```sql
select kind, severity, title, chantier_id, fingerprint
  from public.alerts
 where resolved_at is null and dismissed_at is null
 order by severity desc, created_at desc;
```

Expected (with demo data seeded): a `budget_category_exceeded:<atelier_id>:equipment` row with severity `critical` (Atelier has `budget_equipment: 5000`, equipment spent ≈ 13 280 MAD).

If no rows: re-check service role key is set on the DB, and that the function logs succeed in the Supabase Dashboard → Edge Functions → Logs.

- [ ] **Step 5: Document in FOLLOW_UPS.md**

Add a checked-off entry under "long-term roadmap" and document the cron SQL pre-req inline.

- [ ] **Step 6: Commit**

```bash
git add FOLLOW_UPS.md
git commit -m "docs(alerts): mark watchdog roadmap items done + record cron SQL"
```

---

## Task 15: Frontend DAL — `src/data/alerts.ts`

**Files:**
- Create: `src/data/alerts.ts`

- [ ] **Step 1: Write the DAL**

```ts
// src/data/alerts.ts
import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError } from './errors';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export type AlertKind =
  | 'budget_burn_forecast'
  | 'budget_category_exceeded'
  | 'chantier_overdue'
  | 'task_overdue'
  | 'stock_low'
  | 'cash_negative'
  | 'supplier_purchase_aging'
  | 'consumption_anomaly'
  | 'daily_entry_missing';

export interface Alert {
  id: string;
  org_id: string;
  chantier_id: string | null;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  body: string | null;
  payload: Record<string, unknown>;
  entity_id: string | null;
  fingerprint: string;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  dismissed_at: string | null;
  dismissed_by: string | null;
  created_at: string;
  updated_at: string;
}

const SEVERITY_RANK: Record<AlertSeverity, number> = {
  critical: 3, warning: 2, info: 1,
};

function sortBySeverityThenRecent(a: Alert, b: Alert): number {
  const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sevDiff !== 0) return sevDiff;
  return new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime();
}

/** Active alerts (not resolved, not dismissed), severity-then-recency sorted. */
export async function listActiveAlerts(): Promise<Alert[]> {
  const orgId = getActiveOrgId();
  const sb = getSupabase();
  const { data, error } = await sb
    .from('alerts')
    .select('*')
    .eq('org_id', orgId)
    .is('resolved_at', null)
    .is('dismissed_at', null);
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as unknown as Alert[]).sort(sortBySeverityThenRecent);
}

/** Active alerts scoped to one chantier (plus org-wide ones with chantier_id NULL). */
export async function listAlertsForChantier(chantierId: string): Promise<Alert[]> {
  const orgId = getActiveOrgId();
  const sb = getSupabase();
  const { data, error } = await sb
    .from('alerts')
    .select('*')
    .eq('org_id', orgId)
    .eq('chantier_id', chantierId)
    .is('resolved_at', null)
    .is('dismissed_at', null);
  if (error) throw mapSupabaseError(error);
  return ((data ?? []) as unknown as Alert[]).sort(sortBySeverityThenRecent);
}

/** History view — resolved + dismissed alerts, most-recent first. */
export async function listAlertHistory(): Promise<Alert[]> {
  const orgId = getActiveOrgId();
  const sb = getSupabase();
  const { data, error } = await sb
    .from('alerts')
    .select('*')
    .eq('org_id', orgId)
    .or('resolved_at.not.is.null,dismissed_at.not.is.null')
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Alert[];
}

export async function dismissAlert(id: string): Promise<void> {
  const sb = getSupabase();
  const userId = (await sb.auth.getUser()).data.user?.id;
  if (!userId) throw new Error('Not authenticated');
  const { error } = await sb
    .from('alerts')
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: userId })
    .eq('id', id);
  if (error) throw mapSupabaseError(error);
}

export async function undismissAlert(id: string): Promise<void> {
  const sb = getSupabase();
  const { error } = await sb
    .from('alerts')
    .update({ dismissed_at: null, dismissed_by: null })
    .eq('id', id);
  if (error) throw mapSupabaseError(error);
}
```

- [ ] **Step 2: Verify with typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/data/alerts.ts
git commit -m "feat(alerts): frontend DAL — list, dismiss, undismiss"
```

---

## Task 16: `AlertCard` component + render test

**Files:**
- Create: `src/components/alerts/AlertCard.tsx`
- Create: `src/components/alerts/AlertCard.test.tsx`

- [ ] **Step 1: Write failing test**

```tsx
// src/components/alerts/AlertCard.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AlertCard } from './AlertCard';
import type { Alert } from '@/data/alerts';

const baseAlert: Alert = {
  id: 'a1',
  org_id: 'o1',
  chantier_id: 'c1',
  kind: 'chantier_overdue',
  severity: 'critical',
  title: 'Chantier en retard',
  body: 'Villa devait se terminer le 2026-05-01, soit 17 jours de retard.',
  payload: {},
  entity_id: null,
  fingerprint: 'chantier_overdue:c1',
  first_seen_at: '2026-05-18T00:00:00Z',
  last_seen_at: '2026-05-18T00:00:00Z',
  resolved_at: null,
  dismissed_at: null,
  dismissed_by: null,
  created_at: '2026-05-18T00:00:00Z',
  updated_at: '2026-05-18T00:00:00Z',
};

describe('AlertCard', () => {
  it('renders title and body', () => {
    render(<AlertCard alert={baseAlert} />);
    expect(screen.getByText('Chantier en retard')).toBeInTheDocument();
    expect(screen.getByText(/Villa devait/)).toBeInTheDocument();
  });

  it('shows critical severity styling', () => {
    const { container } = render(<AlertCard alert={baseAlert} />);
    expect(container.querySelector('[data-severity="critical"]')).toBeInTheDocument();
  });

  it('calls onDismiss when the button is clicked', async () => {
    const onDismiss = vi.fn();
    render(<AlertCard alert={baseAlert} onDismiss={onDismiss} />);
    screen.getByRole('button', { name: /ignorer/i }).click();
    expect(onDismiss).toHaveBeenCalledWith('a1');
  });

  it('omits the dismiss button in compact size', () => {
    render(<AlertCard alert={baseAlert} size="compact" onDismiss={() => {}} />);
    expect(screen.queryByRole('button', { name: /ignorer/i })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test — verify fails**

Run: `npm test -- AlertCard`
Expected: FAIL (component doesn't exist).

- [ ] **Step 3: Write `AlertCard.tsx`**

```tsx
// src/components/alerts/AlertCard.tsx
import { Link } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Alert, AlertSeverity } from '@/data/alerts';

interface AlertCardProps {
  alert: Alert;
  size?: 'compact' | 'default';
  onDismiss?: (id: string) => void;
}

const SEVERITY_STRIPE: Record<AlertSeverity, string> = {
  critical: 'bg-bati-terra',
  warning: 'bg-bati-ochre',
  info: 'bg-bati-muted',
};

const SEVERITY_TEXT: Record<AlertSeverity, string> = {
  critical: 'text-bati-terra',
  warning: 'text-bati-ochre',
  info: 'text-bati-muted',
};

export function AlertCard({ alert, size = 'default', onDismiss }: AlertCardProps) {
  const compact = size === 'compact';
  const stripeWidth = compact ? 'w-1' : 'w-1.5';

  return (
    <div
      data-severity={alert.severity}
      className={`bati-card rounded-lg ${compact ? 'p-2' : 'p-3'} flex gap-3 items-start`}
    >
      <div
        className={`${stripeWidth} self-stretch min-h-[2rem] rounded-full shrink-0 ${SEVERITY_STRIPE[alert.severity]}`}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h4 className={`font-semibold ${compact ? 'text-xs' : 'text-sm'} ${SEVERITY_TEXT[alert.severity]}`}>
            {alert.title}
          </h4>
          <span className="text-[10px] text-bati-muted shrink-0 tabular-nums">
            {formatDistanceToNow(parseISO(alert.last_seen_at), { addSuffix: true, locale: fr })}
          </span>
        </div>
        {alert.body && (
          <p className={`${compact ? 'text-[11px]' : 'text-xs'} text-bati-text mt-1`}>
            {alert.body}
          </p>
        )}
        {alert.chantier_id && !compact && (
          <Link
            to={`/chantiers/${alert.chantier_id}`}
            className="text-[11px] text-bati-teal hover:underline mt-1 inline-block"
          >
            Ouvrir le chantier →
          </Link>
        )}
      </div>
      {!compact && onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(alert.id)}
          className="text-xs text-bati-muted hover:text-bati-text px-2 py-1 rounded-md hover:bg-bati-border-soft shrink-0"
        >
          Ignorer
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — verify passes**

Run: `npm test -- AlertCard`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/alerts/AlertCard.tsx src/components/alerts/AlertCard.test.tsx
git commit -m "feat(alerts): AlertCard component (compact + default variants)"
```

---

## Task 17: `AlertsBell` topbar component

**Files:**
- Create: `src/components/alerts/AlertsBell.tsx`

- [ ] **Step 1: Write the bell**

```tsx
// src/components/alerts/AlertsBell.tsx
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import * as Popover from '@radix-ui/react-popover';
import { useOrg } from '@/contexts/OrgContext';
import { listActiveAlerts } from '@/data/alerts';
import { AlertCard } from './AlertCard';

export function AlertsBell() {
  const { activeOrg, myRole } = useOrg();
  const canSee = myRole === 'owner' || myRole === 'admin' || myRole === 'site_manager';

  const alerts = useQuery({
    queryKey: ['alerts', 'active', activeOrg?.id],
    queryFn: listActiveAlerts,
    enabled: !!activeOrg && canSee,
    refetchInterval: 60_000,
  });

  if (!canSee) return null;

  const count = alerts.data?.length ?? 0;
  const top5 = (alerts.data ?? []).slice(0, 5);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={count > 0 ? `${count} alerte(s) active(s)` : 'Aucune alerte'}
          className="relative p-2 rounded-md hover:bg-bati-border-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-bati-teal"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {count > 0 && (
            <span
              className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-bati-terra text-white text-[10px] font-bold leading-4 text-center"
              aria-hidden
            >
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="w-80 bg-bati-card border border-bati-border rounded-lg shadow-lg p-2 z-50"
        >
          <div className="flex items-baseline justify-between px-2 py-1">
            <h3 className="text-xs font-semibold text-bati-text uppercase tracking-wide">Alertes</h3>
            <span className="text-[10px] text-bati-muted">{count} active{count > 1 ? 's' : ''}</span>
          </div>
          {alerts.isLoading && <div className="px-2 py-3 text-xs text-bati-muted">Chargement…</div>}
          {!alerts.isLoading && top5.length === 0 && (
            <div className="px-2 py-3 text-xs text-bati-muted">Aucune alerte — tout va bien.</div>
          )}
          <div className="space-y-1">
            {top5.map((a) => (
              <AlertCard key={a.id} alert={a} size="compact" />
            ))}
          </div>
          {count > 0 && (
            <div className="border-t border-bati-border-soft mt-2 pt-2 px-2">
              <Link
                to="/alertes"
                className="text-xs text-bati-teal hover:underline"
              >
                Voir toutes les alertes →
              </Link>
            </div>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/alerts/AlertsBell.tsx
git commit -m "feat(alerts): topbar AlertsBell with Radix popover + React Query poll"
```

---

## Task 18: `AlertsPanel` per-chantier inline component

**Files:**
- Create: `src/components/alerts/AlertsPanel.tsx`

- [ ] **Step 1: Write the panel**

```tsx
// src/components/alerts/AlertsPanel.tsx
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useOrg } from '@/contexts/OrgContext';
import { dismissAlert, listAlertsForChantier, undismissAlert } from '@/data/alerts';
import { toast } from '@/components/ui/Toast';
import { AlertCard } from './AlertCard';

interface AlertsPanelProps {
  chantierId: string;
}

export function AlertsPanel({ chantierId }: AlertsPanelProps) {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();

  const alerts = useQuery({
    queryKey: ['alerts', 'chantier', activeOrg?.id, chantierId],
    queryFn: () => listAlertsForChantier(chantierId),
    enabled: !!activeOrg,
    refetchInterval: 60_000,
  });

  const dismiss = useMutation({
    mutationFn: dismissAlert,
    onSuccess: async (_data, id) => {
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alerte ignorée', {
        action: {
          label: 'Annuler',
          onClick: async () => {
            try {
              await undismissAlert(id);
              await queryClient.invalidateQueries({ queryKey: ['alerts'] });
            } catch (err) {
              toast.fromError(err, 'Annulation impossible');
            }
          },
        },
      });
    },
    onError: (err) => toast.fromError(err, 'Impossible d\'ignorer l\'alerte'),
  });

  if (alerts.isLoading || (alerts.data?.length ?? 0) === 0) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-bati-muted">
        Alertes actives ({alerts.data?.length})
      </h3>
      <div className="space-y-2">
        {(alerts.data ?? []).map((a) => (
          <AlertCard key={a.id} alert={a} onDismiss={(id) => dismiss.mutate(id)} />
        ))}
      </div>
    </div>
  );
}
```

Notes:
- The `toast.success(..., { action })` shape mirrors what is already used in `PaymentsSection.tsx`. If the existing `toast` helper has a different signature, adapt accordingly (the import + behaviour pattern is the contract here).

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors. If the `toast.success` action API doesn't match, check `src/components/ui/Toast.tsx` and adapt (the existing app uses Sonner).

- [ ] **Step 3: Commit**

```bash
git add src/components/alerts/AlertsPanel.tsx
git commit -m "feat(alerts): AlertsPanel per-chantier with optimistic dismiss + undo"
```

---

## Task 19: `AlertesSection` HomePage block

**Files:**
- Create: `src/components/alerts/AlertesSection.tsx`

- [ ] **Step 1: Write the section**

```tsx
// src/components/alerts/AlertesSection.tsx
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useOrg } from '@/contexts/OrgContext';
import { listActiveAlerts } from '@/data/alerts';
import { AlertCard } from './AlertCard';

export function AlertesSection() {
  const { activeOrg } = useOrg();
  const alerts = useQuery({
    queryKey: ['alerts', 'active', activeOrg?.id],
    queryFn: listActiveAlerts,
    enabled: !!activeOrg,
    refetchInterval: 60_000,
  });

  const significant = (alerts.data ?? []).filter(
    (a) => a.severity === 'critical' || a.severity === 'warning'
  );
  const top5 = significant.slice(0, 5);
  const total = significant.length;

  if (top5.length === 0) return null;  // don't render an empty block

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-bati-text">
          Alertes
        </h2>
        <Link to="/alertes" className="text-xs text-bati-teal hover:underline">
          Voir toutes les alertes ({total}) →
        </Link>
      </div>
      <div className="space-y-2">
        {top5.map((a) => (
          <AlertCard key={a.id} alert={a} />
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/alerts/AlertesSection.tsx
git commit -m "feat(alerts): HomePage AlertesSection block"
```

---

## Task 20: `/alertes` page

**Files:**
- Create: `src/pages/alertes/AlertsPage.tsx`

- [ ] **Step 1: Write the page**

```tsx
// src/pages/alertes/AlertsPage.tsx
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useOrg } from '@/contexts/OrgContext';
import {
  dismissAlert,
  listActiveAlerts,
  listAlertHistory,
  undismissAlert,
  type AlertSeverity,
} from '@/data/alerts';
import { toast } from '@/components/ui/Toast';
import { AlertCard } from '@/components/alerts/AlertCard';

const SEVERITY_FILTERS: Array<{ value: AlertSeverity | 'all'; label: string }> = [
  { value: 'all',      label: 'Toutes' },
  { value: 'critical', label: 'Critiques' },
  { value: 'warning',  label: 'Avertissements' },
  { value: 'info',     label: 'Info' },
];

export default function AlertsPage() {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | 'all'>('all');
  const [showHistory, setShowHistory] = useState(false);

  const active = useQuery({
    queryKey: ['alerts', 'active', activeOrg?.id],
    queryFn: listActiveAlerts,
    enabled: !!activeOrg,
    refetchInterval: 60_000,
  });

  const history = useQuery({
    queryKey: ['alerts', 'history', activeOrg?.id],
    queryFn: listAlertHistory,
    enabled: !!activeOrg && showHistory,
  });

  const dismiss = useMutation({
    mutationFn: dismissAlert,
    onSuccess: async (_d, id) => {
      await queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alerte ignorée', {
        action: {
          label: 'Annuler',
          onClick: async () => {
            await undismissAlert(id);
            await queryClient.invalidateQueries({ queryKey: ['alerts'] });
          },
        },
      });
    },
    onError: (err) => toast.fromError(err, 'Impossible d\'ignorer l\'alerte'),
  });

  const filtered = useMemo(() => {
    const all = active.data ?? [];
    if (severityFilter === 'all') return all;
    return all.filter((a) => a.severity === severityFilter);
  }, [active.data, severityFilter]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-bati-text">Alertes</h1>
        <p className="text-sm text-bati-muted mt-0.5">
          Détections automatiques sur vos chantiers, recalculées toutes les 15 minutes.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {SEVERITY_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setSeverityFilter(f.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              severityFilter === f.value
                ? 'bg-bati-teal text-white'
                : 'bg-bati-card border border-bati-border text-bati-muted hover:bg-bati-border-soft'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        <label className="text-xs text-bati-muted inline-flex items-center gap-1">
          <input
            type="checkbox"
            checked={showHistory}
            onChange={(e) => setShowHistory(e.target.checked)}
          />
          Voir l'historique
        </label>
      </div>

      {active.isLoading && <div className="text-sm text-bati-muted">Chargement…</div>}

      {!active.isLoading && filtered.length === 0 && (
        <div className="bati-card rounded-lg p-6 text-sm text-bati-muted text-center">
          Aucune alerte active — tout va bien.
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((a) => (
          <AlertCard key={a.id} alert={a} onDismiss={(id) => dismiss.mutate(id)} />
        ))}
      </div>

      {showHistory && (history.data?.length ?? 0) > 0 && (
        <section className="pt-4 border-t border-bati-border-soft">
          <h2 className="text-xs uppercase tracking-wide text-bati-muted mb-2">Historique</h2>
          <div className="space-y-2 opacity-70">
            {(history.data ?? []).map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/alertes/AlertsPage.tsx
git commit -m "feat(alerts): /alertes page with severity filter + history toggle"
```

---

## Task 21: Wiring — routes, sidebar, AppShell, HomePage, chantier surfaces

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/components/AppShell.tsx`
- Modify: `src/pages/HomePage.tsx`
- Modify: `src/pages/chantiers/ChantiersListPage.tsx`
- Modify: `src/pages/chantiers/ChantierDetailPage.tsx`
- Modify: `src/pages/budget/ChantierBudgetView.tsx`

### 21a — Add `/alertes` route + lazy import

- [ ] **Step 1: Edit `src/App.tsx`** — add the import and route.

Add this with the other imports:

```tsx
import AlertsPage from '@/pages/alertes/AlertsPage';
```

Inside the `<Route element={<AppShell />}>` block, alongside the other top-level page routes (e.g. `<Route path="/materiels" .../>`), add:

```tsx
<Route path="/alertes" element={<AlertsPage />} />
```

### 21b — Sidebar nav item

- [ ] **Step 2: Edit `src/components/Sidebar.tsx`** — add an « Alertes » nav item.

Looking at the existing `Sidebar.tsx`, there's a `MAIN_NAV` array of `NavItem`. Append after the "Pointage" / "Planning" entries (or wherever makes sense in the existing order):

```tsx
{
  to: '/alertes',
  label: 'Alertes',
  icon: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </>
  ),
},
```

Visible to all roles except `worker` — the existing Sidebar's role-filter logic should already cover that via the bell's permissions; if not, add `roles: ['owner','admin','site_manager']` to this nav item (mirror the convention of « Ouvriers » which uses `roles: ['owner','admin']`).

### 21c — Mount the bell in the topbar

- [ ] **Step 3: Edit `src/components/AppShell.tsx`** — mount `<AlertsBell />` in the topbar.

Find the topbar JSX (where the org selector / user menu sit). Import:

```tsx
import { AlertsBell } from '@/components/alerts/AlertsBell';
```

Insert `<AlertsBell />` to the left of the existing user-menu / org-selector. If the topbar uses Flex, no additional layout work is needed. Example placement:

```tsx
<div className="ml-auto flex items-center gap-1">
  <AlertsBell />
  {/* existing org selector / user menu */}
</div>
```

### 21d — HomePage section

- [ ] **Step 4: Edit `src/pages/HomePage.tsx`** — slot in `<AlertesSection />`.

Import:

```tsx
import { AlertesSection } from '@/components/alerts/AlertesSection';
```

Render the section between the existing KPI strip and the over-budget chantier list. The existing HomePage structure (per the file `src/pages/HomePage.tsx`) has these sections in order; place `<AlertesSection />` AFTER the KPI strip and BEFORE the over-budget list. Renders nothing when there are no critical/warning alerts (component self-hides).

### 21e — Per-chantier badge on `ChantiersListPage`

- [ ] **Step 5: Edit `src/pages/chantiers/ChantiersListPage.tsx`** — add an alert-count pill next to each chantier name.

Approach: in the row cell, run an inline query for active alerts per chantier (already cached by React Query if `listActiveAlerts` was fetched). Use the existing fetched list, group by `chantier_id`, render counts as a pill.

Add at the top of the component:

```tsx
import { useQuery } from '@tanstack/react-query';
import { listActiveAlerts } from '@/data/alerts';

// Inside the component:
const { activeOrg } = useOrg();
const allAlerts = useQuery({
  queryKey: ['alerts', 'active', activeOrg?.id],
  queryFn: listActiveAlerts,
  enabled: !!activeOrg,
  refetchInterval: 60_000,
});
const alertsByChantier = useMemo(() => {
  const m = new Map<string, { critical: number; warning: number; info: number }>();
  for (const a of allAlerts.data ?? []) {
    if (!a.chantier_id) continue;
    const e = m.get(a.chantier_id) ?? { critical: 0, warning: 0, info: 0 };
    e[a.severity] += 1;
    m.set(a.chantier_id, e);
  }
  return m;
}, [allAlerts.data]);
```

In the row rendering for the `name` cell, render the pill after the chantier name:

```tsx
const counts = alertsByChantier.get(c.id);
const total = counts ? counts.critical + counts.warning + counts.info : 0;
const pillClass = counts?.critical
  ? 'bg-bati-terra text-white'
  : counts?.warning
    ? 'bg-bati-ochre text-white'
    : counts?.info
      ? 'bg-bati-border text-bati-muted'
      : '';
return (
  <span className="inline-flex items-center gap-2">
    {c.name}
    {total > 0 && (
      <span className={`text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full ${pillClass}`}>
        {total}
      </span>
    )}
  </span>
);
```

Adapt the exact JSX to the existing cell renderer.

### 21f — Chip in `ChantierDetailPage` header

- [ ] **Step 6: Edit `src/pages/chantiers/ChantierDetailPage.tsx`** — add a « N alertes actives » chip in the header when count > 0.

Add the query (same as on the list page but scoped):

```tsx
import { listAlertsForChantier } from '@/data/alerts';

const alerts = useQuery({
  queryKey: ['alerts', 'chantier', activeOrg?.id, id],
  queryFn: () => listAlertsForChantier(id!),
  enabled: !!activeOrg && !!id,
  refetchInterval: 60_000,
});
const alertCount = alerts.data?.length ?? 0;
```

In the header section (next to the chantier name + status badge), render when `alertCount > 0`:

```tsx
{alertCount > 0 && (
  <button
    type="button"
    onClick={() => setTab('budget')}
    className="text-xs px-2 py-1 rounded-full bg-bati-terra/10 text-bati-terra hover:bg-bati-terra/20"
  >
    {alertCount} alerte{alertCount > 1 ? 's' : ''} active{alertCount > 1 ? 's' : ''} →
  </button>
)}
```

Clicking switches the tab to `budget` where `<AlertsPanel />` will be visible.

### 21g — `<AlertsPanel />` at top of Budget tab

- [ ] **Step 7: Edit `src/pages/budget/ChantierBudgetView.tsx`** — slot `<AlertsPanel chantierId={chantier.id} />` at the very top, above the BudgetBars row.

Add import:

```tsx
import { AlertsPanel } from '@/components/alerts/AlertsPanel';
```

In the JSX of `ChantierBudgetView` (just inside the outer `<div className="space-y-4">`), as the first child:

```tsx
<AlertsPanel chantierId={chantier.id} />
```

The component self-hides when there are no alerts.

### 21h — Verify and commit

- [ ] **Step 8: Run typecheck + lint**

```bash
npm run typecheck
npm run lint
```

Expected: clean (no errors, no warnings).

- [ ] **Step 9: Run the dev server and click through manually**

```bash
npm run dev
```

Verify:
- Bell icon appears in topbar with badge count.
- Bell dropdown shows top 5 alerts.
- « Alertes » sidebar nav item shows badge.
- `/alertes` page loads with severity chips + dismiss buttons.
- HomePage shows AlertesSection when critical/warning alerts exist.
- Chantier list rows show alert pill where applicable.
- Chantier detail header shows the chip; clicking it goes to Budget tab.
- Budget tab shows AlertsPanel at the top.
- Dismiss works; undo toast restores the alert.

- [ ] **Step 10: Commit**

```bash
git add src/
git commit -m "feat(alerts): wire bell, sidebar, route, HomePage section, chantier badges"
```

---

## Final wrap-up

- [ ] **Step 1: Re-run all tests**

```bash
# Frontend
npm test

# Edge Function rules
deno test supabase/functions/recompute-alerts/
```

Expected: all green.

- [ ] **Step 2: Final commit + push**

```bash
git push
```

- [ ] **Step 3: Mark FOLLOW_UPS items**

Update `FOLLOW_UPS.md` to reflect that the watchdog / alerts roadmap items are now done. Commit.

---

## Open questions / known gaps (deferred)

- **Browser push notifications** — Notification API for active sessions. Deferred per spec.
- **Per-org tunable thresholds** — hard-coded for v1. Deferred per spec.
- **Bulk dismiss** — single-click only. Deferred.
- **pgTAP CI integration** — RLS test file is committed but `FOLLOW_UPS.md` flags that pgTAP infra is not yet wired into the CI workflow.
- **Total spent computation duplication** — `budget_burn_forecast`, `budget_category_exceeded`, and `cash_negative` each compute total spent independently. Acceptable for v1 (cron runs every 15 min, 3 rules each doing one round of queries per chantier). Future optimisation: extract to a shared helper or a `chantier_totals` view.

---

*Phase 2 (chef de chantier daily-entry workflow + `daily_entry_missing` alert wiring) and Phase 3 (HomePage cockpit redesign) each get their own spec when we get to them.*
