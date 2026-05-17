import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError, NotFoundError } from './errors';

export type ChantierStatus = 'active' | 'paused' | 'completed' | 'cancelled';

export interface Chantier {
  id: string;
  org_id: string;
  name: string;
  type: string | null;
  color: string | null;
  color_soft: string | null;
  client_name: string | null;
  manager_name: string | null;
  manager_user_id: string | null;
  address: string | null;
  date_start: string | null;
  date_end_prev: string | null;
  budget_total: number;
  budget_labor: number;
  budget_materials: number;
  contract_value: number;
  status: ChantierStatus;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type CreateChantierInput = Omit<
  Chantier,
  'id' | 'org_id' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export type UpdateChantierInput = Partial<CreateChantierInput>;

/**
 * List all non-deleted chantiers for the active org. RLS narrows further
 * for site_managers (only their assigned chantiers).
 */
export async function listChantiers(): Promise<Chantier[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chantiers')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('name', { ascending: true });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Chantier[];
}

export async function getChantier(id: string): Promise<Chantier> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chantiers')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError(`Chantier ${id} introuvable`);
  return data as unknown as Chantier;
}

export async function createChantier(input: CreateChantierInput): Promise<Chantier> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chantiers')
    .insert({ ...input, org_id: orgId })
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Chantier;
}

export async function updateChantier(
  id: string,
  input: UpdateChantierInput
): Promise<Chantier> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chantiers')
    .update(input)
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Chantier;
}

export async function softDeleteChantier(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('chantiers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}

// ── Helpers for forms ──────────────────────────────────────────────────

export const CHANTIER_STATUS_LABEL: Record<ChantierStatus, string> = {
  active: 'En cours',
  paused: 'En pause',
  completed: 'Terminé',
  cancelled: 'Annulé',
};

/**
 * Palette inherited from the legacy app — soft accents for chantier rows,
 * bright accents for status pills. Order chosen so the default first chantier
 * gets the brand teal.
 */
export const CHANTIER_COLOR_PALETTE: Array<{ color: string; soft: string; label: string }> = [
  { color: '#0E5460', soft: '#D8E5E7', label: 'Teal' },
  { color: '#C25B3F', soft: '#F2DCD3', label: 'Terre cuite' },
  { color: '#C58122', soft: '#F2E1C8', label: 'Ocre' },
  { color: '#2E9152', soft: '#D8EBDD', label: 'Vert' },
  { color: '#7C3F8A', soft: '#E5D5EA', label: 'Violet' },
  { color: '#3A5A8A', soft: '#D5DEEB', label: 'Bleu' },
  { color: '#9B6B23', soft: '#E8D9C2', label: 'Sable' },
  { color: '#54667A', soft: '#D8DEE5', label: 'Ardoise' },
];
