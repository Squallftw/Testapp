import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useOrg } from './OrgContext';

const STORAGE_PREFIX = 'batitrack:lastChantierId:';

function readLastChantierId(orgId: string | null): string | null {
  if (!orgId) return null;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + orgId);
  } catch {
    return null;
  }
}

function writeLastChantierId(orgId: string | null, chantierId: string | null): void {
  if (!orgId) return;
  try {
    if (chantierId) window.localStorage.setItem(STORAGE_PREFIX + orgId, chantierId);
    else window.localStorage.removeItem(STORAGE_PREFIX + orgId);
  } catch {
    /* private mode / quota exceeded — silently drop */
  }
}

export interface ChantierContextValue {
  activeChantierId: string | null;
  setActiveChantier: (chantierId: string | null) => void;
}

const ChantierContext = createContext<ChantierContextValue | null>(null);

export function ChantierProvider({ children }: { children: ReactNode }) {
  const { activeOrg } = useOrg();
  const orgId = activeOrg?.id ?? null;
  const [activeChantierId, setActiveChantierIdState] = useState<string | null>(() =>
    readLastChantierId(orgId)
  );

  useEffect(() => {
    setActiveChantierIdState(readLastChantierId(orgId));
  }, [orgId]);

  const setActiveChantier = useCallback(
    (chantierId: string | null) => {
      setActiveChantierIdState(chantierId);
      writeLastChantierId(orgId, chantierId);
    },
    [orgId]
  );

  const value = useMemo<ChantierContextValue>(
    () => ({ activeChantierId, setActiveChantier }),
    [activeChantierId, setActiveChantier]
  );

  return <ChantierContext.Provider value={value}>{children}</ChantierContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useChantier(): ChantierContextValue {
  const ctx = useContext(ChantierContext);
  if (!ctx) throw new Error('useChantier must be used within a ChantierProvider');
  return ctx;
}
