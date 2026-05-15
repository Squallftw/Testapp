// BatiTrack — toast notifications.
//
// Non-blocking transient messages that slide in from the top-right. Used for
// success acknowledgements ("Ouvrier ajouté") and error reports ("Sauvegarde
// échouée — vérifiez votre connexion").
//
// Public API (window.Toast):
//   Toast.success(message, opts?)    — green border, default 3s
//   Toast.error(message, opts?)      — red border, default 6s, role="alert"
//   Toast.info(message, opts?)       — blue border, default 3s
//   Toast.show({ type, message, duration, action }) -> id
//   Toast.dismiss(id)
//   Toast.dismissAll()
//
// Behaviour:
//   • Lazily mounts <div id="toast-container" role="region" aria-live="polite">.
//   • Hovering a toast pauses dismissal (accessibility).
//   • Max 4 stacked, oldest evicted first.
//   • Honors prefers-reduced-motion (no slide animation).
//   • Public content is set via textContent — never innerHTML.

(function () {
  'use strict';

  const MAX_TOASTS = 4;
  const DEFAULT_DURATION = { success: 3000, info: 3000, error: 6000 };
  const LEAVE_MS = 220;  // matches CSS transition duration

  let containerEl = null;
  let nextId = 0;
  const toasts = new Map(); // id -> { el, timer, duration }

  function ensureContainer() {
    if (containerEl && document.body && document.body.contains(containerEl)) {
      return containerEl;
    }
    containerEl = document.createElement('div');
    containerEl.id = 'toast-container';
    containerEl.setAttribute('role', 'region');
    containerEl.setAttribute('aria-live', 'polite');
    containerEl.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(containerEl);
    return containerEl;
  }

  function buildNode(type, message, action) {
    const el = document.createElement('div');
    el.className = 'toast toast-' + type;
    if (type === 'error') el.setAttribute('role', 'alert');

    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = type === 'success' ? '✓' : type === 'error' ? '!' : 'i';
    el.appendChild(icon);

    const msg = document.createElement('span');
    msg.className = 'toast-message';
    msg.textContent = message;
    el.appendChild(msg);

    let actionBtn = null;
    if (action && typeof action.label === 'string' && typeof action.onClick === 'function') {
      actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = 'toast-action';
      actionBtn.textContent = action.label;
      actionBtn.addEventListener('click', () => {
        try { action.onClick(); } catch (e) { console.error(e); }
      });
      el.appendChild(actionBtn);
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Fermer la notification');
    close.textContent = '×';
    el.appendChild(close);

    return { el, closeBtn: close };
  }

  function show(opts) {
    opts = opts || {};
    const type = (opts.type === 'success' || opts.type === 'error' || opts.type === 'info')
      ? opts.type : 'info';
    const message = opts.message == null ? '' : String(opts.message);
    if (!message) return null;

    const duration = typeof opts.duration === 'number'
      ? opts.duration
      : DEFAULT_DURATION[type];

    const container = ensureContainer();

    // Evict oldest if over max.
    while (toasts.size >= MAX_TOASTS) {
      const oldestId = toasts.keys().next().value;
      dismissImmediate(oldestId);
    }

    const id = ++nextId;
    const { el, closeBtn } = buildNode(type, message, opts.action);
    el.dataset.toastId = String(id);
    container.appendChild(el);

    const entry = { el, timer: null, duration };
    toasts.set(id, entry);

    // Slide in next frame so the initial state is committed first.
    requestAnimationFrame(() => el.classList.add('toast-visible'));

    closeBtn.addEventListener('click', () => dismiss(id));

    if (duration > 0) {
      const startTimer = () => {
        entry.timer = setTimeout(() => dismiss(id), duration);
      };
      el.addEventListener('mouseenter', () => {
        if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
      });
      el.addEventListener('mouseleave', () => {
        if (!entry.timer) startTimer();
      });
      startTimer();
    }

    return id;
  }

  function dismiss(id) {
    const entry = toasts.get(id);
    if (!entry) return;
    if (entry.timer) { clearTimeout(entry.timer); entry.timer = null; }
    entry.el.classList.remove('toast-visible');
    entry.el.classList.add('toast-leaving');
    const remove = () => {
      if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
      toasts.delete(id);
    };
    const fallback = setTimeout(remove, LEAVE_MS + 50);
    entry.el.addEventListener('transitionend', () => {
      clearTimeout(fallback);
      remove();
    }, { once: true });
  }

  function dismissImmediate(id) {
    const entry = toasts.get(id);
    if (!entry) return;
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.el.parentNode) entry.el.parentNode.removeChild(entry.el);
    toasts.delete(id);
  }

  function dismissAll() {
    for (const id of Array.from(toasts.keys())) dismissImmediate(id);
  }

  window.Toast = {
    show,
    dismiss,
    dismissAll,
    success: (message, opts) => show(Object.assign({}, opts || {}, { type: 'success', message })),
    error:   (message, opts) => show(Object.assign({}, opts || {}, { type: 'error',   message })),
    info:    (message, opts) => show(Object.assign({}, opts || {}, { type: 'info',    message }))
  };
})();
