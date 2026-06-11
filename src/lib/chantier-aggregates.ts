import type { Attendance } from '@/data/attendance';
import type { Worker } from '@/data/workers';

/**
 * Per-chantier attendance rollup over a fixed day window.
 * - laborSeries / presentSeries are aligned to the `days` array passed in.
 * - presentToday is the count of present workers on the `today` date.
 *
 * Shared by HomePage (portfolio cockpit) and the Pointage project picker so
 * both compute presence/labor from one code path.
 */
export interface ChantierAgg {
  laborSeries: number[];
  presentSeries: number[];
  presentToday: number;
}

export function aggregatePerChantier(
  attendance: Attendance[],
  workers: Worker[],
  days: string[],
  today: string
): Map<string, ChantierAgg> {
  const rateByWorker = new Map(
    workers.map((w) => [w.id, Number(w.daily_rate) || 0])
  );
  // (chantierId → date → labor cost for that day)
  const labor = new Map<string, Map<string, number>>();
  // (chantierId → date → count of present rows that day)
  const presentByDay = new Map<string, Map<string, number>>();

  for (const a of attendance) {
    let perChantier = labor.get(a.chantier_id);
    if (!perChantier) {
      perChantier = new Map();
      labor.set(a.chantier_id, perChantier);
    }
    let dayCost = perChantier.get(a.attendance_date) ?? 0;
    if (a.status === 'P') {
      dayCost += rateByWorker.get(a.worker_id) ?? 0;
      let pc = presentByDay.get(a.chantier_id);
      if (!pc) {
        pc = new Map();
        presentByDay.set(a.chantier_id, pc);
      }
      pc.set(a.attendance_date, (pc.get(a.attendance_date) ?? 0) + 1);
    }
    dayCost += Number(a.prime_amount) || 0;
    perChantier.set(a.attendance_date, dayCost);
  }

  const out = new Map<string, ChantierAgg>();
  const chantierIds = new Set<string>([
    ...labor.keys(),
    ...presentByDay.keys(),
  ]);
  for (const id of chantierIds) {
    const perDay = labor.get(id);
    const presentDay = presentByDay.get(id);
    out.set(id, {
      laborSeries: days.map((d) => perDay?.get(d) ?? 0),
      presentSeries: days.map((d) => presentDay?.get(d) ?? 0),
      presentToday: presentDay?.get(today) ?? 0,
    });
  }
  return out;
}
