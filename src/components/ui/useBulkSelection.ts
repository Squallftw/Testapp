import { useMemo, useState } from 'react';

/**
 * Selection state for hand-rolled tables that can't use DataTable's
 * built-in `bulkDelete` (e.g. tables with custom layouts, totals rows,
 * or non-standard interactions).
 *
 * Selection is keyed by id and survives data refetches as long as the
 * underlying row id stays stable.
 */
export function useBulkSelection<T extends { id: string }>(items: T[]) {
  const [ids, setIds] = useState<Set<string>>(new Set());

  const visibleIds = useMemo(() => new Set(items.map((i) => i.id)), [items]);
  const selectedItems = useMemo(
    () => items.filter((i) => ids.has(i.id)),
    [items, ids]
  );

  const allSelected = items.length > 0 && items.every((i) => ids.has(i.id));
  const someSelected = items.some((i) => ids.has(i.id));

  function toggle(id: string) {
    setIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setIds((prev) => {
      if (allSelected) {
        // Deselect only the visible rows (preserve any selection on rows
        // hidden by filters — not relevant today but future-proofs us).
        const next = new Set(prev);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  }

  function clear() {
    setIds(new Set());
  }

  return {
    selected: selectedItems,
    selectedCount: selectedItems.length,
    isSelected: (id: string) => ids.has(id),
    toggle,
    toggleAll,
    clear,
    allSelected,
    someSelected,
  };
}
