/**
 * Helpers UI communs.
 */
(function (global) {
  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * @param {HTMLElement|string} target
   * @param {{ title: string, text?: string, actionHref?: string, actionLabel?: string }} opts
   */
  function emptyState(target, opts) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    const action = opts.actionHref && opts.actionLabel
      ? `<p style="margin-top:1rem"><a class="jp-btn jp-btn-primary" href="${escapeHtml(opts.actionHref)}">${escapeHtml(opts.actionLabel)}</a></p>`
      : '';
    el.innerHTML = `
      <div class="jp-empty">
        <strong>${escapeHtml(opts.title)}</strong>
        ${opts.text ? `<p>${escapeHtml(opts.text)}</p>` : ''}
        ${action}
      </div>
    `;
  }

  /**
   * Boot page : FAB + log session (à appeler après auth visible).
   * @param {{ module?: string, homeHref?: string }} [opts]
   */
  async function bootPage(opts = {}) {
    const module = opts.module || null;
    global.JpLogs?.setContext?.({ module });
    global.JpFab?.mount?.({
      homeHref: opts.homeHref != null ? opts.homeHref : global.JpFab?.PORTAIL_URL,
    });
    try {
      void global.JpLogs?.session?.({ page: module || location.pathname });
    } catch (_) { /* ignore */ }
  }

  global.JpUi = {
    escapeHtml,
    emptyState,
    bootPage,
  };
})(window);
