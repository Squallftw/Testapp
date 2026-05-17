import { todo } from './errors';

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
  return todo('consumables.listItems');
}

export async function createItem(input: CreateItemInput): Promise<ConsumablesItem> {
  return todo('consumables.createItem', input);
}

export async function updateItem(
  id: string,
  input: UpdateItemInput
): Promise<ConsumablesItem> {
  return todo('consumables.updateItem', id, input);
}

export async function softDeleteItem(id: string): Promise<void> {
  return todo('consumables.softDeleteItem', id);
}

// ── purchases (with embedded purchase_lines) ──────────────────────────

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

export async function listPurchases(filter?: ListPurchasesFilter): Promise<Purchase[]> {
  return todo('consumables.listPurchases', filter);
}

export async function getPurchase(id: string): Promise<PurchaseWithLines> {
  return todo('consumables.getPurchase', id);
}

export async function createPurchase(input: CreatePurchaseInput): Promise<PurchaseWithLines> {
  return todo('consumables.createPurchase', input);
}

export async function softDeletePurchase(id: string): Promise<void> {
  return todo('consumables.softDeletePurchase', id);
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

export async function listConsumption(filter: ListConsumptionFilter): Promise<Consumption[]> {
  return todo('consumables.listConsumption', filter);
}

export async function createConsumption(
  input: CreateConsumptionInput
): Promise<Consumption> {
  return todo('consumables.createConsumption', input);
}

export async function softDeleteConsumption(id: string): Promise<void> {
  return todo('consumables.softDeleteConsumption', id);
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
  return todo('consumables.listTransfers');
}

export async function createTransfer(input: CreateTransferInput): Promise<Transfer> {
  return todo('consumables.createTransfer', input);
}

export async function softDeleteTransfer(id: string): Promise<void> {
  return todo('consumables.softDeleteTransfer', id);
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
  return todo('consumables.listAdjustments');
}

export async function createAdjustment(input: CreateAdjustmentInput): Promise<Adjustment> {
  return todo('consumables.createAdjustment', input);
}

// ── stock snapshot helper ─────────────────────────────────────────────

export interface StockSnapshot {
  item_id: string;
  total: number;
  per_chantier: Record<string, number>; // chantier_id → on-hand qty (depot = '__depot__')
}

export async function getStockSnapshot(itemId: string): Promise<StockSnapshot> {
  return todo('consumables.getStockSnapshot', itemId);
}
