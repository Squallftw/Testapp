// Pure planning logic — no DOM access. Exported via window.GanttLogic.

(function () {
  'use strict';

  const DAY_MS = 86400000;

  function toDate(s) {
    if (s instanceof Date) return new Date(s.getTime());
    const d = new Date(s);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(date, n) {
    const d = toDate(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function dateToISO(d) {
    const dt = toDate(d);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const day = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function diffDays(a, b) {
    return Math.round((toDate(b) - toDate(a)) / DAY_MS);
  }

  function isWeekend(date) {
    const d = toDate(date).getDay();
    return d === 0 || d === 6;
  }

  // Build a flat list with depth info from a hierarchical task list.
  function flattenTasks(tasks, parentId = null, depth = 0, out = []) {
    const children = tasks
      .filter(t => (t.parent_id || null) === parentId)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    for (const t of children) {
      out.push({ ...t, depth });
      if (!t.collapsed) {
        flattenTasks(tasks, t.id, depth + 1, out);
      }
    }
    return out;
  }

  // Compute start offset (in days from project start) for a task.
  // Sequential = end of previous sibling. Manual offset overrides.
  // Parent task spans children.
  function computeTaskOffsets(tasks, projectStart) {
    const byId = new Map(tasks.map(t => [t.id, { ...t }]));
    // Group by parent
    const byParent = new Map();
    for (const t of byId.values()) {
      const p = t.parent_id || null;
      if (!byParent.has(p)) byParent.set(p, []);
      byParent.get(p).push(t);
    }
    for (const arr of byParent.values()) {
      arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }

    function resolve(parentId) {
      const arr = byParent.get(parentId) || [];
      let cursor = 0;
      for (const t of arr) {
        // First resolve children to know parent span
        const children = byParent.get(t.id) || [];
        if (children.length > 0) {
          // For parents, the start is min of children starts, duration = max(end) - min(start)
          // But we still allow manual offset on a parent
          if (typeof t.manual_start_offset === 'number') {
            // Children must respect parent's manual offset as their base
            // For simplicity: when parent has manual offset, children are relative to it
            t._start = t.manual_start_offset;
            resolveRelative(children, t._start);
            const ends = children.map(c => c._start + (c.duration || 1));
            const starts = children.map(c => c._start);
            t._start = Math.min(t._start, ...starts);
            t._end = Math.max(t._start + (t.duration || 1), ...ends);
            t.duration = t._end - t._start;
          } else {
            // Parent starts at cursor; children flow from there
            resolveRelative(children, cursor);
            const ends = children.map(c => c._start + (c.duration || 1));
            const starts = children.map(c => c._start);
            t._start = Math.min(cursor, ...starts);
            t._end = Math.max(...ends);
            t.duration = t._end - t._start;
          }
        } else {
          t._start = typeof t.manual_start_offset === 'number' ? t.manual_start_offset : cursor;
          t._end = t._start + (t.duration || 1);
        }
        cursor = t._end;
      }
    }

    function resolveRelative(arr, base) {
      let cursor = base;
      for (const t of arr) {
        const children = byParent.get(t.id) || [];
        if (children.length > 0) {
          if (typeof t.manual_start_offset === 'number') {
            t._start = t.manual_start_offset;
            resolveRelative(children, t._start);
          } else {
            resolveRelative(children, cursor);
          }
          const ends = children.map(c => c._start + (c.duration || 1));
          const starts = children.map(c => c._start);
          t._start = Math.min(...starts);
          t._end = Math.max(...ends);
          t.duration = t._end - t._start;
        } else {
          t._start = typeof t.manual_start_offset === 'number' ? t.manual_start_offset : cursor;
          t._end = t._start + (t.duration || 1);
        }
        cursor = t._end;
      }
    }

    resolve(null);

    // Return id -> {startOffset, endOffset, startDate, endDate}
    const result = new Map();
    for (const t of byId.values()) {
      const startDate = addDays(projectStart, t._start || 0);
      const endDate = addDays(projectStart, t._end || (t._start + 1));
      result.set(t.id, {
        startOffset: t._start,
        endOffset: t._end,
        duration: t._end - t._start,
        startDate,
        endDate
      });
    }
    return result;
  }

  // Determine timeline bounds (in days from project start)
  function computeTimelineBounds(tasks) {
    if (tasks.length === 0) return { min: 0, max: 30 };
    let max = 0;
    for (const t of tasks) {
      if (typeof t._end === 'number' && t._end > max) max = t._end;
    }
    return { min: 0, max: Math.max(max + 3, 14) };
  }

  // Late detection: end date before today AND status !== done
  function isTaskLate(task, endDate, today) {
    if (task.status === 'done') return false;
    return toDate(endDate) < toDate(today);
  }

  // How many days between each day-number label, given pixel-width per day.
  // Avoids the unreadable overlap when bars get very narrow at low zoom.
  function dayLabelStride(dayPx) {
    if (dayPx >= 14) return 1;
    if (dayPx >= 8)  return 2;
    if (dayPx >= 5)  return 5;
    if (dayPx >= 3)  return 7;
    return 14;
  }

  function statusLabel(status) {
    return {
      todo: 'À faire',
      in_progress: 'En cours',
      done: 'Terminé'
    }[status] || 'À faire';
  }

  function statusBadgeClass(status) {
    return {
      todo: 'badge-muted',
      in_progress: 'badge-warn',
      done: 'badge-success',
      late: 'badge-danger'
    }[status] || 'badge-muted';
  }

  window.GanttLogic = {
    toDate,
    addDays,
    dateToISO,
    diffDays,
    isWeekend,
    flattenTasks,
    computeTaskOffsets,
    computeTimelineBounds,
    isTaskLate,
    statusLabel,
    statusBadgeClass,
    dayLabelStride,
    DAY_MS
  };
})();
