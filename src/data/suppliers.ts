import { todo } from './errors';

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
  return todo('suppliers.listSuppliers');
}

export async function getSupplier(id: string): Promise<Supplier> {
  return todo('suppliers.getSupplier', id);
}

export async function createSupplier(input: CreateSupplierInput): Promise<Supplier> {
  return todo('suppliers.createSupplier', input);
}

export async function updateSupplier(
  id: string,
  input: UpdateSupplierInput
): Promise<Supplier> {
  return todo('suppliers.updateSupplier', id, input);
}

export async function softDeleteSupplier(id: string): Promise<void> {
  return todo('suppliers.softDeleteSupplier', id);
}
