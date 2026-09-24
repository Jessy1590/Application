/**
 * App Log — consultation du journal (admin portail uniquement).
 */
(function () {
  const PAGE = 100;
  let offset = 0;
  let lastCount = 0;

  function el(id) {
    return document.getElementById(id);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch (_) {
      return String(iso);
    }
  }

  function showMsg(text, isErr) {
    const m = el('logMsg');
    if (!text) {
      m.hidden = true;
      return;
    }
    m.hidden = false;
    m.className = isErr ? 'log-msg error' : 'log-msg';
    m.textContent = text;
  }

  function filtersFromForm() {
    const fd = new FormData(el('logFilters'));
    return {
      app: String(fd.get('app') || '').trim() || null,
      module: String(fd.get('module') || '').trim() || null,
      action: String(fd.get('action') || '').trim() || null,
      user: String(fd.get('user') || '').trim() || null,
      level: String(fd.get('level') || '').trim() || null,
    };
  }

  function detailText(detail) {
    if (!detail || (typeof detail === 'object' && !Object.keys(detail).length)) return '—';
    try {
      return JSON.stringify(detail);
    } catch (_) {
      return String(detail);
    }
  }

  async function load() {
    const body = el('logBody');
    body.innerHTML = '<tr><td colspan="7" class="log-muted">Chargement…</td></tr>';
    showMsg('');
    try {
      const rows = await PhieLogs.list({
        ...filtersFromForm(),
        limit: PAGE,
        offset,
      });
      lastCount = rows.length;
      el('logCount').textContent =
        rows.length === 0 && offset === 0
          ? 'Aucune entrée.'
          : `Affichage ${offset + 1}–${offset + rows.length}${rows.length === PAGE ? '+' : ''}`;
      el('logPrev').disabled = offset <= 0;
      el('logNext').disabled = rows.length < PAGE;
      if (!rows.length) {
        body.innerHTML = '<tr><td colspan="7" class="log-muted">Aucun log pour ces filtres.</td></tr>';
        return;
      }
      body.innerHTML = rows
        .map((r) => {
          const lvl = r.level || 'info';
          return `<tr>
            <td>${escapeHtml(fmtDate(r.created_at))}</td>
            <td>${escapeHtml(r.user_label || r.user_id || '—')}</td>
            <td>${escapeHtml(r.app || '—')}</td>
            <td>${escapeHtml(r.module || '—')}</td>
            <td><strong>${escapeHtml(r.action || '—')}</strong></td>
            <td><span class="log-level log-level-${escapeHtml(lvl)}">${escapeHtml(lvl)}</span></td>
            <td><div class="log-detail">${escapeHtml(detailText(r.detail))}</div></td>
          </tr>`;
        })
        .join('');
    } catch (e) {
      body.innerHTML = '';
      showMsg(e.message || String(e), true);
      el('logCount').textContent = '';
      el('logPrev').disabled = true;
      el('logNext').disabled = true;
    }
  }

  async function boot() {
    PhieTheme.init();
    PhieFab.mount({ app: 'log', homeHref: '../../index.html' });
    PhieLogs.setContext({ app: 'log', module: null });

    el('logThemeBtn')?.addEventListener('click', () => PhieTheme.toggle());

    let snap;
    try {
      snap = await PhieEquipe.load();
    } catch (e) {
      showMsg(e.message || String(e), true);
      return;
    }

    if (!snap.portailAdmin) {
      document.querySelector('.log-main').innerHTML =
        '<p class="log-msg error">Accès réservé aux administrateurs portail (<code>profiles.role = admin</code>).</p>';
      return;
    }

    void PhieLogs.session({ page: 'log' });

    el('logFilters').addEventListener('submit', (e) => {
      e.preventDefault();
      offset = 0;
      void load();
    });
    el('logRefresh').addEventListener('click', () => void load());
    el('logPrev').addEventListener('click', () => {
      offset = Math.max(0, offset - PAGE);
      void load();
    });
    el('logNext').addEventListener('click', () => {
      if (lastCount < PAGE) return;
      offset += PAGE;
      void load();
    });

    await load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
