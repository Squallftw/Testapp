import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  createMateriel,
  MATERIEL_KIND_LABEL,
  softDeleteMateriel,
  updateMateriel,
  type Materiel,
  type MaterielKind,
} from '@/data/materiels';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { useOrg } from '@/contexts/OrgContext';

const KINDS: MaterielKind[] = ['loue', 'possede'];

const MaterielSchema = z.object({
  name: z.string().trim().min(1, 'Nom requis'),
  type: z.enum(['possede', 'loue']),
  category: z.string().trim(),
  qty: z.string().trim(),
  unit: z.string().trim(),
  cost_per_day: z.coerce.number().min(0, 'Coût ≥ 0'),
});
type MaterielForm = z.input<typeof MaterielSchema>;

export interface MaterielEditModalProps {
  materiel: Materiel | null;
  onClose: () => void;
}

export function MaterielEditModal({ materiel, onClose }: MaterielEditModalProps) {
  const queryClient = useQueryClient();
  const { activeOrg } = useOrg();
  const isEdit = materiel !== null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const defaultValues: MaterielForm = useMemo(
    () => ({
      name: materiel?.name ?? '',
      type: materiel?.type ?? 'loue',
      category: materiel?.category ?? '',
      qty: materiel?.qty != null ? String(materiel.qty) : '',
      unit: materiel?.unit ?? '',
      cost_per_day: materiel?.cost_per_day ?? 0,
    }),
    [materiel]
  );

  const form = useForm<MaterielForm>({
    resolver: zodResolver(MaterielSchema),
    defaultValues,
  });

  async function invalidateAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['materiels'] }),
      queryClient.invalidateQueries({ queryKey: ['budget-summaries', activeOrg?.id] }),
      queryClient.invalidateQueries({ queryKey: ['budget-summary'] }),
    ]);
  }

  const save = useMutation({
    mutationFn: async (v: z.output<typeof MaterielSchema>) => {
      const qtyNum = v.qty ? Number(v.qty) : NaN;
      const payload = {
        name: v.name,
        type: v.type,
        category: v.category || null,
        qty: Number.isFinite(qtyNum) ? qtyNum : null,
        unit: v.unit || null,
        cost_per_day: v.cost_per_day,
      };
      if (isEdit && materiel) {
        await updateMateriel(materiel.id, payload);
      } else {
        await createMateriel(payload);
      }
    },
    onSuccess: async () => {
      await invalidateAll();
      toast.success(isEdit ? 'Matériel mis à jour' : 'Matériel ajouté');
      onClose();
    },
    onError: (err) => toast.fromError(err, "Échec de l'enregistrement"),
  });

  const remove = useMutation({
    mutationFn: () =>
      materiel ? softDeleteMateriel(materiel.id) : Promise.resolve(),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Matériel supprimé');
      onClose();
    },
    onError: (err) => toast.fromError(err, 'Échec de la suppression'),
  });

  const onSubmit = form.handleSubmit((v) => save.mutate(MaterielSchema.parse(v)));

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={isEdit ? 'Modifier le matériel' : 'Nouveau matériel'}
      size="md"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Nom <span className="text-bati-terra">*</span>
          </label>
          <input
            type="text"
            className="bati-input"
            autoFocus
            placeholder="ex. Bétonnière 250 L, Échafaudage 30 m²"
            {...form.register('name')}
          />
          {form.formState.errors.name && (
            <p className="text-xs text-bati-terra mt-1" role="alert">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Type <span className="text-bati-terra">*</span>
            </label>
            <select className="bati-input" {...form.register('type')}>
              {KINDS.map((k) => (
                <option key={k} value={k}>
                  {MATERIEL_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Catégorie
            </label>
            <input
              type="text"
              className="bati-input"
              placeholder="ex. Gros œuvre"
              {...form.register('category')}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
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
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Unité
            </label>
            <input
              type="text"
              className="bati-input"
              placeholder="unité, m², h"
              {...form.register('unit')}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Coût/jour (MAD) <span className="text-bati-terra">*</span>
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="bati-input"
              placeholder="0.00"
              {...form.register('cost_per_day')}
            />
            {form.formState.errors.cost_per_day && (
              <p className="text-xs text-bati-terra mt-1" role="alert">
                {form.formState.errors.cost_per_day.message}
              </p>
            )}
          </div>
        </div>
        <p className="text-[10px] text-bati-muted -mt-2">
          Coût journalier facturé pendant les déploiements (location ou
          amortissement). Saisir 0 pour ne pas comptabiliser dans le budget.
        </p>

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
              disabled={save.isPending || remove.isPending}
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
        title="Supprimer ce matériel ?"
        description="Le matériel sera archivé (soft-delete) et n'apparaîtra plus dans l'inventaire ni lors des nouveaux déploiements. Les déploiements historiques continuent d'être comptabilisés au coût/jour actuel."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          await remove.mutateAsync();
        }}
      />
    </Modal>
  );
}
