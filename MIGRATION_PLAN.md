# BatiTrack — Architecture migration plan

Two changes, gated for approval at four checkpoints. No feature-port code until Gates 1–4 are signed off.

## Status

| Gate | Description | Status |
|---|---|---|
| 1 | Written plan + decisions | ✅ approved |
| 2 | `supabase/migrations/0001_initial_schema.sql` + `wipe.sql` | ✅ approved (delivered with the schema-hardening additions noted below; payroll scope removed post-Gate 4) |
| 3 | Vite skeleton (TypeScript, no legacy coexistence) | ✅ approved |
| 4 | DAL stubs in `src/data/*.ts` | ✅ approved |
| 5 | **Auth + minimal org bootstrap** (`AuthContext`, `OrgContext`, login/signup/reset/callback pages, `CreateOrgPage`, `app.create_organization_with_owner()` RPC) | ✅ delivered, awaiting approval |
| 6+ | Remaining feature ports (org/membership UI → chantiers → …) | ⏳ blocked on Gate 5 sign-off |

### Deviations from the original plan (user-authorised: « implement best practices »)

- **TypeScript instead of JSDoc-typed JS.** `tsconfig.json` is strict (incl.
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noImplicitOverride`).
  Path alias `@/*` configured in both `vite.config.ts` and `tsconfig.json`.
- **Legacy app deleted in place.** `Batitrack.html`, every legacy `src/*.jsx`,
  `src/onboarding/`, and the transitional `src/entry/` folder are gone.
  No coexistence period — the new Vite app is the only entry point.
- **Schema hardening applied to `0001_initial_schema.sql`** beyond the plan:
  - **Soft-delete-aware unique indexes** on `memberships` and `chantier_assignments`
    (the inline `unique (...)` constraints would otherwise block re-inviting a
    revoked member).
  - **`auth.uid()` wrapped in `(select auth.uid())`** in every policy that
    references it directly — material RLS planner perf win.
  - **`check` constraints on `qty`** (consumption / transfers / adjustments /
    purchase_lines / deployments — all must be `> 0` since shrinkage uses
    `is_loss` / `adjustment_category` instead of negative amounts).
  - **`check` on `amount > 0`** for chantier_payments, and on
    `prime_amount >= 0` for attendance.
  - **`revoke execute on function … from public`** for every SECURITY DEFINER
    function, with explicit `grant … to authenticated` only for the user-callable
    helpers (the trigger-only functions stay private).
  - **Audit-log partitioning** noted in a comment (deferred until ~1 M rows).
- **Tooling added:** `vite-plugin-checker` (in-dev TS + ESLint),
  `@testing-library/react` + `jest-dom` setup, `.editorconfig`,
  `.vscode/extensions.json`, ErrorBoundary in `src/lib/error-boundary.tsx`.
- **DAL stubs use a `todo()` helper** that returns `never` so TS return-types
  are satisfied while the body throws a typed `DALError`.
- **Plan/README/SECURITY rewritten** to reflect the new architecture.
- **Payroll scope removed (post-Gate 4).** The original brief listed `payslips`,
  `avances` / `retenues`, and `quinzaine_states` as core entities. User
  clarified BatiTrack is a project-management platform for construction
  companies (presence + expense tracking), not HR. The three payroll tables —
  with their enums (`payslip_lifecycle`, `payslip_adjustment_kind`,
  `quinzaine_half`), indexes, RLS policies, and triggers — plus
  `src/data/payslips.ts` were stripped. The presence-calendar « vue quinzaine »
  is preserved (it's a UI view over `attendance`, not a payroll concept).

### Deferred (not silently dropped)

- **Husky + lint-staged** — not added; left as a developer-choice toggle.
- **Supabase config.toml** for local CLI — not added; only relevant if the
  user adopts the Supabase CLI for local dev.
- **CI workflow for migration tests** — `deploy.yml` already runs `lint` +
  `test` + `build` on every push. A separate workflow that spins up Postgres
  and runs the SQL migration end-to-end can be added with the first pgTAP test.
- **Dependabot** — not added; `npm audit` and `npm outdated` cover the
  immediate needs.

## Scope

1. **Change 1** — Replace the single JSONB blob (`user_state.data`) with a normalized PostgreSQL schema. Add multi-user organizations (owner / admin / site_manager / worker). RLS-enforced. Audit log via Postgres triggers.
2. **Change 2** — Convert from `<script type="text/babel" src="…">` + Tailwind CDN + Babel-Standalone to a Vite build. Drop `'unsafe-eval'`. Harden the CSP.

## Decisions I made (override any)

- **Money type**: `numeric(14, 2)` everywhere. CI check: SQL test scans `information_schema.columns` and fails on `real`/`float`/`double precision` outside whitelisted `*_pct` columns.
- **Email invitations**: Supabase Auth's built-in invite (`supabase.auth.admin.inviteUserByEmail`). No third-party email provider. 7-day expiry is Supabase's default.
- **Data migration**: Full wipe per brief. No migration tool. `wipe.sql` drops `user_state` and deletes test `auth.users`. Documented manual pre/post steps.
- **`worker_chantier_assignments` table**: **Not creating it**. The current code has no such concept — worker↔chantier is recorded per attendance row's `chantier_id`. Adding a table would mirror nothing and reduce flexibility (a worker can be on different chantiers on different days). The brief listed it speculatively; the code disagrees.
- **`labor_entries` table**: Creating it but **populated by trigger** from attendance INSERT/UPDATE, with `source='attendance'`. Leaves room for `source='manual'` (subcontractor invoices for labor) later. Budget engine queries `labor_entries` directly, never iterates over attendance in the DAL.
- **Tasks vs plans**: Single `tasks` table, self-referential via `parent_task_id`. Groups are tasks with children. Cleaner than two tables.
- **Pointage uniqueness**: `unique(org_id, worker_id, date)` (a worker is on at most one chantier per day, matching the current cell structure).
- **Primes**: Embedded on the attendance row (`prime_amount`, `prime_motif`). No separate table — cardinality is 1:1, splitting is overengineering.
- **Transfers `from`/`to` locations**: Two nullable FKs `from_chantier_id` / `to_chantier_id`. NULL means central depot. App validates exactly-zero-or-one is NULL.
- **Worker self-service**: Workers can SELECT their own attendance and labor_entries, but cannot INSERT/UPDATE in MVP. Mobile clock-in is post-MVP. The role exists in the schema; the write path doesn't yet.
- **Price visibility**: Workers cannot see prices (unit_price, total, average_price, supplier costs). Enforced via column-level grants on per-role VIEWs. Workers DO see their own `daily_rate` (their pay).
- **Org subscription `plan` field**: `text default 'free'`. No billing logic. Field exists for future.
- **Org soft-delete**: `deleted_at` flag. App-level filter on every query. No SQL `ON DELETE CASCADE` — too destructive.
- **Hosting**: GitHub Pages initially (per brief). Document HSTS/X-Frame-Options/Referrer-Policy/Permissions-Policy headers needed on Cloudflare Pages / Vercel / Netlify when we migrate. CSP delivered via `<meta http-equiv>` until then.
- **Repo**: Same repo, in place. Git history preserved.
- **Lint/format**: ESLint + Prettier (industry default; not Biome).
- **Test framework**: Vitest (already in `Batitrack-tests/`). Playwright stays. RLS tests via `pgTAP` (Postgres-native, runs under `supabase test db`).

## Entities

Business tables (all have `id uuid pk default gen_random_uuid()`, `org_id uuid fk`, `created_at`, `updated_at`, `deleted_at` unless noted):

1. **organizations** — name, legal_name, ice, rc, cnss, address, phone, email, plan, currency='MAD', locale='fr-MA', timezone='Africa/Casablanca'
2. **memberships** — user_id (auth.users), org_id, role enum, status enum (invited/active/revoked), invited_at, accepted_at; unique(user_id, org_id)
3. **chantier_assignments** — membership_id, chantier_id (scopes site_manager to specific chantiers)
4. **chantiers** — name, type, color, color_soft, client_name, manager_name (free text), manager_user_id (nullable FK auth.users), address, date_start, date_end_prev, budget_total, budget_labor, budget_materials, contract_value, status enum (active/paused/completed/cancelled). Drop legacy `budget` and `budgetMO`.
5. **chantier_payments** — chantier_id, payment_date, amount, reference, attachment_url, recorded_by, notes
6. **workers** — full_name, role, daily_rate, phone, cin, hire_date, status (active/inactive), hue, user_id (nullable FK auth.users)
7. **attendance** — chantier_id, worker_id, attendance_date, status enum (P/A), absence_reason, prime_amount, prime_motif, note, recorded_by; unique(worker_id, attendance_date)
8. **labor_entries** — chantier_id, worker_id, entry_date, days numeric(5,2), computed_cost numeric(14,2), source enum (attendance/manual); trigger-populated from attendance
9. **tasks** — chantier_id, parent_task_id (nullable self-FK), label, start_date, duration_days, status enum (todo/ongoing/done/critical), sort_order
10. **task_assignments** — task_id, worker_id; unique(task_id, worker_id)
11. **materiels** — name, category, type enum (possede/loue), qty, unit, cost_per_day
12. **materiel_deployments** — materiel_id, chantier_id, start_date, end_date, qty
13. **suppliers** — name, type, phone, city, address, notes
14. **consumables_items** — name, category, unit, average_price, default_supplier_id, reorder_threshold, has_expiry, notes
15. **consumables_purchases** — chantier_id (nullable=depot), supplier_id, invoice_ref, purchased_at, payment_status enum (paid/pending/partial), attachment_url, recorded_by, notes
16. **consumables_purchase_lines** — purchase_id, item_id, qty, unit_price, total
17. **consumables_consumption** — chantier_id, task_id (nullable), item_id, qty, used_at, recorded_by, notes, is_loss
18. **consumables_transfers** — item_id, qty, from_chantier_id (nullable), to_chantier_id (nullable), transferred_at, notes, recorded_by
19. **consumables_adjustments** — item_id, qty, type enum (loss/theft/damage/correction), adjusted_at, notes, recorded_by
20. **audit_log** — user_id, action, entity_type, entity_id, before jsonb, after jsonb, ip, user_agent, created_at. INSERT-only policy. Trigger-populated.
21. **user_preferences** — user_id, org_id, last_chantier_id, locale_override, theme (no `deleted_at`)

Indexes: every FK; `(org_id, deleted_at)` on every business table; `(org_id, chantier_id, attendance_date)` on attendance; `(org_id, chantier_id, used_at)` on consumption; `(org_id, status)` on chantiers.

## Things that don't fit cleanly (flagged, not silently dropped)

1. **Plans drag overrides** — ephemeral React state in `planning.jsx`; not persisted. Stays in client state. Zero schema impact.
2. **Pointage cell free-form `audit` arrays** — historical per-cell change tracking. Replaced by the global `audit_log` table (populated by triggers). Loses per-cell display granularity unless we surface audit_log rows by `entity_id`. Acceptable trade.
3. **Empty planning groups with `start+duration` but no children** — supported in current code's dual-mode logic (computed from children when present). Schema permits NULL start/duration on tasks; app preserves the computed-from-children precedence.
4. **`status` field on plans tasks is freely set in current code** — enforcing as enum will reject any unexpected value. We're wiping data, so this is purely a forward constraint.
5. **`chantier.payments[]` embedded array** — promoted to its own table (`chantier_payments`). Drops the ability to reference payments via the chantier object in a single read; the DAL re-aggregates.
6. **`purchases[].items[]` embedded** — promoted to `consumables_purchase_lines`. Same trade.
7. **`audit_log` `user_id`** — must be set by trigger from `auth.uid()`. Verified `auth.uid()` works inside Supabase trigger functions when invoked through PostgREST. Service-role writes bypass triggers anyway.

## Data access layer

Path: `src/data/`. JSDoc-typed (TS conversion is a separate gate not on the current path).

```
src/data/
├── client.js         supabase client singleton, active-org context
├── orgs.js           listMyOrgs, createOrg, inviteMember, acceptInvite, switchOrg
├── chantiers.js      list, get, create, update, softDelete
├── workers.js        list, create, update, softDelete
├── attendance.js     list({orgId,chantierId?,dateRange}), upsert, bulkUpsert
├── tasks.js          listForChantier, create, update, reorder, softDelete
├── assignments.js    listForTask, addWorker, removeWorker
├── materiels.js      list, create, update, listDeployments, createDeployment
├── suppliers.js      list, create, update, softDelete
├── consumables.js    listItems, createPurchase, createConsumption, createTransfer, createAdjustment
├── payments.js       listForChantier, create, softDelete
├── audit.js          list({orgId,entityType?,since?})
├── prefs.js          get, setLastChantier, setLocaleOverride
└── budget-engine.js  laborSpentForChantier, equipmentSpentForChantier, materialsSpentForChantier, paymentsReceivedForChantier
```

Each function:
- Resolves `org_id` from the active-org context provider (never accepts it as a free parameter from a component).
- Adds `deleted_at IS NULL` implicitly.
- Returns plain JS objects, never raw Supabase response wrappers.
- Throws typed errors: `NotFoundError`, `PermissionError`, `ValidationError`, `NetworkError`.

No React component calls `supabase.from(...)` directly. Verified by an ESLint rule (`no-restricted-syntax` on `MemberExpression[object.name='supabase']` outside `src/data/`).

`budget-engine.js` pushes aggregation into Postgres (single SQL per function, no JS iteration over arrays). Labor formula stays bit-exact: `SUM(days * daily_rate) + SUM(prime_amount)` over attendance rows filtered by chantier and date range.

## Permission matrix

| Action | owner | admin | site_manager | worker |
|---|---|---|---|---|
| Manage organization | ✓ | × | × | × |
| Invite / revoke users | ✓ | ✓ | × | × |
| Create / edit chantier | ✓ | ✓ | × | × |
| View chantier | ✓ | ✓ | only assigned | × |
| Create / edit attendance | ✓ | ✓ | only assigned chantiers | × (MVP) |
| View own attendance + own labor_entries | n/a | n/a | n/a | ✓ |
| View labor cost (with prices) | ✓ | ✓ | only assigned | × |
| View own daily_rate | n/a | n/a | n/a | ✓ |
| Create / edit workers | ✓ | ✓ | × | × |
| Create / edit consumables items, suppliers | ✓ | ✓ | ✓ | × |
| Create purchases / consumption / transfers | ✓ | ✓ | only own chantiers + depot | × |
| View prices on consumables | ✓ | ✓ | ✓ | × |
| View / edit plans (tasks) | ✓ | ✓ | only own chantiers | view-only on assigned tasks |
| View audit_log | ✓ | ✓ | × | × |

Implemented as: base `EXISTS(SELECT 1 FROM memberships WHERE …)` policy on every business table + role-specific layered policies via helper functions `app.user_role_in_org(org_id)` and `app.user_has_chantier(chantier_id)`. Audit log gets only an INSERT policy; no UPDATE/DELETE policies exist at all.

## Test plan

- **RLS cross-tenant** (`supabase/tests/rls/*.sql`, pgTAP): one file per business table. Asserts user-in-org-A cannot SELECT/INSERT/UPDATE/DELETE rows where `org_id=B`. Fails the suite if any policy is missing.
- **Role tests** (`supabase/tests/roles/*.sql`): each row of the matrix above is one assertion.
- **Audit trigger test**: UPDATE on each business table creates exactly one `audit_log` row with `before` and `after` JSON containing only the changed columns.
- **DAL unit tests** (`Batitrack-tests/dal/*.test.js`, Vitest): one spec per DAL function. Supabase client mocked. Asserts query shape and error mapping.
- **Integration test** (`Batitrack-tests/integration/full-org.test.js`): seeds one org with 2 users, 2 chantiers, 30 days of attendance with primes, purchases, consumption, payments. Asserts `laborSpentForChantier(c1)` line-by-line equals the manual sum. Asserts `equipmentSpentForChantier`, `materialsSpentForChantier`, `paymentsReceivedForChantier` similarly. **Must produce identical numbers to the current code** — this is the contract.
- **Money-type lint** (`supabase/tests/lint/money_types.sql`): rejects `real`/`float`/`double precision` columns outside the `*_pct` whitelist.
- **CSP test** (Playwright): loads `/`, asserts zero CSP violations in console, asserts the document's CSP meta does NOT contain `'unsafe-eval'`.
- **Baseline preservation**: existing 81/81 Vitest + 24/24 Playwright must stay green. New tests stack on top, none replace existing.

## Sequencing — four approval gates

- **Gate 1** (this document): plan + decisions. Approve before any work.
- **Gate 2**: `supabase/migrations/0001_initial_schema.sql` (DDL + indexes + RLS + trigger functions) and `supabase/migrations/wipe.sql` (with documented manual steps for the Supabase dashboard). Approve before Vite skeleton.
- **Gate 3**: Vite project skeleton — `package.json`, `vite.config.js`, `index.html` (replaces `Batitrack.html`), `src/main.jsx` entry point, `tailwind.config.js` + `postcss.config.js` + `src/index.css` (ported CSS vars), `.env.example`, `.eslintrc`, `.prettierrc`, `.github/workflows/deploy.yml`. Hardened CSP exactly matching the brief. Approve before DAL.
- **Gate 4**: DAL — function signatures + JSDoc types + stub bodies that throw. No React rewrites. Approve before feature ports.

After Gate 4, feature ports proceed one module at a time in this order: auth → org/membership UI → chantiers → workers → attendance (with prime inputs inline) → materiels + deployments → suppliers → consumables (items / purchases / consumption / transfers / adjustments) → chantier_payments → tasks / planning → budget dashboard. Each port lands with its tests. App is runnable end-to-end after every port.

## Out of scope (deferred, not silently dropped)

- Mobile worker clock-in (geofence / QR).
- File attachments (would need Supabase Storage buckets + their own RLS).
- Real-time collaborative editing (Postgres LISTEN/NOTIFY via Supabase Realtime).
- i18n beyond the `locale_override` field.
- Billing / plan enforcement.
- Custom domain on GH Pages.
- Per-chantier stock alerts (mentioned in prior session's deferred list — still deferred).
