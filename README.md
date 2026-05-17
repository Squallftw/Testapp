# BatiTrack

Suivi des coûts main d'œuvre · construction Maroc.
Vite + React 18 + TypeScript + Supabase (Postgres, Auth, RLS) — déployable sur GitHub Pages ou tout hébergeur statique.

> **Statut** : migration en cours d'une version mono-utilisateur (blob JSONB)
> vers une architecture multi-tenant relationnelle. Voir [MIGRATION_PLAN.md](MIGRATION_PLAN.md)
> pour la feuille de route et l'état d'avancement.

---

## Démarrage local

### Prérequis

- Node 20+
- npm 10+
- Compte Supabase (gratuit suffit pour le dev)
- Optionnel : [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
  pour générer les types TypeScript depuis le schéma.

### Installation

```bash
npm install
cp .env.example .env.local
# Renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY (Settings → API)
npm run dev
```

L'app démarre sur `http://localhost:5173`.

### Provisionner la base

```bash
# Une seule fois, sur un projet vierge :
# (depuis le dashboard Supabase → SQL Editor → coller et exécuter)
supabase/migrations/0001_initial_schema.sql

# Si vous migrez depuis l'ancien blob JSONB, lancez d'abord :
supabase/migrations/wipe.sql
```

Lisez l'en-tête de `wipe.sql` — il efface tous les utilisateurs `auth.users`
et la table `user_state` héritée.

### Générer les types TypeScript

```bash
npm run gen:types
```

Cela appelle `supabase gen types typescript --local` et écrase
`src/data/database.types.ts`. À refaire après chaque migration de schéma.

---

## Scripts npm

| Script              | Description                                                  |
|---------------------|--------------------------------------------------------------|
| `npm run dev`       | Démarre Vite + HMR sur :5173                                 |
| `npm run build`     | `tsc -b` puis `vite build` → `dist/`                         |
| `npm run preview`   | Sert `dist/` pour vérifier le build de prod                  |
| `npm run lint`      | ESLint sur tout `src/`                                       |
| `npm run format`    | Prettier en mode write                                       |
| `npm run typecheck` | `tsc -b --noEmit`                                            |
| `npm test`          | Vitest en mode CI (un seul run)                              |
| `npm run test:watch`| Vitest en mode watch                                         |
| `npm run gen:types` | Regénère les types Supabase                                  |

---

## Architecture

```
index.html                      ← entrée Vite, CSP injectée à la build
src/
  main.tsx                      ← bootstrap React + ErrorBoundary
  App.tsx                       ← composant racine
  index.css                     ← Tailwind + variables CSS BatiTrack
  vite-env.d.ts                 ← types Vite (import.meta.env)
  lib/
    error-boundary.tsx
  data/                         ← couche d'accès aux données (DAL)
    client.ts                   ← singleton Supabase + org actif
    errors.ts                   ← DALError + sous-classes + mappers
    database.types.ts           ← généré par supabase gen types
    index.ts                    ← barrel
    {orgs,chantiers,workers,...}.ts
  pages/                        ← (à venir : pages liées au router)
  components/                   ← (à venir : composants partagés)
supabase/
  migrations/
    0001_initial_schema.sql     ← schéma relationnel complet
    wipe.sql                    ← destructif — efface l'ancien blob
  tests/                        ← tests RLS, rôles, lint SQL (à venir)
.github/workflows/
  deploy.yml                    ← install → lint → test → build → GH Pages
```

### Flux d'authentification (cible)

1. `main.tsx` initialise le client Supabase via `initSupabase()` à partir de
   `import.meta.env.VITE_SUPABASE_*`.
2. `OrgContext` interroge `orgs.listMyOrgs()` ; si l'utilisateur a plusieurs
   organisations, un sélecteur s'affiche dans la topbar.
3. L'org actif est mémorisé en `user_preferences`. Les appels DAL le résolvent
   automatiquement via `getActiveOrgId()`.
4. Toutes les requêtes passent par `src/data/*` ; un composant qui appelle
   directement `supabase.from()` est rejeté par ESLint.

### Modèle relationnel

24 tables business + audit + préférences. Voir
[MIGRATION_PLAN.md § Entities](MIGRATION_PLAN.md#entities) pour la liste,
et `supabase/migrations/0001_initial_schema.sql` pour la DDL complète.

Toutes les sommes en `numeric(14, 2)`. Soft-delete via `deleted_at`. RLS
activée partout. Audit log peuplé par triggers Postgres — jamais par le client.

### Permissions

| Rôle           | Périmètre |
|----------------|-----------|
| `owner`        | Tout dans son org. Gestion de l'org elle-même + invitations. |
| `admin`        | Tout sauf modifier/supprimer l'org. |
| `site_manager` | Lecture org-wide sur ouvriers / matériel / consommables ; écriture limitée à ses chantiers assignés. |
| `worker`       | Lecture seule de ses propres pointages et tâches assignées. Pas d'accès aux prix. |

Détail dans [MIGRATION_PLAN.md § Permission matrix](MIGRATION_PLAN.md#permission-matrix).

---

## Déploiement

### GitHub Pages (par défaut)

`.github/workflows/deploy.yml` se déclenche sur push vers `main` :

1. `npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run build` (avec `VITE_SUPABASE_*` injectés depuis les secrets du repo)
5. `dist/` publié sur GitHub Pages.

Si le repo s'appelle `Batitrack` et que l'URL cible est
`https://<user>.github.io/Batitrack/`, changer `base: '/'` en
`base: '/Batitrack/'` dans `vite.config.ts`.

### Headers HTTP en production

GitHub Pages ne définit pas les headers HTTP. Le CSP est donc injecté via
`<meta http-equiv>` (voir `vite.config.ts`). Pour une mise en production
sérieuse, déployez derrière Cloudflare Pages / Vercel / Netlify et ajoutez :

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

---

## Tests

- **Unitaires** (Vitest) : `npm test`
- **RLS** (pgTAP) : à venir — `supabase test db` contre une base de test
  conteneurisée. Voir `supabase/tests/rls/`.
- **E2E** (Playwright) : sont dans le repo voisin
  `Batitrack-tests/e2e-playwright/`. Seront mis à jour à mesure que les
  feature ports atterrissent.

---

## Sécurité

Voir [SECURITY.md](SECURITY.md). En résumé :

- **RLS** sur 100 % des tables ; politiques par rôle (owner / admin /
  site_manager / worker).
- **CSP strict** en prod (pas de `'unsafe-eval'`, pas d'inline scripts).
- **Audit log** append-only, peuplé par triggers Postgres en mode `SECURITY
  DEFINER`.
- **Money** en `numeric(14, 2)` partout ; lint SQL en CI refuse les types
  flottants.
- **Soft-delete-aware unique indexes** (un membre révoqué peut être réinvité).
- **`auth.uid()` wrappé en `(select ...)`** dans les policies pour
  optimisation du planificateur Postgres.
- **`SECURITY DEFINER`** sur les helpers de policy, avec `revoke from public`
  explicite et `set search_path` pour bloquer les attaques de search-path.

---

## Licence

Privée — usage interne BTP Atlas Construction et clients en évaluation.
