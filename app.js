// BatiTrack — main app. Single-page; vanilla JS; localStorage persistence.
(function () {
  'use strict';
  const G = window.GanttLogic;
  const W = window.WorkforceLogic;
  const Mat = window.MaterialsLogic;
  const Eq = window.EquipmentLogic;
  const Bud = window.BudgetLogic;

  // ── Persistence ────────────────────────────────────────────────
  // Bump when the seed shape changes; mismatched stored versions are re-seeded.
  const STATE_VERSION = 4;

  // Storage is delegated to window.AppStorage (supabase-client.js).
  // In 'local' mode it wraps localStorage; in 'supabase' mode it syncs
  // to the `app_state` table (see supabase/schema.sql).
  async function loadState() {
    try {
      const remote = await window.AppStorage.load();
      if (remote && remote.__v === STATE_VERSION) return remote;
    } catch (e) { console.warn('load failed', e); }
    const fresh = seedState();
    fresh.__v = STATE_VERSION;
    return fresh;
  }
  function saveState() {
    state.__v = STATE_VERSION;
    try { window.AppStorage.save(state); }
    catch (e) { console.warn('save failed', e); }
  }
  function uid() { return crypto.randomUUID(); }

  // ── Seed data — matches the production app's task list ──────────
  function seedState() {
    // Production tasks total ~300 days; put "today" roughly 1/4 of the way in
    // so the today line lands in a meaningful place.
    const start = new Date();
    start.setDate(start.getDate() - 70);
    start.setHours(0, 0, 0, 0);

    // Workers (verbatim from production seed)
    const w1 = uid(), w2 = uid(), w3 = uid(), w4 = uid(), w5 = uid();
    const workers = [
      { id: w1, name: 'Ahmed Benali',    role: 'MAÇON',     skill: 'SENIOR', rate: 550, avail: 'disponible' },
      { id: w2, name: 'Khalid Ouali',    role: 'MAÇON',     skill: 'JUNIOR', rate: 450, avail: 'disponible' },
      { id: w3, name: 'Youssef Idrissi', role: 'CHEF',      skill: 'CHEF',   rate: 750, avail: 'disponible' },
      { id: w4, name: 'Omar Benjelloun', role: 'MANOEUVRE', skill: 'JUNIOR', rate: 350, avail: 'disponible' },
      { id: w5, name: 'Hassan Alami',    role: 'CARRELEUR', skill: 'SENIOR', rate: 600, avail: 'indisponible' }
    ];

    // Mirror of production's `groups` array (index.html ~lines 363-402)
    const groups = [
      { name: 'GROS OEUVRES', subs: [
        { name: 'DECAPAGE-NETTOYAGE', dur: 3,  status: 'done' },
        { name: 'TERRASSEMENTS',      dur: 10, status: 'done' },
        { name: 'REMBLAIS',           dur: 7,  status: 'done' },
        { name: 'FONDATIONS',         dur: 15, status: 'done',        wf: { unit:'m³', qty:120, prod_rate:8,  loc:'Zone A',   workers:[w1,w4] }, matKey:'t1' },
        { name: 'DALLAGES',           dur: 15, status: 'in_progress', wf: { unit:'m²', qty:450, prod_rate:30, loc:'Zone B',   workers:[w1,w2] }, matKey:'t2' },
        { name: 'POTEAUX VOILES ELEV',dur: 20, status: 'in_progress' },
        { name: 'PLANCHERS',          dur: 20, status: 'todo' },
        { name: 'MAÇONNERIES',        dur: 15, status: 'todo',        wf: { unit:'m²', qty:280, prod_rate:15, loc:'Zone A/B', workers:[w1,w2,w3] }, matKey:'t3' },
        { name: 'ENDUITS',            dur: 15, status: 'todo',        wf: { unit:'m²', qty:600, prod_rate:40, loc:'Tout',     workers:[w2,w4] },    matKey:'t5' },
        { name: 'POSES DIVERSES',     dur: 15, status: 'todo' },
        { name: 'FINITIONS',          dur: 8,  status: 'todo' }
      ]},
      { name: 'ETANCHEITE', subs: [
        { name: 'CHAPE ET FORME', dur: 10, status: 'todo' },
        { name: 'COMPLEXE',       dur: 10, status: 'todo' },
        { name: 'PROTECTION',     dur: 6,  status: 'todo' }
      ]},
      { name: 'REVETEMENTS', subs: [
        { name: 'REVETEMENTS DE SOL',   dur: 15, status: 'todo', wf: { unit:'m²', qty:350, prod_rate:25, loc:'Intérieur', workers:[w5] }, matKey:'t4' },
        { name: 'REVETEMENT MURAL',     dur: 10, status: 'todo' },
        { name: 'REVETEMENT EXTERIEUR', dur: 7,  status: 'todo' },
        { name: 'REVETEMENT DIVERS',    dur: 5,  status: 'todo' }
      ]},
      { name: 'PRECADRES MENUISERIES', subs: [
        { name: 'BOIS',       dur: 14, status: 'todo' },
        { name: 'ALLUMINIUM', dur: 14, status: 'todo' },
        { name: 'METALLIQUE', dur: 14, status: 'todo' }
      ]},
      { name: 'PEINTURE', subs: [
        { name: 'TRVX PREPARATOIRES', dur: 8,  status: 'todo' },
        { name: '1 ERE COUCHE',       dur: 10, status: 'todo' },
        { name: '2 EME COUCHE',       dur: 12, status: 'todo' },
        { name: 'FAUX PLAFONDS',      dur: 12, status: 'todo' }
      ]},
      { name: 'AMENAGEMENTS EXTERIEURS', subs: [
        { name: 'ASSAINISSEMENT EXTERIEUR', dur: 15, status: 'todo' }
      ]}
    ];

    const tasks = [];
    const matKeys = {}; // production "tid" lookup → resolved task ids
    let groupOrder = 0;
    for (const g of groups) {
      groupOrder += 1;
      const parentId = uid();
      tasks.push({
        id: parentId, parent_id: null, name: g.name,
        duration: 1, sort_order: groupOrder, collapsed: false,
        status: 'todo', assignedWorkers: []
      });
      let subOrder = 0;
      for (const s of g.subs) {
        subOrder += 1;
        const subId = uid();
        tasks.push({
          id: subId, parent_id: parentId, name: s.name,
          duration: s.dur, sort_order: subOrder, collapsed: false,
          status: s.status,
          assignedWorkers: s.wf?.workers || [],
          unit: s.wf?.unit, qty: s.wf?.qty, prod_rate: s.wf?.prod_rate, loc: s.wf?.loc
        });
        if (s.matKey) matKeys[s.matKey] = subId;
      }
    }

    // Generate a few weeks of pointage history
    const pointages = [];
    const today = new Date();
    today.setHours(0,0,0,0);
    for (let d = 20; d >= 1; d--) {
      const day = new Date(today);
      day.setDate(day.getDate() - d);
      if (day.getDay() === 0) continue; // skip sundays
      const dISO = day.toISOString().slice(0, 10);
      for (const w of workers) {
        // 90% present on weekdays
        const present = Math.random() > 0.1;
        pointages.push({
          id: uid(),
          worker_id: w.id,
          date: dISO,
          present,
          task_ids: present ? sampleTasks(tasks, w) : [],
          bonus: 0,
          note: '',
          rate_snapshot: null
        });
      }
    }

    return {
      project: {
        id: uid(),
        name: 'PLANNING ST MALABATA',
        start_date: start.toISOString().slice(0, 10),
        devis_client: 4500000,
        budget_interne: 3200000,
        budget_locked: false
      },
      ganttTasks: tasks,
      workers,
      pointages,
      materials: [
        { id: uid(), project_id: null, task_id: matKeys.t1, date: G.dateToISO(G.addDays(start, 5)),  name: 'Béton B25',       category: 'beton',     qty: 120,  unit: 'm³',    unit_price: 850, cost: 120 * 850,   supplier: 'Cimenterie Atlas', note: '' },
        { id: uid(), project_id: null, task_id: matKeys.t1, date: G.dateToISO(G.addDays(start, 7)),  name: 'Acier HA',        category: 'acier',     qty: 8500, unit: 'kg',    unit_price: 6.5, cost: 8500 * 6.5,  supplier: 'SonaSid',          note: '' },
        { id: uid(), project_id: null, task_id: matKeys.t2, date: G.dateToISO(G.addDays(start, 12)), name: 'Mortier',         category: 'mortier',   qty: 45,   unit: 'sac',   unit_price: 320, cost: 45 * 320,    supplier: '',                 note: '' },
        { id: uid(), project_id: null, task_id: matKeys.t3, date: G.dateToISO(G.addDays(start, 18)), name: 'Briques 20cm',    category: 'brique',    qty: 2800, unit: 'unité', unit_price: 2.8, cost: 2800 * 2.8,  supplier: 'Briqueterie Nord', note: '' },
        { id: uid(), project_id: null, task_id: matKeys.t4, date: G.dateToISO(G.addDays(start, 60)), name: 'Carrelage 60×60', category: 'carrelage', qty: 380,  unit: 'm²',    unit_price: 95,  cost: 380 * 95,    supplier: '',                 note: '' }
      ],
      equipment: [
        { id: uid(), project_id: null, kind: 'location',  name: 'Bétonnière diesel',  category: 'engin',       supplier: 'Loc Atlas',  daily_rate: 350, start_date: G.dateToISO(G.addDays(start, 5)),  end_date: G.dateToISO(G.addDays(start, 25)), task_id: matKeys.t1, note: '' },
        { id: uid(), project_id: null, kind: 'location',  name: 'Échafaudage 50m²',   category: 'echafaudage', supplier: 'EchafMaroc', daily_rate: 180, start_date: G.dateToISO(G.addDays(start, 10)), end_date: G.dateToISO(G.addDays(start, 40)), task_id: matKeys.t3, note: '' },
        { id: uid(), project_id: null, kind: 'propriete', name: 'Perceuse Bosch GSB', category: 'outillage',   supplier: '',           purchase_date: G.dateToISO(G.addDays(start, -200)), purchase_cost: 1800, allocation_pct: 100, task_id: null, note: '' },
        { id: uid(), project_id: null, kind: 'propriete', name: 'Camion Iveco',       category: 'vehicule',    supplier: '',           purchase_date: G.dateToISO(G.addDays(start, -500)), purchase_cost: 220000, allocation_pct: 25, task_id: null, note: 'Amortissement partiel sur le projet' }
      ],
      soustraitants: [
        {
          id: uid(), name: 'Plomberie SARL', specialite: 'Plomberie', forfait: 80000,
          payments: [
            { id: uid(), date: G.dateToISO(G.addDays(start, 20)), amount: 30000, note: 'Acompte' },
            { id: uid(), date: G.dateToISO(G.addDays(start, 45)), amount: 20000, note: 'Avance matériel' }
          ]
        },
        {
          id: uid(), name: 'Élec Pro', specialite: 'Électricité', forfait: 45000,
          payments: [
            { id: uid(), date: G.dateToISO(G.addDays(start, 30)), amount: 45000, note: 'Paiement complet' }
          ]
        },
        {
          id: uid(), name: 'Étanchéité Maroc', specialite: 'Étanchéité', forfait: 60000,
          payments: []
        }
      ],
      ui: {
        activeTab: 'overview',
        ressourcesSubTab: 'apercu',
        pointageDate: new Date().toISOString().slice(0, 10),
        ganttDayPx: 14,
        ganttScroll: 0
      }
    };
  }

  function sampleTasks(tasks, worker) {
    const candidates = tasks
      .filter(t => Array.isArray(t.assignedWorkers) && t.assignedWorkers.includes(worker.id))
      .filter(t => !tasks.some(c => c.parent_id === t.id));
    if (candidates.length === 0) return [];
    return [candidates[Math.floor(Math.random() * candidates.length)].id];
  }

  // ── State ──────────────────────────────────────────────────────
  // `state` is populated asynchronously in boot(); closures defined below
  // see the assigned value because they only run after boot() finishes.
  let state = null;

  // ── Formatters ─────────────────────────────────────────────────
  function fmtMAD(n) {
    if (n == null) return '—';
    return new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' DH';
  }
  function fmtDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  function fmtDateLong(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  // ── Computed values ────────────────────────────────────────────
  function computeOverview() {
    const s = Bud.budgetSummary({
      project: state.project,
      workers: state.workers,
      pointages: state.pointages,
      soustraitants: state.soustraitants,
      materials: state.materials,
      equipment: state.equipment
    });
    // Preserve the legacy shape so callers (overview KPIs, alerts) stay unchanged.
    return {
      labourCost: s.labour,
      materialsCost: s.materials,
      equipmentCost: s.equipment,
      soustraitantsCommitted: s.soustraitantsCommitted,
      soustraitantsPaid: s.soustraitantsPaid,
      spent: s.totalCost,
      budget: s.budgetInterne,
      devis: s.devis,
      margin: s.margeActuelle,
      marginPlanned: s.devis - s.budgetInterne,
      consumedPct: s.consumedPct,
      summary: s
    };
  }

  function computeAlerts() {
    const alerts = [];
    const today = new Date(); today.setHours(0,0,0,0);
    const offsets = G.computeTaskOffsets(state.ganttTasks, state.project.start_date);
    for (const t of state.ganttTasks) {
      const info = offsets.get(t.id);
      if (!info) continue;
      if (G.isTaskLate(t, info.endDate, today)) {
        alerts.push({
          type: 'PROD',
          severity: 'critical',
          message: `Tâche en retard : devait être terminée le ${fmtDate(info.endDate)}`,
          task_id: t.id,
          task_name: t.name
        });
      }
    }
    const ov = computeOverview();
    if (ov.consumedPct >= 80 && ov.consumedPct < 100) {
      alerts.push({ type: 'BUDGET', severity: 'moderate', message: `Budget consommé à ${ov.consumedPct} %`, task_name: '—' });
    } else if (ov.consumedPct >= 100) {
      alerts.push({ type: 'BUDGET', severity: 'critical', message: `Budget dépassé (${ov.consumedPct} %)`, task_name: '—' });
    }
    // Inactivity per worker
    const todayISO = today.toISOString().slice(0, 10);
    for (const w of state.workers) {
      const recent = state.pointages
        .filter(p => p.worker_id === w.id && p.present)
        .sort((a,b) => b.date.localeCompare(a.date))[0];
      if (recent) {
        const last = new Date(recent.date);
        const daysSince = Math.floor((today - last) / 86400000);
        if (daysSince > 5) {
          alerts.push({
            type: 'INACTIVE',
            severity: 'low',
            message: `${w.name} pas pointé depuis ${daysSince} jours`,
            task_name: '—'
          });
        }
      }
    }
    return alerts;
  }

  function refreshTopbar() {
    const alerts = computeAlerts();
    const badge = document.getElementById('alert-count');
    const tabBadge = document.getElementById('alert-tab-badge');
    if (badge) {
      badge.textContent = alerts.length;
      badge.classList.toggle('hide', alerts.length === 0);
    }
    if (tabBadge) {
      tabBadge.textContent = alerts.length;
      tabBadge.classList.toggle('hide', alerts.length === 0);
    }
    const meta = document.getElementById('project-meta');
    if (meta) meta.textContent = `${state.project.name} · ${fmtDate(state.project.start_date)}`;
    syncSidebarActive();
  }

  // ── Sidebar navigation ─────────────────────────────────────────
  // Sidebar drives top-level + sub navigation. Sub-tabs are stored on
  // state.ui.ressourcesSubTab (existing) and state.ui.budgetSubTab (new,
  // reserved for future Budget sub-pages).
  const PAGE_TITLES = {
    overview:   'Dashboard',
    planning:   'Planning',
    ressources: 'Ressources',
    budget:     'Budget',
    alertes:    'Alertes'
  };
  const SUB_TITLES = {
    ressources: {
      apercu:        'Aperçu',
      pointage:      'Pointage',
      calendrier:    'Calendrier',
      soustraitants: 'Sous-traitants',
      materiaux:     'Matériaux',
      materiel:      'Matériel'
    },
    budget: {
      apercu: 'Aperçu'
    }
  };

  function setTab(target, sub) {
    state.ui.activeTab = target;
    if (target === 'ressources' && sub) state.ui.ressourcesSubTab = sub;
    if (target === 'budget'     && sub) state.ui.budgetSubTab     = sub;
    saveState();
    render();
  }

  function syncSidebarActive() {
    const target = state.ui.activeTab;
    const rSub = state.ui.ressourcesSubTab;
    const bSub = state.ui.budgetSubTab || 'apercu';
    document.querySelectorAll('.nav-item[data-target]').forEach(b => {
      const sub = b.dataset.sub;
      let active = false;
      if (b.dataset.target === target) {
        if (!sub) active = true;
        else if (target === 'ressources') active = sub === rSub;
        else if (target === 'budget')     active = sub === bSub;
      }
      b.classList.toggle('active', active);
    });
    const titleEl = document.getElementById('page-title');
    if (titleEl) {
      let title = PAGE_TITLES[target] || '';
      const subKey = target === 'ressources' ? rSub
                   : target === 'budget'     ? bSub
                   : null;
      if (subKey && SUB_TITLES[target] && SUB_TITLES[target][subKey]) {
        title += ' · ' + SUB_TITLES[target][subKey];
      }
      titleEl.textContent = title;
    }
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.nav-item[data-target]');
    if (!btn) return;
    setTab(btn.dataset.target, btn.dataset.sub);
  });

  // ── Render dispatcher ──────────────────────────────────────────
  // Module-scope state for date-strip scroll preservation.
  // Reset on each top-level render() so opening a tab re-centers on the active tile.
  let _firstPointageStripRender = true;
  let _pointageScrollPos = 0;
  let _pointageStripAnchor = null;

  let _firstCalendrierStripRender = true;
  let _calendrierScrollPos = 0;
  let _calendrierStripAnchor = null;
  let _calendrierStripView = null;

  // Strip spans. Daily strip covers ~3 months either side of the anchor;
  // weekly ~3 months; monthly ~1 year. Big enough that ordinary dragging
  // doesn't hit an edge — anchor auto-shifts when it does.
  const POINTAGE_STRIP_SPAN = 91;
  const CAL_WEEK_STRIP_SPAN = 27;
  const CAL_MONTH_STRIP_SPAN = 25;

  function render() {
    refreshTopbar();
    _firstPointageStripRender = true;
    _firstCalendrierStripRender = true;
    const root = document.getElementById('app');
    switch (state.ui.activeTab) {
      case 'overview':  root.innerHTML = renderOverview(); afterOverview(); break;
      case 'planning':  root.innerHTML = renderPlanning(); afterPlanning(); break;
      case 'ressources': root.innerHTML = renderRessources(); afterRessources(); break;
      case 'budget':    root.innerHTML = renderBudget();   afterBudget();   break;
      case 'alertes':   root.innerHTML = renderAlertes();  afterAlertes();  break;
    }
  }

  // ════════════════════════════════════════════════════════════════
  // VUE D'ENSEMBLE
  // ════════════════════════════════════════════════════════════════
  function renderOverview() {
    const ov = computeOverview();
    const offsets = G.computeTaskOffsets(state.ganttTasks, state.project.start_date);
    const today = new Date(); today.setHours(0,0,0,0);

    const topTasks = state.ganttTasks
      .filter(t => !state.ganttTasks.some(c => c.parent_id === t.id))
      .slice(0, 6);

    const recent = W.recentPointages(state.pointages, state.workers, 5);
    const alerts = computeAlerts().slice(0, 3);

    return `
      <div class="page">
        <div class="page-header">
          <div>
            <h1 class="page-title">Vue d'ensemble</h1>
            <div class="page-subtitle">${state.project.name} · démarré le ${fmtDate(state.project.start_date)}</div>
          </div>
        </div>

        <div class="grid grid-4 mb-3">
          <div class="kpi">
            <div class="kpi-label">Budget interne</div>
            <div class="kpi-value num">${fmtMAD(ov.budget)}</div>
            <div class="kpi-trend muted">Devis client : ${fmtMAD(ov.devis)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Dépensé</div>
            <div class="kpi-value num">${fmtMAD(ov.spent)}</div>
            <div class="kpi-trend ${ov.consumedPct >= 100 ? 'down' : ov.consumedPct >= 80 ? 'warn' : 'up'}">
              ${ov.consumedPct} % du budget
            </div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Marge actuelle</div>
            <div class="kpi-value num">${fmtMAD(ov.margin)}</div>
            <div class="kpi-trend ${ov.margin < ov.marginPlanned ? 'down' : 'up'}">
              Prévue : ${fmtMAD(ov.marginPlanned)}
            </div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Alertes</div>
            <div class="kpi-value num">${alerts.length}</div>
            <div class="kpi-trend ${alerts.length > 0 ? 'warn' : 'up'}">
              ${alerts.length === 0 ? 'Tout va bien' : 'À examiner'}
            </div>
          </div>
        </div>

        <div class="grid grid-2 mb-3">
          <div class="card">
            <div class="card-header">
              <div class="card-title">Avancement par tâche</div>
              <button class="btn btn-ghost btn-sm" data-goto="planning">Voir tout →</button>
            </div>
            <table class="table">
              <thead>
                <tr><th>Tâche</th><th>Statut</th><th class="text-right">Période</th></tr>
              </thead>
              <tbody>
                ${topTasks.map(t => {
                  const info = offsets.get(t.id);
                  const late = info && G.isTaskLate(t, info.endDate, today);
                  const badgeCls = late ? 'badge-danger' : G.statusBadgeClass(t.status);
                  const label = late ? 'En retard' : G.statusLabel(t.status);
                  return `
                    <tr>
                      <td><strong>${escapeHtml(t.name)}</strong></td>
                      <td><span class="badge ${badgeCls}">${label}</span></td>
                      <td class="text-right muted text-sm">${info ? fmtDate(info.startDate) + ' → ' + fmtDate(info.endDate) : '—'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>

          <div class="card">
            <div class="card-header">
              <div class="card-title">Alertes récentes</div>
              <button class="btn btn-ghost btn-sm" data-goto="alertes">Voir tout →</button>
            </div>
            ${alerts.length === 0 ? '<div class="empty-state"><div class="empty-state-title">Aucune alerte</div><div>Tout est sous contrôle.</div></div>' :
              `<div>${alerts.map(a => `
                <div style="padding: 10px 0; border-bottom: 1px solid var(--border); display: flex; align-items: start; gap: 10px;">
                  <span class="badge ${a.severity === 'critical' ? 'badge-danger' : a.severity === 'moderate' ? 'badge-warn' : 'badge-info'}">${a.type}</span>
                  <div style="flex:1">
                    <div>${escapeHtml(a.message)}</div>
                    <div class="muted text-sm">${escapeHtml(a.task_name || '')}</div>
                  </div>
                </div>
              `).join('')}</div>`
            }
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <div class="card-title">Activité récente — pointage</div>
            <button class="btn btn-ghost btn-sm" data-goto="ressources">Voir tout →</button>
          </div>
          ${recent.length === 0 ? '<div class="empty-state"><div class="empty-state-title">Pas encore de pointage</div></div>' :
          `<table class="table">
            <thead><tr><th>Date</th><th>Ouvrier</th><th>Tâches</th><th class="text-right">Coût</th></tr></thead>
            <tbody>
              ${recent.map(p => `
                <tr>
                  <td>${fmtDate(p.date)}</td>
                  <td><strong>${escapeHtml(p.worker?.name || '—')}</strong> <span class="muted text-sm">${escapeHtml(p.worker?.role || '')}</span></td>
                  <td>${(p.task_ids || []).map(id => {
                    const t = state.ganttTasks.find(x => x.id === id);
                    return t ? `<span class="badge badge-muted">${escapeHtml(t.name)}</span>` : '';
                  }).join(' ')}</td>
                  <td class="text-right num">${fmtMAD(p.cost)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`}
        </div>
      </div>
    `;
  }
  function afterOverview() {
    document.querySelectorAll('[data-goto]').forEach(b => {
      b.addEventListener('click', () => setTab(b.dataset.goto));
    });
  }

  // ════════════════════════════════════════════════════════════════
  // PLANNING (Gantt)
  // ════════════════════════════════════════════════════════════════
  function renderPlanning() {
    return `
      <div class="page">
        <div class="page-header">
          <div>
            <h1 class="page-title">Planning</h1>
            <div class="page-subtitle">Clic = sélectionner · Ctrl/Cmd-clic = ajouter · Shift-clic = plage · glisser une barre = déplacer · molette = zoom</div>
          </div>
          <div class="flex gap-2">
            <button class="btn" id="gantt-today">Aujourd'hui</button>
            <button class="btn" id="gantt-fit">Ajuster</button>
            <button class="btn btn-primary" id="task-add">+ Tâche</button>
          </div>
        </div>
        <div class="gantt-wrap">
          <div class="gantt-container">
            <div class="gantt-left">
              <div class="gantt-left-head">Tâche</div>
              <div class="gantt-left-body" id="gantt-left-body"></div>
            </div>
            <div class="gantt-right" id="gantt-scroll-area">
              <div class="gantt-right-head" id="gantt-right-head"></div>
              <div class="gantt-right-body" id="gantt-right-body"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // Returns { leftHTML, headHTML, bodyHTML, width } for the new split layout.
  function renderGanttContent(viewportWidth) {
    const offsets = G.computeTaskOffsets(state.ganttTasks, state.project.start_date);
    const enriched = state.ganttTasks.map(t => {
      const o = offsets.get(t.id);
      return { ...t, _end: o?.endOffset, _start: o?.startOffset };
    });
    const bounds = G.computeTimelineBounds(enriched);
    const flat = G.flattenTasks(state.ganttTasks);
    const dayPx = state.ui.ganttDayPx;
    const totalDays = bounds.max + 1;
    const naturalWidth = totalDays * dayPx;
    const minColWidth = Math.max(0, (viewportWidth || 0));
    const totalWidth = Math.max(naturalWidth, minColWidth);
    const today = new Date(); today.setHours(0,0,0,0);
    const projStart = G.toDate(state.project.start_date);
    const todayOffset = G.diffDays(projStart, today);
    const stride = G.dayLabelStride(dayPx);

    // Month headers
    const months = [];
    let curMonth = -1;
    let monthStart = 0;
    for (let i = 0; i <= totalDays; i++) {
      const d = G.addDays(projStart, i);
      if (d.getMonth() !== curMonth) {
        if (curMonth !== -1) {
          months.push({ start: monthStart, end: i, label: monthLabel(G.addDays(projStart, monthStart)) });
        }
        curMonth = d.getMonth();
        monthStart = i;
      }
    }

    // Day cells (with decimated labels) + weekend overlays
    const dayCells = [];
    const weekendCols = [];
    for (let i = 0; i < totalDays; i++) {
      const d = G.addDays(projStart, i);
      const weekend = G.isWeekend(d);
      const isToday = G.diffDays(d, today) === 0;
      const showLabel = (i % stride === 0) || isToday;
      dayCells.push(
        `<div class="gantt-day ${weekend ? 'weekend' : ''} ${isToday ? 'today' : ''}"
              style="left:${i*dayPx}px;width:${dayPx}px">${showLabel ? d.getDate() : ''}</div>`
      );
      if (weekend) {
        weekendCols.push(`<div class="gantt-weekend-col" style="left:${i*dayPx}px;width:${dayPx}px"></div>`);
      }
    }

    // Rows — left side (sticky) and right side (bars)
    const leftRows = [];
    const rightRows = [];
    for (const t of flat) {
      const info = offsets.get(t.id);
      const hasChildren = state.ganttTasks.some(c => c.parent_id === t.id);
      const isParent = hasChildren;
      const late = info && G.isTaskLate(t, info.endDate, today);
      const barClass = late ? 'late' : (`status-${t.status || 'todo'}`);
      const indent = t.depth * 16;

      leftRows.push(`
        <div class="gantt-row-left ${isParent ? 'parent' : 'child'}" data-task-id="${t.id}">
          <span style="display:inline-block;width:${indent}px"></span>
          ${hasChildren
            ? `<button class="gantt-collapse" data-toggle="${t.id}">${t.collapsed ? '▶' : '▼'}</button>`
            : `<span class="gantt-status-dot ${late ? 'late' : (t.status || 'todo')}"></span>`}
          <span style="flex:1;cursor:pointer" class="gantt-task-name" data-edit="${t.id}">${escapeHtml(t.name)}</span>
          <span class="muted text-sm">${info ? info.duration + 'j' : ''}</span>
        </div>
      `);

      const left = (info?.startOffset || 0) * dayPx;
      const width = Math.max((info?.duration || 1) * dayPx - 2, isParent ? (info?.duration || 1) * dayPx : 12);
      rightRows.push(`
        <div class="gantt-row-right" data-task-id="${t.id}">
          <div class="gantt-bar ${isParent ? 'parent' : ''} ${barClass}"
               style="left:${left}px;width:${width}px"
               data-edit="${t.id}"
               title="${escapeHtml(t.name)} — ${info ? fmtDate(info.startDate) + ' → ' + fmtDate(info.endDate) : ''}"></div>
        </div>
      `);
    }

    const headHTML = `
      <div style="position:relative;width:${totalWidth}px;height:50px">
        ${months.map(m => `
          <div class="gantt-month" style="left:${m.start*dayPx}px;width:${(m.end-m.start)*dayPx}px">${m.label}</div>
        `).join('')}
        ${dayCells.join('')}
      </div>
    `;

    const bodyHTML = `
      <div style="position:relative;width:${totalWidth}px">
        ${weekendCols.join('')}
        ${todayOffset >= 0 && todayOffset <= totalDays ? `<div class="gantt-today-line" style="left:${todayOffset*dayPx}px"></div>` : ''}
        ${rightRows.join('')}
      </div>
    `;

    return { leftHTML: leftRows.join(''), headHTML, bodyHTML, width: totalWidth };
  }

  function monthLabel(d) {
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  function afterPlanning() {
    const leftBody  = document.getElementById('gantt-left-body');
    const rightHead = document.getElementById('gantt-right-head');
    const rightBody = document.getElementById('gantt-right-body');
    const scrollEl  = document.getElementById('gantt-scroll-area');

    function rerender() {
      const out = renderGanttContent(scrollEl.clientWidth);
      leftBody.innerHTML  = out.leftHTML;
      rightHead.innerHTML = out.headHTML;
      rightBody.innerHTML = out.bodyHTML;
      wireGanttRowEvents(rerender);
    }
    rerender();

    // ── Wheel zoom (no modifier needed — wheel = zoom; drag = pan) ───
    function zoomBy(deltaY) {
      const factor = deltaY > 0 ? 0.85 : 1.18;
      const newPx = Math.max(3, Math.min(80, Math.round(state.ui.ganttDayPx * factor)));
      if (newPx !== state.ui.ganttDayPx) {
        state.ui.ganttDayPx = newPx;
        saveState();
        rerender();
      }
    }
    const wheelZoom = (e) => { e.preventDefault(); zoomBy(e.deltaY); };
    scrollEl.addEventListener('wheel', wheelZoom, { passive: false });
    leftBody.addEventListener('wheel', wheelZoom, { passive: false });

    // ── Vertical scroll sync (right ↔ left) ────────────────────
    let syncing = false;
    scrollEl.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      leftBody.scrollTop = scrollEl.scrollTop;
      syncing = false;
    });
    leftBody.addEventListener('scroll', () => {
      if (syncing) return;
      syncing = true;
      scrollEl.scrollTop = leftBody.scrollTop;
      syncing = false;
    });

    // ── Drag-to-pan on the timeline ────────────────────────────
    let drag = null;
    scrollEl.addEventListener('mousedown', (e) => {
      // Skip drags that start on interactive elements
      if (e.target.closest('.gantt-bar, button, a, input, select')) return;
      if (e.button !== 0) return;
      drag = {
        x: e.clientX, y: e.clientY,
        sl: scrollEl.scrollLeft, st: scrollEl.scrollTop,
        moved: false
      };
      scrollEl.classList.add('dragging');
    });
    window.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
      scrollEl.scrollLeft = drag.sl - dx;
      scrollEl.scrollTop  = drag.st - dy;
    });
    window.addEventListener('mouseup', () => {
      if (drag) {
        // If the user actually dragged, swallow the synthetic click so we don't
        // accidentally open a task modal at the release point.
        const moved = drag.moved;
        scrollEl.classList.remove('dragging');
        drag = null;
        if (moved) {
          const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
          scrollEl.addEventListener('click', swallow, { capture: true, once: true });
        }
      }
    });

    // ── Toolbar buttons ────────────────────────────────────────
    document.getElementById('gantt-today').addEventListener('click', () => {
      const today = new Date(); today.setHours(0,0,0,0);
      const off = G.diffDays(state.project.start_date, today);
      scrollEl.scrollLeft = Math.max(0, off * state.ui.ganttDayPx - 200);
    });
    document.getElementById('gantt-fit').addEventListener('click', () => {
      const offsets = G.computeTaskOffsets(state.ganttTasks, state.project.start_date);
      let maxEnd = 30;
      offsets.forEach(o => { if (o.endOffset > maxEnd) maxEnd = o.endOffset; });
      const target = Math.floor(scrollEl.clientWidth / (maxEnd + 2));
      state.ui.ganttDayPx = Math.max(3, Math.min(80, target));
      saveState();
      rerender();
    });
    document.getElementById('task-add').addEventListener('click', () => openTaskModal(null));

    // Scroll to today on initial load
    requestAnimationFrame(() => {
      const today = new Date(); today.setHours(0,0,0,0);
      const off = G.diffDays(state.project.start_date, today);
      scrollEl.scrollLeft = Math.max(0, off * state.ui.ganttDayPx - 200);
    });

    // Re-render on window resize so the timeline keeps filling the area
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(rerender, 100);
    });
  }

  function wireGanttRowEvents(rerender) {
    // Collapse / expand parent rows (its own handler — stops propagation so
    // toggling doesn't also select the row).
    document.querySelectorAll('[data-toggle]').forEach(b => {
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        const t = state.ganttTasks.find(x => x.id === b.dataset.toggle);
        if (t) {
          t.collapsed = !t.collapsed;
          saveState();
          if (rerender) rerender();
        }
      });
    });

    // Click on a row → select. Modifier-aware:
    //   plain click       → replace selection with just this row
    //   Ctrl / Cmd click  → toggle this row in the selection
    //   Shift click       → extend selection from anchor to this row
    // Double click → open the edit modal.
    const rows = document.querySelectorAll(
      '.gantt-row-left[data-task-id], .gantt-row-right[data-task-id]'
    );
    rows.forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-toggle]')) return;
        if (e.target.closest('.gantt-bar.dragging')) return;
        const mode = e.shiftKey ? 'range'
                   : (e.ctrlKey || e.metaKey) ? 'toggle'
                   : 'single';
        selectGanttRow(row.dataset.taskId, mode);
      });
      row.addEventListener('dblclick', (e) => {
        e.preventDefault();
        if (window.getSelection) window.getSelection().removeAllRanges();
        openTaskModal(row.dataset.taskId);
      });
    });

    // Drag a bar horizontally to reposition the task in time.
    // If the mousedown'd bar is part of the current selection, ALL selected
    // bars move together (same dx in days), preserving their relative offsets.
    // If it's not in the selection, selection resets to just that one first.
    // Parent bars span their children automatically — they're not draggable.
    document.querySelectorAll('.gantt-bar[data-edit]:not(.parent)').forEach(bar => {
      bar.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        const taskId = bar.dataset.edit;
        const t = state.ganttTasks.find(x => x.id === taskId);
        if (!t) return;

        if (!ganttSelectedIds.has(taskId)) {
          selectGanttRow(taskId, 'single');
        }

        // Collect the draggable elements for every selected non-parent task.
        const draggables = [];
        ganttSelectedIds.forEach(id => {
          const task = state.ganttTasks.find(x => x.id === id);
          if (!task) return;
          if (state.ganttTasks.some(x => x.parent_id === id)) return; // skip parents
          const el = document.querySelector(
            `.gantt-bar[data-edit="${CSS.escape(id)}"]:not(.parent)`
          );
          if (!el) return;
          draggables.push({ el, task, initialLeft: parseFloat(el.style.left) || 0 });
        });
        if (draggables.length === 0) return;

        const startX = e.clientX;
        const dayPx = state.ui.ganttDayPx;
        let moved = false;
        let snapDx = 0; // delta in days, same for the whole group
        document.body.style.cursor = 'grabbing';
        draggables.forEach(d => d.el.classList.add('dragging'));

        function onMove(ev) {
          const dx = ev.clientX - startX;
          if (Math.abs(dx) > 3) moved = true;
          if (!moved) return;
          snapDx = Math.round(dx / dayPx);
          draggables.forEach(d => {
            const newLeft = Math.max(0, d.initialLeft + snapDx * dayPx);
            d.el.style.left = newLeft + 'px';
          });
        }

        async function onUp() {
          window.removeEventListener('mousemove', onMove);
          window.removeEventListener('mouseup', onUp);
          document.body.style.cursor = '';
          draggables.forEach(d => d.el.classList.remove('dragging'));

          if (!moved || snapDx === 0) return;

          // Swallow the synthetic click that follows mouseup.
          const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
          window.addEventListener('click', swallow, { capture: true, once: true });

          const beforeOffsets = G.computeTaskOffsets(state.ganttTasks, state.project.start_date);
          for (const d of draggables) {
            const before = beforeOffsets.get(d.task.id);
            if (!before) continue;
            d.task.manual_start_offset = Math.max(0, before.startOffset + snapDx);
          }

          await maybeAskAboutCascade(draggables.map(d => d.task), beforeOffsets);
          saveState();
          if (rerender) rerender();
        }

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
      });
    });

    // Re-apply selection highlights — the previous DOM was replaced by rerender.
    applyGanttSelection();
  }

  // Gantt selection — module-scope (not persisted). Multi-select via Ctrl/Cmd
  // (toggle) and Shift (range from anchor). Plain click resets to one row.
  let ganttSelectedIds = new Set();
  let ganttSelectionAnchor = null;

  function selectGanttRow(taskId, mode) {
    if (!taskId) {
      ganttSelectedIds.clear();
      ganttSelectionAnchor = null;
    } else if (mode === 'toggle') {
      if (ganttSelectedIds.has(taskId)) ganttSelectedIds.delete(taskId);
      else                              ganttSelectedIds.add(taskId);
      ganttSelectionAnchor = taskId;
    } else if (mode === 'range' && ganttSelectionAnchor) {
      const flat = G.flattenTasks(state.ganttTasks);
      const i1 = flat.findIndex(t => t.id === ganttSelectionAnchor);
      const i2 = flat.findIndex(t => t.id === taskId);
      if (i1 !== -1 && i2 !== -1) {
        const [lo, hi] = i1 < i2 ? [i1, i2] : [i2, i1];
        ganttSelectedIds.clear();
        for (let i = lo; i <= hi; i++) ganttSelectedIds.add(flat[i].id);
      } else {
        ganttSelectedIds.clear();
        ganttSelectedIds.add(taskId);
        ganttSelectionAnchor = taskId;
      }
    } else {
      // single
      ganttSelectedIds.clear();
      ganttSelectedIds.add(taskId);
      ganttSelectionAnchor = taskId;
    }
    applyGanttSelection();
  }

  function applyGanttSelection() {
    document.querySelectorAll('.gantt-row-selected').forEach(el => {
      el.classList.remove('gantt-row-selected');
    });
    ganttSelectedIds.forEach(id => {
      const sel = `.gantt-row-left[data-task-id="${CSS.escape(id)}"], `
                + `.gantt-row-right[data-task-id="${CSS.escape(id)}"]`;
      document.querySelectorAll(sel).forEach(el => el.classList.add('gantt-row-selected'));
    });
  }

  // After mutating one or more tasks' date/duration/parent, compare
  // before/after offsets and — if later siblings would cascade — prompt the
  // user to either let them shift ("Tout décaler") or pin each one in place
  // ("Garder leurs dates"). Accepts a single task or an array.
  // Caller must compute `beforeOffsets` BEFORE the mutation(s).
  async function maybeAskAboutCascade(tasksOrTask, beforeOffsets) {
    const moved = Array.isArray(tasksOrTask) ? tasksOrTask : [tasksOrTask];
    if (moved.length === 0) return;
    const movedIds = new Set(moved.map(t => t.id));

    // Followers = any task in the same parent group as a moved task, later
    // in sort_order, not itself moved, and without its own pin.
    const followers = new Map();
    for (const mt of moved) {
      for (const s of state.ganttTasks) {
        if (movedIds.has(s.id) || followers.has(s.id)) continue;
        if ((s.parent_id || null) !== (mt.parent_id || null)) continue;
        if ((s.sort_order || 0) <= (mt.sort_order || 0)) continue;
        if (s.manual_start_offset != null) continue;
        followers.set(s.id, s);
      }
    }

    const afterOffsets = G.computeTaskOffsets(state.ganttTasks, state.project.start_date);
    const shifted = Array.from(followers.values()).filter(f => {
      const b = beforeOffsets.get(f.id);
      const a = afterOffsets.get(f.id);
      return b && a && b.startOffset !== a.startOffset;
    });
    if (shifted.length === 0) return;

    const names = shifted.slice(0, 3).map(f => f.name).join(', ');
    const more = shifted.length > 3 ? ` (+${shifted.length - 3} autres)` : '';
    const cascade = await window.Modal.confirm({
      title: 'Décaler les tâches suivantes ?',
      message: `${shifted.length} tâche(s) suivante(s) seraient automatiquement décalée(s) : ${names}${more}.`,
      confirmLabel: 'Tout décaler',
      cancelLabel: 'Garder leurs dates',
      danger: false
    });
    if (!cascade) {
      for (const f of shifted) {
        const before = beforeOffsets.get(f.id);
        if (before) f.manual_start_offset = before.startOffset;
      }
    }
  }

  function openTaskModal(taskId) {
    const isNew = !taskId;
    const t = isNew ? { id: '', name: '', duration: 5, parent_id: null, status: 'todo', sort_order: state.ganttTasks.length + 1, assignedWorkers: [] }
                    : state.ganttTasks.find(x => x.id === taskId);
    if (!t) return;
    const candidatesAsParent = state.ganttTasks.filter(p => p.id !== t.id && !p.parent_id);

    // Pre-fill the start-date picker with the explicit override if set;
    // otherwise leave empty and show what the auto-computed date would be.
    const projStart = state.project.start_date;
    const manualDateValue = (t.manual_start_offset != null)
      ? G.dateToISO(G.addDays(projStart, t.manual_start_offset))
      : '';
    let autoStartLabel = '';
    if (!isNew) {
      const allOffsets = G.computeTaskOffsets(state.ganttTasks, projStart);
      const info = allOffsets.get(t.id);
      if (info) autoStartLabel = fmtDate(info.startDate);
    }
    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal">
          <h3 class="modal-title">${isNew ? 'Nouvelle tâche' : 'Modifier la tâche'}</h3>
          <div class="grid" style="gap:12px">
            <label class="field">Nom
              <input class="input" id="t-name" value="${escapeHtml(t.name)}" />
            </label>
            <div class="grid grid-2">
              <label class="field">Durée (jours)
                <input type="number" min="1" class="input" id="t-duration" value="${t.duration || 1}" />
              </label>
              <label class="field">Statut
                <select class="select" id="t-status">
                  <option value="todo" ${t.status==='todo'?'selected':''}>À faire</option>
                  <option value="in_progress" ${t.status==='in_progress'?'selected':''}>En cours</option>
                  <option value="done" ${t.status==='done'?'selected':''}>Terminé</option>
                </select>
              </label>
            </div>
            <label class="field">Tâche parente
              <select class="select" id="t-parent">
                <option value="">— Aucune (tâche principale)</option>
                ${candidatesAsParent.map(p => `<option value="${p.id}" ${t.parent_id===p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
              </select>
            </label>
            <label class="field">Date de début
              <input type="date" class="input" id="t-start-date" value="${manualDateValue}" />
              <span class="muted text-sm">
                ${manualDateValue
                  ? `Date imposée — les tâches peuvent se chevaucher`
                  : `Vide = séquentiel${autoStartLabel ? ` (auto : ${autoStartLabel})` : ''}`}
              </span>
            </label>
          </div>
          <div class="modal-actions">
            ${!isNew ? '<button class="btn btn-danger" id="t-delete">Supprimer</button>' : ''}
            <button class="btn" id="t-cancel">Annuler</button>
            <button class="btn btn-primary" id="t-save">Enregistrer</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const bd = document.getElementById('modal-bd');
    document.getElementById('t-cancel').addEventListener('click', () => bd.remove());
    document.getElementById('t-save').addEventListener('click', async () => {
      const name = document.getElementById('t-name').value.trim();
      if (!name) return;
      const duration = parseInt(document.getElementById('t-duration').value, 10) || 1;
      const status = document.getElementById('t-status').value;
      const parent_id = document.getElementById('t-parent').value || null;
      const startDateRaw = document.getElementById('t-start-date').value;
      const manual_start_offset = startDateRaw === ''
        ? null
        : G.diffDays(state.project.start_date, startDateRaw);

      if (isNew) {
        state.ganttTasks.push({
          id: uid(), name, duration, status, parent_id, manual_start_offset,
          sort_order: state.ganttTasks.length + 1, collapsed: false, assignedWorkers: []
        });
        saveState();
        bd.remove();
        render();
        return;
      }

      // Existing task — snapshot offsets, mutate, then ask about cascade.
      const beforeOffsets = G.computeTaskOffsets(state.ganttTasks, state.project.start_date);
      Object.assign(t, { name, duration, status, parent_id, manual_start_offset });
      bd.remove();
      await maybeAskAboutCascade(t, beforeOffsets);
      saveState();
      render();
    });
    if (!isNew) {
      document.getElementById('t-delete').addEventListener('click', async () => {
        const ok = await window.Modal.confirm({
          title: 'Supprimer la tâche',
          message: `« ${t.name} » et toutes ses sous-tâches seront définitivement supprimées.`,
          confirmLabel: 'Supprimer'
        });
        if (!ok) return;
        const toDelete = new Set([t.id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const x of state.ganttTasks) {
            if (x.parent_id && toDelete.has(x.parent_id) && !toDelete.has(x.id)) {
              toDelete.add(x.id);
              changed = true;
            }
          }
        }
        state.ganttTasks = state.ganttTasks.filter(x => !toDelete.has(x.id));
        saveState();
        bd.remove();
        render();
        window.Toast && window.Toast.success('Tâche supprimée');
      });
    }
  }

  // ════════════════════════════════════════════════════════════════
  // RESSOURCES (sub-tabs: ouvriers + matériaux + matériel)
  // ════════════════════════════════════════════════════════════════
  function renderRessources() {
    const sub = state.ui.ressourcesSubTab || 'apercu';
    return `
      <div class="page">
        <div class="subtabs">
          <button class="subtab ${sub==='apercu'?'active':''}" data-sub="apercu">Gestion d'effectif</button>
          <button class="subtab ${sub==='pointage'?'active':''}" data-sub="pointage">Pointage</button>
          <button class="subtab ${sub==='calendrier'?'active':''}" data-sub="calendrier">Calendrier</button>
          <button class="subtab ${sub==='soustraitants'?'active':''}" data-sub="soustraitants">Sous-traitants</button>
          <button class="subtab ${sub==='materiaux'?'active':''}" data-sub="materiaux">Matériaux</button>
          <button class="subtab ${sub==='materiel'?'active':''}" data-sub="materiel">Matériel</button>
        </div>
        <div id="ressources-body">${renderRessourcesBody(sub)}</div>
      </div>
    `;
  }
  function renderRessourcesBody(sub) {
    if (sub === 'apercu')        return renderApercu();
    if (sub === 'pointage')      return renderPointage();
    if (sub === 'calendrier')    return renderCalendrier();
    if (sub === 'soustraitants') return renderSoustraitants();
    if (sub === 'materiaux')     return renderMateriaux();
    if (sub === 'materiel')      return renderMateriel();
    return '';
  }
  function afterRessources() {
    document.querySelectorAll('.subtab').forEach(b => {
      b.addEventListener('click', () => {
        state.ui.ressourcesSubTab = b.dataset.sub;
        saveState();
        render();
      });
    });
    const sub = state.ui.ressourcesSubTab;
    if (sub === 'apercu')        wireApercu();
    if (sub === 'pointage')      wirePointage();
    if (sub === 'calendrier')    wireCalendrier();
    if (sub === 'soustraitants') wireSoustraitants();
    if (sub === 'materiaux')     wireMateriaux();
    if (sub === 'materiel')      wireMateriel();
  }

  // ── Aperçu ouvriers ───────────────────────────────────────────
  function renderApercu() {
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Ouvriers</h1>
          <div class="page-subtitle">${state.workers.length} ouvriers · annuaire</div>
        </div>
        <button class="btn btn-primary" id="worker-add">+ Ouvrier</button>
      </div>
      <div class="card" style="padding:0">
        <table class="table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Rôle</th>
              <th class="text-right">Taux/jour</th>
              <th>Disponibilité</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${state.workers.map(w => `
              <tr>
                <td><strong>${escapeHtml(w.name)}</strong></td>
                <td>${escapeHtml(w.role)}</td>
                <td class="text-right num">${fmtMAD(w.rate)}</td>
                <td><span class="badge ${w.avail === 'disponible' ? 'badge-success' : 'badge-muted'}">${escapeHtml(w.avail || 'disponible')}</span></td>
                <td class="text-right">
                  <button class="btn btn-ghost btn-sm" data-worker-edit="${w.id}">Modifier</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
  function wireApercu() {
    document.getElementById('worker-add').addEventListener('click', () => openWorkerModal(null));
    document.querySelectorAll('[data-worker-edit]').forEach(b => {
      b.addEventListener('click', () => openWorkerModal(b.dataset.workerEdit));
    });
  }

  // ── Calendrier ──────────────────────────────────────────────────
  function calendrierRange() {
    const view = state.ui.calendrierView || 'week';
    const anchor = state.ui.calendrierAnchor || new Date().toISOString().slice(0, 10);
    if (view === 'month') {
      return { startISO: W.startOfMonthISO(anchor), endISO: W.endOfMonthISO(anchor), view };
    }
    const monday = W.startOfWeekISO(anchor);
    const sunday = G.dateToISO(G.addDays(monday, 6));
    return { startISO: monday, endISO: sunday, view };
  }

  function buildRangeStrip(view, stripAnchorISO, activeISO, span) {
    const half = Math.floor(span / 2);
    const tiles = [];
    // Pre-compute keys for O(1) hasData lookup
    const monthSet = new Set();
    const weekStartSet = new Set();
    for (const p of state.pointages) {
      monthSet.add(p.date.slice(0, 7));
      weekStartSet.add(W.startOfWeekISO(p.date));
    }
    if (view === 'month') {
      const base = new Date(stripAnchorISO);
      base.setDate(1);
      const activeMonthStart = W.startOfMonthISO(activeISO);
      for (let i = -half; i <= half; i++) {
        const d = new Date(base);
        d.setMonth(d.getMonth() + i);
        const iso = d.toISOString().slice(0, 10);
        const monthStart = W.startOfMonthISO(iso);
        tiles.push({
          iso: monthStart,
          label: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''),
          year: d.getFullYear(),
          active: monthStart === activeMonthStart,
          hasData: monthSet.has(monthStart.slice(0, 7))
        });
      }
    } else {
      const stripMonday = W.startOfWeekISO(stripAnchorISO);
      const activeMonday = W.startOfWeekISO(activeISO);
      const baseMon = new Date(stripMonday);
      for (let i = -half; i <= half; i++) {
        const d = new Date(baseMon);
        d.setDate(d.getDate() + i * 7);
        const iso = d.toISOString().slice(0, 10);
        const sundayISO = G.dateToISO(G.addDays(iso, 6));
        const start = new Date(iso), end = new Date(sundayISO);
        let label;
        if (start.getMonth() === end.getMonth()) {
          label = `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}`;
        } else {
          label = `${start.getDate()} ${start.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')} – ${end.getDate()} ${end.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}`;
        }
        tiles.push({
          iso,
          label,
          year: start.getFullYear(),
          active: iso === activeMonday,
          hasData: weekStartSet.has(iso)
        });
      }
    }
    return tiles;
  }

  function renderCalendrier() {
    const { startISO, endISO, view } = calendrierRange();
    const range = W.buildCalendarRange(startISO, endISO);
    const cells = W.buildWorkerCells(state.workers, state.pointages, range);
    const isMonth = view === 'month';
    const cellCls = isMonth ? 'calendar-cell month-view' : 'calendar-cell';
    const dayCls  = isMonth ? 'calendar-day-col month-view' : 'calendar-day-col';
    const cellSym = { present: '✓', absent: '✕', none: '—' };
    const dowShort = ['dim','lun','mar','mer','jeu','ven','sam'];

    const headRow = `
      <tr>
        <th class="calendar-worker-col">Ouvrier</th>
        ${range.map(d => {
          const date = new Date(d.dateISO);
          return `<th class="${dayCls} ${d.isToday ? 'today' : ''}">
            ${date.getDate()}${isMonth ? '' : `<span class="dow">${dowShort[d.dayOfWeek]}</span>`}
          </th>`;
        }).join('')}
        <th class="calendar-row-total">Coût par ouvrier</th>
      </tr>
    `;

    const bodyRows = state.workers.map(w => {
      const arr = cells.get(w.id) || [];
      const workerCost = W.workerTotalCost(state.pointages, w);
      return `
        <tr class="calendar-row" data-worker-id="${w.id}">
          <td class="calendar-worker-col">${escapeHtml(w.name)}</td>
          ${arr.map(c => {
            const titleParts = [escapeHtml(w.name), fmtDate(c.dateISO)];
            if (c.task_ids?.length) {
              const taskNames = c.task_ids.map(tid => state.ganttTasks.find(t => t.id === tid)?.name).filter(Boolean);
              if (taskNames.length) titleParts.push('tâches: ' + taskNames.join(', '));
            }
            if (c.bonus) titleParts.push(`bonus ${c.bonus} DH`);
            const title = titleParts.join(' · ');
            return `<td class="${cellCls} ${c.status}" data-date="${c.dateISO}" data-worker="${w.id}" title="${title}">
              ${isMonth ? '' : (cellSym[c.status] || '')}
            </td>`;
          }).join('')}
          <td class="calendar-row-total">
            <div class="calendar-total-cost num">${fmtMAD(workerCost)}</div>
          </td>
        </tr>
      `;
    }).join('');

    const totalRow = `
      <tr class="calendar-total-row">
        <td class="calendar-worker-col">Coût par jour</td>
        ${range.map(d => {
          const dayCost = W.columnDayCost(state.workers, state.pointages, d.dateISO);
          if (dayCost <= 0) {
            return `<td class="calendar-col-total"><div class="calendar-total-cost num">—</div></td>`;
          }
          const num = new Intl.NumberFormat('fr-FR').format(Math.round(dayCost));
          return `<td class="calendar-col-total" title="${fmtMAD(dayCost)}">
            ${isMonth
              ? `<div class="calendar-total-cost num"><span class="cost-num">${num}</span><span class="cost-unit">DH</span></div>`
              : `<div class="calendar-total-cost num">${fmtMAD(dayCost)}</div>`}
          </td>`;
        }).join('')}
        <td></td>
      </tr>
    `;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Calendrier</h1>
          <div class="page-subtitle">Présences ${view === 'month' ? 'du mois' : 'de la semaine'} · cliquez sur une case pour ouvrir le pointage</div>
        </div>
        <div class="flex gap-2 items-center">
          <div class="view-toggle">
            <button class="${view==='week'?'active':''}" id="cal-week">Semaine</button>
            <button class="${view==='month'?'active':''}" id="cal-month">Mois</button>
          </div>
        </div>
      </div>

      <div class="card mb-3">
        <div class="date-strip-wrap">
          <button class="btn btn-sm date-strip-chevron" id="cal-prev" aria-label="${view === 'month' ? 'Mois précédent' : 'Semaine précédente'}">‹</button>
          <div class="date-strip" id="cal-strip">
            ${buildRangeStrip(view, _calendrierStripAnchor || state.ui.calendrierAnchor || new Date().toISOString().slice(0, 10), state.ui.calendrierAnchor || new Date().toISOString().slice(0, 10), view === 'month' ? CAL_MONTH_STRIP_SPAN : CAL_WEEK_STRIP_SPAN).map(t => `
              <button type="button" class="date-tile range-tile ${t.active ? 'active' : ''} ${t.hasData ? 'has-data' : ''}" data-range-tile="${t.iso}">
                <span class="date-tile-label">${escapeHtml(t.label)}</span>
                <span class="date-tile-month">${t.year}</span>
              </button>
            `).join('')}
          </div>
          <button class="btn btn-sm date-strip-chevron" id="cal-next" aria-label="${view === 'month' ? 'Mois suivant' : 'Semaine suivante'}">›</button>
          <button class="btn btn-sm" id="cal-today" title="Revenir à aujourd'hui">Aujourd'hui</button>
        </div>
      </div>

      <div class="calendar-wrap">
        <table class="calendar-table ${isMonth ? 'month-view' : ''}">
          <thead>${headRow}</thead>
          <tbody>${bodyRows}</tbody>
          <tfoot>${totalRow}</tfoot>
        </table>
      </div>
    `;
  }

  function wireCalendrier() {
    function rerender() {
      const oldStrip = document.getElementById('cal-strip');
      if (oldStrip) _calendrierScrollPos = oldStrip.scrollLeft;
      document.getElementById('ressources-body').innerHTML = renderCalendrier();
      wireCalendrier();
    }

    const currentView = state.ui.calendrierView || 'week';
    // Reset strip anchor when view toggles (week ↔ month tile shapes differ)
    if (_calendrierStripView !== currentView) {
      _calendrierStripView = currentView;
      _calendrierStripAnchor = state.ui.calendrierAnchor || new Date().toISOString().slice(0, 10);
      _firstCalendrierStripRender = true;
    }
    if (_calendrierStripAnchor == null) {
      _calendrierStripAnchor = state.ui.calendrierAnchor || new Date().toISOString().slice(0, 10);
    }

    document.getElementById('cal-week').addEventListener('click', () => {
      state.ui.calendrierView = 'week';
      saveState(); rerender();
    });
    document.getElementById('cal-month').addEventListener('click', () => {
      state.ui.calendrierView = 'month';
      saveState(); rerender();
    });

    const view = state.ui.calendrierView || 'week';
    const anchor = state.ui.calendrierAnchor || new Date().toISOString().slice(0, 10);

    function maybeShiftCalStripAnchor(newAnchorISO) {
      if (!_calendrierStripAnchor) return;
      const isMonth = (state.ui.calendrierView || 'week') === 'month';
      const half = Math.floor((isMonth ? CAL_MONTH_STRIP_SPAN : CAL_WEEK_STRIP_SPAN) / 2);
      const a = new Date(_calendrierStripAnchor);
      const b = new Date(newAnchorISO);
      const diff = isMonth
        ? (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
        : Math.round((b - a) / 86400000 / 7);
      if (Math.abs(diff) > half) {
        _calendrierStripAnchor = newAnchorISO;
        _firstCalendrierStripRender = true;
      }
    }
    document.getElementById('cal-prev').addEventListener('click', () => {
      const d = new Date(anchor);
      if (view === 'month') d.setMonth(d.getMonth() - 1);
      else d.setDate(d.getDate() - 7);
      const newAnchor = d.toISOString().slice(0, 10);
      state.ui.calendrierAnchor = newAnchor;
      maybeShiftCalStripAnchor(newAnchor);
      saveState(); rerender();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      const d = new Date(anchor);
      if (view === 'month') d.setMonth(d.getMonth() + 1);
      else d.setDate(d.getDate() + 7);
      const newAnchor = d.toISOString().slice(0, 10);
      state.ui.calendrierAnchor = newAnchor;
      maybeShiftCalStripAnchor(newAnchor);
      saveState(); rerender();
    });
    document.getElementById('cal-today').addEventListener('click', () => {
      const todayISO = new Date().toISOString().slice(0, 10);
      state.ui.calendrierAnchor = todayISO;
      _calendrierStripAnchor = todayISO;
      _firstCalendrierStripRender = true;
      saveState(); rerender();
    });

    document.querySelectorAll('[data-range-tile]').forEach(t => {
      t.addEventListener('click', () => {
        state.ui.calendrierAnchor = t.dataset.rangeTile;
        maybeShiftCalStripAnchor(t.dataset.rangeTile);
        saveState(); rerender();
      });
    });
    const calStripEl = document.getElementById('cal-strip');
    if (calStripEl) {
      void calStripEl.scrollWidth;
      if (!_firstCalendrierStripRender) {
        calStripEl.scrollLeft = _calendrierScrollPos;
      } else {
        const active = calStripEl.querySelector('.date-tile.active');
        if (active) {
          calStripEl.scrollLeft = active.offsetLeft - (calStripEl.clientWidth - active.offsetWidth) / 2;
        }
        _firstCalendrierStripRender = false;
        _calendrierScrollPos = calStripEl.scrollLeft;
      }
      attachStripDragPan(calStripEl);
    }

    // Click a cell → jump to Pointage for that date
    document.querySelectorAll('.calendar-cell[data-date]').forEach(td => {
      td.addEventListener('click', () => {
        state.ui.pointageDate = td.dataset.date;
        state.ui.ressourcesSubTab = 'pointage';
        saveState();
        render();
      });
    });
  }

  function openWorkerModal(id) {
    const isNew = !id;
    const w = isNew ? { id: '', name: '', role: '', skill: 'Confirmé', rate: 200, avail: 'disponible' } : state.workers.find(x => x.id === id);
    if (!w) return;
    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal">
          <h3 class="modal-title">${isNew ? 'Nouvel ouvrier' : 'Modifier ouvrier'}</h3>
          <div class="grid" style="gap:12px">
            <label class="field">Nom <input class="input" id="w-name" value="${escapeHtml(w.name)}"/></label>
            <div class="grid grid-2">
              <label class="field">Rôle <input class="input" id="w-role" value="${escapeHtml(w.role)}"/></label>
              <label class="field">Niveau
                <select class="select" id="w-skill">
                  <option ${w.skill==='Débutant'?'selected':''}>Débutant</option>
                  <option ${w.skill==='Confirmé'?'selected':''}>Confirmé</option>
                  <option ${w.skill==='Expert'?'selected':''}>Expert</option>
                </select>
              </label>
            </div>
            <label class="field">Taux journalier (DH)
              <input type="number" min="0" class="input" id="w-rate" value="${w.rate}"/>
            </label>
          </div>
          <div class="modal-actions">
            ${!isNew ? '<button class="btn btn-danger" id="w-delete">Supprimer</button>' : ''}
            <button class="btn" id="w-cancel">Annuler</button>
            <button class="btn btn-primary" id="w-save">Enregistrer</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const bd = document.getElementById('modal-bd');
    document.getElementById('w-cancel').addEventListener('click', () => bd.remove());
    document.getElementById('w-save').addEventListener('click', () => {
      const name = document.getElementById('w-name').value.trim();
      if (!name) return;
      const role = document.getElementById('w-role').value.trim();
      const skill = document.getElementById('w-skill').value;
      const rate = parseFloat(document.getElementById('w-rate').value) || 0;
      if (isNew) state.workers.push({ id: uid(), name, role, skill, rate, avail: 'disponible' });
      else Object.assign(w, { name, role, skill, rate });
      saveState(); bd.remove(); render();
    });
    if (!isNew) {
      document.getElementById('w-delete').addEventListener('click', async () => {
        const ok = await window.Modal.confirm({
          title: 'Supprimer cet ouvrier',
          message: `${w.name} ainsi que tous ses pointages seront définitivement supprimés.`,
          confirmLabel: 'Supprimer'
        });
        if (!ok) return;
        state.workers = state.workers.filter(x => x.id !== w.id);
        state.pointages = state.pointages.filter(p => p.worker_id !== w.id);
        saveState(); bd.remove(); render();
        window.Toast && window.Toast.success('Ouvrier supprimé');
      });
    }
  }

  // ── Sous-traitants ───────────────────────────────────────────
  function renderSoustraitants() {
    const subs = state.soustraitants || [];
    const statusLabel = { unpaid: 'Impayé', partial: 'Partiel', paid: 'Payé' };
    const statusClass = { unpaid: 'badge-muted', partial: 'badge-warn', paid: 'badge-success' };
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Sous-traitants</h1>
          <div class="page-subtitle">${subs.length} sous-traitants · forfaits & paiements</div>
        </div>
        <button class="btn btn-primary" id="sub-add">+ Sous-traitant</button>
      </div>
      ${subs.length === 0 ? `
        <div class="card empty-state">
          <div class="empty-state-title">Aucun sous-traitant pour l'instant</div>
          <div>Ajoutez-en un avec le bouton + Sous-traitant.</div>
        </div>
      ` : `
      <div class="card" style="padding:0">
        <table class="table">
          <thead>
            <tr>
              <th>Nom</th><th>Spécialité</th>
              <th class="text-right">Forfait</th>
              <th class="text-right">Payé</th>
              <th class="text-right">Reste</th>
              <th>Statut</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${subs.map(s => {
              const paid = W.subPaid(s);
              const remaining = W.subRemaining(s);
              const status = W.subStatus(s);
              return `
                <tr>
                  <td><strong>${escapeHtml(s.name)}</strong></td>
                  <td>${escapeHtml(s.specialite || '')}</td>
                  <td class="text-right num">${fmtMAD(s.forfait || 0)}</td>
                  <td class="text-right num">${fmtMAD(paid)}</td>
                  <td class="text-right num"><strong>${fmtMAD(remaining)}</strong></td>
                  <td><span class="badge ${statusClass[status]}">${statusLabel[status]}</span></td>
                  <td class="text-right">
                    <button class="btn btn-ghost btn-sm" data-sub-edit="${s.id}">Modifier</button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      `}
    `;
  }

  function wireSoustraitants() {
    const addBtn = document.getElementById('sub-add');
    if (addBtn) addBtn.addEventListener('click', () => openSousTraitantModal(null));
    document.querySelectorAll('[data-sub-edit]').forEach(b => {
      b.addEventListener('click', () => openSousTraitantModal(b.dataset.subEdit));
    });
  }

  function openSousTraitantModal(id) {
    const isNew = !id;
    const s = isNew
      ? { id: '', name: '', specialite: '', forfait: 0, payments: [] }
      : state.soustraitants.find(x => x.id === id);
    if (!s) return;
    // Local mutable copy of payments so cancel really cancels
    let payments = (s.payments || []).map(p => ({ ...p }));

    function renderPaymentsList() {
      if (payments.length === 0) {
        return '<div class="muted text-sm" style="padding:8px 0">Aucun paiement enregistré.</div>';
      }
      return payments.map(p => `
        <div class="payment-row" data-pay-id="${p.id}">
          <span class="muted text-sm">${fmtDate(p.date)}</span>
          <span class="num"><strong>${fmtMAD(p.amount)}</strong></span>
          <span class="text-sm">${escapeHtml(p.note || '')}</span>
          <button class="btn btn-ghost btn-sm" data-pay-del="${p.id}" title="Supprimer ce paiement">✕</button>
        </div>
      `).join('');
    }

    function paymentsSummary() {
      const total = payments.reduce((a, p) => a + (p.amount || 0), 0);
      const forf = parseFloat(document.getElementById('s-forfait')?.value || s.forfait || 0);
      const reste = Math.max(0, forf - total);
      return `<div>Payé : <strong>${fmtMAD(total)}</strong></div><div>Reste : <strong>${fmtMAD(reste)}</strong></div>`;
    }

    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal">
          <h3 class="modal-title">${isNew ? 'Nouveau sous-traitant' : 'Modifier sous-traitant'}</h3>
          <div class="grid" style="gap:12px">
            <label class="field">Nom <input class="input" id="s-name" value="${escapeHtml(s.name)}"/></label>
            <div class="grid grid-2">
              <label class="field">Spécialité <input class="input" id="s-specialite" value="${escapeHtml(s.specialite || '')}"/></label>
              <label class="field">Forfait (DH)
                <input type="number" min="0" class="input" id="s-forfait" value="${s.forfait || 0}"/>
              </label>
            </div>
            ${isNew ? '' : `
              <div class="payments-section">
                <div class="payments-section-title">Paiements</div>
                <div id="pay-list">${renderPaymentsList()}</div>
                <div class="payment-row" style="margin-top:8px">
                  <input type="date" class="input" id="pay-date" value="${new Date().toISOString().slice(0,10)}"/>
                  <input type="number" min="0" class="input" id="pay-amount" placeholder="Montant"/>
                  <input class="input" id="pay-note" placeholder="Note (acompte, avance…)"/>
                  <button class="btn btn-primary btn-sm" id="pay-add" title="Ajouter ce paiement">+</button>
                </div>
                <div class="payment-summary" id="pay-summary">${paymentsSummary()}</div>
              </div>
            `}
          </div>
          <div class="modal-actions">
            ${!isNew ? '<button class="btn btn-danger" id="s-delete">Supprimer</button>' : ''}
            <button class="btn" id="s-cancel">Annuler</button>
            <button class="btn btn-primary" id="s-save">Enregistrer</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const bd = document.getElementById('modal-bd');
    document.getElementById('s-cancel').addEventListener('click', () => bd.remove());

    function refreshPayments() {
      document.getElementById('pay-list').innerHTML = renderPaymentsList();
      document.getElementById('pay-summary').innerHTML = paymentsSummary();
      wirePayDelete();
    }
    function wirePayDelete() {
      document.querySelectorAll('[data-pay-del]').forEach(b => {
        b.addEventListener('click', () => {
          payments = payments.filter(p => p.id !== b.dataset.payDel);
          refreshPayments();
        });
      });
    }

    if (!isNew) {
      // Live-update reste/payé when forfait changes
      document.getElementById('s-forfait').addEventListener('input', () => {
        document.getElementById('pay-summary').innerHTML = paymentsSummary();
      });
      document.getElementById('pay-add').addEventListener('click', () => {
        const date = document.getElementById('pay-date').value;
        const amount = parseFloat(document.getElementById('pay-amount').value);
        const note = document.getElementById('pay-note').value.trim();
        if (!date || isNaN(amount) || amount <= 0) return;
        payments.push({ id: uid(), date, amount, note });
        document.getElementById('pay-amount').value = '';
        document.getElementById('pay-note').value = '';
        refreshPayments();
      });
      wirePayDelete();
    }

    document.getElementById('s-save').addEventListener('click', () => {
      const name = document.getElementById('s-name').value.trim();
      if (!name) return;
      const specialite = document.getElementById('s-specialite').value.trim();
      const forfait = parseFloat(document.getElementById('s-forfait').value) || 0;
      if (isNew) {
        state.soustraitants.push({ id: uid(), name, specialite, forfait, payments: [] });
      } else {
        Object.assign(s, { name, specialite, forfait, payments });
      }
      saveState(); bd.remove(); render();
    });

    if (!isNew) {
      document.getElementById('s-delete').addEventListener('click', async () => {
        const ok = await window.Modal.confirm({
          title: 'Supprimer ce sous-traitant',
          message: `${s.name} sera définitivement supprimé.`,
          confirmLabel: 'Supprimer'
        });
        if (!ok) return;
        state.soustraitants = state.soustraitants.filter(x => x.id !== s.id);
        saveState(); bd.remove(); render();
        window.Toast && window.Toast.success('Sous-traitant supprimé');
      });
    }
  }

  // ── Matériaux (consommables) ──────────────────────────────────
  const MATERIAL_CATEGORIES = [
    { value: 'beton',     label: 'Béton' },
    { value: 'acier',     label: 'Acier' },
    { value: 'mortier',   label: 'Mortier' },
    { value: 'brique',    label: 'Brique' },
    { value: 'carrelage', label: 'Carrelage' },
    { value: 'peinture',  label: 'Peinture' },
    { value: 'autre',     label: 'Autre' }
  ];
  const MATERIAL_UNITS = ['m³', 'kg', 'sac', 'unité', 'L', 'm²', 'tonne'];

  function categoryLabel(v) {
    return (MATERIAL_CATEGORIES.find(c => c.value === v) || { label: '—' }).label;
  }

  function renderMateriaux() {
    const mats = state.materials || [];
    const total = Mat.materialsTotalForProject(mats);
    const tasks = state.ganttTasks || [];
    const sorted = [...mats].sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Matériaux</h1>
          <div class="page-subtitle">${mats.length} entrées · total ${fmtMAD(total)}</div>
        </div>
        <button class="btn btn-primary" id="mat-add">+ Matériau</button>
      </div>
      ${mats.length === 0 ? `
        <div class="card empty-state">
          <div class="empty-state-title">Aucun matériau enregistré</div>
          <div>Ajoutez-en un avec le bouton + Matériau.</div>
        </div>
      ` : `
      <div class="card" style="padding:0">
        <table class="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Nom</th>
              <th>Catégorie</th>
              <th class="text-right">Qté</th>
              <th>Unité</th>
              <th class="text-right">Prix unit.</th>
              <th class="text-right">Coût</th>
              <th>Tâche</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(m => {
              const t = tasks.find(x => x.id === m.task_id);
              return `
                <tr>
                  <td class="text-sm muted">${m.date ? fmtDate(m.date) : '—'}</td>
                  <td><strong>${escapeHtml(m.name)}</strong>${m.supplier ? `<div class="text-sm muted">${escapeHtml(m.supplier)}</div>` : ''}</td>
                  <td><span class="badge badge-muted">${categoryLabel(m.category)}</span></td>
                  <td class="text-right num">${m.qty ?? '—'}</td>
                  <td class="text-sm">${escapeHtml(m.unit || '—')}</td>
                  <td class="text-right num">${m.unit_price != null ? fmtMAD(m.unit_price) : '—'}</td>
                  <td class="text-right num"><strong>${fmtMAD(Mat.materialTotalCost(m))}</strong></td>
                  <td class="text-sm muted">${escapeHtml(t?.name || '—')}</td>
                  <td class="text-right"><button class="btn btn-ghost btn-sm" data-mat-edit="${m.id}">Modifier</button></td>
                </tr>
              `;
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="6" class="text-right"><strong>Total</strong></td>
              <td class="text-right num"><strong>${fmtMAD(total)}</strong></td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>
      `}
    `;
  }

  function wireMateriaux() {
    const add = document.getElementById('mat-add');
    if (add) add.addEventListener('click', () => openMaterialModal(null));
    document.querySelectorAll('[data-mat-edit]').forEach(b => {
      b.addEventListener('click', () => openMaterialModal(b.dataset.matEdit));
    });
  }

  function openMaterialModal(id) {
    const isNew = !id;
    const today = new Date().toISOString().slice(0, 10);
    const m = isNew
      ? { id: '', project_id: null, date: today, name: '', category: 'autre', qty: 0, unit: 'unité', unit_price: 0, cost: 0, task_id: null, supplier: '', note: '' }
      : state.materials.find(x => x.id === id);
    if (!m) return;

    const tasks = (state.ganttTasks || []).filter(t => !state.ganttTasks.some(c => c.parent_id === t.id));

    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal">
          <h3 class="modal-title">${isNew ? 'Nouveau matériau' : 'Modifier matériau'}</h3>
          <div class="grid" style="gap:12px">
            <div class="grid grid-2">
              <label class="field">Date
                <input type="date" class="input" id="m-date" value="${m.date || today}"/>
              </label>
              <label class="field">Catégorie
                <select class="select" id="m-category">
                  ${MATERIAL_CATEGORIES.map(c => `<option value="${c.value}" ${m.category===c.value?'selected':''}>${c.label}</option>`).join('')}
                </select>
              </label>
            </div>
            <label class="field">Nom
              <input class="input" id="m-name" placeholder="ex: Béton B25" value="${escapeHtml(m.name)}"/>
            </label>
            <div class="grid grid-3">
              <label class="field">Quantité
                <input type="number" min="0" step="any" class="input" id="m-qty" value="${m.qty ?? 0}"/>
              </label>
              <label class="field">Unité
                <select class="select" id="m-unit">
                  ${MATERIAL_UNITS.map(u => `<option ${m.unit===u?'selected':''}>${u}</option>`).join('')}
                </select>
              </label>
              <label class="field">Prix unitaire (DH)
                <input type="number" min="0" step="any" class="input" id="m-unit-price" value="${m.unit_price ?? 0}"/>
              </label>
            </div>
            <div class="grid grid-2">
              <label class="field">Coût total (DH)
                <input type="number" min="0" step="any" class="input" id="m-cost" value="${Math.round(Mat.materialTotalCost(m))}" readonly/>
              </label>
              <label class="field">Tâche associée
                <select class="select" id="m-task">
                  <option value="">— Aucune —</option>
                  ${tasks.map(t => `<option value="${t.id}" ${m.task_id===t.id?'selected':''}>${escapeHtml(t.name)}</option>`).join('')}
                </select>
              </label>
            </div>
            <label class="field">Fournisseur
              <input class="input" id="m-supplier" placeholder="ex: Cimenterie Atlas" value="${escapeHtml(m.supplier || '')}"/>
            </label>
            <label class="field">Note
              <input class="input" id="m-note" value="${escapeHtml(m.note || '')}"/>
            </label>
          </div>
          <div class="modal-actions">
            ${!isNew ? '<button class="btn btn-danger" id="m-delete">Supprimer</button>' : ''}
            <button class="btn" id="m-cancel">Annuler</button>
            <button class="btn btn-primary" id="m-save">Enregistrer</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const bd = document.getElementById('modal-bd');

    function recomputeCost() {
      const qty = parseFloat(document.getElementById('m-qty').value) || 0;
      const up = parseFloat(document.getElementById('m-unit-price').value) || 0;
      document.getElementById('m-cost').value = Math.round(Math.max(0, qty) * up);
    }
    document.getElementById('m-qty').addEventListener('input', recomputeCost);
    document.getElementById('m-unit-price').addEventListener('input', recomputeCost);

    document.getElementById('m-cancel').addEventListener('click', () => bd.remove());
    document.getElementById('m-save').addEventListener('click', () => {
      const name = document.getElementById('m-name').value.trim();
      if (!name) return;
      const payload = {
        date: document.getElementById('m-date').value || today,
        name,
        category: document.getElementById('m-category').value,
        qty: parseFloat(document.getElementById('m-qty').value) || 0,
        unit: document.getElementById('m-unit').value,
        unit_price: parseFloat(document.getElementById('m-unit-price').value) || 0,
        task_id: document.getElementById('m-task').value || null,
        supplier: document.getElementById('m-supplier').value.trim(),
        note: document.getElementById('m-note').value.trim()
      };
      payload.cost = Math.max(0, payload.qty) * payload.unit_price;
      if (isNew) state.materials.push({ id: uid(), project_id: null, ...payload });
      else Object.assign(m, payload);
      saveState(); bd.remove(); render();
    });
    if (!isNew) {
      document.getElementById('m-delete').addEventListener('click', async () => {
        const ok = await window.Modal.confirm({
          title: 'Supprimer ce matériau',
          message: `« ${m.name} » sera définitivement supprimé.`,
          confirmLabel: 'Supprimer'
        });
        if (!ok) return;
        state.materials = state.materials.filter(x => x.id !== m.id);
        saveState(); bd.remove(); render();
        window.Toast && window.Toast.success('Matériau supprimé');
      });
    }
  }

  // ── Matériel (équipement) ─────────────────────────────────────
  const EQUIPMENT_CATEGORIES = [
    { value: 'engin',       label: 'Engin' },
    { value: 'outillage',   label: 'Outillage' },
    { value: 'echafaudage', label: 'Échafaudage' },
    { value: 'vehicule',    label: 'Véhicule' },
    { value: 'autre',       label: 'Autre' }
  ];

  function equipCategoryLabel(v) {
    return (EQUIPMENT_CATEGORIES.find(c => c.value === v) || { label: '—' }).label;
  }

  function renderMateriel() {
    const list = state.equipment || [];
    const parts = Eq.partitionByKind(list);
    const total = Eq.equipmentTotalForProject(list);
    const tasks = state.ganttTasks || [];

    function rentalRow(e) {
      const days = Eq.daysActive(e.start_date, e.end_date);
      const t = tasks.find(x => x.id === e.task_id);
      return `
        <tr>
          <td><strong>${escapeHtml(e.name)}</strong>${e.supplier ? `<div class="text-sm muted">${escapeHtml(e.supplier)}</div>` : ''}</td>
          <td><span class="badge badge-muted">${equipCategoryLabel(e.category)}</span></td>
          <td class="text-right num">${fmtMAD(e.daily_rate || 0)}/j</td>
          <td class="text-sm">${e.start_date ? fmtDate(e.start_date) : '—'} → ${e.end_date ? fmtDate(e.end_date) : '—'}</td>
          <td class="text-right num">${days}</td>
          <td class="text-right num"><strong>${fmtMAD(Eq.equipmentRentalCost(e))}</strong></td>
          <td class="text-sm muted">${escapeHtml(t?.name || '—')}</td>
          <td class="text-right"><button class="btn btn-ghost btn-sm" data-eq-edit="${e.id}">Modifier</button></td>
        </tr>
      `;
    }

    function ownedRow(e) {
      const pct = typeof e.allocation_pct === 'number' ? e.allocation_pct : 100;
      return `
        <tr>
          <td><strong>${escapeHtml(e.name)}</strong>${e.note ? `<div class="text-sm muted">${escapeHtml(e.note)}</div>` : ''}</td>
          <td><span class="badge badge-muted">${equipCategoryLabel(e.category)}</span></td>
          <td class="text-sm muted">${e.purchase_date ? fmtDate(e.purchase_date) : '—'}</td>
          <td class="text-right num">${fmtMAD(e.purchase_cost || 0)}</td>
          <td class="text-right num">${pct}%</td>
          <td class="text-right num"><strong>${fmtMAD(Eq.equipmentOwnedCost(e))}</strong></td>
          <td class="text-right"><button class="btn btn-ghost btn-sm" data-eq-edit="${e.id}">Modifier</button></td>
        </tr>
      `;
    }

    const rentalSection = parts.location.length === 0 ? '' : `
      <div class="card" style="padding:0">
        <div class="card-header"><div class="card-title">Location — ${parts.location.length} entrée${parts.location.length > 1 ? 's' : ''}</div></div>
        <table class="table">
          <thead>
            <tr>
              <th>Nom</th><th>Catégorie</th>
              <th class="text-right">Tarif/jour</th>
              <th>Période</th>
              <th class="text-right">Jours</th>
              <th class="text-right">Coût total</th>
              <th>Tâche</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${parts.location.map(rentalRow).join('')}</tbody>
        </table>
      </div>
    `;

    const ownedSection = parts.propriete.length === 0 ? '' : `
      <div class="card" style="padding:0; margin-top:16px">
        <div class="card-header"><div class="card-title">Propriété — ${parts.propriete.length} entrée${parts.propriete.length > 1 ? 's' : ''}</div></div>
        <table class="table">
          <thead>
            <tr>
              <th>Nom</th><th>Catégorie</th>
              <th>Date d'achat</th>
              <th class="text-right">Prix d'achat</th>
              <th class="text-right">Allocation</th>
              <th class="text-right">Coût alloué</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${parts.propriete.map(ownedRow).join('')}</tbody>
        </table>
      </div>
    `;

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Matériel</h1>
          <div class="page-subtitle">${list.length} entrées · total ${fmtMAD(total)}</div>
        </div>
        <button class="btn btn-primary" id="eq-add">+ Matériel</button>
      </div>
      ${list.length === 0 ? `
        <div class="card empty-state">
          <div class="empty-state-title">Aucun matériel enregistré</div>
          <div>Ajoutez-en avec le bouton + Matériel.</div>
        </div>
      ` : `${rentalSection}${ownedSection}`}
    `;
  }

  function wireMateriel() {
    const add = document.getElementById('eq-add');
    if (add) add.addEventListener('click', () => openEquipmentModal(null));
    document.querySelectorAll('[data-eq-edit]').forEach(b => {
      b.addEventListener('click', () => openEquipmentModal(b.dataset.eqEdit));
    });
  }

  function openEquipmentModal(id) {
    const isNew = !id;
    const today = new Date().toISOString().slice(0, 10);
    const e = isNew
      ? { id: '', project_id: null, kind: 'location', name: '', category: 'engin', supplier: '', daily_rate: 0, start_date: today, end_date: today, purchase_date: today, purchase_cost: 0, allocation_pct: 100, task_id: null, note: '' }
      : state.equipment.find(x => x.id === id);
    if (!e) return;

    // Local mutable copy so kind toggle doesn't mutate the source until save
    const draft = { ...e };
    if (draft.kind === 'location') {
      if (draft.purchase_date == null) draft.purchase_date = today;
      if (draft.purchase_cost == null) draft.purchase_cost = 0;
      if (draft.allocation_pct == null) draft.allocation_pct = 100;
    } else {
      if (draft.start_date == null) draft.start_date = today;
      if (draft.end_date == null) draft.end_date = today;
      if (draft.daily_rate == null) draft.daily_rate = 0;
    }

    const tasks = (state.ganttTasks || []).filter(t => !state.ganttTasks.some(c => c.parent_id === t.id));

    function rentalFields() {
      const days = Eq.daysActive(draft.start_date, draft.end_date);
      const cost = Eq.equipmentRentalCost(draft);
      return `
        <div class="grid grid-2">
          <label class="field">Date début
            <input type="date" class="input" id="e-start" value="${draft.start_date || today}"/>
          </label>
          <label class="field">Date fin
            <input type="date" class="input" id="e-end" value="${draft.end_date || today}"/>
          </label>
        </div>
        <div class="grid grid-3">
          <label class="field">Tarif/jour (DH)
            <input type="number" min="0" step="any" class="input" id="e-rate" value="${draft.daily_rate ?? 0}"/>
          </label>
          <label class="field">Jours
            <input type="number" class="input" id="e-days" value="${days}" readonly/>
          </label>
          <label class="field">Coût total (DH)
            <input type="number" class="input" id="e-cost" value="${Math.round(cost)}" readonly/>
          </label>
        </div>
      `;
    }

    function ownedFields() {
      const cost = Eq.equipmentOwnedCost(draft);
      return `
        <div class="grid grid-3">
          <label class="field">Date d'achat
            <input type="date" class="input" id="e-pdate" value="${draft.purchase_date || today}"/>
          </label>
          <label class="field">Prix d'achat (DH)
            <input type="number" min="0" step="any" class="input" id="e-pcost" value="${draft.purchase_cost ?? 0}"/>
          </label>
          <label class="field">Allocation (%)
            <input type="number" min="0" max="100" step="1" class="input" id="e-alloc" value="${draft.allocation_pct ?? 100}"/>
          </label>
        </div>
        <label class="field">Coût alloué (DH)
          <input type="number" class="input" id="e-cost" value="${Math.round(cost)}" readonly/>
        </label>
      `;
    }

    function bodyHtml() {
      return `
        <div class="grid" style="gap:12px">
          <div class="grid grid-2">
            <label class="field">Type
              <select class="select" id="e-kind">
                <option value="location"  ${draft.kind==='location'?'selected':''}>Location</option>
                <option value="propriete" ${draft.kind==='propriete'?'selected':''}>Propriété</option>
              </select>
            </label>
            <label class="field">Catégorie
              <select class="select" id="e-category">
                ${EQUIPMENT_CATEGORIES.map(c => `<option value="${c.value}" ${draft.category===c.value?'selected':''}>${c.label}</option>`).join('')}
              </select>
            </label>
          </div>
          <label class="field">Nom
            <input class="input" id="e-name" placeholder="ex: Bétonnière diesel" value="${escapeHtml(draft.name)}"/>
          </label>
          <div id="e-kind-fields">${draft.kind==='location' ? rentalFields() : ownedFields()}</div>
          <div class="grid grid-2">
            <label class="field">Fournisseur
              <input class="input" id="e-supplier" placeholder="ex: Loc Atlas" value="${escapeHtml(draft.supplier || '')}"/>
            </label>
            <label class="field">Tâche associée
              <select class="select" id="e-task">
                <option value="">— Aucune —</option>
                ${tasks.map(t => `<option value="${t.id}" ${draft.task_id===t.id?'selected':''}>${escapeHtml(t.name)}</option>`).join('')}
              </select>
            </label>
          </div>
          <label class="field">Note
            <input class="input" id="e-note" value="${escapeHtml(draft.note || '')}"/>
          </label>
        </div>
      `;
    }

    const html = `
      <div class="modal-backdrop" id="modal-bd">
        <div class="modal">
          <h3 class="modal-title">${isNew ? 'Nouveau matériel' : 'Modifier matériel'}</h3>
          <div id="e-body">${bodyHtml()}</div>
          <div class="modal-actions">
            ${!isNew ? '<button class="btn btn-danger" id="e-delete">Supprimer</button>' : ''}
            <button class="btn" id="e-cancel">Annuler</button>
            <button class="btn btn-primary" id="e-save">Enregistrer</button>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    const bd = document.getElementById('modal-bd');

    function captureDraft() {
      // Pull current values back into the draft so a kind-toggle preserves them
      draft.name     = document.getElementById('e-name').value;
      draft.category = document.getElementById('e-category').value;
      draft.supplier = document.getElementById('e-supplier').value;
      draft.task_id  = document.getElementById('e-task').value || null;
      draft.note     = document.getElementById('e-note').value;
      if (draft.kind === 'location') {
        draft.start_date = document.getElementById('e-start').value;
        draft.end_date   = document.getElementById('e-end').value;
        draft.daily_rate = parseFloat(document.getElementById('e-rate').value) || 0;
      } else {
        draft.purchase_date  = document.getElementById('e-pdate').value;
        draft.purchase_cost  = parseFloat(document.getElementById('e-pcost').value) || 0;
        draft.allocation_pct = parseFloat(document.getElementById('e-alloc').value) || 0;
      }
    }

    function wireFields() {
      if (draft.kind === 'location') {
        const recompute = () => {
          captureDraft();
          document.getElementById('e-days').value = Eq.daysActive(draft.start_date, draft.end_date);
          document.getElementById('e-cost').value = Math.round(Eq.equipmentRentalCost(draft));
        };
        ['e-start', 'e-end', 'e-rate'].forEach(id => document.getElementById(id).addEventListener('input', recompute));
      } else {
        const recompute = () => {
          captureDraft();
          document.getElementById('e-cost').value = Math.round(Eq.equipmentOwnedCost(draft));
        };
        ['e-pdate', 'e-pcost', 'e-alloc'].forEach(id => document.getElementById(id).addEventListener('input', recompute));
      }
    }

    function rerenderKindFields() {
      captureDraft();
      draft.kind = document.getElementById('e-kind').value;
      document.getElementById('e-kind-fields').innerHTML = draft.kind === 'location' ? rentalFields() : ownedFields();
      wireFields();
    }

    document.getElementById('e-kind').addEventListener('change', rerenderKindFields);
    wireFields();

    document.getElementById('e-cancel').addEventListener('click', () => bd.remove());
    document.getElementById('e-save').addEventListener('click', () => {
      captureDraft();
      const name = (draft.name || '').trim();
      if (!name) return;
      const payload = { name, category: draft.category, supplier: (draft.supplier || '').trim(), task_id: draft.task_id || null, note: (draft.note || '').trim(), kind: draft.kind };
      if (draft.kind === 'location') {
        Object.assign(payload, { daily_rate: draft.daily_rate, start_date: draft.start_date, end_date: draft.end_date });
      } else {
        Object.assign(payload, { purchase_date: draft.purchase_date, purchase_cost: draft.purchase_cost, allocation_pct: draft.allocation_pct });
      }
      if (isNew) {
        state.equipment.push({ id: uid(), project_id: null, ...payload });
      } else {
        // Strip the *other* kind's fields so an item that flipped kinds is clean
        const keep = { id: e.id, project_id: e.project_id, ...payload };
        const idx = state.equipment.findIndex(x => x.id === e.id);
        if (idx >= 0) state.equipment[idx] = keep;
      }
      saveState(); bd.remove(); render();
    });
    if (!isNew) {
      document.getElementById('e-delete').addEventListener('click', async () => {
        const ok = await window.Modal.confirm({
          title: 'Supprimer cet équipement',
          message: `« ${e.name} » sera définitivement supprimé.`,
          confirmLabel: 'Supprimer'
        });
        if (!ok) return;
        state.equipment = state.equipment.filter(x => x.id !== e.id);
        saveState(); bd.remove(); render();
        window.Toast && window.Toast.success('Équipement supprimé');
      });
    }
  }

  // ── Pointage ──────────────────────────────────────────────────
  function renderSelectedTaskChips(taskIds, workerId) {
    if (!taskIds || taskIds.length === 0) return '';
    return taskIds.map(tid => {
      const t = state.ganttTasks.find(x => x.id === tid);
      if (!t) return '';
      return `<span class="task-chip-selected" data-task-remove="${t.id}" data-worker="${workerId}" title="Retirer ${escapeHtml(t.name)}">
        ${escapeHtml(t.name)}<span class="x">×</span>
      </span>`;
    }).join('');
  }

  // Drag-to-pan for any horizontally scrollable date strip.
  // The `dragging` class (and its pointer-events lockdown) only kicks in once
  // actual movement is detected, so plain tile clicks still work normally.
  function attachStripDragPan(strip) {
    let drag = null;
    strip.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      drag = { startX: e.clientX, startScroll: strip.scrollLeft, moved: false };
    });
    function onMove(e) {
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      if (!drag.moved && Math.abs(dx) > 3) {
        drag.moved = true;
        strip.classList.add('dragging');
      }
      if (drag.moved) {
        strip.scrollLeft = drag.startScroll - dx;
        e.preventDefault();
      }
    }
    function onUp() {
      if (!drag) return;
      const moved = drag.moved;
      strip.classList.remove('dragging');
      drag = null;
      if (moved) {
        // Swallow the synthetic click so we don't accidentally select a tile.
        const swallow = (e) => { e.stopPropagation(); e.preventDefault(); };
        strip.addEventListener('click', swallow, { capture: true, once: true });
        // If we dragged to either edge, extend the anchor in that direction so
        // the user can keep navigating further without snapping back.
        maybeExtendStripAtEdge(strip);
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // When drag-pan ends at (or near) a scroll edge, shift the strip anchor by
  // half a span and re-render so more tiles appear in that direction. Visible
  // tiles are kept stable by adjusting scrollLeft to compensate for the shift.
  function maybeExtendStripAtEdge(strip) {
    const max = strip.scrollWidth - strip.clientWidth;
    if (max <= 0) return;
    const EDGE = 24;
    let side = 0;
    if (strip.scrollLeft <= EDGE) side = -1;
    else if (strip.scrollLeft >= max - EDGE) side = +1;
    if (!side) return;

    const firstTile = strip.querySelector('.date-tile');
    if (!firstTile) return;
    const tileBox = firstTile.getBoundingClientRect();
    const tilePitch = tileBox.width + 4; // matches the gap in .date-strip

    if (strip.id === 'date-strip' && _pointageStripAnchor) {
      const shiftDays = side * Math.floor(POINTAGE_STRIP_SPAN / 2);
      const d = new Date(_pointageStripAnchor);
      d.setDate(d.getDate() + shiftDays);
      _pointageStripAnchor = d.toISOString().slice(0, 10);
      _pointageScrollPos = strip.scrollLeft - shiftDays * tilePitch;
      _firstPointageStripRender = false;
      const body = document.getElementById('ressources-body');
      body.innerHTML = renderPointage();
      wirePointage();
    } else if (strip.id === 'cal-strip' && _calendrierStripAnchor) {
      const isMonth = (state.ui.calendrierView || 'week') === 'month';
      const halfSpan = Math.floor((isMonth ? CAL_MONTH_STRIP_SPAN : CAL_WEEK_STRIP_SPAN) / 2);
      const d = new Date(_calendrierStripAnchor);
      if (isMonth) d.setMonth(d.getMonth() + side * halfSpan);
      else d.setDate(d.getDate() + side * halfSpan * 7);
      _calendrierStripAnchor = d.toISOString().slice(0, 10);
      _calendrierScrollPos = strip.scrollLeft - side * halfSpan * tilePitch;
      _firstCalendrierStripRender = false;
      const body = document.getElementById('ressources-body');
      body.innerHTML = renderCalendrier();
      wireCalendrier();
    }
  }

  function buildDayStrip(centerISO, activeISO, span = 31) {
    const half = Math.floor(span / 2);
    const todayISO = new Date().toISOString().slice(0, 10);
    const dateSet = new Set(state.pointages.map(p => p.date));
    const tiles = [];
    for (let i = -half; i <= half; i++) {
      const d = new Date(centerISO);
      d.setDate(d.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      const dow = d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');
      const month = d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '');
      tiles.push({
        iso,
        day: d.getDate(),
        dow,
        month,
        weekend: d.getDay() === 0 || d.getDay() === 6,
        active: iso === activeISO,
        isToday: iso === todayISO,
        hasData: dateSet.has(iso)
      });
    }
    return tiles;
  }

  function renderPointage() {
    const dateISO = state.ui.pointageDate || new Date().toISOString().slice(0, 10);
    // Anchor the strip so it doesn't re-center on every tile click. Initialized
    // to the active date on first render; only Aujourd'hui (or tab switch) resets it.
    if (_pointageStripAnchor == null) _pointageStripAnchor = dateISO;

    const totalPresent = state.workers.filter(w => {
      const p = W.findPointage(state.pointages, w.id, dateISO);
      return p && p.present;
    }).length;
    const dayCost = state.workers.reduce((s, w) => {
      const p = W.findPointage(state.pointages, w.id, dateISO);
      return s + W.pointageCost(p, w);
    }, 0);

    const strip = buildDayStrip(_pointageStripAnchor, dateISO, POINTAGE_STRIP_SPAN);

    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">Pointage journalier</h1>
          <div class="page-subtitle">${totalPresent}/${state.workers.length} présents · coût du jour ${fmtMAD(dayCost)}</div>
        </div>
        <div class="flex gap-2 items-center">
          <button class="btn btn-sm" id="duplicate-btn" title="Dupliquer le pointage d'un autre jour">
            ⎘ Dupliquer du …
          </button>
        </div>
      </div>

      <div class="card mb-3">
        <div class="date-strip-wrap">
          <button class="btn btn-sm date-strip-chevron" id="date-prev" aria-label="Jour précédent">‹</button>
          <div class="date-strip" id="date-strip">
            ${strip.map(t => `
              <button type="button" class="date-tile ${t.active ? 'active' : ''} ${t.isToday ? 'is-today' : ''} ${t.weekend ? 'weekend' : ''} ${t.hasData ? 'has-data' : ''}"
                      data-date-tile="${t.iso}" title="${fmtDateLong(t.iso)}">
                <span class="date-tile-dow">${escapeHtml(t.dow)}</span>
                <span class="date-tile-day">${t.day}</span>
                <span class="date-tile-month">${escapeHtml(t.month)}</span>
              </button>
            `).join('')}
          </div>
          <button class="btn btn-sm date-strip-chevron" id="date-next" aria-label="Jour suivant">›</button>
          <button class="btn btn-sm" id="date-today" title="Revenir à aujourd'hui">Aujourd'hui</button>
          <input type="date" class="input date-strip-picker" id="date-picker" value="${dateISO}" />
        </div>
      </div>

      <div class="card" style="padding:0">
        <table class="table">
          <thead>
            <tr>
              <th>Ouvrier</th>
              <th>Présence</th>
              <th>Tâches</th>
              <th class="text-right">Bonus</th>
              <th class="text-right">Coût</th>
            </tr>
          </thead>
          <tbody>
            ${state.workers.map(w => {
              const p = W.findPointage(state.pointages, w.id, dateISO);
              const present = p?.present;
              const taskIds = p?.task_ids || [];
              const cost = W.pointageCost(p, w);
              return `
                <tr data-row-worker="${w.id}">
                  <td>
                    <strong>${escapeHtml(w.name)}</strong>
                    <div class="muted text-sm">${escapeHtml(w.role)} · ${fmtMAD(w.rate)}/j</div>
                  </td>
                  <td>
                    <div class="toggle-presence">
                      <button class="present ${present===true?'active':''}" data-presence="present" data-worker="${w.id}">✓ Présent</button>
                      <button class="absent ${present===false?'active':''}" data-presence="absent" data-worker="${w.id}">✕ Absent</button>
                    </div>
                  </td>
                  <td>
                    <div class="task-picker" data-tasks-for="${w.id}">
                      <button type="button" class="task-picker-btn" data-task-btn="${w.id}" aria-haspopup="true" aria-expanded="false">
                        + Tâche <span class="caret">▾</span>
                      </button>
                      <div class="task-picker-selected" data-selected-for="${w.id}">${renderSelectedTaskChips(taskIds, w.id)}</div>
                    </div>
                  </td>
                  <td class="text-right">
                    <input type="number" min="0" class="input" style="width:90px;text-align:right"
                           data-bonus-for="${w.id}" value="${p?.bonus || 0}" />
                  </td>
                  <td class="text-right num"><strong>${fmtMAD(cost)}</strong></td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function wirePointage() {
    const dateISO = state.ui.pointageDate;
    function setDate(iso) {
      closeTaskPicker();
      closeDuplicatePopover();
      // Capture current strip scroll synchronously so the next render restores it.
      const oldStrip = document.getElementById('date-strip');
      if (oldStrip) _pointageScrollPos = oldStrip.scrollLeft;
      state.ui.pointageDate = iso;
      // If new active date is outside the rendered strip window, re-anchor on it
      // so the active tile is visible. Recenter scroll on next render.
      if (_pointageStripAnchor) {
        const half = Math.floor(POINTAGE_STRIP_SPAN / 2);
        const diffDays = Math.round(
          (new Date(iso) - new Date(_pointageStripAnchor)) / 86400000
        );
        if (Math.abs(diffDays) > half) {
          _pointageStripAnchor = iso;
          _firstPointageStripRender = true;
        }
      }
      saveState();
      const body = document.getElementById('ressources-body');
      body.innerHTML = renderPointage();
      wirePointage();
    }
    document.getElementById('date-prev').addEventListener('click', () => {
      const d = new Date(dateISO); d.setDate(d.getDate() - 1);
      setDate(d.toISOString().slice(0,10));
    });
    document.getElementById('date-next').addEventListener('click', () => {
      const d = new Date(dateISO); d.setDate(d.getDate() + 1);
      setDate(d.toISOString().slice(0,10));
    });
    document.getElementById('date-today').addEventListener('click', () => {
      _pointageStripAnchor = new Date().toISOString().slice(0,10);
      _firstPointageStripRender = true;
      setDate(_pointageStripAnchor);
    });
    document.getElementById('date-picker').addEventListener('change', (e) => {
      _pointageStripAnchor = e.target.value;
      _firstPointageStripRender = true;
      setDate(e.target.value);
    });

    document.querySelectorAll('[data-date-tile]').forEach(t => {
      t.addEventListener('click', () => setDate(t.dataset.dateTile));
    });
    const stripEl = document.getElementById('date-strip');
    if (stripEl) {
      void stripEl.scrollWidth;
      if (!_firstPointageStripRender) {
        stripEl.scrollLeft = _pointageScrollPos;
      } else {
        const active = stripEl.querySelector('.date-tile.active');
        if (active) {
          stripEl.scrollLeft = active.offsetLeft - (stripEl.clientWidth - active.offsetWidth) / 2;
        }
        _firstPointageStripRender = false;
        _pointageScrollPos = stripEl.scrollLeft;
      }
      attachStripDragPan(stripEl);
    }

    document.getElementById('duplicate-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openDuplicatePopover(dateISO, e.currentTarget);
    });

    document.querySelectorAll('[data-presence]').forEach(b => {
      b.addEventListener('click', () => {
        const present = b.dataset.presence === 'present';
        const workerId = b.dataset.worker;
        upsertPointage(workerId, dateISO, p => { p.present = present; if (!present) p.task_ids = []; });
        refreshPointageRow(workerId, dateISO);
      });
    });
    document.querySelectorAll('[data-task-btn]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openTaskPicker(btn.dataset.taskBtn, btn);
      });
    });
    wireSelectedChipRemoval(dateISO);
    document.querySelectorAll('[data-bonus-for]').forEach(inp => {
      inp.addEventListener('change', () => {
        const workerId = inp.dataset.bonusFor;
        const val = parseFloat(inp.value) || 0;
        upsertPointage(workerId, dateISO, p => { p.bonus = val; });
        refreshPointageRow(workerId, dateISO);
      });
    });
  }

  function wireSelectedChipRemoval(dateISO) {
    document.querySelectorAll('[data-task-remove]').forEach(c => {
      c.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWorkerTask(c.dataset.worker, c.dataset.taskRemove, dateISO);
      });
    });
  }

  function toggleWorkerTask(workerId, taskId, dateISO) {
    let added = false;
    upsertPointage(workerId, dateISO, p => {
      if (!p.present) p.present = true; // selecting a task implies present
      p.task_ids = p.task_ids || [];
      const idx = p.task_ids.indexOf(taskId);
      if (idx >= 0) {
        p.task_ids.splice(idx, 1);
      } else {
        p.task_ids.push(taskId);
        added = true;
      }
    });
    // Auto-flip a 'todo' task to 'in_progress' when it gets its first chip
    if (added) {
      const task = state.ganttTasks.find(t => t.id === taskId);
      if (task && task.status === 'todo') {
        task.status = 'in_progress';
        saveState();
      }
    }
    refreshPointageRow(workerId, dateISO);
    return added;
  }

  // ── Hierarchical task picker ─────────────────────────────────
  let _taskPickerState = null; // { workerId, parentIdx, leafIdx }

  function closeTaskPicker() {
    const pop = document.getElementById('task-picker-pop');
    if (pop) pop.remove();
    document.removeEventListener('click', onTaskPickerOutside, true);
    document.removeEventListener('keydown', onTaskPickerKey, true);
    document.querySelectorAll('[data-task-btn]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    _taskPickerState = null;
  }

  function onTaskPickerOutside(e) {
    const pop = document.getElementById('task-picker-pop');
    if (!pop) return;
    if (pop.contains(e.target)) return;
    if (e.target.closest('[data-task-btn]')) return;
    closeTaskPicker();
  }

  function onTaskPickerKey(e) {
    if (!_taskPickerState) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeTaskPicker();
      return;
    }
    const groups = W.groupTasksByParent(state.ganttTasks);
    const st = _taskPickerState;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (st.leafIdx < 0) {
        st.parentIdx = Math.min(st.parentIdx + 1, groups.length - 1);
        renderTaskPickerLeaves();
        highlightTaskPickerParent();
      } else {
        const leaves = groups[st.parentIdx]?.leaves || [];
        st.leafIdx = Math.min(st.leafIdx + 1, leaves.length - 1);
        highlightTaskPickerLeaf();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (st.leafIdx < 0) {
        st.parentIdx = Math.max(st.parentIdx - 1, 0);
        renderTaskPickerLeaves();
        highlightTaskPickerParent();
      } else {
        st.leafIdx = Math.max(st.leafIdx - 1, 0);
        highlightTaskPickerLeaf();
      }
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const leaves = groups[st.parentIdx]?.leaves || [];
      if (leaves.length) {
        st.leafIdx = 0;
        highlightTaskPickerLeaf();
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      st.leafIdx = -1;
      highlightTaskPickerLeaf();
      highlightTaskPickerParent();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (st.leafIdx >= 0) {
        const leaf = groups[st.parentIdx]?.leaves[st.leafIdx];
        if (leaf) {
          toggleWorkerTask(st.workerId, leaf.id, state.ui.pointageDate);
          updateTaskPickerLeafSelectionMarkers();
        }
      }
    }
  }

  function highlightTaskPickerParent() {
    const pop = document.getElementById('task-picker-pop');
    if (!pop || !_taskPickerState) return;
    pop.querySelectorAll('.task-picker-parent').forEach((el, i) => {
      el.classList.toggle('active', i === _taskPickerState.parentIdx);
    });
  }

  function highlightTaskPickerLeaf() {
    const pop = document.getElementById('task-picker-pop');
    if (!pop || !_taskPickerState) return;
    pop.querySelectorAll('.task-picker-leaf').forEach((el, i) => {
      el.classList.toggle('keyboard-focus', i === _taskPickerState.leafIdx);
    });
  }

  function updateTaskPickerLeafSelectionMarkers() {
    if (!_taskPickerState) return;
    const dateISO = state.ui.pointageDate;
    const fresh = W.findPointage(state.pointages, _taskPickerState.workerId, dateISO);
    const cur = fresh?.task_ids || [];
    const pop = document.getElementById('task-picker-pop');
    if (!pop) return;
    pop.querySelectorAll('.task-picker-leaf').forEach(el => {
      const tid = el.dataset.taskId;
      const sel = cur.includes(tid);
      el.classList.toggle('selected', sel);
      const check = el.querySelector('.task-picker-check');
      if (check) check.textContent = sel ? '✓' : '';
    });
  }

  function renderTaskPickerLeaves() {
    const pop = document.getElementById('task-picker-pop');
    if (!pop || !_taskPickerState) return;
    const groups = W.groupTasksByParent(state.ganttTasks);
    const grp = groups[_taskPickerState.parentIdx];
    const dateISO = state.ui.pointageDate;
    const cur = (W.findPointage(state.pointages, _taskPickerState.workerId, dateISO)?.task_ids) || [];
    const leavesEl = pop.querySelector('.task-picker-leaves');
    const leaves = grp?.leaves || [];
    leavesEl.innerHTML = leaves.map(l => `
      <div class="task-picker-leaf ${cur.includes(l.id) ? 'selected' : ''} status-${l.status || 'todo'}" data-task-id="${l.id}" role="option">
        <span class="task-picker-check">${cur.includes(l.id) ? '✓' : ''}</span>
        <span class="task-picker-leaf-name">${escapeHtml(l.name)}</span>
      </div>
    `).join('');
    leavesEl.querySelectorAll('.task-picker-leaf').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleWorkerTask(_taskPickerState.workerId, el.dataset.taskId, dateISO);
        updateTaskPickerLeafSelectionMarkers();
      });
    });
  }

  function openTaskPicker(workerId, anchorEl) {
    closeTaskPicker();
    const groups = W.groupTasksByParent(state.ganttTasks);
    if (groups.length === 0) return;
    anchorEl.setAttribute('aria-expanded', 'true');

    const pop = document.createElement('div');
    pop.className = 'task-picker-popover';
    pop.id = 'task-picker-pop';
    pop.setAttribute('role', 'menu');
    pop.innerHTML = `
      <div class="task-picker-parents" role="listbox">
        ${groups.map((g, i) => `
          <div class="task-picker-parent ${i === 0 ? 'active' : ''}" data-parent-idx="${i}" role="option">
            <span class="task-picker-parent-name">${escapeHtml(g.parent.name)}</span>
            <span class="task-picker-arrow">›</span>
          </div>
        `).join('')}
      </div>
      <div class="task-picker-leaves" role="listbox"></div>
    `;
    document.body.appendChild(pop);

    _taskPickerState = { workerId, parentIdx: 0, leafIdx: -1 };
    positionTaskPickerPopover(pop, anchorEl);
    renderTaskPickerLeaves();

    pop.querySelectorAll('.task-picker-parent').forEach((el, i) => {
      const setActive = () => {
        _taskPickerState.parentIdx = i;
        _taskPickerState.leafIdx = -1;
        highlightTaskPickerParent();
        renderTaskPickerLeaves();
      };
      el.addEventListener('mouseenter', setActive);
      el.addEventListener('click', (e) => { e.stopPropagation(); setActive(); });
    });

    // Keydown can attach immediately (no race with the opening click).
    document.addEventListener('keydown', onTaskPickerKey, true);
    // Defer outside-click binding so the same click that opened us
    // doesn't immediately close us.
    setTimeout(() => {
      document.addEventListener('click', onTaskPickerOutside, true);
    }, 0);
  }

  function positionTaskPickerPopover(pop, anchor) {
    const rect = anchor.getBoundingClientRect();
    pop.style.position = 'absolute';
    pop.style.top = `${rect.bottom + window.scrollY + 4}px`;
    pop.style.left = `${rect.left + window.scrollX}px`;
    // Clamp inside viewport
    requestAnimationFrame(() => {
      const popRect = pop.getBoundingClientRect();
      if (popRect.right > window.innerWidth - 8) {
        const shift = popRect.right - (window.innerWidth - 8);
        pop.style.left = `${rect.left + window.scrollX - shift}px`;
      }
    });
  }

  // ── "Dupliquer du …" popover ─────────────────────────────────
  function closeDuplicatePopover() {
    const pop = document.getElementById('duplicate-pop');
    if (pop) pop.remove();
    document.removeEventListener('click', onDuplicateOutside, true);
    document.removeEventListener('keydown', onDuplicateKey, true);
  }
  function onDuplicateOutside(e) {
    const pop = document.getElementById('duplicate-pop');
    if (!pop) return;
    if (pop.contains(e.target)) return;
    if (e.target.closest('#duplicate-btn')) return;
    closeDuplicatePopover();
  }
  function onDuplicateKey(e) {
    if (e.key === 'Escape') closeDuplicatePopover();
  }

  function recentPointageDates(beforeISO, limit = 5) {
    const set = new Set();
    for (const p of state.pointages) {
      if (p.date < beforeISO) set.add(p.date);
    }
    return [...set].sort((a, b) => b.localeCompare(a)).slice(0, limit);
  }

  function openDuplicatePopover(targetISO, anchorEl) {
    closeDuplicatePopover();
    // Default source = yesterday
    const yesterday = new Date(targetISO);
    yesterday.setDate(yesterday.getDate() - 1);
    const defaultSrc = yesterday.toISOString().slice(0, 10);
    const recents = recentPointageDates(targetISO, 5);

    const pop = document.createElement('div');
    pop.className = 'duplicate-popover';
    pop.id = 'duplicate-pop';
    pop.innerHTML = `
      <div class="duplicate-title">Dupliquer le pointage</div>
      <label class="field">Date source
        <input type="date" class="input" id="dup-date" value="${defaultSrc}" max="${targetISO}" />
      </label>
      ${recents.length ? `
        <div class="duplicate-quick-pick-label muted text-sm">Récents :</div>
        <div class="duplicate-quick-pick">
          ${recents.map(d => `<button class="btn btn-sm" data-quick-date="${d}">${fmtDate(d)}</button>`).join('')}
        </div>
      ` : ''}
      <div class="duplicate-preview" id="dup-preview"></div>
      <div class="flex gap-2" style="justify-content:flex-end;margin-top:8px">
        <button class="btn btn-sm" id="dup-cancel">Annuler</button>
        <button class="btn btn-sm btn-primary" id="dup-confirm">Confirmer</button>
      </div>
    `;
    document.body.appendChild(pop);
    positionTaskPickerPopover(pop, anchorEl);

    const dateInput = document.getElementById('dup-date');
    const previewEl = document.getElementById('dup-preview');
    const confirmBtn = document.getElementById('dup-confirm');

    function refreshPreview() {
      const src = dateInput.value;
      if (!src) {
        previewEl.textContent = '';
        confirmBtn.disabled = true;
        return;
      }
      const candidates = W.copyPointagesFromDate(state.pointages, src, targetISO);
      if (candidates.length === 0) {
        previewEl.innerHTML = '<span class="muted">Aucun pointage à copier (jour vide ou déjà rempli).</span>';
        confirmBtn.disabled = true;
      } else {
        const taskCount = candidates.reduce((s, p) => s + (p.task_ids?.length || 0), 0);
        previewEl.innerHTML = `<strong>${candidates.length}</strong> ouvrier${candidates.length>1?'s':''} · <strong>${taskCount}</strong> tâche${taskCount>1?'s':''}`;
        confirmBtn.disabled = false;
      }
    }
    refreshPreview();

    dateInput.addEventListener('input', refreshPreview);
    pop.querySelectorAll('[data-quick-date]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dateInput.value = btn.dataset.quickDate;
        refreshPreview();
      });
    });
    document.getElementById('dup-cancel').addEventListener('click', (e) => {
      e.stopPropagation();
      closeDuplicatePopover();
    });
    confirmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const src = dateInput.value;
      if (!src) return;
      const newEntries = W.copyPointagesFromDate(state.pointages, src, targetISO);
      if (newEntries.length === 0) return;
      state.pointages.push(...newEntries);
      saveState();
      closeDuplicatePopover();
      const body = document.getElementById('ressources-body');
      body.innerHTML = renderPointage();
      wirePointage();
    });

    document.addEventListener('keydown', onDuplicateKey, true);
    setTimeout(() => {
      document.addEventListener('click', onDuplicateOutside, true);
    }, 0);
  }

  function upsertPointage(workerId, dateISO, mutate) {
    let p = W.findPointage(state.pointages, workerId, dateISO);
    if (!p) {
      p = { id: uid(), worker_id: workerId, date: dateISO, present: false, task_ids: [], bonus: 0, note: '', rate_snapshot: null };
      state.pointages.push(p);
    }
    mutate(p);
    saveState();
  }

  function refreshPointageRow(workerId, dateISO) {
    const w = state.workers.find(x => x.id === workerId);
    const p = W.findPointage(state.pointages, workerId, dateISO);
    const row = document.querySelector(`[data-row-worker="${workerId}"]`);
    if (!row) return;

    row.querySelectorAll('[data-presence]').forEach(b => {
      b.classList.toggle('active', (b.dataset.presence === 'present' && p?.present === true) ||
                                    (b.dataset.presence === 'absent' && p?.present === false));
    });
    const selectedStrip = row.querySelector(`[data-selected-for="${workerId}"]`);
    if (selectedStrip) {
      selectedStrip.innerHTML = renderSelectedTaskChips(p?.task_ids || [], workerId);
      // Re-wire the new remove buttons on this row
      selectedStrip.querySelectorAll('[data-task-remove]').forEach(c => {
        c.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleWorkerTask(c.dataset.worker, c.dataset.taskRemove, dateISO);
        });
      });
    }
    const costCell = row.querySelector('td:last-child strong');
    if (costCell) costCell.textContent = fmtMAD(W.pointageCost(p, w));

    // Refresh top subtitle
    const subtitle = document.querySelector('.page-subtitle');
    if (subtitle) {
      const totalPresent = state.workers.filter(ww => {
        const pp = W.findPointage(state.pointages, ww.id, dateISO);
        return pp && pp.present;
      }).length;
      const dayCost = state.workers.reduce((s, ww) => {
        const pp = W.findPointage(state.pointages, ww.id, dateISO);
        return s + W.pointageCost(pp, ww);
      }, 0);
      subtitle.textContent = `${totalPresent}/${state.workers.length} présents · coût du jour ${fmtMAD(dayCost)}`;
    }
    refreshTopbar();
  }

  // ════════════════════════════════════════════════════════════════
  // BUDGET (placeholder per plan — phase 2 redesign)
  // ════════════════════════════════════════════════════════════════
  function renderBudget() {
    const s = Bud.budgetSummary({
      project: state.project,
      workers: state.workers,
      pointages: state.pointages,
      soustraitants: state.soustraitants,
      materials: state.materials,
      equipment: state.equipment
    });

    const margeClass = s.margeActuelle >= 0 ? 'up' : 'down';
    const consClass = s.consumedPct >= 100 ? 'down' : s.consumedPct >= 80 ? 'warn' : 'up';

    // Matériaux grouped by category
    const matsByCat = Mat.materialsByCategory(state.materials || []);
    const matCatRows = Array.from(matsByCat.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cat, total]) => `
        <tr>
          <td><span class="badge badge-muted">${categoryLabel(cat)}</span></td>
          <td class="text-right num"><strong>${fmtMAD(total)}</strong></td>
        </tr>
      `).join('');

    // Matériel split by kind
    const eqParts = Eq.partitionByKind(state.equipment || []);
    const rentalTotal = eqParts.location.reduce((sum, e) => sum + Eq.equipmentRentalCost(e), 0);
    const ownedTotal = eqParts.propriete.reduce((sum, e) => sum + Eq.equipmentOwnedCost(e), 0);

    return `
      <div class="page">
        <div class="page-header">
          <div>
            <h1 class="page-title">Budget</h1>
            <div class="page-subtitle">Marge, coûts, matériaux, matériel — vue consolidée du projet</div>
          </div>
        </div>
        <div class="grid grid-4 mb-3">
          <div class="kpi">
            <div class="kpi-label">Devis client</div>
            <div class="kpi-value num" id="budget-devis">${fmtMAD(s.devis)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Budget interne</div>
            <div class="kpi-value num">${fmtMAD(s.budgetInterne)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Dépensé</div>
            <div class="kpi-value num" id="budget-total-cost">${fmtMAD(s.totalCost)}</div>
            <div class="kpi-trend ${consClass}">${s.consumedPct}%</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Marge actuelle</div>
            <div class="kpi-value num" id="budget-marge">${fmtMAD(s.margeActuelle)}</div>
            <div class="kpi-trend ${margeClass}">${s.margePct}%</div>
          </div>
        </div>

        <div class="grid grid-2">
          <div class="card" style="padding:0">
            <div class="card-header"><div class="card-title">Répartition des coûts</div></div>
            <table class="table">
              <tbody>
                <tr><td>👷 Main d'œuvre</td><td class="text-right num" data-cost="labour"><strong>${fmtMAD(s.labour)}</strong></td></tr>
                <tr>
                  <td>🤝 Sous-traitants <span class="muted text-sm">(payé ${fmtMAD(s.soustraitantsPaid)})</span></td>
                  <td class="text-right num" data-cost="sous"><strong>${fmtMAD(s.soustraitantsCommitted)}</strong></td>
                </tr>
                <tr><td>🧱 Matériaux</td><td class="text-right num" data-cost="materials"><strong>${fmtMAD(s.materials)}</strong></td></tr>
                <tr><td>🔧 Matériel</td><td class="text-right num" data-cost="equipment"><strong>${fmtMAD(s.equipment)}</strong></td></tr>
              </tbody>
              <tfoot>
                <tr class="cost-line-total">
                  <td><strong>Total coût</strong></td>
                  <td class="text-right num" data-cost="total"><strong>${fmtMAD(s.totalCost)}</strong></td>
                </tr>
                <tr class="cost-line-margin">
                  <td>Marge actuelle (devis − coût)</td>
                  <td class="text-right num ${margeClass}"><strong>${fmtMAD(s.margeActuelle)}</strong></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div class="card" style="padding:0">
            <div class="card-header"><div class="card-title">Matériaux par catégorie</div></div>
            ${matCatRows ? `
              <table class="table">
                <thead><tr><th>Catégorie</th><th class="text-right">Coût</th></tr></thead>
                <tbody>${matCatRows}</tbody>
                <tfoot><tr><td><strong>Total</strong></td><td class="text-right num"><strong>${fmtMAD(s.materials)}</strong></td></tr></tfoot>
              </table>
            ` : '<div class="empty-state" style="padding:24px"><div class="muted">Aucun matériau enregistré.</div></div>'}
          </div>
        </div>

        <div class="card" style="padding:0; margin-top:16px">
          <div class="card-header"><div class="card-title">Matériel — location vs propriété</div></div>
          <table class="table">
            <thead><tr><th>Type</th><th class="text-right">Entrées</th><th class="text-right">Coût</th></tr></thead>
            <tbody>
              <tr><td>Location</td><td class="text-right num">${eqParts.location.length}</td><td class="text-right num"><strong>${fmtMAD(rentalTotal)}</strong></td></tr>
              <tr><td>Propriété (alloué)</td><td class="text-right num">${eqParts.propriete.length}</td><td class="text-right num"><strong>${fmtMAD(ownedTotal)}</strong></td></tr>
            </tbody>
            <tfoot><tr><td><strong>Total</strong></td><td></td><td class="text-right num"><strong>${fmtMAD(s.equipment)}</strong></td></tr></tfoot>
          </table>
        </div>
      </div>
    `;
  }
  function afterBudget() {}

  // ════════════════════════════════════════════════════════════════
  // ALERTES
  // ════════════════════════════════════════════════════════════════
  function renderAlertes() {
    const alerts = computeAlerts();
    const counts = {
      critical: alerts.filter(a => a.severity === 'critical').length,
      moderate: alerts.filter(a => a.severity === 'moderate').length,
      low:      alerts.filter(a => a.severity === 'low').length,
      total:    alerts.length
    };
    return `
      <div class="page">
        <div class="page-header">
          <div>
            <h1 class="page-title">Alertes</h1>
            <div class="page-subtitle">${counts.total} alertes actives</div>
          </div>
        </div>
        <div class="grid grid-4 mb-3">
          <div class="kpi"><div class="kpi-label">Critiques</div><div class="kpi-value num" style="color:var(--danger)">${counts.critical}</div></div>
          <div class="kpi"><div class="kpi-label">Modérées</div><div class="kpi-value num" style="color:var(--warn)">${counts.moderate}</div></div>
          <div class="kpi"><div class="kpi-label">Faibles</div><div class="kpi-value num" style="color:var(--info)">${counts.low}</div></div>
          <div class="kpi"><div class="kpi-label">Total</div><div class="kpi-value num">${counts.total}</div></div>
        </div>
        <div class="card" style="padding:0">
          ${alerts.length === 0 ?
            '<div class="empty-state"><div class="empty-state-title">Aucune alerte 🎉</div><div>Le chantier est sous contrôle.</div></div>' :
            `<table class="table">
              <thead><tr><th>Type</th><th>Message</th><th>Tâche</th><th class="text-right"></th></tr></thead>
              <tbody>
                ${alerts.map(a => `
                  <tr>
                    <td><span class="badge ${a.severity === 'critical' ? 'badge-danger' : a.severity === 'moderate' ? 'badge-warn' : 'badge-info'}">${a.type}</span></td>
                    <td>${escapeHtml(a.message)}</td>
                    <td class="muted">${escapeHtml(a.task_name || '')}</td>
                    <td class="text-right">
                      ${a.task_id ? `<button class="btn btn-ghost btn-sm" data-jump-task="${a.task_id}">Voir →</button>` : ''}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
          }
        </div>
      </div>
    `;
  }
  function afterAlertes() {
    document.querySelectorAll('[data-jump-task]').forEach(b => {
      b.addEventListener('click', () => setTab('planning'));
    });
  }

  // ── utils ─────────────────────────────────────────────────────
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── boot ──────────────────────────────────────────────────────
  async function bootRender() {
    state = await loadState();
    if (!state.ui) state.ui = {
      activeTab: 'overview',
      ressourcesSubTab: 'apercu',
      pointageDate: new Date().toISOString().slice(0,10),
      ganttDayPx: 36
    };
    render();
  }

  function updateUserChrome(user) {
    const label = document.getElementById('user-label');
    const avatar = document.getElementById('user-avatar');
    const btn = document.getElementById('signout-btn');
    if (!btn) return;
    if (user) {
      const name = user.email || 'Utilisateur';
      if (label) label.textContent = name;
      if (avatar) avatar.textContent = name.charAt(0).toUpperCase();
      btn.classList.remove('hide');
    } else {
      if (label) label.textContent = '';
      if (avatar) avatar.textContent = '';
      btn.classList.add('hide');
    }
  }

  // Renders the save-state badge in the topbar from the storage adapter's
  // lifecycle events. Stays hidden in local mode and while idle so it doesn't
  // distract the user until the first save actually happens.
  let saveErrorToastId = null;
  function updateSaveBadge(saveState) {
    const el = document.getElementById('save-state');
    if (!el) return;
    if (window.AppStorage.mode !== 'supabase') {
      el.classList.add('hide');
      return;
    }
    const text = el.querySelector('.save-state-text');
    el.classList.remove('save-state-saving', 'save-state-saved', 'save-state-error');
    const status = saveState && saveState.status;

    if (status === 'saving') {
      el.classList.remove('hide');
      el.classList.add('save-state-saving');
      if (text) text.textContent = 'Enregistrement…';
    } else if (status === 'saved') {
      el.classList.remove('hide');
      el.classList.add('save-state-saved');
      if (text) text.textContent = 'Enregistré';
      // Clear any lingering "save failed" toast once a save succeeds.
      if (saveErrorToastId && window.Toast) {
        window.Toast.dismiss(saveErrorToastId);
        saveErrorToastId = null;
      }
    } else if (status === 'error') {
      el.classList.remove('hide');
      el.classList.add('save-state-error');
      if (text) {
        text.textContent = saveState.willRetry ? 'Nouvelle tentative…' : 'Échec de la sauvegarde';
      }
      // Only fire the toast on a final failure (after all retries exhausted).
      if (!saveState.willRetry && window.Toast && !saveErrorToastId) {
        saveErrorToastId = window.Toast.error(
          'Sauvegarde impossible — vérifiez votre connexion.',
          {
            duration: 0,
            action: {
              label: 'Réessayer',
              onClick: () => { if (window.AppStorage.flush) window.AppStorage.flush(); }
            }
          }
        );
      }
    } else {
      // idle — first paint, before any save has occurred.
      el.classList.add('hide');
      if (text) text.textContent = '';
    }
  }

  async function boot() {
    await window.AppStorage.init();

    if (window.AppStorage.mode === 'supabase') {
      window.AppStorage.onSaveStateChange(updateSaveBadge);

      const btn = document.getElementById('signout-btn');
      if (btn) btn.addEventListener('click', async () => {
        const ok = await window.Modal.confirm({
          title: 'Se déconnecter',
          message: 'Vous serez redirigé vers la page de connexion.',
          danger: false,
          confirmLabel: 'Déconnexion'
        });
        if (!ok) return;
        await window.AppStorage.signOut();
      });

      // Re-show auth UI if the user signs out mid-session; load fresh state
      // when they sign back in.
      window.AppStorage.onAuthChange(async (user) => {
        updateUserChrome(user);
        if (user) {
          if (window.AuthUI) window.AuthUI.hide();
          await bootRender();
        } else {
          // Session ended — clearest UX is a reload back to the auth screen.
          location.reload();
        }
      });

      if (!window.AppStorage.isAuthed()) {
        if (window.AuthUI) window.AuthUI.show('login');
        return;
      }
      updateUserChrome(window.AppStorage.user);
    }

    await bootRender();
  }

  boot();
})();
