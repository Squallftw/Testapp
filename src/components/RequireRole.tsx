import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useOrg } from '@/contexts/OrgContext';
import { toast } from '@/components/ui/Toast';

export type Role = 'owner' | 'admin' | 'site_manager' | 'worker';

interface RequireRoleProps {
  /** Roles allowed to view the nested routes. */
  roles: Role[];
  /** Where to redirect a user who lacks the role. Default '/'. */
  fallback?: string;
}

/**
 * Gates nested routes by org-role. Assumes ProtectedRoute is upstream
 * (i.e. the user is signed in and has an active org).
 */
export function RequireRole({ roles, fallback = '/' }: RequireRoleProps) {
  const { myRole } = useOrg();
  const location = useLocation();
  const allowed = myRole !== null && roles.includes(myRole);

  useEffect(() => {
    if (!allowed && myRole !== null) {
      toast.error("Accès refusé. Vous n'avez pas les droits pour cette page.");
    }
  }, [allowed, myRole]);

  if (!allowed) {
    return <Navigate to={fallback} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
