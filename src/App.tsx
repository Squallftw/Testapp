import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/contexts/AuthContext';
import { OrgProvider } from '@/contexts/OrgContext';
import { ChantierProvider } from '@/contexts/ChantierContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PublicRoute } from '@/components/PublicRoute';
import { AppShell } from '@/components/AppShell';
import { RequireRole } from '@/components/RequireRole';
import { Toaster } from '@/components/ui/Toast';
import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import UpdatePasswordPage from '@/pages/auth/UpdatePasswordPage';
import AuthCallbackPage from '@/pages/auth/AuthCallbackPage';
import CreateOrgPage from '@/pages/org/CreateOrgPage';
import HomePage from '@/pages/HomePage';
import ChantiersListPage from '@/pages/chantiers/ChantiersListPage';
import ChantierDetailPage from '@/pages/chantiers/ChantierDetailPage';
import ChantierEditPage from '@/pages/chantiers/ChantierEditPage';
import WorkersListPage from '@/pages/workers/WorkersListPage';
import WorkerEditPage from '@/pages/workers/WorkerEditPage';
import OrgSettingsPage from '@/pages/settings/OrgSettingsPage';
import MembersPage from '@/pages/settings/MembersPage';
import PointagePage from '@/pages/pointage/PointagePage';
import ConsommablesLayout from '@/pages/consommables/ConsommablesLayout';
import ArticlesPage from '@/pages/consommables/ArticlesPage';
import SuppliersPage from '@/pages/consommables/SuppliersPage';
import PurchasesPage from '@/pages/consommables/PurchasesPage';
import ConsumptionPage from '@/pages/consommables/ConsumptionPage';
import MovementsPage from '@/pages/consommables/MovementsPage';
import BudgetDashboardPage from '@/pages/budget/BudgetDashboardPage';
import PlanningPage from '@/pages/planning/PlanningPage';

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
          <OrgProvider>
            <ChantierProvider>
              <Routes>
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
                    <Route path="/budget" element={<BudgetDashboardPage />} />

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

                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <Toaster />
            </ChantierProvider>
          </OrgProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
