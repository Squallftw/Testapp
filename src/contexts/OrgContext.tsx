import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { setActiveOrg as setActiveOrgInDAL } from '@/data/client';
import * as orgsDAL from '@/data/orgs';
import { useAuth } from './AuthContext';

// localStorage-backed memory for the most recently selected org.
// Survives reload; gracefully degrades in private mode / quota-exceeded.
const STORAGE_KEY = 'batitrack:lastOrgId';

function readLastOrgId(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeLastOrgId(id: string | null): void {
  try {
    if (id) window.localStorage.setItem(STORAGE_KEY, id);
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private-mode browsers, quota exceeded — silently drop */
  }
}

export interface OrgContextValue {
  activeOrg: orgsDAL.Organization | null;
  orgs: orgsDAL.Organization[];
  /** Role of the current user in the active org. */
  myRole: orgsDAL.OrgRole | null;
  /** True while the initial fetch (or a refresh) is in flight. */
  loading: boolean;
  /** Last error from a load/refresh, or null. Consumed by ProtectedRoute. */
  error: Error | null;
  /** Manually pick which org to be "in". Persists across reloads. */
  selectOrg: (orgId: string) => void;
  /** Re-fetch the user's orgs (after creating one, accepting an invite, etc.). */
  refresh: () => Promise<void>;
}

const OrgContext = createContext<OrgContextValue | null>(null);

export function OrgProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  // Depend on the user id, not the whole session object — otherwise every
  // ~50-minute Supabase token refresh would re-trigger listMyOrgs().
  const userId = session?.user?.id ?? null;
  const [memberships, setMemberships] = useState<orgsDAL.OrgWithRole[]>([]);
  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setMemberships([]);
      setActiveOrgIdState(null);
      setActiveOrgInDAL(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fetched = await orgsDAL.listMyOrgs();
      setMemberships(fetched);

      const previous = readLastOrgId();
      const restored =
        previous !== null
          ? fetched.find((m) => m.organization.id === previous)
          : undefined;
      const next = restored ?? fetched[0] ?? null;
      const nextId = next?.organization.id ?? null;

      setActiveOrgIdState(nextId);
      setActiveOrgInDAL(nextId);
      writeLastOrgId(nextId);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selectOrg = useCallback(
    (orgId: string) => {
      const membership = memberships.find((m) => m.organization.id === orgId);
      if (!membership) return;
      setActiveOrgIdState(orgId);
      setActiveOrgInDAL(orgId);
      writeLastOrgId(orgId);
    },
    [memberships]
  );

  const value = useMemo<OrgContextValue>(() => {
    const active = memberships.find((m) => m.organization.id === activeOrgId) ?? null;
    return {
      activeOrg: active?.organization ?? null,
      orgs: memberships.map((m) => m.organization),
      myRole: active?.role ?? null,
      loading,
      error,
      selectOrg,
      refresh,
    };
  }, [memberships, activeOrgId, loading, error, selectOrg, refresh]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOrg(): OrgContextValue {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error('useOrg must be used within an OrgProvider');
  return ctx;
}
