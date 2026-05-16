// ============================================================================
//  Batitrack — Topbar chantier switcher
//
//  Linear/Notion-style workspace switcher. Single button in the topbar shows
//  the active chantier; click opens a searchable dropdown. Selecting a row
//  scopes the entire app to that chantier (the per-page chantier filters in
//  Pointage are removed).
//
//  Mounting: rendered by TopBar (src/layout.jsx). All wiring is via props —
//  this component owns only its own open/search/modal state.
// ============================================================================

function ChantierSwitcher({ currentChantierId, onSwitch, onCreateNew, onManage }) {
  const { useState, useEffect, useRef, useMemo } = React;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const wrapRef = useRef(null);
  const searchRef = useRef(null);

  const chantiers = (typeof CHANTIERS !== 'undefined' && Array.isArray(CHANTIERS)) ? CHANTIERS : [];
  const current = chantiers.find(c => c.id === currentChantierId) || chantiers[0] || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return chantiers;
    return chantiers.filter(c =>
      (c.name || '').toLowerCase().includes(q) ||
      (c.client || '').toLowerCase().includes(q)
    );
  }, [query, chantiers]);

  // Close on outside click / Escape, focus search on open.
  useEffect(() => {
    if (!open) return;
    function onDoc(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    setTimeout(() => searchRef.current && searchRef.current.focus(), 0);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(id) {
    setOpen(false);
    setQuery('');
    if (id !== currentChantierId) onSwitch(id);
  }

  if (!current) return null; // nothing to switch to (gate prevents this in practice)

  return (
    <div ref={wrapRef} className="relative" data-testid="chantier-switcher">
      <button onClick={() => setOpen(o => !o)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border bg-white/80 hover:bg-white transition text-sm font-semibold max-w-[280px]"
              style={{ borderColor: '#E8E2D8', color: '#1F2421' }}
              data-testid="chantier-switcher-button"
              aria-haspopup="listbox" aria-expanded={open}>
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: current.color || '#0E5460' }}/>
        <span className="truncate">{current.name}</span>
        <Icons.ChevronDown size={14} className="text-stone-400 flex-shrink-0"/>
      </button>

      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 bg-white border rounded-xl shadow-xl z-50 w-80 max-h-[420px] flex flex-col"
             style={{ borderColor: '#E8E2D8' }}
             role="listbox" data-testid="chantier-switcher-dropdown">

          <div className="p-2 border-b" style={{ borderColor: '#F0EAE0' }}>
            <input ref={searchRef} type="text" value={query}
                   onChange={e => setQuery(e.target.value)}
                   placeholder="Rechercher un chantier…"
                   className="w-full px-3 py-1.5 text-sm rounded-md border bg-stone-50 focus:bg-white focus:outline-none"
                   style={{ borderColor: '#E8E2D8' }}
                   data-testid="chantier-switcher-search"/>
          </div>

          <div className="overflow-y-auto flex-1">
            {filtered.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-stone-500">
                Aucun chantier ne correspond à « {query} ».
              </div>
            )}
            {filtered.map(c => {
              const isActive = c.id === currentChantierId;
              return (
                <button key={c.id} onClick={() => pick(c.id)}
                        className={`w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-stone-50 border-b last:border-b-0 ${isActive ? 'bg-stone-50' : ''}`}
                        style={{ borderColor: '#F0EAE0' }}
                        data-testid={`chantier-switcher-row-${c.id}`}
                        role="option" aria-selected={isActive}>
                  <span className="w-2.5 flex-shrink-0 rounded-full self-stretch"
                        style={{ background: c.color || '#0E5460', minHeight: 28 }}/>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{c.name}</div>
                    <div className="text-[11px] text-stone-500 truncate">{c.client || '—'}</div>
                  </div>
                  {isActive && <span className="text-[10px] font-bold uppercase tracking-wider text-teal-700">Actuel</span>}
                </button>
              );
            })}
          </div>

          <div className="border-t" style={{ borderColor: '#F0EAE0' }}>
            <button onClick={() => { setOpen(false); setShowCreate(true); }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-stone-50 flex items-center gap-2 font-medium"
                    data-testid="chantier-switcher-new">
              <Icons.Plus size={14} className="text-stone-500"/>
              Nouveau chantier
            </button>
            <button onClick={() => { setOpen(false); if (onManage) onManage(); }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-stone-50 flex items-center gap-2 text-stone-600 border-t"
                    style={{ borderColor: '#F0EAE0' }}
                    data-testid="chantier-switcher-manage">
              <Icons.Param size={14} className="text-stone-500"/>
              Gérer mes chantiers
            </button>
          </div>
        </div>
      )}

      {showCreate && typeof ChantierFormModal !== 'undefined' && (
        <ChantierFormModal onClose={() => {
          setShowCreate(false);
          if (onCreateNew) onCreateNew();
        }}/>
      )}
    </div>
  );
}

window.ChantierSwitcher = ChantierSwitcher;
