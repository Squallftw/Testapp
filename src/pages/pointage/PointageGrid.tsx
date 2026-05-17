import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';
import type { Worker } from '@/data/workers';
import { hueToColor } from '@/data/workers';
import {
  bulkUpsertAttendance,
  deleteAttendance,
  upsertAttendance,
  type Attendance,
  type AttendanceStatus,
  type UpsertAttendanceInput,
} from '@/data/attendance';
import { toast } from '@/components/ui/Toast';
import { PointagePopover } from './PointagePopover';

interface PointageGridProps {
  chantierId: string;
  workers: Worker[];
  days: Date[];
  attendance: Attendance[];
  isLoading: boolean;
  queryKey: QueryKey;
  isWeekend: (d: Date) => boolean;
}

const STATUS_LABEL: Record<AttendanceStatus, string> = { P: 'P', A: 'A' };

// `${workerId}|${yyyy-MM-dd}`
type CellKey = string;
type CellRef = { worker: string; date: string };

interface Selection {
  anchor: CellRef | null;
  cells: Set<CellKey>;
}

const EMPTY_SELECTION: Selection = { anchor: null, cells: new Set() };

export function PointageGrid({
  chantierId,
  workers,
  days,
  attendance,
  isLoading,
  queryKey,
  isWeekend,
}: PointageGridProps) {
  const queryClient = useQueryClient();
  const [popover, setPopover] = useState<{
    workerId: string;
    date: string;
    cell: Attendance | undefined;
  } | null>(null);
  const [selection, setSelection] = useState<Selection>(EMPTY_SELECTION);

  // Map keyed by `${worker_id}|${attendance_date}` for O(1) cell lookup
  const cellIndex = useMemo(() => {
    const m = new Map<string, Attendance>();
    for (const a of attendance) m.set(`${a.worker_id}|${a.attendance_date}`, a);
    return m;
  }, [attendance]);

  const dayKeys = useMemo(() => days.map((d) => format(d, 'yyyy-MM-dd')), [days]);
  const workerIdToIdx = useMemo(() => {
    const m = new Map<string, number>();
    workers.forEach((w, i) => m.set(w.id, i));
    return m;
  }, [workers]);
  const dateToIdx = useMemo(() => {
    const m = new Map<string, number>();
    dayKeys.forEach((k, i) => m.set(k, i));
    return m;
  }, [dayKeys]);

  // Rectangle of cell keys from anchor → focus, inclusive.
  const rectangle = useCallback(
    (anchor: CellRef, focus: CellRef): Set<CellKey> => {
      const ai = workerIdToIdx.get(anchor.worker);
      const fi = workerIdToIdx.get(focus.worker);
      const aj = dateToIdx.get(anchor.date);
      const fj = dateToIdx.get(focus.date);
      const out = new Set<CellKey>();
      if (ai === undefined || fi === undefined || aj === undefined || fj === undefined) {
        return out;
      }
      const [w0, w1] = ai <= fi ? [ai, fi] : [fi, ai];
      const [d0, d1] = aj <= fj ? [aj, fj] : [fj, aj];
      for (let i = w0; i <= w1; i++) {
        for (let j = d0; j <= d1; j++) {
          const wid = workers[i]!.id;
          const dkey = dayKeys[j]!;
          out.add(`${wid}|${dkey}`);
        }
      }
      return out;
    },
    [workerIdToIdx, dateToIdx, workers, dayKeys]
  );

  const upsert = useMutation({
    mutationFn: upsertAttendance,
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Attendance[]>(queryKey);
      queryClient.setQueryData<Attendance[]>(queryKey, (old) => {
        const arr = old ? [...old] : [];
        const idx = arr.findIndex(
          (a) =>
            a.worker_id === input.worker_id &&
            a.attendance_date === input.attendance_date
        );
        const optimistic: Attendance = {
          id: idx >= 0 ? arr[idx]!.id : `optimistic-${Date.now()}`,
          org_id: idx >= 0 ? arr[idx]!.org_id : '',
          chantier_id: input.chantier_id,
          worker_id: input.worker_id,
          attendance_date: input.attendance_date,
          status: input.status,
          absence_reason: input.absence_reason ?? null,
          prime_amount: input.prime_amount ?? 0,
          prime_motif: input.prime_motif ?? null,
          note: input.note ?? null,
          recorded_by: null,
          created_at: idx >= 0 ? arr[idx]!.created_at : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (idx >= 0) arr[idx] = optimistic;
        else arr.push(optimistic);
        return arr;
      });
      return { previous };
    },
    onError: (err, _input, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
      toast.fromError(err, 'Échec de la mise à jour');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const remove = useMutation({
    mutationFn: deleteAttendance,
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Attendance[]>(queryKey);
      queryClient.setQueryData<Attendance[]>(queryKey, (old) =>
        (old ?? []).filter((a) => a.id !== id)
      );
      return { previous };
    },
    onError: (err, _id, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKey, ctx.previous);
      toast.fromError(err, 'Échec de la suppression');
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  // Bulk apply across the current selection. Preserves prime_amount / note /
  // absence_reason on cells that already exist — otherwise mass-marking P
  // would silently wipe primes.
  const bulkApply = useMutation({
    mutationFn: async (action: 'P' | 'A' | 'delete') => {
      const keys = Array.from(selection.cells);
      if (action === 'delete') {
        const ids: string[] = [];
        for (const key of keys) {
          const c = cellIndex.get(key);
          if (c && !c.id.startsWith('optimistic-')) ids.push(c.id);
        }
        if (ids.length === 0) return { count: 0 };
        await Promise.all(ids.map((id) => deleteAttendance(id)));
        return { count: ids.length };
      }
      const inputs: UpsertAttendanceInput[] = keys.map((key) => {
        const [worker_id, attendance_date] = key.split('|') as [string, string];
        const existing = cellIndex.get(key);
        return {
          chantier_id: chantierId,
          worker_id,
          attendance_date,
          status: action,
          // Preserve prime + note across mass-apply.
          prime_amount: existing ? Number(existing.prime_amount) || 0 : 0,
          prime_motif: existing?.prime_motif ?? null,
          // For A, keep any existing reason; for P, clear it.
          absence_reason: action === 'A' ? (existing?.absence_reason ?? null) : null,
          note: existing?.note ?? null,
        };
      });
      await bulkUpsertAttendance(inputs);
      return { count: inputs.length };
    },
    onSuccess: ({ count }) => {
      void queryClient.invalidateQueries({ queryKey });
      setSelection(EMPTY_SELECTION);
      toast.success(`${count} cellule${count > 1 ? 's' : ''} mise${count > 1 ? 's' : ''} à jour`);
    },
    onError: (err) => toast.fromError(err, "Échec de l'application en masse"),
  });

  // Single-click toggle preserved from the previous behaviour. Called only
  // when a pointerdown ended in a click (no drag).
  function toggleCell(workerId: string, dateStr: string) {
    const cell = cellIndex.get(`${workerId}|${dateStr}`);
    if (!cell) {
      upsert.mutate({
        chantier_id: chantierId,
        worker_id: workerId,
        attendance_date: dateStr,
        status: 'P',
      });
    } else if (cell.status === 'P') {
      upsert.mutate({
        chantier_id: chantierId,
        worker_id: workerId,
        attendance_date: dateStr,
        status: 'A',
        prime_amount: Number(cell.prime_amount) || 0,
        prime_motif: cell.prime_motif,
        absence_reason: cell.absence_reason,
        note: cell.note,
      });
    } else {
      if (!cell.id.startsWith('optimistic-')) remove.mutate(cell.id);
    }
  }

  // ── drag-select wiring ────────────────────────────────────────────────
  const dragRef = useRef<{
    anchor: CellRef;
    startX: number;
    startY: number;
    active: boolean;
  } | null>(null);

  function startCellPointer(
    e: React.PointerEvent<HTMLElement>,
    workerId: string,
    dateStr: string
  ) {
    if (e.button !== 0) return;
    // Shift-click extends from the anchor of the current selection — no drag.
    if (e.shiftKey && selection.anchor) {
      e.preventDefault();
      const focus: CellRef = { worker: workerId, date: dateStr };
      setSelection({
        anchor: selection.anchor,
        cells: rectangle(selection.anchor, focus),
      });
      return;
    }

    const anchor: CellRef = { worker: workerId, date: dateStr };
    dragRef.current = {
      anchor,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
    };

    function onMove(ev: PointerEvent) {
      const state = dragRef.current;
      if (!state) return;
      const dx = ev.clientX - state.startX;
      const dy = ev.clientY - state.startY;
      if (!state.active && Math.hypot(dx, dy) > 3) {
        state.active = true;
      }
      if (state.active) {
        const el = document.elementFromPoint(ev.clientX, ev.clientY);
        const cellEl = el?.closest<HTMLElement>('[data-cell-key]');
        if (!cellEl?.dataset.cellKey) return;
        const [worker, date] = cellEl.dataset.cellKey.split('|') as [string, string];
        const focus: CellRef = { worker, date };
        setSelection({
          anchor: state.anchor,
          cells: rectangle(state.anchor, focus),
        });
      }
    }

    function onUp() {
      const state = dragRef.current;
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
      dragRef.current = null;
      if (!state) return;
      if (!state.active) {
        // No movement → single-cell click. Clear selection and toggle.
        setSelection(EMPTY_SELECTION);
        toggleCell(state.anchor.worker, state.anchor.date);
      }
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  // ── header-click row/column selection ─────────────────────────────────
  function selectRow(workerId: string) {
    const cells = new Set<CellKey>();
    for (const dkey of dayKeys) cells.add(`${workerId}|${dkey}`);
    setSelection({ anchor: { worker: workerId, date: dayKeys[0] ?? '' }, cells });
  }
  function selectColumn(dateStr: string) {
    const cells = new Set<CellKey>();
    for (const w of workers) cells.add(`${w.id}|${dateStr}`);
    setSelection({ anchor: { worker: workers[0]?.id ?? '', date: dateStr }, cells });
  }

  // ── keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    if (selection.cells.size === 0) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelection(EMPTY_SELECTION);
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        bulkApply.mutate('P');
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        bulkApply.mutate('A');
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        bulkApply.mutate('delete');
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection.cells.size, bulkApply]);

  function handleDetailContextMenu(e: React.MouseEvent, workerId: string, day: Date) {
    e.preventDefault();
    const dateStr = format(day, 'yyyy-MM-dd');
    setPopover({
      workerId,
      date: dateStr,
      cell: cellIndex.get(`${workerId}|${dateStr}`),
    });
  }

  if (isLoading) {
    return (
      <div className="bati-card rounded-lg p-8 text-center text-bati-muted text-sm">
        Chargement de la grille…
      </div>
    );
  }

  const selCount = selection.cells.size;

  return (
    <>
      <div className="bati-card rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="bati-grid w-full text-xs select-none">
            <thead>
              <tr className="bg-bati-border-soft">
                <th className="bati-sticky-l px-3 py-2 text-left font-semibold text-bati-muted whitespace-nowrap min-w-[180px]">
                  Ouvrier
                </th>
                {days.map((d, j) => {
                  const we = isWeekend(d);
                  const dateStr = dayKeys[j]!;
                  return (
                    <th
                      key={d.toISOString()}
                      className={`px-1 py-1 text-center font-medium whitespace-nowrap ${
                        we ? 'text-bati-muted/50' : 'text-bati-muted'
                      }`}
                      title={format(d, 'EEEE d MMMM', { locale: fr })}
                    >
                      <button
                        type="button"
                        onClick={() => selectColumn(dateStr)}
                        className="px-1 py-0.5 rounded hover:bg-bati-card hover:text-bati-text transition-colors"
                        title="Cliquer pour sélectionner toute la colonne"
                      >
                        <div>{format(d, 'd')}</div>
                        <div className="text-[10px] uppercase">
                          {format(d, 'EE', { locale: fr })}
                        </div>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {workers.map((w) => (
                <tr key={w.id}>
                  <td className="bati-sticky-l px-1 py-2 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => selectRow(w.id)}
                      className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-bati-border-soft transition-colors"
                      title="Cliquer pour sélectionner toute la ligne"
                    >
                      <div
                        className="w-1.5 h-5 rounded-sm flex-shrink-0"
                        style={{ background: hueToColor(w.hue) }}
                        aria-hidden
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-bati-text truncate">
                          {w.full_name}
                        </div>
                        {w.role && (
                          <div className="text-[10px] text-bati-muted truncate">
                            {w.role}
                          </div>
                        )}
                      </div>
                    </button>
                  </td>
                  {days.map((d, j) => {
                    const we = isWeekend(d);
                    const dateStr = dayKeys[j]!;
                    const cellKey = `${w.id}|${dateStr}`;
                    const cell = cellIndex.get(cellKey);
                    const isSelected = selection.cells.has(cellKey);
                    return (
                      <td
                        key={dateStr}
                        data-cell-key={cellKey}
                        className={`relative p-0 text-center ${
                          we ? 'bg-bati-border-soft/30' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onPointerDown={(e) => startCellPointer(e, w.id, dateStr)}
                          onContextMenu={(e) => handleDetailContextMenu(e, w.id, d)}
                          className={`w-full h-9 transition-colors group ${
                            cell?.status === 'P'
                              ? 'bg-bati-teal-soft hover:opacity-80'
                              : cell?.status === 'A'
                                ? 'bg-bati-terra-soft hover:opacity-80'
                                : 'hover:bg-bati-border-soft'
                          }`}
                          title={
                            cell
                              ? `${STATUS_LABEL[cell.status]}${
                                  Number(cell.prime_amount) > 0
                                    ? ` · prime ${cell.prime_amount} MAD`
                                    : ''
                                }`
                              : 'Cliquer pour pointer P'
                          }
                        >
                          {cell?.status === 'P' && (
                            <span className="font-bold text-bati-teal text-sm">P</span>
                          )}
                          {cell?.status === 'A' && (
                            <span className="font-bold text-bati-terra text-sm">A</span>
                          )}
                          {cell && Number(cell.prime_amount) > 0 && (
                            <span
                              className="absolute top-0 right-0 w-1.5 h-1.5 bg-bati-ochre rounded-bl"
                              aria-label="Prime"
                            />
                          )}
                        </button>
                        {isSelected && (
                          <div
                            className="absolute inset-0 ring-2 ring-inset ring-bati-teal pointer-events-none"
                            aria-hidden
                          />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-3 py-2 border-t border-bati-border-soft text-xs text-bati-muted">
          Clic = P / A / vide · Clic droit (ou maintenir) pour les détails · Glissez pour
          sélectionner plusieurs cellules · Cliquez sur un nom ou un jour pour sélectionner
          une ligne / colonne entière.
        </div>
      </div>

      {selCount > 0 && (
        <SelectionToolbar
          count={selCount}
          pending={bulkApply.isPending}
          onMarkP={() => bulkApply.mutate('P')}
          onMarkA={() => bulkApply.mutate('A')}
          onClear={() => bulkApply.mutate('delete')}
          onCancel={() => setSelection(EMPTY_SELECTION)}
        />
      )}

      {popover && (
        <PointagePopover
          chantierId={chantierId}
          workerId={popover.workerId}
          date={popover.date}
          cell={popover.cell}
          queryKey={queryKey}
          onClose={() => setPopover(null)}
        />
      )}

    </>
  );
}

interface SelectionToolbarProps {
  count: number;
  pending: boolean;
  onMarkP: () => void;
  onMarkA: () => void;
  onClear: () => void;
  onCancel: () => void;
}

function SelectionToolbar({
  count,
  pending,
  onMarkP,
  onMarkA,
  onClear,
  onCancel,
}: SelectionToolbarProps) {
  return (
    <div
      role="toolbar"
      aria-label="Actions sur la sélection"
      className="fixed left-1/2 bottom-6 -translate-x-1/2 z-40 bati-card rounded-full shadow-lg px-4 py-2 flex items-center gap-2 border border-bati-border"
    >
      <span className="text-xs font-medium text-bati-muted px-2">
        {count} cellule{count > 1 ? 's' : ''} sélectionnée{count > 1 ? 's' : ''}
      </span>
      <div className="h-5 w-px bg-bati-border" aria-hidden />
      <button
        type="button"
        onClick={onMarkP}
        disabled={pending}
        className="px-3 py-1.5 text-xs font-semibold text-bati-teal hover:bg-bati-teal-soft rounded-full transition-colors disabled:opacity-50"
      >
        Marquer présent (P)
      </button>
      <button
        type="button"
        onClick={onMarkA}
        disabled={pending}
        className="px-3 py-1.5 text-xs font-semibold text-bati-terra hover:bg-bati-terra-soft rounded-full transition-colors disabled:opacity-50"
      >
        Marquer absent (A)
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={pending}
        className="px-3 py-1.5 text-xs font-medium text-bati-muted hover:bg-bati-border-soft rounded-full transition-colors disabled:opacity-50"
      >
        Effacer
      </button>
      <div className="h-5 w-px bg-bati-border" aria-hidden />
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="px-3 py-1.5 text-xs font-medium text-bati-muted hover:bg-bati-border-soft rounded-full transition-colors disabled:opacity-50"
      >
        Annuler (Esc)
      </button>
    </div>
  );
}
