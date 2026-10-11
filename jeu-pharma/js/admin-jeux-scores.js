/**
 * Admin Jeux — tableau de bord scores + gestion (pas de création : elle reste dans le studio).
 * Données : schéma jeupharma via sbJeu (modeles_jeu, tentatives_jeu, inscriptions_parcours,
 * parcours_apprentissage, modules_cours, module_blocs) + portail.profiles pour les noms.
 * Droits : admin portail (RLS) ; aucune clé service_role.
 */
(function (global) {
  const PAGE = 25;
  const MAX_TENTATIVES = 10000;
  const TA = global.JpTypeahead;

  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s == null ? '' : s)); }
  function $(id) { return document.getElementById(id); }

  const TYPE_LABELS = {
    quiz: 'Quiz',
    trous: 'Tableau à trous',
    fiche_aleatoire: 'Fiche aléatoire',
    ordonnance: 'Ordonnance',
  };

  const state = {
    modeles: [],
    parcours: [],
    modules: {}, // id -> module
    blocs: {}, // modele_id -> { module_id, bloc_id }
    tent: [],
    inscrits: [],
    profils: {}, // id -> { display_name, email }
    truncated: false,
    // index dérivés
    modeleById: {},
    parcoursById: {},
    byModele: {},
    byUser: {},
    // UI
    tab: 'jeux',
    statut: 'tous', // tous | ok | pause | archive
    type: '',
    parcoursId: null, // uuid | '__none'
    modeleId: null,
    personId: null,
    limitJeux: PAGE,
    limitTent: PAGE,
    expanded: new Set(),
  };

  /* ------------------------------ données ------------------------------ */

  async function fetchAll(build, max) {
    const out = [];
    const size = 1000;
    for (let from = 0; from < max; from += size) {
      const { data, error } = await build().range(from, from + size - 1);
      if (error) throw error;
      const rows = data || [];
      out.push.apply(out, rows);
      if (rows.length < size) return { rows: out, truncated: false };
    }
    return { rows: out, truncated: true };
  }

  async function loadProfils(ids) {
    const out = {};
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    const portail = global.JpApp.sbPortail();
    for (let i = 0; i < uniq.length; i += 100) {
      const chunk = uniq.slice(i, i + 100);
      let res = await portail.from('profiles').select('id, display_name, email').in('id', chunk);
      if (res.error) res = await portail.from('profiles').select('id, display_name').in('id', chunk);
      if (res.error) continue; // noms indisponibles : repli sur l'identifiant
      (res.data || []).forEach((p) => { out[p.id] = p; });
    }
    return out;
  }

  async function loadAll() {
    const [modeles, parcours, modules, blocs, inscr] = await Promise.all([
      sb().from('modeles_jeu')
        .select('id, code_unique, type_jeu, titre, mode, parcours_id, module_ids, en_pause, actif, created_at')
        .order('created_at', { ascending: false }),
      sb().from('parcours_apprentissage').select('id, code, libelle, actif, ordre').order('ordre'),
      sb().from('modules_cours').select('id, parcours_id, parent_id, titre, est_groupe'),
      sb().from('module_blocs').select('id, module_id, payload_json').eq('type_bloc', 'jeu'),
      sb().from('inscriptions_parcours').select('parcours_id, user_id, statut').eq('statut', 'accepte'),
    ]);
    [modeles, parcours, modules, blocs, inscr].forEach((r) => { if (r.error) throw r.error; });

    const tent = await fetchAll(() => sb().from('tentatives_jeu')
      .select('id, modele_id, utilisateur_id, mode, score_obtenu, score_max, termine_at, created_at')
      .order('created_at', { ascending: false }), MAX_TENTATIVES);

    state.modeles = modeles.data || [];
    state.parcours = parcours.data || [];
    state.modules = {};
    (modules.data || []).forEach((m) => { state.modules[m.id] = m; });
    state.blocs = {};
    (blocs.data || []).forEach((b) => {
      const mid = b.payload_json && b.payload_json.modele_id;
      if (mid && !state.blocs[mid]) state.blocs[mid] = { module_id: b.module_id, bloc_id: b.id };
    });
    state.inscrits = inscr.data || [];
    state.tent = tent.rows;
    state.truncated = tent.truncated;
    state.profils = await loadProfils(
      state.tent.map((t) => t.utilisateur_id).concat(state.inscrits.map((i) => i.user_id))
    );
    reindex();
  }

  function reindex() {
    state.modeleById = {};
    state.modeles.forEach((m) => { state.modeleById[m.id] = m; });
    state.parcoursById = {};
    state.parcours.forEach((p) => { state.parcoursById[p.id] = p; });
    state.byModele = {};
    state.byUser = {};
    state.tent.forEach((t) => {
      (state.byModele[t.modele_id] = state.byModele[t.modele_id] || []).push(t);
      (state.byUser[t.utilisateur_id] = state.byUser[t.utilisateur_id] || []).push(t);
    });
  }

  /* ------------------------------ helpers ------------------------------ */

  function etat(m) { return !m.actif ? 'archive' : (m.en_pause ? 'pause' : 'ok'); }

  function badge(m) {
    const e = etat(m);
    if (e === 'archive') return '<span class="jp-badge is-off">Archivé</span>';
    if (e === 'pause') return '<span class="jp-badge is-pause">En pause</span>';
    return '<span class="jp-badge is-ok">Actif</span>';
  }

  function pct(t) {
    if (!t.termine_at || t.score_obtenu == null || !(Number(t.score_max) > 0)) return null;
    return (Number(t.score_obtenu) / Number(t.score_max)) * 100;
  }

  function statsOf(list) {
    const done = list.filter((t) => pct(t) !== null);
    const users = new Set(list.map((t) => t.utilisateur_id));
    return {
      n: list.length,
      done: done.length,
      users: users.size,
      avg: done.length ? done.reduce((a, t) => a + pct(t), 0) / done.length : null,
    };
  }

  function fmtAvg(v) { return v == null ? '—' : Math.round(v) + ' %'; }

  function fmtNum(v) {
    const n = Number(v);
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ',');
  }

  function fmtScore(t) {
    if (!t.termine_at) return '<span class="jp-muted">En cours</span>';
    const p = pct(t);
    if (p === null) return 'Terminé';
    return esc(fmtNum(t.score_obtenu) + ' / ' + fmtNum(t.score_max)) + ' <span class="jp-muted">(' + Math.round(p) + ' %)</span>';
  }

  function fmtDate(s) {
    if (!s) return '—';
    try {
      return new Date(s).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
    } catch (_) { return String(s); }
  }

  function nameOf(uid) {
    const p = state.profils[uid];
    return (p && (p.display_name || p.email)) || ('Joueur ' + String(uid).slice(0, 8));
  }

  function parcoursName(id) {
    if (!id) return 'Sans parcours';
    const p = state.parcoursById[id];
    return p ? p.libelle : 'Parcours supprimé';
  }

  function moduleOf(m) {
    const b = state.blocs[m.id];
    const mid = (b && b.module_id) || (Array.isArray(m.module_ids) && m.module_ids[0]) || null;
    return mid && state.modules[mid] ? { mod: state.modules[mid], blocId: b ? b.bloc_id : null } : null;
  }

  function playUrl(m) {
    const code = encodeURIComponent(m.code_unique);
    return m.type_jeu === 'ordonnance'
      ? '../ordonnances/jouer.html?code=' + code
      : '../jeux/jouer.html?code=' + code;
  }

  /** Lien studio vers la leçon / le bloc propriétaire du modèle. */
  function studioUrl(m) {
    const own = moduleOf(m);
    const pid = (own && own.mod.parcours_id) || m.parcours_id;
    if (!pid) return 'parcours.html';
    let url = 'parcours.html?parcours=' + encodeURIComponent(pid);
    if (own) {
      url += '&module=' + encodeURIComponent(own.mod.id);
      if (own.blocId) url += '&bloc=' + encodeURIComponent(own.blocId);
    }
    return url;
  }

  function lessonLabel(m) {
    const own = moduleOf(m);
    return own ? own.mod.titre : '';
  }

  /* ------------------------------ graphiques (HTML/CSS + SVG, sans librairie) ------------------------------ */

  function tone(p) { return p == null ? 'none' : (p >= 75 ? 'good' : (p >= 50 ? 'mid' : 'low')); }

  function chartCard(title, sub, inner, wide) {
    return '<figure class="jp-jx-chart' + (wide ? ' is-wide' : '') + '"><figcaption><strong>' + esc(title) + '</strong>'
      + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</figcaption>' + inner + '</figure>';
  }

  /** Barres horizontales. items : { label, sub?, pct?|value, max?, text } */
  function chartBars(title, sub, items, opts) {
    if (!items.length) return chartCard(title, sub, '<p class="jp-muted jp-jx-chart-empty">Pas encore de données.</p>');
    const max = (opts && opts.max) || Math.max.apply(null, items.map((i) => i.value)) || 1;
    return chartCard(title, sub, '<div class="jp-jx-hbars" role="list">' + items.map((i) => {
      const w = Math.max(2, Math.round((i.value / max) * 100));
      return '<div class="jp-jx-hbar" role="listitem" title="' + esc(i.label + ' — ' + i.text) + '">'
        + '<span class="jp-jx-hbar-label">' + esc(i.label) + (i.sub ? '<small>' + esc(i.sub) + '</small>' : '') + '</span>'
        + '<span class="jp-jx-hbar-track"><i class="is-' + (i.tone || 'good') + '" style="width:' + w + '%"></i></span>'
        + '<span class="jp-jx-hbar-val">' + esc(i.text) + '</span></div>';
    }).join('') + '</div>');
  }

  /** Colonnes verticales. cols : { label, value, tone? } */
  function chartCols(title, sub, cols, unit) {
    const max = Math.max.apply(null, cols.map((c) => c.value).concat([1]));
    if (!cols.some((c) => c.value > 0)) return chartCard(title, sub, '<p class="jp-muted jp-jx-chart-empty">Pas encore de données.</p>');
    return chartCard(title, sub, '<div class="jp-jx-vcols" role="list">' + cols.map((c) => {
      const h = c.value ? Math.max(4, Math.round((c.value / max) * 100)) : 0;
      return '<div class="jp-jx-vcol" role="listitem" title="' + esc((c.title || c.label) + ' : ' + c.value + (unit ? ' ' + unit : '')) + '">'
        + '<span class="jp-jx-vcol-n">' + (c.value || '') + '</span>'
        + '<span class="jp-jx-vcol-bar"><i class="is-' + (c.tone || 'good') + '" style="height:' + h + '%"></i></span>'
        + '<span class="jp-jx-vcol-l">' + esc(c.label) + '</span></div>';
    }).join('') + '</div>');
  }

  /** Courbe SVG de scores (%) dans le temps. */
  function chartLine(title, sub, list) {
    const pts = list.map((t) => ({ d: Date.parse(t.termine_at || t.created_at), p: pct(t) }))
      .filter((x) => x.p !== null && !isNaN(x.d)).sort((a, b) => a.d - b.d);
    if (pts.length < 2) return chartCard(title, sub, '<p class="jp-muted jp-jx-chart-empty">Au moins 2 tentatives terminées sont nécessaires.</p>', true);
    const W = 640; const H = 180; const L = 34; const R = 12; const T = 10; const B = 22;
    const d0 = pts[0].d; const d1 = pts[pts.length - 1].d || d0 + 1;
    const x = (d) => L + ((d - d0) / ((d1 - d0) || 1)) * (W - L - R);
    const y = (p) => T + (1 - p / 100) * (H - T - B);
    const grid = [0, 50, 100].map((g) => '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g)
      + '" class="jp-jx-grid"/><text x="' + (L - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end" class="jp-jx-axis">' + g + '</text>').join('');
    const fmt = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    const line = pts.map((q) => x(q.d).toFixed(1) + ',' + y(q.p).toFixed(1)).join(' ');
    const area = L + ',' + y(0) + ' ' + line + ' ' + x(d1).toFixed(1) + ',' + y(0);
    const dots = pts.map((q) => '<circle cx="' + x(q.d).toFixed(1) + '" cy="' + y(q.p).toFixed(1) + '" r="3.5" class="jp-jx-dot is-'
      + tone(q.p) + '"><title>' + Math.round(q.p) + ' % — ' + esc(fmt(q.d)) + '</title></circle>').join('');
    const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="jp-jx-line" role="img" aria-label="' + esc(title) + '">'
      + grid + '<polygon points="' + area + '" class="jp-jx-area"/><polyline points="' + line + '" class="jp-jx-path"/>' + dots
      + '<text x="' + L + '" y="' + (H - 4) + '" class="jp-jx-axis">' + esc(fmt(d0)) + '</text>'
      + '<text x="' + (W - R) + '" y="' + (H - 4) + '" text-anchor="end" class="jp-jx-axis">' + esc(fmt(d1)) + '</text></svg>';
    return chartCard(title, sub, svg, true);
  }

  function histogramCols(list) {
    const b = [0, 0, 0, 0, 0];
    list.forEach((t) => {
      const p = pct(t);
      if (p === null) return;
      b[Math.min(4, Math.floor(p / 20))] += 1;
    });
    return ['0–20 %', '20–40 %', '40–60 %', '60–80 %', '80–100 %'].map((l, i) => ({
      label: l, value: b[i], tone: i >= 3 ? 'good' : (i === 2 ? 'mid' : 'low'),
    }));
  }

  function activityCols(list, days) {
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const cols = [];
    const idx = {};
    const dayKey = (d) => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      idx[dayKey(d)] = cols.length;
      cols.push({ label: (i % 7 === 0) ? d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '', value: 0, tone: 'good', title: d.toLocaleDateString('fr-FR') });
    }
    list.forEach((t) => {
      const k = new Date(t.created_at);
      if (isNaN(k)) return;
      const key = dayKey(k);
      if (key in idx) cols[idx[key]].value += 1;
    });
    return cols;
  }

  function jeuChartItems(modeles) {
    return modeles.map((m) => ({ m, s: statsOf(state.byModele[m.id] || []) }))
      .filter((x) => x.s.avg !== null)
      .sort((a, b) => b.s.avg - a.s.avg).slice(0, 10)
      .map((x) => ({
        label: x.m.titre, sub: x.m.code_unique, value: x.s.avg, tone: tone(x.s.avg),
        text: Math.round(x.s.avg) + ' % · ' + x.s.done + ' essai(s)',
      }));
  }

  function chartsJeux(modeles) {
    const ids = new Set(modeles.map((m) => m.id));
    const list = state.tent.filter((t) => ids.has(t.modele_id));
    return '<div class="jp-jx-charts">'
      + chartBars('Moyenne par jeu', '10 meilleurs jeux · % de réussite', jeuChartItems(modeles), { max: 100 })
      + chartCols('Répartition des scores', 'tentatives terminées', histogramCols(list), 'tentative(s)')
      + chartCols('Activité', 'tentatives par jour · 30 derniers jours', activityCols(list, 30), 'tentative(s)')
      + '</div>';
  }

  function chartsParcours(buckets) {
    const rows = buckets.map((b) => {
      const ids = new Set(state.modeles.filter((m) => (m.parcours_id || '__none') === b.id).map((m) => m.id));
      return { b, s: statsOf(state.tent.filter((t) => ids.has(t.modele_id))) };
    });
    const avg = rows.filter((r) => r.s.avg !== null).sort((a, c) => c.s.avg - a.s.avg).map((r) => ({
      label: r.b.label, value: r.s.avg, tone: tone(r.s.avg), text: Math.round(r.s.avg) + ' %',
    }));
    const vol = rows.filter((r) => r.s.n > 0).sort((a, c) => c.s.n - a.s.n).map((r) => ({
      label: r.b.label, value: r.s.n, tone: 'good', text: r.s.n + ' (' + r.s.users + ' joueur' + (r.s.users > 1 ? 's' : '') + ')',
    }));
    return '<div class="jp-jx-charts">'
      + chartBars('Moyenne par parcours', '% de réussite', avg, { max: 100 })
      + chartBars('Tentatives par parcours', 'volume et joueurs actifs', vol)
      + '</div>';
  }

  function chartsPersonnesGlobal() {
    const rows = Object.keys(state.byUser).map((uid) => ({ uid, s: statsOf(state.byUser[uid]) }));
    const top = rows.filter((r) => r.s.avg !== null).sort((a, b) => b.s.avg - a.s.avg).slice(0, 10).map((r) => ({
      label: nameOf(r.uid), value: r.s.avg, tone: tone(r.s.avg), text: Math.round(r.s.avg) + ' % · ' + r.s.done + ' essai(s)',
    }));
    const act = rows.sort((a, b) => b.s.n - a.s.n).slice(0, 10).map((r) => ({
      label: nameOf(r.uid), value: r.s.n, tone: 'good', text: r.s.n + ' tentative(s)',
    }));
    return '<div class="jp-jx-charts">'
      + chartBars('Meilleures moyennes', '10 premières personnes · % de réussite', top, { max: 100 })
      + chartBars('Personnes les plus actives', 'nombre de tentatives', act)
      + '</div>';
  }

  function chartsPersonne(list, perP) {
    const items = Object.keys(perP).map((k) => ({ k, s: statsOf(perP[k]) })).filter((x) => x.s.avg !== null).map((x) => ({
      label: x.k === '__none' ? 'Sans parcours' : parcoursName(x.k), value: x.s.avg, tone: tone(x.s.avg),
      text: Math.round(x.s.avg) + ' % · ' + x.s.done + ' essai(s)',
    }));
    return '<div class="jp-jx-charts">'
      + chartLine('Évolution des scores', '% par tentative terminée', list)
      + chartBars('Moyenne par parcours', '% de réussite', items, { max: 100 })
      + chartCols('Répartition des scores', 'tentatives terminées', histogramCols(list), 'tentative(s)')
      + '</div>';
  }

  /* ------------------------------ filtres ------------------------------ */

  function filteredModeles() {
    const rank = { ok: 0, pause: 1, archive: 2 };
    return state.modeles.filter((m) => {
      if (state.modeleId && m.id !== state.modeleId) return false;
      if (state.parcoursId && (m.parcours_id || '__none') !== state.parcoursId) return false;
      if (state.type && m.type_jeu !== state.type) return false;
      if (state.statut !== 'tous' && etat(m) !== state.statut) return false;
      return true;
    }).sort((a, b) => rank[etat(a)] - rank[etat(b)]);
  }

  function personTentatives() {
    if (!state.personId) return [];
    return (state.byUser[state.personId] || []).filter((t) => {
      const m = state.modeleById[t.modele_id];
      if (state.modeleId && t.modele_id !== state.modeleId) return false;
      if (state.parcoursId && ((m && m.parcours_id) || '__none') !== state.parcoursId) return false;
      return true;
    });
  }

  /* ------------------------------ rendu ------------------------------ */

  function renderPills() {
    const pills = [];
    if (state.parcoursId) {
      pills.push(['parcoursId', 'Parcours : ' + (state.parcoursId === '__none' ? 'sans parcours' : parcoursName(state.parcoursId))]);
    }
    if (state.modeleId) {
      const m = state.modeleById[state.modeleId];
      pills.push(['modeleId', 'Jeu : ' + (m ? m.code_unique : '?')]);
    }
    if (state.personId) pills.push(['personId', 'Personne : ' + nameOf(state.personId)]);
    $('jxPills').innerHTML = pills.map((p) =>
      '<span class="jp-jx-pill">' + esc(p[1])
      + '<button type="button" data-act="clear" data-key="' + p[0] + '" aria-label="Retirer le filtre">×</button></span>'
    ).join('');
    $('jxPills').hidden = !pills.length;
  }

  function renderTabs() {
    const tabs = [['jeux', 'Jeux'], ['parcours', 'Par parcours'], ['personnes', 'Par personne']];
    $('jxTabs').innerHTML = tabs.map((t) =>
      '<button type="button" class="jp-jx-tab' + (state.tab === t[0] ? ' is-active' : '')
      + '" role="tab" aria-selected="' + (state.tab === t[0]) + '" data-act="tab" data-tab="' + t[0] + '">' + t[1] + '</button>'
    ).join('');
  }

  function attemptsTable(list, withPerson) {
    if (!list.length) return '<p class="jp-muted">Aucune tentative.</p>';
    return '<table class="jp-table"><thead><tr>'
      + (withPerson ? '<th>Personne</th>' : '<th>Jeu</th><th>Parcours</th>')
      + '<th>Mode</th><th>Score</th><th>Date</th></tr></thead><tbody>'
      + list.map((t) => {
        let first;
        if (withPerson) {
          first = '<td><button type="button" class="jp-link-btn" data-act="person" data-id="' + esc(t.utilisateur_id) + '">'
            + esc(nameOf(t.utilisateur_id)) + '</button></td>';
        } else {
          const m = state.modeleById[t.modele_id];
          first = '<td>' + (m ? '<code>' + esc(m.code_unique) + '</code> ' + esc(m.titre) : '—') + '</td>'
            + '<td>' + esc(m ? parcoursName(m.parcours_id) : '—') + '</td>';
        }
        return '<tr>' + first + '<td>' + (t.mode === 'evaluation' ? 'Évaluation' : 'Entraînement') + '</td>'
          + '<td>' + fmtScore(t) + '</td><td>' + esc(fmtDate(t.created_at)) + '</td></tr>';
      }).join('')
      + '</tbody></table>';
  }

  function jeuActions(m) {
    const e = etat(m);
    const id = esc(m.id);
    let h = '<div class="jp-jx-actions">'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-act="scores" data-id="' + id + '">'
      + (state.expanded.has(m.id) ? 'Masquer' : 'Scores') + '</button>';
    if (e === 'ok') h += '<a class="jp-btn jp-btn-ghost" href="' + esc(playUrl(m)) + '">Jouer</a>';
    h += '<a class="jp-btn jp-btn-ghost" href="' + esc(studioUrl(m)) + '">Éditer</a>';
    if (e === 'ok') h += '<button type="button" class="jp-btn jp-btn-ghost" data-act="pause" data-id="' + id + '">Pause</button>';
    if (e !== 'ok') h += '<button type="button" class="jp-btn jp-btn-primary" data-act="restart" data-id="' + id + '">Relancer</button>';
    if (e !== 'archive') h += '<button type="button" class="jp-btn jp-btn-ghost" data-act="archive" data-id="' + id + '">Archiver</button>';
    return h + '</div>';
  }

  function renderJeux() {
    const all = filteredModeles();
    const rows = all.slice(0, state.limitJeux);
    const segs = [['tous', 'Tous'], ['ok', 'Actifs'], ['pause', 'En pause'], ['archive', 'Archivés']];
    let html = '<div class="jp-toolbar" style="gap:0.6rem">'
      + '<div class="jp-jx-seg" role="group" aria-label="État">'
      + segs.map((s) => '<button type="button" data-act="statut" data-v="' + s[0] + '"'
        + (state.statut === s[0] ? ' class="is-active"' : '') + '>' + s[1] + '</button>').join('') + '</div>'
      + '<select id="jxType" aria-label="Type de jeu"><option value="">Tous les types</option>'
      + Object.keys(TYPE_LABELS).map((k) => '<option value="' + k + '"' + (state.type === k ? ' selected' : '') + '>'
        + TYPE_LABELS[k] + '</option>').join('') + '</select>'
      + '<span class="jp-muted">' + all.length + ' jeu(x)</span></div>';

    if (!all.length) {
      $('jxBody').innerHTML = html + '<p class="jp-muted">Aucun jeu pour ces filtres.</p>';
      bindType();
      return;
    }
    html += chartsJeux(all);
    html += '<div class="jp-table-wrap"><table class="jp-table"><thead><tr>'
      + '<th>Jeu</th><th>Parcours</th><th>Joueurs</th><th>Tentatives</th><th>Moyenne</th><th>État</th><th></th>'
      + '</tr></thead><tbody>'
      + rows.map((m) => {
        const s = statsOf(state.byModele[m.id] || []);
        const lesson = lessonLabel(m);
        let tr = '<tr><td><strong>' + esc(m.titre) + '</strong><br><code>' + esc(m.code_unique) + '</code> · '
          + esc(TYPE_LABELS[m.type_jeu] || m.type_jeu) + ' · ' + (m.mode === 'evaluation' ? 'évaluation' : 'entraînement') + '</td>'
          + '<td>' + esc(parcoursName(m.parcours_id)) + (lesson ? '<br><span class="jp-muted">' + esc(lesson) + '</span>' : '') + '</td>'
          + '<td>' + s.users + '</td><td>' + s.done + ' / ' + s.n + '</td><td>' + fmtAvg(s.avg) + '</td>'
          + '<td>' + badge(m) + '</td><td>' + jeuActions(m) + '</td></tr>';
        if (state.expanded.has(m.id)) {
          const list = (state.byModele[m.id] || []).slice(0, 50);
          tr += '<tr class="jp-jx-detail"><td colspan="7">' + attemptsTable(list, true)
            + ((state.byModele[m.id] || []).length > 50 ? '<p class="jp-muted">50 dernières tentatives affichées.</p>' : '')
            + '</td></tr>';
        }
        return tr;
      }).join('')
      + '</tbody></table></div>';
    if (all.length > rows.length) {
      html += '<p><button type="button" class="jp-btn jp-btn-ghost" data-act="more-jeux">Afficher plus ('
        + (all.length - rows.length) + ' restants — ou affinez via la recherche)</button></p>';
    }
    $('jxBody').innerHTML = html;
    bindType();
  }

  function bindType() {
    const sel = $('jxType');
    if (!sel) return;
    sel.addEventListener('change', () => {
      state.type = sel.value;
      state.limitJeux = PAGE;
      render();
    });
  }

  function renderParcours() {
    const buckets = state.parcours.map((p) => ({ id: p.id, label: p.libelle, code: p.code }));
    if (state.modeles.some((m) => !m.parcours_id)) buckets.push({ id: '__none', label: 'Sans parcours', code: '' });
    const shown = buckets.filter((b) => !state.parcoursId || b.id === state.parcoursId);
    if (!shown.length) {
      $('jxBody').innerHTML = '<p class="jp-muted">Aucun parcours.</p>';
      return;
    }
    $('jxBody').innerHTML = chartsParcours(shown) + '<div class="jp-table-wrap"><table class="jp-table"><thead><tr>'
      + '<th>Parcours</th><th>Jeux (actifs / total)</th><th>Inscrits</th><th>Joueurs</th><th>Tentatives</th><th>Moyenne</th><th></th>'
      + '</tr></thead><tbody>'
      + shown.map((b) => {
        const ms = state.modeles.filter((m) => (m.parcours_id || '__none') === b.id);
        const ids = new Set(ms.map((m) => m.id));
        const tl = state.tent.filter((t) => ids.has(t.modele_id));
        const s = statsOf(tl);
        const actifs = ms.filter((m) => etat(m) === 'ok').length;
        const inscrits = new Set(state.inscrits.filter((i) => i.parcours_id === b.id).map((i) => i.user_id)).size;
        const real = b.id !== '__none';
        return '<tr><td><strong>' + esc(b.label) + '</strong>' + (b.code ? '<br><code>' + esc(b.code) + '</code>' : '') + '</td>'
          + '<td>' + actifs + ' / ' + ms.length + '</td><td>' + (real ? inscrits : '—') + '</td>'
          + '<td>' + s.users + '</td><td>' + s.done + ' / ' + s.n + '</td><td>' + fmtAvg(s.avg) + '</td>'
          + '<td><div class="jp-jx-actions">'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-act="parcours-jeux" data-id="' + esc(b.id) + '">Jeux et scores</button>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-act="parcours-pers" data-id="' + esc(b.id) + '">Personnes</button>'
          + (real ? '<a class="jp-btn jp-btn-ghost" href="parcours.html?parcours=' + encodeURIComponent(b.id) + '">Studio</a>' : '')
          + '</div></td></tr>';
      }).join('')
      + '</tbody></table></div>';
  }

  function renderPersonnes() {
    if (!state.personId) {
      const seen = [];
      state.tent.forEach((t) => { if (seen.indexOf(t.utilisateur_id) === -1 && seen.length < 8) seen.push(t.utilisateur_id); });
      $('jxBody').innerHTML = '<p class="jp-muted">Cherchez une personne dans la barre ci-dessus.</p>'
        + (state.tent.length ? chartsPersonnesGlobal() : '')
        + (seen.length
          ? '<p class="jp-kicker" style="margin-top:1rem">Activité récente</p><div class="jp-jx-actions">'
            + seen.map((uid) => '<button type="button" class="jp-btn jp-btn-ghost" data-act="person" data-id="' + esc(uid) + '">'
              + esc(nameOf(uid)) + '</button>').join('') + '</div>'
          : '<p class="jp-muted">Aucune tentative enregistrée.</p>');
      return;
    }
    const uid = state.personId;
    const p = state.profils[uid];
    const list = personTentatives();
    const s = statsOf(list);
    const jeuxJoues = new Set(list.map((t) => t.modele_id)).size;
    const rows = list.slice(0, state.limitTent);

    // Résumé par parcours
    const perP = {};
    list.forEach((t) => {
      const m = state.modeleById[t.modele_id];
      const k = (m && m.parcours_id) || '__none';
      (perP[k] = perP[k] || []).push(t);
    });

    let html = '<h2 class="jp-title" style="font-size:1.3rem;margin-bottom:0">' + esc(nameOf(uid)) + '</h2>'
      + (p && p.email && p.display_name ? '<p class="jp-muted" style="margin:0">' + esc(p.email) + '</p>' : '')
      + '<div class="jp-jx-stats">'
      + '<div class="jp-jx-stat"><strong>' + s.n + '</strong><span>tentatives</span></div>'
      + '<div class="jp-jx-stat"><strong>' + s.done + '</strong><span>terminées</span></div>'
      + '<div class="jp-jx-stat"><strong>' + jeuxJoues + '</strong><span>jeux joués</span></div>'
      + '<div class="jp-jx-stat"><strong>' + fmtAvg(s.avg) + '</strong><span>moyenne</span></div></div>'
      + chartsPersonne(list, perP);

    const pKeys = Object.keys(perP);
    if (pKeys.length > 1) {
      html += '<div class="jp-table-wrap"><table class="jp-table"><thead><tr><th>Parcours</th><th>Tentatives</th><th>Moyenne</th></tr></thead><tbody>'
        + pKeys.map((k) => {
          const ps = statsOf(perP[k]);
          return '<tr><td>' + esc(k === '__none' ? 'Sans parcours' : parcoursName(k)) + '</td><td>' + ps.done + ' / ' + ps.n
            + '</td><td>' + fmtAvg(ps.avg) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    html += '<h3 style="margin:1.25rem 0 0.25rem">Tentatives</h3>' + attemptsTable(rows, false);
    if (list.length > rows.length) {
      html += '<p><button type="button" class="jp-btn jp-btn-ghost" data-act="more-tent">Afficher plus ('
        + (list.length - rows.length) + ' restantes)</button></p>';
    }
    $('jxBody').innerHTML = html;
  }

  function render() {
    renderPills();
    renderTabs();
    if (state.tab === 'jeux') renderJeux();
    else if (state.tab === 'parcours') renderParcours();
    else renderPersonnes();
    const note = $('jxNote');
    note.hidden = !state.truncated;
    if (state.truncated) {
      note.textContent = 'Scores calculés sur les ' + MAX_TENTATIVES + ' tentatives les plus récentes.';
    }
  }

  /* ------------------------------ recherche globale ------------------------------ */

  function suggest(q) {
    const n = TA.norm(q);
    if (!n) return [];
    const out = [];
    state.modeles
      .filter((m) => TA.norm(m.code_unique + ' ' + m.titre).indexOf(n) !== -1)
      .slice(0, 5)
      .forEach((m) => out.push({
        id: m.id, kind: 'jeu', group: 'Jeux', label: m.titre,
        sub: m.code_unique + ' · ' + parcoursName(m.parcours_id),
        badge: etat(m) === 'ok' ? '' : (etat(m) === 'pause' ? 'En pause' : 'Archivé'),
      }));
    state.parcours
      .filter((p) => TA.norm(p.libelle + ' ' + (p.code || '')).indexOf(n) !== -1)
      .slice(0, 4)
      .forEach((p) => out.push({ id: p.id, kind: 'parcours', group: 'Parcours', label: p.libelle, sub: p.code || '' }));
    const people = new Set(state.tent.map((t) => t.utilisateur_id).concat(state.inscrits.map((i) => i.user_id)));
    let count = 0;
    people.forEach((uid) => {
      if (count >= 6) return;
      const p = state.profils[uid] || {};
      if (TA.norm((p.display_name || '') + ' ' + (p.email || '') + ' ' + uid).indexOf(n) === -1) return;
      count += 1;
      out.push({ id: uid, kind: 'personne', group: 'Personnes', label: nameOf(uid), sub: p.email && p.display_name ? p.email : '' });
    });
    return out;
  }

  function onPick(it) {
    state.limitJeux = PAGE;
    state.limitTent = PAGE;
    if (it.kind === 'jeu') {
      state.tab = 'jeux';
      state.modeleId = it.id;
      state.parcoursId = null;
      state.statut = 'tous';
      state.type = '';
      state.expanded.add(it.id);
    } else if (it.kind === 'parcours') {
      state.tab = 'jeux';
      state.parcoursId = it.id;
      state.modeleId = null;
    } else {
      state.tab = 'personnes';
      state.personId = it.id;
    }
    render();
  }

  /* ------------------------------ actions ------------------------------ */

  async function applyEtat(id, patch, logName) {
    const { data, error } = await sb().from('modeles_jeu')
      .update(patch).eq('id', id).select('id, actif, en_pause').single();
    if (error) throw error;
    const m = state.modeleById[id];
    if (m) { m.actif = data.actif; m.en_pause = data.en_pause; }
    void global.JpLogs?.action?.(logName, { id, code: m && m.code_unique });
  }

  async function doAction(act, id) {
    const m = state.modeleById[id];
    if (!m) return;
    if (act === 'pause') {
      const { error } = await sb().rpc('v2_set_pause_jeu', { p_modele_id: id, p_pause: true });
      if (error) throw error;
      m.en_pause = true;
      void global.JpLogs?.action?.('v2_jeu_pause', { id, code: m.code_unique });
      global.JpToast.ok('Jeu mis en pause');
    } else if (act === 'restart') {
      if (!m.actif) {
        await applyEtat(id, { actif: true, en_pause: false }, 'v2_jeu_relance');
      } else {
        const { error } = await sb().rpc('v2_set_pause_jeu', { p_modele_id: id, p_pause: false });
        if (error) throw error;
        m.en_pause = false;
        void global.JpLogs?.action?.('v2_jeu_relance', { id, code: m.code_unique });
      }
      global.JpToast.ok('Jeu relancé');
    } else if (act === 'archive') {
      await applyEtat(id, { actif: false }, 'v2_jeu_archive');
      global.JpToast.ok('Jeu archivé');
    }
    render();
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    const id = el.getAttribute('data-id');
    try {
      if (act === 'tab') {
        state.tab = el.getAttribute('data-tab');
        render();
      } else if (act === 'statut') {
        state.statut = el.getAttribute('data-v');
        state.limitJeux = PAGE;
        render();
      } else if (act === 'scores') {
        if (state.expanded.has(id)) state.expanded.delete(id);
        else state.expanded.add(id);
        render();
      } else if (act === 'more-jeux') {
        state.limitJeux += PAGE;
        render();
      } else if (act === 'more-tent') {
        state.limitTent += PAGE;
        render();
      } else if (act === 'clear') {
        state[el.getAttribute('data-key')] = null;
        render();
      } else if (act === 'person') {
        state.personId = id;
        state.tab = 'personnes';
        state.limitTent = PAGE;
        render();
      } else if (act === 'parcours-jeux') {
        state.parcoursId = id;
        state.modeleId = null;
        state.tab = 'jeux';
        state.limitJeux = PAGE;
        render();
      } else if (act === 'parcours-pers') {
        state.parcoursId = id;
        state.tab = 'personnes';
        render();
      } else if (act === 'archive') {
        const m = state.modeleById[id];
        global.JpModal.open({
          title: 'Archiver ce jeu ?',
          body: ['« ' + (m ? m.titre : '') + ' » ne sera plus jouable. Les scores sont conservés ; vous pourrez le relancer.'],
          confirmLabel: 'Archiver',
          onConfirm: async () => {
            try { await doAction('archive', id); } catch (err) { global.JpToast.fromError(err); }
          },
        });
      } else if (act === 'pause' || act === 'restart') {
        void doAction(act, id).catch((err) => global.JpToast.fromError(err));
      }
    } catch (err) {
      global.JpToast.fromError(err);
    }
  }

  /* ------------------------------ boot ------------------------------ */

  async function boot() {
    global.JpUi.bootPage({ module: 'admin-jeux', homeHref: 'index.html' });
    const body = $('jxBody');
    body.innerHTML = '<p class="jp-muted">Chargement…</p>';
    try {
      await loadAll();
    } catch (e) {
      body.innerHTML = '<p class="jp-muted">Impossible de charger les données.</p>';
      global.JpToast.fromError(e);
      return;
    }

    TA.combo($('jxSearch'), {
      search: async (q) => suggest(q),
      minChars: 1,
      debounce: 80,
      clearOnPick: true,
      inputId: 'jxSearchInput',
      placeholder: 'Chercher un jeu, un parcours ou une personne…',
      ariaLabel: 'Recherche jeux, parcours, personnes',
      emptyText: 'Aucun jeu, parcours ou personne',
      onPick,
    });

    $('jxRoot').addEventListener('click', onClick);
    render();
  }

  global.JpAdminJeux = { boot };
})(window);
