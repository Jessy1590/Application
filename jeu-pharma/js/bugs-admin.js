/**
 * Admin Bugs — liste filtrable, détail, changement de statut (RLS admin).
 * Statuts CHECK : nouveau | en_cours | modifie | impossible | annule
 * Types CHECK : bug | amelioration
 */
(function (global) {
  function esc(s) { return global.JpUi.escapeHtml(String(s == null ? '' : s)); }
  function $(id) { return document.getElementById(id); }

  const STATUTS = global.JpBugs.STATUTS;
  const STATUT_LABELS = global.JpBugs.STATUT_LABELS;
  const TYPE_LABELS = global.JpBugs.TYPE_LABELS;

  const state = {
    rows: [],
    profils: {},
    tab: 'ouverts', // ouverts | tous | nouveau | en_cours | modifie | impossible | annule
    type: '',
    q: '',
    expanded: new Set(),
  };

  function fmtDate(s) {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) {
      return String(s);
    }
  }

  function isOpen(statut) {
    return statut === 'nouveau' || statut === 'en_cours';
  }

  async function loadProfils(ids) {
    const out = {};
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    const portail = global.JpApp.sbPortail();
    for (let i = 0; i < uniq.length; i += 100) {
      const chunk = uniq.slice(i, i + 100);
      let res = await portail.from('profiles').select('id, display_name, email').in('id', chunk);
      if (res.error) res = await portail.from('profiles').select('id, display_name').in('id', chunk);
      if (res.error) continue;
      (res.data || []).forEach((p) => { out[p.id] = p; });
    }
    return out;
  }

  function nameOf(uid) {
    const p = state.profils[uid];
    if (!p) return uid ? 'Utilisateur' : 'Anonyme';
    return p.display_name || p.email || 'Utilisateur';
  }

  function emailOf(uid) {
    const p = state.profils[uid];
    return (p && p.email) || '';
  }

  async function loadAll() {
    state.rows = await global.JpBugs.list({ limit: 500 });
    state.profils = await loadProfils(state.rows.map((r) => r.created_by));
  }

  function counts() {
    const c = { ouverts: 0, tous: state.rows.length };
    STATUTS.forEach((s) => { c[s] = 0; });
    state.rows.forEach((r) => {
      if (c[r.statut] !== undefined) c[r.statut] += 1;
      if (isOpen(r.statut)) c.ouverts += 1;
    });
    return c;
  }

  function matchesQuery(r) {
    const q = String(state.q || '').trim().toLowerCase();
    if (!q) return true;
    const p = state.profils[r.created_by] || {};
    const hay = [
      r.titre, r.description, r.page_path, r.type, r.statut,
      p.display_name, p.email,
    ].join(' ').toLowerCase();
    return hay.indexOf(q) !== -1;
  }

  function filtered() {
    return state.rows.filter((r) => {
      if (state.tab === 'ouverts' && !isOpen(r.statut)) return false;
      if (state.tab !== 'ouverts' && state.tab !== 'tous' && r.statut !== state.tab) return false;
      if (state.type && r.type !== state.type) return false;
      return matchesQuery(r);
    });
  }

  function statutSelectHtml(id, current) {
    return '<select class="jp-bug-statut-select" data-act="statut" data-id="' + esc(id) + '" aria-label="Statut">'
      + STATUTS.map((s) =>
        '<option value="' + esc(s) + '"' + (s === current ? ' selected' : '') + '>'
        + esc(STATUT_LABELS[s] || s) + '</option>').join('')
      + '</select>';
  }

  function badgeStatut(statut) {
    const label = STATUT_LABELS[statut] || statut;
    return '<span class="jp-badge jp-bug-badge jp-bug-badge-' + esc(statut) + '">' + esc(label) + '</span>';
  }

  function badgeType(type) {
    return '<span class="jp-bug-tag">' + esc(TYPE_LABELS[type] || type) + '</span>';
  }

  function renderTabs() {
    const c = counts();
    const tabs = [
      ['ouverts', 'Ouverts', c.ouverts],
      ['tous', 'Tous', c.tous],
      ['nouveau', 'Nouveaux', c.nouveau],
      ['en_cours', 'En cours', c.en_cours],
      ['modifie', 'Modifiés', c.modifie],
      ['impossible', 'Impossible', c.impossible],
      ['annule', 'Annulés', c.annule],
    ];
    $('bugTabs').innerHTML = tabs.map((t) =>
      '<button type="button" class="jp-jx-tab' + (state.tab === t[0] ? ' is-active' : '') + '" role="tab" aria-selected="'
      + (state.tab === t[0]) + '" data-act="tab" data-tab="' + t[0] + '">' + t[1]
      + ' <span class="jp-acc-count">' + t[2] + '</span></button>').join('');
  }

  function renderFilters() {
    const host = $('bugTypeFilter');
    if (!host) return;
    const opts = [
      ['', 'Tous types'],
      ['bug', 'Bugs'],
      ['amelioration', 'Améliorations'],
    ];
    host.innerHTML = '<div class="jp-jx-seg" role="group" aria-label="Type">'
      + opts.map((o) =>
        '<button type="button" data-act="type" data-type="' + esc(o[0]) + '"'
        + (state.type === o[0] ? ' class="is-active"' : '') + '>' + esc(o[1]) + '</button>').join('')
      + '</div>';
  }

  function detailHtml(r) {
    const mail = emailOf(r.created_by);
    return '<div class="jp-bug-detail">'
      + '<p class="jp-bug-desc">' + esc(r.description || '') + '</p>'
      + '<p class="jp-bug-meta">'
      + 'Signalé par <strong>' + esc(nameOf(r.created_by)) + '</strong>'
      + (mail ? ' (' + esc(mail) + ')' : '')
      + (r.page_path ? ' · <code>' + esc(r.page_path) + '</code>' : '')
      + ' · créé ' + esc(fmtDate(r.created_at))
      + (r.updated_at && r.updated_at !== r.created_at ? ' · maj ' + esc(fmtDate(r.updated_at)) : '')
      + '</p>'
      + '<label class="jp-bug-statut-label">Statut' + statutSelectHtml(r.id, r.statut) + '</label>'
      + '<div class="jp-jx-actions">'
      + (r.statut !== 'en_cours'
        ? '<button type="button" class="jp-btn jp-btn-ghost" data-act="set" data-id="' + esc(r.id) + '" data-statut="en_cours">En cours</button>'
        : '')
      + (r.statut !== 'modifie'
        ? '<button type="button" class="jp-btn jp-btn-primary" data-act="set" data-id="' + esc(r.id) + '" data-statut="modifie">Marquer modifié</button>'
        : '')
      + (r.statut !== 'impossible'
        ? '<button type="button" class="jp-btn jp-btn-ghost" data-act="set" data-id="' + esc(r.id) + '" data-statut="impossible">Impossible</button>'
        : '')
      + (r.statut !== 'annule'
        ? '<button type="button" class="jp-btn jp-btn-ghost" data-act="set" data-id="' + esc(r.id) + '" data-statut="annule">Annuler</button>'
        : '')
      + (r.statut !== 'nouveau' && isOpen(r.statut) === false
        ? '<button type="button" class="jp-btn jp-btn-ghost" data-act="set" data-id="' + esc(r.id) + '" data-statut="nouveau">Rouvrir</button>'
        : '')
      + '</div></div>';
  }

  function renderList() {
    const rows = filtered();
    const host = $('bugList');
    if (!rows.length) {
      host.innerHTML = '<p class="jp-muted">'
        + (state.q || state.type ? 'Aucun signalement pour ces filtres.' : 'Aucun signalement.')
        + '</p>';
      return;
    }

    host.innerHTML = '<div class="jp-bugs-admin">'
      + rows.map((r) => {
        const open = state.expanded.has(r.id);
        return '<article class="jp-bug-item" data-id="' + esc(r.id) + '">'
          + '<div class="jp-bug-item-head">'
          + badgeType(r.type)
          + '<strong>' + esc(r.titre) + '</strong>'
          + badgeStatut(r.statut)
          + '</div>'
          + '<p class="jp-bug-meta">' + esc(nameOf(r.created_by))
          + ' · ' + esc(fmtDate(r.created_at))
          + (r.page_path ? ' · <code>' + esc(r.page_path) + '</code>' : '')
          + '</p>'
          + '<div class="jp-jx-actions">'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-act="detail" data-id="' + esc(r.id) + '">'
          + (open ? 'Masquer' : 'Détail') + '</button>'
          + (r.statut === 'nouveau'
            ? '<button type="button" class="jp-btn jp-btn-ghost" data-act="set" data-id="' + esc(r.id) + '" data-statut="en_cours">En cours</button>'
            : '')
          + (isOpen(r.statut)
            ? '<button type="button" class="jp-btn jp-btn-primary" data-act="set" data-id="' + esc(r.id) + '" data-statut="modifie">Modifié</button>'
            : '')
          + '</div>'
          + (open ? detailHtml(r) : '')
          + '</article>';
      }).join('')
      + '</div>';
  }

  function render() {
    renderTabs();
    renderFilters();
    renderList();
  }

  async function setStatut(id, statut) {
    if (!STATUTS.includes(statut)) return;
    try {
      const updated = await global.JpBugs.updateStatut(id, statut);
      const row = state.rows.find((r) => r.id === id);
      if (row && updated) {
        row.statut = updated.statut;
        row.updated_at = updated.updated_at;
      } else if (row) {
        row.statut = statut;
        row.updated_at = new Date().toISOString();
      }
      void global.JpLogs?.action?.('bug_statut', { id, statut });
      global.JpToast?.ok?.(STATUT_LABELS[statut] || statut);
      render();
    } catch (err) {
      global.JpToast?.fromError?.(err);
    }
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || !$('bugRoot').contains(btn)) return;
    const act = btn.getAttribute('data-act');
    if (act === 'tab') {
      state.tab = btn.getAttribute('data-tab') || 'ouverts';
      render();
      return;
    }
    if (act === 'type') {
      state.type = btn.getAttribute('data-type') || '';
      render();
      return;
    }
    if (act === 'detail') {
      const id = btn.getAttribute('data-id');
      if (state.expanded.has(id)) state.expanded.delete(id);
      else state.expanded.add(id);
      render();
      return;
    }
    if (act === 'set') {
      void setStatut(btn.getAttribute('data-id'), btn.getAttribute('data-statut'));
    }
  }

  function onChange(e) {
    const sel = e.target.closest('select[data-act="statut"]');
    if (!sel || !$('bugRoot').contains(sel)) return;
    void setStatut(sel.getAttribute('data-id'), sel.value);
  }

  async function boot() {
    const root = $('bugRoot');
    if (!root) return;
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    $('bugSearch').addEventListener('input', () => {
      state.q = $('bugSearch').value || '';
      render();
    });
    try {
      await loadAll();
      render();
    } catch (err) {
      $('bugList').innerHTML = '<p class="jp-muted">Impossible de charger les signalements.</p>';
      global.JpToast?.fromError?.(err);
    }
  }

  global.JpBugsAdmin = { boot };
})(window);
