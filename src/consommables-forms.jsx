// Consommables — forms for Item / Purchase / Consumption / Transfer
const { useState: useFmState } = React;

function CnFormField({ label, hint, children }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5 flex items-center justify-between">
        <span>{label}</span>
        {hint && <span className="text-stone-400 normal-case tracking-normal font-normal">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

// ─── SupplierForm ─────────────────────────────────────────────
function SupplierForm({ supplier, onSave, onDelete, onClose }) {
  const [name, setName] = useFmState(supplier?.name || '');
  const [type, setType] = useFmState(supplier?.type || '');
  const [city, setCity] = useFmState(supplier?.city || '');
  const [phone, setPhone] = useFmState(supplier?.phone || '');

  function save() {
    if (!name.trim()) return;
    onSave({
      ...(supplier || {}),
      name: name.trim(),
      type: type.trim(),
      city: city.trim(),
      phone: phone.trim(),
    });
  }

  return (
    <Modal title={supplier ? 'Modifier le fournisseur' : 'Nouveau fournisseur'} onClose={onClose} width="max-w-lg">
      <div className="space-y-4">
        <CnFormField label="Raison sociale">
          <input autoFocus className="bati-input" maxLength={120} value={name}
                 onChange={e => setName(e.target.value)} placeholder="ex. Lafarge Holcim"/>
        </CnFormField>
        <div className="grid grid-cols-2 gap-3">
          <CnFormField label="Type / spécialité">
            <input className="bati-input" maxLength={60} value={type}
                   onChange={e => setType(e.target.value)} placeholder="ex. Cimentier, Distributeur…"/>
          </CnFormField>
          <CnFormField label="Ville">
            <input className="bati-input" maxLength={60} value={city}
                   onChange={e => setCity(e.target.value)} placeholder="ex. Casablanca"/>
          </CnFormField>
        </div>
        <CnFormField label="Téléphone">
          <input className="bati-input" maxLength={40} value={phone}
                 onChange={e => setPhone(e.target.value)} placeholder="+212 522 ..."/>
        </CnFormField>
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor:'#F0EAE0' }}>
          {supplier && onDelete ? (
            <button onClick={onDelete} className="text-xs font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1">
              <Icons.Trash size={12}/> Supprimer
            </button>
          ) : <span/>}
          <div className="flex gap-2">
            <Btn onClick={onClose}>Annuler</Btn>
            <Btn variant="primary" onClick={save} disabled={!name.trim()}>{supplier ? 'Enregistrer' : 'Créer'}</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// Tiny inline helper when no suppliers exist yet — used inside ItemForm / PurchaseForm.
function EmptySupplierHint() {
  return (
    <div className="text-xs p-3 rounded-lg" style={{ background:'#FBE3DC', color:'#7A2814', border:'1px solid #ECC2B3' }}>
      Aucun fournisseur enregistré. Ouvrez l'onglet <b>Fournisseurs</b> pour en créer un, puis revenez ici.
    </div>
  );
}

// ─── ItemForm ─────────────────────────────────────────────────
function ItemForm({ item, items, onSave, onDelete, onClose }) {
  const [name, setName] = useFmState(item?.name || '');
  const [cat, setCat] = useFmState(item?.cat || 'maconnerie');
  const [unit, setUnit] = useFmState(item?.unit || 'pièce');
  const [price, setPrice] = useFmState(item?.price ?? '');
  const [supplier, setSupplier] = useFmState(item?.supplier || SUPPLIERS[0]?.id || '');
  const [threshold, setThreshold] = useFmState(item?.threshold ?? 0);
  const [hasExpiry, setHasExpiry] = useFmState(!!item?.hasExpiry);
  const [notes, setNotes] = useFmState(item?.notes || '');

  function save() {
    if (!name.trim()) return;
    onSave({
      ...(item || {}),
      name: name.trim(),
      cat, unit,
      price: parseFloat(price) || 0,
      supplier,
      threshold: parseFloat(threshold) || 0,
      hasExpiry: hasExpiry || undefined,
      notes: notes.trim() || undefined
    });
  }

  return (
    <Modal title={item ? 'Modifier l\'article' : 'Nouvel article'} onClose={onClose} width="max-w-xl">
      <div className="space-y-4">
        <CnFormField label="Nom de l'article">
          <input autoFocus className="bati-input" value={name} onChange={e => setName(e.target.value)} placeholder="ex. Ciment CPJ 45 (50kg)"/>
        </CnFormField>
        <div className="grid grid-cols-2 gap-3">
          <CnFormField label="Catégorie">
            <select className="bati-input" value={cat} onChange={e => setCat(e.target.value)}>
              {Object.entries(CONSOMM_CATEGORIES).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </CnFormField>
          <CnFormField label="Unité de mesure">
            <select className="bati-input" value={unit} onChange={e => setUnit(e.target.value)}>
              {CONSOMM_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </CnFormField>
          <CnFormField label="Prix moyen (DH)">
            <input type="number" step="0.1" className="bati-input" value={price} onChange={e => setPrice(e.target.value)} placeholder="0"/>
          </CnFormField>
          <CnFormField label="Seuil de réappro" hint={unit}>
            <input type="number" className="bati-input" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="0"/>
          </CnFormField>
        </div>
        <CnFormField label="Fournisseur principal">
          {SUPPLIERS.length === 0 ? <EmptySupplierHint/> : (
            <select className="bati-input" value={supplier} onChange={e => setSupplier(e.target.value)}>
              {SUPPLIERS.map(s => <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>)}
            </select>
          )}
        </CnFormField>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" checked={hasExpiry} onChange={e => setHasExpiry(e.target.checked)} className="accent-stone-700"/>
          Produit périssable (date de péremption à suivre)
        </label>
        <CnFormField label="Notes (optionnel)">
          <textarea rows="2" className="bati-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex. Sac de 50 kg, calibre, marque…"/>
        </CnFormField>
        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor:'#F0EAE0' }}>
          {item && onDelete ? (
            <button onClick={onDelete} className="text-xs font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1">
              <Icons.Trash size={12}/> Supprimer
            </button>
          ) : <span/>}
          <div className="flex gap-2">
            <Btn onClick={onClose}>Annuler</Btn>
            <Btn variant="primary" onClick={save} disabled={!name.trim()}>{item ? 'Enregistrer' : 'Créer'}</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── PurchaseForm ─────────────────────────────────────────────
function PurchaseForm({ purchase, items, onSave, onDelete, onClose }) {
  const [date, setDate] = useFmState(purchase?.date || new Date().toISOString().slice(0,10));
  const [supplier, setSupplier] = useFmState(purchase?.supplier || SUPPLIERS[0]?.id || '');
  const [location, setLocation] = useFmState(purchase?.location || 'depot');
  const [invoice, setInvoice] = useFmState(purchase?.invoice || '');
  const [payment, setPayment] = useFmState(purchase?.payment || 'paid');
  const [lines, setLines] = useFmState(purchase?.items || (items[0] ? [{ itemId: items[0].id, qty: 1, unitPrice: items[0].price || 0 }] : []));

  function updateLine(i, patch) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...patch } : l));
  }
  function addLine() {
    setLines(prev => [...prev, { itemId: items[0]?.id, qty: 1, unitPrice: items[0]?.price || 0 }]);
  }
  function removeLine(i) {
    setLines(prev => prev.filter((_, idx) => idx !== i));
  }
  function pickItem(i, itemId) {
    const it = items.find(x => x.id === itemId);
    updateLine(i, { itemId, unitPrice: it?.price ?? 0 });
  }
  const total = lines.reduce((a, l) => a + (l.qty * l.unitPrice || 0), 0);

  function save() {
    onSave({
      ...(purchase || {}),
      date, supplier, location, invoice: invoice.trim(), payment,
      items: lines.filter(l => l.itemId && l.qty > 0)
    });
  }

  return (
    <Modal title={purchase ? 'Modifier l\'achat' : 'Nouvel achat'} onClose={onClose} width="max-w-2xl">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <CnFormField label="Date de la livraison">
            <input type="date" className="bati-input" value={date} onChange={e => setDate(e.target.value)}/>
          </CnFormField>
          <CnFormField label="Fournisseur">
            {SUPPLIERS.length === 0 ? <EmptySupplierHint/> : (
              <select className="bati-input" value={supplier} onChange={e => setSupplier(e.target.value)}>
                {SUPPLIERS.map(s => <option key={s.id} value={s.id}>{s.name}{s.city ? ` — ${s.city}` : ''}</option>)}
              </select>
            )}
          </CnFormField>
          <CnFormField label="Destination">
            <select className="bati-input" value={location} onChange={e => setLocation(e.target.value)}>
              <option value="depot">Dépôt central</option>
              {CHANTIERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </CnFormField>
          <CnFormField label="Statut de paiement">
            <select className="bati-input" value={payment} onChange={e => setPayment(e.target.value)}>
              <option value="paid">Payé</option>
              <option value="partial">Partiel</option>
              <option value="pending">En attente</option>
            </select>
          </CnFormField>
        </div>
        <CnFormField label="N° de facture / bon de livraison">
          <input className="bati-input" value={invoice} onChange={e => setInvoice(e.target.value)} placeholder="ex. F-2026-0518"/>
        </CnFormField>

        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-stone-500 mb-1.5 flex items-center justify-between">
            <span>Articles livrés</span>
            <button onClick={addLine} className="text-stone-700 hover:text-stone-900 inline-flex items-center gap-1 text-[11px]">
              <Icons.Plus size={11}/> Ajouter une ligne
            </button>
          </div>
          <div className="space-y-1.5">
            {lines.map((l, i) => {
              const it = items.find(x => x.id === l.itemId);
              return (
                <div key={i} className="grid grid-cols-[1fr_90px_120px_100px_28px] items-center gap-2 p-2 rounded-lg" style={{ background:'#FAF7F1' }}>
                  <select className="bati-input" value={l.itemId} onChange={e => pickItem(i, e.target.value)}>
                    {items.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
                  </select>
                  <input type="number" step="0.1" placeholder="Qté" className="bati-input text-right" value={l.qty} onChange={e => updateLine(i, { qty: parseFloat(e.target.value) || 0 })}/>
                  <input type="number" step="0.1" placeholder="Prix unit." className="bati-input text-right" value={l.unitPrice} onChange={e => updateLine(i, { unitPrice: parseFloat(e.target.value) || 0 })}/>
                  <div className="text-right tabular-nums font-bold text-sm">{formatMADCompact(l.qty * l.unitPrice)}</div>
                  <button onClick={() => removeLine(i)} className="text-stone-400 hover:text-red-600"><Icons.X size={14}/></button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-baseline justify-end gap-3 text-sm pt-2 border-t" style={{ borderColor:'#F0EAE0' }}>
          <span className="text-stone-500">Total de la livraison</span>
          <span className="text-xl font-bold tabular-nums" style={{ color:'#0E5460' }}>{formatMADCompact(total)}</span>
        </div>

        <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor:'#F0EAE0' }}>
          {purchase && onDelete ? (
            <button onClick={onDelete} className="text-xs font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1">
              <Icons.Trash size={12}/> Supprimer
            </button>
          ) : <span/>}
          <div className="flex gap-2">
            <Btn onClick={onClose}>Annuler</Btn>
            <Btn variant="primary" onClick={save}>{purchase ? 'Enregistrer' : 'Créer l\'achat'}</Btn>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── ConsumptionForm ──────────────────────────────────────────
function ConsumptionForm({ entry, items, purchases, consumption, transfers, onSave, onDelete, onClose }) {
  // Mobile-style flow: chantier → task → item → qty
  const [step, setStep] = useFmState(entry ? 'all' : 'chantier');
  const [chantierId, setChantierId] = useFmState(entry?.chantierId || (CHANTIERS[0]?.id || ''));
  const [taskId, setTaskId] = useFmState(entry?.taskId || '');
  const [itemId, setItemId] = useFmState(entry?.itemId || items[0]?.id);
  const [qty, setQty] = useFmState(entry?.qty ?? 1);
  const [date, setDate] = useFmState(entry?.date || new Date().toISOString().slice(0,10));
  const [recordedBy, setRecordedBy] = useFmState(entry?.recordedBy || OUVRIERS[0].nom);
  const [notes, setNotes] = useFmState(entry?.notes || '');
  const [isLoss, setIsLoss] = useFmState(!!entry?.isLoss);

  const tasks = (() => {
    if (!window.PLANS_SEED) return [];
    const plan = window.PLANS_SEED[chantierId] || [];
    return plan.flatMap(g => g.children.map(t => ({ id: t.id, label: t.label, group: g.label })));
  })();

  const item = items.find(x => x.id === itemId);
  const stockAtLocation = item ? computeStock(itemId, chantierId, purchases, consumption, transfers) : 0;
  const willBeNegative = stockAtLocation - qty < 0;

  function save() {
    onSave({
      ...(entry || {}),
      date, chantierId, taskId, itemId, qty: parseFloat(qty) || 0,
      recordedBy, notes: notes.trim(), isLoss: isLoss || undefined
    });
  }

  // Skip the stepper if we have an existing entry
  const showAll = entry || step === 'all';

  return (
    <Modal title={entry ? 'Modifier la sortie' : 'Nouvelle sortie de stock'} onClose={onClose} width="max-w-xl">
      {!entry && step === 'chantier' && (
        <div className="space-y-3">
          <div className="text-sm text-stone-600">Sur quel chantier la sortie est-elle effectuée ?</div>
          <div className="grid grid-cols-1 gap-2">
            {CHANTIERS.map(c => (
              <button key={c.id}
                      onClick={() => { setChantierId(c.id); setStep('task'); }}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left hover:shadow-sm transition ${chantierId === c.id ? 'border-stone-900' : ''}`}
                      style={{ borderColor: chantierId === c.id ? '#0E5460' : '#E8E2D8' }}>
                <span className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: c.color }}/>
                <div className="min-w-0">
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-[11px] text-stone-500">{c.client}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!entry && step === 'task' && (
        <div className="space-y-3">
          <button onClick={() => setStep('chantier')} className="text-xs text-stone-500 inline-flex items-center gap-1 hover:text-stone-900">
            <Icons.ChevronLeft size={11}/> Changer de chantier
          </button>
          <div className="text-sm text-stone-600">Sur quelle tâche ?</div>
          {tasks.length === 0 ? (
            <div className="text-xs text-stone-400 italic">Aucune tâche planifiée pour ce chantier. Continuez sans tâche.</div>
          ) : (
            <div className="max-h-72 overflow-y-auto border rounded-lg" style={{ borderColor:'#F0EAE0' }}>
              {tasks.map(t => (
                <button key={t.id}
                        onClick={() => { setTaskId(t.id); setStep('item'); }}
                        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-stone-50 text-left border-b last:border-b-0"
                        style={{ borderColor:'#F5EFE3' }}>
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 font-bold w-32 truncate">{t.group}</span>
                  <span className="font-semibold text-sm flex-1">{t.label}</span>
                  <Icons.ChevronRight size={12} className="text-stone-400"/>
                </button>
              ))}
            </div>
          )}
          <div className="flex justify-end">
            <Btn size="sm" onClick={() => setStep('item')}>Continuer sans tâche →</Btn>
          </div>
        </div>
      )}

      {(showAll || step === 'item') && (
        <div className="space-y-4">
          {!entry && (
            <button onClick={() => setStep('task')} className="text-xs text-stone-500 inline-flex items-center gap-1 hover:text-stone-900">
              <Icons.ChevronLeft size={11}/> Étapes précédentes
            </button>
          )}

          {/* Summary */}
          <div className="bg-stone-50 rounded-lg p-3 text-xs" style={{ background:'#FAF7F1' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold">Chantier</span>
              <span className="font-semibold">{CHANTIERS.find(c => c.id === chantierId)?.name}</span>
            </div>
            {taskId && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-wider text-stone-500 font-bold">Tâche</span>
                <span className="font-semibold">{taskId}</span>
              </div>
            )}
          </div>

          <CnFormField label="Article">
            <select className="bati-input" value={itemId} onChange={e => setItemId(e.target.value)}>
              {items.map(x => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
            </select>
          </CnFormField>

          <div className="grid grid-cols-2 gap-3">
            <CnFormField label={`Quantité`} hint={item?.unit}>
              <input type="number" step="0.1" className="bati-input text-lg font-bold text-right" value={qty} onChange={e => setQty(e.target.value)}/>
            </CnFormField>
            <CnFormField label="Date">
              <input type="date" className="bati-input" value={date} onChange={e => setDate(e.target.value)}/>
            </CnFormField>
          </div>

          {/* Stock warning */}
          {item && (
            <div className="text-xs flex items-baseline justify-between p-2 rounded-lg" style={{ background: willBeNegative ? '#FBE3DC' : '#F0EAE0' }}>
              <span className="text-stone-600">Stock disponible sur ce chantier</span>
              <span className="tabular-nums font-bold" style={{ color: willBeNegative ? '#8A2C1E' : '#1F2421' }}>
                {stockAtLocation.toFixed(stockAtLocation % 1 === 0 ? 0 : 1)} {item.unit}
                {willBeNegative && <span className="ml-2">⚠ deviendra négatif</span>}
              </span>
            </div>
          )}

          <CnFormField label="Pointé par">
            <select className="bati-input" value={recordedBy} onChange={e => setRecordedBy(e.target.value)}>
              {OUVRIERS.filter(w => ['Chef de chantier','Chef d\'équipe','Conducteur de travaux'].includes(w.role)).map(w => (
                <option key={w.id} value={w.nom}>{w.nom} ({w.role})</option>
              ))}
            </select>
          </CnFormField>

          <CnFormField label="Notes (optionnel)">
            <input className="bati-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex. Gaspillage dû à la pluie"/>
          </CnFormField>

          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isLoss} onChange={e => setIsLoss(e.target.checked)} className="accent-stone-700"/>
            Marquer comme <b>perte / dommage</b> (séparé des consommations utiles)
          </label>

          <div className="flex items-center justify-between pt-2 border-t" style={{ borderColor:'#F0EAE0' }}>
            {entry && onDelete ? (
              <button onClick={onDelete} className="text-xs font-semibold text-red-600 hover:text-red-700 inline-flex items-center gap-1">
                <Icons.Trash size={12}/> Supprimer
              </button>
            ) : <span/>}
            <div className="flex gap-2">
              <Btn onClick={onClose}>Annuler</Btn>
              <Btn variant="primary" onClick={save} disabled={!itemId || qty <= 0}>{entry ? 'Enregistrer' : 'Confirmer la sortie'}</Btn>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── TransferForm ─────────────────────────────────────────────
function TransferForm({ items, purchases, consumption, transfers, onSave, onClose }) {
  const [date, setDate] = useFmState(new Date().toISOString().slice(0,10));
  const [itemId, setItemId] = useFmState(items[0]?.id);
  const [from, setFrom] = useFmState('depot');
  const [to, setTo] = useFmState((CHANTIERS[0]?.id || ''));
  const [qty, setQty] = useFmState(1);
  const [notes, setNotes] = useFmState('');

  const available = computeStock(itemId, from, purchases, consumption, transfers);
  const willOverdraft = qty > available;

  function save() {
    onSave({ date, itemId, from, to, qty: parseFloat(qty) || 0, notes: notes.trim() });
  }

  const item = items.find(x => x.id === itemId);

  return (
    <Modal title="Nouveau transfert de stock" onClose={onClose} width="max-w-lg">
      <div className="space-y-4">
        <CnFormField label="Article">
          <select className="bati-input" value={itemId} onChange={e => setItemId(e.target.value)}>
            {items.map(x => <option key={x.id} value={x.id}>{x.name} ({x.unit})</option>)}
          </select>
        </CnFormField>
        <div className="grid grid-cols-2 gap-3">
          <CnFormField label="Depuis">
            <select className="bati-input" value={from} onChange={e => setFrom(e.target.value)}>
              <option value="depot">Dépôt central</option>
              {CHANTIERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </CnFormField>
          <CnFormField label="Vers">
            <select className="bati-input" value={to} onChange={e => setTo(e.target.value)}>
              <option value="depot">Dépôt central</option>
              {CHANTIERS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </CnFormField>
          <CnFormField label="Quantité" hint={item?.unit}>
            <input type="number" step="0.1" className="bati-input text-right" value={qty} onChange={e => setQty(e.target.value)}/>
          </CnFormField>
          <CnFormField label="Date">
            <input type="date" className="bati-input" value={date} onChange={e => setDate(e.target.value)}/>
          </CnFormField>
        </div>
        {item && (
          <div className="text-xs flex items-baseline justify-between p-2 rounded-lg" style={{ background: willOverdraft ? '#FBE3DC' : '#F0EAE0' }}>
            <span className="text-stone-600">Stock dispo à l'origine</span>
            <span className="tabular-nums font-bold" style={{ color: willOverdraft ? '#8A2C1E' : '#1F2421' }}>{available} {item.unit}</span>
          </div>
        )}
        <CnFormField label="Notes (optionnel)">
          <input className="bati-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="ex. Réappro chantier"/>
        </CnFormField>
        <div className="flex justify-end gap-2 pt-2 border-t" style={{ borderColor:'#F0EAE0' }}>
          <Btn onClick={onClose}>Annuler</Btn>
          <Btn variant="primary" onClick={save} disabled={from === to || qty <= 0}>Confirmer le transfert</Btn>
        </div>
      </div>
    </Modal>
  );
}

window.SupplierForm = SupplierForm;
window.ItemForm = ItemForm;
window.PurchaseForm = PurchaseForm;
window.ConsumptionForm = ConsumptionForm;
window.TransferForm = TransferForm;
