# Public Chantier Pages — Design Spec

**Status:** Draft (2026-05-18) — pending user review before implementation planning
**Author:** Brainstormed via Claude Code
**Scope:** Product re-positioning + new feature surface that makes BatiTrack shareable, viral, and acquisition-driving — at $0 incremental hosting cost.
**Estimated effort:** ~3 weeks (incl. polish), can ship in 2-week MVP increments

---

## 1. Context

BatiTrack today is "construction management software for Moroccan SMEs": multi-tenant, role-based, tracks chantiers/pointage/consommables/matériel/planning/paiements/alerts. Architecturally sound, but at pilot stage (a few free/beta orgs) it lacks the **gut-level pull** that turns evaluation into daily habit and word-of-mouth.

The constraint: nothing requiring paid third-party APIs (no LLM calls per use, no Twilio, no managed OCR). Hosting stays on Supabase free + GitHub Pages.

After auditing what recent breakout SaaS products (Linear, Calendly, Loom, Substack, Stripe, Notion, Lovable) have in common, six patterns surface: (1) status upgrade for the user, (2) one job done absurdly well, (3) a shareable artifact as built-in distribution, (4) zero-friction first action, (5) taste as a moat, (6) removes a recurring small humiliation. BatiTrack's current positioning hits at most 1-2 of these.

The patron's actual emotional reality: his client texts every Friday asking for photos and progress, he sends 8 unstructured WhatsApp images, he feels like *Hassan-with-a-notebook* instead of *BTP Atlas Construction S.A.R.L.* — and a meaningful share of his clients drag payment partly because of opacity ("je sais pas où on en est, je vais pas payer maintenant").

**The reframe:** BatiTrack stops being "site management software" and becomes **"the public face of your chantier"**. Every chantier gets its own beautiful, mobile-first public page at `batitrack.ma/c/<slug>` that the owner shares with his client. Cost tracking / pointage / alerts (everything that exists today) becomes the *engine that makes the public page rich*, not the headline feature. This single move hits all six breakout patterns and creates a viral loop the product currently lacks.

## 2. Goals & non-goals

**Goals**
- Every chantier can be made shareable via a clean public URL (`batitrack.ma/c/<slug>`).
- The public page looks like the *contractor's website* (not the SaaS's), and visibly differentiates him from competitors using Excel/WhatsApp.
- Chefs de chantier can upload photos via a per-chantier PWA link with **no account, no login** — solving the "data never enters the system" problem that today blocks public-page content.
- Owners moderate (approve/reject) all photos before they go public.
- The public page footer creates a viral loop: visitors can click "créez le vôtre" → signup → first chantier shareable in <90 seconds.
- Pricing positioning is hinted (free tier with watermark, paid tier removes it) but not yet enforced.

**Non-goals (deferred or out of scope)**
- Chef WhatsApp bot via Twilio — cost-prohibitive, deferred to a future paid-tier feature.
- Client accounts / authenticated client portals — URL is the auth; client accounts add complexity for ~0% retention benefit.
- Real-time updates / Supabase Realtime on public pages — page is read-on-demand, not a dashboard.
- Voice memos, video uploads — Phase 2 (storage cost + UX complexity).
- Reviews/ratings on public pages — invites coordinated negative reviews from competitors.
- "Download as PDF" of the public page — the URL is the artifact.
- Multi-language Arabic UI on public pages at MVP — French only; ar comes in v1.1.
- LLM-powered features (caption suggestions, photo categorisation) — cost-prohibitive under current constraint.
- Per-client distinct tokens (`client_view` token kind) — enum value declared for forward compatibility but unused at MVP; all clients share the chantier slug.

## 3. Architecture overview

Each chantier gets **three distinct URLs**, each tuned for one audience, all backed by the same DB row:

```
chantier "Résidence Anfa" (id: a1b2c3...)
│
├── /chantiers/a1b2c3                   ← OWNER (admin view)
│   Full app. Login required. Existing surface today.
│
├── /c/Kj7nQ/upload?t=<token>           ← CHEF (capture view)
│   PWA-installable, camera-first, no login.
│   Token-bearing link. Owner moderates uploaded photos.
│
└── /c/Kj7nQ                            ← CLIENT (public view)
    Beautiful read-only page. No login. Anyone with the link.
    Photos, milestones, % done, optional payments.
    "Suivi avec BatiTrack" footer → signup CTA (the viral loop).
```

Three things ship together:

1. **Public read RPC** (`get_public_chantier(slug)`) — the only anon-callable read surface. Returns a flat JSON document with all the page needs, with signed photo URLs (10-min TTL). Strips everything the public must never see (budgets, contract values, worker rates, internal notes).
2. **Chef photo upload RPC** (`submit_chef_photo(slug, token, payload)`) — validates token hash, rate-limits, inserts a `chantier_photos` row with `status='pending'`, returns a signed Storage upload URL.
3. **UI surfaces**:
   - Public page React route at `/c/:slug` (a single dedicated, anonymous-allowed route in the same Vite app).
   - Chef PWA at `/c/:slug/upload` (separate route with `manifest.json` + service worker).
   - Owner additions inside the existing admin app: a "Rendre public" toggle on chantier settings, a share modal with copy/WhatsApp/QR, a "Photos · N en attente" tab on `ChantierDetailPage`, a chef-token management section.

Existing tables and policies are **not changed**. Only additions.

## 4. The three URLs, in detail

### 4.1 Owner view (existing)

No change to today's flows. Two new UI additions inside the existing admin app:

- **Settings tab on `ChantierDetailPage`** with: "Rendre ce chantier public" toggle, slug display + regenerate button, "Personnaliser la page publique" (toggles for `show_payments` / `show_milestones` / `show_photos`, optional `custom_intro` text).
- **"Lien chef" management section** (same tab): "Créer un lien chef" button, list of active tokens with label/last_used_at/upload counts, revoke button per token.
- **"Photos · N en attente" tab** on `ChantierDetailPage`: grid of pending photos, bulk-approve button, individual approve/reject/edit-caption per photo.
- **Share modal** triggered the first time owner toggles a chantier public: shows the URL, copy button, "Partager sur WhatsApp" button with pre-filled French message, "M'envoyer une copie chaque lundi" checkbox (defer the digest implementation to a phase 1.5 — checkbox only saved as a user preference for now).

### 4.2 Client public page (`/c/:slug`)

Mobile-first layout. ~95% of opens are expected from WhatsApp taps on phones.

**Layout (top to bottom):**
1. **Hero**: 16:9 cover photo (full-width) → chantier name in serif typography → city + type as subtitle.
2. **Two stat tiles**: "% avancé" with progress bar (computed from tasks), "Livraison prévue" (chantiers.date_end_prev).
3. **Photos block**: masonry grid of approved photos, lazy-loaded with blurhash placeholders, tap-to-zoom full-screen carousel. "Voir tout" link if >12 photos.
4. **Étapes (milestones)**: list of top-level tasks (`parent_task_id is null`) with status indicators (✓ done / ◐ in progress / ○ pending) and dates.
5. **Paiements** (opt-in, hidden by default): total contract, encaissé, échéance suivante with due date. Owner toggles `show_payments=true` per chantier when ready.
6. **Contact CTA**: large button with WhatsApp deep-link (`wa.me/<org.phone>?text=...prefilled...`).
7. **Footer**: "Suivi avec BatiTrack — Entrepreneur ? Créez vos chantiers en 2 min →" linking to `/signup?utm=public&ref=<slug>`.

**Design principles:**
- The page feels like the **contractor's website**, not the SaaS's. Org name and logo prominent. BatiTrack whispered in the footer.
- **Editorial typography**: pair existing Manrope with a serif for headlines. Generous whitespace. Photos breathe.
- **Mobile-first, truly**: 44px tap targets, initial render <200 KB, loads in <3s on 3G.
- **Empty states are aspirational, not pathetic**: default cover illustration per chantier type, auto-created starter milestones based on chantier type (`villa` → "Fondations / Gros œuvre / Second œuvre / Finitions / Livraison"), illustrated empty-photos card.

**The footer is the viral mechanism.** Tasteful one-liner, link tracked via `signups.referrer_chantier_slug` so we know which client→entrepreneur conversion paths work.

### 4.3 Chef PWA upload (`/c/:slug/upload?t=<token>`)

Friction budget: **3 taps from home screen to "photo uploaded".**

**Flow:**
1. Owner generates a chef token, copies the link, sends to chef via WhatsApp (one-time setup).
2. Chef opens the link. First-time landing page: a friendly "Ajoutez ce raccourci à votre écran d'accueil" instruction with an animated GIF showing the iOS/Android "Add to Home Screen" gesture.
3. Once installed as PWA, tapping the icon opens directly to a camera-first view (single "Prendre photo" button + "Depuis galerie" alternative).
4. After capture: preview + optional caption + uploader initials (sticky from last upload) + "Envoyer" button.
5. After upload: thumbnail strip of last 5 uploads + "Ajouter une autre photo" — accumulation feedback.

**Technical shape:**
- PWA via small `manifest.json` + service worker scoped to `/c/:slug/upload`.
- Camera capture via `<input type="file" accept="image/*" capture="environment">` — no dependency.
- Client-side resize to max 1920px longest edge, JPEG quality 80 (4MB iPhone photo → ~300KB). Done with `<canvas>` in the browser.
- **Offline-tolerant**: service worker queues un-uploaded photos in IndexedDB and retries when connectivity returns. Critical on Moroccan chantiers.
- Upload happens via signed Supabase Storage URL returned by `submit_chef_photo` RPC.

**The chef view never shows:** costs, budget, other chantiers, worker list, payments, login button, "create account", or any upsell. It is *only* a camera and a thumbnail strip.

### 4.4 Owner moderation queue

In the existing `ChantierDetailPage`, a new "Photos" tab shows:
- Pending grid (with "N en attente" badge in tab header).
- Each thumbnail: approve / reject / edit caption / edit date.
- **Bulk approve** is the default action — most photos are fine; moderation catches accidents/wrong-chantier uploads.
- Approved photos appear on the public page within ~2 seconds (React Query invalidation on the public page side via stale-time tuning).

When a chef uploads their first photo, owner sees a single in-app toast: "Hassan a envoyé sa première photo 🎉" — reinforces the loop is working.

## 5. Security & anonymous access model

This is the most consequential change. Today every table is `to authenticated`. We need controlled `anon` access to a tiny surface.

**Pattern: SECURITY DEFINER RPCs, never raw table grants.**

The `anon` role gets **zero new table grants**. Two RPCs are the only widening of the attack surface, both hand-audited, both validate everything they touch.

### 5.1 The slug (client URL)

- 8-char base62 (`Kj7nQa2P`) → 218 trillion combinations, non-enumerable.
- Stored in `chantiers.slug` with a partial unique index (`where slug is not null`) — allows non-public chantiers to have null slugs.
- Generated by a `regenerate_chantier_slug(chantier_id)` RPC with collision retry (≤5 attempts).
- **Not a secret** — appears in WhatsApp messages, screenshots, etc. Security model is "obscure URL, no enumeration" — same as Calendly, Notion public pages, Dropbox share links. Acceptable for data shown (client already has the right to see it).
- Owner can rotate the slug to burn an old link; old URL 410s.

### 5.2 The chef token

- 24-char random opaque token (`base64url(20 bytes)`).
- Stored as **bcrypt hash** in `chantier_share_tokens.token_hash`. Plaintext shown to owner only at creation (PAT pattern).
- RPC validates by hashing incoming token and comparing — constant-time compare.
- Rate-limited at the token level: 50 uploads/day, 500/month. Counters on the token row, reset windows via the upload RPC.
- Owner can revoke any token in one click; revoked tokens fail validation immediately.

### 5.3 What the public RPC never returns

Encoded in the `select` clause of `get_public_chantier`, **not** "hopefully filtered in the frontend":
- Money: `budget_*`, `contract_value`, supplier prices, worker rates.
- People: full worker names (only first name + initial), CIN, phones.
- Internal notes, internal alerts.
- Anything from other chantiers or the org's other clients.

### 5.4 What the public RPC may return (per opt-in toggles)

- Chantier: name, type, address (city only — no street number), cover photo, approved photo gallery, start date, projected end date, status, % done.
- Milestones with done/pending state.
- **Optionally**: payment schedule totals (off by default; owner enables when desired).
- Org: name, ICE, phone (for WhatsApp link), logo.

### 5.5 Anti-abuse

- **Rate limit per chef token**: 50/day, 500/month (atomic increment in RPC).
- **Photos pending by default**: even if a token leaks, nothing reaches the public page without owner approval. Worst case = noise in the moderation queue.
- **Slug rotation** in one click invalidates any link circulating.
- **Storage bucket**: insert/select via service-role only (RPCs). Direct anonymous client writes blocked at bucket level (defense in depth).
- **Signed URLs only** for photos (10-min TTL) — revoked photos vanish from cached pages quickly.
- No CAPTCHA, no email verification, no SMS — each would erase chef adoption.

## 6. Data model

### 6.1 Columns added to existing tables

```sql
alter table public.chantiers
  add column slug text,
  add column cover_photo_id uuid;
create unique index chantiers_slug_uq on public.chantiers (slug) where slug is not null;

alter table public.organizations
  add column logo_path text;

alter table public.chantier_payments
  add column due_date date;
```

### 6.2 New table: `chantier_public_settings`

One row per chantier (1:1, FK PK). Separate from `chantiers` to keep the hot row narrow and to keep public-page reads clean.

```sql
create table public.chantier_public_settings (
  chantier_id      uuid primary key references public.chantiers(id) on delete cascade,
  org_id           uuid not null references public.organizations(id),
  is_public        boolean not null default false,
  show_payments    boolean not null default false,
  show_milestones  boolean not null default true,
  show_photos      boolean not null default true,
  custom_intro     text,
  updated_at       timestamptz not null default now()
);
```

### 6.3 New table: `chantier_share_tokens`

```sql
create type public.share_token_kind as enum ('chef_upload', 'client_view');
-- 'client_view' declared for forward compatibility; unused at MVP.

create table public.chantier_share_tokens (
  id                    uuid primary key default gen_random_uuid(),
  chantier_id           uuid not null references public.chantiers(id) on delete cascade,
  org_id                uuid not null references public.organizations(id),
  kind                  public.share_token_kind not null,
  token_hash            text not null,
  label                 text,
  created_at            timestamptz not null default now(),
  created_by            uuid references auth.users(id),
  revoked_at            timestamptz,
  last_used_at          timestamptz,
  uploads_today         integer not null default 0,
  uploads_month         integer not null default 0,
  uploads_day_window    date not null default current_date,
  uploads_month_window  date not null default date_trunc('month', current_date)::date
);

create index on public.chantier_share_tokens (chantier_id, kind) where revoked_at is null;
```

### 6.4 New table: `chantier_photos`

```sql
create type public.photo_status as enum ('pending', 'approved', 'rejected');

create table public.chantier_photos (
  id                uuid primary key default gen_random_uuid(),
  chantier_id       uuid not null references public.chantiers(id) on delete cascade,
  org_id            uuid not null references public.organizations(id),
  storage_path      text not null,
  thumbnail_path    text,
  caption           text,
  taken_at          timestamptz,
  uploader_kind     text not null check (uploader_kind in ('owner','chef_token','admin')),
  uploader_token_id uuid references public.chantier_share_tokens(id) on delete set null,
  uploader_user_id  uuid references auth.users(id) on delete set null,
  uploader_initials text,
  status            public.photo_status not null default 'pending',
  reviewed_by       uuid references auth.users(id),
  reviewed_at       timestamptz,
  rejection_reason  text,
  width             integer,
  height            integer,
  bytes             integer,
  blurhash          text,
  created_at        timestamptz not null default now()
);

create index on public.chantier_photos (chantier_id, status, taken_at desc) where status = 'approved';
create index on public.chantier_photos (org_id, status, created_at desc) where status = 'pending';
```

### 6.5 Storage bucket

```
chantier-photos/                       — bucket, RLS enforced via RPCs
├── <chantier_id>/
│   ├── <photo_id>.jpg                  — original (resized client-side to 1920px)
│   └── thumbs/
│       └── <photo_id>.jpg              — 400px, generated by edge function
```

- No anonymous bucket access. Approved-photo URLs are signed (10-min TTL) by the public RPC.
- Insert/select via service-role only (RPCs).
- 1 GB Supabase free tier ≈ 3,000 resized photos ≈ ~30 pilot chantiers × 100 photos each. When the ceiling is hit, that's the natural pricing conversation — the storage limit IS the freemium boundary.

### 6.6 RLS

All three new tables have RLS enabled. Policies are purely additive:

- `chantier_public_settings`: select for any org member; write for owner/admin only.
- `chantier_share_tokens`: all operations for owner/admin only. Token hashes never leave the DB.
- `chantier_photos`: select for owner/admin (everything in org) and site_manager (their chantiers); write for owner/admin only (approval/reject/edit). Workers see nothing.
- **No `anon` policies on any table.** Anonymous access is RPC-only.

## 7. The two anonymous RPCs

### 7.1 `get_public_chantier(p_slug text) returns jsonb`

- Looks up chantier by slug.
- Validates: chantier exists, `deleted_at is null`, `chantier_public_settings.is_public = true`.
- Returns a flat JSON document containing exactly what §5.4 allows.
- Signs photo URLs with 10-min TTL.
- `SECURITY DEFINER`, `set search_path = public, app, pg_temp`.
- `grant execute to anon, authenticated`.

### 7.2 `submit_chef_photo(p_slug, p_token, p_caption, p_initials, p_taken_at, p_bytes, p_width, p_height) returns jsonb`

- Looks up chantier by slug (must be public, not deleted).
- Looks up token by hash on the chantier (must be unrevoked, `kind='chef_upload'`).
- Resets daily/monthly counters if window expired; raises if rate-limited.
- Inserts `chantier_photos` row with `status='pending'`, `uploader_kind='chef_token'`, `uploader_token_id=...`.
- Generates a signed Storage upload URL (5-min TTL) for the client to push the binary.
- Returns `{ photo_id, upload_url }`.
- `SECURITY DEFINER`, `set search_path = public, app, pg_temp`.
- `grant execute to anon, authenticated`.

## 8. Edge function

One new function: `supabase/functions/process-photo/index.ts`.

- Triggered by Supabase Storage webhook on insert into `chantier-photos/<id>/<original>`.
- Generates 400px thumbnail (using `imagescript`, Deno-native).
- Computes blurhash (using `blurhash` library, Deno-compatible).
- Writes thumbnail to storage + blurhash to the photo row.
- Service-role auth, no JWT.
- Well within Supabase free-tier limits (500k invocations/month) at pilot scale.

## 9. DAL additions (`src/data/`)

Following the existing one-file-per-domain pattern:

- `public-share.ts` — `togglePublic`, `regenerateSlug`, `getPublicSettings`, `updatePublicSettings`.
- `share-tokens.ts` — `createChefToken` (returns plaintext token ONCE), `listChefTokens`, `revokeChefToken`.
- `chantier-photos.ts` — `listPendingPhotos`, `listApprovedPhotos`, `approvePhoto`, `rejectPhoto`, `updatePhotoCaption`, `bulkApprove`.
- `public-api.ts` — `fetchPublicChantier(slug)`, `submitChefPhoto(slug, token, payload)`. This is the **only** DAL file allowed to be called from anonymous pages; an explicit ESLint exception comment marks it as such.

## 10. Migrations

Three sequential migrations rather than one (keeps with existing one-feature-per-migration pattern):

- `0008_public_pages.sql` — chantiers columns (slug, cover_photo_id), organizations.logo_path, `chantier_public_settings`, `get_public_chantier` RPC.
- `0009_chef_upload.sql` — `chantier_share_tokens`, `chantier_photos`, `submit_chef_photo` RPC, storage bucket policies, `process-photo` edge function deploy.
- `0010_payment_due_dates.sql` — `chantier_payments.due_date`.

## 11. Routing changes

Two new public routes added to `App.tsx`, outside both `PublicRoute` and `ProtectedRoute` wrappers (they must be reachable without an active Supabase session):

```tsx
<Route path="/c/:slug" element={<PublicChantierPage />} />
<Route path="/c/:slug/upload" element={<ChefUploadPage />} />
```

These routes initialise the Supabase client in **anon mode** (no auth state) and call `public-api.ts` helpers. They share no providers with the main app (no `OrgProvider`, no `ChantierProvider`) — they're truly standalone pages.

The PWA manifest is served from `/public/chantier-upload-manifest.json` and registered conditionally only on the `/c/:slug/upload` route via a small `<link rel="manifest">` injection.

## 12. Acquisition surface (landing + signup)

The product mechanic only works if the landing page matches. Changes:

### 12.1 Landing hero

Replace current positioning ("Suivi des coûts main d'œuvre") with:

> **Chaque chantier a sa page.**
> Vos clients voient l'avancement en direct.

Hero is a screenshot of the actual public page (not a stock illustration). "Voir un exemple en direct →" links to a polished demo chantier (seeded in your own org, made public, kept fresh). "Créer mon premier chantier · Gratuit · Pas de carte requise" CTA.

### 12.2 Signup wizard

Replace today's signup → app shell flow with a 3-step wizard:
1. Email + password (with magic-link option).
2. Company name (creates the org).
3. First chantier name + city + optional cover photo (creates the chantier, auto-makes-public, generates slug).

Result screen shows the new public URL with copy/WhatsApp share buttons, and a "Voir le tableau de bord BatiTrack →" link to enter the app. **The signup process IS the first product success.**

### 12.3 Pricing positioning (informational, not yet enforced)

Displayed on landing/pricing page, not enforced in code at pilot:
- **Free**: 1 active chantier, 1 GB storage, "Suivi avec BatiTrack" watermark on public pages.
- **Solo (~150 dh/mo)**: unlimited chantiers, 10 GB storage, custom domain support, white-label footer ("Suivi avec <Org Name>"), Devis generator, Facturation.
- **Team (~400 dh/mo)**: everything + chef PWA accounts + cash-flow forecast + CNSS export + multi-user roles.

White-label watermark removal is the killer upgrade trigger (Calendly pattern).

## 13. Cold-start moves ($0 distribution)

Asymmetric, free actions to seed the loop:

1. **Public examples on landing page**: seed 3-4 polished demo chantiers from your own org (Villa, Immeuble, Réhab, Clôture). Each one is a live URL.
2. **Submit to Maroc directories**: `2m.ma`, `medias24.com`, `Le Matin`, Maroc Numeric Cluster. Free if self-written; "shareable client portal" angle is novel enough for coverage.
3. **Cold-start the loop manually**: personally help each pilot user set up one polished chantier (cover photo + 5 starter photos + milestones) and ask them to share with one client this week. 5 outbound impressions week 1 — the seed for the viral loop.

## 14. Risks & open questions

| Risk | Mitigation |
| --- | --- |
| Chefs don't install the PWA, photos never arrive, public pages stay empty. | Manual onboarding for first 5 pilots; pre-recorded 3-min darija video tutorial; owner can upload photos himself as fallback. Measure chef-upload rate in pilot; if <50% by week 2, redesign upload flow before scaling. |
| Owners panic at the idea of public links, never toggle them on. | Private-by-default. First chantier auto-public in signup wizard so they experience it. Watermark/footer is tasteful, not pushy. |
| Maroc clients distrust web links / don't engage. | Mitigated by mobile-first design + WhatsApp deep-link to contact. Measure CTR on shared links; if <30%, reconsider client-side education. |
| Storage costs explode past 1 GB free tier sooner than expected. | Monitor `chantier_photos.bytes` aggregate per org. Add a soft warning at 800 MB. The hard limit IS the freemium boundary, so this is also a feature. |
| Slug enumeration / scraping. | 8-char base62 = non-enumerable. Rate-limit `get_public_chantier` per IP at the edge (Supabase Edge Function in front) if abuse appears. Not built at MVP. |
| Viral footer pulls signups that don't convert (only ever look at one chantier). | Track `signups.referrer_chantier_slug` from day 1. After 30 days, evaluate conversion rate; iterate on signup wizard or footer copy. |

**Open product question (not blocking implementation):**
Should the pilot phase include the `show_payments` opt-in or defer it to v1.1? Showing client what they owe is psychologically loaded — owners may want to A/B test framing first. Current spec: include in MVP (just the toggle), off by default. Owners who don't use it lose nothing.

## 15. What's NOT being built (deferred / out of scope)

- Chef WhatsApp bot via Twilio.
- Client accounts / authenticated client portals.
- Real-time updates on public pages.
- Voice memos, video uploads.
- Reviews/ratings.
- Download-as-PDF.
- Arabic UI on public pages (v1.1).
- LLM-powered features (caption suggestions, smart photo grouping, etc.).
- Per-client distinct tokens.
- Weekly digest email auto-share (checkbox saves preference; sending implementation deferred).
- Org "storefront" portfolio page (`/o/<org-slug>`) — phase 2 candidate.
- Custom domain support — phase 2 (deserves its own design once paid tier is live).

---

**Total scope:** 3 new tables, 4 new columns, 2 RPCs, 1 storage bucket, 1 edge function, 3 migrations, ~5 new DAL files, 2 new public routes, 1 PWA manifest, 1 new owner moderation tab + 1 new chantier-settings tab, redesigned landing hero + 3-step signup wizard.

**Build sequence suggestion** (decided in implementation plan, not here):
1. Week 1 — Public page MVP: data model + RPC + read-only React page + share modal + landing hero. Owner uploads photos himself; chef flow deferred. Public loop measurable in pilot week 1.
2. Week 2 — Chef PWA + moderation queue + signup wizard. Loop fully closed.
3. Week 3 — Polish, empty-state defaults, cover illustrations, blurhash pipeline, pricing positioning copy, demo chantier seeding, manual cold-start of 5 pilots.
