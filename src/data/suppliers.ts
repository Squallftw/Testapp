import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError, NotFoundError } from './errors';

export interface Supplier {
  id: string;
  org_id: string;
  name: string;
  type: string | null;
  phone: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type CreateSupplierInput = Omit<
  Supplier,
  'id' | 'org_id' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export type UpdateSupplierInput = Partial<CreateSupplierInput>;

export async function listSuppliers(): Promise<Supplier[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Supplier[];
}

export async function getSupplier(id: string): Promise<Supplier> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError(`Fournisseur ${id} introuvable`);
  return data as unknown as Supplier;
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('suppliers')
    .insert({ ...input, org_id: orgId })
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Supplier;
}

export async function updateSupplier(
  id: string,
  input: UpdateSupplierInput
): Promise<Supplier> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('suppliers')
    .update(input)
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Supplier;
}

export async function softDeleteSupplier(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('suppliers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}
