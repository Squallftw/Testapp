import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  createItem,
  listItems,
  listStockOnHand,
  softDeleteItem,
  updateItem,
  type ConsumablesItem,
} from '@/data/consumables';
import { listSuppliers } from '@/data/suppliers';
import { useOrg } from '@/contexts/OrgContext';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { formatMADPrecise } from '@/lib/format';

const ItemSchema = z.object({
  name: z.string().trim().min(1, 'Le nom est requis'),
  category: z.string().trim(),
  unit: z.string().trim(),
  default_supplier_id: z.string(),
  reorder_threshold: z.string(),
  has_expiry: z.boolean(),
  notes: z.string().trim(),
});

type ItemForm = z.input<typeof ItemSchema>;

const columnHelper = createColumnHelper<ConsumablesItem & { on_hand?: number }>();

export default function ArticlesPage() {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ConsumablesItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ConsumablesItem | null>(null);

  const items = useQuery({
    queryKey: ['items', activeOrg?.id],
    queryFn: () => listItems(),
    enabled: !!activeOrg,
  });

  const suppliers = useQuery({
    queryKey: ['suppliers', activeOrg?.id],
    queryFn: () => listSuppliers(),
    enabled: !!activeOrg,
  });

  const stock = useQuery({
    queryKey: ['stock-on-hand', activeOrg?.id],
    queryFn: () => listStockOnHand(),
    enabled: !!activeOrg,
  });

  const merged = useMemo(() => {
    const stockMap = new Map((stock.data ?? []).map((s) => [s.item_id, s.on_hand]));
    return (items.data ?? []).map((i) => ({ ...i, on_hand: stockMap.get(i.id) }));
  }, [items.data, stock.data]);

  const supplierName = useMemo(() => {
    const m = new Map((suppliers.data ?? []).map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? (m.get(id) ?? '—') : '—');
  }, [suppliers.data]);

  const remove = useMutation({
    mutationFn: (id: string) => softDeleteItem(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Article archivé');
    },
    onError: (err) => toast.fromError(err, 'Échec de la suppression'),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('name', {
        header: 'Article',
        cell: (info) => (
          <button
            type="button"
            onClick={() => setEditing(info.row.original)}
            className="font-medium text-bati-text hover:text-bati-teal hover:underline"
          >
            {info.getValue()}
          </button>
        ),
      }),
      columnHelper.accessor('category', {
        header: 'Catégorie',
        cell: (info) => info.getValue() ?? <span className="text-bati-muted">—</span>,
      }),
      columnHelper.accessor('unit', {
        header: 'Unité',
        cell: (info) => info.getValue() ?? <span className="text-bati-muted">—</span>,
      }),
      columnHelper.accessor('on_hand', {
        header: 'Stock',
        cell: (info) => {
          const v = info.getValue();
          const threshold = info.row.original.reorder_threshold;
          const low = threshold != null && v != null && v < threshold;
          return (
            <span
              className={`tabular-nums font-medium ${low ? 'text-bati-terra' : 'text-bati-text'}`}
            >
              {v != null ? Number(v).toLocaleString('fr-MA') : '—'}
              {low && (
                <span className="ml-1 text-[10px] uppercase font-bold tracking-wide">
                  bas
                </span>
              )}
            </span>
          );
        },
      }),
      columnHelper.accessor('average_price', {
        header: 'Prix moyen',
        cell: (info) => (
          <span className="tabular-nums">{formatMADPrecise(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor('default_supplier_id', {
        header: 'Fournisseur',
        cell: (info) => supplierName(info.getValue()),
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
            Archiver
          </button>
        ),
      }),
    ],
    [supplierName]
  );

  if (items.isError) {
    return (
      <EmptyState
        title="Erreur"
        description={items.error instanceof Error ? items.error.message : 'Erreur'}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90"
        >
          Nouvel article
        </button>
      </div>

      <DataTable
        data={merged}
        columns={columns}
        isLoading={items.isLoading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Rechercher un article…"
        empty={
          <EmptyState
            title="Aucun article"
            description="Créez vos premiers articles (ciment, sable, fer…) pour commencer à enregistrer achats et consommation."
            action={
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
              >
                Ajouter un article
              </button>
            }
          />
        }
      />

      {creating && (
        <ItemModal
          mode="create"
          suppliers={suppliers.data ?? []}
          onClose={() => setCreating(false)}
        />
      )}
      {editing && (
        <ItemModal
          mode="edit"
          item={editing}
          suppliers={suppliers.data ?? []}
          onClose={() => setEditing(null)}
        />
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Archiver cet article ?"
        description={
          confirmDelete && (
            <>
              <strong>{confirmDelete.name}</strong> n&apos;apparaîtra plus dans les
              listes. L&apos;historique reste préservé.
            </>
          )
        }
        confirmLabel="Archiver"
        destructive
        onConfirm={async () => {
          if (confirmDelete) await remove.mutateAsync(confirmDelete.id);
        }}
      />
    </div>
  );
}

interface ItemModalProps {
  mode: 'create' | 'edit';
  item?: ConsumablesItem;
  suppliers: Array<{ id: string; name: string }>;
  onClose: () => void;
}

function ItemModal({ mode, item, suppliers, onClose }: ItemModalProps) {
  const queryClient = useQueryClient();
  const form = useForm<ItemForm>({
    resolver: zodResolver(ItemSchema),
    defaultValues: {
      name: item?.name ?? '',
      category: item?.category ?? '',
      unit: item?.unit ?? '',
      default_supplier_id: item?.default_supplier_id ?? '',
      reorder_threshold: item?.reorder_threshold != null ? String(item.reorder_threshold) : '',
      has_expiry: item?.has_expiry ?? false,
      notes: item?.notes ?? '',
    },
  });

  const save = useMutation({
    mutationFn: (values: z.output<typeof ItemSchema>) => {
      const payload = {
        name: values.name,
        category: values.category || null,
        unit: values.unit || null,
        default_supplier_id: values.default_supplier_id || null,
        reorder_threshold: values.reorder_threshold
          ? Number(values.reorder_threshold)
          : null,
        has_expiry: values.has_expiry,
        notes: values.notes || null,
      };
      if (mode === 'create') {
        return createItem({ ...payload, average_price: 0 });
      }
      return updateItem(item!.id, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-on-hand'] });
      toast.success(mode === 'create' ? 'Article ajouté' : 'Article mis à jour');
      onClose();
    },
    onError: (err) => toast.fromError(err, "Échec de l'enregistrement"),
  });

  const onSubmit = form.handleSubmit((v) => save.mutate(ItemSchema.parse(v)));

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={mode === 'create' ? 'Nouvel article' : 'Modifier l\'article'}
      size="lg"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Nom <span className="text-bati-terra">*</span>
          </label>
          <input type="text" className="bati-input" {...form.register('name')} autoFocus />
          {form.formState.errors.name && (
            <p className="text-xs text-bati-terra mt-1" role="alert">
              {form.formState.errors.name.message}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Catégorie
            </label>
            <input type="text" className="bati-input" {...form.register('category')} placeholder="Ex : ciment, fer" />
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Unité
            </label>
            <input type="text" className="bati-input" {...form.register('unit')} placeholder="Ex : sac, kg, m³" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Fournisseur par défaut
            </label>
            <select className="bati-input" {...form.register('default_supplier_id')}>
              <option value="">— Aucun —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Seuil de réapprovisionnement
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="bati-input"
              {...form.register('reorder_threshold')}
            />
          </div>
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...form.register('has_expiry')} />
            Date de péremption à suivre
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
            {save.isPending ? 'Enregistrement…' : mode === 'create' ? 'Ajouter' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
