/**
 * Dev-only demo seeder. Creates four coherent chantiers (one completed,
 * one healthy active, one overdue/over-budget/cash-tight, one burning fast
 * with a consumption spike) plus the shared org-wide pool of workers,
 * suppliers, items, and purchases. The numbers are engineered so that once
 * the Watchdog cron fires, every alert rule lights up at least once.
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
const RESIDENCE_NAME = `${DEMO_NAME_PREFIX}Résidence Salam, Salé`;
const SHOWROOM_NAME = `${DEMO_NAME_PREFIX}Showroom Auto Maarif`;

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

  const residence = await createResidenceChantier();
  counts.chantiers += 1;
  const residenceStats = await seedResidenceActivity(residence, workers, items);
  counts.attendance += residenceStats.attendance;
  counts.consumption += residenceStats.consumption;
  counts.tasks += await seedResidencePlanning(residence, workers);
  counts.payments += await seedResidencePayments(residence);
  counts.deployments += await seedResidenceDeployments(residence, materielsPool);

  const showroom = await createShowroomChantier();
  counts.chantiers += 1;
  const showroomStats = await seedShowroomActivity(showroom, workers, items);
  counts.attendance += showroomStats.attendance;
  counts.consumption += showroomStats.consumption;
  counts.tasks += await seedShowroomPlanning(showroom, workers);
  counts.payments += await seedShowroomPayments(showroom);
  counts.deployments += await seedShowroomDeployments(showroom, materielsPool);

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

async function seedResidenceDeployments(
  residence: Chantier,
  pool: MaterielsPool
): Promise<number> {
  // Active chantier dragging on past planned end. Equipment costs blow
  // through the 8 000 MAD budget (~10 590 MAD spent → 132 % → critical).
  const deps = [
    { mat: pool.echafaudage, start: 50, end: 5, qty: 1 }, // 46 j × 180 = 8 280
    { mat: pool.betonniere, start: 55, end: 40, qty: 1 }, // 16 j × 60 = 960
    { mat: pool.camionBenne, start: 45, end: 43, qty: 1 }, // 3 j × 450 = 1 350
  ];
  for (const d of deps) {
    await createDeployment({
      materiel_id: d.mat.id,
      chantier_id: residence.id,
      start_date: isoDaysAgo(d.start),
      end_date: isoDaysAgo(d.end),
      qty: d.qty,
    });
  }
  return deps.length;
}

async function seedShowroomDeployments(
  showroom: Chantier,
  pool: MaterielsPool
): Promise<number> {
  // Active chantier, equipment well under its 15 000 MAD budget (~3 380).
  const deps = [
    { mat: pool.marteauPiqueur, start: 20, end: 16, qty: 1 }, // démolition
    { mat: pool.betonniere, start: 18, end: 4, qty: 1 }, // gros œuvre
    { mat: pool.generateur, start: 18, end: 0, qty: 1 }, // alim chantier ongoing
  ];
  for (const d of deps) {
    await createDeployment({
      materiel_id: d.mat.id,
      chantier_id: showroom.id,
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

async function seedResidencePayments(residence: Chantier): Promise<number> {
  // Client only paid a small acompte — drives cash_negative warning
  // (40 000 received / ~110 000 spent ≈ 36 %, well below the 70 % floor).
  await createPayment({
    chantier_id: residence.id,
    payment_date: isoDaysAgo(45),
    amount: 40000,
    reference: 'Acompte démarrage — Virement CIH',
    attachment_url: null,
    notes: null,
  });
  return 1;
}

async function seedShowroomPayments(showroom: Chantier): Promise<number> {
  // 30 % acompte — 39 000 / ~55 000 spent ≈ 71 %, just above the 70 % floor
  // so cash_negative stays silent on this chantier (Résidence is the example).
  await createPayment({
    chantier_id: showroom.id,
    payment_date: isoDaysAgo(15),
    amount: 39000,
    reference: 'Acompte 30% — Virement BMCE',
    attachment_url: null,
    notes: null,
  });
  return 1;
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
    reorder_threshold: 20,
    has_expiry: false,
    notes: null,
  });
  const peinture = await createItem({
    name: `${DEMO_NAME_PREFIX}Peinture blanche 20 L`,
    category: 'Finitions',
    unit: 'pot',
    average_price: 320,
    default_supplier_id: quincaillerie.id,
    reorder_threshold: 5,
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
  // P5 — stockage pour Résidence + Showroom. Sable bumped from 6 → 12 m³ so
  // the consumed/on-hand math leaves sable comfortably above its threshold
  // of 3 m³ (purchased 24, consumed 18, on-hand 6) and doesn't fire a
  // spurious stock_low on a non-target item.
  await createPurchase({
    supplier_id: suppliers.ciments.id,
    purchased_at: isoDaysAgo(50),
    payment_status: 'paid',
    invoice_ref: 'CDM-2024-0125',
    notes: 'Stockage pour Résidence Salam et Showroom Maarif.',
    lines: [
      { item_id: items.ciment.id, qty: 250, unit_price: 78, total: 19500 },
      { item_id: items.sable.id, qty: 12, unit_price: 180, total: 2160 },
      { item_id: items.gravier.id, qty: 4, unit_price: 220, total: 880 },
    ],
  });
  // P6 — pending 35 days old → supplier_purchase_aging warning.
  await createPurchase({
    supplier_id: suppliers.quincaillerie.id,
    purchased_at: isoDaysAgo(35),
    payment_status: 'pending',
    invoice_ref: 'QH-2024-0201',
    notes: 'Acier + briques Résidence Salam — paiement à 60 jours convenu.',
    lines: [
      { item_id: items.acier.id, qty: 800, unit_price: 14, total: 11200 },
      { item_id: items.brique.id, qty: 2000, unit_price: 2.5, total: 5000 },
    ],
  });
  // P7 — pending 65 days old → supplier_purchase_aging critical.
  await createPurchase({
    supplier_id: suppliers.ciments.id,
    purchased_at: isoDaysAgo(65),
    payment_status: 'pending',
    invoice_ref: 'CDM-2024-0098',
    notes: 'Facture en attente — relance fournisseur faite.',
    lines: [
      { item_id: items.ciment.id, qty: 150, unit_price: 78, total: 11700 },
    ],
  });
  return 7;
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

// ─── Chantier C — Résidence Salam (overdue, over-budget, cash-tight) ────

async function createResidenceChantier(): Promise<Chantier> {
  const palette = CHANTIER_COLOR_PALETTE[2]!;
  return createChantier({
    name: RESIDENCE_NAME,
    type: 'Construction neuve',
    color: palette.color,
    color_soft: palette.soft,
    client_name: 'Promoteur Salam Habitat',
    manager_name: null,
    manager_user_id: null,
    address: 'Lotissement Salam, Salé',
    date_start: isoDaysAgo(60),
    date_end_prev: isoDaysAgo(10), // 10 days past planned end → chantier_overdue critical
    budget_total: 150000,
    budget_labor: 75000, // exceeded (~76 k spent)
    budget_materials: 50000, // stays under (~24 k)
    budget_equipment: 8000, // exceeded (~10.6 k → critical)
    contract_value: 180000,
    status: 'active',
  });
}

async function seedResidenceActivity(
  chantier: Chantier,
  workers: SharedPool['workers'],
  items: SharedPool['items']
): Promise<{ attendance: number; consumption: number }> {
  const days = workingDaysBetween(60, 0); // ~52 working days
  const team = [
    workers.hassan,
    workers.mohamed,
    workers.youssef,
    workers.karim,
    workers.said,
  ];

  // 3 absences per worker (15 total). Trimmed from the original ~4 pattern
  // so the labour cost lands cleanly above the 75 000 MAD budget rather
  // than just under it; the absence rate (~6 %) is still realistic.
  const absencePattern: Record<string, number[]> = {
    [workers.hassan.id]: [5, 18, 32],
    [workers.mohamed.id]: [3, 14, 26],
    [workers.youssef.id]: [7, 19, 31],
    [workers.karim.id]: [9, 22, 35],
    [workers.said.id]: [4, 16, 28],
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

  // Primes (hassan moved to day[10] to avoid clashing with his day[5] absence).
  applyPrime(rows, workers.hassan.id, days[10], 150, 'Suivi de chantier');
  applyPrime(rows, workers.mohamed.id, days[15], 100, 'Heures supplémentaires');
  applyPrime(rows, workers.youssef.id, days[25], 100, 'Pose carrelage');
  applyPrime(rows, workers.said.id, days[35], 200, 'Tableau électrique complet');
  applyPrime(rows, workers.karim.id, days[45], 80, 'Travail soigné');

  await bulkUpsertAttendance(rows);

  // Consumption — 8 events sized to drain peinture (0 on-hand → stock_low
  // critical) and carrelage (5 on-hand → stock_low warning) from the
  // shared pool once the Showroom chantier consumes its share too.
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.ciment.id,
    qty: 120,
    used_at: isoDaysAgo(55),
    is_loss: false,
    notes: 'Fondations',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.sable.id,
    qty: 6,
    used_at: isoDaysAgo(52),
    is_loss: false,
    notes: 'Mortier',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.gravier.id,
    qty: 3,
    used_at: isoDaysAgo(50),
    is_loss: false,
    notes: 'Béton dalle',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.brique.id,
    qty: 1200,
    used_at: isoDaysAgo(35),
    is_loss: false,
    notes: 'Cloisons + murs intérieurs',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.acier.id,
    qty: 450,
    used_at: isoDaysAgo(40),
    is_loss: false,
    notes: 'Armatures',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.carrelage.id,
    qty: 18,
    used_at: isoDaysAgo(15),
    is_loss: false,
    notes: 'Carrelage salons',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.cable.id,
    qty: 120,
    used_at: isoDaysAgo(20),
    is_loss: false,
    notes: 'Câblage électrique',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.peinture.id,
    qty: 2,
    used_at: isoDaysAgo(8),
    is_loss: false,
    notes: 'Apprêt murs intérieurs',
  });

  return { attendance: rows.length, consumption: 8 };
}

// ─── Chantier D — Showroom Auto Maarif (active, burning fast) ───────────

async function createShowroomChantier(): Promise<Chantier> {
  const palette = CHANTIER_COLOR_PALETTE[3]!;
  return createChantier({
    name: SHOWROOM_NAME,
    type: 'Aménagement commercial',
    color: palette.color,
    color_soft: palette.soft,
    client_name: 'Auto Distribution Maarif SARL',
    manager_name: null,
    manager_user_id: null,
    address: 'Boulevard Zerktouni, Maarif, Casablanca',
    date_start: isoDaysAgo(21),
    date_end_prev: isoDaysAgo(-60),
    budget_total: 100000,
    budget_labor: 50000,
    budget_materials: 35000,
    budget_equipment: 15000,
    contract_value: 130000,
    status: 'active',
  });
}

async function seedShowroomActivity(
  chantier: Chantier,
  workers: SharedPool['workers'],
  items: SharedPool['items']
): Promise<{ attendance: number; consumption: number }> {
  const days = workingDaysBetween(21, 0); // ~19 working days
  const team = [
    workers.hassan,
    workers.mohamed,
    workers.youssef,
    workers.karim,
    workers.rachid,
  ];

  // Light absence pattern — chantier only ran for ~3 weeks.
  const absencePattern: Record<string, number[]> = {
    [workers.hassan.id]: [3],
    [workers.mohamed.id]: [7],
    [workers.youssef.id]: [10],
    [workers.karim.id]: [5, 14],
    [workers.rachid.id]: [12],
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

  applyPrime(rows, workers.hassan.id, days[8], 100, 'Coordination chantier');
  applyPrime(rows, workers.mohamed.id, days[12], 80, 'Démolition rapide');
  applyPrime(rows, workers.rachid.id, days[15], 60, 'Pose réseau eau');

  await bulkUpsertAttendance(rows);

  // Consumption — three spread-out ciment events plus a today-spike for
  // consumption_anomaly. Today's qty bumped from 100 → 150 sacs so that
  // even after Villa's 80-sac entry at day −22 inflates the 30-day avg
  // (∼43 sacs/day), the ratio still clears the 3× threshold.
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.ciment.id,
    qty: 30,
    used_at: isoDaysAgo(18),
    is_loss: false,
    notes: 'Coulage dalle entrée',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.ciment.id,
    qty: 30,
    used_at: isoDaysAgo(10),
    is_loss: false,
    notes: 'Murs porteurs intérieurs',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.ciment.id,
    qty: 30,
    used_at: isoDaysAgo(4),
    is_loss: false,
    notes: 'Finition sol béton',
  });
  // TODAY — the anomaly spike (150 vs ~43 avg = ~3.5×, floor sac=5).
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.ciment.id,
    qty: 150,
    used_at: isoDaysAgo(0),
    is_loss: false,
    notes: 'Coulage massif fondations colonnes (livraison express)',
  });

  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.sable.id,
    qty: 5,
    used_at: isoDaysAgo(15),
    is_loss: false,
    notes: 'Mortier',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.brique.id,
    qty: 400,
    used_at: isoDaysAgo(12),
    is_loss: false,
    notes: 'Cloisons showroom',
  });
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.acier.id,
    qty: 150,
    used_at: isoDaysAgo(8),
    is_loss: false,
    notes: 'Armatures colonnes',
  });
  // Carrelage — completes the stock_low math (Résidence 18 + Showroom 7 = 25; 30 − 25 = 5).
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.carrelage.id,
    qty: 7,
    used_at: isoDaysAgo(3),
    is_loss: false,
    notes: 'Échantillonnage zone exposition',
  });
  // Peinture — completes the stock_low math (Résidence 2 + Showroom 2 = 4; 4 − 4 = 0).
  await createConsumption({
    chantier_id: chantier.id,
    task_id: null,
    item_id: items.peinture.id,
    qty: 2,
    used_at: isoDaysAgo(6),
    is_loss: false,
    notes: 'Apprêt cloisons',
  });

  return { attendance: rows.length, consumption: 10 };
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

async function seedResidencePlanning(
  chantier: Chantier,
  workers: SharedPool['workers']
): Promise<number> {
  // Three flat tasks. "Finitions intérieures" finishes 5 days late → warning.
  await createTask({
    chantier_id: chantier.id,
    label: 'Gros œuvre',
    start_date: isoDaysAgo(58),
    duration_days: 30,
    status: 'done',
    sort_order: 0,
    assignee_worker_ids: [workers.hassan.id, workers.mohamed.id, workers.youssef.id],
  });
  await createTask({
    chantier_id: chantier.id,
    label: 'Plomberie',
    start_date: isoDaysAgo(25),
    duration_days: 30,
    status: 'ongoing',
    sort_order: 1,
    assignee_worker_ids: [workers.karim.id],
  });
  // start −22, duration 18 → end on day −5 → 5 days late.
  await createTask({
    chantier_id: chantier.id,
    label: 'Finitions intérieures',
    start_date: isoDaysAgo(22),
    duration_days: 18,
    status: 'ongoing',
    sort_order: 2,
    assignee_worker_ids: [workers.youssef.id, workers.said.id],
  });
  return 3;
}

async function seedShowroomPlanning(
  chantier: Chantier,
  workers: SharedPool['workers']
): Promise<number> {
  await createTask({
    chantier_id: chantier.id,
    label: 'Démolition existant',
    start_date: isoDaysAgo(21),
    duration_days: 5,
    status: 'done',
    sort_order: 0,
    assignee_worker_ids: [workers.mohamed.id, workers.karim.id],
  });
  // start −15, duration 10 → end on day −6 → 6 days late → warning.
  await createTask({
    chantier_id: chantier.id,
    label: 'Gros œuvre intérieur',
    start_date: isoDaysAgo(15),
    duration_days: 10,
    status: 'ongoing',
    sort_order: 1,
    assignee_worker_ids: [workers.hassan.id, workers.mohamed.id, workers.youssef.id],
  });
  await createTask({
    chantier_id: chantier.id,
    label: 'Façade vitrée',
    start_date: isoDaysAgo(-10),
    duration_days: 14,
    status: 'todo',
    sort_order: 2,
    assignee_worker_ids: [workers.hassan.id],
  });
  return 3;
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
