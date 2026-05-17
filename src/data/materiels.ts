import { todo } from './errors';

export type MaterielKind = 'possede' | 'loue';

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

export async function listMateriels(): Promise<Materiel[]> {
  return todo('materiels.listMateriels');
}

export async function getMateriel(id: string): Promise<Materiel> {
  return todo('materiels.getMateriel', id);
}

export async function createMateriel(input: CreateMaterielInput): Promise<Materiel> {
  return todo('materiels.createMateriel', input);
}

export async function updateMateriel(
  id: string,
  input: UpdateMaterielInput
): Promise<Materiel> {
  return todo('materiels.updateMateriel', id, input);
}

export async function softDeleteMateriel(id: string): Promise<void> {
  return todo('materiels.softDeleteMateriel', id);
}

export async function listDeployments(materielId: string): Promise<MaterielDeployment[]> {
  return todo('materiels.listDeployments', materielId);
}

export async function listDeploymentsForChantier(
  chantierId: string
): Promise<MaterielDeployment[]> {
  return todo('materiels.listDeploymentsForChantier', chantierId);
}

export async function createDeployment(
  input: CreateDeploymentInput
): Promise<MaterielDeployment> {
  return todo('materiels.createDeployment', input);
}

export async function updateDeployment(
  id: string,
  input: UpdateDeploymentInput
): Promise<MaterielDeployment> {
  return todo('materiels.updateDeployment', id, input);
}

export async function softDeleteDeployment(id: string): Promise<void> {
  return todo('materiels.softDeleteDeployment', id);
}
