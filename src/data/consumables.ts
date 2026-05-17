import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError, NotFoundError } from './errors';

export type PurchasePaymentState = 'paid' | 'pending' | 'partial';
export type AdjustmentCategory = 'loss' | 'theft' | 'damage' | 'correction';

// ── items (catalogue) ─────────────────────────────────────────────────

export interface ConsumablesItem {
  id: string;
  org_id: string;
  name: string;
  category: string | null;
  unit: string | null;
  average_price: number;
  default_supplier_id: string | null;
  reorder_threshold: number | null;
  has_expiry: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type CreateItemInput = Omit<
  ConsumablesItem,
  'id' | 'org_id' | 'created_at' | 'updated_at' | 'deleted_at'
>;
export type UpdateItemInput = Partial<CreateItemInput>;

export async function listItems(): Promise<ConsumablesItem[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consumables_items')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('name');
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as ConsumablesItem[];
}

export async function getItem(id: string): Promise<ConsumablesItem> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consumables_items')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError(`Article ${id} introuvable`);
  return data as unknown as ConsumablesItem;
}

export async function createItem(input: CreateItemInput): Promise<ConsumablesItem> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consumables_items')
    .insert({ ...input, org_id: orgId })
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as ConsumablesItem;
}

export async function updateItem(
  id: string,
  input: UpdateItemInput
): Promise<ConsumablesItem> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consumables_items')
    .update(input)
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as ConsumablesItem;
}

export async function softDeleteItem(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consumables_items')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}

// ── purchases ─────────────────────────────────────────────────────────

export interface PurchaseLine {
  item_id: string;
  qty: number;
  unit_price: number;
  total: number;
}

export interface Purchase {
  id: string;
  org_id: string;
  chantier_id: string | null;
  supplier_id: string | null;
  invoice_ref: string | null;
  purchased_at: string;
  payment_status: PurchasePaymentState;
  attachment_url: string | null;
  recorded_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface PurchaseWithLines extends Purchase {
  lines: (PurchaseLine & { id: string })[];
}

export interface CreatePurchaseInput {
  chantier_id?: string | null;
  supplier_id?: string | null;
  invoice_ref?: string | null;
  purchased_at: string;
  payment_status?: PurchasePaymentState;
  attachment_url?: string | null;
  notes?: string | null;
  lines: PurchaseLine[];
}

export interface ListPurchasesFilter {
  chantierId?: string;
  supplierId?: string;
}

export async function listPurchases(
  filter?: ListPurchasesFilter
): Promise<Purchase[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  let q = supabase
    .from('consumables_purchases')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('purchased_at', { ascending: false });
  if (filter?.chantierId) q = q.eq('chantier_id', filter.chantierId);
  if (filter?.supplierId) q = q.eq('supplier_id', filter.supplierId);
  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Purchase[];
}

export async function getPurchase(id: string): Promise<PurchaseWithLines> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data: header, error: headerErr } = await supabase
    .from('consumables_purchases')
    .select('*')
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .maybeSingle();
  if (headerErr) throw mapSupabaseError(headerErr);
  if (!header) throw new NotFoundError(`Achat ${id} introuvable`);

  const { data: lines, error: linesErr } = await supabase
    .from('consumables_purchase_lines')
    .select('id, item_id, qty, unit_price, total')
    .eq('purchase_id', id);
  if (linesErr) throw mapSupabaseError(linesErr);

  return {
    ...(header as unknown as Purchase),
    lines: (lines ?? []) as unknown as (PurchaseLine & { id: string })[],
  };
}

/**
 * Create a purchase with its lines atomically via the
 * create_purchase_with_lines RPC (migration 0003).
 */
export async function createPurchase(
  input: CreatePurchaseInput
): Promise<PurchaseWithLines> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase.rpc('create_purchase_with_lines', {
    p_input: {
      org_id: orgId,
      chantier_id: input.chantier_id ?? null,
      supplier_id: input.supplier_id ?? null,
      invoice_ref: input.invoice_ref ?? null,
      purchased_at: input.purchased_at,
      payment_status: input.payment_status ?? 'pending',
      attachment_url: input.attachment_url ?? null,
      notes: input.notes ?? null,
      lines: input.lines,
    },
  });
  if (error) throw mapSupabaseError(error);
  if (!data) throw new NotFoundError('Achat introuvable après création');
  // The RPC returns the purchase row; fetch the lines we just inserted.
  return getPurchase((data as Purchase).id);
}

export async function softDeletePurchase(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consumables_purchases')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}

// ── consumption ───────────────────────────────────────────────────────

export interface Consumption {
  id: string;
  org_id: string;
  chantier_id: string;
  task_id: string | null;
  item_id: string;
  qty: number;
  used_at: string;
  recorded_by: string | null;
  notes: string | null;
  is_loss: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type CreateConsumptionInput = Omit<
  Consumption,
  'id' | 'org_id' | 'recorded_by' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export interface ListConsumptionFilter {
  chantierId?: string;
  itemId?: string;
}

export async function listConsumption(
  filter: ListConsumptionFilter
): Promise<Consumption[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  let q = supabase
    .from('consumables_consumption')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('used_at', { ascending: false });
  if (filter.chantierId) q = q.eq('chantier_id', filter.chantierId);
  if (filter.itemId) q = q.eq('item_id', filter.itemId);
  const { data, error } = await q;
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Consumption[];
}

export async function createConsumption(
  input: CreateConsumptionInput
): Promise<Consumption> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consumables_consumption')
    .insert({ ...input, org_id: orgId })
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Consumption;
}

export async function softDeleteConsumption(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consumables_consumption')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}

// ── transfers ─────────────────────────────────────────────────────────

export interface Transfer {
  id: string;
  org_id: string;
  item_id: string;
  qty: number;
  from_chantier_id: string | null;
  to_chantier_id: string | null;
  transferred_at: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type CreateTransferInput = Omit<
  Transfer,
  'id' | 'org_id' | 'recorded_by' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export async function listTransfers(): Promise<Transfer[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consumables_transfers')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('transferred_at', { ascending: false });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Transfer[];
}

export async function createTransfer(input: CreateTransferInput): Promise<Transfer> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consumables_transfers')
    .insert({ ...input, org_id: orgId })
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Transfer;
}

export async function softDeleteTransfer(id: string): Promise<void> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { error } = await supabase
    .from('consumables_transfers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .is('deleted_at', null);
  if (error) throw mapSupabaseError(error);
}

// ── adjustments ───────────────────────────────────────────────────────

export interface Adjustment {
  id: string;
  org_id: string;
  item_id: string;
  qty: number;
  type: AdjustmentCategory;
  adjusted_at: string;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type CreateAdjustmentInput = Omit<
  Adjustment,
  'id' | 'org_id' | 'recorded_by' | 'created_at' | 'updated_at' | 'deleted_at'
>;

export async function listAdjustments(): Promise<Adjustment[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consumables_adjustments')
    .select('*')
    .eq('org_id', orgId)
    .is('deleted_at', null)
    .order('adjusted_at', { ascending: false });
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as Adjustment[];
}

export async function createAdjustment(
  input: CreateAdjustmentInput
): Promise<Adjustment> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('consumables_adjustments')
    .insert({ ...input, org_id: orgId })
    .select('*')
    .single();
  if (error) throw mapSupabaseError(error);
  return data as unknown as Adjustment;
}

// ── stock-on-hand (computed view in migration 0003) ──────────────────

export interface StockOnHand {
  item_id: string;
  org_id: string;
  name: string;
  unit: string | null;
  on_hand: number;
}

export async function listStockOnHand(): Promise<StockOnHand[]> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('stock_on_hand_total')
    .select('*')
    .eq('org_id', orgId);
  if (error) throw mapSupabaseError(error);
  return (data ?? []) as unknown as StockOnHand[];
}

export const PAYMENT_STATUS_LABEL: Record<PurchasePaymentState, string> = {
  paid: 'Payé',
  pending: 'À payer',
  partial: 'Partiel',
};

export const ADJUSTMENT_CATEGORY_LABEL: Record<AdjustmentCategory, string> = {
  loss: 'Perte',
  theft: 'Vol',
  damage: 'Dégât',
  correction: 'Correction',
};
