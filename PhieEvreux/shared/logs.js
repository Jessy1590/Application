/**
 * Journal d’activité Phie Evreux (écriture fire-and-forget).
 * Lecture réservée admin portail — app app/log/.
 */
(function (global) {
  let defaultApp = 'hub';
  let defaultModule = null;

  function setContext(opts) {
    if (opts && opts.app != null) defaultApp = String(opts.app);
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
   * @param {{ action: string, app?: string, module?: string, detail?: object, level?: 'info'|'warn'|'error', path?: string }} opts
   */
  async function log(opts) {
    const action = String(opts?.action || '').trim();
    if (!action) return null;
    try {
      const apps = global.PhieEvreuxApps;
      if (!apps) return null;
      const snap = global.PhieEquipe?.getSnapshot?.() || {};
      const sb = apps.createAppsClient();
      const row = {
        user_id: snap.userId || null,
        user_label: snap.displayName || null,
        app: String(opts.app || defaultApp || 'hub').slice(0, 64),
        module: opts.module != null ? String(opts.module).slice(0, 64) : defaultModule,
        action: action.slice(0, 120),
        detail: sanitizeDetail(opts.detail),
        path: opts.path != null ? String(opts.path).slice(0, 500) : currentPath(),
        level: opts.level === 'warn' || opts.level === 'error' ? opts.level : 'info',
      };
      const { data, error } = await sb.from('logs').insert(row).select('id').maybeSingle();
      if (error) {
        console.warn('[PhieLogs]', error.message || error);
        return null;
      }
      return data;
    } catch (e) {
      console.warn('[PhieLogs]', e && e.message ? e.message : e);
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

  /**
   * Liste paginée (admin portail uniquement — RLS).
   */
  async function list(opts) {
    const apps = global.PhieEvreuxApps;
    if (!apps) throw new Error('PhieEvreuxApps manquant');
    const sb = apps.createAppsClient();
    const limit = Math.min(Number(opts?.limit) || 100, 500);
    const offset = Math.max(Number(opts?.offset) || 0, 0);
    let q = sb
      .from('logs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (opts?.app) q = q.eq('app', opts.app);
    if (opts?.module) q = q.eq('module', opts.module);
    if (opts?.action) q = q.ilike('action', `%${opts.action}%`);
    if (opts?.user) q = q.or(`user_label.ilike.%${opts.user}%,user_id.eq.${opts.user}`);
    if (opts?.level) q = q.eq('level', opts.level);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function clearOlderThanDays(days) {
    const apps = global.PhieEvreuxApps;
    if (!apps) throw new Error('PhieEvreuxApps manquant');
    const d = Number(days);
    if (!Number.isFinite(d) || d < 1) throw new Error('Nombre de jours invalide');
    const cutoff = new Date(Date.now() - d * 86400000).toISOString();
    const sb = apps.createAppsClient();
    const { error, count } = await sb
      .from('logs')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);
    if (error) throw error;
    return count || 0;
  }

  global.PhieLogs = {
    setContext,
    log,
    session,
    navigate,
    action,
    list,
    clearOlderThanDays,
  };
})(window);
