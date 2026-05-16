// Pointage — main screen with Quinzaine + Mois entier views
const { useState: usePoState, useEffect: usePoEff, useRef: usePoRef, useMemo: usePoMemo } = React;

function getCell(pointage, workerId, dk) {
  return pointage[workerId]?.[dk];
}

function workerJoursPresents(pointage, workerId, year, monthIdx, dayStart, dayEnd) {
  let count = 0, primes = 0;
  for (let d = dayStart; d <= dayEnd; d++) {
    const dk = dateKey(year, monthIdx, d);
    const c = pointage[workerId]?.[dk];
    if (c?.statut === 'P') {
      count++;
      if (c.prime) primes += c.prime;
    }
  }
  return { count, primes };
}

// ─── Quinzaine view ───────────────────────────────────────────
function PointageQuinzaine({ ctx, currentQ, onSwitchQ, onSwitchMois }) {
  const { year, monthIdx, half } = currentQ;
  const { start: dayStart, end: dayEnd } = quinzaineRange(year, monthIdx, half);
  const days = [];
  for (let d = dayStart; d <= dayEnd; d++) days.push(d);

  const qkey = quinzaineKey(year, monthIdx, half);
  const qState = ctx.qStates[qkey]?.state || 'En cours';

  // Chantier scope is global (topbar switcher) — read from ctx.
  const filterChantier = ctx.currentChantierId || 'all';
  const [filterRole, setFilterRole] = usePoState('all');
  const [search, setSearch] = usePoState('');
  const [popCell, setPopCell] = usePoState(null); // { workerId, day, anchor }
  const [selected, setSelected] = usePoState(new Set()); // bulk selection
  const [dragging, setDragging] = usePoState(null); // {workerId, day} start
  const [auditOpen, setAuditOpen] = usePoState(false);
  const [showCopyConfirm, setShowCopyConfirm] = usePoState(false);

  // Rows are NOT filtered by chantier — chantier scope is applied at the cell
  // level (popover default = ctx.currentChantierId) and to cost rollups. Filtering
  // rows would hide newly-added workers who have no pointage entries yet, blocking
  // the user from recording their first entry.
  const filteredWorkers = OUVRIERS.filter(w => {
    if (filterRole !== 'all' && w.role !== filterRole) return false;
    if (search && !w.nom.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Compute totals
  const totals = usePoMemo(() => {
    let grand = 0;
    const perChantier = {};
    const perDay = {};
    const perWorker = {};
    days.forEach(d => perDay[d] = { count: 0, cost: 0 });
    OUVRIERS.forEach(w => {
      perWorker[w.id] = { count: 0, brut: 0, primes: 0, chantiers: {} };
      days.forEach(d => {
        const c = ctx.pointage[w.id]?.[dateKey(year, monthIdx, d)];
        if (c?.statut === 'P') {
          const base = w.tarif;
          const prime = c.prime || 0;
          grand += base + prime;
          perDay[d].count++;
          perDay[d].cost += base + prime;
          perWorker[w.id].count++;
          perWorker[w.id].brut += base;
          perWorker[w.id].primes += prime;
          perWorker[w.id].chantiers[c.chantierId] = (perWorker[w.id].chantiers[c.chantierId] || 0) + 1;
          perChantier[c.chantierId] = (perChantier[c.chantierId] || 0) + base + prime;
        }
      });
    });
    return { grand, perChantier, perDay, perWorker };
  }, [ctx.pointage, year, monthIdx, half]);

  // Keyboard navigation
  const gridRef = usePoRef(null);
  const setCellValue = (workerId, day, value) => {
    const dk = dateKey(year, monthIdx, day);
    ctx.updateCell(workerId, dk, value);
  };

  const handleCellClick = (e, workerId, day) => {
    if (isLocked) return;
    if (e.shiftKey) {
      // toggle in selection
      const key = `${workerId}|${day}`;
      const next = new Set(selected);
      next.has(key) ? next.delete(key) : next.add(key);
      setSelected(next);
      return;
    }
    setSelected(new Set());
    setPopCell({ workerId, day, anchor: e.currentTarget });
  };

  const handleMouseDown = (e, workerId, day) => {
    if (isLocked) return;
    if (e.shiftKey) return;
    setDragging({ workerId, day });
  };
  const handleMouseEnter = (workerId, day) => {
    if (!dragging) return;
    // Build a rectangular selection
    const wStart = OUVRIERS.findIndex(w => w.id === dragging.workerId);
    const wEnd = OUVRIERS.findIndex(w => w.id === workerId);
    const dStart = dragging.day, dEnd = day;
    const w1 = Math.min(wStart, wEnd), w2 = Math.max(wStart, wEnd);
    const d1 = Math.min(dStart, dEnd), d2 = Math.max(dStart, dEnd);
    const next = new Set();
    for (let wi = w1; wi <= w2; wi++) {
      for (let di = d1; di <= d2; di++) {
        next.add(`${OUVRIERS[wi].id}|${di}`);
      }
    }
    setSelected(next);
  };
  const handleMouseUp = () => setDragging(null);

  usePoEff(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const applyBulk = (statut, chantierId) => {
    selected.forEach(key => {
      const [wid, dStr] = key.split('|');
      const d = parseInt(dStr, 10);
      const dk = dateKey(year, monthIdx, d);
      ctx.updateCell(wid, dk, statut === 'A' ? { statut:'A' } : { statut:'P', chantierId });
    });
    setSelected(new Set());
  };

  const copyPrev = () => {
    const prev = previousQuinzaine(year, monthIdx, half);
    const { start: ps, end: pe } = quinzaineRange(prev.year, prev.monthIdx, prev.half);
    OUVRIERS.forEach(w => {
      for (let i = 0; i < days.length; i++) {
        const targetDay = days[i];
        const sourceDay = ps + i;
        if (sourceDay > pe) break;
        const sdk = dateKey(prev.year, prev.monthIdx, sourceDay);
        const tdk = dateKey(year, monthIdx, targetDay);
        const src = ctx.pointage[w.id]?.[sdk];
        if (src) {
          ctx.updateCell(w.id, tdk, { statut: src.statut, ...(src.chantierId && { chantierId: src.chantierId }) }, { silent: true });
        }
      }
    });
    setShowCopyConfirm(false);
  };

  const lifecycleAction = () => {
    if (qState === 'En cours') ctx.setQState(qkey, { state: 'Clôturée', closedDate: new Date().toISOString().slice(0,10) });
  };
  const reopen = () => {
    ctx.setQState(qkey, { state: 'En cours' });
  };
  const isLocked = qState !== 'En cours';

  const daysRemaining = (() => {
    if (qState !== 'En cours') return null;
    if (year !== TODAY.year || monthIdx !== TODAY.monthIdx) return null;
    const rem = dayEnd - TODAY.day;
    return rem >= 0 ? rem : 0;
  })();

  const auditEntries = ctx.audit.filter(a => a.qkey === qkey).slice(0, 50);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Quinzaine selector */}
        <QuinzaineSelector currentQ={currentQ} onChange={onSwitchQ} chantierFilter={filterChantier}/>

        <StatusPill state={qState}/>

        {daysRemaining !== null && (
          <span className="text-xs text-stone-600 inline-flex items-center gap-1.5">
            <Icons.Clock size={13}/>
            <span><b>{daysRemaining}</b> jours restants</span>
          </span>
        )}

        <div className="ml-auto flex items-center gap-3 flex-shrink-0">
          {/* Live total */}
          <div className="text-right group relative">
            <div className="text-[11px] uppercase tracking-wider text-stone-500 font-medium whitespace-nowrap">Coût quinzaine</div>
            <div className="text-2xl font-bold tabular-nums whitespace-nowrap" style={{ color:'#0E5460' }}>
              {formatMADCompact(totals.grand)}
            </div>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-white shadow-xl border rounded-lg p-3 w-64 z-30" style={{ borderColor:'#E8E2D8' }}>
              <div className="text-xs font-semibold text-stone-700 mb-2">Répartition par chantier</div>
              {CHANTIERS.map(c => (
                <div key={c.id} className="flex items-center justify-between text-sm py-0.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background:c.color }}/>
                    <span className="truncate text-stone-600">{c.name}</span>
                  </div>
                  <span className="tabular-nums font-medium">{formatMADCompact(totals.perChantier[c.id]||0)}</span>
                </div>
              ))}
            </div>
          </div>

          {qState === 'En cours' ? (
            <Btn variant="primary" onClick={lifecycleAction}>Clôturer la quinzaine</Btn>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background:'#FBEBD3', color:'#8A5114' }}>
              <Icons.Check size={14}/>
              <span className="text-xs font-semibold">Clôturée — verrouillée</span>
              <button onClick={reopen}
                      className="ml-1 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded hover:bg-white/60 transition inline-flex items-center gap-1">
                <Icons.History size={11}/>
                Réouvrir
              </button>
            </div>
          )}
        </div>
      </div>

      {/* View toggle row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-stone-100 rounded-lg p-0.5">
          <button className="px-3 py-1.5 text-xs font-semibold rounded-md bg-white shadow-sm">Quinzaine</button>
          <button onClick={onSwitchMois} className="px-3 py-1.5 text-xs font-semibold rounded-md text-stone-500 hover:text-stone-800">Mois entier</button>
        </div>

        <div className="h-6 w-px bg-stone-200"/>

        <div className="flex items-center gap-2 flex-wrap text-sm">
          {/* Chantier filter is now global (topbar switcher) — no per-page <select>. */}
          <select value={filterRole} onChange={e => setFilterRole(e.target.value)}
                  className="bg-white border border-stone-200 rounded-lg px-3 py-1.5 text-xs">
            <option value="all">Tous les rôles</option>
            {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
          <div className="relative">
            <Icons.Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
                   placeholder="Rechercher un ouvrier…"
                   className="bg-white border border-stone-200 rounded-lg pl-7 pr-3 py-1.5 text-xs w-44 focus:outline-none focus:border-stone-400"/>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Btn size="sm" icon={<Icons.Copy size={13}/>} onClick={() => setShowCopyConfirm(true)}
               disabled={isLocked}>
            Copier la quinzaine précédente
          </Btn>
        </div>
      </div>

      {/* Grid */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto" ref={gridRef}>
          <table className="bati-grid w-full" style={{ minWidth: 1200 }}>
            <thead>
              <tr>
                <th className="bati-sticky-l text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-stone-500" style={{ minWidth: 240 }}>
                  Ouvrier
                </th>
                {days.map(d => {
                  const dow = dayOfWeek(year, monthIdx, d);
                  return (
                    <th key={d} className="text-center px-1 py-2 font-semibold text-[11px] text-stone-500 border-l" style={{ borderColor:'#F0EAE0', minWidth: 40 }}>
                      <div className="text-stone-700 text-sm font-bold tabular-nums">{d}</div>
                      <div className="text-[10px] font-medium text-stone-400">{JOURS_FR[dow]}</div>
                    </th>
                  );
                })}
                <th className="text-right px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-stone-500 border-l"
                    style={{ position:'sticky', right: 0, zIndex: 2, background:'#fff', borderColor:'#E8E2D8', minWidth: 200 }}>
                  Total par ouvrier
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredWorkers.map((w, wIdx) => {
                const summary = totals.perWorker[w.id];
                return (
                  <tr key={w.id} className="border-t" style={{ borderColor:'#F0EAE0' }}>
                    <td className="bati-sticky-l px-3 py-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar worker={w} size={32}/>
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-stone-900 truncate">{w.nom}</div>
                          <div className="text-[11px] text-stone-500">{w.role} · {formatMADCompact(w.tarif)}/j</div>
                        </div>
                      </div>
                    </td>
                    {days.map(d => {
                      const dk = dateKey(year, monthIdx, d);
                      const c = ctx.pointage[w.id]?.[dk];
                      const selKey = `${w.id}|${d}`;
                      const isSel = selected.has(selKey);
                      const ch = c?.chantierId ? CHANTIERS.find(x => x.id === c.chantierId) : null;
                      const isEdited = ctx.editedKeys.has(`${w.id}|${dk}`) && qState !== 'En cours';
                      return (
                        <td key={d} className="border-l p-0" style={{ borderColor:'#F0EAE0' }}>
                          <button
                            onClick={(e) => handleCellClick(e, w.id, d)}
                            onMouseDown={(e) => handleMouseDown(e, w.id, d)}
                            onMouseEnter={() => handleMouseEnter(w.id, d)}
                            disabled={isLocked}
                            data-date-label={frenchDate(year, monthIdx, d)}
                            className={`w-full h-12 relative flex items-center justify-center transition ${isSel ? 'ring-2 ring-inset' : ''} ${isLocked ? 'cursor-default' : ''}`}
                            style={{
                              background: 'transparent',
                              '--tw-ring-color': '#0E5460',
                              backgroundImage: !c ? 'radial-gradient(#E8E2D8 1px, transparent 1px)' : undefined,
                              backgroundSize: !c ? '6px 6px' : undefined
                            }}>
                            {c?.statut === 'P' && (
                              <span className="w-3.5 h-3.5 rounded-full"
                                    style={{ background:'#2E9152' }}
                                    title={ch ? ch.name : ''}/>
                            )}
                            {c?.statut === 'A' && <span className="w-3.5 h-3.5 rounded-full" style={{ background:'#E0832E' }}/>}
                            {!c && <span className="text-stone-300 text-sm leading-none">–</span>}
                            {c?.prime > 0 && (
                              <span className="absolute top-0.5 right-0.5 text-[8.5px] font-bold px-1 rounded text-white"
                                    style={{ background:'#C58122' }}>
                                +{Math.round(c.prime)}
                              </span>
                            )}
                            {isEdited && (
                              <span className="absolute bottom-0.5 right-0.5 text-stone-400" title="Modifié après clôture">
                                <Icons.History size={9}/>
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 border-l text-right"
                        style={{ position:'sticky', right: 0, zIndex: 1, background:'#fff', borderColor:'#E8E2D8' }}>
                      <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">{summary.count} jour{summary.count>1?'s':''}</div>
                      <div className="font-bold tabular-nums text-stone-900">
                        {formatMADCompact(summary.brut)}
                        {summary.primes > 0 && (
                          <span className="text-green-700 ml-1 text-xs">+{Math.round(summary.primes)}</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Bottom summary row */}
              <tr className="border-t-2" style={{ borderColor:'#E8E2D8', background:'#FAF7F1' }}>
                <td className="bati-sticky-l px-3 py-2.5 font-semibold text-xs text-stone-700" style={{ background:'#FAF7F1' }}>
                  Total du jour
                </td>
                {days.map(d => (
                  <td key={d} className="border-l px-1 py-2 text-center" style={{ borderColor:'#F0EAE0' }}>
                    {totals.perDay[d].cost > 0 ? (
                      <>
                        <div className="text-[11px] font-bold tabular-nums text-stone-800 leading-tight">
                          {Math.round(totals.perDay[d].cost)}
                        </div>
                        <div className="text-[9px] font-medium text-stone-400 tracking-wider leading-tight">DH</div>
                      </>
                    ) : (
                      <div className="text-[11px] font-medium tabular-nums text-stone-400">—</div>
                    )}
                  </td>
                ))}
                <td className="border-l px-3 py-2.5 text-right"
                    style={{ position:'sticky', right: 0, zIndex: 1, background:'#FAF7F1', borderColor:'#E8E2D8' }}>
                  <div className="text-[10px] uppercase tracking-wider text-stone-500 font-medium">Total quinzaine</div>
                  <div className="font-bold text-base tabular-nums" style={{ color:'#0E5460' }}>{formatMADCompact(totals.grand)}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {filteredWorkers.length === 0 && (
          <EmptyState icon={<Icons.Search size={20}/>} title="Aucun ouvrier ne correspond"
                      hint="Ajustez les filtres ou la recherche pour voir les pointages."/>
        )}
      </Card>

      {/* Audit drawer trigger */}
      <div className="flex items-center justify-between text-xs">
        <button onClick={() => setAuditOpen(true)}
                className="text-stone-500 hover:text-stone-800 inline-flex items-center gap-1.5">
          <Icons.History size={13}/>
          Historique des modifications ({ctx.audit.filter(a => a.qkey === qkey).length})
        </button>
        <div className="text-stone-400">
          {isLocked
            ? 'Quinzaine clôturée — les pointages sont verrouillés. Cliquez "Réouvrir" pour modifier.'
            : 'Astuce: Maj+clic pour sélection multiple · ⌘+Entrée pour enregistrer'}
        </div>
      </div>

      {/* Popovers + drawers */}
      {popCell && (() => {
        const cell = ctx.pointage[popCell.workerId]?.[dateKey(year, monthIdx, popCell.day)];
        const worker = OUVRIERS.find(w => w.id === popCell.workerId);
        const dk = dateKey(year, monthIdx, popCell.day);
        popCell.anchor.dataset.dateLabel = frenchDate(year, monthIdx, popCell.day);
        const suggestion = window.suggestChantierForDay
          ? window.suggestChantierForDay(popCell.workerId, dk, ctx.plans, ctx.assignments)
          : null;
        const suggestedChantierId = suggestion?.chantierId || null;
        const suggestedTaskLabel = suggestion?.taskLabel || null;
        return (
          <CellPopover open={true} anchor={popCell.anchor} cell={cell} worker={worker}
                       suggestedChantierId={suggestedChantierId}
                       suggestedTaskLabel={suggestedTaskLabel}
                       onClose={() => setPopCell(null)}
                       onSave={(v) => { setCellValue(popCell.workerId, popCell.day, v); setPopCell(null); }}
                       onDelete={() => { setCellValue(popCell.workerId, popCell.day, null); setPopCell(null); }}/>
        );
      })()}

      <BulkPopover count={selected.size} onApply={applyBulk} onClear={() => setSelected(new Set())}/>

      {auditOpen && <AuditDrawer entries={auditEntries} qkey={qkey} onClose={() => setAuditOpen(false)}/>}

      {showCopyConfirm && (
        <Modal onClose={() => setShowCopyConfirm(false)} title="Copier la quinzaine précédente ?">
          <p className="text-sm text-stone-600 mb-4">
            Les pointages de la quinzaine précédente seront recopiés pour les jours correspondants.
            Les cellules déjà remplies seront écrasées.
          </p>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setShowCopyConfirm(false)}>Annuler</Btn>
            <Btn variant="primary" onClick={copyPrev}>Copier</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RowAction({ children, onClick, title, color }) {
  return (
    <button onClick={onClick} title={title}
            className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold border border-stone-200 hover:scale-105 transition"
            style={{ color }}>{children}</button>
  );
}

// ─── Quinzaine selector dropdown ──────────────────────────────
function QuinzaineSelector({ currentQ, onChange, chantierFilter }) {
  const [open, setOpen] = usePoState(false);

  // Determine the project's start: earliest dateStart across the applicable
  // chantiers. With a chantier filter active, use only that one; otherwise
  // span all chantiers. If we somehow have none (shouldn't happen — the
  // onboarding gate enforces ≥1), default to the current quinzaine alone.
  function qFromISO(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const day = parseInt(m[3], 10);
    return { year: parseInt(m[1], 10), monthIdx: parseInt(m[2], 10) - 1, half: day <= 15 ? 1 : 2 };
  }
  function qOrd(q) { return q.year * 24 + q.monthIdx * 2 + q.half; }

  const cq = currentQuinzaine();
  const applicable = (typeof CHANTIERS !== 'undefined' && Array.isArray(CHANTIERS))
    ? CHANTIERS.filter(c => !chantierFilter || chantierFilter === 'all' || c.id === chantierFilter)
    : [];

  let earliestQ = cq;
  for (const c of applicable) {
    const q = qFromISO(c.dateStart);
    if (q && qOrd(q) < qOrd(earliestQ)) earliestQ = q;
  }

  // Generate options from earliest project quinzaine up to (and including) the
  // current quinzaine. Never list anything in the future.
  const options = [];
  {
    let q = { ...earliestQ };
    const cqOrd = qOrd(cq);
    let safety = 0;
    while (qOrd(q) <= cqOrd && safety < 240) {
      options.push({ ...q });
      q = nextQuinzaine(q.year, q.monthIdx, q.half);
      safety++;
    }
  }
  const label = quinzaineLabel(currentQ.year, currentQ.monthIdx, currentQ.half);

  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
              className="inline-flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm hover:bg-stone-50">
        <Icons.Calendar size={14} className="text-stone-500"/>
        <span className="font-semibold">{label}</span>
        <Icons.ChevronDown size={14} className="text-stone-400"/>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)}/>
          <div className="absolute top-full left-0 mt-1 bg-white border rounded-xl shadow-xl z-40 w-72 max-h-80 overflow-y-auto"
               style={{ borderColor:'#E8E2D8' }}>
            {options.map(o => {
              const isCurrent = o.year === currentQ.year && o.monthIdx === currentQ.monthIdx && o.half === currentQ.half;
              const isPresent = (() => {
                const cq = currentQuinzaine();
                return o.year === cq.year && o.monthIdx === cq.monthIdx && o.half === cq.half;
              })();
              const state = QUINZAINE_STATES[quinzaineKey(o.year, o.monthIdx, o.half)]?.state || 'En cours';
              return (
                <button key={`${o.year}-${o.monthIdx}-${o.half}`}
                        onClick={() => { onChange(o); setOpen(false); }}
                        className={`w-full text-left px-3 py-2 hover:bg-stone-50 flex items-center justify-between border-b last:border-b-0 ${isCurrent ? 'bg-stone-50' : ''}`}
                        style={{ borderColor:'#F0EAE0' }}>
                  <div>
                    <div className="font-medium text-sm">{quinzaineLabel(o.year, o.monthIdx, o.half)}</div>
                    {isPresent && <div className="text-[10px] text-stone-500">Quinzaine actuelle</div>}
                  </div>
                  <StatusPill state={state}/>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Audit drawer ─────────────────────────────────────────────
function AuditDrawer({ entries, qkey, onClose }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose}/>
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col"
           style={{ borderLeft:'1px solid #E8E2D8' }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor:'#EDE6D8' }}>
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500 font-medium">Historique</div>
            <div className="font-bold">{qkey.replace('-Q','  ·  Q')}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-stone-100"><Icons.X size={18}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {entries.length === 0 && <EmptyState icon={<Icons.History size={20}/>} title="Aucune modification" hint="Les modifications après clôture apparaîtront ici."/>}
          {entries.map(e => {
            const w = OUVRIERS.find(o => o.id === e.workerId);
            return (
              <div key={e.id} className="flex gap-3 pb-3 border-b" style={{ borderColor:'#F0EAE0' }}>
                <div className="w-1 rounded-full flex-shrink-0" style={{ background:'#C58122' }}/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm">
                    <span className="font-semibold">{e.user}</span> a modifié <span className="font-semibold">{w?.nom}</span> · <span className="text-stone-600">{e.field}</span>
                  </div>
                  <div className="text-xs text-stone-500 mt-0.5">
                    <span className="line-through">{e.oldVal}</span>
                    <Icons.Arrow size={11} className="inline mx-1"/>
                    <span className="font-medium text-stone-700">{e.newVal}</span>
                  </div>
                  <div className="text-[11px] text-stone-400 mt-1">{relativeTime(new Date(e.ts))}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Modal ────────────────────────────────────────────────────
function Modal({ children, onClose, title, width='max-w-md' }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50" onClick={onClose}/>
      <div className={`fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl z-50 w-full ${width} mx-4`}
           style={{ border:'1px solid #E8E2D8' }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor:'#EDE6D8' }}>
          <div className="font-bold">{title}</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-stone-100"><Icons.X size={16}/></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </>
  );
}

window.PointageQuinzaine = PointageQuinzaine;
window.Modal = Modal;
