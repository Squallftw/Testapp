# BatiTrack — Follow-ups & improvements

Every "we should add this later" decision made during the migration, with the
reason for deferring and what « later » looks like. Add new items as you find
them; check them off as they land.

**Status:** ⏳ pending · 🚧 in-progress · ✅ done · ⛔ dropped
**Priority:** 🔴 critical (before production) · 🟡 important · 🟢 nice-to-have · 🔵 long-term

---

## 📦 Migrations to apply before using the live app

Run these in the Supabase SQL Editor in order. The app degrades gracefully if
any are missing (member-list and purchase-creation just fail) but **migration
0004 is required for the Planning page**.

- ⏳ `supabase/migrations/0002_member_management.sql` — members RPCs + last-owner trigger
- ⏳ `supabase/migrations/0003_consumables_views.sql` — purchase RPC + stock-on-hand view
- ⏳ `supabase/migrations/0004_tasks_rpcs.sql` — task + assignment RPCs (Planning)
- ⏳ `supabase/migrations/0005_fix_tasks_rls_recursion.sql` — breaks an RLS loop on the tasks table that fires whenever task_assignments rows exist (required as soon as you create any task with an assignee)

---

## 🔴 Critical before production

Blockers for any real user data or paying customer.

### Schema & data integrity

- ⏳ **RLS cross-tenant test suite** — `supabase/tests/rls/*.sql` (pgTAP), one
  file per business table. Asserts user-in-org-A cannot SELECT/INSERT/UPDATE/
  DELETE rows where `org_id = B`. Catastrophic without these — any RLS
  regression silently leaks cross-tenant data.
- ⏳ **Role permission test suite** — `supabase/tests/roles/*.sql`, one
  assertion per row of the permission matrix in `SECURITY.md`.
- ⏳ **Audit trigger tests** — assert UPDATE on each business table creates
  exactly one `audit_log` row with `before` and `after` populated.
- ⏳ **Money-type lint test** — `supabase/tests/lint/money_types.sql`.
  Scans `information_schema.columns`, fails if any column is `real` /
  `float` / `double precision` outside an explicit whitelist (`*_pct` only).
- ⏳ **CI workflow for migrations** — separate workflow that spins up
  Postgres in a container, applies `0001_initial_schema.sql` end-to-end,
  then runs all the pgTAP suites above. `deploy.yml` today only runs
  `lint` + `test` + `build`.
- ⏳ **`npm run gen:types`** — `src/data/database.types.ts` is currently
  `any`. Run once the schema is applied to a real Supabase project; commit
  the result. Most DAL functions become sharper-typed automatically.

### Auth & accounts

- ⏳ **« Set new password » page** — the reset-password email is sent but
  there's no page to actually update the password. After clicking the link
  the user lands on `/auth/callback` authenticated with their **old**
  password. Needs `/auth/update-password` that calls
  `supabase.auth.updateUser({ password })`.
- ⏳ **MFA for owner accounts** — Supabase Auth supports TOTP via
  `supabase.auth.mfa.enroll()`. Add a Security section in account settings;
  enforce for `role = 'owner'`.
- ⏳ **CAPTCHA on signup + reset** — hCaptcha or Cloudflare Turnstile.
  Mandatory before any public-traffic launch.
- ⏳ **Leaked-password protection** — Supabase Auth's HaveIBeenPwned
  integration. One toggle in the Supabase dashboard.
- ⏳ **Session timeout policy** — decide idle timeout (legacy was 8 h).
  Configure via Supabase Auth settings.
- ⏳ **Form-level password strength** — current minimum is 8 chars. Add
  zxcvbn meter, optional complexity rules.

### Compliance (RGPD / Loi 09-08)

- ⏳ **Privacy policy page** in the UI (required by RGPD before collecting
  PII; we collect emails, CIN, phones).
- ⏳ **Data export** — UI button « Télécharger mes données » that returns
  the user's data + their org's data as downloadable JSON.
- ⏳ **Account deletion** — UI flow « Supprimer mon compte » that calls
  `delete from auth.users where id = auth.uid()`. Cascade removes
  memberships; org data persists (separate decision: if last owner deletes,
  soft-delete the org).
- ⏳ **Cookie / localStorage notice** — minimal disclosure for the auth
  session storage.

### Production deployment

- ⏳ **Custom domain + HSTS preload** — submit to
  https://hstspreload.org/ after running with HSTS for 6 months.
- ⏳ **HTTP headers via real proxy** — move from GH Pages to Cloudflare
  Pages / Vercel / Netlify. Add HSTS, X-Frame-Options, Referrer-Policy,
  Permissions-Policy. CSP becomes an HTTP header (more reliable than
  `<meta>`).
- ⏳ **GH Pages base path** — `vite.config.ts` has `base: '/'`. If
  deploying to `username.github.io/Batitrack/`, change to `'/Batitrack/'`
  or wire through an env var.
- ⏳ **Distinct Supabase projects** — `dev`, `staging`, `prod`. Different
  anon keys, different DB URLs, different `.env.*.local`.
- ⏳ **Periodic Supabase key rotation** — schedule + runbook.
- ⏳ **Off-Supabase backups** — Supabase has daily backups; add a weekly
  dump to S3 / external storage for disaster recovery.
- ⏳ **Incident response runbook** — who to notify, in what timeframe, how
  to invalidate sessions.

---

## 🟡 Important (next 1-3 ports)

### Org / membership UI — *the immediate next port*

- ⏳ **Multi-org selector in topbar** — when user has > 1 org. Persists the
  active org. Extend `user_preferences` with an `active_org_id` column or
  reuse `last_chantier_id` semantics.
- ⏳ **Invite-by-email flow** — owner/admin enters email + role + chantier
  scope (for `site_manager`). Requires a Supabase Edge Function that calls
  `auth.admin.inviteUserByEmail()` with the `service_role` key, then inserts
  a `memberships` row with `status='invited'`. **Critical**: the
  service_role key MUST stay server-side only.
- ⏳ **Accept-invite landing page** — `/accept-invite/:membershipId`. Sets
  `status = 'active'`, `accepted_at = now()`.
- ⏳ **Members list / role management** — table of memberships with role
  dropdown (owner only), revoke action.
- ⏳ **Chantier-assignment management** — UI for owner/admin to scope a
  `site_manager` to specific chantiers (`chantier_assignments` table).
- ⏳ **Org settings page** — name, legal_name, ICE / RC / CNSS, address,
  phone, email. Implements `orgs.updateOrg` (currently a stub).
- ⏳ **« Last owner protection »** — refuse to revoke/demote the only
  remaining owner of an org. Belongs in the RPC or a trigger.

### Account settings (after org/membership)

- ⏳ **Change email** — `supabase.auth.updateUser({ email })`.
- ⏳ **Change password while logged in** — `supabase.auth.updateUser({ password })`.
- ⏳ **Active sessions list + revoke** — via the Supabase admin API.
- ⏳ **Delete account** (also listed under compliance).

### Tests

- ⏳ **Deepen the 3 smoke tests** — currently AuthContext / OrgContext /
  LoginPage just verify shapes and render. Add: form submission, error
  display, navigation after success, session restoration on reload,
  sign-out flow.
- ⏳ **Integration test for org bootstrap** — sign up → confirm email →
  create org → land on home → org is set as active in the DAL.

---

## 🟡 Important infrastructure

### DAL

- ⏳ **`mapSupabaseError` coverage** — add cases for more Postgres SQLSTATE
  codes as they surface (`23502` not_null_violation, `40001` serialization
  failure, `57014` query_canceled, etc.).
- ⏳ **Request tracing** — generate a `request_id` UUID per DAL call,
  attach as a Supabase header, capture in `audit_log` for correlation of
  related changes.
- ⏳ **Optimistic locking** — add a `version int` column (or use
  `updated_at` as a guard) on chantiers / tasks / payslip-like rows.
  Prevents lost updates in concurrent editing.

### UI infrastructure

- ⏳ **App shell layout** — sidebar nav + topbar for authenticated routes.
  HomePage currently has its own ad-hoc topbar; will become duplication
  once we have ≥ 3 pages.
- ⏳ **Toast / notification system** — success / error feedback after
  mutations. Today: inline `<p className="text-bati-terra">`.
- ⏳ **Confirm dialog primitive** — destructive actions (delete chantier,
  revoke member). Headless UI or a small custom component.
- ⏳ **Modal primitive** — reuse for forms (item editor, etc.).
- ⏳ **Loading skeletons** — replace the all-or-nothing `<LoadingScreen />`
  for data-heavy pages once they exist.
- ⏳ **Empty states** — standard pattern (icon + headline + CTA) for
  first-time-user tables.
- ⏳ **Error tracking** — wire Sentry (or similar). `ErrorBoundary` today
  just `console.error`s; replace with `Sentry.captureException`.
- ⏳ **Date utilities** — `date-fns` or `dayjs`. Heavy use coming with the
  pointage grid.
- ⏳ **Form helpers** — `react-hook-form` (or stay raw if forms stay
  small). Decide before the first multi-field form (chantier editor).

### CI / tooling

- ⏳ **Husky + lint-staged** — pre-commit `eslint --fix` + `prettier --write`
  on staged files.
- ⏳ **Dependabot** (`.github/dependabot.yml`) — weekly PRs for npm + GH
  Actions updates. Group patch + minor.
- ⏳ **PR template** — checklist for « tests pass », « schema migration
  added if needed », « permission matrix updated if needed ».
- ⏳ **Bundle-size budget** — fail the build if the main chunk exceeds
  N kb. `vite-plugin-bundle-visualizer` for inspection.
- ⏳ **Lighthouse CI** — performance + a11y budget on every deploy.

---

## 🟢 Nice to have (polish)

### UX

- ⏳ **Keyboard shortcuts** — `?` help, `/` search, navigation hotkeys.
  Once ≥ 5 pages.
- ⏳ **Dark mode** — `user_preferences.theme` already exists; needs UI
  toggle + Tailwind `dark:` variant.
- ⏳ **RTL / Arabic UI** — CSS has `[dir="rtl"]` rules; needs i18n wiring
  + locale switcher.
- ⏳ **Print stylesheets** — for reports / chantier P&L exports.
- ⏳ **Accessibility audit** — `@axe-core/react` in dev, fix violations.
- ⏳ **Focus-visible polish** — `<button>` / `<a>` / `<input>` focus rings
  are inconsistent today.

### Schema

- ⏳ **Audit-log partitioning** — convert `audit_log` to a partitioned
  table once it exceeds ~1 M rows. `pg_partman` + monthly partitions +
  24-month retention. Comment in 0001 already flags this.
- ⏳ **Audit-log diffs** — store only the changed columns in `before` /
  `after` JSON instead of full snapshots. Saves significant space at scale.
- ⏳ **`created_by` everywhere** — currently only `recorded_by` on some
  tables (attendance, purchases). Standardise for traceability.
- ⏳ **`citext` for emails** — case-insensitive comparison on
  `organizations.email`, `workers` future email field.

### Build / perf

- ⏳ **Route-level code-splitting** — `React.lazy` on each page. Today
  everything is in the main chunk because the placeholder app is small.
  Become valuable once page count grows.
- ⏳ **Font subsetting + self-host** — `Manrope` is loaded full from Google
  Fonts. Self-host + subset to Latin + Latin-ext (and Arabic when added).
  Removes the `fonts.googleapis.com` / `fonts.gstatic.com` exceptions from
  the CSP.
- ⏳ **Image optimisation pipeline** — when chantier photos / attachments
  land.

---

## 🔵 Long-term roadmap

Scope decisions deferred during the migration. Each represents a significant
feature.

### Worker self-service (mobile clock-in)

- 🔵 Mobile-first clock-in UI (geofence + QR + manual override).
- 🔵 PWA manifest + service worker for offline-first.
- 🔵 Activates the `worker` role + `workers.user_id` linkage that's already
  in the schema. The RLS policies for « worker sees own attendance / labor
  entries » are already in place.

### File attachments

- 🔵 Supabase Storage buckets for purchase invoices, payment receipts,
  chantier photos. Their own RLS policies (mirror the table RLS).
- 🔵 `attachment_url` columns already exist on `chantier_payments` and
  `consumables_purchases` — currently NULL, no upload UI.

### Real-time collaborative editing

- 🔵 Supabase Realtime (`postgres_changes`) for live grid updates when
  multiple managers edit the same pointage.
- 🔵 Presence indicators (« Mohammed is editing this row »).
- 🔵 Conflict resolution UI.

### Billing & plan enforcement

- 🔵 `organizations.plan` column exists (`text default 'free'`) but is not
  enforced. Add plan limits (chantiers, members, storage), Stripe
  integration, usage metering.

### Internationalisation

- 🔵 `react-i18next` or `lingui`. Arabic + French at minimum. Today's UI is
  French-only; `user_preferences.locale_override` column exists but is
  unread.

### Per-chantier stock alerts

- 🚧 **Watchdog & Forecaster Phase 1** (backend on disk, frontend unwired)
  — the Deno Edge Function and migration are committed but the in-app
  surfaces (bell, panel, HomePage section, `/alertes` page) were removed
  pending product decision. Backend assets that remain on disk and can be
  re-wired later:
  - `supabase/migrations/0007_alerts.sql` (table + dismiss/undismiss RPCs)
  - `supabase/functions/recompute-alerts/` (Deno engine + 8 rule modules + tests)
  - `supabase/tests/rls/alerts.sql` (pgTAP scope tests)
  - `docs/runbooks/recompute-alerts.md` (deploy + cron registration)
  - `docs/superpowers/specs/2026-05-18-watchdog-forecaster-design.md`
  - `docs/superpowers/plans/2026-05-18-watchdog-forecaster.md`
  To re-enable the frontend, restore the deleted files under
  `src/components/alerts/`, `src/pages/alertes/`, and `src/data/alerts.ts`
  from a previous commit (last full wiring was at commit `b1a0406`), then
  re-add the route in `App.tsx`, the sidebar nav item, the topbar bell,
  the HomePage section, and the per-chantier surfaces.

### Analytics / BI

- 🔵 Anonymised usage analytics (Plausible / PostHog) — opt-in only.
- 🔵 Org-level reports: monthly chantier P&L, labour cost trend, consumable
  category breakdown.

### Mobile native apps

- 🔵 React Native shell over the same DAL. Most code reusable.

---

## 📋 Tactical defaults you can flip

Calls I made with sensible defaults — flagged here so you can override.

- ⏳ **`workers.cin`** (Carte d'Identité Nationale) stays. Drop if you want
  zero PII before user opt-in.
- ⏳ **`attendance.absence_reason`** is free-text. Could become an enum
  (`maladie`, `pas_venu`, `congé`, `autre`) once you know the operational
  vocabulary.
- ⏳ **`worker` role + worker-self RLS** stays as forward-compat for mobile
  clock-in. Drop entirely if you want a pure manager-only schema (also drop
  `workers.user_id` and `app.user_worker_id_in_org()`).
- ⏳ **`labor_entries` snapshot vs live recompute** — currently
  `daily_rate` is snapshotted at attendance-write time via
  `app.sync_labor_entry()`. If you'd rather have changes to
  `workers.daily_rate` retroactively apply to past `labor_entries`, drop
  the trigger and have `budget.laborSpent()` compute live from
  `attendance JOIN workers`.
- ⏳ **`organizations.plan`** is `text default 'free'`. Will become a
  proper enum (or its own table) once billing lands.
- ⏳ **GH Pages as deploy target** — pinned in `deploy.yml`. Switch when
  you're ready for HTTP headers + custom domain.

---

## 🗂 Reference

- Architecture: [MIGRATION_PLAN.md](MIGRATION_PLAN.md)
- Security model: [SECURITY.md](SECURITY.md)
- Getting started: [README.md](README.md)

---

*Maintained alongside the migration. When you tackle an item, leave a one-line
commit message referencing it (« FOLLOW_UPS: implement set-new-password page »)
and check the box.*
