import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import type { ScheduleProjection, ScheduleProjectionInput } from './types';

const MIN_DAYS_ELAPSED = 7;

export function projectSchedule(input: ScheduleProjectionInput): ScheduleProjection {
  if (!input.dateStart || !input.dateEndPrev) {
    return { kind: 'insufficient', reason: 'no_dates' };
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

  let totalWeight = 0;
  let doneWeight = 0;
  for (const t of input.tasks) {
    const w = t.durationDays ?? 0;
    totalWeight += w;
    if (t.status === 'done') doneWeight += w;
  }
  if (totalWeight === 0) {
    return { kind: 'insufficient', reason: 'no_tasks' };
  }
  if (doneWeight === 0) {
    return { kind: 'insufficient', reason: 'no_velocity' };
  }

  const expectedWeightByNow = totalWeight * (daysElapsed / daysTotal);
  const scheduleAdherencePct = doneWeight / expectedWeightByNow;
  const weightPerDay = doneWeight / daysElapsed;
  const remaining = totalWeight - doneWeight;
  const daysRemainingProjected = Math.round(remaining / weightPerDay);
  const projectedEndDate = format(addDays(today, daysRemainingProjected), 'yyyy-MM-dd');
  const plannedEndDate = format(end, 'yyyy-MM-dd');
  const deltaDays = differenceInCalendarDays(parseISO(projectedEndDate), end);

  return {
    kind: 'ok',
    projectedEndDate,
    plannedEndDate,
    deltaDays,
    scheduleAdherencePct,
  };
}
