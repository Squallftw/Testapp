import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { OrgProvider } from '@/contexts/OrgContext';
import { ChantierProvider } from '@/contexts/ChantierContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PublicRoute } from '@/components/PublicRoute';
import { AppShell } from '@/components/AppShell';
import { RequireRole } from '@/components/RequireRole';
import { Toaster } from '@/components/ui/Toast';

// Every page component is route-split via React.lazy so a visitor only
// downloads the chunk for the URL they hit. Critical for the public viral
// surface at /c/:slug (spec §4.2): WhatsApp taps come from real Moroccan
// mobile networks where the prior single-bundle ~374 kB gzip would have
// killed the conversion. The shell (Auth/Org/Chantier providers, layout
// guards, the Toaster) stays static — it's the < 50 kB skeleton that
// every route shares.
const LoginPage          = lazy(() => import('@/pages/auth/LoginPage'));
const SignupPage         = lazy(() => import('@/pages/auth/SignupPage'));
const ResetPasswordPage  = lazy(() => import('@/pages/auth/ResetPasswordPage'));
const UpdatePasswordPage = lazy(() => import('@/pages/auth/UpdatePasswordPage'));
const AuthCallbackPage   = lazy(() => import('@/pages/auth/AuthCallbackPage'));
const CreateOrgPage      = lazy(() => import('@/pages/org/CreateOrgPage'));
const HomePage           = lazy(() => import('@/pages/HomePage'));
const ChantiersListPage  = lazy(() => import('@/pages/chantiers/ChantiersListPage'));
const ChantierDetailPage = lazy(() => import('@/pages/chantiers/ChantierDetailPage'));
const ChantierEditPage   = lazy(() => import('@/pages/chantiers/ChantierEditPage'));
const WorkersListPage    = lazy(() => import('@/pages/workers/WorkersListPage'));
const WorkerEditPage     = lazy(() => import('@/pages/workers/WorkerEditPage'));
const OrgSettingsPage    = lazy(() => import('@/pages/settings/OrgSettingsPage'));
const MembersPage        = lazy(() => import('@/pages/settings/MembersPage'));
const PointagePage       = lazy(() => import('@/pages/pointage/PointagePage'));
const ConsommablesLayout = lazy(() => import('@/pages/consommables/ConsommablesLayout'));
const ArticlesPage       = lazy(() => import('@/pages/consommables/ArticlesPage'));
const SuppliersPage      = lazy(() => import('@/pages/consommables/SuppliersPage'));
const PurchasesPage      = lazy(() => import('@/pages/consommables/PurchasesPage'));
const ConsumptionPage    = lazy(() => import('@/pages/consommables/ConsumptionPage'));
const MovementsPage      = lazy(() => import('@/pages/consommables/MovementsPage'));
const PlanningPage       = lazy(() => import('@/pages/planning/PlanningPage'));
const MaterielsListPage  = lazy(() => import('@/pages/materiels/MaterielsListPage'));
const PublicChantierPage = lazy(() => import('@/pages/public/PublicChantierPage'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Stale-time of 30s avoids the burst of refetches on every focus change
      // while still keeping data fresh enough for a multi-user team.
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter
        basename={import.meta.env.BASE_URL}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <AuthProvider>
          <Routes>
            {/* Public chantier client view — anonymous, no OrgProvider /
                ChantierProvider. Reachable by anyone with the shareable URL
                (`/c/<slug>`); reads go through the `get_public_chantier`
                anon RPC. See docs/superpowers/specs/2026-05-18-public-chantier-pages-design.md
                The Suspense fallback paints parchment so the first frame
                after the main chunk loads never flashes the default body bg. */}
            <Route
              path="/c/:slug"
              element={
                <Suspense fallback={<div style={{ minHeight: '100vh', background: '#f6efe1' }} />}>
                  <PublicChantierPage />
                </Suspense>
              }
            />

            {/* All other routes share the org + chantier provider stack. */}
            <Route element={<AppProvidersOutlet />}>
              {/* Auth callback runs regardless of session state — Supabase parses
                  the URL fragment, then AuthCallbackPage redirects. */}
              <Route path="/auth/callback" element={<AuthCallbackPage />} />

              {/* Public routes: redirect to / if already signed in */}
              <Route element={<PublicRoute />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup" element={<SignupPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
              </Route>

              {/* /auth/update-password is reachable when authenticated
                  (after a recovery-link click) — no PublicRoute wrapper. */}
              <Route path="/auth/update-password" element={<UpdatePasswordPage />} />

              {/* Protected routes: require session + (usually) an active org */}
              <Route element={<ProtectedRoute />}>
                <Route path="/onboarding/org" element={<CreateOrgPage />} />

                {/* All app routes render inside AppShell (sidebar + topbar). */}
                <Route element={<AppShell />}>
                  <Route path="/" element={<HomePage />} />

                  {/* Chantiers — list + detail open to any role (RLS narrows for site_managers). */}
                  <Route path="/chantiers" element={<ChantiersListPage />} />
                  <Route path="/chantiers/:id" element={<ChantierDetailPage />} />

                  <Route path="/pointage" element={<PointagePage />} />
                  <Route path="/planning" element={<PlanningPage />} />
                  <Route path="/consommables" element={<ConsommablesLayout />}>
                    <Route index element={<Navigate to="articles" replace />} />
                    <Route path="articles" element={<ArticlesPage />} />
                    <Route path="achats" element={<PurchasesPage />} />
                    <Route path="consommation" element={<ConsumptionPage />} />
                    <Route path="fournisseurs" element={<SuppliersPage />} />
                    <Route path="mouvements" element={<MovementsPage />} />
                  </Route>
                  <Route path="/materiels" element={<MaterielsListPage />} />

                  {/* Owner/admin-only routes */}
                  <Route element={<RequireRole roles={['owner', 'admin']} />}>
                    <Route path="/chantiers/new" element={<ChantierEditPage />} />
                    <Route path="/chantiers/:id/edit" element={<ChantierEditPage />} />
                    <Route path="/ouvriers" element={<WorkersListPage />} />
                    <Route path="/ouvriers/new" element={<WorkerEditPage />} />
                    <Route path="/ouvriers/:id/edit" element={<WorkerEditPage />} />
                    <Route path="/settings/org" element={<OrgSettingsPage />} />
                    <Route path="/settings/members" element={<MembersPage />} />
                  </Route>
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          <Toaster />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

// Layout outlet that provides the OrgProvider + ChantierProvider stack to
// every app route that needs an active org. Kept private to App.tsx — the
// /c/:slug public route deliberately sits outside this wrapper.
// The inner Suspense catches lazy-loaded admin pages during navigation;
// fallback is transparent so the AppShell stays visible underneath.
function AppProvidersOutlet() {
  return (
    <OrgProvider>
      <ChantierProvider>
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </ChantierProvider>
    </OrgProvider>
  );
}
