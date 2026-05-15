// Pure workforce / pointage logic. Exported via window.WorkforceLogic.

(function () {
  'use strict';

  function pointageKey(workerId, dateISO) {
    return `${workerId}__${dateISO}`;
  }

  // Find pointage entry for a worker on a date, or null
  function findPointage(pointages, workerId, dateISO) {
    return pointages.find(p => p.worker_id === workerId && p.date === dateISO) || null;
  }

  // Compute total cost for one pointage entry
  function pointageCost(pointage, worker) {
    if (!pointage || !pointage.present) return 0;
    const rate = pointage.rate_snapshot != null ? pointage.rate_snapshot : (worker?.rate || 0);
    const bonus = pointage.bonus || 0;
    return rate + bonus;
  }

  // Total days present for a worker (count of present pointages)
  function workerDaysPresent(pointages, workerId) {
    return pointages.filter(p => p.worker_id === workerId && p.present).length;
  }

  // Total labour cost for a worker (sum of all pointage costs)
  function workerTotalCost(pointages, worker) {
    return pointages
      .filter(p => p.worker_id === worker.id && p.present)
      .reduce((sum, p) => sum + pointageCost(p, worker), 0);
  }

  // Total project labour cost
  function projectLabourCost(pointages, workers) {
    const byId = new Map(workers.map(w => [w.id, w]));
    return pointages
      .filter(p => p.present)
      .reduce((sum, p) => sum + pointageCost(p, byId.get(p.worker_id)), 0);
  }

  // Get the ISO date one week before, as a string
  function lastWeekISO(dateISO) {
    const d = new Date(dateISO);
    d.setDate(d.getDate() - 7);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Copy all pointages from sourceISO to targetISO. Skips workers who already
  // have an entry on targetISO. Fresh ids; rate_snapshot reset to null.
  function copyPointagesFromDate(pointages, sourceISO, targetISO) {
    const toCopy = pointages.filter(p => p.date === sourceISO);
    const existing = new Set(pointages.filter(p => p.date === targetISO).map(p => p.worker_id));
    const newEntries = [];
    for (const src of toCopy) {
      if (existing.has(src.worker_id)) continue;
      newEntries.push({
        id: crypto.randomUUID(),
        worker_id: src.worker_id,
        date: targetISO,
        present: src.present,
        task_ids: [...(src.task_ids || [])],
        bonus: src.bonus || 0,
        note: '',
        rate_snapshot: null
      });
    }
    return newEntries;
  }

  // Backwards-compat wrapper for the fixed "7 days ago" case.
  function copyLastWeek(pointages, todayISO) {
    return copyPointagesFromDate(pointages, lastWeekISO(todayISO), todayISO);
  }

  // Recent pointage entries (last N by date)
  function recentPointages(pointages, workers, limit = 5) {
    const byId = new Map(workers.map(w => [w.id, w]));
    return [...pointages]
      .filter(p => p.present)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, limit)
      .map(p => ({
        ...p,
        worker: byId.get(p.worker_id),
        cost: pointageCost(p, byId.get(p.worker_id))
      }));
  }

  // ── Date helpers for the Calendrier ──────────────────────────
  function toDateLocal(iso) {
    // Build a local-midnight Date — avoids the UTC parsing trap where
    // "2026-05-13" becomes 2026-05-12 23:00 in negative-offset timezones.
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  function isoOf(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function startOfWeekISO(dateISO) {
    const d = toDateLocal(dateISO);
    // JS: Sun=0..Sat=6. Convert to Mon=0..Sun=6.
    const dayMon0 = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dayMon0);
    return isoOf(d);
  }
  function startOfMonthISO(dateISO) {
    const d = toDateLocal(dateISO);
    return isoOf(new Date(d.getFullYear(), d.getMonth(), 1));
  }
  function endOfMonthISO(dateISO) {
    const d = toDateLocal(dateISO);
    // Day 0 of next month = last day of this month.
    return isoOf(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  function buildCalendarRange(startISO, endISO) {
    const start = toDateLocal(startISO);
    const end   = toDateLocal(endISO);
    const todayISO = isoOf(new Date());
    const out = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dow = d.getDay(); // 0..6 (Sun..Sat)
      const dateISO = isoOf(d);
      out.push({
        dateISO,
        dayOfWeek: dow,
        isWeekend: dow === 0 || dow === 6,
        isToday: dateISO === todayISO
      });
    }
    return out;
  }

  function buildWorkerCells(workers, pointages, range) {
    const out = new Map();
    for (const w of workers) {
      const cells = [];
      for (const day of range) {
        const p = findPointage(pointages, w.id, day.dateISO);
        let status = 'none';
        if (p) status = p.present ? 'present' : 'absent';
        cells.push({
          dateISO: day.dateISO,
          status,
          task_ids: p?.task_ids || [],
          bonus: p?.bonus || 0,
          cost: pointageCost(p, w)
        });
      }
      out.set(w.id, cells);
    }
    return out;
  }

  function activeDatesInRange(range, pointages) {
    const set = new Set();
    const rangeDates = new Set(range.map(r => r.dateISO));
    for (const p of pointages) {
      if (rangeDates.has(p.date)) set.add(p.date);
    }
    return set;
  }

  function workerRangeStats(cells, activeDates) {
    let present = 0;
    let workingDays = 0;
    for (const c of cells) {
      if (c.status === 'present') present++;
      if (activeDates && activeDates.has(c.dateISO)) workingDays++;
    }
    return { present, workingDays };
  }

  function columnDayStats(workers, cellsByWorker, dateISO) {
    let present = 0;
    for (const w of workers) {
      const arr = cellsByWorker.get(w.id) || [];
      const cell = arr.find(c => c.dateISO === dateISO);
      if (cell && cell.status === 'present') present++;
    }
    return { present, total: workers.length };
  }

  // Sum of pointageCost for every present pointage on a specific date.
  function columnDayCost(workers, pointages, dateISO) {
    const byId = new Map(workers.map(w => [w.id, w]));
    let total = 0;
    for (const p of pointages) {
      if (p.date !== dateISO || !p.present) continue;
      total += pointageCost(p, byId.get(p.worker_id));
    }
    return total;
  }

  // Group leaf tasks under their parent tasks for hierarchical pickers.
  // Returns [{ parent: {id, name}, leaves: [{id, name, status}, …] }, …].
  // Orphan leaves (no parent_id and no children of their own) bucket under
  // a synthetic "Autres" parent so they remain selectable.
  function groupTasksByParent(tasks) {
    const childrenOf = new Map();
    for (const t of tasks) {
      if (t.parent_id) {
        if (!childrenOf.has(t.parent_id)) childrenOf.set(t.parent_id, []);
        childrenOf.get(t.parent_id).push(t);
      }
    }
    const parents = tasks.filter(t => childrenOf.has(t.id));
    parents.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    const groups = [];
    for (const p of parents) {
      const leaves = (childrenOf.get(p.id) || [])
        .filter(c => !childrenOf.has(c.id))
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
        .map(c => ({ id: c.id, name: c.name, status: c.status }));
      if (leaves.length) {
        groups.push({ parent: { id: p.id, name: p.name }, leaves });
      }
    }

    // Orphans: leaves with no parent and no children
    const orphans = tasks
      .filter(t => !t.parent_id && !childrenOf.has(t.id))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(t => ({ id: t.id, name: t.name, status: t.status }));
    if (orphans.length) {
      groups.push({ parent: { id: '__autres__', name: 'Autres' }, leaves: orphans });
    }
    return groups;
  }

  // ── Sous-traitants helpers ───────────────────────────────────
  function subPaid(sub) {
    if (!sub || !Array.isArray(sub.payments)) return 0;
    return sub.payments.reduce((s, p) => s + (p?.amount || 0), 0);
  }
  function subRemaining(sub) {
    if (!sub) return 0;
    return Math.max(0, (sub.forfait || 0) - subPaid(sub));
  }
  function subStatus(sub) {
    const paid = subPaid(sub);
    const forfait = sub?.forfait || 0;
    if (paid >= forfait) return 'paid';
    if (paid > 0) return 'partial';
    return 'unpaid';
  }

  window.WorkforceLogic = {
    pointageKey,
    findPointage,
    pointageCost,
    workerDaysPresent,
    workerTotalCost,
    projectLabourCost,
    lastWeekISO,
    copyLastWeek,
    recentPointages,
    startOfWeekISO,
    startOfMonthISO,
    endOfMonthISO,
    buildCalendarRange,
    buildWorkerCells,
    activeDatesInRange,
    workerRangeStats,
    columnDayStats,
    columnDayCost,
    groupTasksByParent,
    copyPointagesFromDate,
    subPaid,
    subRemaining,
    subStatus
  };
})();
