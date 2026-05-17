import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { OrgProvider } from '@/contexts/OrgContext';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PublicRoute } from '@/components/PublicRoute';
import LoginPage from '@/pages/auth/LoginPage';
import SignupPage from '@/pages/auth/SignupPage';
import ResetPasswordPage from '@/pages/auth/ResetPasswordPage';
import AuthCallbackPage from '@/pages/auth/AuthCallbackPage';
import CreateOrgPage from '@/pages/org/CreateOrgPage';
import HomePage from '@/pages/HomePage';

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <OrgProvider>
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

            {/* Protected routes: require session + (usually) an active org */}
            <Route element={<ProtectedRoute />}>
              <Route path="/onboarding/org" element={<CreateOrgPage />} />
              <Route path="/" element={<HomePage />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </OrgProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
