/**
 * Toasts erreurs / succès (fade léger).
 */
(function (global) {
  function ensureHost() {
    let host = document.getElementById('jpToastHost');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'jpToastHost';
    host.className = 'jp-toast-host';
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
    return host;
  }

  /**
   * @param {string} message
   * @param {'ok'|'error'|'warn'} [type]
   * @param {{ duration?: number }} [opts]
   */
  function show(message, type = 'ok', opts = {}) {
    const host = ensureHost();
    const el = document.createElement('div');
    el.className = `jp-toast jp-toast-${type === 'error' ? 'error' : type === 'warn' ? 'warn' : 'ok'}`;
    el.textContent = String(message || '');
    host.appendChild(el);
    const ms = opts.duration != null ? opts.duration : type === 'error' ? 4500 : 2800;
    setTimeout(() => {
      el.remove();
    }, ms);
    return el;
  }

  function ok(msg, opts) { return show(msg, 'ok', opts); }
  function error(msg, opts) { return show(msg, 'error', opts); }
  function warn(msg, opts) { return show(msg, 'warn', opts); }

  /** Affiche un toast depuis une erreur PostgREST / Error */
  function fromError(err) {
    const msg = err?.message || String(err || 'Erreur inconnue');
    return error(msg);
  }

  global.JpToast = { show, ok, error, warn, fromError };
})(window);
