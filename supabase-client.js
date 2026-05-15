// BatiTrack — storage adapter.
//
// Exposes `window.AppStorage` with a uniform API the app uses regardless of
// backend:
//
//   AppStorage.mode                       — 'supabase' | 'local'
//   AppStorage.init()                     — async; resolves once auth state is known
//   AppStorage.isAuthed()                 — bool (always true in local mode)
//   AppStorage.user                       — { id, email } | null
//   AppStorage.onAuthChange(cb)           — register a callback (cb(user|null))
//   AppStorage.onSaveStateChange(cb)      — register a callback for save lifecycle
//                                             cb({ status, attempt?, willRetry?, error?, at? })
//                                             status: 'idle' | 'saving' | 'saved' | 'error'
//   AppStorage.signIn(email, pw)
//   AppStorage.signUp(email, pw)
//   AppStorage.signOut()
//   AppStorage.load()                     — async; returns the full state object (or null)
//   AppStorage.save(state)                — debounced; safe to call on every change
//   AppStorage.flush()                    — force-flush any pending debounced write
//   AppStorage.backoffDelay(attempt)      — pure helper (exposed for tests)
//
// Behaviour:
//   • If window.SUPABASE_CONFIG is set with { url, anonKey } AND the Supabase JS
//     SDK is on the page, runs in 'supabase' mode (auth required, data lives in
//     the `app_state` table — see supabase/schema.sql).
//   • Otherwise, runs in 'local' mode using localStorage (legacy behaviour).
//
// Save reliability (supabase mode):
//   • Writes are debounced (SAVE_DEBOUNCE_MS) to coalesce rapid edits.
//   • On failure, retry up to MAX_RETRIES with exponential backoff
//     (see backoffDelay). Subscribers can render save-state feedback in the UI.
//   • All caught errors are forwarded to window.Sentry?.captureException when
//     available, so production issues surface without changing client behaviour.

(function () {
  'use strict';

  const STORAGE_KEY     = 'batitrack_v1';
  const SAVE_DEBOUNCE_MS = 600;
  const MAX_RETRIES      = 3;

  // Pure: returns the delay in ms before the (attempt+1)-th try.
  // attempt 0 → 500ms, 1 → 2000ms, 2 → 8000ms, anything else → 8000ms.
  // Exposed on AppStorage in both modes so tests can verify the schedule.
  function backoffDelay(attempt) {
    const schedule = [500, 2000, 8000];
    return (typeof attempt === 'number' && schedule[attempt] != null)
      ? schedule[attempt]
      : 8000;
  }

  // ── Save-state event emitter (used by both modes for API parity) ───
  const saveStateListeners = [];
  let lastSaveState = { status: 'idle' };
  function emitSaveState(payload) {
    lastSaveState = payload;
    for (const cb of saveStateListeners) {
      try { cb(payload); } catch (e) { console.error('save-state listener error', e); }
    }
  }
  function onSaveStateChange(cb) {
    if (typeof cb !== 'function') return;
    saveStateListeners.push(cb);
    // Replay the latest state so the new subscriber renders immediately.
    try { cb(lastSaveState); } catch (e) { console.error(e); }
  }

  // ── Sentry helper (no-op if Sentry shim not installed) ─────────────
  function reportError(err, context) {
    try {
      if (window.Sentry && typeof window.Sentry.captureException === 'function') {
        window.Sentry.captureException(err, {
          tags: { component: 'storage', context: context || 'unknown' }
        });
      }
    } catch (_) { /* never let telemetry break the app */ }
  }

  const cfg = window.SUPABASE_CONFIG;
  const hasSupabase =
    cfg && cfg.url && cfg.anonKey &&
    typeof window.supabase !== 'undefined' &&
    typeof window.supabase.createClient === 'function';

  // ── Local-only fallback ────────────────────────────────────────────
  if (!hasSupabase) {
    window.AppStorage = {
      mode: 'local',
      user: null,
      async init() {},
      isAuthed() { return true; },
      onAuthChange() {},
      onSaveStateChange,  // accepted, but local mode never emits
      async signIn() { throw new Error('Supabase not configured'); },
      async signUp() { throw new Error('Supabase not configured'); },
      async signOut() {},
      async load() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch (e) { console.warn('local load failed', e); return null; }
      },
      async save(state) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
        catch (e) { console.warn('local save failed', e); reportError(e, 'local-save'); }
      },
      async flush() {},
      backoffDelay
    };
    return;
  }

  // ── Supabase mode ──────────────────────────────────────────────────
  const sb = window.supabase.createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });

  const authCallbacks = [];
  let currentUser  = null;
  let saveTimer    = null;
  let retryTimer   = null;
  let pendingState = null;
  let retryAttempt = 0;

  async function refreshUser() {
    const { data } = await sb.auth.getSession();
    currentUser = data && data.session ? data.session.user : null;
    return currentUser;
  }

  function fireAuthChange() {
    const u = currentUser ? { id: currentUser.id, email: currentUser.email } : null;
    for (const cb of authCallbacks) {
      try { cb(u); } catch (e) { console.error(e); }
    }
  }

  async function attemptSave(payload) {
    const { error } = await sb
      .from('app_state')
      .upsert({
        user_id: currentUser.id,
        data: payload,
        state_version: payload.__v || 4
      }, { onConflict: 'user_id' });
    if (error) throw error;
  }

  async function flushSave() {
    saveTimer = null;
    if (!pendingState || !currentUser) {
      emitSaveState({ status: 'idle' });
      return;
    }
    const payload = pendingState;
    pendingState = null;

    // Mirror to localStorage immediately — instant reload + offline fallback.
    // A failure here doesn't block the network save, but we still want to know
    // about it (e.g. quota exceeded, storage disabled in private mode).
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); }
    catch (err) { console.warn('localStorage mirror failed', err); reportError(err, 'localStorage-mirror'); }

    emitSaveState({ status: 'saving' });

    try {
      await attemptSave(payload);
      retryAttempt = 0;
      emitSaveState({ status: 'saved', at: Date.now() });
    } catch (err) {
      console.warn('supabase save failed (attempt ' + (retryAttempt + 1) + ')', err);
      reportError(err, 'save');

      retryAttempt += 1;
      // Keep the payload — either retry now, or wait for the next mutation.
      pendingState = payload;

      if (retryAttempt < MAX_RETRIES) {
        emitSaveState({ status: 'error', attempt: retryAttempt, willRetry: true, error: err });
        if (retryTimer) clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          retryTimer = null;
          flushSave();
        }, backoffDelay(retryAttempt - 1));
      } else {
        // Give up for now; reset counter so the next user edit starts a fresh cycle.
        retryAttempt = 0;
        emitSaveState({ status: 'error', attempt: MAX_RETRIES, willRetry: false, error: err });
      }
    }
  }

  const Storage = {
    mode: 'supabase',
    user: null,

    async init() {
      await refreshUser();
      Storage.user = currentUser
        ? { id: currentUser.id, email: currentUser.email }
        : null;
      sb.auth.onAuthStateChange(async (_event, session) => {
        currentUser = session ? session.user : null;
        Storage.user = currentUser
          ? { id: currentUser.id, email: currentUser.email }
          : null;
        if (window.Sentry && typeof window.Sentry.setUser === 'function') {
          window.Sentry.setUser(Storage.user ? { id: Storage.user.id } : null);
        }
        fireAuthChange();
      });
    },

    isAuthed() { return !!currentUser; },

    onAuthChange(cb) { if (typeof cb === 'function') authCallbacks.push(cb); },

    onSaveStateChange,

    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    async signUp(email, password) {
      const { data, error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      return data;
    },

    async signOut() {
      // Drop the local cache so the next user doesn't see stale data.
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      const { error } = await sb.auth.signOut();
      if (error) { console.warn('signOut error', error); reportError(error, 'signOut'); }
    },

    async load() {
      if (!currentUser) return null;
      const { data, error } = await sb
        .from('app_state')
        .select('data, state_version')
        .eq('user_id', currentUser.id)
        .maybeSingle();
      if (error) {
        console.warn('supabase load failed', error);
        reportError(error, 'load');
        // Fall back to local cache for offline-ish resilience.
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
      }
      if (!data || !data.data || Object.keys(data.data).length === 0) return null;
      return data.data;
    },

    async save(state) {
      pendingState = state;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
    },

    // Force-flush any pending write right now — bypasses debounce + backoff.
    // Used by the toast "Réessayer" action, beforeunload, and signOut.
    async flush() {
      if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (pendingState) await flushSave();
    },

    backoffDelay
  };

  // Persist on tab close so debounce can't swallow the last edit.
  window.addEventListener('beforeunload', () => { Storage.flush(); });

  window.AppStorage = Storage;
})();
