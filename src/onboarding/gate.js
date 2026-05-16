// ============================================================================
//  Batitrack — Onboarding gate (pure routing decision, UMD)
//  Given (session, userState, requestedHash), return either:
//    { allow: true,  page: <string> }   ← render this page
//    { redirectTo:  '<hash>', next?: <path> }  ← bounce the browser here
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.bati = root.bati || {};
    root.bati.onboarding = Object.assign({}, root.bati.onboarding || {}, factory());
  }
}(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this), function () {

  var PROTECTED_ROUTES = [
    'dashboard',
    'planning',
    'chantiers',
    'pointage',
    'affectations',
    'ouvriers',
    'materiels',
    'consommables',
    'parametres',
  ];
  var DEFAULT_PAGE = 'dashboard';

  function parseHash(hash) {
    var h = (hash || '').replace(/^#/, '');
    if (h.charAt(0) === '/') h = h.slice(1);
    var qIdx = h.indexOf('?');
    var path = qIdx >= 0 ? h.slice(0, qIdx) : h;
    var query = {};
    if (qIdx >= 0) {
      var qs = h.slice(qIdx + 1);
      qs.split('&').forEach(function (kv) {
        if (!kv) return;
        var eq = kv.indexOf('=');
        var k = eq < 0 ? kv : kv.slice(0, eq);
        var v = eq < 0 ? '' : kv.slice(eq + 1);
        try { query[decodeURIComponent(k)] = decodeURIComponent(v); }
        catch (_) { query[k] = v; }
      });
    }
    return { path: path, query: query };
  }

  function sanitizeNext(next) {
    if (typeof next !== 'string' || next === '') return null;
    if (next.charAt(0) !== '/') return null;
    if (next.charAt(1) === '/') return null;
    var route = next.slice(1);
    if (PROTECTED_ROUTES.indexOf(route) === -1) return null;
    return route;
  }

  function hasAnyChantier(userState) {
    return !!(userState && Array.isArray(userState.chantiers) && userState.chantiers.length > 0);
  }

  function decideRoute(args) {
    var session = args.session;
    var userState = args.userState;
    var parsed = parseHash(args.requestedHash);
    var path = parsed.path;
    var query = parsed.query;

    if (!session) {
      return { redirectTo: '#/login', next: '/' + path };
    }

    var chantierExists = hasAnyChantier(userState);

    if (args.justCreatedChantier) {
      var safe = sanitizeNext(query.next);
      return { redirectTo: '#/' + (safe || DEFAULT_PAGE) };
    }

    if (!chantierExists) {
      if (path === 'onboarding' || path === '') {
        return { allow: true, page: 'onboarding' };
      }
      return { redirectTo: '#/onboarding?next=' + encodeURIComponent('/' + path) };
    }

    if (path === 'onboarding') {
      return { redirectTo: '#/' + DEFAULT_PAGE };
    }
    if (path === '' || PROTECTED_ROUTES.indexOf(path) === -1) {
      if (path === '') return { allow: true, page: DEFAULT_PAGE };
      return { redirectTo: '#/' + DEFAULT_PAGE };
    }
    return { allow: true, page: path };
  }

  return {
    decideRoute: decideRoute,
    parseHash: parseHash,
    sanitizeNext: sanitizeNext,
    hasAnyChantier: hasAnyChantier,
    PROTECTED_ROUTES: PROTECTED_ROUTES,
    DEFAULT_PAGE: DEFAULT_PAGE,
  };
}));
