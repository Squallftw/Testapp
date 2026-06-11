import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  createConsumption,
  listConsumption,
  listItems,
  softDeleteConsumption,
  type Consumption,
} from '@/data/consumables';
import { listChantiers } from '@/data/chantiers';
import { useOrg } from '@/contexts/OrgContext';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { formatDateShort } from '@/lib/format';

const ConsumeSchema = z.object({
  chantier_id: z.string().uuid('Chantier requis'),
  item_id: z.string().uuid('Article requis'),
  qty: z.coerce.number().positive('Quantité > 0'),
  used_at: z.string().min(1, 'Date requise'),
  is_loss: z.boolean(),
  notes: z.string().trim(),
});
type ConsumeForm = z.input<typeof ConsumeSchema>;

const columnHelper = createColumnHelper<Consumption>();

export default function ConsumptionPage() {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Consumption | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // URL ?chantier=<id> is the sole source of truth — deep-links from a
  // chantier's Matériaux tab land already-filtered; no param = all chantiers.
  const chantierFilter = searchParams.get('chantier') ?? '';
  const setChantierFilter = (value: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('chantier', value); // empty string = "all"
    setSearchParams(next, { replace: true });
  };

  const consumption = useQuery({
    queryKey: ['consumption', activeOrg?.id, chantierFilter],
    queryFn: () =>
      listConsumption(chantierFilter ? { chantierId: chantierFilter } : {}),
    enabled: !!activeOrg,
  });
  const chantiers = useQuery({
    queryKey: ['chantiers', activeOrg?.id],
    queryFn: () => listChantiers(),
    enabled: !!activeOrg,
  });
  const items = useQuery({
    queryKey: ['items', activeOrg?.id],
    queryFn: () => listItems(),
    enabled: !!activeOrg,
  });

  const itemName = useMemo(() => {
    const m = new Map((items.data ?? []).map((i) => [i.id, i]));
    return (id: string) => m.get(id);
  }, [items.data]);

  const chantierName = useMemo(() => {
    const m = new Map((chantiers.data ?? []).map((c) => [c.id, c.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [chantiers.data]);

  const remove = useMutation({
    mutationFn: (id: string) => softDeleteConsumption(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['consumption'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-on-hand'] });
      toast.success('Consommation supprimée');
    },
    onError: (err) => toast.fromError(err, 'Échec de la suppression'),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('used_at', {
        header: 'Date',
        cell: (info) => (
          <span className="text-bati-muted text-xs">{formatDateShort(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor('chantier_id', {
        header: 'Chantier',
        cell: (info) => chantierName(info.getValue()),
      }),
      columnHelper.accessor('item_id', {
        header: 'Article',
        cell: (info) => {
          const it = itemName(info.getValue());
          return it ? (
            <span>
              {it.name}{' '}
              {it.unit && <span className="text-bati-muted text-xs">({it.unit})</span>}
            </span>
          ) : (
            <span className="text-bati-muted">—</span>
          );
        },
      }),
      columnHelper.accessor('qty', {
        header: 'Quantité',
        cell: (info) => (
          <span className="tabular-nums">
            {Number(info.getValue()).toLocaleString('fr-MA')}
          </span>
        ),
      }),
      columnHelper.accessor('is_loss', {
        header: '',
        cell: (info) =>
          info.getValue() ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-bati-terra-soft text-bati-terra font-medium">
              Perte
            </span>
          ) : null,
      }),
      columnHelper.display({
        id: 'actions',
        header: '',
        cell: (info) => (
          <button
            type="button"
            onClick={() => setConfirmDelete(info.row.original)}
            className="text-xs text-bati-terra hover:underline"
          >
            Supprimer
          </button>
        ),
      }),
    ],
    [chantierName, itemName]
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select
          value={chantierFilter}
          onChange={(e) => setChantierFilter(e.target.value)}
          className="bati-input max-w-xs"
        >
          <option value="">— Tous les chantiers —</option>
          {(chantiers.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90"
        >
          Nouvelle consommation
        </button>
      </div>

      <DataTable
        data={consumption.data ?? []}
        columns={columns}
        isLoading={consumption.isLoading}
        bulkDelete={{
          confirmTitle: (n) => `Supprimer ${n} consommation${n > 1 ? 's' : ''} ?`,
          confirmDescription: (n) =>
            `${n} consommation${n > 1 ? 's seront supprimées' : ' sera supprimée'}. Le stock sera recalculé en conséquence.`,
          successMessage: (n) => `${n} consommation${n > 1 ? 's' : ''} supprimée${n > 1 ? 's' : ''}`,
          onConfirm: async (selected) => {
            await Promise.all(selected.map((c) => softDeleteConsumption(c.id)));
            await queryClient.invalidateQueries({ queryKey: ['consumption'] });
            await queryClient.invalidateQueries({ queryKey: ['stock-on-hand'] });
            await queryClient.invalidateQueries({ queryKey: ['budget-summaries'] });
          },
        }}
        empty={
          <EmptyState
            title="Aucune consommation"
            description="Enregistrez l'utilisation des articles sur les chantiers."
            action={
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
              >
                Enregistrer une consommation
              </button>
            }
          />
        }
      />

      {creating && (
        <ConsumeModal
          chantiers={chantiers.data ?? []}
          items={items.data ?? []}
          defaultChantierId={chantierFilter}
          onClose={() => setCreating(false)}
        />
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Supprimer cette consommation ?"
        description="Le stock sera recalculé en conséquence."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (confirmDelete) await remove.mutateAsync(confirmDelete.id);
        }}
      />
    </div>
  );
}

interface ConsumeModalProps {
  chantiers: Array<{ id: string; name: string }>;
  items: Array<{ id: string; name: string; unit: string | null }>;
  defaultChantierId: string;
  onClose: () => void;
}

function ConsumeModal({
  chantiers,
  items,
  defaultChantierId,
  onClose,
}: ConsumeModalProps) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const form = useForm<ConsumeForm>({
    resolver: zodResolver(ConsumeSchema),
    defaultValues: {
      chantier_id: defaultChantierId,
      item_id: '',
      qty: 0,
      used_at: today,
      is_loss: false,
      notes: '',
    },
  });

  const save = useMutation({
    mutationFn: (v: z.output<typeof ConsumeSchema>) =>
      createConsumption({
        chantier_id: v.chantier_id,
        item_id: v.item_id,
        qty: v.qty,
        used_at: v.used_at,
        is_loss: v.is_loss,
        notes: v.notes || null,
        task_id: null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['consumption'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-on-hand'] });
      toast.success('Consommation enregistrée');
      onClose();
    },
    onError: (err) => toast.fromError(err, "Échec de l'enregistrement"),
  });

  const onSubmit = form.handleSubmit((v) => save.mutate(ConsumeSchema.parse(v)));

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Nouvelle consommation" size="md">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Chantier <span className="text-bati-terra">*</span>
          </label>
          <select className="bati-input" {...form.register('chantier_id')}>
            <option value="">— Choisir —</option>
            {chantiers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {form.formState.errors.chantier_id && (
            <p className="text-xs text-bati-terra mt-1" role="alert">
              {form.formState.errors.chantier_id.message}
            </p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Article <span className="text-bati-terra">*</span>
          </label>
          <select className="bati-input" {...form.register('item_id')}>
            <option value="">— Choisir —</option>
            {items.map((it) => (
              <option key={it.id} value={it.id}>
                {it.name} {it.unit ? `(${it.unit})` : ''}
              </option>
            ))}
          </select>
          {form.formState.errors.item_id && (
            <p className="text-xs text-bati-terra mt-1" role="alert">
              {form.formState.errors.item_id.message}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Quantité <span className="text-bati-terra">*</span>
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="bati-input"
              {...form.register('qty')}
            />
            {form.formState.errors.qty && (
              <p className="text-xs text-bati-terra mt-1" role="alert">
                {form.formState.errors.qty.message}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Date
            </label>
            <input type="date" className="bati-input" {...form.register('used_at')} />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register('is_loss')} />
            Cocher si c&apos;est une perte (matériel gaspillé, abîmé, etc.)
          </label>
        </div>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Notes
          </label>
          <textarea className="bati-input" rows={2} {...form.register('notes')} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-bati-text hover:bg-bati-border-soft rounded-md"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
          >
            {save.isPending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
