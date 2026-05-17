# BatiTrack — Sécurité

Ce document décrit le modèle de sécurité de la nouvelle architecture
multi-tenant (Vite + Postgres relationnel + RLS). Pour l'ancienne version
mono-utilisateur (blob JSONB + Babel-in-browser), voir l'historique git.

---

## 1. Authentification

- **Supabase Auth** (Postgres + GoTrue), email/mot de passe avec flux PKCE.
- **Mot de passe** : minimum 8 caractères. Les paramètres précis (longueur,
  complexité, leak detection) sont configurés côté Supabase Dashboard
  → Authentication → Policies.
- **Email** : confirmation activée par défaut.
- **Réinitialisation** : lien magique envoyé par email — n'expose pas
  l'existence du compte.
- **Session** : refresh automatique des tokens via le SDK, stockée en
  `localStorage` sous une clé identifiable.

> À activer côté Supabase pour la prod :
> - **Rate limiting** sur `/auth` (vérifier les seuils).
> - **CAPTCHA** (hCaptcha / Cloudflare Turnstile) sur l'inscription si du
>   trafic public est attendu.
> - **Leaked password protection** (HaveIBeenPwned).
> - **MFA** sur les comptes owner.

---

## 2. Multi-tenant + Row-Level Security

Toutes les tables business ont **RLS activée**. Le périmètre est défini par
les memberships : un utilisateur peut être membre actif de N organisations,
chacune avec un rôle (`owner` / `admin` / `site_manager` / `worker`).

### Modèle de policy

Chaque table a typiquement 2–4 policies OR-combinées, par rôle. Exemple
pour `attendance` :

```sql
-- owner/admin : tout dans leur org
create policy attendance_select_admin on public.attendance
  for select to authenticated
  using (app.user_role_in_org(org_id) in ('owner', 'admin'));

-- site_manager : seulement chantiers assignés
create policy attendance_select_manager on public.attendance
  for select to authenticated
  using (
    app.user_role_in_org(org_id) = 'site_manager'
    and app.user_has_chantier(chantier_id)
  );

-- worker : seulement ses propres lignes
create policy attendance_select_worker on public.attendance
  for select to authenticated
  using (worker_id = app.user_worker_id_in_org(org_id));
```

### Matrice de permissions

| Action                                | owner | admin | site_manager     | worker        |
|---------------------------------------|-------|-------|------------------|---------------|
| Gérer l'organisation                  | ✅    | ❌    | ❌                | ❌            |
| Inviter / révoquer des utilisateurs   | ✅    | ✅    | ❌                | ❌            |
| Créer / modifier un chantier          | ✅    | ✅    | ❌                | ❌            |
| Voir un chantier                      | ✅    | ✅    | assignés seul.   | ❌            |
| Créer / modifier le pointage          | ✅    | ✅    | chantiers assig. | ❌ (MVP)      |
| Voir son pointage + ses labor_entries | n/a   | n/a   | n/a              | ✅            |
| Voir le coût main d'œuvre (avec prix) | ✅    | ✅    | assignés         | ❌            |
| Voir son propre `daily_rate`          | n/a   | n/a   | n/a              | ✅            |
| Gérer ouvriers / fournisseurs / items | ✅    | ✅    | ✅                | ❌            |
| Créer achats / consommation / transferts | ✅ | ✅    | ses chantiers    | ❌            |
| Voir les prix sur consommables        | ✅    | ✅    | ✅                | ❌            |
| Voir / modifier le planning           | ✅    | ✅    | ses chantiers    | tâches assig. |
| Voir l'audit log                      | ✅    | ✅    | ❌                | ❌            |

Détail : `supabase/migrations/0001_initial_schema.sql` § « policies ».

### Helpers de policy

Quatre fonctions `SECURITY DEFINER` dans le schéma `app/` :

- `app.user_orgs()` — org_ids actifs du caller
- `app.user_role_in_org(org_id)` — rôle dans une org donnée
- `app.user_has_chantier(chantier_id)` — autorisation chantier (owner/admin
  automatique, site_manager via `chantier_assignments`)
- `app.user_worker_id_in_org(org_id)` — worker.id lié à l'utilisateur

Toutes en `SECURITY DEFINER` avec `set search_path = public` (parade
contre les attaques de search-path), `revoke execute from public`, et
`grant execute to authenticated`.

### Optimisation

`auth.uid()` est wrappé en `(select auth.uid())` dans toutes les policies
qui le comparent directement. Postgres évalue alors la fonction une seule
fois par requête au lieu d'une fois par ligne — gain matériel sur les
tables volumineuses ([source officielle Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select)).

---

## 3. Audit log

- Table `audit_log` : append-only via RLS (aucune policy `UPDATE`/`DELETE`).
- Peuplée par des triggers Postgres `AFTER INSERT/UPDATE/DELETE` sur chaque
  table business. Trigger en `SECURITY DEFINER` → contourne RLS pour
  insérer, mais ne contourne pas les contraintes d'intégrité.
- Capture : `org_id`, `user_id` (via `auth.uid()` au moment du trigger),
  `action`, `entity_type`, `entity_id`, `before` (jsonb), `after` (jsonb),
  `ip`, `user_agent`, `created_at`.
- Owner/admin peuvent lire (`audit_log_select`). Ni l'utilisateur ni
  l'admin ne peut modifier ou supprimer une entrée.
- À long terme (> 1 M lignes / > 5 Go) : partitionner par mois via
  `pg_partman` ; commentaire en place dans le schéma.

---

## 4. Surface réseau

### Content Security Policy (production)

```
default-src 'self';
script-src 'self';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: blob: https://*.supabase.co;
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
upgrade-insecure-requests;
```

Plus de `'unsafe-eval'`, plus de `'unsafe-inline'` sur les scripts. Vite
build produit du JS pré-compilé, hashé, chargé en `<script type="module">`.

Le CSP est injecté à la build par un plugin Vite (`inject-csp` dans
`vite.config.ts`). En dev, un CSP relaxé est utilisé pour le HMR ; il
n'est jamais déployé.

### Headers complémentaires

- `X-Content-Type-Options: nosniff` (meta) — empêche le MIME sniffing.
- `referrer-policy: strict-origin-when-cross-origin` (meta).
- `noindex,nofollow` (meta).

Sur GitHub Pages, les headers HTTP additionnels ne sont pas possibles.
Quand l'app passe derrière Cloudflare Pages / Vercel / Netlify, ajouter :

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

### Subresource Integrity

Plus pertinent une fois les CDN externes retirés (React/Babel partis avec
la migration Vite). Les seules ressources externes restantes sont les
Google Fonts (CSS rotatif → pas de SRI possible). À reconsidérer si on
self-host les polices.

---

## 5. Validation & contraintes

- **Argent** partout en `numeric(14, 2)`. Pas de flottants — un test SQL en
  CI rejette `real` / `float` / `double precision`.
- **`qty > 0`** sur consumption, transfers, adjustments, purchase_lines.
- **`amount > 0`** sur chantier_payments.
- **`end_date >= start_date`** sur materiel_deployments.
- **Soft-delete-aware unique indexes** sur memberships et chantier_assignments
  — pas de blocage pour réinscrire un membre révoqué.
- **`revoke insert/update/delete on audit_log from authenticated`** —
  seuls les triggers (SECURITY DEFINER) peuvent insérer.
- **`anon`** n'a aucun grant — tout accès nécessite un JWT authentifié.

---

## 6. DAL et garde-fous ESLint

Toutes les requêtes Supabase passent par `src/data/*.ts`. Un composant qui
appelle directement `supabase.from()` est rejeté par ESLint via la règle
`no-restricted-syntax` (exception : fichiers `src/data/**`). Tracé dans
`eslint.config.js`.

Chaque DAL helper :

- Résout `org_id` via `getActiveOrgId()` (jamais accepté en paramètre).
- Filtre `deleted_at IS NULL` implicitement.
- Retourne des objets JS, jamais le wrapper Supabase brut.
- Lance des erreurs typées (`NotFoundError`, `PermissionError`,
  `ValidationError`, `NetworkError`, `ConflictError`).

---

## 7. Secrets & environnement

- `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` : safe à exposer côté
  client. RLS fait le travail. Voir `.env.example`.
- `SUPABASE_SERVICE_ROLE_KEY` : **JAMAIS** dans le repo, jamais en variable
  d'env client. Réservé aux Edge Functions / scripts d'admin.
- GitHub Actions secrets : configurer `VITE_SUPABASE_URL` et
  `VITE_SUPABASE_ANON_KEY` dans Settings → Secrets and variables → Actions.

---

## 8. Données personnelles (RGPD / Loi 09-08)

L'app stocke :

- email utilisateur (compte Supabase)
- noms / téléphones / CIN des ouvriers
- coordonnées clients & fournisseurs

Toutes ces données sont scoping par `org_id`. Aucun partage inter-org.
Aucun partage inter-membre au-delà des règles RLS ci-dessus.

À faire avant production :

- Page **politique de confidentialité** dans l'UI.
- Export JSON « Télécharger mes données » (par utilisateur).
- Suppression de compte (« Supprimer mon compte » → `delete from auth.users` ;
  le cascade RLS gère ses memberships).

---

## 9. Tests RLS (cross-tenant)

`supabase/tests/rls/*.sql` (à venir, pgTAP) : pour chaque table business,
asserte qu'un utilisateur de l'org A ne peut **rien** faire sur l'org B
(SELECT, INSERT, UPDATE, DELETE). Une policy manquante = un échec de test.

`supabase/tests/roles/*.sql` (à venir) : asserte la matrice de permissions
ci-dessus.

`supabase/tests/lint/money_types.sql` (à venir) : scan
`information_schema.columns`, rejette tout type flottant hors whitelist.

---

## 10. Checklist avant production

- [ ] Domaine custom (HTTPS forcé, HSTS preload submis).
- [ ] Headers HTTP via proxy (HSTS, X-Frame-Options, Permissions-Policy).
- [ ] CAPTCHA sur signup + reset.
- [ ] MFA obligatoire pour les rôles owner.
- [ ] Confirmation email activée, provider SMTP fiable.
- [ ] Activer **Supabase Vault** pour tout secret métier.
- [ ] Tests RLS cross-tenant passants en CI.
- [ ] Migration test workflow : appliquer `0001_initial_schema.sql` sur une
      base vierge en CI.
- [ ] Rotation périodique des clés Supabase.
- [ ] Sauvegardes automatiques (Supabase Dashboard → Database → Backups).
- [ ] Plan d'incident documenté (qui notifier, dans quel délai).
