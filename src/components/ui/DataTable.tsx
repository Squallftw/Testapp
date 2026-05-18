import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { useMemo, useState, type ReactNode } from 'react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';
import { ConfirmDialog } from './ConfirmDialog';
import { Button } from './Button';
import { toast } from './Toast';

export interface BulkDeleteConfig<TData> {
  /** Called with the full selected rows. Should throw on failure. */
  onConfirm: (selected: TData[]) => Promise<void>;
  /** Dynamic title given the count. e.g. `(n) => `Supprimer ${n} ouvrier(s) ?` ` */
  confirmTitle: (count: number) => string;
  /** Optional dynamic description (defaults to a generic line). */
  confirmDescription?: (count: number) => ReactNode;
  /** Label of the destructive button in the action bar. Defaults to "Supprimer". */
  actionLabel?: string;
  /** Toast text on success. Defaults to `${n} élément(s) supprimé(s)`. */
  successMessage?: (count: number) => string;
}

export interface DataTableProps<TData> {
  data: TData[];
  // `any` here is intentional — TanStack Table's ColumnDef is invariant in
  // the value-type generic, so typed columns from createColumnHelper<TData>()
  // do not assign to ColumnDef<TData, unknown>[]. Call sites stay strictly
  // typed; this wrapper just relays them through.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[];
  isLoading?: boolean;
  /** Rendered when data is empty after loading. */
  empty?: ReactNode;
  /** Global search across all columns. Pass to enable a search input. */
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Tailwind class for the wrapper. Defaults to bati-card. */
  className?: string;
  /** Pass to enable a checkbox column + bulk-delete action bar. */
  bulkDelete?: BulkDeleteConfig<TData>;
  /**
   * Stable row id (defaults to `row.id`). Required when bulk-delete is on
   * so the selection survives filtering / sorting / data refetches.
   */
  getRowId?: (row: TData) => string;
}

export function DataTable<TData>({
  data,
  columns,
  isLoading = false,
  empty,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Rechercher…',
  className = '',
  bulkDelete,
  getRowId,
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [confirming, setConfirming] = useState(false);
  const searchControlled = typeof searchValue === 'string';

  const tableColumns = useMemo<ColumnDef<TData, unknown>[]>(() => {
    if (!bulkDelete) return columns;
    const checkboxCol: ColumnDef<TData, unknown> = {
      id: '__select',
      enableSorting: false,
      size: 32,
      header: ({ table }) => (
        <input
          type="checkbox"
          aria-label="Tout sélectionner"
          className="accent-bati-teal cursor-pointer"
          checked={table.getIsAllRowsSelected()}
          ref={(el) => {
            if (el) el.indeterminate = table.getIsSomeRowsSelected();
          }}
          onChange={table.getToggleAllRowsSelectedHandler()}
        />
      ),
      cell: ({ row }) => (
        <input
          type="checkbox"
          aria-label="Sélectionner la ligne"
          className="accent-bati-teal cursor-pointer"
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
        />
      ),
    };
    return [checkboxCol, ...columns];
  }, [bulkDelete, columns]);

  const table = useReactTable({
    data,
    columns: tableColumns,
    state: {
      sorting,
      globalFilter: searchValue ?? '',
      rowSelection,
    },
    enableRowSelection: !!bulkDelete,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: bulkDelete
      ? (row) =>
          getRowId
            ? getRowId(row)
            : ((row as { id?: string }).id ?? JSON.stringify(row))
      : undefined,
  });

  const selectedRows = table.getSelectedRowModel().rows;
  const selectedCount = selectedRows.length;

  async function handleConfirmedDelete() {
    if (!bulkDelete) return;
    const items = selectedRows.map((r) => r.original);
    try {
      await bulkDelete.onConfirm(items);
      toast.success(
        bulkDelete.successMessage
          ? bulkDelete.successMessage(items.length)
          : `${items.length} élément(s) supprimé(s)`
      );
      setRowSelection({});
      // ConfirmDialog auto-closes on a resolved promise; nothing else to do.
    } catch (err) {
      toast.fromError(err, 'Échec de la suppression');
      throw err; // keep the ConfirmDialog open so the user can retry.
    }
  }

  if (isLoading) {
    return (
      <div className={`bati-card rounded-lg p-6 ${className}`}>
        <Skeleton rows={5} className="h-6" />
      </div>
    );
  }

  if (data.length === 0 && empty) {
    return <>{empty}</>;
  }

  if (data.length === 0) {
    return (
      <EmptyState title="Aucun résultat" description="Aucune donnée à afficher." />
    );
  }

  return (
    <>
      {bulkDelete && selectedCount > 0 && (
        <div className="sticky top-0 z-10 bati-card rounded-lg p-3 mb-2 border-bati-teal/40 flex items-center justify-between gap-3 shadow-sm">
          <div className="text-sm font-medium text-bati-text">
            {selectedCount} sélectionné{selectedCount > 1 ? 's' : ''}
          </div>
          <div className="flex items-center gap-2">
            <Button size="xs" variant="ghost" onClick={() => setRowSelection({})}>
              Tout désélectionner
            </Button>
            <Button
              size="xs"
              variant="destructive"
              onClick={() => setConfirming(true)}
            >
              {bulkDelete.actionLabel ?? 'Supprimer'} ({selectedCount})
            </Button>
          </div>
        </div>
      )}

      <div className={`bati-card rounded-lg overflow-hidden ${className}`}>
        {searchControlled && (
          <div className="p-3 border-b border-bati-border-soft">
            <input
              type="search"
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={searchPlaceholder}
              className="bati-input"
            />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-bati-border-soft text-left text-xs uppercase tracking-wide text-bati-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        className="px-3 py-2 font-semibold whitespace-nowrap"
                      >
                        {canSort ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className="flex items-center gap-1 hover:text-bati-text"
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                            {sorted === 'asc' && <span aria-hidden>↑</span>}
                            {sorted === 'desc' && <span aria-hidden>↓</span>}
                          </button>
                        ) : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-t border-bati-border-soft transition-colors ${
                    row.getIsSelected()
                      ? 'bg-bati-teal-soft/30'
                      : 'hover:bg-bati-border-soft/40'
                  }`}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-2 whitespace-nowrap">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {bulkDelete && (
        <ConfirmDialog
          open={confirming}
          onOpenChange={setConfirming}
          title={bulkDelete.confirmTitle(selectedCount)}
          description={
            bulkDelete.confirmDescription
              ? bulkDelete.confirmDescription(selectedCount)
              : `Cette action archivera ${selectedCount} élément(s). Vous pourrez les retrouver en base si besoin.`
          }
          confirmLabel="Supprimer"
          destructive
          onConfirm={handleConfirmedDelete}
        />
      )}
    </>
  );
}
