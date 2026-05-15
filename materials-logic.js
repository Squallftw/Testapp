// Pure consumable-material cost logic. Exported via window.MaterialsLogic.

(function () {
  'use strict';

  function materialTotalCost(m) {
    if (!m) return 0;
    const hasUnit = typeof m.unit_price === 'number' && !Number.isNaN(m.unit_price);
    const hasQty = typeof m.qty === 'number' && !Number.isNaN(m.qty);
    if (hasUnit && hasQty) {
      return Math.max(0, m.qty) * m.unit_price;
    }
    return m.cost || 0;
  }

  function materialsTotalForProject(materials) {
    return (materials || []).reduce((sum, m) => sum + materialTotalCost(m), 0);
  }

  function materialsByCategory(materials) {
    const map = new Map();
    (materials || []).forEach(m => {
      const key = m.category || 'autre';
      map.set(key, (map.get(key) || 0) + materialTotalCost(m));
    });
    return map;
  }

  function materialsByTask(materials) {
    const map = new Map();
    (materials || []).forEach(m => {
      const key = m.task_id == null ? null : m.task_id;
      map.set(key, (map.get(key) || 0) + materialTotalCost(m));
    });
    return map;
  }

  function materialsInRange(materials, startISO, endISO) {
    return (materials || []).filter(m => {
      if (!m.date) return false;
      return m.date >= startISO && m.date <= endISO;
    });
  }

  window.MaterialsLogic = {
    materialTotalCost,
    materialsTotalForProject,
    materialsByCategory,
    materialsByTask,
    materialsInRange
  };
})();
