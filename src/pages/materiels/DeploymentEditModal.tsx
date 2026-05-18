import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createDeployment,
  deploymentCost,
  deploymentDays,
  listMateriels,
  softDeleteDeployment,
  updateDeployment,
  type Materiel,
  type MaterielDeployment,
} from '@/data/materiels';
import { useQuery } from '@tanstack/react-query';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { useOrg } from '@/contexts/OrgContext';
import { formatMAD, formatMADPrecise } from '@/lib/format';
import { format } from 'date-fns';

const DeploymentSchema = z
  .object({
    materiel_id: z.string().uuid('Sélectionnez un matériel'),
    start_date: z.string().trim().min(1, 'Date de début requise'),
    end_date: z.string().trim().min(1, 'Date de fin requise'),
    qty: z.string().trim(),
  })
  .refine((v) => v.end_date >= v.start_date, {
    message: 'La date de fin doit être postérieure ou égale à la date de début',
    path: ['end_date'],
  });
type DeploymentForm = z.input<typeof DeploymentSchema>;

export interface DeploymentEditModalProps {
  chantierId: string;
  deployment: MaterielDeployment | null;
  onClose: () => void;
}

export function DeploymentEditModal({
  chantierId,
  deployment,
  onClose,
}: DeploymentEditModalProps) {
  const queryClient = useQueryClient();
  const { activeOrg } = useOrg();
  const isEdit = deployment !== null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const materielsQ = useQuery({
    queryKey: ['materiels', activeOrg?.id],
    queryFn: () => listMateriels(),
    enabled: !!activeOrg,
  });
  const materiels = useMemo(() => materielsQ.data ?? [], [materielsQ.data]);
  const materielsById = useMemo(
    () => new Map(materiels.map((m) => [m.id, m])),
    [materiels]
  );

  const defaultValues: DeploymentForm = useMemo(
    () => ({
      materiel_id: deployment?.materiel_id ?? '',
      start_date: deployment?.start_date ?? format(new Date(), 'yyyy-MM-dd'),
      end_date: deployment?.end_date ?? format(new Date(), 'yyyy-MM-dd'),
      qty: deployment?.qty != null ? String(deployment.qty) : '',
    }),
    [deployment]
  );

  const form = useForm<DeploymentForm>({
    resolver: zodResolver(DeploymentSchema),
    defaultValues,
  });

  const watched = form.watch();
  const previewCost = useMemo(() => {
    const m = materielsById.get(watched.materiel_id);
    if (!m || !watched.start_date || !watched.end_date) return null;
    const qtyNum = watched.qty ? Number(watched.qty) : NaN;
    const days = deploymentDays(watched.start_date, watched.end_date);
    const cost = deploymentCost(
      {
        start_date: watched.start_date,
        end_date: watched.end_date,
        qty: Number.isFinite(qtyNum) ? qtyNum : null,
      },
      m.cost_per_day
    );
    return { days, cost, materiel: m };
  }, [watched, materielsById]);

  async function invalidateAll() {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ['deployments', 'chantier', chantierId],
      }),
      queryClient.invalidateQueries({
        queryKey: ['budget-summary', activeOrg?.id, chantierId],
      }),
      queryClient.invalidateQueries({ queryKey: ['budget-summaries', activeOrg?.id] }),
    ]);
  }

  const save = useMutation({
    mutationFn: async (v: z.output<typeof DeploymentSchema>) => {
      const qtyNum = v.qty ? Number(v.qty) : NaN;
      const payload = {
        materiel_id: v.materiel_id,
        start_date: v.start_date,
        end_date: v.end_date,
        qty: Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : null,
      };
      if (isEdit && deployment) {
        await updateDeployment(deployment.id, payload);
      } else {
        await createDeployment({ chantier_id: chantierId, ...payload });
      }
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success(isEdit ? 'Déploiement mis à jour' : 'Déploiement enregistré');
      onClose();
    },
    onError: (err) => toast.fromError(err, "Échec de l'enregistrement"),
  });

  const remove = useMutation({
    mutationFn: () =>
      deployment ? softDeleteDeployment(deployment.id) : Promise.resolve(),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Déploiement supprimé');
      onClose();
    },
    onError: (err) => toast.fromError(err, 'Échec de la suppression'),
  });

  const onSubmit = form.handleSubmit((v) =>
    save.mutate(DeploymentSchema.parse(v))
  );

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'Modifier le déploiement' : 'Déployer un matériel'}
      size="md"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Matériel <span className="text-bati-terra">*</span>
          </label>
          <select className="bati-input" {...form.register('materiel_id')}>
            <option value="">— Choisir un matériel —</option>
            {materiels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({formatMADPrecise(m.cost_per_day)}/jour)
              </option>
            ))}
          </select>
          {form.formState.errors.materiel_id && (
            <p className="text-xs text-bati-terra mt-1" role="alert">
              {form.formState.errors.materiel_id.message}
            </p>
          )}
          {materiels.length === 0 && !materielsQ.isLoading && (
            <p className="text-xs text-bati-ochre mt-1">
              Aucun matériel disponible — créez-en un depuis la page Matériels.
            </p>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Du <span className="text-bati-terra">*</span>
            </label>
            <input
              type="date"
              className="bati-input"
              {...form.register('start_date')}
            />
            {form.formState.errors.start_date && (
              <p className="text-xs text-bati-terra mt-1" role="alert">
                {form.formState.errors.start_date.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Au <span className="text-bati-terra">*</span>
            </label>
            <input
              type="date"
              className="bati-input"
              {...form.register('end_date')}
            />
            {form.formState.errors.end_date && (
              <p className="text-xs text-bati-terra mt-1" role="alert">
                {form.formState.errors.end_date.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Quantité
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="bati-input"
              placeholder="1"
              {...form.register('qty')}
            />
            <p className="text-[10px] text-bati-muted mt-1">
              Vide = 1 unité
            </p>
          </div>
        </div>

        {previewCost && (
          <div className="bati-card rounded-md p-3 border-bati-teal/30 bg-bati-teal-soft/20">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wide text-bati-muted">
                  Coût estimé
                </div>
                <div className="text-base font-bold text-bati-teal tabular-nums">
                  {formatMAD(previewCost.cost)}
                </div>
              </div>
              <div className="text-xs text-bati-muted text-right">
                {previewCost.days} jour{previewCost.days > 1 ? 's' : ''} ×{' '}
                {formatMADPrecise(previewCost.materiel.cost_per_day)}/jour
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-bati-border">
          <div>
            {isEdit && (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                disabled={save.isPending || remove.isPending}
                className="px-3 py-2 text-sm text-bati-terra hover:bg-bati-terra-soft rounded-md transition-colors disabled:opacity-50"
              >
                Supprimer
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={save.isPending || remove.isPending}
              className="px-4 py-2 text-sm text-bati-text hover:bg-bati-border-soft rounded-md transition-colors disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={save.isPending || remove.isPending || materiels.length === 0}
              className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={(o) => !o && setConfirmingDelete(false)}
        title="Supprimer ce déploiement ?"
        description="Le déploiement sera archivé (soft-delete) et retiré du calcul du coût matériel sur ce chantier."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
      />
    </Modal>
  );
}

export type { Materiel };
