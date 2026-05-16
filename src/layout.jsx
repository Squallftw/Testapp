// Layout: sidebar, topbar, common bits
const { useState, useEffect, useRef, useMemo, useCallback, createContext, useContext } = React;

// ─── Worker avatar ────────────────────────────────────────────
function Avatar({ worker, size = 32 }) {
  const initials = worker.nom.split(' ').map(s=>s[0]).slice(0,2).join('');
  const bg = `oklch(0.78 0.07 ${worker.hue})`;
  const fg = `oklch(0.32 0.07 ${worker.hue})`;
  return (
    <div className="flex items-center justify-center rounded-full font-semibold flex-shrink-0"
         style={{ width: size, height: size, background: bg, color: fg, fontSize: size * 0.38 }}>
      {initials}
    </div>
  );
}

// ─── Status pill ──────────────────────────────────────────────
function StatusPill({ state }) {
  const styles = {
    'En cours':  { bg: '#E3F1E5', fg: '#1F6B3A', dot: '#2E9152' },
    'Clôturée':  { bg: '#FBEBD3', fg: '#8A5114', dot: '#C58122' },
    'Payée':     { bg: '#DDE8F4', fg: '#1F4E87', dot: '#3168B4' }
  };
  const s = styles[state] || styles['En cours'];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: s.bg, color: s.fg }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }}/>
      {state}
    </span>
  );
}

// ─── Top bar ──────────────────────────────────────────────────
function TopBar({ lang, setLang, onMenu, currentChantierId, onSwitchChantier, onManageChantiers }) {
  const today = `${TODAY.day} ${MOIS_FR[TODAY.monthIdx]} ${TODAY.year}`;
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef(null);
  const user = window.__BATI_USER || { email: 'Invité' };
  const email = (user.email || '').trim();
  const initials = email
    ? email.split('@')[0].slice(0,2).toUpperCase()
    : 'BT';
  const companyName = (window.COMPANY && window.COMPANY.name) || 'Batitrack';
  const [saveState, setSaveState] = React.useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
  const saveTimer = React.useRef(null);

  React.useEffect(() => {
    function onPending() {
      setSaveState('saving');
      clearTimeout(saveTimer.current);
    }
    function onSaved() {
      setSaveState('saved');
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaveState('idle'), 1800);
    }
    function onErr() { setSaveState('error'); }
    window.addEventListener('bati:saving', onPending);
    window.addEventListener('bati:saved', onSaved);
    window.addEventListener('bati:save-error', onErr);
    return () => {
      window.removeEventListener('bati:saving', onPending);
      window.removeEventListener('bati:saved', onSaved);
      window.removeEventListener('bati:save-error', onErr);
    };
  }, []);

  React.useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e) { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  async function handleLogout() {
    if (!confirm('Se déconnecter de Batitrack ?')) return;
    if (window.bati) await window.bati.signOut();
  }

  return (
    <header className="bati-topbar h-14 border-b flex items-center px-4 md:px-6 gap-4 sticky top-0 z-30">
      <button className="md:hidden p-1.5 -ml-1 rounded hover:bg-stone-100" onClick={onMenu}>
        <Icons.Menu size={20}/>
      </button>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white"
             style={{ background: 'linear-gradient(135deg, #0E5460, #1A6B78)' }}>
          <Icons.Logo size={18}/>
        </div>
        <div className="font-bold text-[15px] tracking-tight" style={{ color: '#0E5460' }}>
          Batitrack
        </div>
        <span className="text-[10px] uppercase tracking-wider font-medium px-1.5 py-0.5 rounded"
              style={{ background: '#F3EBDF', color: '#7C5E2A' }}>Pro</span>
      </div>

      <div className="hidden md:block ml-2 text-sm text-stone-500">
        {companyName ? <span>{companyName} · </span> : null}
        <span className="text-stone-700">{today}</span>
      </div>

      <div className="flex-1 flex justify-center min-w-0 px-2">
        {typeof ChantierSwitcher !== 'undefined' && onSwitchChantier && (
          <ChantierSwitcher currentChantierId={currentChantierId}
                            onSwitch={onSwitchChantier}
                            onManage={onManageChantiers}/>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden md:inline text-[11px] text-stone-400" title="État de sauvegarde">
          {saveState === 'saving' && '● Sauvegarde…'}
          {saveState === 'saved'  && '✓ Sauvegardé'}
          {saveState === 'error'  && <span style={{color:'#C25B3F'}}>⚠ Hors-ligne</span>}
        </span>
        <div className="hidden md:flex items-center gap-1 bg-stone-100 rounded-lg p-0.5">
          <button onClick={() => setLang('FR')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${lang==='FR'?'bg-white shadow-sm text-stone-900':'text-stone-500'}`}>FR</button>
          <button onClick={() => setLang('AR')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition ${lang==='AR'?'bg-white shadow-sm text-stone-900':'text-stone-500'}`}>AR</button>
        </div>
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen(o => !o)}
                  className="flex items-center gap-2 text-sm bg-stone-100 hover:bg-stone-200 rounded-lg px-2.5 py-1.5 md:px-3">
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                 style={{ background:'#C25B3F' }}>{initials}</div>
            <span className="hidden md:inline font-medium max-w-[160px] truncate">{email || 'Compte'}</span>
            <Icons.ChevronDown size={14}/>
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-64 bg-white border rounded-lg shadow-xl py-1.5 z-40"
                 style={{ borderColor: '#E8E2D8' }}>
              <div className="px-3 py-2 border-b" style={{ borderColor: '#F0EAE0' }}>
                <div className="text-[10px] uppercase tracking-wider text-stone-500 font-bold">Connecté en tant que</div>
                <div className="text-sm font-semibold truncate">{email || '—'}</div>
              </div>
              <button onClick={handleLogout}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-stone-50 flex items-center gap-2"
                      style={{ color: '#7A2814' }}>
                <span>↩</span> Se déconnecter
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────
const NAV_ITEMS = [
  { kind: 'header', label: 'Rapport' },
  { id: 'dashboard', label: 'Tableau de bord', icon: 'Dashboard' },
  { kind: 'header', label: 'Gestion de projet' },
  { id: 'planning',  label: 'Planning',         icon: 'Calendar' },
  // 'Chantiers' nav entry removed — the topbar switcher is the new entry point.
  // The /chantiers route still exists (gate.PROTECTED_ROUTES); the switcher's
  // "Gérer mes chantiers" link reaches the management page directly.
  { kind: 'header', label: 'Ressources' },
  { id: 'pointage',     label: 'Pointage',     icon: 'Pointage' },
  { id: 'affectations', label: 'Affectations', icon: 'Ouvrier' },
  { id: 'ouvriers',     label: 'Ouvriers',     icon: 'User' },
  { id: 'materiels',    label: 'Matériels',    icon: 'Building' },
  { id: 'consommables', label: 'Consommables', icon: 'Coins' }
];
const NAV_FOOTER = [
  { id: 'parametres',label: 'Paramètres',      icon: 'Param' }
];

function Sidebar({ current, onNav, mobileOpen, onMobileClose, badges = {} }) {
  return (
    <>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 bg-black/40 z-40" onClick={onMobileClose}/>
      )}
      <aside className={`bati-sidebar fixed md:sticky top-14 md:top-14 left-0 bottom-0 md:bottom-auto md:self-start w-60 border-r flex-shrink-0 z-50 transition-transform ${mobileOpen?'translate-x-0':'-translate-x-full md:translate-x-0'}`}
             style={{ height: 'calc(100vh - 3.5rem)' }}>
        <nav className="p-3 space-y-0.5">
          {NAV_ITEMS.map((item, i) => {
            if (item.kind === 'header') {
              return (
                <div key={`h-${i}`} className={`px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-stone-400 select-none ${i === 0 ? '!pt-1' : ''}`}>
                  {item.label}
                </div>
              );
            }
            const IconC = Icons[item.icon];
            const active = current === item.id;
            return (
              <button key={item.id}
                      onClick={() => { onNav(item.id); onMobileClose(); }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${active?'bati-nav-active':'text-stone-600 hover:bg-stone-100'}`}>
                <IconC size={17}/>
                <span className="font-medium">{item.label}</span>
                {badges[item.id] > 0 && !active && (
                  <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded"
                        style={{background:'#FBEBD3', color:'#8A5114'}} title={`${badges[item.id]} ouvrier${badges[item.id]>1?'s':''} sans pointage aujourd'hui`}>
                    {badges[item.id]}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 space-y-3 border-t" style={{ borderColor:'#EDE6D8' }}>
          <nav className="space-y-0.5">
            {NAV_FOOTER.map(item => {
              const IconC = Icons[item.icon];
              const active = current === item.id;
              return (
                <button key={item.id}
                        onClick={() => { onNav(item.id); onMobileClose(); }}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition ${active?'bati-nav-active':'text-stone-600 hover:bg-stone-100'}`}>
                  <IconC size={17}/>
                  <span className="font-medium">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <div className="bg-white rounded-lg p-3 border" style={{ borderColor:'#EDE6D8' }}>
            <div className="text-xs text-stone-500 mb-1">Quinzaine en cours</div>
            <div className="font-semibold text-sm">Q1 Janvier 2026</div>
            <div className="mt-2 h-1.5 rounded-full bg-stone-100 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: '80%', background:'#0E5460'}}/>
            </div>
            <div className="text-[11px] text-stone-500 mt-1.5">3 jours restants</div>
          </div>
        </div>
      </aside>
    </>
  );
}

// ─── Page header ──────────────────────────────────────────────
function PageHeader({ title, subtitle, right }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5 flex-wrap">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">{title}</h1>
        {subtitle && <p className="text-stone-500 mt-1 text-sm">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
  );
}

// ─── Buttons ──────────────────────────────────────────────────
function Btn({ children, variant='default', size='md', icon, onClick, disabled, className='', ...rest }) {
  const base = 'inline-flex items-center gap-2 font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm:'px-2.5 py-1.5 text-xs', md:'px-3.5 py-2 text-sm', lg:'px-4 py-2.5 text-sm' };
  const variants = {
    default: 'bg-white border border-stone-200 hover:bg-stone-50 text-stone-700',
    primary: 'text-white shadow-sm hover:opacity-95',
    accent:  'text-white shadow-sm hover:opacity-95',
    ghost:   'text-stone-600 hover:bg-stone-100',
    danger:  'bg-red-50 text-red-700 border border-red-100 hover:bg-red-100'
  };
  const style = variant === 'primary' ? { background:'#0E5460' }
              : variant === 'accent'  ? { background:'#C25B3F' } : undefined;
  return (
    <button onClick={onClick} disabled={disabled}
            className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} style={style} {...rest}>
      {icon}
      {children}
    </button>
  );
}

// ─── Card ─────────────────────────────────────────────────────
function Card({ children, className='', ...rest }) {
  return <div className={`bati-card rounded-xl ${className}`} {...rest}>{children}</div>;
}

// ─── Empty state ──────────────────────────────────────────────
function EmptyState({ icon, title, hint, action }) {
  return (
    <div className="text-center py-12">
      <div className="inline-flex w-14 h-14 rounded-full bg-stone-100 items-center justify-center text-stone-400 mb-3">
        {icon}
      </div>
      <div className="font-semibold text-stone-700">{title}</div>
      {hint && <div className="text-sm text-stone-500 mt-1">{hint}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

Object.assign(window, { Avatar, StatusPill, TopBar, Sidebar, PageHeader, Btn, Card, EmptyState, NAV_ITEMS, NAV_FOOTER });
