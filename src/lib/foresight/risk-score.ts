import type {
  RiskDriver,
  RiskLevel,
  RiskScore,
  RiskScoreInput,
} from './types';

const COST_YELLOW_PCT = 0.05;
const COST_RED_PCT = 0.15;
const SCHEDULE_YELLOW_DAYS = 5;
const SCHEDULE_RED_DAYS = 15;

function frPct(pct: number): string {
  const sign = pct >= 0 ? '+' : '';
  return `${sign}${(pct * 100).toFixed(0)}%`;
}

function frMAD(n: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(n) + ' MAD';
}

export function computeRisk(input: RiskScoreInput): RiskScore {
  const drivers: RiskDriver[] = [];
  let level: RiskLevel = 'green';

  function bump(target: RiskLevel) {
    if (target === 'red' || (target === 'yellow' && level === 'green')) {
      level = target;
    }
  }

  // Cost dimension
  if (input.cost.kind === 'ok') {
    const v = input.cost.variancePct;
    if (v >= COST_RED_PCT) {
      drivers.push({
        kind: 'cost_variance',
        severity: 'critical',
        message: `Budget projeté à ${frMAD(input.cost.projected)} (${frPct(v)} vs budget)`,
      });
      bump('red');
    } else if (v >= COST_YELLOW_PCT) {
      drivers.push({
        kind: 'cost_variance',
        severity: 'warning',
        message: `Budget projeté à ${frMAD(input.cost.projected)} (${frPct(v)} vs budget)`,
      });
      bump('yellow');
    }
  }

  // Schedule dimension
  if (input.schedule.kind === 'ok') {
    const d = input.schedule.deltaDays;
    if (d >= SCHEDULE_RED_DAYS) {
      drivers.push({
        kind: 'schedule_delay',
        severity: 'critical',
        message: `Livraison projetée ${d} jours après le délai`,
      });
      bump('red');
    } else if (d >= SCHEDULE_YELLOW_DAYS) {
      drivers.push({
        kind: 'schedule_delay',
        severity: 'warning',
        message: `Livraison projetée ${d} jours après le délai`,
      });
      bump('yellow');
    }
  }

  // Alerts
  if (input.alerts.critical > 0) {
    drivers.push({
      kind: 'critical_alert',
      severity: 'critical',
      message: `${input.alerts.critical} alerte${input.alerts.critical > 1 ? 's' : ''} critique${input.alerts.critical > 1 ? 's' : ''} active${input.alerts.critical > 1 ? 's' : ''}`,
    });
    bump('red');
  }
  if (input.alerts.warning > 0) {
    drivers.push({
      kind: 'warning_alert',
      severity: 'warning',
      message: `${input.alerts.warning} alerte${input.alerts.warning > 1 ? 's' : ''} d'avertissement`,
    });
    bump('yellow');
  }

  // Cash position
  if (input.cashPosition < 0) {
    drivers.push({
      kind: 'cash_negative',
      severity: 'critical',
      message: `Trésorerie négative (${frMAD(input.cashPosition)})`,
    });
    bump('red');
  }

  // Stock
  if (input.lowStockCount > 0) {
    drivers.push({
      kind: 'low_stock',
      severity: 'warning',
      message: `${input.lowStockCount} article${input.lowStockCount > 1 ? 's' : ''} sous le seuil de stock`,
    });
    bump('yellow');
  }

  // Payments
  if (input.overduePaymentCount > 0) {
    drivers.push({
      kind: 'overdue_payment',
      severity: 'warning',
      message: `${input.overduePaymentCount} paiement${input.overduePaymentCount > 1 ? 's' : ''} en retard`,
    });
    bump('yellow');
  }

  return { level, drivers };
}
