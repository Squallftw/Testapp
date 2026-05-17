import { todo } from './errors';

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

export async function listPaymentsForChantier(chantierId: string): Promise<ChantierPayment[]> {
  return todo('payments.listPaymentsForChantier', chantierId);
}

export async function createPayment(input: CreatePaymentInput): Promise<ChantierPayment> {
  return todo('payments.createPayment', input);
}

export async function updatePayment(
  id: string,
  input: UpdatePaymentInput
): Promise<ChantierPayment> {
  return todo('payments.updatePayment', id, input);
}

export async function softDeletePayment(id: string): Promise<void> {
  return todo('payments.softDeletePayment', id);
}
