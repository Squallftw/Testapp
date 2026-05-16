// ============================================================================
//  Batitrack — Boot sequence
//  Runs FIRST, gates the app behind authentication, then dynamically loads
//  every module so seed-data files can't leak demo data to fresh users.
// ============================================================================

const APP_MODULES = [
  // Onboarding pure-logic modules — must load before app.jsx so the gate can run.
  'src/onboarding/validate-chantier.js',
  'src/onboarding/chantier-store.js',
  'src/onboarding/gate.js',
  'src/onboarding/onboarding-screen.jsx',

  'src/helpers.jsx',
  'src/data.jsx',
  'src/icons.jsx',
  'src/layout.jsx',
  'src/pointage-popover.jsx',
  'src/pointage-quinzaine.jsx',
  'src/pointage-mois.jsx',
  'src/dashboard.jsx',
  'src/paie.jsx',
  'src/screens.jsx',
  'src/planning.jsx',
  'src/affectations.jsx',
  'src/materiels.jsx',
  'src/consommables-data.jsx',
  'src/consommables-forms.jsx',
  'src/consommables-tabs.jsx',
  'src/consommables.jsx',
  'src/budget-engine.jsx',
  'src/budget-dashboard.jsx',
  'src/app.jsx',
];

(async function bootstrap() {
  const root = document.getElementById('root');
  if (!root) { console.error('[batitrack] #root missing'); return; }

  if (!window.bati) {
    root.innerHTML = '<div style="padding:40px;text-align:center;font-family:Manrope,sans-serif;color:#7A2814">Erreur de chargement de Supabase. Vérifiez votre connexion et rafraîchissez la page.</div>';
    return;
  }

  // ── 1. Restore session ─────────────────────────────────────────────────
  let session = await window.bati.getSession();

  // ── 2. Show login if no session ────────────────────────────────────────
  if (!session) {
    const rootDom = ReactDOM.createRoot(root);
    await new Promise((resolve) => {
      function handleAuthed() {
        rootDom.unmount();
        resolve();
      }
      rootDom.render(<AuthScreen onAuthed={handleAuthed}/>);
    });
    session = await window.bati.getSession();
    if (!session) { location.reload(); return; }
  }

  // ── 3. Show loading splash while we hydrate ────────────────────────────
  const splashRoot = ReactDOM.createRoot(root);
  splashRoot.render(<AuthLoading/>);

  // ── 4. Load user state from Supabase ───────────────────────────────────
  const userId = session.user.id;
  const load = await window.bati.loadUserState(userId);
  if (load.error) {
    splashRoot.unmount();
    root.innerHTML = `
      <div style="padding:40px;max-width:480px;margin:60px auto;text-align:center;font-family:Manrope,sans-serif">
        <h2 style="color:#7A2814;margin:0 0 10px">Impossible de charger vos données</h2>
        <p style="color:#6B6359;font-size:13px">${escapeHtml(load.error)}</p>
        <button onclick="window.bati.signOut()" style="margin-top:14px;padding:8px 14px;background:#0E5460;color:#fff;border:none;border-radius:8px;font:600 13px Manrope,sans-serif;cursor:pointer">Se déconnecter</button>
      </div>`;
    return;
  }

  // ── 5. Wire globals consumed by data + module seeds ────────────────────
  window.__BATI_USER       = { id: userId, email: session.user.email };
  window.__BATI_USER_DATA  = load.state || {};
  window.__BATI_DEMO_MODE  = false;
  window.__BATI_SAVER      = window.bati.makeSaver(userId);

  window.bati.startIdleWatch();

  // ── 6. Dynamically load and run every module in order ──────────────────
  try {
    for (const path of APP_MODULES) {
      await loadBabelModule(path);
    }
  } catch (err) {
    console.error('[batitrack] module load failure', err);
    splashRoot.unmount();
    root.innerHTML = `
      <div style="padding:40px;max-width:520px;margin:60px auto;text-align:center;font-family:Manrope,sans-serif">
        <h2 style="color:#7A2814;margin:0 0 10px">Erreur de chargement</h2>
        <p style="color:#6B6359;font-size:13px;white-space:pre-wrap">${escapeHtml(String(err && err.message || err))}</p>
        <button onclick="location.reload()" style="margin-top:14px;padding:8px 14px;background:#0E5460;color:#fff;border:none;border-radius:8px;font:600 13px Manrope,sans-serif;cursor:pointer">Réessayer</button>
      </div>`;
    return;
  }

  // app.jsx is responsible for unmounting the splash and mounting <App/>.
  // Stash splashRoot in case app.jsx wants to clean up:
  window.__BATI_SPLASH_ROOT = splashRoot;
})();

async function loadBabelModule(path) {
  const res = await fetch(path, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Échec du chargement de ${path} (${res.status})`);
  const source = await res.text();
  let compiled;
  try {
    compiled = Babel.transform(source, {
      presets: [['react', { runtime: 'classic' }]],
      sourceType: 'script',
      filename: path,
    }).code;
  } catch (e) {
    throw new Error(`Erreur de compilation dans ${path}: ${e.message}`);
  }
  // Execute as a classic script so top-level const/let are visible across files
  // exactly the way <script type="text/babel"> already arranges them.
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.text = compiled + `\n//# sourceURL=${path}`;
    s.dataset.batitrack = path;
    try {
      document.body.appendChild(s);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}
