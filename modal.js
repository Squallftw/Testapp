// BatiTrack — confirmation modal.
//
// Reusable confirm/cancel dialog. Replaces window.confirm() with a
// brand-consistent overlay that supports keyboard navigation, screen readers,
// and destructive-action styling.
//
// Public API (window.Modal):
//   Modal.confirm({
//     title,
//     message,
//     danger        = true,             // false for non-destructive (sign-out)
//     confirmLabel  = 'Supprimer',
//     cancelLabel   = 'Annuler'
//   }) -> Promise<boolean>
//
// Behaviour:
//   • Escape resolves false.
//   • Click on backdrop (outside card) resolves false.
//   • Confirm button resolves true; cancel resolves false.
//   • Focus moves to the destructive button (confirm if danger, else cancel).
//   • Tab cycles within the card; Shift+Tab too.
//   • Previously focused element is restored on close.
//   • ARIA: role="alertdialog", aria-labelledby, aria-describedby.
//   • Honors prefers-reduced-motion.
//
// Pure DOM, no dependencies. Content set via textContent — never innerHTML.

(function () {
  'use strict';

  const LEAVE_MS = 220;

  function getFocusable(root) {
    return Array.from(root.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )).filter(el => !el.disabled && (el.offsetParent !== null || el.tagName === 'BUTTON'));
  }

  function uid(prefix) {
    return prefix + '-' + Math.random().toString(36).slice(2, 9);
  }

  function confirm(opts) {
    opts = opts || {};
    const title        = opts.title == null ? 'Confirmation' : String(opts.title);
    const message      = opts.message == null ? '' : String(opts.message);
    const danger       = opts.danger !== false;
    const confirmLabel = opts.confirmLabel || (danger ? 'Supprimer' : 'Confirmer');
    const cancelLabel  = opts.cancelLabel  || 'Annuler';

    return new Promise((resolve) => {
      const previouslyFocused = document.activeElement;

      const backdrop = document.createElement('div');
      backdrop.className = 'dialog-backdrop';

      const card = document.createElement('div');
      card.className = 'dialog-card';
      card.setAttribute('role', 'alertdialog');
      card.setAttribute('aria-modal', 'true');

      const titleId = uid('dialog-title');
      card.setAttribute('aria-labelledby', titleId);

      const h = document.createElement('h3');
      h.className = 'dialog-title';
      h.id = titleId;
      h.textContent = title;
      card.appendChild(h);

      if (message) {
        const descId = uid('modal-desc');
        card.setAttribute('aria-describedby', descId);
        const p = document.createElement('p');
        p.className = 'dialog-message';
        p.id = descId;
        p.textContent = message;
        card.appendChild(p);
      }

      const actions = document.createElement('div');
      actions.className = 'dialog-actions';

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'btn';
      cancelBtn.textContent = cancelLabel;

      const confirmBtn = document.createElement('button');
      confirmBtn.type = 'button';
      confirmBtn.className = danger ? 'btn btn-danger' : 'btn btn-primary';
      confirmBtn.textContent = confirmLabel;

      actions.appendChild(cancelBtn);
      actions.appendChild(confirmBtn);
      card.appendChild(actions);

      backdrop.appendChild(card);
      document.body.appendChild(backdrop);

      requestAnimationFrame(() => backdrop.classList.add('dialog-visible'));

      let resolved = false;
      function cleanup(value) {
        if (resolved) return;
        resolved = true;
        document.removeEventListener('keydown', onKey, true);
        backdrop.classList.remove('dialog-visible');
        backdrop.classList.add('dialog-leaving');
        const remove = () => {
          if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
          try {
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
              previouslyFocused.focus();
            }
          } catch (e) { /* ignore */ }
          resolve(value);
        };
        const fallback = setTimeout(remove, LEAVE_MS + 50);
        backdrop.addEventListener('transitionend', () => {
          clearTimeout(fallback);
          remove();
        }, { once: true });
      }

      function onKey(e) {
        if (e.key === 'Escape') {
          e.stopPropagation();
          cleanup(false);
        } else if (e.key === 'Tab') {
          const els = getFocusable(card);
          if (els.length === 0) { e.preventDefault(); return; }
          const first = els[0];
          const last  = els[els.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }

      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) cleanup(false);
      });
      cancelBtn.addEventListener('click', () => cleanup(false));
      confirmBtn.addEventListener('click', () => cleanup(true));
      document.addEventListener('keydown', onKey, true);

      // Initial focus on the primary action.
      (danger ? confirmBtn : cancelBtn).focus();
    });
  }

  // `getFocusable` is exposed alongside the public surface so unit tests can
  // verify the focus-trap filter (matches the convention used by
  // AppStorage.backoffDelay). App code should not depend on it.
  window.Modal = { confirm, getFocusable };
})();
