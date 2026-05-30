// Unified feedback primitives (v1.12.0 Phase 1)
//
// Two helpers that replace every remaining native `window.alert()` and
// `window.confirm()` in the codebase — and provide a non-blocking success
// channel for silent actions (save, export, load).
//
//   showToast(message, kind?)     — non-blocking, auto-dismisses after 2s
//   confirmModal(opts) → Promise  — resolves to true (ok) or false (cancel)
//
// Both stay inside the existing SLDS-flavoured visual language: toasts
// inherit theme tokens from CSS custom properties; the confirm modal
// reuses the established `.sf-modal` structure so it looks identical to
// every other dialog in the app.
//
// Zero-framework, vanilla ES module. Idempotent — calling showToast many
// times stacks toasts; calling confirmModal during another open modal
// stacks z-indices so the new one sits on top.

// ── Toast ─────────────────────────────────────────────────────────

const TOAST_DEFAULT_DURATION = 2000;
let toastContainerEl = null;

function ensureToastContainer() {
  if (toastContainerEl && toastContainerEl.isConnected) return toastContainerEl;
  toastContainerEl = document.createElement('div');
  toastContainerEl.className = 'sf-toast-container';
  toastContainerEl.setAttribute('role', 'status');
  toastContainerEl.setAttribute('aria-live', 'polite');
  toastContainerEl.setAttribute('aria-atomic', 'true');
  document.body.appendChild(toastContainerEl);
  return toastContainerEl;
}

/**
 * Show a transient, non-blocking notification.
 *
 * @param {string} message  Plain text to display.
 * @param {'success'|'info'|'warning'|'error'} [kind='info']  Visual variant.
 * @param {object} [opts]   { duration?: number — ms before auto-dismiss }
 * @returns {Function}      Dismiss handle. Also exposes `.update(message)` which
 *                          rewrites the toast text in place (used by long-running
 *                          operations like GIF export to show frame N/M progress
 *                          without flashing the toast in and out — Gap 27).
 */
export function showToast(message, kind = 'info', opts = {}) {
  const container = ensureToastContainer();
  const toast = document.createElement('div');
  toast.className = `sf-toast sf-toast--${kind}`;
  toast.setAttribute('role', kind === 'error' || kind === 'warning' ? 'alert' : 'status');

  // Inline SVG icon per kind — tiny, currentColor-driven so it follows the
  // toast's text colour and works in both light and dark themes.
  const ICONS = {
    success: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M6 10.5L3.5 8l-1 1L6 12.5l8-8-1-1L6 10.5z" fill="currentColor"/></svg>',
    info:    '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 6.5V12M8 4.5h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    warning: '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 1.5L1 14h14L8 1.5z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6V10M8 12h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    error:   '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
  };
  toast.innerHTML = `
    <span class="sf-toast__icon">${ICONS[kind] || ICONS.info}</span>
    <span class="sf-toast__message"></span>
  `;
  // Use textContent for the message so user-supplied strings can't inject markup.
  const messageEl = toast.querySelector('.sf-toast__message');
  messageEl.textContent = String(message);
  container.appendChild(toast);

  // Trigger the enter animation on the next frame so the initial style
  // transition has a starting point to interpolate from.
  requestAnimationFrame(() => toast.classList.add('sf-toast--shown'));

  const duration = opts.duration ?? TOAST_DEFAULT_DURATION;
  let dismissTimer = null;
  const dismiss = () => {
    if (!toast.isConnected) return;
    clearTimeout(dismissTimer);
    toast.classList.remove('sf-toast--shown');
    // Wait for the exit transition before removing from DOM so stacked
    // toasts shift down smoothly.
    setTimeout(() => toast.remove(), 220);
  };
  toast.addEventListener('click', dismiss);
  dismissTimer = setTimeout(dismiss, duration);

  // Gap 27 (v1.12.0) — live message update for long-running operations.
  // Attaching as a property on the dismiss function (which is itself a
  // function/object) keeps the original `const release = showToast(…); release();`
  // pattern intact while opening a `release.update(…)` channel for callers
  // that need it. Disconnected toasts are a silent no-op so callers don't
  // need to defensively check whether the user dismissed mid-update.
  //
  // A4 (v1.12.0) — in-place textContent writes inside an aria-live region
  // are not reliably re-announced (VoiceOver in particular often misses
  // them). To make sure screen-reader users hear progress updates, we
  // clear the text, then re-write on the next frame so the live region
  // sees a "real" mutation. Visually imperceptible (~16 ms blank).
  dismiss.update = (newMessage) => {
    if (!toast.isConnected) return;
    messageEl.textContent = '';
    requestAnimationFrame(() => {
      if (!toast.isConnected) return;
      messageEl.textContent = String(newMessage);
    });
  };
  return dismiss;
}

// ── Focus trap (a11y, v1.12.0) ────────────────────────────────────

/**
 * CSS selector matching elements that should be reachable via Tab. Kept in
 * one place so all modals trap focus over the same set. Excludes hidden /
 * disabled / negative-tabindex elements via attribute selectors.
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function getTabbables(rootEl) {
  if (!rootEl) return [];
  return Array.from(rootEl.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter(el => el.offsetParent !== null || el === document.activeElement); // skip display:none
}

/**
 * Trap Tab / Shift+Tab focus inside `rootEl`. While the trap is active,
 * tabbing past the last focusable child wraps to the first; Shift+Tab from
 * the first wraps to the last. Pressing Escape calls `opts.onEscape` if
 * supplied (typical: dismisses the modal).
 *
 * Returns a release function that unbinds the listener. Idempotent.
 *
 * Usage (every modal that needs a trap):
 *   const release = trapFocus(modalEl, { onEscape: closeModal });
 *   // …on close…
 *   release();
 */
export function trapFocus(rootEl, opts = {}) {
  if (!rootEl) return () => {};
  const onEscape = opts.onEscape;
  const onKeydown = (evt) => {
    if (evt.key === 'Escape' && onEscape) {
      evt.preventDefault();
      onEscape();
      return;
    }
    if (evt.key !== 'Tab') return;
    const tabbables = getTabbables(rootEl);
    if (tabbables.length === 0) {
      // No focusable children — keep focus on the modal root so Tab
      // doesn't drop the user back into the page behind it.
      evt.preventDefault();
      if (rootEl.tabIndex < 0) rootEl.tabIndex = -1;
      rootEl.focus({ preventScroll: true });
      return;
    }
    const first = tabbables[0];
    const last = tabbables[tabbables.length - 1];
    const active = document.activeElement;
    // Forward Tab from the last → wrap to the first.
    if (!evt.shiftKey && (active === last || !rootEl.contains(active))) {
      evt.preventDefault();
      first.focus();
    }
    // Shift+Tab from the first → wrap to the last.
    else if (evt.shiftKey && (active === first || !rootEl.contains(active))) {
      evt.preventDefault();
      last.focus();
    }
  };
  // Capture phase so the trap runs before any inner handlers can swallow Tab.
  document.addEventListener('keydown', onKeydown, true);
  return () => document.removeEventListener('keydown', onKeydown, true);
}

// ── Confirm modal ─────────────────────────────────────────────────

/**
 * Custom-styled confirmation modal that replaces `window.confirm()`.
 *
 * @param {object} opts
 * @param {string} opts.title           Heading text.
 * @param {string} [opts.message]       Body text (plain).
 * @param {string} [opts.okLabel='OK']  Primary button label.
 * @param {string} [opts.cancelLabel='Cancel']  Secondary button label.
 * @param {'primary'|'danger'} [opts.tone='primary']  Visual tone of the OK button.
 *
 * @returns {Promise<boolean>}  Resolves true if the user confirmed, false if cancelled / escaped / overlay-clicked.
 *
 * S2 (v1.12.0) — the previous `opts.html` raw-HTML escape hatch was
 * removed. It had no call sites in the codebase and provided an XSS
 * surface that future contributors could accidentally feed unescaped
 * user content into. Callers needing rich content can compose plain
 * text with newlines, or build their own modal via the same `.sf-modal`
 * primitives if a one-off needs HTML formatting.
 */
export function confirmModal(opts) {
  const {
    title,
    message = '',
    okLabel = 'OK',
    cancelLabel = 'Cancel',
    tone = 'primary',
  } = opts || {};

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sf-modal sf-confirm-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.zIndex = '10002';

    // Snapshot the currently-focused element so we can restore focus on close —
    // simple a11y win without a full focus-trap implementation.
    const prevFocus = document.activeElement;

    const titleId = `sf-confirm-title-${Math.random().toString(36).slice(2, 8)}`;
    overlay.setAttribute('aria-labelledby', titleId);

    overlay.innerHTML = `
      <div class="sf-modal__overlay"></div>
      <div class="sf-modal__dialog sf-confirm-modal__dialog">
        <div class="sf-modal__header">
          <h2 id="${titleId}" class="sf-modal__title"></h2>
        </div>
        <div class="sf-modal__body sf-confirm-modal__body"></div>
        <div class="sf-modal__footer sf-confirm-modal__footer">
          <button class="sf-modal__btn sf-confirm-modal__cancel"></button>
          <button class="sf-modal__btn sf-modal__btn--${tone === 'danger' ? 'danger' : 'primary'} sf-confirm-modal__ok"></button>
        </div>
      </div>
    `;
    // textContent everywhere — no raw-HTML path is available (see S2 note above).
    overlay.querySelector('.sf-modal__title').textContent = title || '';
    overlay.querySelector('.sf-confirm-modal__body').textContent = message;
    overlay.querySelector('.sf-confirm-modal__ok').textContent = okLabel;
    overlay.querySelector('.sf-confirm-modal__cancel').textContent = cancelLabel;

    document.body.appendChild(overlay);

    // Focus trap — Tab/Shift+Tab stay inside the modal; Escape cancels.
    const releaseTrap = trapFocus(overlay, { onEscape: () => finish(false) });

    const finish = (value) => {
      releaseTrap();
      document.removeEventListener('keydown', onEnter, true);
      overlay.remove();
      // Restore focus to whatever had it before the modal opened.
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus(); } catch { /* element may be gone */ }
      }
      resolve(value);
    };

    overlay.querySelector('.sf-confirm-modal__ok').addEventListener('click', () => finish(true));
    overlay.querySelector('.sf-confirm-modal__cancel').addEventListener('click', () => finish(false));
    overlay.querySelector('.sf-modal__overlay').addEventListener('click', () => finish(false));

    // Separate handler for Enter — the focus trap handles Tab + Escape, but
    // Enter as "confirm" is a convention this modal owns.
    function onEnter(evt) {
      if (evt.key !== 'Enter') return;
      const tag = (evt.target && evt.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      evt.preventDefault();
      finish(true);
    }
    document.addEventListener('keydown', onEnter, true);

    // Focus the cancel button by default — safety bias for destructive prompts.
    // Caller can override via the `tone: 'primary'` form for non-destructive cases:
    // for those the OK button takes focus instead so Enter confirms naturally.
    const defaultBtn = tone === 'danger'
      ? overlay.querySelector('.sf-confirm-modal__cancel')
      : overlay.querySelector('.sf-confirm-modal__ok');
    setTimeout(() => defaultBtn?.focus(), 0);
  });
}

/**
 * Convenience for showing a non-dismissable error toast when a user-facing
 * operation failed. Encapsulates the common `showToast(msg, 'error', …)`
 * pattern with a slightly longer default duration so the user has time to
 * read the failure.
 */
export function showError(message, opts = {}) {
  return showToast(message, 'error', { duration: 4000, ...opts });
}

// ── Prompt modal (single text input) ──────────────────────────────

/**
 * Single-line text-input modal — the input-bearing sibling of confirmModal.
 * Used where the app needs one short string from the user (e.g. naming a
 * custom pattern) without falling back to the native, unstyled `prompt()`.
 * Reuses the `.sf-modal` / `.sf-confirm-modal` structure + focus trap so it
 * looks and behaves like every other dialog.
 *
 * @param {object} opts
 * @param {string} opts.title                Heading text.
 * @param {string|Node} [opts.message]       Body above the input. A string is
 *                  set via textContent (XSS-safe); a DOM Node is appended as-is
 *                  (caller is responsible for building it safely).
 * @param {string} [opts.label]              Field label (plain).
 * @param {string} [opts.defaultValue='']    Pre-filled value (selected on open).
 * @param {string} [opts.placeholder='']
 * @param {string} [opts.okLabel='Save']
 * @param {string} [opts.cancelLabel='Cancel']
 * @param {number} [opts.maxLength=80]
 * @param {boolean} [opts.allowEmpty=false]  When false (default), an empty
 *                  submit resolves to null (treated as cancel). When true, an
 *                  empty submit resolves to '' so the caller can apply its own
 *                  fallback — only real cancel/escape/overlay return null.
 * @param {boolean} [opts.requireValue=false]  When true, the primary button is
 *                  disabled (and Enter is gated) until the field is non-empty.
 *
 * @returns {Promise<string|null>}  Trimmed value on confirm; null on cancel /
 *                                  escape / overlay-click (and on empty submit
 *                                  unless `allowEmpty` is set, where it's '').
 */
export function promptModal(opts) {
  const {
    title,
    message = '',
    label = '',
    defaultValue = '',
    placeholder = '',
    okLabel = 'Save',
    cancelLabel = 'Cancel',
    maxLength = 80,
    allowEmpty = false,
    requireValue = false,
  } = opts || {};

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'sf-modal sf-confirm-modal sf-prompt-modal';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.style.zIndex = '10002';

    const prevFocus = document.activeElement;
    const titleId = `sf-prompt-title-${Math.random().toString(36).slice(2, 8)}`;
    const inputId = `sf-prompt-input-${Math.random().toString(36).slice(2, 8)}`;
    overlay.setAttribute('aria-labelledby', titleId);

    overlay.innerHTML = `
      <div class="sf-modal__overlay"></div>
      <div class="sf-modal__dialog sf-confirm-modal__dialog">
        <div class="sf-modal__header">
          <h2 id="${titleId}" class="sf-modal__title"></h2>
        </div>
        <div class="sf-modal__body sf-confirm-modal__body">
          <p class="sf-prompt-modal__message"></p>
          <label class="sf-prompt-modal__label" for="${inputId}"></label>
          <input id="${inputId}" type="text" class="sf-prompt-modal__input" spellcheck="false" autocomplete="off">
        </div>
        <div class="sf-modal__footer sf-confirm-modal__footer">
          <button class="sf-modal__btn sf-confirm-modal__cancel"></button>
          <button class="sf-modal__btn sf-modal__btn--primary sf-confirm-modal__ok"></button>
        </div>
      </div>
    `;
    overlay.querySelector('.sf-modal__title').textContent = title || '';
    const msgEl = overlay.querySelector('.sf-prompt-modal__message');
    if (message instanceof Node) msgEl.appendChild(message);
    else if (message) msgEl.textContent = message;
    else msgEl.remove();
    const labelEl = overlay.querySelector('.sf-prompt-modal__label');
    if (label) labelEl.textContent = label; else labelEl.remove();
    overlay.querySelector('.sf-confirm-modal__ok').textContent = okLabel;
    overlay.querySelector('.sf-confirm-modal__cancel').textContent = cancelLabel;

    const input = overlay.querySelector('.sf-prompt-modal__input');
    input.value = defaultValue;
    input.maxLength = maxLength;
    if (placeholder) input.placeholder = placeholder;

    document.body.appendChild(overlay);

    // onEscape is invoked later, by which time `finish` is assigned.
    const releaseTrap = trapFocus(overlay, { onEscape: () => finish(null) });

    const finish = (value) => {
      releaseTrap();
      overlay.remove();
      if (prevFocus && typeof prevFocus.focus === 'function') {
        try { prevFocus.focus(); } catch { /* element may be gone */ }
      }
      resolve(value);
    };

    const okBtn = overlay.querySelector('.sf-confirm-modal__ok');

    // Empty input resolves to null (treated as cancel) unless `allowEmpty` is
    // set, in which case it resolves to '' so the caller can apply a fallback.
    // When `requireValue` is set, an empty submit is blocked outright.
    const submit = () => {
      const v = input.value.trim();
      if (v === '' && requireValue) return;
      finish(v === '' ? (allowEmpty ? '' : null) : v);
    };

    okBtn.addEventListener('click', submit);
    overlay.querySelector('.sf-confirm-modal__cancel').addEventListener('click', () => finish(null));
    overlay.querySelector('.sf-modal__overlay').addEventListener('click', () => finish(null));
    input.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter') { evt.preventDefault(); submit(); }
    });

    // requireValue — keep the primary button disabled until the field is
    // non-empty (Enter is gated in submit() too).
    if (requireValue) {
      input.required = true;  // drives the CSS red-empty / blue-filled border
      const refreshOk = () => { okBtn.disabled = input.value.trim() === ''; };
      input.addEventListener('input', refreshOk);
      refreshOk();
    }

    // Focus + select the default so the user can type over it immediately.
    setTimeout(() => { input.focus(); input.select(); }, 0);
  });
}
