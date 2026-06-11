import { projectCost } from './cost-projection';
import { projectSchedule } from './schedule-projection';
import { computeRisk } from './risk-score';
import type {
  ChantierForesight,
  ChantierForesightInput,
  OrgForesight,
  RiskLevel,
} from './types';

export function computeChantierForesight(
  input: ChantierForesightInput
): ChantierForesight {
  const cost = projectCost(input.cost);
  const schedule = projectSchedule(input.schedule);
  const risk = computeRisk({
    cost,
    schedule,
    alerts: input.alerts,
    lowStockCount: input.lowStockCount,
    overduePaymentCount: input.overduePaymentCount,
    cashPosition: input.cashPosition,
  });
  return {
    chantierId: input.chantierId,
    chantierName: input.chantierName,
    cost,
    schedule,
    risk,
  };
}

export function computeOrgForesight(
  inputs: ChantierForesightInput[]
): OrgForesight {
  const chantiers = inputs.map(computeChantierForesight);

  let portfolioBudget = 0;
  let portfolioProjected = 0;
  let adherenceSum = 0;
  let adherenceCount = 0;
  const riskCounts: Record<RiskLevel, number> = { green: 0, yellow: 0, red: 0 };

  for (const c of chantiers) {
    if (c.cost.kind === 'ok') {
      portfolioBudget += c.cost.budget;
      portfolioProjected += c.cost.projected;
    }
    if (c.schedule.kind === 'ok') {
      adherenceSum += c.schedule.scheduleAdherencePct;
      adherenceCount += 1;
    }
    riskCounts[c.risk.level] += 1;
  }

  return {
    chantiers,
    portfolioBudget,
    portfolioVariance: portfolioProjected - portfolioBudget,
    avgScheduleAdherence: adherenceCount > 0 ? adherenceSum / adherenceCount : NaN,
    riskCounts,
  };
}
