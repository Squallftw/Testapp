import { differenceInCalendarDays, parseISO } from 'date-fns';
import type { CostProjection, CostProjectionInput } from './types';

const MIN_DAYS_ELAPSED = 7;

export function projectCost(input: CostProjectionInput): CostProjection {
  if (!input.dateStart || !input.dateEndPrev) {
    return { kind: 'insufficient', reason: 'no_dates' };
  }
  if (input.budgetTotal <= 0) {
    return { kind: 'insufficient', reason: 'no_budget' };
  }
  const start = parseISO(input.dateStart);
  const end = parseISO(input.dateEndPrev);
  const today = parseISO(input.today);
  const daysTotal = differenceInCalendarDays(end, start) + 1;
  if (daysTotal <= 0) {
    return { kind: 'insufficient', reason: 'invalid_dates' };
  }
  const daysElapsed = differenceInCalendarDays(today, start) + 1;
  if (daysElapsed < MIN_DAYS_ELAPSED) {
    return { kind: 'insufficient', reason: 'too_early' };
  }
  const projected = (input.totalSpent / daysElapsed) * daysTotal;
  const variancePct = (projected - input.budgetTotal) / input.budgetTotal;
  return {
    kind: 'ok',
    projected,
    budget: input.budgetTotal,
    variancePct,
    daysElapsed,
    daysTotal,
  };
}
