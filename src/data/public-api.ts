// Anonymous (no-auth) reads for the public chantier client view at /c/:slug.
//
// This is the ONLY DAL file the public route is allowed to call — it's the
// frontend half of the `get_public_chantier(p_slug)` RPC (spec §7.1), the
// single widened-attack-surface read for the `anon` Postgres role.
//
// MVP status: live RPC not yet shipped (migration 0008_public_pages.sql is
// queued behind Gates 6-7). For now we resolve to a typed sample so the
// route is browsable end-to-end. Swap to the real call is a single line
// inside fetchPublicChantier() — types stay identical.

export type MilestoneStatus = 'done' | 'active' | 'pending';
export type PaymentStatus = 'paid' | 'upcoming' | 'future';

export interface PublicPhoto {
  id: string;
  /** Sequential number for the in-page "01 / 02 …" badge. Stable per upload. */
  num: number;
  caption: string;
  /** When true the caption is rendered bold — a small editorial pull-quote. */
  featured: boolean;
  /** Short DD/MM string — the public page never exposes full timestamps. */
  date: string;
  /** Chef initial + period: "H.", "M." — full names are server-side only. */
  authorInitial: string;
  /**
   * Placeholder CSS gradient until real signed-storage URLs land. Real shape
   * will replace this with `signedUrl: string` + `blurhash: string`.
   */
  placeholderBg: string;
  /** CSS aspect-ratio token: "4/5", "1/1", "3/4", etc. */
  aspect: string;
}

export interface PublicMilestone {
  id: string;
  label: string;
  detail: string;
  status: MilestoneStatus;
  dateLabel: string;
}

export interface PublicPaymentRow {
  id: string;
  label: string;
  subLabel: string;
  /** Whole-MAD amount. Money formatting is owned by the view, not the DAL. */
  amount: number;
  status: PaymentStatus;
}

export interface PublicChantier {
  slug: string;
  org: {
    name: string;
    /** Single character for the brand-mark tile. Owner-controlled at MVP. */
    initial: string;
    city: string;
    /** E.164, used to build the wa.me deep-link. */
    phone: string;
    /** Pretty-printed for humans; never used in URL construction. */
    phoneDisplay: string;
    contactPersonName: string;
  };
  chantier: {
    number: string;
    name: string;
    /**
     * Optional word from `name` rendered in italic display type. The view
     * splits the name around this string. When undefined, the whole name
     * renders in upright display type.
     */
    nameEmphasis?: string;
    type: string;
    location: string;
    startDate: string;
    startDateDisplay: string;
    lastUpdated: string;
    intro: string;
  };
  stats: {
    pctDone: number;
    deliveryDate: string;
    deliveryDayDisplay: string;
    deliveryYearDisplay: string;
  };
  photos: PublicPhoto[];
  milestones: PublicMilestone[];
  payments: {
    /** Owner-controlled opt-in. When false the section is omitted from the view. */
    enabled: boolean;
    note?: string;
    rows: PublicPaymentRow[];
  };
}

export async function fetchPublicChantier(slug: string): Promise<PublicChantier> {
  // TODO(0008_public_pages): swap for
  //   const { data, error } = await getSupabase().rpc('get_public_chantier', { p_slug: slug });
  //   if (error || !data) throw new Error('not found');
  //   return data as PublicChantier;
  // Until then, every slug resolves to the demo so the design surface is reviewable.
  await new Promise((resolve) => setTimeout(resolve, 220));
  return { ...SAMPLE_DATA, slug: slug || SAMPLE_DATA.slug };
}

const SAMPLE_DATA: PublicChantier = {
  slug: 'villa-anfa',
  org: {
    name: 'Atlas Bati Sud',
    initial: 'A',
    city: 'Casablanca',
    phone: '+212600000000',
    phoneDisplay: '+212 6 00 00 00 00',
    contactPersonName: 'Karim El Amrani',
  },
  chantier: {
    number: '042',
    name: 'Villa Anfa',
    nameEmphasis: 'Anfa',
    type: 'Villa contemporaine',
    location: 'Anfa',
    startDate: '2026-03-04',
    startDateDisplay: '4 mars 2026',
    lastUpdated: '17/05',
    intro:
      'Villa contemporaine de 320 m² avec piscine et patio intérieur, sur un terrain de 600 m² à Anfa Supérieur. Livraison clés en main pour la famille Bennani, prévue pour la fin de l’été 2026.',
  },
  stats: {
    pctDone: 67,
    deliveryDate: '2026-08-15',
    deliveryDayDisplay: '15 août',
    deliveryYearDisplay: '2026',
  },
  photos: [
    { id: 'p01', num: 1,  caption: 'Coulage dalle RDC',            featured: true,  date: '04/05', authorInitial: 'H.', placeholderBg: 'linear-gradient(160deg, #4a3a2a, #b88a5e 70%, #d9b888)', aspect: '4/5' },
    { id: 'p02', num: 2,  caption: 'Élévation mur sud',            featured: false, date: '06/05', authorInitial: 'H.', placeholderBg: 'linear-gradient(200deg, #c4b39a, #6e6357 65%, #2c2620)', aspect: '1/1' },
    { id: 'p03', num: 3,  caption: 'Vue patio depuis 1er étage',   featured: false, date: '08/05', authorInitial: 'M.', placeholderBg: 'linear-gradient(135deg, #243747, #4a6b7a 50%, #a8c4cf)', aspect: '3/4' },
    { id: 'p04', num: 4,  caption: 'Ferraillage poutre',           featured: false, date: '09/05', authorInitial: 'H.', placeholderBg: 'linear-gradient(170deg, #8a4528, #c47a4f 60%, #e0b698)', aspect: '4/3' },
    { id: 'p05', num: 5,  caption: 'Terrain jardin nord',          featured: false, date: '10/05', authorInitial: 'H.', placeholderBg: 'linear-gradient(180deg, #1f2a23, #4d5e4a 55%, #8da080)', aspect: '5/7' },
    { id: 'p06', num: 6,  caption: 'Coffrage escalier',            featured: false, date: '11/05', authorInitial: 'H.', placeholderBg: 'linear-gradient(225deg, #b5a285, #7a6b54 60%, #3d352a)', aspect: '1/1' },
    { id: 'p07', num: 7,  caption: 'Pose linteau entrée',          featured: true,  date: '12/05', authorInitial: 'M.', placeholderBg: 'linear-gradient(145deg, #2d2018, #6b4c33 55%, #cca377)', aspect: '3/2' },
    { id: 'p08', num: 8,  caption: 'Maçonnerie 2e étage',          featured: false, date: '13/05', authorInitial: 'H.', placeholderBg: 'linear-gradient(195deg, #d3b88f, #9d7a52 70%, #5c4530)', aspect: '4/5' },
    { id: 'p09', num: 9,  caption: 'Charpente toiture',            featured: false, date: '14/05', authorInitial: 'M.', placeholderBg: 'linear-gradient(165deg, #74798a, #3d465a 55%, #1a1f2a)', aspect: '3/4' },
    { id: 'p10', num: 10, caption: 'Briques de façade',            featured: false, date: '15/05', authorInitial: 'H.', placeholderBg: 'linear-gradient(140deg, #b85c38, #8a3f24 60%, #4a2412)', aspect: '1/1' },
    { id: 'p11', num: 11, caption: 'Sablage terrasse',             featured: false, date: '16/05', authorInitial: 'H.', placeholderBg: 'linear-gradient(190deg, #e0d2b3, #b8a584 50%, #786a4f)', aspect: '4/3' },
    { id: 'p12', num: 12, caption: 'Vue d’ensemble depuis route',  featured: true,  date: '17/05', authorInitial: 'H.', placeholderBg: 'linear-gradient(125deg, #354152, #5c6d83 55%, #b8c4d2)', aspect: '3/4' },
  ],
  milestones: [
    { id: 'm1', label: 'Fondations',    detail: 'Terrassement, semelles filantes, dallage RDC',     status: 'done',    dateLabel: '04 mars → 28 mars' },
    { id: 'm2', label: 'Gros œuvre',    detail: 'Élévations, planchers, charpente',                 status: 'done',    dateLabel: '29 mars → 10 mai' },
    { id: 'm3', label: 'Second œuvre',  detail: 'Cloisons, plomberie, électricité, enduits',        status: 'active',  dateLabel: 'en cours · depuis le 11 mai' },
    { id: 'm4', label: 'Finitions',     detail: 'Carrelage, peinture, menuiseries, faux-plafond',   status: 'pending', dateLabel: 'à partir du 20 juin' },
    { id: 'm5', label: 'Livraison',     detail: 'Nettoyage, levée de réserves, remise des clés',    status: 'pending', dateLabel: '15 août 2026' },
  ],
  payments: {
    enabled: true,
    note: 'Échéancier convenu au contrat. Les montants sont indicatifs ; pour toute question, contactez votre entrepreneur.',
    rows: [
      { id: 'pay1', label: 'Acompte de signature', subLabel: 'Versé le 04 mars 2026',         amount: 120_000, status: 'paid' },
      { id: 'pay2', label: 'Tranche fondations',   subLabel: 'Versée le 02 avril 2026',       amount: 200_000, status: 'paid' },
      { id: 'pay3', label: 'Tranche gros œuvre',   subLabel: 'Échéance prévue le 30 juin 2026', amount: 180_000, status: 'upcoming' },
      { id: 'pay4', label: 'Solde livraison',      subLabel: 'Prévu au 15 août 2026',         amount: 100_000, status: 'future' },
    ],
  },
};
