/**
 * Journal d’activité Jeu Pharma (écriture fire-and-forget).
 * Lecture réservée admin portail — page admin/logs.html.
 */
(function (global) {
  let defaultModule = null;

  function setContext(opts) {
    if (opts && Object.prototype.hasOwnProperty.call(opts, 'module')) {
      defaultModule = opts.module == null ? null : String(opts.module);
    }
  }

  function currentPath() {
    try {
      return `${location.pathname}${location.search || ''}`.slice(0, 500);
    } catch (_) {
      return null;
    }
  }

  function sanitizeDetail(detail) {
    if (detail == null) return {};
    if (typeof detail !== 'object') return { value: String(detail).slice(0, 500) };
    const out = {};
    const blocked = /password|token|secret|apikey|authorization|session/i;
    for (const [k, v] of Object.entries(detail)) {
      if (blocked.test(k)) continue;
      if (v == null) continue;
      if (typeof v === 'string') out[k] = v.slice(0, 500);
      else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
      else {
        try {
          out[k] = JSON.parse(JSON.stringify(v));
        } catch (_) {
          out[k] = String(v).slice(0, 200);
        }
      }
    }
    return out;
  }

  /**
   * @param {{ action: string, module?: string, detail?: object, level?: 'info'|'warn'|'error', path?: string }} opts
   */
  async function log(opts) {
    const action = String(opts?.action || '').trim();
    if (!action) return null;
    try {
      const app = global.JpApp;
      if (!app) return null;
      const user = await app.getUser();
      const userLabel = user ? await app.getDisplayName(user.id) : null;
      const sb = app.sbJeu();
      const row = {
        user_id: user?.id || null,
        user_label: userLabel,
        module: opts.module != null ? String(opts.module).slice(0, 64) : defaultModule,
        action: action.slice(0, 120),
        detail: sanitizeDetail(opts.detail),
        path: opts.path != null ? String(opts.path).slice(0, 500) : currentPath(),
        level: opts.level === 'warn' || opts.level === 'error' ? opts.level : 'info',
      };
      const { data, error } = await sb.from('logs').insert(row).select('id').maybeSingle();
      if (error) {
        console.warn('[JpLogs]', error.message || error);
        return null;
      }
      return data;
    } catch (e) {
      console.warn('[JpLogs]', e && e.message ? e.message : e);
      return null;
    }
  }

  function session(detail) {
    return log({ action: 'session', detail: detail || {} });
  }

  function navigate(target, detail) {
    return log({
      action: 'navigate',
      detail: { target: String(target || '').slice(0, 200), ...(detail || {}) },
    });
  }

  function action(name, detail, extra) {
    return log({
      action: name,
      detail: detail || {},
      ...(extra || {}),
    });
  }

  function error(name, detail) {
    return log({
      action: name || 'error',
      detail: detail || {},
      level: 'error',
    });
  }

  /**
   * Liste filtrable (admin portail uniquement — RLS).
   * @param {{
   *   module?: string,
   *   action?: string,
   *   level?: 'info'|'warn'|'error',
   *   user?: string,
   *   since?: string,
   *   limit?: number,
   *   offset?: number,
   * }} [opts]
   */
  async function list(opts = {}) {
    const app = global.JpApp;
    if (!app) throw new Error('JpApp manquant');
    const sb = app.sbJeu();
    const limit = Math.min(Number(opts.limit) || 100, 500);
    const offset = Math.max(Number(opts.offset) || 0, 0);
    let q = sb
      .from('logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (opts.module) q = q.ilike('module', `%${opts.module}%`);
    if (opts.action) q = q.ilike('action', `%${opts.action}%`);
    if (opts.level) q = q.eq('level', opts.level);
    if (opts.user) {
      const u = String(opts.user).trim();
      if (u) q = q.or(`user_label.ilike.%${u}%,user_id.eq.${u}`);
    }
    if (opts.since) q = q.gte('created_at', opts.since);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  global.JpLogs = {
    setContext,
    log,
    session,
    navigate,
    action,
    error,
    list,
  };
})(window);
