// BatiTrack — auth UI (login + signup).
//
// Renders a centered card overlay when AppStorage is in supabase mode and
// the user is not authenticated. Removes itself once a session exists.
//
// Pure DOM/CSS — uses the same classes as the rest of the app.

(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function render(mode, errorMsg) {
    const existing = document.getElementById('auth-overlay');
    if (existing) existing.remove();

    const isSignup = mode === 'signup';
    const html = `
      <div id="auth-overlay" class="auth-overlay">
        <div class="auth-card">
          <div class="brand" style="font-size:18px; margin-bottom:8px">
            <span class="brand-dot"></span> BatiTrack
          </div>
          <h2 class="auth-title">${isSignup ? 'Créer un compte' : 'Se connecter'}</h2>
          <p class="muted text-sm" style="margin-top:0">
            ${isSignup
              ? 'Inscrivez-vous pour synchroniser vos données dans le cloud.'
              : 'Connectez-vous pour accéder à vos chantiers.'}
          </p>
          ${errorMsg ? `<div class="auth-error">${esc(errorMsg)}</div>` : ''}
          <form id="auth-form" class="grid" style="gap:12px; margin-top:12px">
            <label class="field">Email
              <input class="input" id="auth-email" type="email" required autocomplete="email" />
            </label>
            <label class="field">Mot de passe
              <input class="input" id="auth-pw" type="password" required minlength="6"
                     autocomplete="${isSignup ? 'new-password' : 'current-password'}" />
            </label>
            <button class="btn btn-primary" type="submit" id="auth-submit">
              ${isSignup ? 'Créer le compte' : 'Se connecter'}
            </button>
          </form>
          <div class="auth-switch text-sm muted">
            ${isSignup
              ? `Déjà inscrit ? <a href="#" id="auth-go-login">Se connecter</a>`
              : `Pas de compte ? <a href="#" id="auth-go-signup">Créer un compte</a>`}
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);

    const form = document.getElementById('auth-form');
    const emailEl = document.getElementById('auth-email');
    const pwEl = document.getElementById('auth-pw');
    const submit = document.getElementById('auth-submit');

    emailEl.focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailEl.value.trim();
      const password = pwEl.value;
      if (!email || password.length < 6) return;
      submit.disabled = true;
      submit.textContent = isSignup ? 'Création…' : 'Connexion…';
      try {
        if (isSignup) {
          const res = await window.AppStorage.signUp(email, password);
          // If email confirmation is ON, session may be null; tell the user.
          if (!res || !res.session) {
            render('login', 'Compte créé. Vérifiez votre email pour confirmer puis connectez-vous.');
            return;
          }
        } else {
          await window.AppStorage.signIn(email, password);
        }
        // On success, onAuthChange will remove this overlay.
      } catch (err) {
        const msg = (err && err.message) || 'Erreur d’authentification';
        render(mode, msg);
      }
    });

    const goSignup = document.getElementById('auth-go-signup');
    const goLogin = document.getElementById('auth-go-login');
    if (goSignup) goSignup.addEventListener('click', (e) => { e.preventDefault(); render('signup'); });
    if (goLogin)  goLogin.addEventListener('click',  (e) => { e.preventDefault(); render('login');  });
  }

  function remove() {
    const el = document.getElementById('auth-overlay');
    if (el) el.remove();
  }

  window.AuthUI = { show: render, hide: remove };
})();
