import { todo } from './errors';

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

export async function listChantiers(): Promise<Chantier[]> {
  return todo('chantiers.listChantiers');
}

export async function getChantier(id: string): Promise<Chantier> {
  return todo('chantiers.getChantier', id);
}

export async function createChantier(input: CreateChantierInput): Promise<Chantier> {
  return todo('chantiers.createChantier', input);
}

export async function updateChantier(
  id: string,
  input: UpdateChantierInput
): Promise<Chantier> {
  return todo('chantiers.updateChantier', id, input);
}

export async function softDeleteChantier(id: string): Promise<void> {
  return todo('chantiers.softDeleteChantier', id);
}
