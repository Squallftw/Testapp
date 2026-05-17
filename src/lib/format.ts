import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const MAD_FMT = new Intl.NumberFormat('fr-MA', {
  style: 'currency',
  currency: 'MAD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const MAD_FMT_PRECISE = new Intl.NumberFormat('fr-MA', {
  style: 'currency',
  currency: 'MAD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Format a monetary amount as « 12 345 MAD » (no decimals). */
export function formatMAD(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  if (!Number.isFinite(amount)) return '—';
  return MAD_FMT.format(amount);
}

/** Format with 2 decimals — for unit prices, daily rates, totals on invoices. */
export function formatMADPrecise(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  if (!Number.isFinite(amount)) return '—';
  return MAD_FMT_PRECISE.format(amount);
}

/** Format ISO date as « 15 mai 2026 ». Null-safe. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'd MMM yyyy', { locale: fr });
  } catch {
    return iso;
  }
}

/** Format ISO date as « 15/05/2026 ». Compact, for tables. */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy', { locale: fr });
  } catch {
    return iso;
  }
}

/** Format ISO timestamp as « 15/05/2026 14:30 ». */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'dd/MM/yyyy HH:mm', { locale: fr });
  } catch {
    return iso;
  }
}

const PCT_FMT = new Intl.NumberFormat('fr-MA', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  if (!Number.isFinite(value)) return '—';
  return PCT_FMT.format(value);
}
