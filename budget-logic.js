// Pure budget aggregator. Exported via window.BudgetLogic.
// Relies on WorkforceLogic, MaterialsLogic, EquipmentLogic being already loaded.

(function () {
  'use strict';

  function budgetSummary(input) {
    const project = (input && input.project) || {};
    const workers = (input && input.workers) || [];
    const pointages = (input && input.pointages) || [];
    const soustraitants = (input && input.soustraitants) || [];
    const materials = (input && input.materials) || [];
    const equipment = (input && input.equipment) || [];

    const W = window.WorkforceLogic;
    const M = window.MaterialsLogic;
    const E = window.EquipmentLogic;

    const labour = W.projectLabourCost(pointages, workers);
    const soustraitantsCommitted = soustraitants.reduce((s, x) => s + (x.forfait || 0), 0);
    const soustraitantsPaid = soustraitants.reduce((s, x) => s + W.subPaid(x), 0);
    const matsTotal = M.materialsTotalForProject(materials);
    const eqTotal = E.equipmentTotalForProject(equipment);

    const totalCost = labour + soustraitantsCommitted + matsTotal + eqTotal;
    const devis = project.devis_client || 0;
    const budgetInterne = project.budget_interne || 0;

    const margeActuelle = devis - totalCost;
    const margeRestante = budgetInterne - totalCost;
    const margePct = devis > 0 ? Math.round(margeActuelle / devis * 100) : 0;
    const consumedPct = budgetInterne > 0 ? Math.round(totalCost / budgetInterne * 100) : 0;

    return {
      labour,
      soustraitantsCommitted,
      soustraitantsPaid,
      materials: matsTotal,
      equipment: eqTotal,
      totalCost,
      devis,
      budgetInterne,
      margeActuelle,
      margeRestante,
      margePct,
      consumedPct
    };
  }

  window.BudgetLogic = { budgetSummary };
})();
