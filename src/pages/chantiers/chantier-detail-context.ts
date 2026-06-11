import { useOutletContext } from 'react-router-dom';
import type { Chantier } from '@/data/chantiers';

/* Shared between the chantier detail layout (ChantierDetailPage, which loads
   the chantier and provides it via <Outlet context>) and the routed tab
   panels in detail-tabs.tsx. Lives in its own module so both component files
   keep fast refresh (react-refresh/only-export-components). */

export interface ChantierDetailContext {
  chantier: Chantier;
}

/** Chantier loaded by the detail layout, for tab routes rendered in its Outlet. */
export function useChantierDetail() {
  return useOutletContext<ChantierDetailContext>();
}
