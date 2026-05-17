import { z } from 'zod';

// Trim + collapse blank to undefined for optional fields.
function trimToUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

// ── Text ────────────────────────────────────────────────────────────────

export const nonEmptyText = (label = 'Ce champ') =>
  z.string().trim().min(1, `${label} est requis`);

export const optionalText = z
  .string()
  .optional()
  .transform((v) => trimToUndefined(v) ?? null);

// ── Money ───────────────────────────────────────────────────────────────

// Matches SQL `numeric(14, 2)`: non-negative, finite, ≤ 12 integer digits + 2 decimals.
// Strings are accepted from <input type="number"> and parsed.
const TWO_DECIMALS = /^-?\d+(\.\d{1,2})?$/;
export const monetaryAmount = z
  .preprocess((v) => {
    if (v === '' || v === null || v === undefined) return undefined;
    if (typeof v === 'string') return v.trim();
    return v;
  }, z.union([z.string(), z.number()]))
  .refine(
    (v) => {
      const str = String(v);
      if (!TWO_DECIMALS.test(str)) return false;
      const num = Number(str);
      return Number.isFinite(num) && num >= 0 && num < 1e12;
    },
    { message: 'Montant invalide (≥ 0, max 2 décimales)' }
  )
  .transform((v) => Number(v));

export const optionalMonetary = z
  .union([monetaryAmount, z.literal('')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : (v as number)));

// ── Dates (ISO yyyy-mm-dd from <input type="date">) ─────────────────────

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const optionalDate = z
  .string()
  .optional()
  .transform((v) => trimToUndefined(v))
  .refine((v) => v === undefined || ISO_DATE.test(v), {
    message: 'Date invalide (format AAAA-MM-JJ attendu)',
  })
  .transform((v) => v ?? null);

export const requiredDate = z
  .string()
  .trim()
  .min(1, 'Date requise')
  .regex(ISO_DATE, 'Date invalide (format AAAA-MM-JJ attendu)');

// ── Email & phone ───────────────────────────────────────────────────────

export const email = z
  .string()
  .trim()
  .email('Adresse email invalide');

export const optionalEmail = z
  .string()
  .optional()
  .transform((v) => trimToUndefined(v))
  .refine((v) => v === undefined || z.string().email().safeParse(v).success, {
    message: 'Adresse email invalide',
  })
  .transform((v) => v ?? null);

// Morocco phone: tolerant — accepts +212, 00212, leading 0, with or without
// separators. Stored normalised to +212XXXXXXXXX. Strict server-side validation
// not required for beta.
const PHONE_MA = /^(?:\+212|00212|0)[\s\-.]?[5-7](?:[\s\-.]?\d){8}$/;
export function normalisePhoneMA(raw: string): string {
  const digits = raw.replace(/[\s\-.]/g, '');
  if (digits.startsWith('+212')) return '+212' + digits.slice(4);
  if (digits.startsWith('00212')) return '+212' + digits.slice(5);
  if (digits.startsWith('0')) return '+212' + digits.slice(1);
  return digits;
}
export const optionalPhoneMA = z
  .string()
  .optional()
  .transform((v) => trimToUndefined(v))
  .refine((v) => v === undefined || PHONE_MA.test(v), {
    message: 'Numéro marocain invalide',
  })
  .transform((v) => (v === undefined ? null : normalisePhoneMA(v)));

// ── Moroccan business IDs ───────────────────────────────────────────────

// ICE = 15 digits exactly.
export const optionalIce = z
  .string()
  .optional()
  .transform((v) => trimToUndefined(v))
  .refine((v) => v === undefined || /^\d{15}$/.test(v), {
    message: 'ICE invalide (15 chiffres attendus)',
  })
  .transform((v) => v ?? null);

// RC and CNSS vary in format; accept free text for beta.
export const optionalRc = optionalText;
export const optionalCnss = optionalText;

// CIN (Carte d'Identité Nationale): 1–2 letters + 5–6 digits, e.g. AB123456.
export const optionalCin = z
  .string()
  .optional()
  .transform((v) => trimToUndefined(v))
  .refine((v) => v === undefined || /^[A-Z]{1,2}\d{5,6}$/i.test(v), {
    message: 'CIN invalide (format ex: AB123456)',
  })
  .transform((v) => (v === undefined ? null : v.toUpperCase()));

// ── Identifiers & color ─────────────────────────────────────────────────

export const uuid = z.string().uuid('Identifiant invalide');

// 6-digit hex colour like #2D7F8A.
export const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur invalide (format #RRGGBB attendu)');

// ── Quantity (consumables, transfers, etc.) ─────────────────────────────

// Quantity must be > 0 (matches SQL CHECK constraints). Up to 3 decimals
// (kg of cement, m of cable). Number or numeric string accepted.
export const positiveQuantity = z
  .preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.union([z.string(), z.number()])
  )
  .refine(
    (v) => {
      const num = Number(v);
      return Number.isFinite(num) && num > 0 && num < 1e9;
    },
    { message: 'Quantité invalide (> 0 requis)' }
  )
  .transform((v) => Number(v));

// ── Helpers ─────────────────────────────────────────────────────────────

/** Build a zod enum from a const tuple. Type-safe wrapper. */
export function enumOf<T extends readonly [string, ...string[]]>(values: T) {
  return z.enum(values);
}
