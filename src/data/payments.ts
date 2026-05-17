import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError, NotFoundError } from './errors';

export interface ChantierPayment {
  id: string;
  org_id: string;
  chantier_id: string;
  payment_date: string;
  amount: number;
  reference: string | null;
  attachment_url: string | null;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type CreatePaymentInput = Omit<
  ChantierPayment,
  'id' | 'org_id' | 'recorded_by' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export type UpdatePaymentInput = Partial<CreatePaymentInput>;

export async function listPaymentsForChantier(
  chantierId: string
): Promise<ChantierPayment[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chantier_payments')
    .select('*')
    .eq('org_id', orgId)
    .eq('chantier_id', chantierId)
    .is('deleted_at', null)
    .order('payment_date', { ascending: false });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as ChantierPayment[];
}

export async function createPayment(
  input: CreatePaymentInput
): Promise<ChantierPayment> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chantier_payments')
    .insert({ ...input, org_id: orgId })
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as ChantierPayment;
}

export async function updatePayment(
  id: string,
  input: UpdatePaymentInput
): Promise<ChantierPayment> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('chantier_payments')
    .update(input)
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .select('*')
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError(`Paiement ${id} introuvable`);
  return data as unknown as ChantierPayment;
}

export async function softDeletePayment(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('chantier_payments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}
