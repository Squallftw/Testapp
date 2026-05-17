import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createColumnHelper } from '@tanstack/react-table';
import {
  createPurchase,
  listPurchases,
  PAYMENT_STATUS_LABEL,
  softDeletePurchase,
  type Purchase,
  type PurchasePaymentState,
} from '@/data/consumables';
import { listSuppliers } from '@/data/suppliers';
import { listChantiers } from '@/data/chantiers';
import { listItems } from '@/data/consumables';
import { useOrg } from '@/contexts/OrgContext';
import { DataTable } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/Toast';
import { formatMAD, formatDateShort } from '@/lib/format';

const LineSchema = z.object({
  item_id: z.string().uuid('Article requis'),
  qty: z.coerce.number().positive('Quantité > 0'),
  unit_price: z.coerce.number().min(0, '≥ 0'),
});

const PurchaseSchema = z.object({
  purchased_at: z.string().min(1, 'Date requise'),
  supplier_id: z.string(),
  chantier_id: z.string(),
  invoice_ref: z.string().trim(),
  payment_status: z.enum(['paid', 'pending', 'partial']),
  notes: z.string().trim(),
  lines: z.array(LineSchema).min(1, 'Au moins une ligne'),
});

type PurchaseForm = z.input<typeof PurchaseSchema>;

const columnHelper = createColumnHelper<Purchase>();

export default function PurchasesPage() {
  const { activeOrg } = useOrg();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Purchase | null>(null);

  const purchases = useQuery({
    queryKey: ['purchases', activeOrg?.id],
    queryFn: () => listPurchases(),
    enabled: !!activeOrg,
  });
  const suppliers = useQuery({
    queryKey: ['suppliers', activeOrg?.id],
    queryFn: () => listSuppliers(),
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

  const supplierName = useMemo(() => {
    const m = new Map((suppliers.data ?? []).map((s) => [s.id, s.name]));
    return (id: string | null) => (id ? (m.get(id) ?? '—') : 'Direct');
  }, [suppliers.data]);

  const chantierName = useMemo(() => {
    const m = new Map((chantiers.data ?? []).map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (m.get(id) ?? '—') : 'Dépôt');
  }, [chantiers.data]);

  const remove = useMutation({
    mutationFn: (id: string) => softDeletePurchase(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['purchases'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-on-hand'] });
      toast.success('Achat supprimé');
    },
    onError: (err) => toast.fromError(err, 'Échec de la suppression'),
  });

  const columns = useMemo(
    () => [
      columnHelper.accessor('purchased_at', {
        header: 'Date',
        cell: (info) => (
          <span className="text-bati-muted text-xs">{formatDateShort(info.getValue())}</span>
        ),
      }),
      columnHelper.accessor('supplier_id', {
        header: 'Fournisseur',
        cell: (info) => supplierName(info.getValue()),
      }),
      columnHelper.accessor('chantier_id', {
        header: 'Destination',
        cell: (info) => chantierName(info.getValue()),
      }),
      columnHelper.accessor('invoice_ref', {
        header: 'Facture',
        cell: (info) => info.getValue() ?? <span className="text-bati-muted">—</span>,
      }),
      columnHelper.accessor('payment_status', {
        header: 'Paiement',
        cell: (info) => {
          const s = info.getValue();
          const cls =
            s === 'paid'
              ? 'text-bati-success'
              : s === 'partial'
                ? 'text-bati-ochre'
                : 'text-bati-terra';
          return (
            <span className={`text-xs font-medium ${cls}`}>
              {PAYMENT_STATUS_LABEL[s]}
            </span>
          );
        },
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
    [supplierName, chantierName]
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium hover:opacity-90"
        >
          Nouveau bon d&apos;achat
        </button>
      </div>

      <DataTable
        data={purchases.data ?? []}
        columns={columns}
        isLoading={purchases.isLoading}
        empty={
          <EmptyState
            title="Aucun achat"
            description="Enregistrez vos bons d'achat pour suivre les coûts et le stock."
            action={
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
              >
                Nouveau bon d&apos;achat
              </button>
            }
          />
        }
      />

      {creating && (
        <PurchaseModal
          suppliers={suppliers.data ?? []}
          chantiers={chantiers.data ?? []}
          items={items.data ?? []}
          onClose={() => setCreating(false)}
        />
      )}
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title="Supprimer cet achat ?"
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

interface PurchaseModalProps {
  suppliers: Array<{ id: string; name: string }>;
  chantiers: Array<{ id: string; name: string }>;
  items: Array<{ id: string; name: string; unit: string | null; average_price: number }>;
  onClose: () => void;
}

function PurchaseModal({ suppliers, chantiers, items, onClose }: PurchaseModalProps) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const form = useForm<PurchaseForm>({
    resolver: zodResolver(PurchaseSchema),
    defaultValues: {
      purchased_at: today,
      supplier_id: '',
      chantier_id: '',
      invoice_ref: '',
      payment_status: 'pending',
      notes: '',
      lines: [{ item_id: '', qty: 0, unit_price: 0 }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'lines' });
  const watchedLines = form.watch('lines');
  const total = useMemo(
    () =>
      watchedLines.reduce(
        (s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0),
        0
      ),
    [watchedLines]
  );

  const save = useMutation({
    mutationFn: (v: z.output<typeof PurchaseSchema>) =>
      createPurchase({
        purchased_at: v.purchased_at,
        supplier_id: v.supplier_id || null,
        chantier_id: v.chantier_id || null,
        invoice_ref: v.invoice_ref || null,
        payment_status: v.payment_status as PurchasePaymentState,
        notes: v.notes || null,
        lines: v.lines.map((l) => ({
          item_id: l.item_id,
          qty: l.qty,
          unit_price: l.unit_price,
          total: l.qty * l.unit_price,
        })),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['purchases'] });
      await queryClient.invalidateQueries({ queryKey: ['stock-on-hand'] });
      await queryClient.invalidateQueries({ queryKey: ['items'] });
      toast.success('Achat enregistré');
      onClose();
    },
    onError: (err) => toast.fromError(err, "Échec de l'enregistrement"),
  });

  const onSubmit = form.handleSubmit((v) => save.mutate(PurchaseSchema.parse(v)));

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Nouveau bon d'achat"
      size="2xl"
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Date <span className="text-bati-terra">*</span>
            </label>
            <input
              type="date"
              className="bati-input"
              {...form.register('purchased_at')}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Fournisseur
            </label>
            <select className="bati-input" {...form.register('supplier_id')}>
              <option value="">— Direct —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Destination
            </label>
            <select className="bati-input" {...form.register('chantier_id')}>
              <option value="">— Dépôt central —</option>
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Référence facture
            </label>
            <input type="text" className="bati-input" {...form.register('invoice_ref')} />
          </div>
          <div>
            <label className="block text-xs font-medium text-bati-muted mb-1">
              Paiement
            </label>
            <select className="bati-input" {...form.register('payment_status')}>
              <option value="pending">À payer</option>
              <option value="partial">Partiel</option>
              <option value="paid">Payé</option>
            </select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-bati-muted">Lignes</label>
            <button
              type="button"
              onClick={() => append({ item_id: '', qty: 0, unit_price: 0 })}
              className="text-xs text-bati-teal hover:underline"
            >
              + Ajouter une ligne
            </button>
          </div>
          <div className="space-y-2">
            {fields.map((field, idx) => (
              <div
                key={field.id}
                className="grid grid-cols-12 gap-2 items-start p-2 border border-bati-border-soft rounded-md"
              >
                <select
                  className="bati-input col-span-5"
                  {...form.register(`lines.${idx}.item_id`)}
                >
                  <option value="">— Article —</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name} {it.unit ? `(${it.unit})` : ''}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Qté"
                  className="bati-input col-span-2"
                  {...form.register(`lines.${idx}.qty`)}
                />
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="Prix unitaire"
                  className="bati-input col-span-3"
                  {...form.register(`lines.${idx}.unit_price`)}
                />
                <div className="col-span-1 text-xs text-bati-muted text-right pt-2 tabular-nums">
                  {formatMAD(
                    (Number(watchedLines[idx]?.qty) || 0) *
                      (Number(watchedLines[idx]?.unit_price) || 0)
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(idx)}
                  disabled={fields.length === 1}
                  aria-label="Supprimer la ligne"
                  className="col-span-1 text-bati-terra hover:opacity-70 disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {form.formState.errors.lines && (
            <p className="text-xs text-bati-terra mt-1" role="alert">
              {form.formState.errors.lines.message ??
                'Vérifiez les lignes (article, quantité > 0).'}
            </p>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-bati-muted mb-1">
            Notes
          </label>
          <textarea className="bati-input" rows={2} {...form.register('notes')} />
        </div>

        <div className="flex items-center justify-between pt-2">
          <div className="text-sm">
            <span className="text-bati-muted">Total :</span>{' '}
            <span className="font-bold text-bati-text tabular-nums">{formatMAD(total)}</span>
          </div>
          <div className="flex gap-2">
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
        </div>
      </form>
    </Modal>
  );
}
