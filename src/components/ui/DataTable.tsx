import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState, type ReactNode } from 'react';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

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
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const searchControlled = typeof searchValue === 'string';

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter: searchValue ?? '' },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

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
                className="border-t border-bati-border-soft hover:bg-bati-border-soft/40 transition-colors"
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
  );
}
