// App entry point — wires everything together
const { useState: useAppState, useEffect: useAppEff, useMemo: useAppMemo, useCallback: useAppCb, useRef: useAppRef } = React;

// ---- Persistence plumbing -------------------------------------------------
// Each module pushes its slice updates here; we accumulate and ask the saver
// to write the merged blob back to Supabase (debounced).
const __batiUD = window.__BATI_USER_DATA || {};
const __batiPendingState = { ...__batiUD };
window.__BATI_PERSIST_PATCH = function patch(slice) {
  Object.assign(__batiPendingState, slice);
  if (window.__BATI_SAVER) window.__BATI_SAVER.schedule(__batiPendingState);
};

function App() {
  // ── Onboarding gate ────────────────────────────────────────────────────
  // window.bati.onboarding is provided by src/onboarding/{gate,chantier-store,
  // validate-chantier}.js — loaded before this file in bootstrap.jsx.
  const __gate = window.bati && window.bati.onboarding;
  function __currentSession() {
    return window.__BATI_USER ? { user: { id: window.__BATI_USER.id } } : null;
  }
  function __decide(hash) {
    if (!__gate) return { allow: true, page: 'dashboard' };
    return __gate.decideRoute({
      session: __currentSession(),
      userState: window.__BATI_USER_DATA,
      requestedHash: hash != null ? hash : (typeof window !== 'undefined' ? window.location.hash : ''),
    });
  }
  function __applyRedirect(decision) {
    if (decision && decision.redirectTo && typeof window !== 'undefined') {
      const target = decision.redirectTo.replace(/^#/, '');
      if (window.location.hash !== '#' + target) window.location.hash = target;
    }
  }
  const [decision, setDecision] = useAppState(() => __decide());

  useAppEff(() => {
    __applyRedirect(decision);
    function onHash() { setDecision(__decide()); }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useAppEff(() => { __applyRedirect(decision); }, [decision]);

  function __onChantierCreated(chantier) {
    try { if (typeof CHANTIERS !== 'undefined' && Array.isArray(CHANTIERS)) CHANTIERS.push(chantier); } catch (_) {}
    const after = __gate.decideRoute({
      session: __currentSession(),
      userState: window.__BATI_USER_DATA,
      requestedHash: window.location.hash,
      justCreatedChantier: true,
    });
    __applyRedirect(after);
    setTimeout(() => setDecision(__decide()), 0);
  }

  const [page, setPage] = useAppState(() => (decision && decision.page) || 'dashboard');
  useAppEff(() => {
    if (decision && decision.allow && decision.page && decision.page !== page) {
      setPage(decision.page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [decision]);

  function __navigate(targetPage) {
    setPage(targetPage);
    window.location.hash = '/' + targetPage;
  }

  const [lang, setLang] = useAppState('FR');
  const [mobileMenu, setMobileMenu] = useAppState(false);

  // Pointage view state
  const [pointageView, setPointageView] = useAppState('quinzaine'); // 'quinzaine' | 'mois'
  const [currentQ, setCurrentQ] = useAppState(currentQuinzaine());
  const [currentMonth, setCurrentMonth] = useAppState({ year: TODAY.year, monthIdx: TODAY.monthIdx });

  // Chantier / Ouvrier detail
  const [openChantier, setOpenChantier] = useAppState(null);
  const [openOuvrier, setOpenOuvrier] = useAppState(null);

  // Mutable state
  // Assignments seed — shared by both pointage hydration and the assignments state
  const ASSIGNMENTS_SEED = {
    // Villa Anfa (ch-1)
    't1':  ['w-7', 'w-8', 'w-11'],
    't2':  ['w-1', 'w-7', 'w-8', 'w-11', 'w-12'],
    't3':  ['w-7', 'w-8', 'w-11'],
    't4':  ['w-1', 'w-3', 'w-4', 'w-7', 'w-8'],
    't5':  ['w-2', 'w-3', 'w-4', 'w-5', 'w-7'],
    't6':  ['w-1', 'w-2', 'w-6', 'w-3', 'w-4', 'w-5'],
    't7':  ['w-2', 'w-3', 'w-9'],
    't8':  ['w-2', 'w-4', 'w-8'],
    't9':  ['w-3', 'w-9'],
    't10': ['w-7', 'w-11'],
    't12': ['w-5', 'w-9'],
    't15': ['w-10', 'w-6'],
    // Hay Riad (ch-2)
    'h3':  ['w-2', 'w-5', 'w-9', 'w-11'],
    'h4':  ['w-2', 'w-9', 'w-11', 'w-12'],
    'h5':  ['w-10', 'w-11', 'w-12'],
    'h6':  ['w-10', 'w-3'],
    // Marrakech (ch-3)
    'm4':  ['w-6', 'w-7'],
    'm5':  ['w-6', 'w-12'],
    'm6':  ['w-9', 'w-3']
  };

  // Hydrate pointage from task assignments so clicking a task shows real green dots.
  // Sprinkles realistic absences so the Pointage grid stays believable.
  const [pointage, setPointage] = useAppState(() => {
    // Authenticated user with persisted pointage — use it as-is
    if (window.__BATI_USER_DATA && Object.prototype.hasOwnProperty.call(window.__BATI_USER_DATA, 'pointage')) {
      return JSON.parse(JSON.stringify(window.__BATI_USER_DATA.pointage || {}));
    }
    // First-time user with empty data — nothing to hydrate
    if (!window.__BATI_DEMO_MODE) return {};
    // Demo mode — hydrate from seeded assignments
    const next = JSON.parse(JSON.stringify(POINTAGE));
    const plansSeed = window.PLANS_SEED || {};
    const today = new Date(TODAY.year, TODAY.monthIdx, TODAY.day);

    const taskIndex = {};
    Object.entries(plansSeed).forEach(([cid, plan]) => {
      plan.forEach(g => g.children.forEach(t => { taskIndex[t.id] = { chantierId: cid, task: t }; }));
    });

    // Deterministic pseudo-random for (worker, date) so absences stay stable across renders
    function rand(workerId, year, monthIdx, day) {
      const seed = (workerId.charCodeAt(2) * 137 + year * 31 + monthIdx * 53 + day * 17) % 100;
      return seed;
    }

    Object.entries(ASSIGNMENTS_SEED).forEach(([taskId, workerIds]) => {
      const info = taskIndex[taskId];
      if (!info) return;
      const t = info.task;
      const start = new Date(t.start[0], t.start[1], t.start[2]);
      for (let i = 0; i < t.duration; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        if (d > today) break;
        const dow = d.getDay();
        const dk = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        workerIds.forEach(wid => {
          if (!next[wid]) next[wid] = {};
          const r = rand(wid, d.getFullYear(), d.getMonth(), d.getDate());
          let entry;
          if (dow === 0) {
            // Sunday: 80% absent, 20% no-show (left as missing). 5% still present (heroic exception).
            if (r < 80) entry = { statut: 'A' };
            else if (r < 95) entry = null; // leave non-pointed
            else entry = { statut: 'P', chantierId: info.chantierId };
          } else {
            // Weekday: 88% present on task, 10% absent, 2% no-show
            if (r < 88) entry = { statut: 'P', chantierId: info.chantierId };
            else if (r < 98) entry = { statut: 'A' };
            else entry = null;
          }
          // Preserve primes/notes when transitioning P → P
          const prev = next[wid][dk];
          if (entry == null) {
            if (prev) delete next[wid][dk];
          } else if (entry.statut === 'P') {
            next[wid][dk] = { ...(prev || {}), statut: 'P', chantierId: info.chantierId };
          } else {
            next[wid][dk] = { statut: 'A' };
          }
        });
      }
    });
    return next;
  });
  const [qStates, setQStates] = useAppState(QUINZAINE_STATES);
  const [audit, setAudit] = useAppState(AUDIT_LOG);
  const [editedKeys, setEditedKeys] = useAppState(() => new Set(__batiUD.editedKeys || []));
  const [adjustments, setAdjustments] = useAppState(ADJUSTMENTS);
  const [plans, setPlans] = useAppState(() => {
    if (window.__BATI_USER_DATA && Object.prototype.hasOwnProperty.call(window.__BATI_USER_DATA, 'plans')) {
      return JSON.parse(JSON.stringify(window.__BATI_USER_DATA.plans || {}));
    }
    if (!window.__BATI_DEMO_MODE) return {};
    const seed = window.PLANS_SEED || {};
    const out = {};
    Object.keys(seed).forEach(k => { out[k] = JSON.parse(JSON.stringify(seed[k])); });
    return out;
  });
  function setPlanForChantier(chantierId, updater) {
    setPlans(prev => ({ ...prev, [chantierId]: typeof updater === 'function' ? updater(prev[chantierId] || []) : updater }));
  }
  const [assignments, setAssignments] = useAppState(() => {
    if (window.__BATI_USER_DATA && Object.prototype.hasOwnProperty.call(window.__BATI_USER_DATA, 'assignments')) {
      return JSON.parse(JSON.stringify(window.__BATI_USER_DATA.assignments || {}));
    }
    return window.__BATI_DEMO_MODE ? { ...ASSIGNMENTS_SEED } : {};
  });

  // ---- Persist App-level slices to Supabase on change ---------------------
  useAppEff(() => {
    if (!window.__BATI_PERSIST_PATCH) return;
    window.__BATI_PERSIST_PATCH({
      pointage,
      qStates,
      audit,
      editedKeys: Array.from(editedKeys),
      adjustments,
      plans,
      assignments,
    });
  }, [pointage, qStates, audit, editedKeys, adjustments, plans, assignments]);

  function assignWorker(taskId, workerId) {
    setAssignments(prev => {
      const cur = prev[taskId] || [];
      if (cur.includes(workerId)) return prev;
      return { ...prev, [taskId]: [...cur, workerId] };
    });
  }
  function unassignWorker(taskId, workerId) {
    setAssignments(prev => {
      const cur = prev[taskId] || [];
      const next = cur.filter(w => w !== workerId);
      return { ...prev, [taskId]: next };
    });
  }

  const updateCell = useAppCb((workerId, dk, value, opts = {}) => {
    setPointage(prev => {
      const next = { ...prev, [workerId]: { ...(prev[workerId] || {}) } };
      if (value == null) {
        delete next[workerId][dk];
      } else {
        next[workerId][dk] = value;
      }
      return next;
    });

    // Audit if quinzaine is Clôturée/Payée
    const { year, monthIdx, day } = parseDateKey(dk);
    const half = day <= 15 ? 1 : 2;
    const qkey = quinzaineKey(year, monthIdx, half);
    const state = qStates[qkey]?.state || 'En cours';

    if (state !== 'En cours' && !opts.silent) {
      const prevCell = pointage[workerId]?.[dk];
      const fmt = (c) => !c ? '—' : c.statut === 'A' ? 'Absent' : `Présent (${CHANTIERS.find(x=>x.id===c.chantierId)?.name || ''})`;
      setEditedKeys(prev => new Set([...prev, `${workerId}|${dk}`]));
      setAudit(prev => [{
        id: 'au-' + Date.now(),
        ts: Date.now(),
        qkey,
        user: 'Patron',
        workerId,
        field: frenchDateShort(year, monthIdx, day),
        oldVal: fmt(prevCell),
        newVal: fmt(value)
      }, ...prev]);
    }
  }, [pointage, qStates]);

  const setQStateFn = useAppCb((qkey, value) => {
    setQStates(prev => ({ ...prev, [qkey]: value }));
  }, []);

  const openPayModalFn = useAppCb((qkey) => {
    setPage('paie');
    setTimeout(() => setPage('paie'), 0);
  }, []);

  const openAdjFn = useAppCb((qkey, workerId, kind) => {
    setPage('paie');
  }, []);

  const ctx = {
    pointage, qStates, audit, editedKeys, adjustments,
    plans, setPlanForChantier, assignments, assignWorker, unassignWorker,
    updateCell, setQState: setQStateFn, openPayModal: openPayModalFn,
    openAdj: openAdjFn,
    openWorker: (id) => { setOpenOuvrier(id); setPage('ouvriers'); }
  };

  const isRTL = lang === 'AR';

  // ── Render branch: gate takes precedence ─────────────────────────────────
  if (decision && decision.redirectTo) return null;
  if (decision && decision.allow && decision.page === 'onboarding') {
    const nextPath = __gate.parseHash(window.location.hash).query.next || null;
    return <OnboardingScreen nextPath={nextPath} onCreated={__onChantierCreated}/>;
  }

  return (
    <div className={`min-h-screen ${isRTL ? 'rtl' : 'ltr'}`} dir={isRTL ? 'rtl' : 'ltr'} style={{ background:'#FAF7F1' }}>
      <TopBar lang={lang} setLang={setLang} onMenu={() => setMobileMenu(true)}/>
      <div className="flex">
        <Sidebar current={page} onNav={(p) => { __navigate(p); setOpenChantier(null); setOpenOuvrier(null); }}
                 mobileOpen={mobileMenu} onMobileClose={() => setMobileMenu(false)}
                 badges={{ pointage: (() => {
                   const dk = dateKey(TODAY.year, TODAY.monthIdx, TODAY.day);
                   return OUVRIERS.filter(w => !pointage[w.id]?.[dk]).length;
                 })() }}/>
        <main className="flex-1 min-w-0 p-4 md:p-6 lg:p-8 max-w-full overflow-x-hidden">
          <div className="max-w-[1440px] mx-auto">
            {page === 'dashboard' && <BudgetDashboard ctx={ctx}/>}
            {page === 'pointage' && (
              <div>
                <PageHeader title="Pointage" subtitle="Suivez les présences et le coût main d'œuvre au quotidien."/>
                {pointageView === 'quinzaine' && (
                  <PointageQuinzaine ctx={ctx} currentQ={currentQ}
                                     onSwitchQ={(q) => setCurrentQ(q)}
                                     onSwitchMois={() => { setCurrentMonth({ year: currentQ.year, monthIdx: currentQ.monthIdx }); setPointageView('mois'); }}/>
                )}
                {pointageView === 'mois' && (
                  <PointageMois ctx={ctx} currentMonth={currentMonth}
                                onSwitchMonth={(m) => setCurrentMonth(m)}
                                onSwitchQuinzaine={(q) => { if (q) setCurrentQ(q); else setCurrentQ({ year: currentMonth.year, monthIdx: currentMonth.monthIdx, half: 1 }); setPointageView('quinzaine'); }}/>
                )}
              </div>
            )}
            {page === 'chantiers' && <Chantiers ctx={ctx} openId={openChantier} setOpenId={setOpenChantier}/>}
            {page === 'ouvriers' && <Ouvriers ctx={ctx} openId={openOuvrier} setOpenId={setOpenOuvrier}/>}
            {page === 'affectations' && <Affectations ctx={ctx}/>}
            {page === 'materiels' && <Materiels ctx={ctx}/>}
            {page === 'consommables' && <Consommables ctx={ctx}/>}
            {page === 'planning' && <Planning ctx={ctx}/>}
            {page === 'parametres' && <Parametres ctx={ctx}/>}
          </div>
        </main>
      </div>
    </div>
  );
}

// Unmount the splash root if bootstrap.jsx mounted one on #root, then render
// the real App. We can't share React roots, so we unmount + remount cleanly.
(function mountApp() {
  const el = document.getElementById('root');
  if (window.__BATI_SPLASH_ROOT) {
    try { window.__BATI_SPLASH_ROOT.unmount(); } catch (_) {}
    window.__BATI_SPLASH_ROOT = null;
  }
  ReactDOM.createRoot(el).render(<App />);
})();
