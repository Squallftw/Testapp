// ============================================================================
//  Batitrack — In-memory chantier store ops (pure, UMD)
//  These functions never touch Supabase. The caller (bootstrap / app)
//  is responsible for persisting the returned userState via __BATI_PERSIST_PATCH.
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    var validate = require('./validate-chantier.js');
    module.exports = factory(validate);
  } else {
    root.bati = root.bati || {};
    root.bati.onboarding = Object.assign({}, root.bati.onboarding || {}, factory(root.bati.onboarding));
  }
}(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function (validate) {

  var PALETTE = [
    { color: '#0E5460', colorSoft: '#D8E5E7' },
    { color: '#C25B3F', colorSoft: '#F2DCD3' },
    { color: '#C58122', colorSoft: '#F4E2C9' },
    { color: '#2E6B5C', colorSoft: '#D6E5DF' },
    { color: '#7A3E60', colorSoft: '#EAD8E0' },
    { color: '#3F5E8C', colorSoft: '#D8DFEB' },
  ];

  var __idCounter = 0;
  function nextId() {
    __idCounter += 1;
    var t = Date.now().toString(36);
    var r = Math.random().toString(36).slice(2, 8);
    var c = __idCounter.toString(36);
    return 'ch-' + t + '-' + c + '-' + r;
  }

  function listChantiers(userState) {
    if (!userState || !Array.isArray(userState.chantiers)) return [];
    return userState.chantiers;
  }

  function hasAnyChantier(userState) {
    return listChantiers(userState).length > 0;
  }

  function pickPalette(userState) {
    var existing = listChantiers(userState).length;
    return PALETTE[existing % PALETTE.length];
  }

  function addChantier(userState, input) {
    var v = validate.validateChantier(input);
    if (!v.valid) return { ok: false, errors: v.errors };

    var prev = userState || {};
    var paint = pickPalette(prev);

    var chantier = {
      id: nextId(),
      name: v.normalized.name,
      client: v.normalized.client,
      address: v.normalized.address,
      dateStart: v.normalized.dateStart,
      dateEndPrev: v.normalized.dateEndPrev,
      budgetMO: v.normalized.budgetMO,
      type: v.normalized.type,
      manager: v.normalized.manager || '',
      budget: v.normalized.budgetMO,
      budgetMaterials: 0,
      budgetLabor: v.normalized.budgetMO,
      contractValue: 0,
      payments: [],
      color: paint.color,
      colorSoft: paint.colorSoft,
      status: 'on-track',
      createdAt: Date.now(),
    };

    var next = {};
    Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
    var prevList = Array.isArray(prev.chantiers) ? prev.chantiers.slice() : [];
    prevList.push(chantier);
    next.chantiers = prevList;

    return { ok: true, userState: next, chantier: chantier };
  }

  return {
    listChantiers: listChantiers,
    hasAnyChantier: hasAnyChantier,
    addChantier: addChantier,
  };
}));
