// ============================================================================
//  Batitrack — Chantier creation form validation (pure, UMD)
//  Loaded as a classic script in the browser → exposes
//    window.bati.onboarding.validateChantier
//  Loaded via require() in Node (Vitest) → exposes the same surface as CJS.
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.bati = root.bati || {};
    root.bati.onboarding = Object.assign({}, root.bati.onboarding || {}, factory());
  }
}(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  var REQUIRED_FIELDS = ['name', 'client', 'address', 'dateStart', 'dateEndPrev', 'budgetMO', 'type'];
  var CHANTIER_TYPES = ['Villa', 'Immeuble', 'Bureau', 'Industriel', 'Autre'];
  var MAX_NAME = 120;
  var MAX_CLIENT = 120;
  var MAX_ADDRESS = 200;
  var MAX_BUDGET = 1e12;
  var ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function isStr(v) { return typeof v === 'string'; }
  function trim(v) { return isStr(v) ? v.trim() : ''; }
  function parseISODate(s) {
    if (!isStr(s) || !ISO_DATE.test(s)) return null;
    var parts = s.split('-').map(function (n) { return parseInt(n, 10); });
    var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (isNaN(d.getTime())) return null;
    if (d.getUTCFullYear() !== parts[0] || d.getUTCMonth() !== parts[1] - 1 || d.getUTCDate() !== parts[2]) return null;
    if (parts[0] < 1900 || parts[0] > 2100) return null;
    return d;
  }

  function validateChantier(raw) {
    var input = raw || {};
    var errors = {};
    var normalized = {};

    // name
    var name = trim(input.name);
    if (!name) errors.name = 'Le nom du chantier est obligatoire.';
    else if (name.length > MAX_NAME) errors.name = 'Le nom dépasse ' + MAX_NAME + ' caractères.';
    else normalized.name = name;

    // client
    var client = trim(input.client);
    if (!client) errors.client = 'Le client est obligatoire.';
    else if (client.length > MAX_CLIENT) errors.client = 'Le client dépasse ' + MAX_CLIENT + ' caractères.';
    else normalized.client = client;

    // address
    var address = trim(input.address);
    if (!address) errors.address = "L'adresse est obligatoire.";
    else if (address.length > MAX_ADDRESS) errors.address = "L'adresse dépasse " + MAX_ADDRESS + ' caractères.';
    else normalized.address = address;

    // dateStart
    var dStart = parseISODate(input.dateStart);
    if (!dStart) errors.dateStart = 'Date de début invalide (format AAAA-MM-JJ, années 1900–2100).';
    else normalized.dateStart = input.dateStart;

    // dateEndPrev
    var dEnd = parseISODate(input.dateEndPrev);
    if (!dEnd) errors.dateEndPrev = 'Date de fin prévue invalide (format AAAA-MM-JJ).';
    else if (dStart && dEnd < dStart) errors.dateEndPrev = 'La fin prévue ne peut pas être antérieure au début.';
    else if (dStart) normalized.dateEndPrev = input.dateEndPrev;

    // budgetMO
    var rawBudget = input.budgetMO;
    var budget;
    if (typeof rawBudget === 'number') budget = rawBudget;
    else if (isStr(rawBudget) && rawBudget.trim() !== '') budget = Number(rawBudget);
    else budget = NaN;
    if (typeof budget !== 'number' || !isFinite(budget) || budget <= 0) {
      errors.budgetMO = 'Le budget main d\'œuvre doit être un nombre strictement positif.';
    } else if (budget > MAX_BUDGET) {
      errors.budgetMO = 'Le budget main d\'œuvre est trop élevé.';
    } else {
      normalized.budgetMO = budget;
    }

    // type
    if (!isStr(input.type) || CHANTIER_TYPES.indexOf(input.type) === -1) {
      errors.type = 'Type invalide. Valeurs acceptées : ' + CHANTIER_TYPES.join(', ') + '.';
    } else {
      normalized.type = input.type;
    }

    // optional manager
    if (input.manager != null) normalized.manager = trim(input.manager).slice(0, 120);

    var valid = Object.keys(errors).length === 0;
    return { valid: valid, errors: errors, normalized: valid ? normalized : null };
  }

  return {
    validateChantier: validateChantier,
    REQUIRED_FIELDS: REQUIRED_FIELDS,
    CHANTIER_TYPES: CHANTIER_TYPES,
  };
}));
