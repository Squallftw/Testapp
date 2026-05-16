// Planning — MS Project-style Gantt chart
const { useState: usePlState, useMemo: usePlMemo, useRef: usePlRef } = React;

// Date helpers (UTC-safe)
function dateFromYMD(y, m, d) { return new Date(y, m, d); }
function daysBetween(a, b) { return Math.floor((b - a) / 86400000); }
function addDaysD(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
function frenchMonth(d) { return MOIS_FR[d.getMonth()]; }
function frenchDay(d) { return `${d.getDate()} ${MOIS_FR_SHORT[d.getMonth()]} ${d.getFullYear()}`; }

const TIMELINE_START = dateFromYMD(2025, 8, 1);   // 1 sept 2025
const TIMELINE_END   = dateFromYMD(2027, 11, 31); // 31 déc 2027 — generous future runway

const STATUS_COLORS = {
  todo:     { bar: '#A8A09B', dot: '#A8A09B', label: 'À faire' },
  ongoing:  { bar: '#E0832E', dot: '#E0832E', label: 'En cours' },
  done:     { bar: '#2E9152', dot: '#2E9152', label: 'Terminé' },
  critical: { bar: '#C44C36', dot: '#C44C36', label: 'En retard' }
};
const STATUS_ORDER = ['todo', 'ongoing', 'done', 'critical'];

// Seed plan for Villa Anfa — calibrated against TODAY = 15 mai 2026
const PLAN_VILLA_SEED = [
  { id: 'g1', kind: 'group', label: 'GROS OEUVRES', children: [
    { id: 't1',  label: 'DECAPAGE-NETTOYAGE',  start: [2025,10,10], duration: 3,  status: 'done' },
    { id: 't2',  label: 'TERRASSEMENTS',       start: [2025,10,13], duration: 10, status: 'done' },
    { id: 't3',  label: 'REMBLAIS',            start: [2025,10,25], duration: 7,  status: 'done' },
    { id: 't4',  label: 'FONDATIONS',          start: [2025,11,4],  duration: 15, status: 'done' },
    { id: 't5',  label: 'DALLAGES',            start: [2025,11,23], duration: 15, status: 'done' },
    { id: 't6',  label: 'POTEAUX VOILES ELEV', start: [2026,0,15],  duration: 40, status: 'done' },
    { id: 't7',  label: 'PLANCHERS',           start: [2026,2,12],  duration: 20, status: 'done' },
    { id: 't8',  label: 'MAÇONNERIES',         start: [2026,3,9],   duration: 15, status: 'done' },
    { id: 't9',  label: 'ENDUITS',             start: [2026,3,30],  duration: 15, status: 'critical' },
    { id: 't10', label: 'POSES DIVERSES',      start: [2026,4,4],   duration: 22, status: 'ongoing' },
    { id: 't11', label: 'FINITIONS',           start: [2026,5,1],   duration: 12, status: 'todo' }
  ]},
  { id: 'g2', kind: 'group', label: 'ETANCHEITE', children: [
    { id: 't12', label: 'CHAPE ET FORME',      start: [2026,5,15],  duration: 10, status: 'todo' },
    { id: 't13', label: 'COMPLEXE',            start: [2026,6,1],   duration: 12, status: 'todo' }
  ]},
  { id: 'g3', kind: 'group', label: 'CORPS D\'ÉTAT SECONDAIRES', children: [
    { id: 't14', label: 'PLOMBERIE SANITAIRE', start: [2026,6,15],  duration: 18, status: 'todo' },
    { id: 't15', label: 'ÉLECTRICITÉ',         start: [2026,6,15],  duration: 22, status: 'todo' },
    { id: 't16', label: 'MENUISERIE BOIS',     start: [2026,7,5],   duration: 16, status: 'todo' },
    { id: 't17', label: 'PEINTURE',            start: [2026,7,18],  duration: 14, status: 'todo' }
  ]}
];

// Seed plan for Résidence Hay Riad Rabat (ch-2)
const PLAN_HAYRIAD_SEED = [
  { id: 'hg1', kind: 'group', label: 'BLOC A — GROS ŒUVRE', children: [
    { id: 'h1', label: 'TERRASSEMENTS A',  start: [2025,8,1],   duration: 12, status: 'done' },
    { id: 'h2', label: 'FONDATIONS A',     start: [2025,8,17],  duration: 18, status: 'done' },
    { id: 'h3', label: 'POTEAUX VOILES A', start: [2025,9,12],  duration: 30, status: 'done' },
    { id: 'h4', label: 'PLANCHERS A',      start: [2025,10,14], duration: 20, status: 'done' }
  ]},
  { id: 'hg2', kind: 'group', label: 'BLOC B — GROS ŒUVRE', children: [
    { id: 'h5', label: 'TERRASSEMENTS B',  start: [2026,0,6],   duration: 12, status: 'done' },
    { id: 'h6', label: 'FONDATIONS B',     start: [2026,0,22],  duration: 18, status: 'done' },
    { id: 'h7', label: 'POTEAUX VOILES B', start: [2026,1,16],  duration: 30, status: 'done' }
  ]}, 
  { id: 'hg3', kind: 'group', label: 'FINITIONS', children: [
    { id: 'h8',  label: 'MAÇONNERIES',  start: [2026,3,1],  duration: 25, status: 'done' },
    { id: 'h9',  label: 'ENDUITS',      start: [2026,4,1],  duration: 20, status: 'ongoing' },
    { id: 'h10', label: 'PEINTURE',     start: [2026,5,1],  duration: 18, status: 'todo' }
  ]}
];

// Seed plan for Rénovation Riad Marrakech (ch-3)
const PLAN_MARRAKECH_SEED = [
  { id: 'mg1', kind: 'group', label: 'DÉMOLITION', children: [
    { id: 'm1', label: 'DÉPOSE CARRELAGE',     start: [2025,10,15], duration: 5, status: 'done' },
    { id: 'm2', label: 'DÉMOLITION CLOISONS',  start: [2025,10,22], duration: 8, status: 'done' },
    { id: 'm3', label: 'ÉVACUATION GRAVATS',   start: [2025,11,2],  duration: 4, status: 'done' }
  ]},
  { id: 'mg2', kind: 'group', label: 'STRUCTURE', children: [
    { id: 'm4', label: 'REPRISE STRUCTURE',    start: [2025,11,8],  duration: 14, status: 'done' },
    { id: 'm5', label: 'CONSOLIDATION VOÛTES', start: [2025,11,24], duration: 10, status: 'done' }
  ]},
  { id: 'mg3', kind: 'group', label: 'TRADITION', children: [
    { id: 'm6', label: 'ZELLIGE FASSI',        start: [2026,1,1],   duration: 28, status: 'done' },
    { id: 'm7', label: 'TADELAKT MURS',        start: [2026,2,1],   duration: 24, status: 'critical' },
    { id: 'm8', label: 'PEINTURE CHAUX',       start: [2026,4,1],   duration: 18, status: 'ongoing' }
  ]}
];

const PLANS_SEED_DEMO = {
  'ch-1': PLAN_VILLA_SEED,
  'ch-2': PLAN_HAYRIAD_SEED,
  'ch-3': PLAN_MARRAKECH_SEED
};
const PLANS_SEED = (typeof __batiPick === 'function')
  ? __batiPick('plansSeed', {}, PLANS_SEED_DEMO)
  : PLANS_SEED_DEMO;

function Planning({ ctx }) {
  const [chantierId, setChantierId] = usePlState((CHANTIERS[0]?.id || ''));
  const plan = ctx.plans[chantierId] || [];
  const setPlan = (updater) => ctx.setPlanForChantier(chantierId, updater);
  const [expanded, setExpanded] = usePlState({});
  const [dayPx, setDayPx] = usePlState(4.5);
  const [hoverTask, setHoverTask] = usePlState(null);
  const [taskOverrides, setTaskOverrides] = usePlState({}); // {taskId: startOffsetDays}
  const [dragState, setDragState] = usePlState(null);
  const [selectedId, setSelectedId] = usePlState(null);
  const [editingTask, setEditingTask] = usePlState(null); // {mode: 'create'|'edit', task, groupId}
  const [editingGroup, setEditingGroup] = usePlState(null); // group object being edited
  const [selectedGroupId, setSelectedGroupId] = usePlState(null);
  const [inlineNew, setInlineNew] = usePlState(null); // { kind: 'parent' | 'subtask', parentId? } | null
  const wheelRef = usePlRef(null);
  const dayPxRef = usePlRef(dayPx);
  dayPxRef.current = dayPx;
  const totalDays = daysBetween(TIMELINE_START, TIMELINE_END) + 1;
  const totalWidth = totalDays * dayPx;
  const todayOffset = daysBetween(TIMELINE_START, dateFromYMD(TODAY.year, TODAY.monthIdx, TODAY.day));

  // Months for header
  const months = usePlMemo(() => {
    const out = [];
    let cursor = new Date(TIMELINE_START);
    while (cursor <= TIMELINE_END) {
      const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
      const visibleStart = monthStart < TIMELINE_START ? TIMELINE_START : monthStart;
      const visibleEnd = monthEnd > TIMELINE_END ? TIMELINE_END : monthEnd;
      const offset = daysBetween(TIMELINE_START, visibleStart);
      const width = (daysBetween(visibleStart, visibleEnd) + 1) * dayPx;
      out.push({ label: `${frenchMonth(visibleStart)} ${visibleStart.getFullYear()}`, offset: offset * dayPx, width });
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return out;
  }, [dayPx]);

  // Day ticks (every Monday + the 1st)
  const dayTicks = usePlMemo(() => {
    const out = [];
    let d = new Date(TIMELINE_START);
    while (d <= TIMELINE_END) {
      if (d.getDay() === 1 || d.getDate() === 1) {
        out.push({ day: d.getDate(), offset: daysBetween(TIMELINE_START, d) * dayPx });
      }
      d = addDaysD(d, 1);
    }
    return out;
  }, [dayPx]);

  // Compute effective start offset (days from TIMELINE_START), with drag overrides
  function startOffsetDays(task) {
    if (taskOverrides[task.id] !== undefined) return taskOverrides[task.id];
    const s = dateFromYMD(task.start[0], task.start[1], task.start[2]);
    return daysBetween(TIMELINE_START, s);
  }
  function taskStartDate(task) {
    return addDaysD(TIMELINE_START, startOffsetDays(task));
  }
  function taskEndDate(task) {
    return addDaysD(taskStartDate(task), task.duration - 1);
  }

  // Compute task offsets
  function taskBar(task) {
    return { offset: startOffsetDays(task) * dayPx, width: task.duration * dayPx };
  }

  // Group span
  function groupSpan(group) {
    let minStart = Infinity, maxEnd = -Infinity, totalDur = 0;
    group.children.forEach(t => {
      const s = startOffsetDays(t);
      const e = s + t.duration - 1;
      if (s < minStart) minStart = s;
      if (e > maxEnd) maxEnd = e;
      totalDur += t.duration;
    });
    return { offset: minStart * dayPx, width: (maxEnd - minStart + 1) * dayPx, duration: totalDur };
  }

  // Flatten rows. Inline-create rows are spliced in at the right place so they
  // look exactly like a regular row but with an autofocused name input.
  const rows = [];
  plan.forEach(g => {
    const span = groupSpan(g);
    rows.push({ kind: 'group', id: g.id, label: g.label, span, group: g });
    if (expanded[g.id] !== false) {
      g.children.forEach(t => rows.push({ kind: 'task', task: t, groupId: g.id }));
      if (inlineNew && inlineNew.kind === 'subtask' && inlineNew.parentId === g.id) {
        rows.push({ kind: 'inline-subtask', groupId: g.id });
      }
    }
  });
  if (inlineNew && inlineNew.kind === 'parent') {
    rows.push({ kind: 'inline-parent' });
  }

  function saveTask(updated, groupId) {
    if (groupId === '__none__') {
      // No parent picked — create a brand-new top-level group (parent), empty.
      // The user adds subtasks to it afterwards by re-opening the form with
      // "Tâche parente" = this group.
      const newGroupId = 'g-' + Date.now().toString(36);
      setPlan(prev => [...prev, {
        id: newGroupId,
        label: updated.label,
        status: updated.status || 'todo',
        children: [],
      }]);
    } else {
      setPlan(prev => {
        // Remove from any group except target, then upsert into target
        return prev.map(g => {
          if (g.id === groupId) {
            const exists = g.children.some(t => t.id === updated.id);
            return { ...g, children: exists
              ? g.children.map(t => t.id === updated.id ? updated : t)
              : [...g.children, updated] };
          }
          const filtered = g.children.filter(t => t.id !== updated.id);
          return filtered.length === g.children.length ? g : { ...g, children: filtered };
        });
      });
    }
    // Clear any drag override so the new explicit start sticks
    setTaskOverrides(prev => {
      if (!(updated.id in prev)) return prev;
      const next = { ...prev };
      delete next[updated.id];
      return next;
    });
  }

  function saveGroup(groupId, patch) {
    setPlan(prev => prev.map(g => g.id === groupId ? { ...g, ...patch } : g));
  }

  function deleteGroup(groupId) {
    setPlan(prev => prev.filter(g => g.id !== groupId));
  }

  // Default start when the user creates a task without giving a date:
  // chain it right after the latest task already in the chosen scope.
  function computeNextStartForParent(parentId) {
    let pool;
    if (parentId == null || parentId === '__none__') {
      pool = plan.flatMap(g => g.children);
    } else {
      const g = plan.find(x => x.id === parentId);
      pool = (g && g.children) || [];
    }
    if (pool.length === 0) {
      const ch = CHANTIERS.find(c => c.id === chantierId);
      if (ch && ch.dateStart) {
        const [y, m, d] = ch.dateStart.split('-').map(Number);
        return dateFromYMD(y, m - 1, d);
      }
      return new Date();
    }
    const endOf = (t) => {
      const s = dateFromYMD(t.start[0], t.start[1], t.start[2]);
      return addDaysD(s, t.duration - 1);
    };
    let latest = endOf(pool[0]);
    for (let i = 1; i < pool.length; i++) {
      const e = endOf(pool[i]);
      if (e > latest) latest = e;
    }
    return addDaysD(latest, 1);
  }

  function startInlineParent() {
    setInlineNew({ kind: 'parent' });
  }
  function startInlineSubtask(parentId) {
    setExpanded(prev => ({ ...prev, [parentId]: true }));
    setInlineNew({ kind: 'subtask', parentId });
  }
  function commitInlineNew(label) {
    const trimmed = (label || '').trim();
    if (!trimmed || !inlineNew) { setInlineNew(null); return; }
    if (inlineNew.kind === 'parent') {
      const newGroupId = 'g-' + Date.now().toString(36);
      setPlan(prev => [...prev, { id: newGroupId, label: trimmed, status: 'todo', children: [] }]);
    } else {
      const seq = computeNextStartForParent(inlineNew.parentId);
      saveTask({
        id: 't-' + Date.now().toString(36),
        label: trimmed,
        start: [seq.getFullYear(), seq.getMonth(), seq.getDate()],
        duration: 5,
        status: 'todo',
      }, inlineNew.parentId);
    }
    setInlineNew(null);
  }

  function deleteTask(taskId) {
    setPlan(prev => prev.map(g => ({ ...g, children: g.children.filter(t => t.id !== taskId) })));
    setSelectedId(null);
  }

  const ROW_H = 36;
  const HEADER_H = 56;
  const LEFT_W = 320;

  // Auto-scroll the Gantt so "today" is roughly centered when the page first loads
  React.useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    const LEFT_W_LOCAL = 320;
    const targetLeft = LEFT_W_LOCAL + todayOffset * dayPx - el.clientWidth / 3;
    el.scrollTo({ left: Math.max(0, targetLeft), behavior: 'instant' in window ? 'instant' : 'auto' });
    // We intentionally only run this once on mount + when chantier changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chantierId]);

  // Wheel zoom — pivot around cursor position so the day under the mouse stays put
  React.useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    const handler = (e) => {
      if (e.shiftKey) return; // shift+wheel keeps native horizontal scroll
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cursorXInScrollArea = e.clientX - rect.left; // 0..clientWidth
      const cursorXInContent = el.scrollLeft + cursorXInScrollArea - LEFT_W;
      const currentDay = cursorXInContent / dayPxRef.current;
      const factor = e.deltaY < 0 ? 1.18 : 0.85;
      const nextDayPx = Math.max(1.2, Math.min(40, dayPxRef.current * factor));
      setDayPx(nextDayPx);
      // After paint, restore cursor's anchor
      requestAnimationFrame(() => {
        if (!wheelRef.current) return;
        const newScrollLeft = currentDay * nextDayPx + LEFT_W - cursorXInScrollArea;
        wheelRef.current.scrollLeft = Math.max(0, newScrollLeft);
      });
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Left-click drag to pan the timeline (when not starting on a task bar)
  const panStateRef = usePlRef(null);
  function onContainerMouseDown(e) {
    // Only pan on left button and only when click is on background (not a task bar / button / select)
    if (e.button !== 0) return;
    if (e.target.closest('[data-task-bar]')) return;
    if (e.target.closest('[data-no-pan]')) return;
    if (e.target.closest('button, select, input, a')) return;
    const el = wheelRef.current;
    if (!el) return;
    panStateRef.current = {
      startX: e.clientX,
      startScrollLeft: el.scrollLeft
    };
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  }
  React.useEffect(() => {
    function onMove(e) {
      if (!panStateRef.current) return;
      const el = wheelRef.current;
      if (!el) return;
      const dx = e.clientX - panStateRef.current.startX;
      el.scrollLeft = panStateRef.current.startScrollLeft - dx;
    }
    function onUp() {
      if (!panStateRef.current) return;
      panStateRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  // Drag-to-move bars
  React.useEffect(() => {
    if (!dragState) return;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    const onMove = (e) => {
      const deltaDays = Math.round((e.clientX - dragState.startX) / dragState.dayPxAtStart);
      const next = dragState.originalOffsetDays + deltaDays;
      setTaskOverrides(prev => ({ ...prev, [dragState.taskId]: next }));
    };
    const onUp = () => setDragState(null);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dragState]);

  function onBarMouseDown(e, task) {
    e.preventDefault();
    e.stopPropagation();
    setHoverTask(null);
    setDragState({
      taskId: task.id,
      startX: e.clientX,
      originalOffsetDays: startOffsetDays(task),
      dayPxAtStart: dayPxRef.current
    });
  }

  return (
    <div>
      <PageHeader title="Planning"
                  subtitle="Vue Gantt — gestion de projet et coordination des corps d'état."
                  right={<>
                    <select value={chantierId} onChange={e => setChantierId(e.target.value)}
                            className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm">
                      {CHANTIERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <div className="flex bg-stone-100 rounded-lg p-0.5">
                      <button onClick={() => setDayPx(p => Math.max(1.2, p * 0.7))} title="Zoom −"
                              className="px-2.5 py-1 text-xs font-semibold rounded text-stone-600 hover:bg-white">−</button>
                      <button onClick={() => setDayPx(4.5)} title="Réinitialiser"
                              className="px-2.5 py-1 text-xs font-semibold rounded text-stone-600 hover:bg-white">⊙</button>
                      <button onClick={() => setDayPx(p => Math.min(40, p * 1.4))} title="Zoom +"
                              className="px-2.5 py-1 text-xs font-semibold rounded text-stone-600 hover:bg-white">+</button>
                    </div>
                    <Btn size="sm" icon={<Icons.Doc size={13}/>}>Exporter</Btn>
                    <Btn size="sm" variant="primary" icon={<Icons.Plus size={13}/>} onClick={startInlineParent}>Tâche</Btn>
                  </>}/>

      {/* Legend + summary */}
      <div className="flex items-center flex-wrap gap-x-5 gap-y-2 mb-3 text-xs">
        {Object.entries(STATUS_COLORS).map(([k, v]) => (
          <div key={k} className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-sm" style={{ background: v.bar }}/>
            <span className="text-stone-600">{v.label}</span>
          </div>
        ))}
        <div className="inline-flex items-center gap-1.5 ml-auto">
          <span className="text-[10px] uppercase tracking-wider font-semibold text-stone-400">Astuce:</span>
          <span className="text-stone-500">molette pour zoomer · clic-glisser pour déplacer · glisser une barre pour la déplacer · double-clic pour éditer</span>
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="w-0.5 h-3.5" style={{ background:'#0E5460' }}/>
          <span className="text-stone-600">Aujourd'hui — {frenchDay(dateFromYMD(TODAY.year, TODAY.monthIdx, TODAY.day))}</span>
        </div>
      </div>

      {/* Gantt */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto" ref={wheelRef} onMouseDown={onContainerMouseDown}
             style={{ cursor: panStateRef.current ? 'grabbing' : 'default' }}>
          <div className="relative" style={{ minWidth: LEFT_W + totalWidth }}>
            {/* Header */}
            <div className="sticky top-0 z-20 flex border-b-2" style={{ height: HEADER_H, borderColor:'#E8E2D8', background:'#FAF7F1' }}>
              {/* Left header cell */}
              <div className="sticky left-0 z-10 flex items-end justify-between px-4 pb-2 font-bold text-[10px] uppercase tracking-wider text-stone-600 border-r"
                   style={{ width: LEFT_W, background:'#FAF7F1', borderColor:'#E8E2D8' }}>
                <span>Tâche</span>
                <button onClick={startInlineParent}
                        title="Ajouter une tâche parente (Entrée pour valider)"
                        className="text-stone-500 hover:text-stone-900 rounded p-0.5 -mb-0.5">
                  <Icons.Plus size={13}/>
                </button>
              </div>
              {/* Timeline header */}
              <div className="relative" style={{ width: totalWidth }}>
                {/* Months row */}
                <div className="absolute top-0 left-0 right-0 h-7 border-b" style={{ borderColor:'#E8E2D8' }}>
                  {months.map((m, i) => (
                    <div key={i} className="absolute h-full flex items-center px-2 text-xs font-semibold text-stone-700 truncate border-r"
                         style={{ left: m.offset, width: m.width, borderColor:'#F0EAE0' }}>
                      {m.label}
                    </div>
                  ))}
                </div>
                {/* Day ticks row */}
                <div className="absolute top-7 left-0 right-0 h-7">
                  {dayTicks.map((t, i) => (
                    <div key={i} className="absolute h-full flex items-end pb-1 justify-center text-[9px] text-stone-400 tabular-nums"
                         style={{ left: t.offset - 8, width: 16 }}>
                      {t.day}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="relative">
              {/* Today vertical line spanning all rows */}
              <div className="absolute top-0 bottom-0 z-10 pointer-events-none"
                   style={{ left: LEFT_W + todayOffset * dayPx, width: 2, background:'#0E5460', opacity: 0.5 }}>
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full" style={{ background:'#0E5460' }}/>
              </div>

              {rows.map((row, i) => {
                if (row.kind === 'inline-parent' || row.kind === 'inline-subtask') {
                  return (
                    <InlineNewRow key={`inl-${row.kind}-${row.groupId || 'top'}`}
                                  kind={row.kind === 'inline-parent' ? 'parent' : 'subtask'}
                                  rowH={ROW_H} leftW={LEFT_W} totalWidth={totalWidth}
                                  onCommit={commitInlineNew}
                                  onCancel={() => setInlineNew(null)}/>
                  );
                }
                if (row.kind === 'group') {
                  const gsc = STATUS_COLORS[row.group.status] || STATUS_COLORS.todo;
                  const isSelected = selectedGroupId === row.id;
                  const bg = isSelected ? '#E8F0F1' : '#FAF7F1';
                  return (
                    <div key={row.id} className="flex border-b" style={{ height: ROW_H, borderColor:'#F0EAE0', background: bg }}>
                      <div className="sticky left-0 z-[5] flex items-center px-3 border-r group/parent"
                           onClick={(e) => {
                             if (e.target.closest('button')) return;
                             setSelectedGroupId(row.id);
                             setSelectedId(null);
                           }}
                           onDoubleClick={() => setEditingGroup(row.group)}
                           style={{ width: LEFT_W, background: bg, borderColor:'#E8E2D8', cursor:'pointer' }}>
                        <button onClick={() => setExpanded({ ...expanded, [row.id]: expanded[row.id] === false })}
                                className="mr-2 text-stone-500 hover:text-stone-900">
                          <span className="inline-block transition-transform" style={{ transform: expanded[row.id] !== false ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▼</span>
                        </button>
                        <span className="w-2 h-2 rounded-full mr-2" style={{ background: gsc.dot }}/>
                        <span className="font-bold text-[11px] tracking-wider text-stone-800 flex-1 truncate">{row.label}</span>
                        <span className="text-[10px] font-semibold text-stone-500 tabular-nums mr-2">{row.span.duration}j</span>
                        <button onClick={(e) => { e.stopPropagation(); startInlineSubtask(row.id); }}
                                title="Ajouter une sous-tâche"
                                className="opacity-0 group-hover/parent:opacity-100 transition-opacity text-stone-500 hover:text-stone-900 rounded p-0.5">
                          <Icons.Plus size={12}/>
                        </button>
                      </div>
                      <div className="relative" style={{ width: totalWidth }}>
                        <GridBackground months={months}/>
                        {row.span.width > 0 && (
                          <div className="absolute rounded-sm"
                               style={{ left: row.span.offset, top: ROW_H/2 - 3, width: row.span.width, height: 6, background:'#1F2421' }}/>
                        )}
                      </div>
                    </div>
                  );
                }
                const t = row.task;
                const bar = taskBar(t);
                const sc = STATUS_COLORS[t.status] || STATUS_COLORS.todo;
                const startD = taskStartDate(t);
                const endD = taskEndDate(t);
                const isDragging = dragState?.taskId === t.id;
                const isSelected = selectedId === t.id;
                return (
                  <div key={t.id}
                       onClick={() => { setSelectedId(t.id); setSelectedGroupId(null); }}
                       onDoubleClick={() => setEditingTask({ mode:'edit', task: t, groupId: row.groupId })}
                       className={`flex border-b cursor-pointer ${isSelected ? '' : 'hover:bg-stone-50/60'}`}
                       style={{ height: ROW_H, borderColor:'#F5EFE3', background: isSelected ? '#E8F0F1' : undefined }}>
                    <div className="sticky left-0 z-[5] flex items-center px-3 border-r"
                         style={{ width: LEFT_W, borderColor:'#E8E2D8', background: isSelected ? '#E8F0F1' : 'white' }}>
                      <span className="w-2 h-2 rounded-full ml-6 mr-3" style={{ background: sc.dot }}/>
                      <span className={`text-[11px] tracking-wider flex-1 truncate ${isSelected ? 'text-stone-900 font-semibold' : 'text-stone-700'}`}>{t.label}</span>
                      <span className="text-[10px] font-semibold text-stone-400 tabular-nums">{t.duration}j</span>
                    </div>
                    <div className="relative" style={{ width: totalWidth }}>
                      <GridBackground months={months}/>
                      {isSelected && <div className="absolute inset-0 pointer-events-none" style={{ background: 'rgba(14,84,96,0.05)' }}/>}
                      <div data-task-bar
                           className={`absolute rounded shadow-sm transition-[filter] hover:brightness-110 select-none flex items-center justify-end pr-1.5 ${isDragging ? 'ring-2 ring-offset-1' : ''} ${isSelected ? 'ring-1' : ''}`}
                           onMouseDown={(e) => onBarMouseDown(e, t)}
                           onMouseEnter={(e) => !dragState && setHoverTask({ task: t, x: e.clientX, y: e.clientY, startD, endD })}
                           onMouseMove={(e) => !dragState && setHoverTask({ task: t, x: e.clientX, y: e.clientY, startD, endD })}
                           onMouseLeave={() => setHoverTask(null)}
                           style={{ left: bar.offset, top: ROW_H/2 - 9, width: Math.max(2, bar.width), height: 18, background: sc.bar, cursor: isDragging ? 'grabbing' : 'grab', '--tw-ring-color': '#0E5460' }}>
                        {(ctx.assignments[t.id]?.length || 0) > 0 && bar.width >= 28 && (
                          <span className="text-[9px] font-bold text-white/90 tabular-nums">{ctx.assignments[t.id].length}👤</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card>

      {hoverTask && (
        <div className="fixed z-50 bg-white rounded-lg shadow-xl border px-3 py-2 text-xs pointer-events-none"
             style={{ left: hoverTask.x + 12, top: hoverTask.y + 12, borderColor:'#E8E2D8', maxWidth: 260 }}>
          <div className="font-bold text-stone-900 mb-1">{hoverTask.task.label}</div>
          <div className="flex items-center gap-1.5 mb-1">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[hoverTask.task.status].dot }}/>
            <span className="text-stone-500">{STATUS_COLORS[hoverTask.task.status].label}</span>
          </div>
          <div className="text-stone-600">{frenchDay(hoverTask.startD)} → {frenchDay(hoverTask.endD)}</div>
          <div className="text-stone-500 mt-0.5"><b className="text-stone-700 tabular-nums">{hoverTask.task.duration}</b> jours ouvrés</div>
        </div>
      )}

      {dragState && (() => {
        const task = plan.flatMap(g => g.children).find(t => t.id === dragState.taskId);
        if (!task) return null;
        const s = taskStartDate(task);
        const e = taskEndDate(task);
        return (
          <div className="fixed left-1/2 -translate-x-1/2 top-24 z-50 bg-stone-900 text-white px-3 py-2 rounded-lg shadow-xl text-xs flex items-center gap-3 pointer-events-none">
            <div className="font-bold tracking-wider">{task.label}</div>
            <div className="opacity-80">{frenchDay(s)} → {frenchDay(e)}</div>
            <div className="opacity-60">·</div>
            <div className="tabular-nums">{task.duration}j</div>
          </div>
        );
      })()}
      {editingTask && (
        <TaskEditModal
          mode={editingTask.mode}
          task={editingTask.task}
          groupId={editingTask.groupId}
          plan={plan}
          chantier={CHANTIERS.find(c => c.id === chantierId)}
          initialStart={editingTask.task ? taskStartDate(editingTask.task) : null}
          onSave={(updated, gId) => { saveTask(updated, gId); setEditingTask(null); setSelectedId(updated.id); }}
          onDelete={() => { deleteTask(editingTask.task.id); setEditingTask(null); }}
          onClose={() => setEditingTask(null)}/>
      )}
      {editingGroup && (
        <GroupEditModal
          group={editingGroup}
          onSave={(patch) => { saveGroup(editingGroup.id, patch); setEditingGroup(null); }}
          onDelete={() => { deleteGroup(editingGroup.id); setEditingGroup(null); }}
          onClose={() => setEditingGroup(null)}/>
      )}
    </div>
  );
}

function toISODate(d) {
  const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function TaskEditModal({ mode, task, groupId, plan, chantier, initialStart, onSave, onDelete, onClose }) {
  const [label, setLabel] = usePlState(task?.label || '');
  const [groupSel, setGroupSel] = usePlState(groupId || '__none__');
  const [startStr, setStartStr] = usePlState(initialStart ? toISODate(initialStart) : '');
  const [duration, setDuration] = usePlState(task?.duration || 5);
  const [status, setStatus] = usePlState(task?.status || 'todo');

  // End date of a persisted task, ignoring drag overrides (they're previews,
  // not authoritative).
  function endOfTask(t) {
    const s = dateFromYMD(t.start[0], t.start[1], t.start[2]);
    return addDaysD(s, t.duration - 1);
  }

  // Sequential placement: when the user leaves the start date empty, chain
  // after the last task in the chosen scope.
  function computeSequentialStart() {
    let pool;
    if (groupSel === '__none__') {
      pool = plan.flatMap(g => g.children);
    } else {
      const g = plan.find(x => x.id === groupSel);
      pool = (g && g.children) || [];
    }
    if (pool.length === 0) {
      if (chantier && chantier.dateStart) {
        const [y, m, d] = chantier.dateStart.split('-').map(Number);
        return dateFromYMD(y, m - 1, d);
      }
      return new Date();
    }
    let latest = endOfTask(pool[0]);
    for (let i = 1; i < pool.length; i++) {
      const e = endOfTask(pool[i]);
      if (e > latest) latest = e;
    }
    return addDaysD(latest, 1);
  }

  function save() {
    if (!label.trim()) return;
    let y, m, d;
    if (startStr) {
      [y, m, d] = startStr.split('-').map(Number);
    } else {
      const seq = computeSequentialStart();
      y = seq.getFullYear();
      m = seq.getMonth() + 1;
      d = seq.getDate();
    }
    const updated = {
      ...(task || {}),
      id: task?.id || ('t-' + Date.now().toString(36)),
      label: label.trim(),
      start: [y, m - 1, d],
      duration: Math.max(1, parseInt(duration, 10) || 1),
      status,
    };
    onSave(updated, groupSel);
  }

  const isParent = groupSel === '__none__';

  return (
    <Modal title={mode === 'create'
                    ? (isParent ? 'Nouvelle tâche parente' : 'Nouvelle sous-tâche')
                    : 'Modifier la tâche'}
           onClose={onClose} width="max-w-lg">
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">Nom</div>
          <input className="bati-input" autoFocus value={label} onChange={e => setLabel(e.target.value)}
                 placeholder={isParent ? 'ex. GROS ŒUVRE, ÉTANCHÉITÉ…' : 'ex. DALLAGES, MAÇONNERIE…'}/>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">Tâche parente</div>
          <select className="bati-input" value={groupSel} onChange={e => setGroupSel(e.target.value)}>
            <option value="__none__">— Aucune (tâche principale)</option>
            {plan.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          </select>
        </div>

        {!isParent && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">Durée (jours)</div>
              <input type="number" min="1" className="bati-input" value={duration} onChange={e => setDuration(e.target.value)}/>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">Statut</div>
              <select className="bati-input" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUS_ORDER.map(k => <option key={k} value={k}>{STATUS_COLORS[k].label}</option>)}
              </select>
            </div>
          </div>
        )}

        {isParent && (
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">Statut</div>
            <select className="bati-input" value={status} onChange={e => setStatus(e.target.value)}>
              {STATUS_ORDER.map(k => <option key={k} value={k}>{STATUS_COLORS[k].label}</option>)}
            </select>
          </div>
        )}

        {!isParent && (
          <div>
            <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">Date de début</div>
            <input type="date" className="bati-input" value={startStr} onChange={e => setStartStr(e.target.value)}/>
            <div className="text-[11px] text-stone-500 mt-1">Vide = séquentiel (juste après la dernière sous-tâche)</div>
          </div>
        )}

        {isParent && (
          <div className="text-[11px] text-stone-500 bg-stone-50 rounded-lg p-2.5" style={{ background:'#FAF7F1' }}>
            Une tâche parente est un conteneur. Sa durée et ses dates seront calculées automatiquement à partir des sous-tâches que vous lui ajouterez ensuite.
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor:'#F0EAE0' }}>
          {mode === 'edit' ? (
            <button onClick={onDelete} className="text-xs font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1">
              <Icons.Trash size={12}/> Supprimer
            </button>
          ) : <span/>}
          <div className="flex gap-2">
            <Btn onClick={onClose}>Annuler</Btn>
            <Btn variant="primary" onClick={save} disabled={!label.trim()}>
              Enregistrer
            </Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function GroupEditModal({ group, onSave, onDelete, onClose }) {
  const [label, setLabel] = usePlState(group.label || '');
  const [status, setStatus] = usePlState(group.status || 'todo');

  function save() {
    if (!label.trim()) return;
    onSave({ label: label.trim(), status });
  }

  function handleDelete() {
    const n = (group.children || []).length;
    const msg = n > 0
      ? `Supprimer « ${group.label} » et ses ${n} sous-tâche${n > 1 ? 's' : ''} ?`
      : `Supprimer « ${group.label} » ?`;
    if (window.confirm(msg)) onDelete();
  }

  return (
    <Modal title="Modifier la tâche parente" onClose={onClose} width="max-w-md">
      <div className="space-y-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">Nom</div>
          <input className="bati-input" autoFocus value={label} onChange={e => setLabel(e.target.value)}/>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5">Statut</div>
          <select className="bati-input" value={status} onChange={e => setStatus(e.target.value)}>
            {STATUS_ORDER.map(k => <option key={k} value={k}>{STATUS_COLORS[k].label}</option>)}
          </select>
        </div>
        <div className="text-[11px] text-stone-500">
          {(group.children || []).length} sous-tâche{(group.children || []).length > 1 ? 's' : ''}
        </div>
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor:'#F0EAE0' }}>
          <button onClick={handleDelete} className="text-xs font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1">
            <Icons.Trash size={12}/> Supprimer
          </button>
          <div className="flex gap-2">
            <Btn onClick={onClose}>Annuler</Btn>
            <Btn variant="primary" onClick={save} disabled={!label.trim()}>Enregistrer</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Inline row used inside the Planning gantt to spawn a new parent or subtask
// without opening a modal. Renders as a regular row but with an autofocused
// name input. Enter commits, Escape cancels, blur commits if non-empty.
function InlineNewRow({ kind, rowH, leftW, totalWidth, onCommit, onCancel }) {
  const { useState, useRef } = React;
  const [value, setValue] = useState('');
  const doneRef = useRef(false);
  const isParent = kind === 'parent';
  const dot = STATUS_COLORS.todo.dot;

  function commit() {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(value);
  }
  function cancel() {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  }
  function onKey(e) {
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  }
  function onBlur() {
    if (value.trim()) commit(); else cancel();
  }

  const bg = isParent ? '#FAF7F1' : 'white';
  return (
    <div className="flex border-b" style={{ height: rowH, borderColor:'#F0EAE0', background: bg }}>
      <div className="sticky left-0 z-[5] flex items-center px-3 border-r"
           style={{ width: leftW, background: bg, borderColor:'#E8E2D8' }}>
        {isParent ? (
          <>
            <span className="inline-block mr-2 text-stone-400">▼</span>
            <span className="w-2 h-2 rounded-full mr-2" style={{ background: dot }}/>
          </>
        ) : (
          <span className="w-2 h-2 rounded-full ml-6 mr-3" style={{ background: dot }}/>
        )}
        <input autoFocus value={value}
               onChange={e => setValue(e.target.value)}
               onKeyDown={onKey}
               onBlur={onBlur}
               placeholder={isParent
                 ? 'Nouvelle tâche parente — Entrée pour valider, Échap pour annuler'
                 : 'Nouvelle sous-tâche — Entrée pour valider, Échap pour annuler'}
               className={`flex-1 bg-transparent outline-none border-b border-dashed min-w-0 ${isParent ? 'font-bold text-[11px] uppercase tracking-wider' : 'text-[11px] tracking-wider'} text-stone-900`}
               style={{ borderColor: '#0E5460', padding: '2px 4px' }}/>
        {!isParent && <span className="text-[10px] font-semibold text-stone-400 tabular-nums ml-2">5j</span>}
      </div>
      <div className="relative" style={{ width: totalWidth }}/>
    </div>
  );
}

window.Planning = Planning;
window.PLAN_VILLA_SEED = PLAN_VILLA_SEED;
window.PLANS_SEED = PLANS_SEED;
window.STATUS_COLORS = STATUS_COLORS;
window.STATUS_ORDER = STATUS_ORDER;
window.TIMELINE_START_DATE = TIMELINE_START;
window.dateFromYMD = dateFromYMD;
window.addDaysD = addDaysD;
window.daysBetween = daysBetween;
window.frenchDay = frenchDay;

function GridBackground({ months }) {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {months.map((m, i) => (
        <div key={i} className="absolute top-0 bottom-0 border-r" style={{ left: m.offset, width: m.width, borderColor:'#F0EAE0' }}/>
      ))}
    </div>
  );
}
