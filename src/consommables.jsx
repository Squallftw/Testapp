// Consommables — main page
const { useState: useCnState, useMemo: useCnMemo, useEffect: useCnEff } = React;

// ─── Helpers ──────────────────────────────────────────────────
function getSupplier(id) { return SUPPLIERS.find(s => s.id === id); }
function getItem(items, id) { return items.find(i => i.id === id); }
function getLocation(id) {
  if (id === 'depot') return { id: 'depot', name: 'Dépôt central', isWarehouse: true };
  const c = CHANTIERS.find(x => x.id === id);
  return c ? { id: c.id, name: c.name, color: c.color, isWarehouse: false } : null;
}

function computeStock(itemId, locationId, purchases, consumption, transfers) {
  let qty = 0;
  purchases.forEach(p => {
    if (p.location !== locationId) return;
    p.items.forEach(li => { if (li.itemId === itemId) qty += li.qty; });
  });
  transfers.forEach(t => {
    if (t.itemId !== itemId) return;
    if (t.from === locationId) qty -= t.qty;
    if (t.to === locationId)   qty += t.qty;
  });
  // Consumption is only ever from a chantier (not depot)
  consumption.forEach(u => {
    if (u.itemId !== itemId) return;
    // For prototype assume consumption is from the chantier location directly
    if (locationId === u.chantierId) qty -= u.qty;
  });
  return qty;
}

function computeStockByItem(itemId, purchases, consumption, transfers) {
  const out = {};
  ['depot', ...CHANTIERS.map(c => c.id)].forEach(loc => {
    out[loc] = computeStock(itemId, loc, purchases, consumption, transfers);
  });
  out.total = Object.values(out).reduce((a,b) => a+b, 0);
  return out;
}

function frenchDateFromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MOIS_FR_SHORT[m-1]} ${y}`;
}
function frenchDateLongFromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MOIS_FR[m-1]} ${y}`;
}

function purchaseTotal(p) {
  return p.items.reduce((a, li) => a + li.qty * li.unitPrice, 0);
}

// ─── Main page ────────────────────────────────────────────────
function Consommables({ ctx }) {
  const [tab, setTab] = useCnState('apercu');
  const [items, setItems] = useCnState(() => JSON.parse(JSON.stringify(window.CONSOMM_ITEMS || [])));
  const [purchases, setPurchases] = useCnState(() => JSON.parse(JSON.stringify(window.PURCHASES_SEED || [])));
  const [consumption, setConsumption] = useCnState(() => JSON.parse(JSON.stringify(window.CONSUMPTION_SEED || [])));
  const [transfers, setTransfers] = useCnState(() => JSON.parse(JSON.stringify(window.TRANSFERS_SEED || [])));
  const [audit, setAudit] = useCnState(() => JSON.parse(JSON.stringify(window.CONSOMM_AUDIT_SEED || [])));
  const [suppliers, setSuppliers] = useCnState(() => JSON.parse(JSON.stringify(window.SUPPLIERS || [])));

  // Mirror suppliers back to the global so existing read paths in the forms /
  // tabs (which still reference `SUPPLIERS` lexically) stay in sync.
  React.useEffect(() => { window.SUPPLIERS = suppliers; }, [suppliers]);

  // Persist consommables slices
  React.useEffect(() => {
    if (window.__BATI_PERSIST_PATCH) {
      window.__BATI_PERSIST_PATCH({
        consommItems: items,
        purchases,
        consumption,
        transfers,
        consommAudit: audit,
        suppliers,
      });
    }
  }, [items, purchases, consumption, transfers, audit, suppliers]);

  // Active filters (shared across tabs that need them)
  const [filterChantier, setFilterChantier] = useCnState('all');
  const [filterCat, setFilterCat] = useCnState('all');

  function logAudit(action, entity, label) {
    setAudit(prev => [{ id: 'ca-' + Date.now(), ts: Date.now(), user: 'Youssef Berrada (Patron)', action, entity, label }, ...prev]);
  }

  function savePurchase(p, isNew) {
    setPurchases(prev => {
      if (isNew) return [{ ...p, id: 'p-' + Date.now() }, ...prev];
      return prev.map(x => x.id === p.id ? p : x);
    });
    logAudit(isNew ? 'created' : 'edited', 'purchase',
      `Achat chez ${getSupplier(p.supplier)?.name || ''} (${formatMADCompact(purchaseTotal(p))})`);
  }
  function deletePurchase(id) {
    setPurchases(prev => prev.filter(p => p.id !== id));
    logAudit('deleted', 'purchase', `Achat supprimé`);
  }
  function saveConsumption(u, isNew) {
    setConsumption(prev => {
      if (isNew) return [{ ...u, id: 'u-' + Date.now() }, ...prev];
      return prev.map(x => x.id === u.id ? u : x);
    });
    const item = getItem(items, u.itemId);
    const ch = CHANTIERS.find(c => c.id === u.chantierId);
    logAudit(isNew ? 'created' : 'edited', 'consumption',
      `${u.isLoss ? 'Perte' : 'Sortie'} ${u.qty} ${item?.unit} ${item?.name} — ${ch?.name}`);
  }
  function deleteConsumption(id) {
    setConsumption(prev => prev.filter(u => u.id !== id));
    logAudit('deleted', 'consumption', `Mouvement supprimé`);
  }
  function saveItem(it, isNew) {
    setItems(prev => {
      if (isNew) return [...prev, { ...it, id: 'c-' + Date.now() }];
      return prev.map(x => x.id === it.id ? it : x);
    });
    logAudit(isNew ? 'created' : 'edited', 'item', `${isNew ? 'Article créé' : 'Article modifié'}: ${it.name}`);
  }
  function deleteItem(id) {
    const it = items.find(x => x.id === id);
    setItems(prev => prev.filter(x => x.id !== id));
    logAudit('deleted', 'item', `Article supprimé: ${it?.name}`);
  }
  function saveTransfer(t) {
    setTransfers(prev => [{ ...t, id: 'tr-' + Date.now() }, ...prev]);
    const it = getItem(items, t.itemId);
    logAudit('created', 'transfer', `Transfert ${t.qty} ${it?.unit} ${it?.name}: ${getLocation(t.from)?.name} → ${getLocation(t.to)?.name}`);
  }
  function saveSupplier(s, isNew) {
    setSuppliers(prev => {
      if (isNew) return [...prev, { ...s, id: 's-' + Date.now().toString(36) }];
      return prev.map(x => x.id === s.id ? s : x);
    });
    logAudit(isNew ? 'created' : 'edited', 'supplier', `${isNew ? 'Fournisseur créé' : 'Fournisseur modifié'}: ${s.name}`);
  }
  function deleteSupplier(id) {
    const s = suppliers.find(x => x.id === id);
    setSuppliers(prev => prev.filter(x => x.id !== id));
    logAudit('deleted', 'supplier', `Fournisseur supprimé: ${s?.name}`);
  }

  // Modal state — opening any "Add" CTA from anywhere
  const [adding, setAdding] = useCnState(null); // 'purchase' | 'consumption' | 'item' | 'transfer'
  const [editing, setEditing] = useCnState(null); // { kind, entity }

  const tabs = [
    { id: 'apercu',        label: 'Aperçu',       icon: 'Dashboard' },
    { id: 'catalogue',     label: 'Catalogue',    icon: 'Coins' },
    { id: 'achats',        label: 'Achats',       icon: 'Plus' },
    { id: 'consommation',  label: 'Consommation', icon: 'Minus' },
    { id: 'stocks',        label: 'Stocks',       icon: 'Building' },
    { id: 'fournisseurs',  label: 'Fournisseurs', icon: 'Bank' },
    { id: 'analyses',      label: 'Analyses',     icon: 'TrendUp' }
  ];

  const sharedCtx = {
    items, purchases, consumption, transfers, audit, suppliers,
    filterChantier, setFilterChantier, filterCat, setFilterCat,
    savePurchase, deletePurchase, saveConsumption, deleteConsumption,
    saveItem, deleteItem, saveTransfer, saveSupplier, deleteSupplier,
    onAdd: (kind) => setAdding(kind),
    onEdit: (kind, entity) => setEditing({ kind, entity })
  };

  return (
    <div>
      <PageHeader title="Consommables"
                  subtitle="Catalogue, achats, consommation et stocks de matériaux par chantier."
                  right={<>
                    <Btn icon={<Icons.Plus size={13}/>} onClick={() => setAdding('consumption')}>Sortie</Btn>
                    <Btn icon={<Icons.Plus size={13}/>} onClick={() => setAdding('purchase')}>Achat</Btn>
                    <Btn variant="primary" icon={<Icons.Plus size={13}/>} onClick={() => setAdding('item')}>Article</Btn>
                  </>}/>

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-5 border-b" style={{ borderColor:'#E8E2D8' }}>
        {tabs.map(t => {
          const Ic = Icons[t.icon];
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
                    className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition -mb-px`}
                    style={{
                      borderColor: active ? '#0E5460' : 'transparent',
                      color: active ? '#0E5460' : '#6B6359'
                    }}>
              <Ic size={14}/>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'apercu'       && <ApercuTab {...sharedCtx}/>}
      {tab === 'catalogue'    && <CatalogueTab {...sharedCtx}/>}
      {tab === 'achats'       && <AchatsTab {...sharedCtx}/>}
      {tab === 'consommation' && <ConsommationTab {...sharedCtx}/>}
      {tab === 'stocks'       && <StocksTab {...sharedCtx}/>}
      {tab === 'fournisseurs' && <FournisseursTab {...sharedCtx}/>}
      {tab === 'analyses'     && <AnalysesTab {...sharedCtx}/>}

      {/* Add / Edit modals */}
      {adding === 'item' && <ItemForm items={items} onClose={() => setAdding(null)}
                                       onSave={(it) => { saveItem(it, true); setAdding(null); }}/>}
      {adding === 'purchase' && <PurchaseForm items={items} onClose={() => setAdding(null)}
                                              onSave={(p) => { savePurchase(p, true); setAdding(null); }}/>}
      {adding === 'consumption' && <ConsumptionForm items={items} purchases={purchases} consumption={consumption} transfers={transfers}
                                                    onClose={() => setAdding(null)}
                                                    onSave={(u) => { saveConsumption(u, true); setAdding(null); }}/>}
      {adding === 'transfer' && <TransferForm items={items} purchases={purchases} consumption={consumption} transfers={transfers}
                                               onClose={() => setAdding(null)}
                                               onSave={(t) => { saveTransfer(t); setAdding(null); }}/>}
      {adding === 'supplier' && <SupplierForm onClose={() => setAdding(null)}
                                               onSave={(s) => { saveSupplier(s, true); setAdding(null); }}/>}
      {editing?.kind === 'item' && <ItemForm items={items} item={editing.entity} onClose={() => setEditing(null)}
                                              onSave={(it) => { saveItem(it, false); setEditing(null); }}
                                              onDelete={() => { deleteItem(editing.entity.id); setEditing(null); }}/>}
      {editing?.kind === 'purchase' && <PurchaseForm items={items} purchase={editing.entity} onClose={() => setEditing(null)}
                                                     onSave={(p) => { savePurchase(p, false); setEditing(null); }}
                                                     onDelete={() => { deletePurchase(editing.entity.id); setEditing(null); }}/>}
      {editing?.kind === 'consumption' && <ConsumptionForm items={items} purchases={purchases} consumption={consumption} transfers={transfers}
                                                            entry={editing.entity} onClose={() => setEditing(null)}
                                                            onSave={(u) => { saveConsumption(u, false); setEditing(null); }}
                                                            onDelete={() => { deleteConsumption(editing.entity.id); setEditing(null); }}/>}
      {editing?.kind === 'supplier' && <SupplierForm supplier={editing.entity} onClose={() => setEditing(null)}
                                                      onSave={(s) => { saveSupplier(s, false); setEditing(null); }}
                                                      onDelete={() => { deleteSupplier(editing.entity.id); setEditing(null); }}/>}
    </div>
  );
}

// ─── Aperçu (dashboard) tab ───────────────────────────────────
function ApercuTab({ items, purchases, consumption, transfers, audit, onAdd }) {
  // Stock & alerts
  const stockByItem = useCnMemo(() => {
    const m = {};
    items.forEach(it => { m[it.id] = computeStockByItem(it.id, purchases, consumption, transfers); });
    return m;
  }, [items, purchases, consumption, transfers]);

  const lowStock = items
    .map(it => ({ it, stock: stockByItem[it.id]?.total || 0 }))
    .filter(({ it, stock }) => stock < it.threshold)
    .sort((a,b) => (a.stock / a.it.threshold) - (b.stock / b.it.threshold));

  // This week's totals
  const today = new Date(TODAY.year, TODAY.monthIdx, TODAY.day);
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - 6);
  const isThisWeek = (iso) => {
    const d = new Date(iso);
    return d >= weekStart && d <= today;
  };
  const weekPurchases = purchases.filter(p => isThisWeek(p.date));
  const weekPurchaseTotal = weekPurchases.reduce((a,p) => a + purchaseTotal(p), 0);
  const weekConsumption = consumption.filter(u => isThisWeek(u.date));
  const weekConsumptionTotal = weekConsumption.reduce((a,u) => {
    const it = items.find(i => i.id === u.itemId);
    return a + u.qty * (it?.price || 0);
  }, 0);

  // Top chantiers by spend this month
  const monthSpend = {};
  CHANTIERS.forEach(c => monthSpend[c.id] = 0);
  consumption.forEach(u => {
    const d = new Date(u.date);
    if (d.getFullYear() !== TODAY.year || d.getMonth() !== TODAY.monthIdx) return;
    const it = items.find(i => i.id === u.itemId);
    monthSpend[u.chantierId] = (monthSpend[u.chantierId] || 0) + u.qty * (it?.price || 0);
  });
  const topChantiers = [...CHANTIERS].sort((a,b) => monthSpend[b.id] - monthSpend[a.id]).slice(0, 3);

  // Recent price changes — synthetic for prototype: surface 2 items with recent purchases at non-default prices
  const priceChanges = items
    .map(it => {
      const recentPurchases = purchases
        .filter(p => p.items.some(li => li.itemId === it.id))
        .flatMap(p => p.items.filter(li => li.itemId === it.id).map(li => ({ date: p.date, price: li.unitPrice })))
        .sort((a,b) => b.date.localeCompare(a.date));
      if (recentPurchases.length < 2) return null;
      const newest = recentPurchases[0];
      const older = recentPurchases[recentPurchases.length-1];
      if (newest.price === older.price) return null;
      const delta = newest.price - older.price;
      const deltaPct = (delta / older.price) * 100;
      return { it, newest, older, delta, deltaPct };
    })
    .filter(Boolean)
    .sort((a,b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
    .slice(0, 4);

  return (
    <div className="space-y-5">
      {/* Top KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CnKpi icon="AlertTri" label="Stock bas" value={lowStock.length} sub={lowStock.length > 0 ? 'Réapprovisionnement requis' : 'Tout est OK'} warn={lowStock.length > 0}/>
        <CnKpi icon="Plus" label="Achats cette semaine" value={formatMADCompact(weekPurchaseTotal)} sub={`${weekPurchases.length} livraisons`}/>
        <CnKpi icon="Minus" label="Sorties cette semaine" value={formatMADCompact(weekConsumptionTotal)} sub={`${weekConsumption.length} mouvements`} accent/>
        <CnKpi icon="TrendUp" label="Articles au catalogue" value={items.length} sub={`${Object.keys(CONSOMM_CATEGORIES).length} catégories`}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Low stock alerts */}
        <Card className="lg:col-span-2 overflow-hidden">
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor:'#F0EAE0' }}>
            <div className="flex items-center gap-2">
              <Icons.AlertTri size={14} style={{ color:'#C25B3F' }}/>
              <h3 className="font-bold text-sm">Alertes de stock</h3>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background:'#FBE3DC', color:'#8A2C1E' }}>{lowStock.length}</span>
            </div>
            <Btn size="sm" onClick={() => onAdd('purchase')} icon={<Icons.Plus size={11}/>}>Commander</Btn>
          </div>
          {lowStock.length === 0 ? (
            <EmptyState icon={<Icons.Check size={20}/>} title="Tous les stocks sont OK"/>
          ) : (
            <div className="divide-y" style={{ borderColor:'#F0EAE0' }}>
              {lowStock.slice(0,6).map(({ it, stock }) => {
                const cat = CONSOMM_CATEGORIES[it.cat];
                const pct = Math.min(100, Math.max(0, (stock / it.threshold) * 100));
                const sup = getSupplier(it.supplier);
                return (
                  <div key={it.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-stone-50" style={{ borderColor:'#F0EAE0' }}>
                    <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: cat.color }}/>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{it.name}</div>
                      <div className="text-[11px] text-stone-500">{sup?.name || '—'} · seuil: {it.threshold} {it.unit}</div>
                    </div>
                    <div className="w-32">
                      <div className="flex items-baseline justify-between text-xs mb-0.5">
                        <span className="font-bold tabular-nums" style={{ color: stock <= 0 ? '#C25B3F' : '#C58122' }}>{stock} <span className="text-stone-400 font-medium">{it.unit}</span></span>
                        <span className="text-[10px] text-stone-400 tabular-nums">/{it.threshold}</span>
                      </div>
                      <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: pct+'%', background: stock <= 0 ? '#C25B3F' : '#C58122' }}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Top chantiers this month */}
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Top dépenses ce mois</h3>
          <div className="space-y-3">
            {topChantiers.map((c, i) => {
              const total = Object.values(monthSpend).reduce((a,b)=>a+b,0);
              const pct = total > 0 ? (monthSpend[c.id] / total) * 100 : 0;
              return (
                <div key={c.id}>
                  <div className="flex items-baseline justify-between text-xs mb-1">
                    <span className="font-semibold inline-flex items-center gap-1.5">
                      <span className="text-stone-400 tabular-nums">#{i+1}</span>
                      <span className="w-2 h-2 rounded-sm" style={{ background:c.color }}/>
                      <span className="truncate">{c.name}</span>
                    </span>
                    <span className="tabular-nums font-bold" style={{ color: c.color }}>{formatMADCompact(monthSpend[c.id])}</span>
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: pct+'%', background: c.color }}/>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Recent price changes */}
        <Card className="lg:col-span-2 p-4">
          <h3 className="font-bold text-sm mb-3">Variations de prix récentes</h3>
          {priceChanges.length === 0 ? (
            <div className="text-xs text-stone-400 italic py-2">Aucune variation détectée sur les derniers achats.</div>
          ) : (
            <div className="space-y-2">
              {priceChanges.map(({ it, newest, older, delta, deltaPct }) => {
                const up = delta > 0;
                return (
                  <div key={it.id} className="flex items-center gap-3 py-1.5 border-b last:border-b-0" style={{ borderColor:'#F0EAE0' }}>
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: CONSOMM_CATEGORIES[it.cat].color }}/>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate">{it.name}</div>
                      <div className="text-[10px] text-stone-500">{frenchDateFromISO(older.date)} → {frenchDateFromISO(newest.date)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs tabular-nums">
                        <span className="text-stone-400 line-through">{formatMADCompact(older.price)}</span>
                        <span className="mx-1.5 text-stone-300">→</span>
                        <span className="font-bold text-stone-900">{formatMADCompact(newest.price)}</span>
                      </div>
                      <div className={`text-[10px] font-bold tabular-nums`} style={{ color: up ? '#C25B3F' : '#2E9152' }}>
                        {up ? '▲' : '▼'} {Math.abs(deltaPct).toFixed(1)}%
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card className="p-4">
          <h3 className="font-bold text-sm mb-3">Activité récente</h3>
          <div className="space-y-2.5 text-xs">
            {audit.slice(0, 5).map(e => {
              const colors = { created:'#2E9152', edited:'#C58122', deleted:'#C25B3F' };
              return (
                <div key={e.id} className="flex gap-2">
                  <span className="w-1 rounded-full flex-shrink-0" style={{ background: colors[e.action] }}/>
                  <div className="flex-1 min-w-0">
                    <div className="text-stone-700">{e.label}</div>
                    <div className="text-[10px] text-stone-400">{e.user} · {relativeTime(new Date(e.ts))}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

function CnKpi({ icon, label, value, sub, accent, warn }) {
  const Ic = Icons[icon];
  const tint = warn ? '#C25B3F' : accent ? '#0E5460' : '#1F2421';
  const bg = warn ? '#FBE3DC' : accent ? '#D8E5E7' : '#F0EAE0';
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: bg, color: tint }}>
          <Ic size={17}/>
        </div>
      </div>
      <div className="text-2xl font-bold mt-3 tabular-nums" style={{ color: tint }}>{value}</div>
      <div className="text-[11px] uppercase tracking-wider text-stone-500 font-medium mt-0.5">{label}</div>
      {sub && <div className="text-xs text-stone-500 mt-1.5">{sub}</div>}
    </Card>
  );
}

window.Consommables = Consommables;
window.computeStockByItem = computeStockByItem;
window.computeStock = computeStock;
window.purchaseTotal = purchaseTotal;
window.getSupplier = getSupplier;
window.frenchDateFromISO = frenchDateFromISO;
window.frenchDateLongFromISO = frenchDateLongFromISO;
