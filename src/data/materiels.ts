import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError, NotFoundError } from './errors';

export type MaterielKind = 'possede' | 'loue';

export const MATERIEL_KIND_LABEL: Record<MaterielKind, string> = {
  possede: 'Possédé',
  loue: 'Loué',
};

export interface Materiel {
  id: string;
  org_id: string;
  name: string;
  category: string | null;
  type: MaterielKind;
  qty: number | null;
  unit: string | null;
  cost_per_day: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MaterielDeployment {
  id: string;
  org_id: string;
  materiel_id: string;
  chantier_id: string;
  start_date: string;
  end_date: string;
  qty: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type CreateMaterielInput = Omit<
  Materiel,
  'id' | 'org_id' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export type UpdateMaterielInput = Partial<CreateMaterielInput>;

export type CreateDeploymentInput = Omit<
  MaterielDeployment,
  'id' | 'org_id' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export type UpdateDeploymentInput = Partial<CreateDeploymentInput>;

// ─── Materiels CRUD ─────────────────────────────────────────────────────

export async function listMateriels(): Promise<Materiel[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('materiels')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Materiel[];
}

export async function getMateriel(id: string): Promise<Materiel> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('materiels')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError(`Matériel ${id} introuvable`);
  return data as unknown as Materiel;
}

export async function createMateriel(input: CreateMaterielInput): Promise<Materiel> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('materiels')
    .insert({ ...input, org_id: orgId })
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Materiel;
}

export async function updateMateriel(
  id: string,
  input: UpdateMaterielInput
): Promise<Materiel> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('materiels')
    .update(input)
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError(`Matériel ${id} introuvable`);
  return data as unknown as Materiel;
}

export async function softDeleteMateriel(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('materiels')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}

// ─── Deployments CRUD ───────────────────────────────────────────────────

export async function listDeployments(materielId: string): Promise<MaterielDeployment[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('materiel_deployments')
    .select('*')
    .eq('org_id', orgId)
    .eq('materiel_id', materielId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as MaterielDeployment[];
}

export async function listDeploymentsForChantier(
  chantierId: string
): Promise<MaterielDeployment[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('materiel_deployments')
    .select('*')
    .eq('org_id', orgId)
    .eq('chantier_id', chantierId)
    .is('deleted_at', null)
    .order('start_date', { ascending: false });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as MaterielDeployment[];
}

export async function createDeployment(
  input: CreateDeploymentInput
): Promise<MaterielDeployment> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('materiel_deployments')
    .insert({ ...input, org_id: orgId })
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as MaterielDeployment;
}

export async function updateDeployment(
  id: string,
  input: UpdateDeploymentInput
): Promise<MaterielDeployment> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('materiel_deployments')
    .update(input)
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError(`Déploiement ${id} introuvable`);
  return data as unknown as MaterielDeployment;
}

export async function softDeleteDeployment(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('materiel_deployments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}

// ─── Cost helper ────────────────────────────────────────────────────────

/**
 * Days billed for a deployment: end_date − start_date + 1 (calendar days,
 * inclusive on both ends). Matches the way rental contracts actually bill
 * — you pay per calendar day, weekends included.
 */
export function deploymentDays(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const ms = end.getTime() - start.getTime();
  const days = Math.round(ms / 86_400_000) + 1;
  return days > 0 ? days : 0;
}

export function deploymentCost(
  d: Pick<MaterielDeployment, 'start_date' | 'end_date' | 'qty'>,
  costPerDay: number
): number {
  const days = deploymentDays(d.start_date, d.end_date);
  const qty = d.qty == null ? 1 : Number(d.qty);
  return days * Number(costPerDay) * (Number.isFinite(qty) ? qty : 1);
}
