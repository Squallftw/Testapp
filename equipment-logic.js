// Pure equipment cost logic. Exported via window.EquipmentLogic.

(function () {
  'use strict';

  const MS_PER_DAY = 86400000;

  function daysActive(startISO, endISO) {
    if (!startISO || !endISO) return 0;
    const s = new Date(startISO);
    const e = new Date(endISO);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 0;
    const diff = Math.round((e - s) / MS_PER_DAY);
    if (diff < 0) return 0;
    return diff + 1;  // inclusive
  }

  function equipmentRentalCost(e) {
    if (!e) return 0;
    const rate = typeof e.daily_rate === 'number' ? e.daily_rate : 0;
    return rate * daysActive(e.start_date, e.end_date);
  }

  function equipmentOwnedCost(e) {
    if (!e) return 0;
    const cost = typeof e.purchase_cost === 'number' ? e.purchase_cost : 0;
    const pct = typeof e.allocation_pct === 'number' ? e.allocation_pct : 100;
    return cost * pct / 100;
  }

  function equipmentTotalCost(e) {
    if (!e) return 0;
    if (e.kind === 'location') return equipmentRentalCost(e);
    if (e.kind === 'propriete') return equipmentOwnedCost(e);
    return 0;
  }

  function equipmentTotalForProject(equipment) {
    return (equipment || []).reduce((sum, e) => sum + equipmentTotalCost(e), 0);
  }

  function partitionByKind(equipment) {
    const out = { location: [], propriete: [] };
    (equipment || []).forEach(e => {
      if (e.kind === 'location') out.location.push(e);
      else if (e.kind === 'propriete') out.propriete.push(e);
    });
    return out;
  }

  function equipmentActiveOn(equipment, dateISO) {
    return (equipment || []).filter(e => {
      if (e.kind !== 'location') return false;
      if (!e.start_date || !e.end_date) return false;
      return e.start_date <= dateISO && dateISO <= e.end_date;
    });
  }

  window.EquipmentLogic = {
    daysActive,
    equipmentRentalCost,
    equipmentOwnedCost,
    equipmentTotalCost,
    equipmentTotalForProject,
    partitionByKind,
    equipmentActiveOn
  };
})();
