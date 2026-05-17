import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingScreen } from './LoadingScreen';

/**
 * Wraps routes that should NOT be visible to already-authenticated users
 * (login, signup, password reset). If the user has a session, bounce them
 * to the home page.
 */
export function PublicRoute() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (session) return <Navigate to="/" replace />;
  return <Outlet />;
}
