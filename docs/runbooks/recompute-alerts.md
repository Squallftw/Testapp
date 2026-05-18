# Runbook — Deploying `recompute-alerts` Edge Function

The Watchdog alerts engine runs on Supabase Edge Functions, invoked by
`pg_cron` every 15 minutes. This runbook covers first-time deployment, the
cron schedule registration, and the smoke-test query.

## Prerequisites

- Supabase project provisioned, `0001_initial_schema.sql` through
  `0006_add_budget_equipment.sql` already applied.
- `supabase` CLI installed locally and logged in (`supabase login`).
- `supabase link --project-ref <ref>` already done for this project.

## 1. Apply migration `0007_alerts.sql`

In the Supabase SQL Editor, paste the contents of
`supabase/migrations/0007_alerts.sql` and run. Confirm:

```sql
select column_name from information_schema.columns
 where table_schema='public' and table_name='alerts'
 order by ordinal_position;
```

returns the 17 alerts columns (`id, org_id, …, updated_at`).

Also verify the two RPCs exist:

```sql
select proname from pg_proc
 where proname in ('dismiss_alert','undismiss_alert');
```

Should return both names.

## 2. Deploy the Edge Function

From the project root:

```bash
supabase functions deploy recompute-alerts --no-verify-jwt
```

The `--no-verify-jwt` is required: `pg_cron` invokes the function with a
service-role bearer, not a user JWT. The function itself reads
`SUPABASE_SERVICE_ROLE_KEY` from env — Supabase provides this automatically
to deployed functions, no manual `secrets set` is needed.

Expected output: `Deployed Function: recompute-alerts`.

## 3. Register the cron schedule (one-time SQL)

In the Supabase SQL Editor:

```sql
-- Enable extensions if not yet enabled
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Store the function URL as a session-level setting (replace <ref>)
alter database postgres set app.recompute_alerts_url =
  'https://<ref>.supabase.co/functions/v1/recompute-alerts';

-- Store the service role key. Get it from
--   Dashboard → Settings → API → service_role secret
-- (this is the ONLY place that key should land in SQL — keep it server-side).
alter database postgres set app.settings.service_role_key = '<service-role-key>';

-- Schedule: every 15 minutes
select cron.schedule(
  'recompute-alerts',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := current_setting('app.recompute_alerts_url'),
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key'),
        'Content-Type',  'application/json'
      ),
      body := '{}'::jsonb
    );
  $$
);
```

Expected: a row with a `jobid` integer is returned. Re-running `cron.schedule`
with the same name **replaces** the existing schedule, so this block is
idempotent.

## 4. Smoke test

Manually invoke the function once to populate alerts:

```bash
supabase functions invoke recompute-alerts
```

Expected JSON response:

```json
{ "orgs": N, "inserted": M, "refreshed": 0, "resolved": K, "skipped_cooldown": 0, "errors": 0 }
```

If `errors > 0`, check Supabase Dashboard → Edge Functions → `recompute-alerts`
→ Logs for the stack traces.

## 5. Verify alerts populated

In the SQL Editor:

```sql
select kind, severity, title, chantier_id, fingerprint
  from public.alerts
 where resolved_at is null and dismissed_at is null
 order by severity desc, created_at desc;
```

With the demo seed applied, expect at least one
`budget_category_exceeded:<atelier_id>:equipment` row with severity
`critical` (the Atelier demo chantier is configured with
`budget_equipment: 5000` and accumulates ~13 280 MAD of equipment spend).

## 6. Confirm the cron job is firing

```sql
select * from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'recompute-alerts')
 order by start_time desc limit 5;
```

The most recent run should be within the last 15 minutes and `status='succeeded'`.

## Rollback

To pause the alerting engine without deleting any alerts:

```sql
select cron.unschedule('recompute-alerts');
```

To re-enable, re-run the `cron.schedule(...)` block from step 3.

To purge all current alerts (e.g. during testing):

```sql
truncate public.alerts;
```

Audit log entries are retained.

## Notes

- Each rule emits an `AlertCandidate` with a stable `fingerprint`.
  Re-running the engine UPSERTs into the active slot (partial unique index
  on `(org_id, fingerprint) WHERE resolved_at is null and dismissed_at is null`).
- A 7-day cooldown after dismissal prevents an alert from re-firing.
- Alerts whose `kind` matches a rule but whose `fingerprint` is not in this
  pass's candidates are auto-resolved.
