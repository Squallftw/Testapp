// Mois entier view — read-only analytics
const { useState: useMoState, useMemo: useMoMemo } = React;

function PointageMois({ ctx, currentMonth, onSwitchMonth, onSwitchQuinzaine }) {
  const { year, monthIdx } = currentMonth;
  const dim = daysInMonth(year, monthIdx);
  const days = [];
  for (let d = 1; d <= dim; d++) days.push(d);
  const q1End = 15;

  // Chantier scope is global (topbar switcher) — read from ctx.
  const filterChantier = ctx.currentChantierId || 'all';
  const [hoverCell, setHoverCell] = useMoState(null);
  const [dayPanel, setDayPanel] = useMoState(null);

  const data = useMoMemo(() => {
    const perWorker = {};
    const perDayTotal = {};
    const dayHasPrime = {};
    days.forEach(d => { perDayTotal[d] = 0; dayHasPrime[d] = false; });
    OUVRIERS.forEach(w => {
      const row = { q1Days: 0, q1Cost: 0, q2Days: 0, q2Cost: 0, total: 0, hist: [] };
      days.forEach(d => {
        const dk = dateKey(year, monthIdx, d);
        const c = ctx.pointage[w.id]?.[dk];
        let counts = true;
        if (filterChantier !== 'all' && c?.statut === 'P' && c.chantierId !== filterChantier) counts = false;
        if (c?.statut === 'P' && counts) {
          const cost = w.tarif + (c.prime || 0);
          if (d <= q1End) { row.q1Days++; row.q1Cost += cost; }
          else { row.q2Days++; row.q2Cost += cost; }
          row.total += cost;
          perDayTotal[d] += cost;
          if (c.prime) dayHasPrime[d] = true;
        }
      });
      perWorker[w.id] = row;
    });
    // identify two highest cost days
    const sortedDays = [...days].sort((a,b) => perDayTotal[b]-perDayTotal[a]);
    const topDays = new Set(sortedDays.slice(0,2).filter(d => perDayTotal[d] > 0));
    const monthGrand = Object.values(perDayTotal).reduce((a,b)=>a+b,0);
    const totalJoursOuvrier = Object.values(perWorker).reduce((a,r)=>a+r.q1Days+r.q2Days,0);
    const ouvriersActifs = Object.values(perWorker).filter(r => r.total > 0).length;
    return { perWorker, perDayTotal, topDays, monthGrand, totalJoursOuvrier, ouvriersActifs, dayHasPrime };
  }, [ctx.pointage, year, monthIdx, filterChantier]);

  // Workers whose monthly cost exceeds personal 3-mo avg → flag (synthetic: heaviest 3 workers)
  const flaggedWorkers = useMoMemo(() => {
    const sorted = [...OUVRIERS].sort((a,b) => (data.perWorker[b.id]?.total||0) - (data.perWorker[a.id]?.total||0));
    return new Set(sorted.slice(0,3).map(w => w.id));
  }, [data]);

  return (
    <div className="space-y-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3">
        <MonthSelector currentMonth={currentMonth} onChange={onSwitchMonth} chantierFilter={filterChantier}/>

        {/* Chantier filter is now global (topbar switcher) — no per-page <select>. */}

        <div className="ml-auto flex items-center gap-2">
          <Btn size="sm" icon={<Icons.Doc size={13}/>}>Exporter en Excel</Btn>
          <Btn size="sm" icon={<Icons.Print size={13}/>}>Exporter en PDF</Btn>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total mois" value={formatMADCompact(data.monthGrand)} hint={`${MOIS_FR[monthIdx]} ${year}`} accent/>
        <StatCard label="Jours-ouvrier" value={data.totalJoursOuvrier} hint="Tous chantiers"/>
        <StatCard label="Ouvriers actifs" value={`${data.ouvriersActifs} / ${OUVRIERS.length}`}/>
        <StatCard label="Moyenne / jour" value={formatMADCompact(data.monthGrand/dim)} hint={`Sur ${dim} jours`}/>
      </div>

      {/* View toggle */}
      <div className="flex items-center gap-3">
        <div className="flex bg-stone-100 rounded-lg p-0.5">
          <button onClick={() => onSwitchQuinzaine()} className="px-3 py-1.5 text-xs font-semibold rounded-md text-stone-500 hover:text-stone-800">Quinzaine</button>
          <button className="px-3 py-1.5 text-xs font-semibold rounded-md bg-white shadow-sm">Mois entier</button>
        </div>
        <div className="text-xs text-stone-500">Vue analytique en lecture seule — cliquez sur une colonne ou un sous-total pour explorer.</div>
      </div>

      {/* Grid */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="bati-grid bati-grid-compact w-full">
            <thead>
              <tr style={{ background:'#FAF7F1' }}>
                <th className="bati-sticky-l text-left px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-stone-500" style={{ minWidth: 220, background:'#FAF7F1' }}>Ouvrier</th>
                {days.map(d => {
                  const dow = dayOfWeek(year, monthIdx, d);
                  const isTop = data.topDays.has(d);
                  const afterQ1 = d === 16;
                  return (
                    <React.Fragment key={d}>
                      {afterQ1 && <th className="px-2 py-2 text-center font-semibold text-[10px] uppercase tracking-wider border-l-2 border-r" style={{ borderColor:'#0E5460', minWidth: 70, background:'#F1ECE0' }}>
                        <button onClick={() => onSwitchQuinzaine({ year, monthIdx, half: 1 })}
                                className="text-[10px] font-bold tracking-wider text-stone-700 hover:underline">
                          Total Q1 →
                        </button>
                      </th>}
                      <th onClick={() => setDayPanel(d)}
                          className={`text-center px-1 py-2 font-semibold text-[10px] text-stone-500 border-l cursor-pointer hover:bg-stone-50 ${isTop ? 'ring-1 ring-inset' : ''}`}
                          style={{ borderColor:'#F0EAE0', minWidth: 28, '--tw-ring-color': '#C25B3F' }}>
                        <div className="text-stone-700 text-xs font-bold tabular-nums">{d}</div>
                        <div className="text-[9px] font-medium text-stone-400">{JOURS_FR[dow][0]}</div>
                      </th>
                    </React.Fragment>
                  );
                })}
                <th className="bati-sticky-r px-2 py-2 text-center font-semibold text-[10px] uppercase tracking-wider border-l-2 border-r" style={{ borderColor:'#0E5460', background:'#F1ECE0', minWidth:70 }}>
                  <button onClick={() => onSwitchQuinzaine({ year, monthIdx, half: 2 })} className="hover:underline">Total Q2 →</button>
                </th>
                <th className="bati-sticky-r-2 px-3 py-2 text-right font-bold text-[10px] uppercase tracking-wider border-l" style={{ borderColor:'#0E5460', background:'#0E5460', color:'#fff', minWidth:90 }}>
                  Total mois
                </th>
              </tr>
            </thead>
            <tbody>
              {OUVRIERS.map(w => {
                const r = data.perWorker[w.id];
                const isFlagged = flaggedWorkers.has(w.id) && r.total > 0;
                return (
                  <tr key={w.id} className="border-t" style={{ borderColor:'#F0EAE0' }}>
                    <td className="bati-sticky-l px-3 py-1.5">
                      <button onClick={() => ctx.openWorker(w.id)} className="flex items-center gap-2 text-left">
                        <Avatar worker={w} size={24}/>
                        <div className="min-w-0">
                          <div className="font-semibold text-xs text-stone-900 truncate">{w.nom}</div>
                          <div className="text-[10px] text-stone-500">{w.role}</div>
                        </div>
                      </button>
                    </td>
                    {days.map(d => {
                      const dk = dateKey(year, monthIdx, d);
                      const c = ctx.pointage[w.id]?.[dk];
                      const afterQ1 = d === 16;
                      const isDimmed = filterChantier !== 'all' && c?.statut === 'P' && c.chantierId !== filterChantier;
                      const showAsPresent = c?.statut === 'P' && !isDimmed;
                      const showAsAbsent = c?.statut === 'A';
                      const showAsDim = isDimmed;

                      return (
                        <React.Fragment key={d}>
                          {afterQ1 && (
                            <td className="border-l-2 border-r text-center text-[11px] tabular-nums font-semibold px-1" style={{ borderColor:'#0E5460', background:'#FAF7F1' }}>
                              <div className="text-stone-700">{r.q1Days}j</div>
                              <div className="text-stone-500 text-[10px]">{formatMADCompact(r.q1Cost)}</div>
                            </td>
                          )}
                          <td className="border-l p-0 relative" style={{ borderColor:'#F0EAE0' }}
                              onMouseEnter={(e) => setHoverCell({ workerId: w.id, day: d, x: e.clientX, y: e.clientY })}
                              onMouseLeave={() => setHoverCell(null)}>
                            <div className="w-full h-7 flex items-center justify-center relative">
                              {showAsPresent && <span className="w-2.5 h-2.5 rounded-full" style={{ background:'#2E9152' }}/>}
                              {showAsAbsent  && <span className="w-2.5 h-2.5 rounded-full" style={{ background:'#E0832E' }}/>}
                              {!showAsPresent && !showAsAbsent && (
                                <span className="text-[10px] text-stone-300 leading-none">–</span>
                              )}
                              {c?.prime > 0 && !isDimmed && (
                                <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full" style={{ background:'#C58122' }}/>
                              )}
                            </div>
                          </td>
                        </React.Fragment>
                      );
                    })}
                    <td className="bati-sticky-r border-l-2 border-r text-center text-[11px] tabular-nums font-semibold px-1" style={{ borderColor:'#0E5460', background:'#FAF7F1' }}>
                      <div className="text-stone-700">{r.q2Days}j</div>
                      <div className="text-stone-500 text-[10px]">{formatMADCompact(r.q2Cost)}</div>
                    </td>
                    <td className="bati-sticky-r-2 px-2 py-1.5 text-right border-l" style={{ borderColor:'#E8E2D8', background:'#FAF7F1' }}>
                      <div className="flex items-center justify-end gap-1 font-bold text-sm tabular-nums" style={{ color:'#0E5460' }}>
                        {isFlagged && <span style={{ color:'#C25B3F' }} title="Au-dessus de la moyenne 3 derniers mois">▲</span>}
                        {formatMADCompact(r.total)}
                      </div>
                      <div className="text-[10px] text-stone-500">{r.q1Days + r.q2Days} jours</div>
                    </td>
                  </tr>
                );
              })}
              {/* Bottom row */}
              <tr className="border-t-2" style={{ borderColor:'#0E5460', background:'#F1ECE0' }}>
                <td className="bati-sticky-l px-3 py-2 font-bold text-xs uppercase tracking-wider text-stone-700" style={{ background:'#F1ECE0' }}>Coût du jour</td>
                {days.map(d => {
                  const isTop = data.topDays.has(d);
                  const hasPrime = data.dayHasPrime[d];
                  const afterQ1 = d === 16;
                  return (
                    <React.Fragment key={d}>
                      {afterQ1 && <td className="border-l-2 border-r px-2 py-2 text-center font-bold text-[11px] tabular-nums" style={{ borderColor:'#0E5460', background:'#F1ECE0' }}>{formatMADCompact(Object.entries(data.perDayTotal).filter(([k])=>+k<=15).reduce((a,[,v])=>a+v,0))}</td>}
                      <td className={`border-l px-0.5 py-2 text-center tabular-nums ${hasPrime ? 'font-bold' : 'font-medium'} ${isTop ? 'ring-1 ring-inset' : ''}`}
                          style={{ borderColor:'#F0EAE0', '--tw-ring-color':'#C25B3F', fontSize: 9, color: isTop ? '#C25B3F' : '#1F2421' }}>
                        {data.perDayTotal[d] > 0 ? Math.round(data.perDayTotal[d]) : '—'}
                      </td>
                    </React.Fragment>
                  );
                })}
                <td className="bati-sticky-r border-l-2 border-r px-2 py-2 text-center font-bold text-[11px] tabular-nums" style={{ borderColor:'#0E5460', background:'#F1ECE0' }}>
                  {formatMADCompact(Object.entries(data.perDayTotal).filter(([k])=>+k>=16).reduce((a,[,v])=>a+v,0))}
                </td>
                <td className="bati-sticky-r-2 px-3 py-2 text-right border-l" style={{ borderColor:'#0E5460', background:'#0E5460', color:'#fff' }}>
                  <div className="text-[10px] uppercase tracking-wider opacity-70">Total mois</div>
                  <div className="font-bold text-base tabular-nums">{formatMADCompact(data.monthGrand)}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex items-center gap-4 text-[11px] text-stone-500">
        <div className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background:'#2E9152' }}/>
          Présent
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background:'#E0832E' }}/>
          Absent
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="text-stone-300">–</span>
          Non pointé
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full" style={{ background:'#C58122' }}/>
          Prime ce jour
        </div>
        <div className="inline-flex items-center gap-1.5">
          <span style={{ color:'#C25B3F' }}>▲</span>
          Au-dessus de la moyenne 3 derniers mois
        </div>
      </div>

      {hoverCell && <CellTooltip cell={hoverCell} ctx={ctx} year={year} monthIdx={monthIdx} onEdit={() => { onSwitchQuinzaine({ year, monthIdx, half: hoverCell.day <= 15 ? 1 : 2 }); setHoverCell(null); }}/>}

      {dayPanel && <DayPanel day={dayPanel} year={year} monthIdx={monthIdx} ctx={ctx} onClose={() => setDayPanel(null)}/>}
    </div>
  );
}

function StatCard({ label, value, hint, accent }) {
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-stone-500 font-medium">{label}</div>
      <div className={`text-2xl font-bold mt-1 tabular-nums`} style={{ color: accent ? '#0E5460' : '#1F2421' }}>{value}</div>
      {hint && <div className="text-xs text-stone-500 mt-0.5">{hint}</div>}
    </Card>
  );
}

function LegendDot({ color, label }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm" style={{ background: color }}/>
      {label}
    </div>
  );
}

function MonthSelector({ currentMonth, onChange, chantierFilter }) {
  const [open, setOpen] = useMoState(false);

  // Span from the earliest applicable chantier's start-month up to (and
  // including) the current month — never list future months.
  function monthFromISO(iso) {
    if (!iso || typeof iso !== 'string') return null;
    const m = iso.match(/^(\d{4})-(\d{2})/);
    if (!m) return null;
    return { year: parseInt(m[1], 10), monthIdx: parseInt(m[2], 10) - 1 };
  }
  function mOrd(m) { return m.year * 12 + m.monthIdx; }

  const todayM = { year: TODAY.year, monthIdx: TODAY.monthIdx };
  const applicable = (typeof CHANTIERS !== 'undefined' && Array.isArray(CHANTIERS))
    ? CHANTIERS.filter(c => !chantierFilter || chantierFilter === 'all' || c.id === chantierFilter)
    : [];

  let earliest = todayM;
  for (const c of applicable) {
    const m = monthFromISO(c.dateStart);
    if (m && mOrd(m) < mOrd(earliest)) earliest = m;
  }

  const options = [];
  {
    let cur = { ...earliest };
    const todayOrd = mOrd(todayM);
    let safety = 0;
    while (mOrd(cur) <= todayOrd && safety < 120) {
      options.push({ ...cur });
      cur = cur.monthIdx === 11 ? { year: cur.year + 1, monthIdx: 0 } : { year: cur.year, monthIdx: cur.monthIdx + 1 };
      safety++;
    }
  }
  const label = `${MOIS_FR[currentMonth.monthIdx][0].toUpperCase() + MOIS_FR[currentMonth.monthIdx].slice(1)} ${currentMonth.year}`;
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="inline-flex items-center gap-2 bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm hover:bg-stone-50">
        <Icons.Calendar size={14} className="text-stone-500"/>
        <span className="font-semibold">{label}</span>
        <Icons.ChevronDown size={14} className="text-stone-400"/>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)}/>
          <div className="absolute top-full left-0 mt-1 bg-white border rounded-xl shadow-xl z-40 w-56" style={{ borderColor:'#E8E2D8' }}>
            {options.map(o => (
              <button key={`${o.year}-${o.monthIdx}`} onClick={() => { onChange(o); setOpen(false); }}
                      className={`w-full text-left px-3 py-2 hover:bg-stone-50 text-sm border-b last:border-b-0 ${o.year===currentMonth.year && o.monthIdx===currentMonth.monthIdx ? 'bg-stone-50 font-semibold':''}`}
                      style={{ borderColor:'#F0EAE0' }}>
                {MOIS_FR[o.monthIdx][0].toUpperCase()+MOIS_FR[o.monthIdx].slice(1)} {o.year}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function CellTooltip({ cell, ctx, year, monthIdx, onEdit }) {
  const { workerId, day, x, y } = cell;
  const w = OUVRIERS.find(o => o.id === workerId);
  const dk = dateKey(year, monthIdx, day);
  const c = ctx.pointage[workerId]?.[dk];
  const ch = c?.chantierId ? CHANTIERS.find(x => x.id === c.chantierId) : null;
  return (
    <div className="fixed z-50 bg-white rounded-lg shadow-xl border px-3 py-2 text-xs pointer-events-none" style={{ left: x+12, top: y+12, borderColor:'#E8E2D8', maxWidth: 220 }}>
      <div className="font-semibold text-stone-900">{w.nom}</div>
      <div className="text-stone-500 mb-1">{frenchDate(year, monthIdx, day)}</div>
      {c ? (
        <>
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-bold px-1.5 rounded`} style={{ background: c.statut==='P' ? '#E3F1E5' : '#FBE3DC', color: c.statut==='P' ? '#1F6B3A':'#8A2C1E' }}>
              {c.statut === 'P' ? 'PRÉSENT' : 'ABSENT'}
            </span>
            {ch && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm" style={{ background:ch.color}}/>{ch.name}</span>}
          </div>
          {c.prime > 0 && <div className="text-green-700 mt-1">Prime: {formatMADCompact(c.prime)} {c.motif && `(${c.motif})`}</div>}
        </>
      ) : <div className="text-stone-400 italic">Non pointé</div>}
      <div className="text-[10px] text-stone-400 mt-1.5">Cliquez "Modifier" pour éditer ce jour</div>
    </div>
  );
}

function DayPanel({ day, year, monthIdx, ctx, onClose }) {
  const present = OUVRIERS.map(w => {
    const c = ctx.pointage[w.id]?.[dateKey(year, monthIdx, day)];
    if (c?.statut === 'P') return { w, c };
    return null;
  }).filter(Boolean);
  const perCh = {};
  let total = 0;
  present.forEach(({ w, c }) => {
    const cost = w.tarif + (c.prime || 0);
    perCh[c.chantierId] = perCh[c.chantierId] || { ouvriers: 0, cost: 0 };
    perCh[c.chantierId].ouvriers++;
    perCh[c.chantierId].cost += cost;
    total += cost;
  });

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose}/>
      <div className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-white z-50 shadow-2xl flex flex-col" style={{ borderLeft:'1px solid #E8E2D8' }}>
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor:'#EDE6D8' }}>
          <div>
            <div className="text-xs uppercase tracking-wider text-stone-500 font-medium">Pointage du jour</div>
            <div className="font-bold">{frenchDate(year, monthIdx, day)}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-stone-100"><Icons.X size={18}/></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Ouvriers présents" value={present.length}/>
            <StatCard label="Coût du jour" value={formatMADCompact(total)} accent/>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Par chantier</div>
            <div className="space-y-1.5">
              {Object.entries(perCh).map(([cid, v]) => {
                const ch = CHANTIERS.find(c => c.id === cid);
                return (
                  <div key={cid} className="flex items-center justify-between p-2.5 rounded-lg" style={{ background: ch.colorSoft }}>
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm" style={{ background: ch.color }}/>
                      <span className="font-semibold text-sm">{ch.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-stone-600">{v.ouvriers} ouvriers</div>
                      <div className="font-bold text-sm tabular-nums">{formatMADCompact(v.cost)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-stone-500 mb-2">Ouvriers présents</div>
            <div className="space-y-1">
              {present.map(({ w, c }) => {
                const ch = CHANTIERS.find(x => x.id === c.chantierId);
                return (
                  <div key={w.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-stone-50">
                    <Avatar worker={w} size={28}/>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{w.nom}</div>
                      <div className="text-[11px] text-stone-500 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-sm" style={{ background: ch.color }}/>
                        {ch.name}
                      </div>
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      <div className="font-semibold">{formatMADCompact(w.tarif + (c.prime||0))}</div>
                      {c.prime > 0 && <div className="text-[10px] text-green-700">+{formatMADCompact(c.prime)}</div>}
                    </div>
                  </div>
                );
              })}
              {present.length === 0 && <EmptyState icon={<Icons.User size={20}/>} title="Aucun pointage" hint="Aucun ouvrier n'a été pointé ce jour."/>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

window.PointageMois = PointageMois;
