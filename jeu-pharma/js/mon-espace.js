/**
 * Mon espace : progression par parcours (lecture + jeux + scores minimum) et graphiques SVG / CSS (sans librairie).
 * Source : RPC v2_mon_espace (sommaire) ; détail leçons via v2_progression_parcours à l’ouverture.
 */
(function (global) {
  const esc = (s) => global.JpUi.escapeHtml(String(s == null ? '' : s));
  const P = () => global.JpParcoursUi;

  function pctScore(s) {
    const max = Number(s.score_max);
    if (!max || max <= 0 || s.score_obtenu == null) return null;
    return Math.max(0, Math.min(100, (Number(s.score_obtenu) / max) * 100));
  }

  function toneScore(p) { return p == null ? 'none' : (p >= 75 ? 'good' : (p >= 50 ? 'mid' : 'low')); }

  function card(title, sub, inner, wide) {
    return '<figure class="jp-jx-chart' + (wide ? ' is-wide' : '') + '"><figcaption><strong>' + esc(title) + '</strong>'
      + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</figcaption>' + inner + '</figure>';
  }

  const EMPTY = '<p class="jp-muted jp-jx-chart-empty">Pas encore de données.</p>';

  /** Barres de progression par parcours. */
  function chartParcours(parcours) {
    if (!parcours.length) return card('Progression par parcours', '', EMPTY);
    const rows = parcours.map((pc) => {
      const p = pc.parcours || {};
      const v = P().clampPct(p.pct);
      return '<div class="jp-jx-hbar" role="listitem" title="' + esc((p.libelle || '') + ' — ' + v + ' %') + '">'
        + '<span class="jp-jx-hbar-label">' + esc(p.libelle || 'Parcours')
        + '<small>' + (p.nb_valides || 0) + ' / ' + (p.nb_lecons || 0) + ' leçons validées</small></span>'
        + '<span class="jp-jx-hbar-track"><i class="is-' + (v >= 75 ? 'good' : (v >= 40 ? 'mid' : 'low')) + '" style="width:' + Math.max(2, v) + '%"></i></span>'
        + '<span class="jp-jx-hbar-val">' + v + ' %</span></div>';
    }).join('');
    return card('Progression par parcours', 'Lecture + jeux validés', '<div class="jp-jx-hbars" role="list">' + rows + '</div>');
  }

  /** Meilleur score par jeu, avec repère du score minimum requis. */
  function chartBest(scores, reqByModele) {
    const best = {};
    scores.forEach((s) => {
      const p = pctScore(s);
      if (p == null) return;
      const k = s.modele_id || s.code_unique;
      if (!best[k] || p > best[k].p) best[k] = { p, titre: s.titre || s.code_unique || 'Jeu', modele: s.modele_id, n: 0 };
    });
    scores.forEach((s) => { const k = s.modele_id || s.code_unique; if (best[k]) best[k].n += 1; });
    const items = Object.keys(best).map((k) => best[k]).sort((a, b) => b.p - a.p).slice(0, 10);
    if (!items.length) return card('Meilleur score par jeu', 'Le trait indique le minimum requis', EMPTY);
    const rows = items.map((it) => {
      const req = it.modele && reqByModele[it.modele] != null ? reqByModele[it.modele] : null;
      const ok = req == null || it.p >= req;
      return '<div class="jp-jx-hbar" role="listitem" title="' + esc(it.titre + ' — ' + P().sur10(it.p)) + '">'
        + '<span class="jp-jx-hbar-label">' + esc(it.titre) + '<small>' + it.n + ' partie' + (it.n > 1 ? 's' : '')
        + (req != null ? ' · minimum ' + esc(P().sur10(req)) : '') + '</small></span>'
        + '<span class="jp-me-track"><i class="is-' + (req != null ? (ok ? 'good' : 'low') : toneScore(it.p)) + '" style="width:' + Math.max(2, Math.round(it.p)) + '%"></i>'
        + (req != null ? '<b class="jp-me-mark" style="left:' + Math.round(req) + '%" aria-hidden="true"></b>' : '') + '</span>'
        + '<span class="jp-jx-hbar-val">' + esc(P().sur10(it.p)) + (req != null ? (ok ? ' ✓' : '') : '') + '</span></div>';
    }).join('');
    return card('Meilleur score par jeu', 'Le trait indique le minimum requis', '<div class="jp-jx-hbars" role="list">' + rows + '</div>');
  }

  /** Évolution des scores (%) dans le temps. */
  function chartLine(scores) {
    const pts = scores.map((s) => ({ d: Date.parse(s.termine_at), p: pctScore(s) }))
      .filter((x) => x.p != null && !isNaN(x.d)).sort((a, b) => a.d - b.d).slice(-40);
    if (pts.length < 2) return card('Évolution de mes scores', '', '<p class="jp-muted jp-jx-chart-empty">Au moins 2 parties terminées sont nécessaires.</p>', true);
    const W = 640; const H = 180; const L = 34; const R = 12; const T = 10; const B = 22;
    const d0 = pts[0].d; const d1 = pts[pts.length - 1].d;
    const x = (d) => L + ((d - d0) / ((d1 - d0) || 1)) * (W - L - R);
    const y = (p) => T + (1 - p / 100) * (H - T - B);
    const grid = [0, 50, 100].map((g) => '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g)
      + '" class="jp-jx-grid"/><text x="' + (L - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end" class="jp-jx-axis">' + g + '</text>').join('');
    const fmt = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    const line = pts.map((q) => x(q.d).toFixed(1) + ',' + y(q.p).toFixed(1)).join(' ');
    const area = L + ',' + y(0) + ' ' + line + ' ' + x(d1).toFixed(1) + ',' + y(0);
    const dots = pts.map((q) => '<circle cx="' + x(q.d).toFixed(1) + '" cy="' + y(q.p).toFixed(1) + '" r="3.5" class="jp-jx-dot is-'
      + toneScore(q.p) + '"><title>' + Math.round(q.p) + ' % — ' + esc(fmt(q.d)) + '</title></circle>').join('');
    const svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="jp-jx-line" role="img" aria-label="Évolution de mes scores">'
      + grid + '<polygon points="' + area + '" class="jp-jx-area"/><polyline points="' + line + '" class="jp-jx-path"/>' + dots
      + '<text x="' + L + '" y="' + (H - 4) + '" class="jp-jx-axis">' + esc(fmt(d0)) + '</text>'
      + '<text x="' + (W - R) + '" y="' + (H - 4) + '" text-anchor="end" class="jp-jx-axis">' + esc(fmt(d1)) + '</text></svg>';
    return card('Évolution de mes scores', 'Score en % à chaque partie terminée', svg, true);
  }

  /* ——— Détail par parcours ——— */

  function jeuLine(j) {
    const best = j.meilleur_pct == null ? 0 : P().clampPct(j.meilleur_pct);
    const min = P().clampPct(j.score_min_pct);
    return '<div class="jp-me-jeu ' + (j.ok ? 'is-ok' : 'is-todo') + '">'
      + '<div class="jp-me-jeu-head"><span>' + (j.ok ? '✓ ' : '') + 'Jeu « ' + esc(j.titre) + ' »</span>'
      + '<span>' + (j.fait ? esc(P().sur10(j.meilleur_pct)) : 'pas encore joué') + ' · min ' + esc(P().sur10(min)) + '</span></div>'
      + '<span class="jp-me-track"><i class="is-' + (j.ok ? 'good' : 'low') + '" style="width:' + (j.fait ? Math.max(2, best) : 0) + '%"></i>'
      + '<b class="jp-me-mark" style="left:' + min + '%" aria-hidden="true"></b></span></div>';
  }

  function lessonRow(m, groupTitle) {
    const d = m.detail || {};
    const locked = m.statut === 'verrouille';
    const pct = P().clampPct(m.pct);
    let state;
    if (locked) state = '<span class="jp-lc-state is-lock" aria-hidden="true">🔒</span>';
    else if (m.valide) state = '<span class="jp-lc-state is-done" aria-hidden="true">✓</span>';
    else state = '<span class="jp-lc-state is-run" aria-hidden="true">' + pct + '<small>%</small></span>';

    let crit = '';
    if (d.lecture_requise) {
      crit += '<div class="jp-me-jeu ' + (d.lu ? 'is-ok' : 'is-todo') + '"><div class="jp-me-jeu-head"><span>'
        + (d.lu ? '✓ ' : '') + 'Lecture</span><span>' + (d.lu ? 'lue' : P().clampPct(d.lecture_pct) + ' %') + '</span></div>'
        + P().progressBar(d.lu ? 100 : d.lecture_pct, 'Lecture') + '</div>';
    }
    (d.jeux || []).forEach((j) => { crit += jeuLine(j); });
    if (crit && d.logique === 'ou' && ((d.lecture_requise ? 1 : 0) + (d.jeux || []).length) > 1) {
      crit += '<p class="jp-crit-note">Un seul de ces critères suffit.</p>';
    }

    let note = '';
    if (locked && m.bloque_par) note = '<p class="jp-lc-lock">' + esc(P().messageBloque(m.bloque_par)) + '</p>';
    else if (!m.valide) {
      const r = P().restant(d, m.titre);
      if (r.parts.length) note = '<p class="jp-lc-lock">Non validée — reste à faire : ' + esc(r.parts.join(r.joiner === 'ou' ? ' ou ' : ' ; ')) + '.</p>';
    }
    const link = locked ? '' : '<a class="jp-btn jp-btn-ghost jp-btn-touch" href="lecon.html?module=' + encodeURIComponent(m.id) + '">'
      + (m.valide ? 'Revoir' : 'Continuer') + '</a>';
    return '<div class="jp-lc jp-me-lesson' + (locked ? ' is-locked' : '') + (m.valide ? ' is-done' : '') + '">' + state
      + '<div class="jp-lc-main"><strong>' + esc(m.titre) + '</strong>'
      + (groupTitle ? '<small class="jp-lc-maj">' + esc(groupTitle) + '</small>' : '')
      + (crit ? '<div class="jp-me-crit">' + crit + '</div>' : '') + note + '</div>' + link + '</div>';
  }

  function modulesBodyHtml(pc) {
    const p = pc.parcours || {};
    const modules = pc.modules || [];
    const byId = {};
    modules.forEach((m) => { byId[m.id] = m; });
    const leaves = P().orderedLeaves(modules);
    const rows = leaves.map((m) => {
      const g = m.parent_id && byId[m.parent_id] ? byId[m.parent_id].titre : '';
      return lessonRow(m, g);
    }).join('');
    let lock = '';
    if (p.verrouille && p.bloque_par) lock = '<p class="jp-lock-banner">🔒 ' + esc(P().messageBloque(p.bloque_par)) + '</p>';
    let minNote = '';
    if (p.progression_min_pct != null && P().clampPct(p.progression_min_pct) < 100) {
      minNote = '<p class="jp-pc-meta">Parcours validé à partir de ' + P().clampPct(p.progression_min_pct) + ' % de progression.</p>';
    }
    const pid = pc.parcours_id || p.id || '';
    return lock + minNote
      + (rows || (pc.sommaire ? '<p class="jp-muted jp-me-loading">Chargement du détail…</p>' : '<p class="jp-muted">—</p>'))
      + '<a class="jp-btn jp-btn-primary jp-btn-touch jp-me-open" href="espace.html?parcours='
      + encodeURIComponent(pid) + '">Ouvrir le parcours</a>';
  }

  function parcoursCard(pc, open) {
    const p = pc.parcours || {};
    const maj = P().majLabel(p.maj_at);
    const pid = pc.parcours_id || p.id || '';
    return '<details class="jp-me-pc" data-parcours="' + esc(pid) + '"' + (open ? ' open' : '') + '><summary>'
      + P().ring(p.pct, { size: 64 })
      + '<span class="jp-me-pc-title"><strong>' + esc(p.libelle || 'Parcours') + '</strong>'
      + '<small>' + (p.nb_valides || 0) + ' / ' + (p.nb_lecons || 0) + ' leçons validées'
      + (p.valide ? ' · parcours validé ✓' : '') + '</small>'
      + (maj ? '<small>' + esc(maj) + '</small>' : '') + '</span>'
      + '<span class="jp-me-chev" aria-hidden="true">▾</span></summary>'
      + '<div class="jp-me-pc-body">' + modulesBodyHtml(pc) + '</div></details>';
  }

  /* ——— Page ——— */

  function stat(label, value) {
    return '<div class="jp-me-stat"><strong>' + esc(value) + '</strong><span>' + esc(label) + '</span></div>';
  }

  function collectReqByModele(parcours) {
    const reqByModele = {};
    parcours.forEach((pc) => {
      const seuils = pc.jeux_seuils;
      if (seuils && typeof seuils === 'object') {
        Object.keys(seuils).forEach((mid) => {
          reqByModele[mid] = P().clampPct(seuils[mid]);
        });
      }
      (pc.modules || []).forEach((m) => {
        ((m.detail && m.detail.jeux) || []).forEach((j) => {
          reqByModele[j.modele_id] = P().clampPct(j.score_min_pct);
        });
      });
    });
    return reqByModele;
  }

  function render(data) {
    const parcours = (data.parcours || []).filter((pc) => pc && pc.parcours);
    const scores = data.scores || [];
    const reqByModele = collectReqByModele(parcours);

    const pcts = scores.map(pctScore).filter((x) => x != null);
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
    const totalLecons = parcours.reduce((a, pc) => a + ((pc.parcours.nb_lecons) || 0), 0);
    const totalOk = parcours.reduce((a, pc) => a + ((pc.parcours.nb_valides) || 0), 0);
    const globalPct = totalLecons ? Math.round((totalOk / totalLecons) * 100) : 0;

    const root = document.getElementById('me-root');
    let html = '<section class="jp-me-hero">' + P().ring(globalPct, { size: 92 })
      + '<div class="jp-me-stats">'
      + stat('leçons validées', totalOk + ' / ' + totalLecons)
      + stat('parties jouées', String(scores.length))
      + stat('score moyen', avg == null ? '—' : P().sur10(avg))
      + '</div></section>';

    html += '<h2 class="jp-me-h">Mes parcours</h2>';
    html += parcours.length
      ? parcours.map((pc, i) => parcoursCard(pc, parcours.length === 1 && i === 0)).join('')
      : '<p class="jp-muted"><a href="parcours.html">Demander un parcours</a></p>';

    html += '<h2 class="jp-me-h">Graphiques</h2><div class="jp-jx-charts jp-me-charts">'
      + chartParcours(parcours) + chartBest(scores, reqByModele) + chartLine(scores) + '</div>';

    html += '<h2 class="jp-me-h">Dernières parties</h2>';
    const recent = scores.slice(0, 15);
    html += recent.length ? '<ul class="jp-list-clean">' + recent.map((s) => {
      const p = pctScore(s);
      const req = s.modele_id && reqByModele[s.modele_id] != null ? reqByModele[s.modele_id] : null;
      const ok = req != null && p != null && p >= req;
      return '<li class="jp-list-row"><span><strong>' + esc(s.titre || s.code_unique || '') + '</strong>'
        + '<small class="jp-lc-maj" style="display:block">' + esc(P().fmtDate(s.termine_at)) + '</small></span>'
        + '<span class="jp-badge-soft' + (req != null && !ok ? ' wait' : '') + '">'
        + (s.score_obtenu ?? '—') + ' / ' + (s.score_max ?? '—') + (ok ? ' ✓' : '') + '</span></li>';
    }).join('') + '</ul>' : '<p class="jp-muted">—</p>';
    root.innerHTML = html;

    bindDetailLoaders(parcours);
  }

  /** Charge v2_progression_parcours à l’ouverture d’un <details> (sommaire). */
  function bindDetailLoaders(parcours) {
    const byId = {};
    parcours.forEach((pc) => {
      const id = pc.parcours_id || pc.parcours?.id;
      if (id) byId[String(id)] = pc;
    });

    async function loadDetail(detailsEl) {
      const pid = detailsEl.getAttribute('data-parcours');
      const pc = pid ? byId[pid] : null;
      if (!pc || !pc.sommaire) return;
      if (pc._loadingDetail) return;
      pc._loadingDetail = true;
      const body = detailsEl.querySelector('.jp-me-pc-body');
      try {
        const full = await global.JpV2Resolver.progression(pid);
        pc.modules = (full && full.modules) || [];
        if (full && full.parcours) {
          pc.parcours = Object.assign({}, pc.parcours || {}, full.parcours);
        }
        pc.sommaire = false;
        if (body) body.innerHTML = modulesBodyHtml(pc);
      } catch (e) {
        if (body) {
          body.innerHTML = '<p class="jp-muted">Impossible de charger le détail.</p>'
            + '<a class="jp-btn jp-btn-primary jp-btn-touch jp-me-open" href="espace.html?parcours='
            + encodeURIComponent(pid) + '">Ouvrir le parcours</a>';
        }
        global.JpToast?.fromError?.(e);
      } finally {
        pc._loadingDetail = false;
      }
    }

    document.querySelectorAll('details.jp-me-pc[data-parcours]').forEach((el) => {
      el.addEventListener('toggle', () => {
        if (el.open) void loadDetail(el);
      });
      if (el.open) void loadDetail(el);
    });
  }

  async function boot() {
    const data = await global.JpV2Resolver.monEspace();
    render(data || {});
  }

  global.JpMonEspace = { boot };
})(window);
