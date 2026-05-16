// Consommables — Catalogue / Achats / Consommation / Stocks / Analyses tabs
const { useState: useTbState, useMemo: useTbMemo } = React;

// ─── Catalogue tab ────────────────────────────────────────────
function CatalogueTab({ items, purchases, consumption, transfers, filterCat, setFilterCat, onAdd, onEdit }) {
  const [search, setSearch] = useTbState('');

  const filtered = items.filter(it => {
    if (filterCat !== 'all' && it.cat !== filterCat) return false;
    if (search && !it.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Group by category
  const grouped = {};
  filtered.forEach(it => { (grouped[it.cat] = grouped[it.cat] || []).push(it); });

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm">
          <option value="all">Toutes catégories</option>
          {Object.entries(CONSOMM_CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="relative">
          <Icons.Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Rechercher un article…"
                 className="bg-white border border-stone-200 rounded-lg pl-7 pr-3 py-1.5 text-sm w-56 focus:outline-none focus:border-stone-400"/>
        </div>
        <div className="ml-auto text-xs text-stone-500"><b className="text-stone-900">{filtered.length}</b> article{filtered.length>1?'s':''}</div>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <Card className="p-8"><EmptyState icon={<Icons.Search size={20}/>} title="Aucun article" hint="Ajustez vos filtres ou ajoutez un nouvel article."/></Card>
      ) : (
        <div className="space-y-5">
          {Object.entries(CONSOMM_CATEGORIES).map(([catKey, cat]) => {
            const list = grouped[catKey];
            if (!list || list.length === 0) return null;
            return (
              <div key={catKey}>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="w-2 h-2 rounded-sm" style={{ background: cat.color }}/>
                  <h2 className="font-bold text-[11px] uppercase tracking-wider text-stone-700">{cat.label}</h2>
                  <span className="text-[10px] text-stone-500 font-medium tabular-nums">{list.length}</span>
                </div>
                <Card className="overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500 font-semibold" style={{ background:'#FAF7F1' }}>
                        <th className="px-4 py-2.5">Article</th>
                        <th className="px-3 py-2.5">Unité</th>
                        <th className="px-3 py-2.5 text-right">Prix moyen</th>
                        <th className="px-3 py-2.5">Fournisseur principal</th>
                        <th className="px-3 py-2.5 text-right">Stock total</th>
                        <th className="px-3 py-2.5 text-right">Seuil</th>
                        <th className="px-3 py-2.5"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {list.map(it => {
                        const stock = computeStockByItem(it.id, purchases, consumption, transfers).total;
                        const low = stock < it.threshold;
                        const sup = getSupplier(it.supplier);
                        return (
                          <tr key={it.id} className="border-t hover:bg-stone-50 cursor-pointer" style={{ borderColor:'#F0EAE0' }}
                              onClick={() => onEdit('item', it)}>
                            <td className="px-4 py-2.5 font-semibold">
                              {it.name}
                              {it.hasExpiry && <span className="ml-2 text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded" style={{ background:'#FBEBD3', color:'#8A5114' }}>Périssable</span>}
                            </td>
                            <td className="px-3 py-2.5 text-xs text-stone-600">{it.unit}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatMADCompact(it.price)}</td>
                            <td className="px-3 py-2.5 text-xs">{sup ? <span><b>{sup.name}</b> <span className="text-stone-400">· {sup.city}</span></span> : <span className="text-stone-400 italic">—</span>}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: low ? '#C25B3F' : '#0E5460' }}>
                              {stock.toFixed(stock % 1 === 0 ? 0 : 1)} <span className="text-stone-400 text-[10px] font-medium">{it.unit}</span>
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums text-xs text-stone-500">{it.threshold}</td>
                            <td className="px-3 py-2.5 text-right">{low && <Icons.AlertTri size={14} style={{ color:'#C25B3F' }} title="Stock sous le seuil"/>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Achats tab ───────────────────────────────────────────────
function AchatsTab({ items, purchases, filterChantier, setFilterChantier, onAdd, onEdit }) {
  const [filterSupplier, setFilterSupplier] = useTbState('all');
  const [filterPayment, setFilterPayment] = useTbState('all');

  const filtered = purchases.filter(p => {
    if (filterChantier !== 'all' && p.location !== filterChantier) return false;
    if (filterSupplier !== 'all' && p.supplier !== filterSupplier) return false;
    if (filterPayment !== 'all' && p.payment !== filterPayment) return false;
    return true;
  }).sort((a,b) => b.date.localeCompare(a.date));

  const grandTotal = filtered.reduce((a,p) => a + purchaseTotal(p), 0);

  return (
    <div>
      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={filterChantier} onChange={e => setFilterChantier(e.target.value)}
                className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm">
          <option value="all">Toutes destinations</option>
          <option value="depot">Dépôt central</option>
          {CHANTIERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}
                className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm">
          <option value="all">Tous fournisseurs</option>
          {SUPPLIERS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select value={filterPayment} onChange={e => setFilterPayment(e.target.value)}
                className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm">
          <option value="all">Tous paiements</option>
          <option value="paid">Payé</option>
          <option value="partial">Partiel</option>
          <option value="pending">En attente</option>
        </select>
        <div className="ml-auto flex items-center gap-3 text-xs text-stone-500">
          <span><b className="text-stone-900">{filtered.length}</b> achats</span>
          <span>Total: <b className="text-stone-900 tabular-nums">{formatMADCompact(grandTotal)}</b></span>
          <Btn size="sm" icon={<Icons.Doc size={12}/>}>Exporter</Btn>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500 font-semibold" style={{ background:'#FAF7F1' }}>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-3 py-2.5">Fournisseur</th>
              <th className="px-3 py-2.5">Articles</th>
              <th className="px-3 py-2.5">Destination</th>
              <th className="px-3 py-2.5">Facture</th>
              <th className="px-3 py-2.5 text-center">Paiement</th>
              <th className="px-3 py-2.5 text-right">Montant</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8}><EmptyState icon={<Icons.Plus size={20}/>} title="Aucun achat" hint="Ajustez les filtres ou enregistrez un nouvel achat."
                action={<Btn variant="primary" size="sm" onClick={() => onAdd('purchase')}>Nouvel achat</Btn>}/></td></tr>
            )}
            {filtered.map(p => {
              const sup = getSupplier(p.supplier);
              const loc = getLocation(p.location);
              const total = purchaseTotal(p);
              const paymentBadge = {
                paid:    { label:'Payé',     bg:'#DCEEE0', fg:'#1F6B3A' },
                partial: { label:'Partiel',  bg:'#FBEBD3', fg:'#8A5114' },
                pending: { label:'Attente',  bg:'#FBE3DC', fg:'#8A2C1E' }
              }[p.payment];
              return (
                <tr key={p.id} className="border-t hover:bg-stone-50 cursor-pointer" style={{ borderColor:'#F0EAE0' }}
                    onClick={() => onEdit('purchase', p)}>
                  <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{frenchDateFromISO(p.date)}</td>
                  <td className="px-3 py-2.5">
                    <div className="font-semibold">{sup?.name}</div>
                    <div className="text-[10px] text-stone-500">{sup?.type}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex flex-wrap gap-1 max-w-md">
                      {p.items.map((li, i) => {
                        const it = items.find(x => x.id === li.itemId);
                        return (
                          <span key={i} className="text-[10px] font-semibold bg-stone-100 px-1.5 py-0.5 rounded">
                            {it?.name || '?'} <span className="text-stone-500 tabular-nums">×{li.qty}</span>
                          </span>
                        );
                      })}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    {loc?.isWarehouse
                      ? <span className="inline-flex items-center gap-1 text-[11px] font-semibold"><Icons.Building size={11} className="text-stone-500"/>Dépôt central</span>
                      : <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold"><span className="w-1.5 h-1.5 rounded-sm" style={{ background:loc?.color }}/>{loc?.name}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-stone-600 tabular-nums">{p.invoice}</td>
                  <td className="px-3 py-2.5 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: paymentBadge.bg, color: paymentBadge.fg }}>
                      {paymentBadge.label}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color:'#0E5460' }}>{formatMADCompact(total)}</td>
                  <td className="px-3 py-2.5 text-right text-stone-300"><Icons.ChevronRight size={14}/></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── Consommation tab ─────────────────────────────────────────
function ConsommationTab({ items, consumption, filterChantier, setFilterChantier, filterCat, setFilterCat, onAdd, onEdit, ctx }) {
  const [filterTask, setFilterTask] = useTbState('all');
  const [showLossOnly, setShowLossOnly] = useTbState(false);

  const filtered = consumption.filter(u => {
    if (filterChantier !== 'all' && u.chantierId !== filterChantier) return false;
    if (filterTask !== 'all' && u.taskId !== filterTask) return false;
    if (filterCat !== 'all') {
      const it = items.find(x => x.id === u.itemId);
      if (it?.cat !== filterCat) return false;
    }
    if (showLossOnly && !u.isLoss) return false;
    return true;
  }).sort((a,b) => b.date.localeCompare(a.date));

  const grandValue = filtered.reduce((a,u) => {
    const it = items.find(x => x.id === u.itemId);
    return a + u.qty * (it?.price || 0);
  }, 0);

  // Compute available tasks from selected chantier
  const tasksForFilter = (() => {
    if (filterChantier === 'all') return [];
    // Use any source of tasks — we don't have ctx.plans here, but the unique taskIds in consumption give us a quick list
    const ids = new Set(consumption.filter(u => u.chantierId === filterChantier).map(u => u.taskId));
    return [...ids];
  })();

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={filterChantier} onChange={e => { setFilterChantier(e.target.value); setFilterTask('all'); }}
                className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm">
          <option value="all">Tous chantiers</option>
          {CHANTIERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm">
          <option value="all">Toutes catégories</option>
          {Object.entries(CONSOMM_CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        {filterChantier !== 'all' && (
          <select value={filterTask} onChange={e => setFilterTask(e.target.value)}
                  className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm">
            <option value="all">Toutes tâches</option>
            {tasksForFilter.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <label className="inline-flex items-center gap-1.5 text-xs text-stone-600 ml-2">
          <input type="checkbox" checked={showLossOnly} onChange={e => setShowLossOnly(e.target.checked)} className="accent-stone-700"/>
          Pertes uniquement
        </label>
        <div className="ml-auto flex items-center gap-3 text-xs text-stone-500">
          <span><b className="text-stone-900">{filtered.length}</b> sorties</span>
          <span>Valeur: <b className="text-stone-900 tabular-nums">{formatMADCompact(grandValue)}</b></span>
          <Btn size="sm" icon={<Icons.Doc size={12}/>}>Exporter</Btn>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500 font-semibold" style={{ background:'#FAF7F1' }}>
              <th className="px-4 py-2.5">Date</th>
              <th className="px-3 py-2.5">Article</th>
              <th className="px-3 py-2.5 text-right">Quantité</th>
              <th className="px-3 py-2.5">Chantier</th>
              <th className="px-3 py-2.5">Tâche</th>
              <th className="px-3 py-2.5">Pointé par</th>
              <th className="px-3 py-2.5">Notes</th>
              <th className="px-3 py-2.5 text-right">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8}><EmptyState icon={<Icons.Minus size={20}/>} title="Aucune sortie" hint="Enregistrez une consommation depuis le chantier."
                action={<Btn variant="primary" size="sm" onClick={() => onAdd('consumption')}>Enregistrer une sortie</Btn>}/></td></tr>
            )}
            {filtered.map(u => {
              const it = items.find(x => x.id === u.itemId);
              const ch = CHANTIERS.find(x => x.id === u.chantierId);
              const cat = it ? CONSOMM_CATEGORIES[it.cat] : null;
              return (
                <tr key={u.id} className="border-t hover:bg-stone-50 cursor-pointer" style={{ borderColor:'#F0EAE0' }}
                    onClick={() => onEdit('consumption', u)}>
                  <td className="px-4 py-2.5 tabular-nums whitespace-nowrap">{frenchDateFromISO(u.date)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background: cat?.color }}/>
                      <span className="font-semibold">{it?.name}</span>
                      {u.isLoss && <span className="text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded" style={{ background:'#FBE3DC', color:'#8A2C1E' }}>Perte</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold">
                    {u.qty} <span className="text-stone-400 text-[10px] font-medium">{it?.unit}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    {ch && <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
                      <span className="w-1.5 h-1.5 rounded-sm" style={{ background:ch.color }}/>{ch.name}
                    </span>}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-stone-600">{u.taskId}</td>
                  <td className="px-3 py-2.5 text-[11px] text-stone-600">{u.recordedBy}</td>
                  <td className="px-3 py-2.5 text-[11px] text-stone-500 italic max-w-[180px] truncate">{u.notes}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold" style={{ color: u.isLoss ? '#C25B3F' : '#0E5460' }}>{formatMADCompact(u.qty * (it?.price || 0))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

// ─── Stocks tab ───────────────────────────────────────────────
function StocksTab({ items, purchases, consumption, transfers, filterCat, setFilterCat, filterChantier, setFilterChantier, onAdd }) {
  const stocks = useTbMemo(() => {
    const m = {};
    items.forEach(it => { m[it.id] = computeStockByItem(it.id, purchases, consumption, transfers); });
    return m;
  }, [items, purchases, consumption, transfers]);

  const filtered = items.filter(it => {
    if (filterCat !== 'all' && it.cat !== filterCat) return false;
    if (filterChantier !== 'all') {
      // Only show items that have stock or are configured for this location
      if (!stocks[it.id]?.[filterChantier]) return false;
    }
    return true;
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select value={filterCat} onChange={e => setFilterCat(e.target.value)}
                className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm">
          <option value="all">Toutes catégories</option>
          {Object.entries(CONSOMM_CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterChantier} onChange={e => setFilterChantier(e.target.value)}
                className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-sm">
          <option value="all">Toutes localisations</option>
          <option value="depot">Dépôt central</option>
          {CHANTIERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <Btn size="sm" icon={<Icons.Arrow size={12}/>} onClick={() => onAdd('transfer')}>Nouveau transfert</Btn>
        <div className="ml-auto flex items-center gap-3 text-xs text-stone-500">
          <Btn size="sm" icon={<Icons.Doc size={12}/>}>Exporter</Btn>
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500 font-semibold" style={{ background:'#FAF7F1' }}>
              <th className="px-4 py-2.5 sticky left-0" style={{ background:'#FAF7F1', minWidth: 200 }}>Article</th>
              <th className="px-3 py-2.5 text-right" style={{ minWidth: 90 }}>
                <div className="inline-flex items-center gap-1 justify-end">
                  <Icons.Building size={11}/>
                  Dépôt
                </div>
              </th>
              {CHANTIERS.map(c => (
                <th key={c.id} className="px-3 py-2.5 text-right" style={{ minWidth: 110 }}>
                  <div className="inline-flex items-center gap-1.5 justify-end">
                    <span className="w-1.5 h-1.5 rounded-sm" style={{ background:c.color }}/>
                    {c.name.split(' ')[0]}
                  </div>
                </th>
              ))}
              <th className="px-3 py-2.5 text-right border-l" style={{ background:'#FAF7F1', borderColor:'#E8E2D8', minWidth:120 }}>Total · Seuil</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={CHANTIERS.length + 3}><EmptyState icon={<Icons.Building size={20}/>} title="Aucun stock à afficher" hint="Ajustez les filtres."/></td></tr>
            )}
            {filtered.map(it => {
              const s = stocks[it.id];
              const cat = CONSOMM_CATEGORIES[it.cat];
              const low = s.total < it.threshold;
              return (
                <tr key={it.id} className="border-t hover:bg-stone-50" style={{ borderColor:'#F0EAE0' }}>
                  <td className="px-4 py-2.5 sticky left-0 bg-white" style={{ boxShadow:'1px 0 0 #F0EAE0' }}>
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background:cat.color }}/>
                      <div>
                        <div className="font-semibold">{it.name}</div>
                        <div className="text-[10px] text-stone-500">{it.unit} · {formatMADCompact(it.price)}/{it.unit}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {s.depot > 0 ? s.depot : <span className="text-stone-300">—</span>}
                  </td>
                  {CHANTIERS.map(c => (
                    <td key={c.id} className="px-3 py-2.5 text-right tabular-nums">
                      {s[c.id] > 0 ? (
                        <span className="font-semibold" style={{ color: c.color }}>{s[c.id].toFixed(s[c.id] % 1 === 0 ? 0 : 1)}</span>
                      ) : s[c.id] < 0 ? (
                        <span className="font-bold" style={{ color:'#C25B3F' }} title="Stock négatif">{s[c.id].toFixed(1)}</span>
                      ) : <span className="text-stone-300">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 text-right border-l tabular-nums" style={{ borderColor:'#F0EAE0' }}>
                    <div className="font-bold" style={{ color: low ? '#C25B3F' : '#0E5460' }}>
                      {s.total.toFixed(s.total % 1 === 0 ? 0 : 1)} <span className="text-stone-400 text-[10px] font-medium">{it.unit}</span>
                    </div>
                    <div className="text-[10px] text-stone-400">seuil: {it.threshold}</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {/* Recent transfers */}
      <Card className="mt-5 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor:'#F0EAE0' }}>
          <Icons.Arrow size={13}/>
          <h3 className="font-bold text-sm">Transferts récents</h3>
        </div>
        {transfers.length === 0 ? (
          <EmptyState icon={<Icons.Arrow size={20}/>} title="Aucun transfert"/>
        ) : (
          <div className="divide-y" style={{ borderColor:'#F0EAE0' }}>
            {transfers.slice(0,5).map(t => {
              const it = items.find(x => x.id === t.itemId);
              const from = getLocation(t.from), to = getLocation(t.to);
              return (
                <div key={t.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-stone-50" style={{ borderColor:'#F0EAE0' }}>
                  <div className="text-[11px] text-stone-500 tabular-nums w-24">{frenchDateFromISO(t.date)}</div>
                  <div className="font-semibold text-sm flex-1">{it?.name} <span className="text-stone-500 tabular-nums">×{t.qty}</span></div>
                  <div className="text-xs flex items-center gap-1.5">
                    <span className="font-semibold">{from?.name}</span>
                    <Icons.Arrow size={11} className="text-stone-400"/>
                    <span className="font-semibold">{to?.name}</span>
                  </div>
                  <div className="text-[11px] text-stone-500 italic ml-3 max-w-[180px] truncate">{t.notes}</div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Analyses tab ─────────────────────────────────────────────
function AnalysesTab({ items, purchases, consumption, transfers }) {
  // Cost per chantier
  const perChantier = {};
  CHANTIERS.forEach(c => perChantier[c.id] = { total: 0, byCat: {} });
  consumption.forEach(u => {
    const it = items.find(x => x.id === u.itemId);
    if (!it) return;
    const cost = u.qty * it.price;
    perChantier[u.chantierId].total += cost;
    perChantier[u.chantierId].byCat[it.cat] = (perChantier[u.chantierId].byCat[it.cat] || 0) + cost;
  });
  const grandConsumption = Object.values(perChantier).reduce((a,b) => a+b.total, 0);
  const maxChantierCost = Math.max(1, ...Object.values(perChantier).map(p => p.total));

  // Most-used items by qty (top 8)
  const mostUsed = items.map(it => {
    const totalQty = consumption.filter(u => u.itemId === it.id).reduce((a,u) => a+u.qty, 0);
    const totalCost = totalQty * it.price;
    return { it, totalQty, totalCost };
  }).filter(x => x.totalQty > 0).sort((a,b) => b.totalCost - a.totalCost).slice(0, 8);

  // Price evolution for top 4 items
  const priceItems = mostUsed.slice(0, 4).map(({ it }) => {
    const pts = purchases
      .filter(p => p.items.some(li => li.itemId === it.id))
      .flatMap(p => p.items.filter(li => li.itemId === it.id).map(li => ({ date: p.date, price: li.unitPrice })))
      .sort((a,b) => a.date.localeCompare(b.date));
    return { it, pts };
  });

  // Supplier comparison: same item, average price per supplier
  const supplierCompare = items.slice(0, 5).map(it => {
    const bySup = {};
    purchases.forEach(p => {
      p.items.filter(li => li.itemId === it.id).forEach(li => {
        if (!bySup[p.supplier]) bySup[p.supplier] = { sum: 0, count: 0 };
        bySup[p.supplier].sum += li.unitPrice;
        bySup[p.supplier].count += 1;
      });
    });
    return { it, suppliers: Object.entries(bySup).map(([sid, v]) => ({ sup: getSupplier(sid), avg: v.sum / v.count, count: v.count })) };
  }).filter(x => x.suppliers.length > 1);

  return (
    <div className="space-y-5">
      {/* Per chantier cost */}
      <Card className="p-4">
        <div className="flex items-baseline justify-between mb-3">
          <h3 className="font-bold text-sm">Coût consommables par chantier</h3>
          <span className="text-xs text-stone-500">Total: <b className="text-stone-900 tabular-nums">{formatMADCompact(grandConsumption)}</b></span>
        </div>
        <div className="space-y-2.5">
          {CHANTIERS.map(c => {
            const data = perChantier[c.id];
            const pct = (data.total / maxChantierCost) * 100;
            return (
              <div key={c.id}>
                <div className="flex items-baseline justify-between text-xs mb-1">
                  <span className="font-semibold inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-sm" style={{ background:c.color }}/>
                    <span>{c.name}</span>
                  </span>
                  <span className="tabular-nums font-bold" style={{ color: c.color }}>{formatMADCompact(data.total)}</span>
                </div>
                <div className="h-2 bg-stone-100 rounded-full overflow-hidden flex">
                  {Object.entries(data.byCat).sort((a,b) => b[1]-a[1]).map(([catKey, val]) => {
                    const w = (val / maxChantierCost) * 100;
                    return <div key={catKey} title={`${CONSOMM_CATEGORIES[catKey].label}: ${formatMADCompact(val)}`}
                                style={{ width: w + '%', background: CONSOMM_CATEGORIES[catKey].color }}/>;
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-3 text-[10px] text-stone-500 flex-wrap">
          {Object.entries(CONSOMM_CATEGORIES).slice(0, 8).map(([k,v]) => (
            <div key={k} className="inline-flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm" style={{ background:v.color }}/>
              {v.label}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Most used items */}
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Articles les plus consommés</h3>
          <div className="space-y-2">
            {mostUsed.map(({ it, totalQty, totalCost }, i) => {
              const max = Math.max(...mostUsed.map(x => x.totalCost));
              const pct = (totalCost / max) * 100;
              const cat = CONSOMM_CATEGORIES[it.cat];
              return (
                <div key={it.id}>
                  <div className="flex items-baseline justify-between text-xs mb-0.5">
                    <span className="font-semibold inline-flex items-center gap-1.5 min-w-0">
                      <span className="text-stone-400 tabular-nums w-4">#{i+1}</span>
                      <span className="w-1.5 h-1.5 rounded-sm flex-shrink-0" style={{ background:cat.color }}/>
                      <span className="truncate">{it.name}</span>
                    </span>
                    <span className="tabular-nums font-bold ml-2 flex-shrink-0">{formatMADCompact(totalCost)}</span>
                  </div>
                  <div className="h-1 bg-stone-100 rounded-full overflow-hidden ml-6">
                    <div className="h-full rounded-full" style={{ width: pct+'%', background: cat.color }}/>
                  </div>
                  <div className="text-[10px] text-stone-500 ml-6">{totalQty} {it.unit}</div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Price evolution */}
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Évolution des prix</h3>
          <PriceChart items={priceItems}/>
        </Card>
      </div>

      {/* Supplier compare */}
      {supplierCompare.length > 0 && (
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Comparaison fournisseurs</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {supplierCompare.map(({ it, suppliers }) => (
              <div key={it.id} className="border rounded-lg p-3" style={{ borderColor:'#F0EAE0' }}>
                <div className="font-semibold text-sm">{it.name}</div>
                <div className="space-y-1 mt-2">
                  {suppliers.sort((a,b) => a.avg - b.avg).map(({ sup, avg, count }, i) => (
                    <div key={sup.id} className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5">
                        {i === 0 && <span className="w-3 h-3 rounded-full text-white flex items-center justify-center text-[8px] font-bold" style={{ background:'#2E9152' }}>✓</span>}
                        <span className="font-semibold">{sup.name}</span>
                        <span className="text-stone-400">({count} achats)</span>
                      </span>
                      <span className="tabular-nums font-bold">{formatMADCompact(avg)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function PriceChart({ items }) {
  if (items.length === 0 || items.every(x => x.pts.length === 0)) {
    return <div className="text-stone-400 text-sm italic py-6 text-center">Pas assez de données.</div>;
  }
  const w = 480, h = 180, pad = 25;
  // All dates
  const allDates = [...new Set(items.flatMap(x => x.pts.map(p => p.date)))].sort();
  const dateIdx = Object.fromEntries(allDates.map((d, i) => [d, i]));
  const maxN = Math.max(1, allDates.length - 1);
  // Normalize each item's price series to its first point
  const colors = ['#0E5460', '#C25B3F', '#7C5E2A', '#2E9152'];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <line x1={pad} y1={h-pad} x2={w-pad} y2={h-pad} stroke="#E8E2D8" strokeWidth="1"/>
      {items.map(({ it, pts }, idx) => {
        if (pts.length === 0) return null;
        const base = pts[0].price;
        const path = pts.map((p, i) => {
          const x = pad + (dateIdx[p.date] / maxN) * (w - 2*pad);
          const rel = (p.price - base) / base;
          const y = h - pad - (rel + 0.2) / 0.4 * (h - 2*pad); // ±20% range
          return `${i === 0 ? 'M' : 'L'}${x},${Math.max(pad, Math.min(h-pad, y))}`;
        }).join(' ');
        return <path key={it.id} d={path} stroke={colors[idx]} strokeWidth="2" fill="none" strokeLinecap="round"/>;
      })}
      <text x={pad} y={h-6} fontSize="9" fill="#A8A09B">{frenchDateFromISO(allDates[0] || '2026-01-01')}</text>
      <text x={w-pad} y={h-6} textAnchor="end" fontSize="9" fill="#A8A09B">{frenchDateFromISO(allDates[allDates.length-1] || '2026-05-15')}</text>
      <g transform={`translate(${pad+4}, 12)`}>
        {items.map(({ it }, idx) => (
          <g key={it.id} transform={`translate(0, ${idx*14})`}>
            <rect width="10" height="2" y="4" fill={colors[idx]}/>
            <text x="14" y="9" fontSize="10" fill="#1F2421" fontWeight="600">{it.name}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ─── Fournisseurs tab ─────────────────────────────────────────
function FournisseursTab({ suppliers, items, purchases, onAdd, onEdit }) {
  const [search, setSearch] = useTbState('');
  const filtered = suppliers.filter(s =>
    !search || `${s.name} ${s.type || ''} ${s.city || ''}`.toLowerCase().includes(search.toLowerCase())
  );

  // Aggregate per-supplier usage: how many items reference it, total achats value.
  const stats = {};
  suppliers.forEach(s => { stats[s.id] = { itemCount: 0, purchaseCount: 0, purchaseTotal: 0 }; });
  items.forEach(it => { if (stats[it.supplier]) stats[it.supplier].itemCount += 1; });
  purchases.forEach(p => {
    if (!stats[p.supplier]) return;
    stats[p.supplier].purchaseCount += 1;
    stats[p.supplier].purchaseTotal += p.items.reduce((a, li) => a + li.qty * li.unitPrice, 0);
  });

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative">
          <Icons.Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
                 placeholder="Rechercher un fournisseur…"
                 className="bg-white border border-stone-200 rounded-lg pl-7 pr-3 py-1.5 text-sm w-64 focus:outline-none focus:border-stone-400"/>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-stone-500"><b className="text-stone-900">{filtered.length}</b> fournisseur{filtered.length>1?'s':''}</span>
          <Btn variant="primary" icon={<Icons.Plus size={13}/>} onClick={() => onAdd('supplier')}>Ajouter</Btn>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8">
          <EmptyState icon={<Icons.Building size={20}/>}
                      title={suppliers.length === 0 ? "Aucun fournisseur enregistré" : "Aucun résultat"}
                      hint={suppliers.length === 0
                        ? "Créez votre premier fournisseur pour pouvoir saisir des articles et des achats."
                        : "Ajustez votre recherche."}/>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-stone-500 font-semibold" style={{ background:'#FAF7F1' }}>
                <th className="px-4 py-2.5">Raison sociale</th>
                <th className="px-3 py-2.5">Type</th>
                <th className="px-3 py-2.5">Ville</th>
                <th className="px-3 py-2.5">Téléphone</th>
                <th className="px-3 py-2.5 text-right">Articles</th>
                <th className="px-3 py-2.5 text-right">Achats</th>
                <th className="px-3 py-2.5 text-right">Total achats</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(s => {
                const st = stats[s.id] || { itemCount: 0, purchaseCount: 0, purchaseTotal: 0 };
                return (
                  <tr key={s.id} className="border-t hover:bg-stone-50/60" style={{ borderColor:'#F0EAE0' }}>
                    <td className="px-4 py-2.5 font-semibold">{s.name}</td>
                    <td className="px-3 py-2.5 text-stone-600">{s.type || '—'}</td>
                    <td className="px-3 py-2.5 text-stone-600">{s.city || '—'}</td>
                    <td className="px-3 py-2.5 text-stone-600 tabular-nums">{s.phone || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{st.itemCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{st.purchaseCount}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{formatMADCompact(st.purchaseTotal)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <button onClick={() => onEdit('supplier', s)}
                              className="text-stone-500 hover:text-stone-900 inline-flex items-center gap-1 text-xs font-semibold">
                        <Icons.Edit size={12}/> Modifier
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

window.CatalogueTab = CatalogueTab;
window.AchatsTab = AchatsTab;
window.ConsommationTab = ConsommationTab;
window.StocksTab = StocksTab;
window.AnalysesTab = AnalysesTab;
window.FournisseursTab = FournisseursTab;
