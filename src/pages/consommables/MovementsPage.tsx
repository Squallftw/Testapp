import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ADJUSTMENT_CATEGORY_LABEL,
  createAdjustment,
  createTransfer,
  listAdjustments,
  listItems,
  listTransfers,
  type Adjustment,
  type AdjustmentCategory,
  type Transfer,
} from '@/data/consumables';
import { listChantiers } from '@/data/chantiers';
import { useOrg } from '@/contexts/OrgContext';
import { Modal } from '@/components/ui/Modal';
import { toast } from '@/components/ui/Toast';
import { formatDateShort } from '@/lib/format';

const TransferSchema = z
  .object({
    item_id: z.string().uuid('Article requis'),
    qty: z.coerce.number().positive('Quantité > 0'),
    from_chantier_id: z.string(),
    to_chantier_id: z.string(),
    transferred_at: z.string().min(1, 'Date requise'),
    notes: z.string().trim(),
  })
  .refine(
    (d) => d.from_chantier_id !== d.to_chantier_id,
    {
      path: ['to_chantier_id'],
      message: 'Source et destination doivent être différentes',
    }
  )
  .refine((d) => d.from_chantier_id !== '' || d.to_chantier_id !== '', {
    path: ['from_chantier_id'],
    message: 'Choisissez au moins une origine ou une destination',
  });

type TransferForm = z.input<typeof TransferSchema>;

const AdjustSchema = z.object({
  item_id: z.string().uuid('Article requis'),
  qty: z.coerce.number().positive('Quantité > 0'),
  type: z.enum(['loss', 'theft', 'damage', 'correction']),
  adjusted_at: z.string().min(1, 'Date requise'),
  notes: z.string().trim(),
});
type AdjustForm = z.input<typeof AdjustSchema>;

export default function MovementsPage() {
  const { activeOrg } = useOrg();
  const [tab, setTab] = useState<'transfers' | 'adjustments'>('transfers');
  const [transferOpen, setTransferOpen] = useState(false);
  const [adjustOpen, setAdjustOpen] = useState(false);

  const transfers = useQuery({
    queryKey: ['transfers', activeOrg?.id],
    queryFn: () => listTransfers(),
    enabled: !!activeOrg,
  });
  const adjustments = useQuery({
    queryKey: ['adjustments', activeOrg?.id],
    queryFn: () => listAdjustments(),
    enabled: !!activeOrg,
  });
  const items = useQuery({
    queryKey: ['items', activeOrg?.id],
    queryFn: () => listItems(),
    enabled: !!activeOrg,
  });
  const chantiers = useQuery({
    queryKey: ['chantiers', activeOrg?.id],
    queryFn: () => listChantiers(),
    enabled: !!activeOrg,
  });

  const itemName = useMemo(() => {
    const m = new Map((items.data ?? []).map((i) => [i.id, i.name]));
    return (id: string) => m.get(id) ?? '—';
  }, [items.data]);
  const chantierName = useMemo(() => {
    const m = new Map((chantiers.data ?? []).map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? '—') : 'Dépôt');
  }, [chantiers.data]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <TabButton active={tab === 'transfers'} onClick={() => setTab('transfers')}>
            Transferts
          </TabButton>
          <TabButton active={tab === 'adjustments'} onClick={() => setTab('adjustments')}>
            Ajustements
          </TabButton>
        </div>
        <button
          type="button"
          onClick={() => (tab === 'transfers' ? setTransferOpen(true) : setAdjustOpen(true))}
          className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90"
        >
          {tab === 'transfers' ? 'Nouveau transfert' : 'Nouvel ajustement'}
        </button>
      </div>

      {tab === 'transfers' ? (
        <SimpleTable
          rows={transfers.data ?? []}
          isLoading={transfers.isLoading}
          emptyLabel="Aucun transfert"
          columns={[
            { key: 'date', label: 'Date', render: (r: Transfer) => formatDateShort(r.transferred_at) },
            { key: 'item', label: 'Article', render: (r: Transfer) => itemName(r.item_id) },
            { key: 'qty', label: 'Qté', render: (r: Transfer) => Number(r.qty).toLocaleString('fr-MA') },
            { key: 'from', label: 'Origine', render: (r: Transfer) => chantierName(r.from_chantier_id) },
            { key: 'to', label: 'Destination', render: (r: Transfer) => chantierName(r.to_chantier_id) },
          ]}
        />
      ) : (
        <SimpleTable
          rows={adjustments.data ?? []}
          isLoading={adjustments.isLoading}
          emptyLabel="Aucun ajustement"
          columns={[
            { key: 'date', label: 'Date', render: (r: Adjustment) => formatDateShort(r.adjusted_at) },
            { key: 'item', label: 'Article', render: (r: Adjustment) => itemName(r.item_id) },
            { key: 'qty', label: 'Qté', render: (r: Adjustment) => Number(r.qty).toLocaleString('fr-MA') },
            { key: 'type', label: 'Type', render: (r: Adjustment) => ADJUSTMENT_CATEGORY_LABEL[r.type] },
          ]}
        />
      )}

      {transferOpen && (
        <TransferModal
          items={items.data ?? []}
          chantiers={chantiers.data ?? []}
          onClose={() => setTransferOpen(false)}
        />
      )}
      {adjustOpen && (
        <AdjustModal items={items.data ?? []} onClose={() => setAdjustOpen(false)} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        active
          ? 'bg-bati-teal text-white'
          : 'bg-bati-card border border-bati-border text-bati-muted hover:bg-bati-border-soft'
      }`}
    >
      {children}
    </button>
  );
}

interface SimpleTableProps<T> {
  rows: T[];
  isLoading: boolean;
  emptyLabel: string;
  columns: Array<{ key: string; label: string; render: (r: T) => React.ReactNode }>;
}

function SimpleTable<T extends { id: string }>({
  rows,
  isLoading,
  emptyLabel,
  columns,
}: SimpleTableProps<T>) {
  if (isLoading) {
    return (
      <div className="bati-card rounded-lg p-8 text-center text-sm text-bati-muted">
        Chargement…
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="bati-card rounded-lg p-8 text-center text-sm text-bati-muted">
        {emptyLabel}
      </div>
    );
  }
  return (
    <div className="bati-card rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-bati-border-soft text-left text-xs uppercase tracking-wide text-bati-muted">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 font-semibold whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-bati-border-soft">
              {columns.map((c) => (
                <td key={c.key} className="px-3 py-2 whitespace-nowrap">
                  {c.render(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransferModal({
  items,
  chantiers,
  onClose,
}: {
  items: Array<{ id: string; name: string }>;
  chantiers: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const form = useForm<TransferForm>({
    resolver: zodResolver(TransferSchema),
    defaultValues: {
      item_id: '',
      qty: 0,
      from_chantier_id: '',
      to_chantier_id: '',
      transferred_at: today,
      notes: '',
    },
  });

  const save = useMutation({
    mutationFn: (v: z.output<typeof TransferSchema>) =>
      createTransfer({
        item_id: v.item_id,
        qty: v.qty,
        from_chantier_id: v.from_chantier_id || null,
        to_chantier_id: v.to_chantier_id || null,
        transferred_at: v.transferred_at,
        notes: v.notes || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transfers'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-on-hand'] });
      toast.success('Transfert enregistré');
      onClose();
    },
    onError: (err) => toast.fromError(err, 'Échec'),
  });

  const onSubmit = form.handleSubmit((v) => save.mutate(TransferSchema.parse(v)));

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Nouveau transfert" size="md">
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">Article</label>
          <select className="bati-input" {...form.register('item_id')}>
            <option value="">—</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          {form.formState.errors.item_id && (
            <p className="text-xs text-bati-terra mt-1">
              {form.formState.errors.item_id.message}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Origine
            </label>
            <select className="bati-input" {...form.register('from_chantier_id')}>
              <option value="">Dépôt</option>
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Destination
            </label>
            <select className="bati-input" {...form.register('to_chantier_id')}>
              <option value="">Dépôt</option>
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {form.formState.errors.to_chantier_id && (
              <p className="text-xs text-bati-terra mt-1">
                {form.formState.errors.to_chantier_id.message}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Quantité
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="bati-input"
              {...form.register('qty')}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">Date</label>
            <input type="date" className="bati-input" {...form.register('transferred_at')} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">Notes</label>
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
            {save.isPending ? '…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustModal({
  items,
  onClose,
}: {
  items: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const form = useForm<AdjustForm>({
    resolver: zodResolver(AdjustSchema),
    defaultValues: {
      item_id: '',
      qty: 0,
      type: 'correction',
      adjusted_at: today,
      notes: '',
    },
  });

  const save = useMutation({
    mutationFn: (v: z.output<typeof AdjustSchema>) =>
      createAdjustment({
        item_id: v.item_id,
        qty: v.qty,
        type: v.type as AdjustmentCategory,
        adjusted_at: v.adjusted_at,
        notes: v.notes || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['adjustments'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-on-hand'] });
      toast.success('Ajustement enregistré');
      onClose();
    },
    onError: (err) => toast.fromError(err, 'Échec'),
  });

  const onSubmit = form.handleSubmit((v) => save.mutate(AdjustSchema.parse(v)));

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title="Nouvel ajustement" size="md">
      <form onSubmit={onSubmit} className="space-y-3" noValidate>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">Article</label>
          <select className="bati-input" {...form.register('item_id')}>
            <option value="">—</option>
            {items.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">Type</label>
            <select className="bati-input" {...form.register('type')}>
              <option value="loss">Perte</option>
              <option value="theft">Vol</option>
              <option value="damage">Dégât</option>
              <option value="correction">Correction</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Quantité
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              className="bati-input"
              {...form.register('qty')}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">Date</label>
          <input type="date" className="bati-input" {...form.register('adjusted_at')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">Notes</label>
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
            {save.isPending ? '…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
