// Seed data for Batitrack
//
// In production each user has their OWN data, hydrated from Supabase into
// window.__BATI_USER_DATA. The arrays below are demo seeds — only used
// when window.__BATI_DEMO_MODE === true (e.g. running without auth).
// For authenticated users the seeds are replaced with their persisted data
// or with EMPTY values for first-time signups.

const __BATI_UD   = window.__BATI_USER_DATA || {};
const __BATI_DEMO = window.__BATI_DEMO_MODE === true;
function __batiPick(key, emptyValue, demoValue) {
  if (Object.prototype.hasOwnProperty.call(__BATI_UD, key)) return __BATI_UD[key];
  return __BATI_DEMO ? demoValue : emptyValue;
}

const COMPANY_EMPTY = {
  name: "", ice: "", rc: "", if: "",
  address: "", phone: "", email: "",
  logo: null, plan: "Pro"
};
const COMPANY_DEMO = {
  name: "BTP Atlas Construction",
  ice: "002 458 716 000 029",
  rc: "187 459",
  if: "31 547 829",
  address: "12, Rue Tarik Ibn Ziad, Casablanca",
  phone: "+212 522 47 18 32",
  email: "contact@btpatlas.ma",
  logo: null,
  plan: "Pro"
};
const COMPANY = __batiPick('company', COMPANY_EMPTY, COMPANY_DEMO);

const CHANTIERS_DEMO = [
  {
    id: 'ch-1',
    name: "Villa Anfa Casablanca",
    client: "Famille Berrada",
    manager: "Hassan Benali",
    address: "Boulevard de l'Océan, Anfa, Casablanca",
    dateStart: "2025-10-15",
    dateEndPrev: "2026-08-30",
    budget: 380000,
    budgetMaterials: 200000,
    budgetLabor: 180000,
    budgetMO: 180000,
    contractValue: 520000,
    payments: [
      { id: 'pa-1', date: '2025-10-20', amount: 100000, ref: 'VIR-880214', note: 'Acompte 20%' },
      { id: 'pa-2', date: '2026-01-15', amount: 120000, ref: 'VIR-902317', note: 'Avancement chantier 30%' },
      { id: 'pa-3', date: '2026-04-10', amount: 80000,  ref: 'CHQ-114873', note: 'Acompte étape 3' }
    ],
    color: '#0E5460',
    colorSoft: '#D8E5E7',
    status: 'on-track',
    type: 'Résidentiel'
  },
  {
    id: 'ch-2',
    name: "Résidence Hay Riad Rabat",
    client: "Promo Immo Sarl",
    manager: "Hicham Fassi",
    address: "Av. Annakhil, Hay Riad, Rabat",
    dateStart: "2025-09-01",
    dateEndPrev: "2026-08-15",
    budget: 720000,
    budgetMaterials: 380000,
    budgetLabor: 340000,
    budgetMO: 420000,
    contractValue: 980000,
    payments: [
      { id: 'pa-4', date: '2025-09-05', amount: 200000, ref: 'VIR-557912', note: 'Acompte signature' },
      { id: 'pa-5', date: '2025-12-01', amount: 250000, ref: 'VIR-578840', note: 'Étape Bloc A' },
      { id: 'pa-6', date: '2026-03-20', amount: 180000, ref: 'VIR-602114', note: 'Étape Bloc B' }
    ],
    color: '#C25B3F',
    colorSoft: '#F2DCD3',
    status: 'mid',
    type: 'Multi-logements'
  },
  {
    id: 'ch-3',
    name: "Rénovation Riad Marrakech",
    client: "M. El Othmani",
    manager: "Mohamed Lahlou",
    address: "Derb Sidi Bouloukat, Médina, Marrakech",
    dateStart: "2025-11-10",
    dateEndPrev: "2026-06-30",
    budget: 220000,
    budgetMaterials: 130000,
    budgetLabor: 90000,
    budgetMO: 95000,
    contractValue: 240000,
    payments: [
      { id: 'pa-7', date: '2025-11-12', amount: 60000, ref: 'CHQ-885410', note: 'Acompte 25%' },
      { id: 'pa-8', date: '2026-02-15', amount: 50000, ref: 'CHQ-885413', note: 'Avancement' }
    ],
    color: '#7C5E2A',
    colorSoft: '#EBE3CC',
    status: 'over',
    type: 'Rénovation'
  }
];
const CHANTIERS = __batiPick('chantiers', [], CHANTIERS_DEMO);

const ROLES = ['Manœuvre', 'Ouvrier qualifié', 'Chef d\'équipe', 'Chef de chantier', 'Conducteur de travaux'];

// Photo placeholder = colored circle with initials
function workerAvatar(name, hue) {
  const initials = name.split(' ').map(s => s[0]).slice(0,2).join('');
  return { initials, hue };
}

const OUVRIERS_DEMO = [
  { id: 'w-1',  nom: 'Hassan Benali',     role: 'Chef de chantier',       tarif: 450, phone: '0661 12 34 56', cin: 'BK 145872', dateEmbauche: '2022-03-15', actif: true,  hue: 18 },
  { id: 'w-2',  nom: 'Karim El Idrissi',  role: 'Chef d\'équipe',         tarif: 350, phone: '0662 23 45 67', cin: 'BE 287541', dateEmbauche: '2022-07-01', actif: true,  hue: 195 },
  { id: 'w-3',  nom: 'Youssef Amrani',    role: 'Ouvrier qualifié',       tarif: 280, phone: '0663 34 56 78', cin: 'BJ 412589', dateEmbauche: '2023-01-20', actif: true,  hue: 35 },
  { id: 'w-4',  nom: 'Said Bouazza',      role: 'Ouvrier qualifié',       tarif: 280, phone: '0664 45 67 89', cin: 'BH 358912', dateEmbauche: '2023-04-10', actif: true,  hue: 145 },
  { id: 'w-5',  nom: 'Rachid Tazi',       role: 'Ouvrier qualifié',       tarif: 260, phone: '0665 56 78 90', cin: 'BB 187423', dateEmbauche: '2023-06-05', actif: true,  hue: 240 },
  { id: 'w-6',  nom: 'Mohamed Lahlou',    role: 'Chef d\'équipe',         tarif: 340, phone: '0666 67 89 01', cin: 'BA 962348', dateEmbauche: '2022-11-12', actif: true,  hue: 12 },
  { id: 'w-7',  nom: 'Brahim Saidi',      role: 'Manœuvre',               tarif: 150, phone: '0667 78 90 12', cin: 'BL 745219', dateEmbauche: '2024-02-18', actif: true,  hue: 270 },
  { id: 'w-8',  nom: 'Abdellah Naciri',   role: 'Manœuvre',               tarif: 140, phone: '0668 89 01 23', cin: 'BM 523846', dateEmbauche: '2024-05-22', actif: true,  hue: 95 },
  { id: 'w-9',  nom: 'Mustapha Belkadi',  role: 'Ouvrier qualifié',       tarif: 270, phone: '0669 90 12 34', cin: 'BC 698145', dateEmbauche: '2023-09-08', actif: true,  hue: 320 },
  { id: 'w-10', nom: 'Hicham Fassi',      role: 'Conducteur de travaux',  tarif: 420, phone: '0660 01 23 45', cin: 'BD 134579', dateEmbauche: '2021-08-30', actif: true,  hue: 165 },
  { id: 'w-11', nom: 'Omar Chraibi',      role: 'Manœuvre',               tarif: 130, phone: '0661 11 22 33', cin: 'BN 875412', dateEmbauche: '2024-08-14', actif: true,  hue: 50 },
  { id: 'w-12', nom: 'Younes Bennani',    role: 'Manœuvre',               tarif: 120, phone: '0662 22 33 44', cin: 'BP 412856', dateEmbauche: '2025-01-15', actif: true,  hue: 210 }
];
const OUVRIERS = __batiPick('ouvriers', [], OUVRIERS_DEMO);

// Build attendance for: Q1 Déc 2025, Q2 Déc 2025 (complete + Payée),
// and Q1 Jan 2026 (partial through day 12).
// pointage shape: { [workerId]: { [dateKey]: { statut: 'P'|'A', chantierId, prime, motif, note, audit } } }
// Per-quinzaine: { [workerId]: { avances: [...], retenues: [...] } }

function buildPointage() {
  const pointage = {}; // by worker > by dateKey
  const adjustments = {}; // by qkey > by worker > {avances, retenues}

  // Worker assignment patterns (loose chantier preference)
  const workerChantier = {
    'w-1': ['ch-1', 'ch-1', 'ch-2'],         // Hassan supervises Anfa mostly
    'w-2': ['ch-2', 'ch-2'],                  // Karim → Hay Riad
    'w-3': ['ch-1', 'ch-3'],
    'w-4': ['ch-1'],
    'w-5': ['ch-2'],
    'w-6': ['ch-3', 'ch-3', 'ch-1'],          // Mohamed → Marrakech (over-budget chantier)
    'w-7': ['ch-3'],
    'w-8': ['ch-1'],
    'w-9': ['ch-2'],
    'w-10': ['ch-2', 'ch-1'],
    'w-11': ['ch-2'],
    'w-12': ['ch-3']
  };

  // Per-worker absence pattern – deterministic "random"
  function isAbsent(workerId, y, m, d) {
    const seed = (workerId.charCodeAt(2)*31 + y*7 + m*13 + d*17) % 100;
    // Sundays slightly more absent (but not all – calendar neutrality, still data realism)
    const dow = new Date(y, m, d).getDay();
    if (dow === 0) return seed < 70; // Sundays: ~70% absent
    return seed < 10; // weekdays ~10%
  }

  function chantierFor(workerId, idx) {
    const arr = workerChantier[workerId];
    return arr[idx % arr.length];
  }

  function fillQuinzaine(y, m, half, isComplete, throughDay) {
    const qkey = `${y}-${String(m+1).padStart(2,'0')}-Q${half}`;
    const start = half === 1 ? 1 : 16;
    const end = half === 1 ? 15 : new Date(y, m+1, 0).getDate();
    const lastDay = isComplete ? end : throughDay;

    OUVRIERS.forEach((w, wi) => {
      if (!pointage[w.id]) pointage[w.id] = {};
      let chantierIdx = 0;
      for (let d = start; d <= lastDay; d++) {
        const dk = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const absent = isAbsent(w.id, y, m, d);
        if (absent) {
          pointage[w.id][dk] = { statut: 'A' };
        } else {
          const ch = chantierFor(w.id, chantierIdx++);
          pointage[w.id][dk] = { statut: 'P', chantierId: ch };
        }
      }
    });

    // Primes – sprinkle a handful realistically
    const primeMotifs = ['Travail rapide','Heures supplémentaires','Bon rendement','Aide chef d\'équipe','Finition soignée'];
    const primes = [
      // qkey, worker, day, amount, motif
      ['w-1', 3, 200, 1],
      ['w-1', 9, 150, 3],
      ['w-2', 5, 100, 0],
      ['w-6', 7, 250, 1],
      ['w-3', 11, 150, 2],
      ['w-10', 14, 300, 1]
    ];
    primes.forEach(([wid, day, amount, motifIdx]) => {
      if (day < start || day > lastDay) return;
      const dk = `${y}-${String(m+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      if (pointage[wid] && pointage[wid][dk] && pointage[wid][dk].statut === 'P') {
        pointage[wid][dk].prime = amount;
        pointage[wid][dk].motif = primeMotifs[motifIdx];
      }
    });

    // Avances + retenues at the quinzaine level
    if (!adjustments[qkey]) adjustments[qkey] = {};
    if (isComplete) {
      adjustments[qkey]['w-3'] = {
        avances: [{ id: 'a1', date: `${y}-${String(m+1).padStart(2,'0')}-${String(start+4).padStart(2,'0')}`, montant: 300, motif: 'Avance urgence familiale' }],
        retenues: []
      };
      adjustments[qkey]['w-7'] = {
        avances: [{ id: 'a2', date: `${y}-${String(m+1).padStart(2,'0')}-${String(start+8).padStart(2,'0')}`, montant: 200, motif: 'Avance' }],
        retenues: [{ id: 'r1', montant: 50, motif: 'Casse outil' }]
      };
      adjustments[qkey]['w-11'] = {
        avances: [{ id: 'a3', date: `${y}-${String(m+1).padStart(2,'0')}-${String(start+2).padStart(2,'0')}`, montant: 150, motif: 'Avance' }],
        retenues: []
      };
    }
  }

  fillQuinzaine(2025, 10, 2, true);  // Q2 Novembre 2025 (we will treat as historic – not main focus)
  fillQuinzaine(2025, 11, 1, true);  // Q1 Décembre 2025  → Payée
  fillQuinzaine(2025, 11, 2, true);  // Q2 Décembre 2025  → Payée
  fillQuinzaine(2026, 0,  1, false, 12); // Q1 Janvier 2026 → En cours, through day 12

  return { pointage, adjustments };
}

// Only compute demo pointage in demo mode. Real users may have worker IDs
// outside the hardcoded workerChantier map, which would crash chantierFor.
// The result is discarded by __batiPick for non-demo users anyway.
const __PT_DEMO = __BATI_DEMO ? buildPointage() : { pointage: {}, adjustments: {} };
const POINTAGE     = __batiPick('pointage',    {}, __PT_DEMO.pointage);
const ADJUSTMENTS  = __batiPick('adjustments', {}, __PT_DEMO.adjustments);

// Quinzaine lifecycle states
const QUINZAINE_STATES_DEMO = {
  '2025-11-Q2': { state: 'Payée',   paidDate: '2025-12-01', paidMethod: 'Espèces' },
  '2025-12-Q1': { state: 'Payée',   paidDate: '2025-12-16', paidMethod: 'Espèces' },
  '2025-12-Q2': { state: 'Clôturée', closedDate: '2026-01-01' },
  '2026-01-Q1': { state: 'En cours' }
};
const QUINZAINE_STATES = __batiPick('qStates', {}, QUINZAINE_STATES_DEMO);

// Audit log seed
const AUDIT_LOG_DEMO = [
  { id: 'au1', ts: Date.now() - 1000*60*60*2,  qkey: '2025-12-Q2', user: 'Patron', workerId: 'w-1',  field: '17 Déc',  oldVal: 'Absent',  newVal: 'Présent (Villa Anfa)' },
  { id: 'au2', ts: Date.now() - 1000*60*60*26, qkey: '2025-12-Q2', user: 'Patron', workerId: 'w-7',  field: 'Avance',  oldVal: '0 DH',    newVal: '200 DH' },
  { id: 'au3', ts: Date.now() - 1000*60*60*72, qkey: '2025-12-Q1', user: 'Patron', workerId: 'w-3',  field: '08 Déc',  oldVal: 'Présent (Hay Riad)', newVal: 'Présent (Villa Anfa)' }
];
const AUDIT_LOG = __batiPick('audit', [], AUDIT_LOG_DEMO);

Object.assign(window, {
  COMPANY, CHANTIERS, OUVRIERS, ROLES,
  POINTAGE, ADJUSTMENTS, QUINZAINE_STATES, AUDIT_LOG
});
