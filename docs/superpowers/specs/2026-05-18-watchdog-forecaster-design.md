# Watchdog & Forecaster — Phase 1 Design

**Status:** Approved (2026-05-18) — ready for implementation planning
**Author:** Brainstormed via Claude Code
**Scope:** Phase 1 of a 3-phase intelligence layer for BatiTrack
**Estimated effort:** ~1 week

---

## 1. Context

BatiTrack is a multi-tenant SaaS for Moroccan construction SMEs that tracks
worker presence and chantier expenses. The app is now feature-complete enough
to be in pre-production, but lacks a differentiating "drool" feature that
would make a patron de SME immediately want to adopt it over Excel.

The data layer holds rich signal — attendance per worker per day, consumption
events per item, equipment deployments with daily rates, payments by chantier,
purchases with payment status, tasks with planned durations, per-category
budgets. Nothing currently *analyses* this signal proactively. The boss only
sees problems when they happen to look at the right page.

**Outcome target:** a background **Watchdog** engine that scans every active
chantier on a 15-min cron, applies 8 rules, and surfaces alerts in three
places — a topbar bell, a per-chantier badge, and a global `/alertes` page —
plus an "Alertes" section on the existing HomePage so the cockpit feel is
present on day 1. The boss logs in once a day and sees what BatiTrack already
caught about their chantiers, without lifting a finger.

This is **Phase 1** of three. Phases 2 and 3 each get their own spec.

| Phase | Scope | Notes |
| --- | --- | --- |
| **1** (this spec) | Watchdog engine + alerts surfaces | Standalone shippable |
| 2 | Chef de chantier's mobile-first "Clôturer la journée" workflow | Wires the 9th alert rule (`daily_entry_missing`) declared but unused here |
| 3 | Full HomePage redesign into a boss-cockpit (weekly KPI deltas, photo strip, activity feed) | Replaces what an email digest would have done — same content, in-app, always current |

## 2. Goals & non-goals

**Goals**
- Detect 8 well-defined operational conditions and surface them as
  dismiss-able alerts.
- Make alerts persistently visible (bell badge across all pages; chantier
  badge on the list & detail; full inbox at `/alertes`; top-5 section on
  HomePage).
- Provide forecasting on the budget side (projected end-budget at current
  burn rate) so the boss sees problems before they happen, not after.
- Establish a reusable `alerts` data model that Phase 2 extends (one more
  rule) and Phase 3 reads (cockpit aggregates).

**Non-goals (deferred to later phases or explicitly out of scope)**
- Email or WhatsApp delivery of alerts — in-app only.
- Conversational LLM agent — Phase 3 candidate at most; not in scope here.
- Per-org tunable thresholds — v1 uses hard-coded sensible defaults; future
  Settings page can override.
- Real-time push (Supabase Realtime) — 60s React Query polling is enough.
- An `alerts_runs` audit table — deferred; logs from the Edge Function are
  enough for debugging in v1.

## 3. Architecture overview

Three things ship together:

1. **Engine** — a Supabase Edge Function `recompute-alerts` triggered by
   `pg_cron` every 15 minutes. Each rule is an isolated TS module that
   produces `AlertCandidate[]` from current DB state. Orchestrator
   reconciles candidates against the existing `alerts` table: inserts new
   ones, refreshes `last_seen_at` on still-active matches, auto-resolves
   alerts whose underlying condition no longer holds.

2. **Storage** — one new `alerts` table with org-scoped RLS, a partial
   unique index enforcing "at most one active row per fingerprint", and a
   3-state lifecycle (active / resolved / dismissed).

3. **UI surfaces** — three places alerts appear, all sharing one reusable
   `AlertCard` component (variants by `size` prop):
   - **Topbar bell** with red-dot badge, dropdown showing top-5 active.
   - **Per-chantier badge** on `ChantiersListPage` rows and
     `ChantierDetailPage` header; clicking the header chip scrolls to an
     inline `AlertsPanel` on the Budget tab.
   - **`/alertes` page** — full inbox with filters (severity, kind,
     chantier) and a history toggle.
   - **HomePage `Alertes` section** — top 5 active critical/warning
     alerts inline + "Voir toutes →" link.

```
                   ┌─────────────────────┐
   pg_cron (15m) ──▶│ recompute-alerts    │
                   │  (Edge Function)    │
                   │  ┌──────────────┐   │
                   │  │ rules/*.ts × 8│   │  → AlertCandidate[]
                   │  └──────────────┘   │
                   │  engine.ts          │  ──UPSERT/resolve──▶ alerts table
                   └─────────────────────┘                          │
                                                                    │ RLS
                  ┌─────────────────────────────────────────────────┘
                  ▼
   ┌──────────────┴─────────────────────────────────────────┐
   │  React app (React Query, polls every 60s)              │
   │   • Topbar bell + dropdown                             │
   │   • Per-chantier badge                                 │
   │   • /alertes page                                      │
   │   • HomePage <AlertesSection />                        │
   └────────────────────────────────────────────────────────┘
```

## 4. Data model

New migration `supabase/migrations/0007_alerts.sql`:

```sql
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
  'daily_entry_missing'   -- declared now; rule wired in Phase 2
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

-- one active row per (org, fingerprint); resolved/dismissed accumulate as history
create unique index alerts_active_fingerprint
  on public.alerts (org_id, fingerprint)
  where resolved_at is null and dismissed_at is null;

create index alerts_chantier_active
  on public.alerts (org_id, chantier_id)
  where resolved_at is null and dismissed_at is null;

create index alerts_org_created
  on public.alerts (org_id, created_at desc);

alter table public.alerts enable row level security;

-- SELECT: role-aware org scoping
create policy alerts_select on public.alerts for select using (
  org_id = app.active_org_id()
  and (
    app.my_role() in ('owner','admin')
    or (
      app.my_role() = 'site_manager'
      and (chantier_id is null or chantier_id in (select id from app.my_chantiers()))
    )
  )
);

-- UPDATE: dismiss only — same scope rules as SELECT, so a site_manager
-- can never dismiss an alert on a chantier they're not assigned to.
create policy alerts_dismiss on public.alerts for update using (
  org_id = app.active_org_id()
  and (
    app.my_role() in ('owner','admin')
    or (
      app.my_role() = 'site_manager'
      and (chantier_id is null or chantier_id in (select id from app.my_chantiers()))
    )
  )
) with check (
  dismissed_by = auth.uid()
);

-- INSERT/DELETE: service role only (engine writes via service key)
```

**State machine** — every alert is in one of three states:

| State | Condition | Visible in UI? |
| --- | --- | --- |
| Active | `resolved_at IS NULL AND dismissed_at IS NULL` | Yes — bell badge counts these |
| Resolved | `resolved_at IS NOT NULL` | Only in history view |
| Dismissed | `dismissed_at IS NOT NULL` | Only in history view |

**Fingerprint construction** (per rule):

| Rule | Fingerprint shape |
| --- | --- |
| `budget_burn_forecast` | `budget_burn_forecast:<chantier_id>` |
| `budget_category_exceeded` | `budget_category_exceeded:<chantier_id>:<category>` |
| `chantier_overdue` | `chantier_overdue:<chantier_id>` |
| `task_overdue` | `task_overdue:<task_id>` |
| `stock_low` | `stock_low:<item_id>` |
| `cash_negative` | `cash_negative:<chantier_id>` |
| `supplier_purchase_aging` | `supplier_purchase_aging:<purchase_id>` |
| `consumption_anomaly` | `consumption_anomaly:<chantier_id>:<item_id>:<yyyy-mm-dd>` |

**Re-firing cooldown** — when the engine wants to insert a new active alert
with fingerprint F, it first checks: is there a dismissed row with the same
fingerprint in the last 7 days? If yes, skip. If no, insert. The 7-day
cooldown keeps fatigue low without burying persistent problems forever.

**Auto-resolution** — at the end of each cron pass, for each rule, any
active alert whose `kind` matches the rule but is not in the current
candidate set gets `resolved_at = now()`. (Except `consumption_anomaly`
which is per-day and just ages out — see §5.8.)

## 5. Alert rules catalogue

Each rule lives in `supabase/functions/recompute-alerts/rules/<name>.ts`
and exports a single async function `recompute(org_id) → AlertCandidate[]`.
Body text is French; numbers use `formatMAD` / `formatPercent` helpers
mirrored from the frontend.

### 5.1 `budget_burn_forecast`

**Trigger.** Active chantier with `date_start` and `date_end_prev` set,
`budget_total > 0`, and `days_elapsed = today - date_start >= 7`. Compute
`days_total = date_end_prev - date_start`. Skip if `days_total <= 0`.
Compute `projected = (total_spent / days_elapsed) × days_total`. Fire if
`projected / budget_total > 1.0` AND `days_elapsed / days_total < 0.95`
(don't double-up with the "already over" rule at the very end of a
chantier).

**Severity.** `warning` if `projected_pct ≤ 1.10`, else `critical`.

**Title.** « Risque de dépassement de budget »

**Body.** « Au rythme actuel, {chantier.name} terminera à
{formatMAD(projected)} ({formatPercent(projected/budget_total)} du budget de
{formatMAD(budget_total)}). »

**Payload.** `{ projected, budget_total, pct, days_elapsed, days_total }`

**Auto-resolve.** Projected ≤ budget on next pass, OR chantier completed/
cancelled, OR chantier dates removed.

### 5.2 `budget_category_exceeded`

**Trigger.** For each `category ∈ {labor, materials, equipment}`:
`category_spent > category_budget` AND `category_budget > 0`. Three
independent fingerprints per chantier.

**Severity.** `warning` ≤ 110%, else `critical`.

**Title.** « Budget {category_label} dépassé »

**Body.** « {category_label} a consommé {formatMAD(spent)} sur un budget de
{formatMAD(budget)} ({formatPercent(spent/budget)}). »

**Payload.** `{ category, spent, budget, pct }`

**Auto-resolve.** `spent ≤ budget`, OR `budget = 0`, OR chantier completed.

### 5.3 `chantier_overdue`

**Trigger.** `chantier.status = 'active'` AND `chantier.date_end_prev < today`.
`days_late = today - date_end_prev`.

**Severity.** `warning` 1–7 days late, `critical` > 7.

**Title.** « Chantier en retard »

**Body.** « {chantier.name} devait se terminer le {formatDate(date_end_prev)}, soit {days_late} jours de retard. »

**Payload.** `{ days_late, date_end_prev }`

**Auto-resolve.** Status changes off `active`, OR `date_end_prev` updated to
future date.

### 5.4 `task_overdue`

**Trigger.** `task.status ≠ 'done'` AND `task.start_date + task.duration_days < today`
AND `task.chantier.status = 'active'`. Skip soft-deleted tasks.

**Severity.** `info` 1–2 days late, `warning` 3–7, `critical` > 7.

**Title.** « Tâche en retard »

**Body.** « {task.label} ({chantier.name}) devait se terminer le {formatDate(end)}. »

**Payload.** `{ days_late, task_label, task_status }`

**Auto-resolve.** `task.status = 'done'`, OR task soft-deleted, OR task
dates extended past today.

### 5.5 `stock_low`

**Trigger.** `consumables_items.reorder_threshold > 0` AND current
stock-on-hand < threshold, using the stock view created by
`supabase/migrations/0003_consumables_views.sql`.
Org-wide rule: `chantier_id = NULL` on every emitted candidate.

**Severity.** `warning` normally; `critical` if stock ≤ 0.

**Title.** « Stock bas »

**Body.** « {item.name} : {current_stock} {item.unit} restant(s), seuil de
réapprovisionnement à {threshold} {unit}. »

**Payload.** `{ item_id, current_stock, threshold, unit }`

**Auto-resolve.** `current_stock ≥ threshold`, OR item soft-deleted, OR
threshold reset to 0.

### 5.6 `cash_negative`

**Trigger.** Active chantier where `total_spent > 0` AND
`days_since_date_start > 14` AND `payments_received / total_spent < 0.70`.
The 14-day floor and 0.70 ratio together avoid firing on every brand-new
chantier (clients typically pay acompte after a week or two).

**Severity.** `warning`.

**Title.** « Trésorerie négative sur ce chantier »

**Body.** « {chantier.name} : paiements reçus {formatMAD(received)} pour
{formatMAD(spent)} de coûts engagés. Découvert de {formatMAD(spent - received)}. »

**Payload.** `{ received, spent, deficit, ratio }`

**Auto-resolve.** `received ≥ spent`, OR chantier completed.

### 5.7 `supplier_purchase_aging`

**Trigger.** `consumables_purchases.payment_status = 'pending'` AND
`today - purchased_at > 30 days` AND purchase not soft-deleted. Org-wide:
`chantier_id = NULL`.

**Severity.** `warning` 30–60 days aging, `critical` > 60.

**Title.** « Facture fournisseur en retard »

**Body.** « Facture {invoice_ref ?? 'sans réf.'} de {supplier_name} pour
{formatMAD(total)}, en attente depuis {days_aging} jours. »

**Payload.** `{ supplier_id, supplier_name, invoice_ref, total, days_aging }`

**Auto-resolve.** `payment_status = 'paid'`, OR purchase soft-deleted.

### 5.8 `consumption_anomaly`

**Trigger.** For each `consumables_consumption` row written today (i.e.
`used_at = today`): compute item's average daily consumption over the
prior 30 days. Fire if `today_qty > 3 × rolling_avg` AND `today_qty > floor`,
where `floor` is a per-unit absolute minimum looked up by the item's
`unit` string. Declared as a `const` map in `rules/consumption_anomaly.ts`:

```ts
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
```

Items with an unknown unit fall back to `DEFAULT_FLOOR`. The floors are
deliberately set so that a single typo (e.g., qty `1000` instead of `100`)
trips the rule, while routine usage (a few `kg` of ciment) doesn't.

**Severity.** `info` (mostly a data-quality signal).

**Title.** « Consommation anormale »

**Body.** « {item.name} sur {chantier.name} : {today_qty} {unit} aujourd'hui (moyenne {avg_qty} {unit}/jour sur 30 jours). »

**Payload.** `{ item_id, today_qty, avg_qty, ratio }`

**Auto-resolve.** N/A — per-day fingerprint means new alerts replace stale
ones naturally. Add a separate maintenance step: archive (`resolved_at`)
any `consumption_anomaly` row whose `first_seen_at < now() - 14 days` on
each cron pass.

## 6. UI surfaces

All four surfaces share **one reusable `AlertCard` component** in
`src/components/alerts/AlertCard.tsx` with a `size` prop (`'compact'` for
the bell dropdown, `'default'` everywhere else).

### 6.1 Topbar bell

- Mounts in `src/components/AppShell.tsx` to the right of the org
  selector.
- Bell icon with a red dot showing count of active alerts.
- Click opens a dropdown (Radix Popover) showing the 5 most-recent active
  alerts in `compact` mode, plus a footer link « Voir toutes les alertes → »
  to `/alertes`.
- Hidden for `worker` role; visible for owner/admin/site_manager.
- React Query polls every 60s.

### 6.2 Per-chantier badge

- On `ChantiersListPage` rows: a small pill rendering as `🔴 3` (critical
  count, takes precedence) or `🟡 2` (warning count) or hidden. Position:
  right of the chantier name.
- On `ChantierDetailPage` header: a chip « 3 alertes actives → » that
  scrolls to an inline `<AlertsPanel chantierId={c.id} />` placed at the
  top of the Budget tab.
- `AlertsPanel` shows full-size `AlertCard`s with dismiss buttons.

### 6.3 `/alertes` page

- New file `src/pages/alertes/AlertsPage.tsx`.
- New sidebar nav item « Alertes » with badge count (count uses the same
  query as the bell).
- Top filter row: severity chips (Toutes / Critique / Avertissement /
  Info), kind dropdown, chantier dropdown.
- Default sort: severity desc (critical → info), then `last_seen_at` desc.
- Each row is an `AlertCard` in `default` size with dismiss button.
- Toggle « Voir l'historique » reveals resolved + dismissed alerts as a
  separate section below the active list, sorted by `resolved_at` /
  `dismissed_at` desc, read-only.
- Empty state: « Aucune alerte active — tout va bien. »

### 6.4 HomePage `<AlertesSection />`

- New component `src/components/alerts/AlertesSection.tsx`.
- Renders into `src/pages/HomePage.tsx` between the existing KPI strip
  and the existing over-budget chantier list.
- Shows top 5 active alerts where `severity in ('critical', 'warning')`,
  sorted critical-first then by `last_seen_at` desc.
- Footer link « Voir toutes les alertes ({count}) → » → `/alertes`.
- If no critical/warning alerts: renders nothing (don't add visual noise
  on a healthy org).

### 6.5 Dismiss UX

- Single-tap dismiss; no confirm dialog.
- Toast « Alerte ignorée » appears bottom-right with an « Annuler » link
  active for 5 seconds — clicking it calls `undismissAlert(id)`.
- Engine-side 7-day cooldown handles persistent dismissed conditions.

## 7. Permissions

Inherits the existing role model:

| Role | Bell | Per-chantier badge | /alertes | HomePage section |
| --- | --- | --- | --- | --- |
| owner | All org alerts | All chantiers | All | All |
| admin | All org alerts | All chantiers | All | All |
| site_manager | Only their chantiers | Only their chantiers | Only their chantiers | Only their chantiers |
| worker | Hidden | Hidden | Hidden (route inaccessible) | Hidden |

Enforced by the RLS policies in §4. The frontend hides the bell + nav
item for worker role using `useOrg().myRole` checks, but the RLS is the
real boundary.

## 8. Operations

### 8.1 Engine entry point

`supabase/functions/recompute-alerts/index.ts` — invoked by `pg_cron`
via `pg_net` HTTP POST. No request body. Returns a JSON summary:

```json
{ "orgs": 3, "passes": 24, "inserted": 5, "refreshed": 12, "resolved": 4 }
```

### 8.2 Engine logic

```ts
// Pseudo-code — actual TS in engine.ts
for (const org of activeOrgs()) {
  for (const rule of RULES) {
    const candidates = await rule.recompute(org.id);
    for (const c of candidates) {
      // Insert OR refresh, with cooldown check
      await upsertActiveAlert(c);
    }
    // Auto-resolve alerts no longer in the candidate set
    await autoResolveStale(org.id, rule.kind, candidates.map(c => c.fingerprint));
  }
}
```

Per-rule transactions; one rule's failure doesn't poison the others.
Failures `console.error` and continue.

### 8.3 Cron registration

One-off after the function is deployed:

```sql
select cron.schedule(
  'recompute-alerts',
  '*/15 * * * *',
  $$
    select net.http_post(
      'https://<project-ref>.supabase.co/functions/v1/recompute-alerts',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      )
    )
  $$
);
```

Store `app.service_role_key` via `alter database ... set` once, never in
source control. Document this in `FOLLOW_UPS.md`.

### 8.4 Performance budget

50 chantiers × 8 rules × ≤ 3 indexed queries per rule ≈ ~1200 queries per
pass. Each query <50 ms via existing indexes (org_id, chantier_id are
covered). Estimated cron-pass duration: < 5 s. Edge Function timeout is
60 s — wide margin.

### 8.5 Cost

Cron at every 15 min × 24 h × 30 days = 2 880 invocations/month per
project. Supabase free tier includes 500 k Edge Function invocations
per month. Comfortably free.

### 8.6 Edge cases

| Case | Behaviour |
| --- | --- |
| Chantier soft-deleted | Engine skips it; existing alerts auto-resolve on next pass |
| Item / task / purchase soft-deleted | Alert auto-resolves on next pass |
| Chantier status → completed/cancelled | All its alerts auto-resolve |
| Cron skipped one or more passes | Next pass catches up — UPSERTs are idempotent |
| Engine fails mid-rule | Other rules continue; failed rule retries next pass |
| Race: user dismisses while engine auto-resolves | UPDATE clauses include `WHERE dismissed_at IS NULL` / `WHERE resolved_at IS NULL` so neither stomps the other |
| Clock skew | All `now()` calls go through Postgres, not the function's `Date.now()` |

### 8.7 Observability

- Each cron pass `console.log`s counts at end.
- Once Sentry is wired (per FOLLOW_UPS), exceptions auto-report.
- No `alerts_runs` audit table in v1 (skippable; logs suffice).

## 9. Files touched

**Create**
- `supabase/migrations/0007_alerts.sql` — types, table, indexes, RLS
- `supabase/functions/recompute-alerts/index.ts` — entry point
- `supabase/functions/recompute-alerts/engine.ts` — orchestrator + upsert
- `supabase/functions/recompute-alerts/rules/budget_burn_forecast.ts`
- `supabase/functions/recompute-alerts/rules/budget_category_exceeded.ts`
- `supabase/functions/recompute-alerts/rules/chantier_overdue.ts`
- `supabase/functions/recompute-alerts/rules/task_overdue.ts`
- `supabase/functions/recompute-alerts/rules/stock_low.ts`
- `supabase/functions/recompute-alerts/rules/cash_negative.ts`
- `supabase/functions/recompute-alerts/rules/supplier_purchase_aging.ts`
- `supabase/functions/recompute-alerts/rules/consumption_anomaly.ts`
- `supabase/functions/recompute-alerts/rules/*.test.ts` — unit tests
- `supabase/tests/rls/alerts.sql` — pgTAP RLS tests
- `src/data/alerts.ts` — DAL: `listActiveAlerts`, `listAlertsForChantier`, `dismissAlert`, `undismissAlert`
- `src/components/alerts/AlertCard.tsx`
- `src/components/alerts/AlertsBell.tsx`
- `src/components/alerts/AlertsPanel.tsx` — per-chantier inline list
- `src/components/alerts/AlertesSection.tsx` — HomePage block
- `src/pages/alertes/AlertsPage.tsx`

**Edit**
- `src/App.tsx` — register `/alertes` route
- `src/components/Sidebar.tsx` — add « Alertes » nav item with badge
- `src/components/AppShell.tsx` — mount the bell in the topbar
- `src/pages/HomePage.tsx` — slot in `<AlertesSection />`
- `src/pages/chantiers/ChantiersListPage.tsx` — alert pill on rows
- `src/pages/chantiers/ChantierDetailPage.tsx` — alert chip in header
- `src/pages/budget/ChantierBudgetView.tsx` — `<AlertsPanel />` at top of Budget tab
- `FOLLOW_UPS.md` — strike "watchdog/alerts" from long-term roadmap; add
  pointers to the cron-registration SQL

## 10. Testing

- **Per-rule unit tests** in `rules/<name>.test.ts` (Deno test runner, since
  Edge Functions run on Deno). Given a curated chantier-state JSON, assert
  the produced `AlertCandidate[]` matches expectations.
- **pgTAP test** `supabase/tests/rls/alerts.sql` asserting:
  - owner of org A sees only their org's alerts
  - site_manager sees only assigned chantiers
  - worker sees zero rows
  - cross-org leak attempt fails (insert into org B as user from A)
- **Manual smoke against demo data**: after `seedDemoData()`, the Atelier
  chantier (which the recent migration tunes to be over-budget on
  matériels — `budget_equipment = 5000`, `equipment_spent ≈ 13 280 MAD`)
  must produce a `budget_category_exceeded:<atelier_id>:equipment` alert
  of severity `critical` on the first cron pass.

## 11. Open questions / deferred

- **Push notifications** — browser Notification API for active sessions
  when a `critical` alert appears. Deferred; not required for v1.
- **Custom thresholds per org** — Settings page slider for the 6 most
  sensitive thresholds. Deferred — wait until a real customer asks.
- **Bulk dismiss / "mark all as read"** — deferred; users can dismiss
  one-by-one in v1.
- **Audit log integration** — should alert dismissals write to the
  existing `audit_log` table? Probably yes long-term; deferred.

## 12. Migration order / rollout

1. Apply `0007_alerts.sql` to the Supabase project (SQL Editor).
2. Deploy the `recompute-alerts` Edge Function via `supabase functions deploy`.
3. Set `app.service_role_key` once via `alter database`.
4. Register the cron job (§8.3).
5. Deploy the frontend.
6. Manually trigger the first run (`supabase functions invoke recompute-alerts`).
7. Verify alerts populate in the DB (`select * from public.alerts where org_id = ...`).
8. Verify the bell + HomePage + per-chantier badges + /alertes page all
   render expected alerts.
9. Wait 15 min, verify cron auto-fired (the function logs visible in the
   Supabase dashboard).

---

*This spec is locked. Open new specs for Phases 2 and 3.*
