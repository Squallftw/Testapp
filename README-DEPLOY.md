# BatiTrack — Deploy to GitHub Pages + Supabase

This guide takes the app from `localhost` to a public URL backed by Supabase, in ~15 minutes.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com> → **New project**.
2. Pick any name, set a strong DB password, choose a region near your users.
3. Wait ~2 min for provisioning.
4. Open the project → **SQL editor** → paste the contents of [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   This creates the `app_state` table, RLS policies, and the signup trigger.
5. (Optional) **Authentication → Providers → Email** — disable "Confirm email" if you want instant sign-in for testing. Re-enable for production.

> **Long-term:** when you outgrow the single-blob model, run [`supabase/schema-normalized.sql`](supabase/schema-normalized.sql) and migrate. The blob model handles thousands of rows per user fine; switch when you need cross-user queries.

---

## 2. Copy your Supabase credentials

In the Supabase Dashboard: **Project Settings → API**.

You need:
- **Project URL** — e.g. `https://abcdefghijklmnop.supabase.co`
- **anon public key** — the long JWT under "Project API keys" (NOT `service_role`)

The `anon` key is safe to ship in your client bundle — RLS protects each user's data. The `service_role` key bypasses RLS and must stay on your server (you won't need it for this setup).

---

## 3. Local development

For local testing without Supabase, just open `index.html` via `node serve.js`. The app falls back to `localStorage` automatically.

To test the Supabase flow locally:
```sh
cp config.example.js config.js
# edit config.js — paste your url + anonKey
node serve.js
```
Open http://localhost:3940. The auth screen appears; create an account; you're in.

> `config.js` is in `.gitignore` — don't commit it. The deploy workflow writes a fresh one from GitHub Secrets.

---

## 4. Deploy to GitHub Pages

### 4a. Push the repo

```sh
git init
git add .
git commit -m "Initial BatiTrack commit"
gh repo create batitrack --public --source=. --push
```

### 4b. Add the secrets

In the GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**.

Add two secrets:
- `SUPABASE_URL` — the Project URL from step 2
- `SUPABASE_ANON_KEY` — the anon public key from step 2

### 4c. Enable GitHub Pages

In the repo: **Settings → Pages → Source = GitHub Actions**.

### 4d. Trigger the deploy

Either push to `main` or run the workflow manually: **Actions → Deploy to GitHub Pages → Run workflow**.

After ~30 seconds you'll see the URL in **Settings → Pages**. Format:
```
https://<your-github-user>.github.io/<repo-name>/
```

But because this app lives in `TheApp/` not the repo root, the workflow uploads `TheApp/` as the Pages artifact, so the URL serves the app directly.

---

## 5. Configure Supabase Auth redirect URL

In **Authentication → URL configuration**:
- **Site URL** = your Pages URL (e.g. `https://yourname.github.io/batitrack/`)
- **Redirect URLs** = same

This matters for password reset & email confirmation links. Without it Supabase will send users to `localhost`.

---

## 6. Verify

1. Open the Pages URL.
2. You should see the **"Se connecter"** card.
3. Click "Créer un compte" → enter email + password (≥ 6 chars).
4. If email confirmation is ON, check your inbox; otherwise you're signed in immediately.
5. The trigger from step 1 created an empty `app_state` row. The app loads → seeds demo data → calls `save()` → your seed lands in Supabase.
6. Check **Supabase → Table editor → app_state**. You should see one row with your `user_id` and a non-empty `data` JSON column.

---

## Troubleshooting

**"Supabase not configured" / app falls back to localStorage**
- `config.js` is missing or values are empty. Check `view-source:` on the deployed URL — `config.js` should contain real values.

**Auth UI never disappears / "Email not confirmed" error**
- Email confirmation is ON in Supabase. Either confirm via email link or disable it during testing.

**RLS error in console: "new row violates row-level security policy"**
- The `handle_new_user` trigger didn't fire. Run `select * from public.app_state where user_id = auth.uid();` in the SQL editor while signed in. If empty, manually insert: `insert into public.app_state (user_id) values (auth.uid());`

**Build job fails: secret not found**
- Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` in **Settings → Secrets → Actions**.

**Tests broke locally**
- Jest tests don't touch storage — they load the pure `*-logic.js` modules in jsdom via `tests/setup.js`. If they fail, the cause is unrelated to this migration. Run: `npm test` (after `npm install`).

---

## Costs

Supabase free tier: 500 MB DB, 1 GB storage, 50K monthly active users. Enough for ~hundreds of paying users on this app's data shape. Upgrade to Pro ($25/mo) when you need more.

GitHub Pages: free for public repos, 100 GB bandwidth/month.
