// ============================================================================
//  Batitrack — Mandatory chantier onboarding screen.
//  Rendered by App when window.bati.onboarding.hasAnyChantier(userState) is
//  false. Submitting saves a new chantier into the user blob, persists it via
//  __BATI_PERSIST_PATCH, and bubbles up via onCreated() so the app can switch
//  to the main shell.
// ============================================================================

function OnboardingScreen({ onCreated, nextPath }) {
  const { useState, useRef } = React;
  const ob = window.bati.onboarding;

  const [form, setForm] = useState({
    name: '',
    client: '',
    address: '',
    dateStart: '',
    dateEndPrev: '',
    budgetMO: '',
    type: 'Villa',
    manager: '',
  });
  const [errors, setErrors] = useState({});
  const [serverErr, setServerErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const submittedRef = useRef(false);

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => { const n = { ...prev }; delete n[field]; return n; });
  }

  async function submit(e) {
    e.preventDefault();
    if (busy || submittedRef.current) return;

    const v = ob.validateChantier(form);
    if (!v.valid) { setErrors(v.errors); setServerErr(null); return; }

    submittedRef.current = true;
    setBusy(true);
    setServerErr(null);
    try {
      const prev = window.__BATI_USER_DATA || {};
      const r = ob.addChantier(prev, form);
      if (!r.ok) { setErrors(r.errors || {}); return; }

      window.__BATI_USER_DATA = r.userState;
      if (window.__BATI_PERSIST_PATCH) {
        window.__BATI_PERSIST_PATCH({
          chantiers: r.userState.chantiers,
          currentChantierId: r.userState.currentChantierId,
        });
      }
      try {
        if (window.__BATI_SAVER && typeof window.__BATI_SAVER.flush === 'function') {
          await window.__BATI_SAVER.flush();
        }
      } catch (err) {
        setServerErr('Le chantier est créé localement, mais la sauvegarde a échoué : ' + (err && err.message || err));
      }
      onCreated && onCreated(r.chantier);
    } catch (err) {
      submittedRef.current = false;
      throw err;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={obStyles.page}>
      <div style={obStyles.motif}/>
      <form onSubmit={submit} style={obStyles.card} noValidate data-testid="onboarding-form">
        <header style={obStyles.header}>
          <div style={obStyles.brandMark}>B</div>
          <div>
            <div style={obStyles.title}>Créez votre premier chantier</div>
            <div style={obStyles.subtitle}>
              Bienvenue. Pour commencer, définissez un chantier — vous pourrez en ajouter d'autres ensuite.
            </div>
          </div>
        </header>

        <div style={obStyles.grid}>
          <OBField label="Nom du chantier" error={errors.name}>
            <input className="bati-input" maxLength={120} required autoFocus
                   value={form.name} onChange={e => update('name', e.target.value)}
                   data-testid="ob-name" aria-invalid={!!errors.name}/>
          </OBField>

          <OBField label="Type" error={errors.type}>
            <select className="bati-input" value={form.type}
                    onChange={e => update('type', e.target.value)}
                    data-testid="ob-type" aria-invalid={!!errors.type}>
              {ob.CHANTIER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </OBField>

          <OBField label="Client" error={errors.client}>
            <input className="bati-input" maxLength={120} required
                   value={form.client} onChange={e => update('client', e.target.value)}
                   data-testid="ob-client" aria-invalid={!!errors.client}/>
          </OBField>

          <OBField label="Conducteur de travaux (optionnel)">
            <input className="bati-input" maxLength={120}
                   value={form.manager} onChange={e => update('manager', e.target.value)}
                   data-testid="ob-manager"/>
          </OBField>

          <OBField label="Adresse" wide error={errors.address}>
            <input className="bati-input" maxLength={200} required
                   value={form.address} onChange={e => update('address', e.target.value)}
                   data-testid="ob-address" aria-invalid={!!errors.address}/>
          </OBField>

          <OBField label="Date de début" error={errors.dateStart}>
            <input type="date" className="bati-input" required
                   value={form.dateStart} onChange={e => update('dateStart', e.target.value)}
                   data-testid="ob-date-start" aria-invalid={!!errors.dateStart}/>
          </OBField>

          <OBField label="Date de fin prévue" error={errors.dateEndPrev}>
            <input type="date" className="bati-input" required
                   value={form.dateEndPrev} onChange={e => update('dateEndPrev', e.target.value)}
                   data-testid="ob-date-end" aria-invalid={!!errors.dateEndPrev}/>
          </OBField>

          <OBField label="Budget main d'œuvre (DH)" wide error={errors.budgetMO}>
            <input type="number" className="bati-input" required min="1" step="any"
                   value={form.budgetMO} onChange={e => update('budgetMO', e.target.value)}
                   data-testid="ob-budget" aria-invalid={!!errors.budgetMO}/>
          </OBField>
        </div>

        {serverErr && (
          <div style={obStyles.alertErr} role="alert" data-testid="ob-server-error">{serverErr}</div>
        )}

        <button type="submit" disabled={busy}
                style={{ ...obStyles.submit, ...(busy ? obStyles.submitBusy : {}) }}
                data-testid="ob-submit">
          {busy ? 'Création en cours…' : 'Créer mon chantier'}
        </button>

        <div style={obStyles.foot}>
          <span>Connecté en tant que {window.__BATI_USER?.email}</span>
          <button type="button" style={obStyles.linkBtn}
                  onClick={() => window.bati.signOut()}>Se déconnecter</button>
        </div>
        {nextPath && <input type="hidden" name="next" value={nextPath} data-testid="ob-next"/>}
      </form>
    </div>
  );
}

function OBField({ label, children, error, wide }) {
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : null}>
      <div style={obStyles.fieldLabel}>{label}</div>
      {children}
      {error && <div style={obStyles.fieldError} data-testid="ob-field-error">{error}</div>}
    </div>
  );
}

const obStyles = {
  page: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24, background: '#FAF7F1', position: 'relative', overflow: 'hidden',
    fontFamily: "'Manrope', system-ui, sans-serif", color: '#1F2421',
  },
  motif: {
    position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
    backgroundImage:
      'repeating-linear-gradient(45deg, rgba(14,84,96,0.04) 0 2px, transparent 2px 14px),' +
      'repeating-linear-gradient(-45deg, rgba(14,84,96,0.04) 0 2px, transparent 2px 14px)',
  },
  card: {
    position: 'relative', width: '100%', maxWidth: 640,
    background: '#fff', border: '1px solid #E8E2D8', borderRadius: 16,
    padding: '28px 32px 24px', boxShadow: '0 10px 40px -12px rgba(31,36,33,0.18)',
    display: 'flex', flexDirection: 'column', gap: 18,
  },
  header: { display: 'flex', alignItems: 'flex-start', gap: 14 },
  brandMark: {
    width: 44, height: 44, borderRadius: 12, background: '#0E5460', color: '#fff',
    display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 22, flexShrink: 0,
  },
  title: { fontSize: 20, fontWeight: 800, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, color: '#6B6359', marginTop: 4, lineHeight: 1.5 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  fieldLabel: {
    fontSize: 11, fontWeight: 700, color: '#6B6359', letterSpacing: 0.4,
    textTransform: 'uppercase', marginBottom: 6,
  },
  fieldError: { fontSize: 11, color: '#7A2814', marginTop: 4 },
  alertErr: {
    padding: '10px 12px', background: '#F8E1D9', color: '#7A2814', borderRadius: 9,
    fontSize: 13, border: '1px solid #ECC2B3',
  },
  submit: {
    padding: '12px 14px', background: '#0E5460', color: '#fff', border: 'none',
    borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  submitBusy: { opacity: 0.7, cursor: 'wait' },
  foot: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    fontSize: 12, color: '#6B6359', paddingTop: 6,
  },
  linkBtn: {
    background: 'none', border: 'none', color: '#0E5460', cursor: 'pointer',
    fontSize: 12, fontWeight: 600, padding: 0,
  },
};

window.OnboardingScreen = OnboardingScreen;
