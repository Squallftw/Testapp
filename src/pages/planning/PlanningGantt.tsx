import { useCallback, useMemo, useState } from 'react';
import {
  addDays,
  addMonths,
  differenceInDays,
  format,
  getISOWeek,
  parseISO,
  startOfMonth,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  TASK_STATUS_COLOR,
  TASK_STATUS_LABEL,
  updateTask,
  type TaskWithAssignments,
} from '@/data/tasks';
import { EmptyState } from '@/components/ui/EmptyState';
import { toast } from '@/components/ui/Toast';
import { ZOOM_PX, type ZoomLevel } from './zoom';

const LEFT_COL_WIDTH = 280;
const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 56;

interface PlanningGanttProps {
  chantierId: string;
  tasks: TaskWithAssignments[];
  zoom: ZoomLevel;
  onEditTask: (task: TaskWithAssignments) => void;
  onCreateTask: () => void;
}

// Flattened tree row
interface FlatRow {
  task: TaskWithAssignments;
  depth: number;
  isParent: boolean;
  isCollapsed: boolean;
}

interface DragState {
  taskId: string;
  type: 'move' | 'resize';
  deltaDays: number;
}

export function PlanningGantt({
  chantierId,
  tasks,
  zoom,
  onEditTask,
  onCreateTask,
}: PlanningGanttProps) {
  const dayPx = ZOOM_PX[zoom];
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<DragState | null>(null);

  // ── tree building ────────────────────────────────────────────────────
  const byParent = useMemo(() => {
    const m = new Map<string | null, TaskWithAssignments[]>();
    for (const t of tasks) {
      const k = t.parent_task_id ?? null;
      const arr = m.get(k);
      if (arr) arr.push(t);
      else m.set(k, [t]);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return (a.start_date ?? '').localeCompare(b.start_date ?? '');
      });
    }
    return m;
  }, [tasks]);

  const flatRows: FlatRow[] = useMemo(() => {
    const out: FlatRow[] = [];
    function walk(parent: string | null, depth: number) {
      const children = byParent.get(parent) ?? [];
      for (const t of children) {
        const grand = byParent.get(t.id) ?? [];
        const isParent = grand.length > 0;
        const isCollapsed = collapsed.has(t.id);
        out.push({ task: t, depth, isParent, isCollapsed });
        if (isParent && !isCollapsed) walk(t.id, depth + 1);
      }
    }
    walk(null, 0);
    return out;
  }, [byParent, collapsed]);

  // ── date range ───────────────────────────────────────────────────────
  const { rangeStart, rangeEnd } = useMemo(() => {
    let min: Date | null = null;
    let max: Date | null = null;
    for (const t of tasks) {
      if (!t.start_date) continue;
      const s = parseISO(t.start_date);
      if (!min || s < min) min = s;
      const e = t.duration_days ? addDays(s, t.duration_days) : s;
      if (!max || e > max) max = e;
    }
    if (!min || !max) {
      const today = new Date();
      return { rangeStart: addDays(today, -7), rangeEnd: addDays(today, 60) };
    }
    return { rangeStart: addDays(min, -7), rangeEnd: addDays(max, 14) };
  }, [tasks]);

  const totalDays = differenceInDays(rangeEnd, rangeStart) + 1;
  const bodyWidth = totalDays * dayPx;

  // ── axis tick generation ─────────────────────────────────────────────
  const monthSegments = useMemo(() => {
    const out: Array<{ key: string; left: number; width: number; label: string }> = [];
    let cursor = startOfMonth(rangeStart);
    while (cursor <= rangeEnd) {
      const next = addMonths(cursor, 1);
      const segStart = cursor < rangeStart ? rangeStart : cursor;
      const segEnd = next > rangeEnd ? rangeEnd : next;
      out.push({
        key: format(cursor, 'yyyy-MM'),
        left: differenceInDays(segStart, rangeStart) * dayPx,
        width: differenceInDays(segEnd, segStart) * dayPx,
        label: format(cursor, 'MMMM yyyy', { locale: fr }),
      });
      cursor = next;
    }
    return out;
  }, [rangeStart, rangeEnd, dayPx]);

  const dayTicks = useMemo(() => {
    const out: Array<{ key: string; left: number; label: string; isMonday: boolean }> = [];
    for (let i = 0; i < totalDays; i++) {
      const d = addDays(rangeStart, i);
      const isMonday = d.getDay() === 1;
      const show = zoom === 'day' || isMonday;
      if (!show) continue;
      out.push({
        key: format(d, 'yyyy-MM-dd'),
        left: i * dayPx,
        label: zoom === 'day' ? format(d, 'd') : `S${getISOWeek(d)}`,
        isMonday,
      });
    }
    return out;
  }, [rangeStart, totalDays, dayPx, zoom]);

  // ── drag mutation ────────────────────────────────────────────────────
  const reposition = useMutation({
    mutationFn: async (input: {
      id: string;
      start_date?: string | null;
      duration_days?: number | null;
    }) => {
      await updateTask(input.id, {
        ...(input.start_date !== undefined ? { start_date: input.start_date } : {}),
        ...(input.duration_days !== undefined
          ? { duration_days: input.duration_days }
          : {}),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks', chantierId] });
    },
    onError: (err) => {
      toast.fromError(err, 'Échec du déplacement');
      void queryClient.invalidateQueries({ queryKey: ['tasks', chantierId] });
    },
  });

  // ── drag handlers ────────────────────────────────────────────────────
  const startDrag = useCallback(
    (
      e: React.PointerEvent,
      task: TaskWithAssignments,
      type: 'move' | 'resize'
    ) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      let dragged = false;
      let lastDelta = 0;

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - startX;
        if (!dragged && Math.abs(dx) > 3) dragged = true;
        if (dragged) {
          const dDays = Math.round(dx / dayPx);
          lastDelta = dDays;
          setDrag({ taskId: task.id, type, deltaDays: dDays });
        }
      }

      function onUp() {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        setDrag(null);
        if (!dragged) {
          // click → edit
          onEditTask(task);
          return;
        }
        if (lastDelta === 0) return;
        if (type === 'move') {
          if (!task.start_date) return;
          const newStart = addDays(parseISO(task.start_date), lastDelta);
          reposition.mutate({ id: task.id, start_date: format(newStart, 'yyyy-MM-dd') });
        } else {
          const newDuration = Math.max(0, (task.duration_days ?? 0) + lastDelta);
          reposition.mutate({ id: task.id, duration_days: newDuration });
        }
      }

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [dayPx, onEditTask, reposition]
  );

  function toggleCollapse(taskId: string) {
    setCollapsed((curr) => {
      const next = new Set(curr);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  // ── render ───────────────────────────────────────────────────────────
  if (tasks.length === 0) {
    return (
      <EmptyState
        title="Aucune tâche planifiée"
        description="Ajoutez une première tâche pour commencer à construire votre planning."
        action={
          <button
            type="button"
            onClick={onCreateTask}
            className="px-4 py-2 bg-bati-teal text-white rounded-md text-sm font-medium"
          >
            Nouvelle tâche
          </button>
        }
      />
    );
  }

  return (
    <div className="bati-card rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <div className="flex" style={{ minWidth: LEFT_COL_WIDTH + bodyWidth }}>
          {/* Left column: task tree */}
          <div
            className="flex-shrink-0 border-r border-bati-border bg-bati-card"
            style={{ width: LEFT_COL_WIDTH }}
          >
            <div
              className="px-3 flex items-end pb-2 border-b border-bati-border bg-bati-border-soft text-xs font-semibold text-bati-muted"
              style={{ height: HEADER_HEIGHT }}
            >
              Tâche
            </div>
            <div>
              {flatRows.map((row) => (
                <TaskRowLabel
                  key={row.task.id}
                  row={row}
                  height={ROW_HEIGHT}
                  onToggle={() => toggleCollapse(row.task.id)}
                  onClick={() => onEditTask(row.task)}
                />
              ))}
            </div>
          </div>

          {/* Right column: timeline */}
          <div className="flex-1 relative">
            {/* Header axis */}
            <div
              className="sticky top-0 z-10 bg-bati-border-soft border-b border-bati-border"
              style={{ height: HEADER_HEIGHT, width: bodyWidth }}
            >
              <div className="relative" style={{ height: HEADER_HEIGHT / 2 }}>
                {monthSegments.map((m) => (
                  <div
                    key={m.key}
                    className="absolute top-0 px-2 py-1 text-[11px] font-semibold text-bati-text border-r border-bati-border/60 overflow-hidden whitespace-nowrap"
                    style={{ left: m.left, width: m.width, height: '100%' }}
                  >
                    {m.label}
                  </div>
                ))}
              </div>
              <div className="relative border-t border-bati-border/60" style={{ height: HEADER_HEIGHT / 2 }}>
                {dayTicks.map((t) => (
                  <div
                    key={t.key}
                    className={`absolute top-0 text-[10px] py-1 ${
                      t.isMonday ? 'text-bati-text font-medium' : 'text-bati-muted'
                    }`}
                    style={{ left: t.left, width: dayPx }}
                  >
                    <div className="text-center">{t.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Body: bars + row striping */}
            <div
              className="relative"
              style={{ height: flatRows.length * ROW_HEIGHT, width: bodyWidth }}
            >
              {/* Background row dividers + weekend shading */}
              {flatRows.map((_, idx) => (
                <div
                  key={`row-${idx}`}
                  className="absolute left-0 right-0 border-b border-bati-border-soft"
                  style={{ top: idx * ROW_HEIGHT, height: ROW_HEIGHT }}
                />
              ))}

              {/* Weekend shading */}
              {Array.from({ length: totalDays }, (_, i) => i)
                .filter((i) => {
                  const d = addDays(rangeStart, i);
                  return d.getDay() === 0 || d.getDay() === 6;
                })
                .map((i) => (
                  <div
                    key={`we-${i}`}
                    className="absolute top-0 bottom-0 bg-bati-border-soft/40 pointer-events-none"
                    style={{ left: i * dayPx, width: dayPx }}
                  />
                ))}

              {/* Today marker */}
              <TodayMarker rangeStart={rangeStart} rangeEnd={rangeEnd} dayPx={dayPx} />

              {/* Bars */}
              {flatRows.map((row, idx) => {
                const t = row.task;
                if (!t.start_date) return null;
                const base = differenceInDays(parseISO(t.start_date), rangeStart);
                const baseDur = t.duration_days ?? 0;
                const isDragging = drag?.taskId === t.id;
                let offsetDays = base;
                let dur = baseDur;
                if (isDragging && drag) {
                  if (drag.type === 'move') offsetDays = base + drag.deltaDays;
                  else dur = Math.max(0, baseDur + drag.deltaDays);
                }
                const colors = TASK_STATUS_COLOR[t.status];
                const left = offsetDays * dayPx;
                const width = Math.max(dayPx, dur * dayPx);
                return (
                  <div
                    key={t.id}
                    className={`absolute rounded-md shadow-sm cursor-grab active:cursor-grabbing transition-shadow ${
                      isDragging ? 'shadow-md opacity-90' : 'hover:shadow-md'
                    }`}
                    style={{
                      top: idx * ROW_HEIGHT + 6,
                      height: ROW_HEIGHT - 12,
                      left,
                      width,
                      background: colors.bar,
                      touchAction: 'none',
                    }}
                    onPointerDown={(e) => startDrag(e, t, 'move')}
                    title={`${t.label} · ${TASK_STATUS_LABEL[t.status]}${
                      t.duration_days ? ` · ${t.duration_days} jour${t.duration_days > 1 ? 's' : ''}` : ''
                    }`}
                  >
                    <div className="h-full flex items-center justify-between px-2 text-[11px] font-medium text-white overflow-hidden">
                      <span className="truncate">{t.label}</span>
                      {t.assignee_ids.length > 0 && (
                        <span className="ml-2 text-[10px] opacity-80 flex-shrink-0">
                          {t.assignee_ids.length}👷
                        </span>
                      )}
                    </div>
                    {/* Resize handle */}
                    <div
                      className="absolute top-0 right-0 h-full w-2 cursor-ew-resize hover:bg-white/30"
                      onPointerDown={(e) => startDrag(e, t, 'resize')}
                      aria-label="Redimensionner"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-bati-border-soft text-xs text-bati-muted flex flex-wrap items-center gap-3">
        <span>Glissez une barre pour déplacer · Glissez le bord droit pour redimensionner · Cliquez pour modifier</span>
        <div className="flex items-center gap-2 ml-auto">
          {(Object.keys(TASK_STATUS_LABEL) as Array<keyof typeof TASK_STATUS_LABEL>).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span
                className="w-3 h-3 rounded-sm"
                style={{ background: TASK_STATUS_COLOR[s].bar }}
                aria-hidden
              />
              <span>{TASK_STATUS_LABEL[s]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

interface TaskRowLabelProps {
  row: FlatRow;
  height: number;
  onToggle: () => void;
  onClick: () => void;
}

function TaskRowLabel({ row, height, onToggle, onClick }: TaskRowLabelProps) {
  const { task, depth, isParent, isCollapsed } = row;
  return (
    <div
      className="flex items-center border-b border-bati-border-soft text-sm hover:bg-bati-border-soft/50"
      style={{ height, paddingLeft: 8 + depth * 16 }}
    >
      {isParent ? (
        <button
          type="button"
          onClick={onToggle}
          className="w-5 h-5 flex items-center justify-center text-bati-muted hover:text-bati-text flex-shrink-0"
          aria-label={isCollapsed ? 'Développer' : 'Réduire'}
        >
          <span className={`transition-transform inline-block ${isCollapsed ? '' : 'rotate-90'}`}>
            ▶
          </span>
        </button>
      ) : (
        <span className="w-5 flex-shrink-0" />
      )}
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 text-left truncate px-1 py-0.5 rounded hover:text-bati-teal"
      >
        {task.label}
      </button>
      {task.duration_days != null && task.duration_days > 0 && (
        <span
          className="ml-2 px-1.5 py-0.5 rounded bg-bati-border-soft text-[10px] font-medium tabular-nums text-bati-muted flex-shrink-0"
          title={`Durée : ${task.duration_days} jour${task.duration_days > 1 ? 's' : ''}`}
        >
          {task.duration_days} j
        </span>
      )}
      <span
        className="ml-2 mr-2 w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: TASK_STATUS_COLOR[task.status].bar }}
        aria-label={TASK_STATUS_LABEL[task.status]}
        title={TASK_STATUS_LABEL[task.status]}
      />
    </div>
  );
}

function TodayMarker({
  rangeStart,
  rangeEnd,
  dayPx,
}: {
  rangeStart: Date;
  rangeEnd: Date;
  dayPx: number;
}) {
  const today = new Date();
  if (today < rangeStart || today > rangeEnd) return null;
  const left = differenceInDays(today, rangeStart) * dayPx;
  return (
    <div
      className="absolute top-0 bottom-0 w-px bg-bati-teal pointer-events-none z-20"
      style={{ left }}
      aria-label="Aujourd'hui"
    >
      <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-bati-teal" />
    </div>
  );
}
