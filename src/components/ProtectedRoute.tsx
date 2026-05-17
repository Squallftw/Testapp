import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOrg } from '@/contexts/OrgContext';
import { LoadingScreen } from './LoadingScreen';

/**
 * Wraps protected routes. Resolution order:
 *   1. Wait for the initial auth session fetch.
 *   2. No session → redirect to /login (remember intended destination).
 *   3. Wait for the org list fetch.
 *   4. No orgs → force user through /onboarding/org first.
 *   5. Otherwise render the matched child route.
 */
export function ProtectedRoute() {
  const { session, loading: authLoading } = useAuth();
  const { orgs, loading: orgLoading, error: orgError } = useOrg();
  const location = useLocation();

  if (authLoading) return <LoadingScreen />;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (orgLoading) return <LoadingScreen />;

  if (orgError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bati-bg p-6">
        <div className="bati-card rounded-lg p-8 max-w-md">
          <h1 className="text-xl font-bold text-bati-terra mb-2">Erreur de chargement</h1>
          <p className="text-sm text-bati-muted mb-4">
            Impossible de charger vos organisations. Vérifiez votre connexion puis rechargez
            la page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-bati-teal text-white rounded text-sm hover:opacity-90"
            type="button"
          >
            Recharger
          </button>
        </div>
      </div>
    );
  }

  const onOnboarding = location.pathname === '/onboarding/org';

  if (orgs.length === 0 && !onOnboarding) {
    return <Navigate to="/onboarding/org" replace />;
  }

  if (orgs.length > 0 && onOnboarding) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
