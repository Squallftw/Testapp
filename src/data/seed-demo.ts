/**
 * Dev-only demo seeder. Creates two coherent chantiers (one completed and
 * over-budget, one active and healthy) plus the shared org-wide pool of
 * workers, suppliers, items, and purchases needed to populate every screen
 * with realistic, internally-consistent numbers.
 *
 * Lives in src/data/ because:
 *   - it speaks directly to Supabase for the bulk-cleanup path (the ESLint
 *     DAL gate is disabled here), and
 *   - it is semantically a data operation, not a generic utility.
 *
 * The HomePage gates calls behind `import.meta.env.DEV`, so this code is
 * tree-shaken out of production builds.
 */
import { addDays, format, isSunday, startOfDay } from 'date-fns';
import { getActiveOrgId, getSupabase } from './client';
import { mapSupabaseError } from './errors';
import {
  CHANTIER_COLOR_PALETTE,
  createChantier,
  listChantiers,
  type Chantier,
} from './chantiers';
import { createWorker, type Worker } from './workers';
import { createSupplier, type Supplier } from './suppliers';
import {
  createConsumption,
  createItem,
  createPurchase,
  type ConsumablesItem,
} from './consumables';
import { bulkUpsertAttendance, type UpsertAttendanceInput } from './attendance';
import { createTask } from './tasks';
import { createPayment } from './payments';
import {
  createDeployment,
  createMateriel,
  type Materiel,
} from './materiels';

export const DEMO_NAME_PREFIX = 'Démo · ';

const ATELIER_NAME = `${DEMO_NAME_PREFIX}Rénovation Atelier Sidi Maarouf`;
const VILLA_NAME = `${DEMO_NAME_PREFIX}Villa Anfa, Casablanca`;

export interface SeedCounts {
  chantiers: number;
  workers: number;
  suppliers: number;
  items: number;
  purchases: number;
  attendance: number;
  consumption: number;
  tasks: number;
  payments: number;
  materiels: number;
  deployments: number;
}

// ─── helpers ────────────────────────────────────────────────────────────

function isoDaysAgo(days: number): string {
  return format(addDays(startOfDay(new Date()), -days), 'yyyy-MM-dd');
}

function workingDaysBetween(startDaysAgo: number, endDaysAgo: number): string[] {
  // Inclusive on both ends. Sundays excluded — Saturday is a working day
  // in Moroccan construction.
  const today = startOfDay(new Date());
  const start = addDays(today, -startDaysAgo);
  const end = addDays(today, -endDaysAgo);
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (!isSunday(d)) out.push(format(d, 'yyyy-MM-dd'));
  }
  return out;
}

export async function hasDemoData(): Promise<boolean> {
  const chantiers = await listChantiers();
  return chantiers.some((c) => c.name.startsWith(DEMO_NAME_PREFIX));
}

// ─── seed ───────────────────────────────────────────────────────────────

export async function seedDemoData(): Promise<SeedCounts> {
  if (await hasDemoData()) {
    throw new Error("Données de démo déjà présentes — videz d'abord");
  }

  const { suppliers, workers, items } = await createSharedPool();
  const materielsPool = await createSharedMateriels();
  const counts = {
    chantiers: 0,
    workers: Object.keys(workers).length,
    suppliers: Object.keys(suppliers).length,
    items: Object.keys(items).length,
    purchases: 0,
    attendance: 0,
    consumption: 0,
    tasks: 0,
    payments: 0,
    materiels: Object.keys(materielsPool).length,
    deployments: 0,
  };

  // Purchases stock the depot first, then chantiers' consumption draws from it.
  const purchaseCount = await createPurchases(suppliers, items);
  counts.purchases = purchaseCount;

  const atelier = await createAtelierChantier();
  counts.chantiers += 1;
  const atelierStats = await seedAtelierActivity(atelier, workers, items);
  counts.attendance += atelierStats.attendance;
  counts.consumption += atelierStats.consumption;
  counts.tasks += await seedAtelierPlanning(atelier, workers);
  counts.payments += await seedAtelierPayments(atelier);
  counts.deployments += await seedAtelierDeployments(atelier, materielsPool);

  const villa = await createVillaChantier();
  counts.chantiers += 1;
  const villaStats = await seedVillaActivity(villa, workers, items);
  counts.attendance += villaStats.attendance;
  counts.consumption += villaStats.consumption;
  counts.tasks += await seedVillaPlanning(villa, workers);
  counts.payments += await seedVillaPayments(villa);
  counts.deployments += await seedVillaDeployments(villa, materielsPool);

  return counts;
}

// ─── Matériels ──────────────────────────────────────────────────────────

interface MaterielsPool {
  betonniere: Materiel;
  echafaudage: Materiel;
  camionBenne: Materiel;
  marteauPiqueur: Materiel;
  generateur: Materiel;
}

async function createSharedMateriels(): Promise<MaterielsPool> {
  const betonniere = await createMateriel({
    name: `${DEMO_NAME_PREFIX}Bétonnière 250 L`,
    category: 'Gros œuvre',
    type: 'possede',
    qty: 2,
    unit: 'unité',
    cost_per_day: 60,
  });
  const echafaudage = await createMateriel({
    name: `${DEMO_NAME_PREFIX}Échafaudage 30 m²`,
    category: 'Gros œuvre',
    type: 'loue',
    qty: 1,
    unit: 'lot',
    cost_per_day: 180,
  });
  const camionBenne = await createMateriel({
    name: `${DEMO_NAME_PREFIX}Camion benne 6 t`,
    category: 'Transport',
    type: 'loue',
    qty: 1,
    unit: 'unité',
    cost_per_day: 450,
  });
  const marteauPiqueur = await createMateriel({
    name: `${DEMO_NAME_PREFIX}Marteau-piqueur pneumatique`,
    category: 'Démolition',
    type: 'possede',
    qty: 1,
    unit: 'unité',
    cost_per_day: 40,
  });
  const generateur = await createMateriel({
    name: `${DEMO_NAME_PREFIX}Générateur 5 kVA`,
    category: 'Électricité',
    type: 'loue',
    qty: 1,
    unit: 'unité',
    cost_per_day: 120,
  });
  return { betonniere, echafaudage, camionBenne, marteauPiqueur, generateur };
}

async function seedAtelierDeployments(
  atelier: Chantier,
  pool: MaterielsPool
): Promise<number> {
  // Completed chantier (90 → 30 days ago). Mix of own + rented gear.
  const deps = [
    { mat: pool.marteauPiqueur, start: 85, end: 75, qty: 1 }, // démolition phase
    { mat: pool.camionBenne, start: 85, end: 70, qty: 1 }, // évacuation gravats
    { mat: pool.betonniere, start: 65, end: 40, qty: 1 }, // coulage / scellement
    { mat: pool.generateur, start: 65, end: 32, qty: 1 }, // alim chantier
  ];
  for (const d of deps) {
    await createDeployment({
      materiel_id: d.mat.id,
      chantier_id: atelier.id,
      start_date: isoDaysAgo(d.start),
      end_date: isoDaysAgo(d.end),
      qty: d.qty,
    });
  }
  return deps.length;
}

async function seedVillaDeployments(
  villa: Chantier,
  pool: MaterielsPool
): Promise<number> {
  // Active chantier started 28 days ago.
  const deps = [
    { mat: pool.echafaudage, start: 25, end: 0, qty: 1 }, // toujours en place
    { mat: pool.betonniere, start: 20, end: 5, qty: 2 }, // 2 bétonnières
    { mat: pool.camionBenne, start: 22, end: 18, qty: 1 }, // livraison matériaux
  ];
  for (const d of deps) {
    await createDeployment({
      materiel_id: d.mat.id,
      chantier_id: villa.id,
      start_date: isoDaysAgo(d.start),
      end_date: isoDaysAgo(d.end),
      qty: d.qty,
    });
  }
  return deps.length;
}

// ─── Payments ───────────────────────────────────────────────────────────

async function seedAtelierPayments(atelier: Chantier): Promise<number> {
  // Completed chantier: client paid the full 95 000 MAD over three installments.
  const installments = [
    { date: isoDaysAgo(85), amount: 28500, ref: 'Acompte 30% — Virement BMCE' },
    { date: isoDaysAgo(50), amount: 47500, ref: 'Situation intermédiaire 50%' },
    { date: isoDaysAgo(25), amount: 19000, ref: 'Solde — Chèque LCL 1247' },
  ];
  for (const i of installments) {
    await createPayment({
      chantier_id: atelier.id,
      payment_date: i.date,
      amount: i.amount,
      reference: i.ref,
      attachment_url: null,
      notes: null,
    });
  }
  return installments.length;
}

async function seedVillaPayments(villa: Chantier): Promise<number> {
  // Active chantier: client paid acompte + first situation; ~108 000 of 180 000.
  const installments = [
    { date: isoDaysAgo(25), amount: 54000, ref: 'Acompte 30% — Virement AWB' },
    { date: isoDaysAgo(5), amount: 54000, ref: 'Situation 1 — 30% supplémentaire' },
  ];
  for (const i of installments) {
    await createPayment({
      chantier_id: villa.id,
      payment_date: i.date,
      amount: i.amount,
      reference: i.ref,
      attachment_url: null,
      notes: null,
    });
  }
  return installments.length;
}

interface SharedPool {
  suppliers: { ciments: Supplier; quincaillerie: Supplier };
  workers: {
    hassan: Worker;
    mohamed: Worker;
    youssef: Worker;
    karim: Worker;
    said: Worker;
    rachid: Worker;
  };
  items: {
    ciment: ConsumablesItem;
    sable: ConsumablesItem;
    gravier: ConsumablesItem;
    brique: ConsumablesItem;
    acier: ConsumablesItem;
    carrelage: ConsumablesItem;
    peinture: ConsumablesItem;
    cable: ConsumablesItem;
  };
}

async function createSharedPool(): Promise<SharedPool> {
  const ciments = await createSupplier({
    name: `${DEMO_NAME_PREFIX}Ciments du Maroc`,
    type: 'Gros œuvre',
    phone: '+212 522 12 34 56',
    city: 'Casablanca',
    address: null,
    notes: 'Ciment, sable, gravier — livraison à la journée.',
  });
  const quincaillerie = await createSupplier({
    name: `${DEMO_NAME_PREFIX}Quincaillerie Hassan`,
    type: 'Général',
    phone: '+212 661 78 90 12',
    city: 'Casablanca',
    address: null,
    notes: 'Briques, acier, finitions, électricité.',
  });

  const hassan = await createWorker({
    full_name: `${DEMO_NAME_PREFIX}Hassan El Amrani`,
    role: 'Chef de chantier',
    daily_rate: 500,
    phone: null,
    cin: null,
    hire_date: null,
    status: 'active',
    hue: 210,
    user_id: null,
  });
  const mohamed = await createWorker({
    full_name: `${DEMO_NAME_PREFIX}Mohamed Ait Ouali`,
    role: 'Maçon',
    daily_rate: 280,
    phone: null,
    cin: null,
    hire_date: null,
    status: 'active',
    hue: 30,
    user_id: null,
  });
  const youssef = await createWorker({
    full_name: `${DEMO_NAME_PREFIX}Youssef Bennis`,
    role: 'Maçon',
    daily_rate: 260,
    phone: null,
    cin: null,
    hire_date: null,
    status: 'active',
    hue: 60,
    user_id: null,
  });
  const karim = await createWorker({
    full_name: `${DEMO_NAME_PREFIX}Karim El Idrissi`,
    role: 'Manœuvre',
    daily_rate: 150,
    phone: null,
    cin: null,
    hire_date: null,
    status: 'active',
    hue: 120,
    user_id: null,
  });
  const said = await createWorker({
    full_name: `${DEMO_NAME_PREFIX}Said Tazi`,
    role: 'Électricien',
    daily_rate: 350,
    phone: null,
    cin: null,
    hire_date: null,
    status: 'active',
    hue: 270,
    user_id: null,
  });
  const rachid = await createWorker({
    full_name: `${DEMO_NAME_PREFIX}Rachid Belkadi`,
    role: 'Plombier',
    daily_rate: 320,
    phone: null,
    cin: null,
    hire_date: null,
    status: 'active',
    hue: 330,
    user_id: null,
  });

  const ciment = await createItem({
    name: `${DEMO_NAME_PREFIX}Ciment 50 kg`,
    category: 'Gros œuvre',
    unit: 'sac',
    average_price: 78,
    default_supplier_id: ciments.id,
    reorder_threshold: 50,
    has_expiry: false,
    notes: null,
  });
  const sable = await createItem({
    name: `${DEMO_NAME_PREFIX}Sable`,
    category: 'Gros œuvre',
    unit: 'm³',
    average_price: 180,
    default_supplier_id: ciments.id,
    reorder_threshold: 3,
    has_expiry: false,
    notes: null,
  });
  const gravier = await createItem({
    name: `${DEMO_NAME_PREFIX}Gravier`,
    category: 'Gros œuvre',
    unit: 'm³',
    average_price: 220,
    default_supplier_id: ciments.id,
    reorder_threshold: 2,
    has_expiry: false,
    notes: null,
  });
  const brique = await createItem({
    name: `${DEMO_NAME_PREFIX}Brique creuse 8 trous`,
    category: 'Gros œuvre',
    unit: 'pièce',
    average_price: 2.5,
    default_supplier_id: quincaillerie.id,
    reorder_threshold: 200,
    has_expiry: false,
    notes: null,
  });
  const acier = await createItem({
    name: `${DEMO_NAME_PREFIX}Acier 12 mm`,
    category: 'Gros œuvre',
    unit: 'kg',
    average_price: 14,
    default_supplier_id: quincaillerie.id,
    reorder_threshold: 100,
    has_expiry: false,
    notes: null,
  });
  const carrelage = await createItem({
    name: `${DEMO_NAME_PREFIX}Carrelage 60×60`,
    category: 'Finitions',
    unit: 'm²',
    average_price: 95,
    default_supplier_id: quincaillerie.id,
    reorder_threshold: 10,
    has_expiry: false,
    notes: null,
  });
  const peinture = await createItem({
    name: `${DEMO_NAME_PREFIX}Peinture blanche 20 L`,
    category: 'Finitions',
    unit: 'pot',
    average_price: 320,
    default_supplier_id: quincaillerie.id,
    reorder_threshold: 2,
    has_expiry: true,
    notes: null,
  });
  const cable = await createItem({
    name: `${DEMO_NAME_PREFIX}Câble électrique 2.5 mm²`,
    category: 'Électricité',
    unit: 'm',
    average_price: 9,
    default_supplier_id: quincaillerie.id,
    reorder_threshold: 50,
    has_expiry: false,
    notes: null,
  });

  return {
    suppliers: { ciments, quincaillerie },
    workers: { hassan, mohamed, youssef, karim, said, rachid },
    items: {
      ciment,
      sable,
      gravier,
      brique,
      acier,
      carrelage,
      peinture,
      cable,
    },
  };
}

async function createPurchases(
  suppliers: SharedPool['suppliers'],
  items: SharedPool['items']
): Promise<number> {
  await createPurchase({
    supplier_id: suppliers.ciments.id,
    purchased_at: isoDaysAgo(90),
    payment_status: 'paid',
    invoice_ref: 'CDM-2024-0042',
    notes: 'Approvisionnement initial gros œuvre.',
    lines: [
      { item_id: items.ciment.id, qty: 300, unit_price: 78, total: 23400 },
      { item_id: items.sable.id, qty: 10, unit_price: 180, total: 1800 },
      { item_id: items.gravier.id, qty: 5, unit_price: 220, total: 1100 },
    ],
  });
  await createPurchase({
    supplier_id: suppliers.quincaillerie.id,
    purchased_at: isoDaysAgo(75),
    payment_status: 'paid',
    invoice_ref: 'QH-2024-0188',
    notes: 'Briques + acier pour le gros œuvre.',
    lines: [
      { item_id: items.brique.id, qty: 1500, unit_price: 2.5, total: 3750 },
      { item_id: items.acier.id, qty: 600, unit_price: 14, total: 8400 },
    ],
  });
  await createPurchase({
    supplier_id: suppliers.ciments.id,
    purchased_at: isoDaysAgo(21),
    payment_status: 'paid',
    invoice_ref: 'CDM-2024-0193',
    notes: 'Réapprovisionnement Villa Anfa.',
    lines: [
      { item_id: items.ciment.id, qty: 100, unit_price: 78, total: 7800 },
      { item_id: items.sable.id, qty: 2, unit_price: 180, total: 360 },
    ],
  });
  await createPurchase({
    supplier_id: suppliers.quincaillerie.id,
    purchased_at: isoDaysAgo(5),
    payment_status: 'pending',
    invoice_ref: 'QH-2024-0227',
    notes: 'Finitions Villa Anfa — paiement à 30 jours.',
    lines: [
      { item_id: items.carrelage.id, qty: 30, unit_price: 95, total: 2850 },
      { item_id: items.peinture.id, qty: 4, unit_price: 320, total: 1280 },
      { item_id: items.cable.id, qty: 200, unit_price: 9, total: 1800 },
    ],
  });
  return 4;
}

// ─── Chantier A — Atelier (completed, over budget) ──────────────────────

async function createAtelierChantier(): Promise<Chantier> {
  const palette = CHANTIER_COLOR_PALETTE[1]!;
  return createChantier({
    name: ATELIER_NAME,
    type: 'Rénovation',
    color: palette.color,
    color_soft: palette.soft,
    client_name: 'Société Atlas Industries',
    manager_name: null,
    manager_user_id: null,
    address: 'Zone Industrielle Sidi Maarouf, Casablanca',
    date_start: isoDaysAgo(90),
    date_end_prev: isoDaysAgo(30),
    budget_total: 80000,
    budget_labor: 50000,
    budget_materials: 25000,
    budget_equipment: 5000,
    contract_value: 95000,
    status: 'completed',
  });
}

async function seedAtelierActivity(
  chantier: Chantier,
  workers: SharedPool['workers'],
  items: SharedPool['items']
): Promise<{ attendance: number; consumption: number }> {
  const days = workingDaysBetween(90, 30);
  const team = [workers.hassan, workers.mohamed, workers.karim, workers.rachid];

  // Deterministic absences: 5 per worker, evenly spaced across the ~52 working days.
  // Avoids Math.random so re-seeding gives identical numbers.
  const absencePattern: Record<string, number[]> = {
    [workers.hassan.id]: [4, 14, 25, 35, 45],
    [workers.mohamed.id]: [2, 11, 21, 32, 43],
    [workers.karim.id]: [6, 16, 27, 38, 49],
    [workers.rachid.id]: [8, 19, 30, 41, 50],
  };
  const ABSENCE_REASONS = ['maladie', 'pas_venu', 'conge', 'maladie', 'pas_venu'];

  const rows: UpsertAttendanceInput[] = [];
  for (const worker of team) {
    const absent = absencePattern[worker.id] ?? [];
    for (let i = 0; i < days.length; i++) {
      const date = days[i];
      if (!date) continue;
      const absIdx = absent.indexOf(i);
      const isAbsent = absIdx >= 0;
      rows.push({
        chantier_id: chantier.id,
        worker_id: worker.id,
        attendance_date: date,
        status: isAbsent ? 'A' : 'P',
        absence_reason: isAbsent ? (ABSENCE_REASONS[absIdx] ?? 'autre') : null,
        prime_amount: 0,
        prime_motif: null,
        note: null,
      });
    }
  }

  // 4 primes scattered across the run, on confirmed-present days.
  applyPrime(rows, workers.hassan.id, days[25], 100, 'Fin de phase gros œuvre');
  applyPrime(rows, workers.mohamed.id, days[17], 80, 'Heures supplémentaires');
  applyPrime(rows, workers.karim.id, days[45], 50, 'Travail soigné');
  applyPrime(rows, workers.rachid.id, days[7], 70, 'Intervention urgente');

  await bulkUpsertAttendance(rows);

  // Consumption — 4 events, dates within the chantier's run.
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.ciment.id,
    qty: 180,
    used_at: isoDaysAgo(75),
    is_loss: false,
    notes: 'Coulage dalle béton — RDC',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.sable.id,
    qty: 4,
    used_at: isoDaysAgo(72),
    is_loss: false,
    notes: 'Mortier de pose',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.brique.id,
    qty: 800,
    used_at: isoDaysAgo(60),
    is_loss: false,
    notes: 'Cloisons intérieures',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.acier.id,
    qty: 350,
    used_at: isoDaysAgo(50),
    is_loss: false,
    notes: 'Armatures poteaux + linteaux',
  });

  return { attendance: rows.length, consumption: 4 };
}

// ─── Chantier B — Villa Anfa (active, healthy) ──────────────────────────

async function createVillaChantier(): Promise<Chantier> {
  const palette = CHANTIER_COLOR_PALETTE[0]!;
  return createChantier({
    name: VILLA_NAME,
    type: 'Construction neuve',
    color: palette.color,
    color_soft: palette.soft,
    client_name: 'Famille Bennani',
    manager_name: null,
    manager_user_id: null,
    address: 'Quartier Anfa Supérieur, Casablanca',
    date_start: isoDaysAgo(28),
    date_end_prev: isoDaysAgo(-90),
    budget_total: 150000,
    budget_labor: 90000,
    budget_materials: 50000,
    budget_equipment: 10000,
    contract_value: 180000,
    status: 'active',
  });
}

async function seedVillaActivity(
  chantier: Chantier,
  workers: SharedPool['workers'],
  items: SharedPool['items']
): Promise<{ attendance: number; consumption: number }> {
  const days = workingDaysBetween(28, 0);
  const team = [
    workers.hassan,
    workers.mohamed,
    workers.youssef,
    workers.karim,
    workers.said,
    workers.rachid,
  ];

  // Lighter absence pattern — 1–2 per worker = ~8 across the team, all green.
  const absencePattern: Record<string, number[]> = {
    [workers.hassan.id]: [5],
    [workers.mohamed.id]: [8],
    [workers.youssef.id]: [12],
    [workers.karim.id]: [2, 18],
    [workers.said.id]: [14],
    [workers.rachid.id]: [9],
  };
  const ABSENCE_REASONS = ['maladie', 'pas_venu', 'conge', 'autre'];

  const rows: UpsertAttendanceInput[] = [];
  for (const worker of team) {
    const absent = absencePattern[worker.id] ?? [];
    for (let i = 0; i < days.length; i++) {
      const date = days[i];
      if (!date) continue;
      const absIdx = absent.indexOf(i);
      const isAbsent = absIdx >= 0;
      rows.push({
        chantier_id: chantier.id,
        worker_id: worker.id,
        attendance_date: date,
        status: isAbsent ? 'A' : 'P',
        absence_reason: isAbsent ? (ABSENCE_REASONS[absIdx % 4] ?? 'autre') : null,
        prime_amount: 0,
        prime_motif: null,
        note: null,
      });
    }
  }

  applyPrime(rows, workers.hassan.id, days[10], 150, 'Pose des fondations');
  applyPrime(rows, workers.said.id, days[20], 100, 'Installation tableau électrique');
  applyPrime(rows, workers.mohamed.id, days[15], 80, 'Pose murs extérieurs');
  applyPrime(rows, workers.rachid.id, days[22], 70, 'Réseau d’eau');

  await bulkUpsertAttendance(rows);

  // Consumption — 5 events including 1 loss.
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.ciment.id,
    qty: 80,
    used_at: isoDaysAgo(22),
    is_loss: false,
    notes: 'Fondations',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.sable.id,
    qty: 3,
    used_at: isoDaysAgo(20),
    is_loss: false,
    notes: 'Mortier fondations',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.brique.id,
    qty: 600,
    used_at: isoDaysAgo(12),
    is_loss: false,
    notes: 'Murs RDC',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.acier.id,
    qty: 200,
    used_at: isoDaysAgo(15),
    is_loss: false,
    notes: 'Armatures dalle haute',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.gravier.id,
    qty: 1,
    used_at: isoDaysAgo(10),
    is_loss: true,
    notes: 'Sac percé pendant le transport',
  });

  return { attendance: rows.length, consumption: 5 };
}

function applyPrime(
  rows: UpsertAttendanceInput[],
  workerId: string,
  date: string | undefined,
  amount: number,
  motif: string
): void {
  if (!date) return;
  const row = rows.find((r) => r.worker_id === workerId && r.attendance_date === date);
  if (row && row.status === 'P') {
    row.prime_amount = amount;
    row.prime_motif = motif;
  }
}

// ─── planning seed ──────────────────────────────────────────────────────

async function seedAtelierPlanning(
  chantier: Chantier,
  workers: SharedPool['workers']
): Promise<number> {
  // Closed project — a single flat task showing the work that was done.
  await createTask({
    chantier_id: chantier.id,
    label: 'Réfection complète atelier',
    start_date: isoDaysAgo(85),
    duration_days: 55,
    status: 'done',
    sort_order: 0,
    assignee_worker_ids: [workers.hassan.id, workers.mohamed.id],
  });
  return 1;
}

async function seedVillaPlanning(
  chantier: Chantier,
  workers: SharedPool['workers']
): Promise<number> {
  // Active project — a parent group with children, plus a flat parallel task.
  const grosOeuvre = await createTask({
    chantier_id: chantier.id,
    label: 'Gros œuvre',
    start_date: isoDaysAgo(28),
    duration_days: 45,
    status: 'ongoing',
    sort_order: 0,
    assignee_worker_ids: [workers.hassan.id],
  });
  await createTask({
    chantier_id: chantier.id,
    parent_task_id: grosOeuvre.id,
    label: 'Fondations',
    start_date: isoDaysAgo(28),
    duration_days: 18,
    status: 'done',
    sort_order: 0,
    assignee_worker_ids: [workers.mohamed.id, workers.youssef.id, workers.karim.id],
  });
  await createTask({
    chantier_id: chantier.id,
    parent_task_id: grosOeuvre.id,
    label: 'Murs RDC',
    start_date: isoDaysAgo(10),
    duration_days: 25,
    status: 'ongoing',
    sort_order: 1,
    assignee_worker_ids: [workers.mohamed.id, workers.youssef.id],
  });
  await createTask({
    chantier_id: chantier.id,
    label: 'Plomberie réseau d’eau',
    start_date: isoDaysAgo(-2),
    duration_days: 14,
    status: 'todo',
    sort_order: 1,
    assignee_worker_ids: [workers.rachid.id],
  });
  await createTask({
    chantier_id: chantier.id,
    label: 'Installation électrique tableau',
    start_date: isoDaysAgo(-10),
    duration_days: 10,
    status: 'todo',
    sort_order: 2,
    assignee_worker_ids: [workers.said.id],
  });
  return 5;
}

// ─── clear ──────────────────────────────────────────────────────────────

export async function clearDemoData(): Promise<{ deleted: number }> {
  const orgId = getActiveOrgId();
  const supabase = getSupabase();
  const nowIso = new Date().toISOString();
  let deleted = 0;

  // 1. Find demo chantier ids (active and already-soft-deleted: we re-clear
  //    leftovers so a half-failed run can be cleaned up by a second click).
  const { data: chantiers, error: cErr } = await supabase
    .from('chantiers')
    .select('id')
    .eq('org_id', orgId)
    .like('name', `${DEMO_NAME_PREFIX}%`);
  if (cErr) throw mapSupabaseError(cErr);
  const chantierIds = (chantiers ?? []).map((c) => (c as { id: string }).id);

  // 2. Find demo supplier ids.
  const { data: suppliers, error: sErr } = await supabase
    .from('suppliers')
    .select('id')
    .eq('org_id', orgId)
    .like('name', `${DEMO_NAME_PREFIX}%`);
  if (sErr) throw mapSupabaseError(sErr);
  const supplierIds = (suppliers ?? []).map((s) => (s as { id: string }).id);

  // 3. Attendance — hard delete (table has no deleted_at column).
  if (chantierIds.length > 0) {
    const { data, error } = await supabase
      .from('attendance')
      .delete()
      .eq('org_id', orgId)
      .in('chantier_id', chantierIds)
      .select('id');
    if (error) throw mapSupabaseError(error);
    deleted += data?.length ?? 0;
  }

  // 3b. Tasks — soft delete by chantier. task_assignments cascade only on
  //     hard-delete; for soft-delete they remain but are invisible (joined
  //     via the soft-deleted task).
  if (chantierIds.length > 0) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ deleted_at: nowIso })
      .eq('org_id', orgId)
      .in('chantier_id', chantierIds)
      .is('deleted_at', null)
      .select('id');
    if (error) throw mapSupabaseError(error);
    deleted += data?.length ?? 0;
  }

  // 4. Consumption — soft delete by chantier.
  if (chantierIds.length > 0) {
    const { data, error } = await supabase
      .from('consumables_consumption')
      .update({ deleted_at: nowIso })
      .eq('org_id', orgId)
      .in('chantier_id', chantierIds)
      .is('deleted_at', null)
      .select('id');
    if (error) throw mapSupabaseError(error);
    deleted += data?.length ?? 0;
  }

  // 4b. Client payments — soft delete by chantier.
  if (chantierIds.length > 0) {
    const { data, error } = await supabase
      .from('chantier_payments')
      .update({ deleted_at: nowIso })
      .eq('org_id', orgId)
      .in('chantier_id', chantierIds)
      .is('deleted_at', null)
      .select('id');
    if (error) throw mapSupabaseError(error);
    deleted += data?.length ?? 0;
  }

  // 4c. Materiel deployments — soft delete by chantier (must come before
  //     the materiels themselves so we don't lose the link).
  if (chantierIds.length > 0) {
    const { data, error } = await supabase
      .from('materiel_deployments')
      .update({ deleted_at: nowIso })
      .eq('org_id', orgId)
      .in('chantier_id', chantierIds)
      .is('deleted_at', null)
      .select('id');
    if (error) throw mapSupabaseError(error);
    deleted += data?.length ?? 0;
  }

  // 4d. Materiels — soft delete by name prefix.
  {
    const { data, error } = await supabase
      .from('materiels')
      .update({ deleted_at: nowIso })
      .eq('org_id', orgId)
      .like('name', `${DEMO_NAME_PREFIX}%`)
      .is('deleted_at', null)
      .select('id');
    if (error) throw mapSupabaseError(error);
    deleted += data?.length ?? 0;
  }

  // 5. Purchases — soft delete by supplier (purchase headers carry a
  //    supplier_id; demo purchases all use demo suppliers).
  if (supplierIds.length > 0) {
    const { data, error } = await supabase
      .from('consumables_purchases')
      .update({ deleted_at: nowIso })
      .eq('org_id', orgId)
      .in('supplier_id', supplierIds)
      .is('deleted_at', null)
      .select('id');
    if (error) throw mapSupabaseError(error);
    deleted += data?.length ?? 0;
  }

  // 6. Items.
  {
    const { data, error } = await supabase
      .from('consumables_items')
      .update({ deleted_at: nowIso })
      .eq('org_id', orgId)
      .like('name', `${DEMO_NAME_PREFIX}%`)
      .is('deleted_at', null)
      .select('id');
    if (error) throw mapSupabaseError(error);
    deleted += data?.length ?? 0;
  }

  // 7. Workers.
  {
    const { data, error } = await supabase
      .from('workers')
      .update({ deleted_at: nowIso })
      .eq('org_id', orgId)
      .like('full_name', `${DEMO_NAME_PREFIX}%`)
      .is('deleted_at', null)
      .select('id');
    if (error) throw mapSupabaseError(error);
    deleted += data?.length ?? 0;
  }

  // 8. Suppliers.
  {
    const { data, error } = await supabase
      .from('suppliers')
      .update({ deleted_at: nowIso })
      .eq('org_id', orgId)
      .like('name', `${DEMO_NAME_PREFIX}%`)
      .is('deleted_at', null)
      .select('id');
    if (error) throw mapSupabaseError(error);
    deleted += data?.length ?? 0;
  }

  // 9. Chantiers — last, so the cascade order matches FK direction.
  {
    const { data, error } = await supabase
      .from('chantiers')
      .update({ deleted_at: nowIso })
      .eq('org_id', orgId)
      .like('name', `${DEMO_NAME_PREFIX}%`)
      .is('deleted_at', null)
      .select('id');
    if (error) throw mapSupabaseError(error);
    deleted += data?.length ?? 0;
  }

  return { deleted };
}
