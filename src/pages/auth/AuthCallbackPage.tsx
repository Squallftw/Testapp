import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingScreen } from '@/components/LoadingScreen';

/**
 * Landing page for Supabase magic-link / confirmation-email round-trips.
 * The Supabase JS client (initialised with detectSessionInUrl: true) parses
 * the URL fragment and creates the session. Once that runs, AuthContext's
 * onAuthStateChange listener picks it up and we just need to navigate.
 */
export default function AuthCallbackPage() {
  const { session, loading, passwordRecovery } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (passwordRecovery) {
      navigate('/auth/update-password', { replace: true });
      return;
    }
    navigate(session ? '/' : '/login', { replace: true });
  }, [session, loading, passwordRecovery, navigate]);

  return <LoadingScreen label="Vérification…" />;
}
