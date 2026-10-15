/**
 * Admin Accès parcours — demandes en attente, accès accordés/refusés et avancement par personne.
 * Données (lecture admin via RLS, clé anon) : inscriptions_parcours, parcours_apprentissage, modules_cours,
 * progression_modules, modeles_jeu, tentatives_jeu ; noms via portail.profiles.
 * Actions : RPC v2_traiter_demande_parcours (accepte | refuse, ★1–5 si accepte),
 * v2_maj_niveau_parcours, v2_reinit_parcours_joueur — security definer, réservé admin portail.
 *
 * Avancement = jeux terminés (distincts) / jeux actifs du parcours ; leçons = progression_modules.statut = 'termine'
 * sur les leçons publiées (feuilles). Les deux sont affichés : la table de progression des leçons n'est alimentée
 * que si le parcours la renseigne.
 */
(function (global) {
  const MAX_TENTATIVES = 10000;

  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s == null ? '' : s)); }
  function $(id) { return document.getElementById(id); }

  const state = {
    inscr: [],
    parcours: {},
    modules: [], // feuilles publiées
    modeles: [],
    prog: [], // progression_modules
    tent: [],
    profils: {},
    tab: 'demande', // demande | accepte | refuse
    q: '',
    expanded: new Set(),
    truncated: false,
  };

  function starsLabel(n) {
    const v = Math.max(1, Math.min(5, Number(n) || 1));
    return '★'.repeat(v) + '☆'.repeat(5 - v) + ' ' + v;
  }

  function starsSelectHtml(name, selected) {
    const cur = Number(selected) || 1;
    let opts = '';
    for (let i = 1; i <= 5; i += 1) {
      opts += '<option value="' + i + '"' + (i === cur ? ' selected' : '') + '>' + starsLabel(i) + '</option>';
    }
    return '<select class="jp-acc-stars-select" name="' + esc(name) + '" aria-label="Niveau d’accès">' + opts + '</select>';
  }

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
      if (res.error) continue;
      (res.data || []).forEach((p) => { out[p.id] = p; });
    }
    return out;
  }

  async function loadAll() {
    const [inscr, parcours, modules, modeles] = await Promise.all([
      fetchAll(() => sb().from('inscriptions_parcours')
        .select('id, user_id, parcours_id, statut, actif, niveau_parcours, demande_at, traite_at, debut_at')
        .order('demande_at', { ascending: false, nullsFirst: false }), 5000),
      sb().from('parcours_apprentissage').select('id, code, libelle, actif'),
      sb().from('modules_cours').select('id, parcours_id, titre, est_groupe, publie, ordre'),
      sb().from('modeles_jeu').select('id, code_unique, titre, type_jeu, parcours_id, actif, en_pause'),
    ]);
    [parcours, modules, modeles].forEach((r) => { if (r.error) throw r.error; });

    const accepted = inscr.rows.filter((r) => r.statut === 'accepte');
    const [prog, tent] = await Promise.all([
      fetchAll(() => sb().from('progression_modules').select('user_id, module_id, statut, termine_at, updated_at'), 20000),
      accepted.length
        ? fetchAll(() => sb().from('tentatives_jeu')
          .select('id, modele_id, utilisateur_id, score_obtenu, score_max, termine_at, created_at')
          .order('created_at', { ascending: false }), MAX_TENTATIVES)
        : Promise.resolve({ rows: [], truncated: false }),
    ]);

    state.inscr = inscr.rows;
    state.parcours = {};
    (parcours.data || []).forEach((p) => { state.parcours[p.id] = p; });
    state.modules = (modules.data || []).filter((m) => !m.est_groupe && m.publie);
    state.modeles = (modeles.data || []).filter((m) => m.actif);
    state.prog = prog.rows;
    state.tent = tent.rows;
    state.truncated = tent.truncated;
    state.profils = await loadProfils(inscr.rows.map((r) => r.user_id));
  }

  /* ------------------------------ helpers ------------------------------ */

  function nameOf(uid) {
    const p = state.profils[uid];
    return (p && (p.display_name || p.email)) || ('Joueur ' + String(uid).slice(0, 8));
  }
  function emailOf(uid) {
    const p = state.profils[uid];
    return p && p.display_name && p.email ? p.email : '';
  }
  function parcoursLabel(id) {
    const p = state.parcours[id];
    return p ? p.libelle : 'Parcours supprimé';
  }
  function fmtDate(s) {
    if (!s) return '—';
    try { return new Date(s).toLocaleDateString('fr-FR', { dateStyle: 'medium' }); } catch (_) { return String(s); }
  }
  function pctOf(t) {
    if (!t.termine_at || t.score_obtenu == null || !(Number(t.score_max) > 0)) return null;
    return (Number(t.score_obtenu) / Number(t.score_max)) * 100;
  }
  function tone(p) { return p == null ? 'good' : (p >= 75 ? 'good' : (p >= 50 ? 'mid' : 'low')); }

  /** Avancement d'une personne dans un parcours. */
  function progressOf(uid, parcoursId) {
    const jeux = state.modeles.filter((m) => m.parcours_id === parcoursId);
    const jeuIds = new Set(jeux.map((m) => m.id));
    const mine = state.tent.filter((t) => t.utilisateur_id === uid && jeuIds.has(t.modele_id));
    const best = {};
    const count = {};
    mine.forEach((t) => {
      count[t.modele_id] = (count[t.modele_id] || 0) + 1;
      const p = pctOf(t);
      if (p !== null && (best[t.modele_id] === undefined || p > best[t.modele_id])) best[t.modele_id] = p;
    });
    const jeuxDone = Object.keys(best).length;

    const leaves = state.modules.filter((m) => m.parcours_id === parcoursId).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    const progBy = {};
    state.prog.filter((p) => p.user_id === uid).forEach((p) => { progBy[p.module_id] = p; });
    const leconsDone = leaves.filter((m) => progBy[m.id] && progBy[m.id].statut === 'termine').length;

    const scores = Object.keys(best).map((k) => best[k]);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    const last = mine.reduce((acc, t) => {
      const d = Date.parse(t.termine_at || t.created_at) || 0;
      return d > acc ? d : acc;
    }, 0);

    let pct = 0;
    if (jeux.length) pct = (jeuxDone / jeux.length) * 100;
    else if (leaves.length) pct = (leconsDone / leaves.length) * 100;

    return { jeux, best, count, jeuxDone, leaves, progBy, leconsDone, avg, last: last || null, pct: Math.round(pct) };
  }

  /* ------------------------------ rendu ------------------------------ */

  function counts() {
    const c = { demande: 0, accepte: 0, refuse: 0 };
    state.inscr.forEach((r) => { if (c[r.statut] !== undefined) c[r.statut] += 1; });
    return c;
  }

  function matchesQuery(r) {
    const q = global.JpTypeahead.norm(state.q);
    if (!q) return true;
    const p = state.profils[r.user_id] || {};
    return global.JpTypeahead.norm([p.display_name, p.email, parcoursLabel(r.parcours_id)].join(' ')).indexOf(q) !== -1;
  }

  function progressCell(pr) {
    const jeux = pr.jeux.length
      ? '<span title="Jeux terminés / jeux actifs">Jeux ' + pr.jeuxDone + ' / ' + pr.jeux.length + '</span>' : '';
    const lecons = pr.leaves.length
      ? '<span title="Leçons terminées / leçons publiées">Leçons ' + pr.leconsDone + ' / ' + pr.leaves.length + '</span>' : '';
    return '<div class="jp-acc-prog">'
      + '<div class="jp-acc-prog-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pr.pct + '">'
      + '<i class="is-' + (pr.pct >= 75 ? 'good' : (pr.pct >= 30 ? 'mid' : 'low')) + '" style="width:' + Math.max(pr.pct ? 3 : 0, pr.pct) + '%"></i></div>'
      + '<div class="jp-acc-prog-meta"><strong>' + pr.pct + ' %</strong>' + jeux + lecons + '</div></div>';
  }

  function detailRow(r, pr, cols) {
    const jeux = pr.jeux.length
      ? '<table class="jp-table jp-acc-sub"><thead><tr><th>Jeu</th><th>Essais</th><th>Meilleur score</th></tr></thead><tbody>'
        + pr.jeux.map((m) => {
          const b = pr.best[m.id];
          return '<tr><td><code>' + esc(m.code_unique) + '</code> ' + esc(m.titre) + '</td><td>' + (pr.count[m.id] || 0) + '</td><td>'
            + (b === undefined ? '<span class="jp-muted">Pas terminé</span>'
              : '<span class="jp-acc-score is-' + tone(b) + '">' + Math.round(b) + ' %</span>') + '</td></tr>';
        }).join('') + '</tbody></table>'
      : '<p class="jp-muted">Aucun jeu actif dans ce parcours.</p>';
    const lecons = pr.leaves.length
      ? '<ul class="jp-acc-lessons">' + pr.leaves.map((m) => {
        const st = pr.progBy[m.id] ? pr.progBy[m.id].statut : '';
        const label = st === 'termine' ? 'Terminée' : (st === 'debloque' ? 'Débloquée' : '—');
        return '<li class="' + (st === 'termine' ? 'is-done' : '') + '"><span>' + esc(m.titre) + '</span><em>' + label + '</em></li>';
      }).join('') + '</ul>'
      : '<p class="jp-muted">Aucune leçon publiée.</p>';
    return '<tr class="jp-acc-detail"><td colspan="' + cols + '"><div class="jp-acc-detail-grid">'
      + '<div><h3>Jeux</h3>' + jeux + '</div><div><h3>Leçons</h3>' + lecons + '</div></div></td></tr>';
  }

  function renderTabs() {
    const c = counts();
    const tabs = [['demande', 'Demandes', c.demande], ['accepte', 'Accès accordés', c.accepte], ['refuse', 'Refusés', c.refuse]];
    $('accTabs').innerHTML = tabs.map((t) =>
      '<button type="button" class="jp-jx-tab' + (state.tab === t[0] ? ' is-active' : '') + '" role="tab" aria-selected="'
      + (state.tab === t[0]) + '" data-act="tab" data-tab="' + t[0] + '">' + t[1]
      + ' <span class="jp-acc-count">' + t[2] + '</span></button>').join('');
  }

  function renderList() {
    const rows = state.inscr.filter((r) => r.statut === state.tab).filter(matchesQuery);
    const host = $('list');
    if (!rows.length) {
      const empty = { demande: 'Aucune demande en attente', accepte: 'Aucun accès accordé', refuse: 'Aucun accès refusé' }[state.tab];
      host.innerHTML = '<p class="jp-muted">' + (state.q ? 'Aucun résultat pour cette recherche.' : empty) + '</p>';
      return;
    }

    if (state.tab === 'accepte') {
      host.innerHTML = '<div class="jp-table-wrap"><table class="jp-table jp-acc-table"><thead><tr>'
        + '<th>Joueur</th><th>Parcours</th><th>Niveau</th><th>Avancement</th><th>Moyenne</th><th>Dernière activité</th><th>Accès depuis</th><th></th>'
        + '</tr></thead><tbody>'
        + rows.map((r) => {
          const pr = progressOf(r.user_id, r.parcours_id);
          const open = state.expanded.has(r.id);
          const niv = r.niveau_parcours || 1;
          return '<tr><td><strong>' + esc(nameOf(r.user_id)) + '</strong>'
            + (emailOf(r.user_id) ? '<br><span class="jp-muted">' + esc(emailOf(r.user_id)) + '</span>' : '') + '</td>'
            + '<td>' + esc(parcoursLabel(r.parcours_id)) + '</td>'
            + '<td><span class="jp-acc-stars" title="Niveau d’accès">' + esc(starsLabel(niv)) + '</span></td>'
            + '<td>' + progressCell(pr) + '</td>'
            + '<td>' + (pr.avg == null ? '—' : '<span class="jp-acc-score is-' + tone(pr.avg) + '">' + Math.round(pr.avg) + ' %</span>') + '</td>'
            + '<td>' + esc(pr.last ? fmtDate(new Date(pr.last).toISOString()) : '—') + '</td>'
            + '<td>' + esc(fmtDate(r.traite_at || r.debut_at)) + '</td>'
            + '<td><div class="jp-jx-actions">'
            + '<button type="button" class="jp-btn jp-btn-ghost" data-act="niveau" data-id="' + esc(r.id) + '" data-niveau="' + niv + '">Modifier ★</button>'
            + '<button type="button" class="jp-btn jp-btn-ghost" data-act="detail" data-id="' + esc(r.id) + '">' + (open ? 'Masquer' : 'Détail') + '</button>'
            + '<button type="button" class="jp-btn jp-btn-ghost" data-act="reinit" data-id="' + esc(r.id) + '">Réinitialiser</button>'
            + '<button type="button" class="jp-btn jp-btn-ghost" data-act="revoke" data-id="' + esc(r.id) + '">Retirer l’accès</button>'
            + '</div></td></tr>'
            + (open ? detailRow(r, pr, 8) : '');
        }).join('') + '</tbody></table></div>'
        + (state.truncated ? '<p class="jp-muted">Scores calculés sur les ' + MAX_TENTATIVES + ' tentatives les plus récentes.</p>' : '');
      return;
    }

    host.innerHTML = '<div class="jp-table-wrap"><table class="jp-table"><thead><tr>'
      + '<th>Joueur</th><th>Parcours</th><th>' + (state.tab === 'demande' ? 'Demandé le' : 'Traité le') + '</th><th></th>'
      + '</tr></thead><tbody>'
      + rows.map((r) => '<tr><td><strong>' + esc(nameOf(r.user_id)) + '</strong>'
        + (emailOf(r.user_id) ? '<br><span class="jp-muted">' + esc(emailOf(r.user_id)) + '</span>' : '') + '</td>'
        + '<td>' + esc(parcoursLabel(r.parcours_id)) + '</td>'
        + '<td>' + esc(fmtDate(state.tab === 'demande' ? r.demande_at : (r.traite_at || r.demande_at))) + '</td>'
        + '<td><div class="jp-jx-actions">'
        + (state.tab === 'demande'
          ? '<button type="button" class="jp-btn jp-btn-primary" data-act="accept" data-id="' + esc(r.id) + '">Accorder</button>'
            + '<button type="button" class="jp-btn jp-btn-ghost" data-act="refuse" data-id="' + esc(r.id) + '">Refuser</button>'
          : '<button type="button" class="jp-btn jp-btn-primary" data-act="accept" data-id="' + esc(r.id) + '">Réaccorder</button>')
        + '</div></td></tr>').join('') + '</tbody></table></div>';
  }

  function render() {
    renderTabs();
    renderList();
  }

  /* ------------------------------ actions ------------------------------ */

  async function traiter(id, statut, niveau, okMsg) {
    const payload = { p_id: id, p_statut: statut };
    if (statut === 'accepte') payload.p_niveau_parcours = Number(niveau) || 1;
    const { error } = await sb().rpc('v2_traiter_demande_parcours', payload);
    if (error) throw error;
    const r = state.inscr.find((x) => x.id === id);
    if (r) {
      r.statut = statut;
      r.actif = statut === 'accepte';
      r.traite_at = new Date().toISOString();
      if (statut === 'accepte') r.niveau_parcours = Number(niveau) || 1;
    }
    void global.JpLogs?.action?.('v2_acces_parcours_' + statut, { id, niveau_parcours: niveau });
    global.JpToast.ok(okMsg);
    if (statut === 'accepte') await loadAll();
    render();
  }

  function askNiveau(title, bodyLines, current, onOk) {
    const wrap = document.createElement('div');
    (bodyLines || []).forEach((t) => {
      const p = document.createElement('p');
      p.textContent = t;
      wrap.appendChild(p);
    });
    const label = document.createElement('label');
    label.className = 'jp-field';
    label.style.display = 'block';
    label.style.marginTop = '0.75rem';
    label.innerHTML = '<span>Niveau d’accès</span><br>' + starsSelectHtml('niveau', current);
    wrap.appendChild(label);
    const sel = label.querySelector('select');
    global.JpModal.open({
      title,
      body: wrap,
      confirmLabel: 'Valider',
      onConfirm: async () => {
        await onOk(sel ? Number(sel.value) : current);
      },
    });
  }

  async function majNiveau(id, niveau) {
    const { error } = await sb().rpc('v2_maj_niveau_parcours', {
      p_inscription_id: id,
      p_niveau: Number(niveau) || 1,
    });
    if (error) throw error;
    const r = state.inscr.find((x) => x.id === id);
    if (r) r.niveau_parcours = Number(niveau) || 1;
    void global.JpLogs?.action?.('v2_maj_niveau_parcours', { id, niveau_parcours: niveau });
    global.JpToast.ok('Niveau mis à jour');
    render();
  }

  async function reinitParcours(id) {
    const { data, error } = await sb().rpc('v2_reinit_parcours_joueur', { p_inscription_id: id });
    if (error) throw error;
    const nTent = data && data.tentatives_supprimees != null ? data.tentatives_supprimees : 0;
    const nProg = data && data.progression_supprimee != null ? data.progression_supprimee : 0;
    void global.JpLogs?.action?.('v2_reinit_parcours_joueur', {
      id,
      tentatives_supprimees: nTent,
      progression_supprimee: nProg,
      scores_fiche_supprimes: data && data.scores_fiche_supprimes,
    });
    await loadAll();
    global.JpToast.ok(
      'Parcours réinitialisé (' + nTent + ' tentative' + (nTent === 1 ? '' : 's')
        + ', ' + nProg + ' leçon' + (nProg === 1 ? '' : 's') + ')'
    );
    render();
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const act = el.getAttribute('data-act');
    const id = el.getAttribute('data-id');
    if (act === 'tab') {
      state.tab = el.getAttribute('data-tab');
      render();
    } else if (act === 'detail') {
      if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id);
      render();
    } else if (act === 'accept') {
      const r = state.inscr.find((x) => x.id === id);
      askNiveau(
        'Accorder l’accès',
        [(r ? nameOf(r.user_id) : 'Cette personne') + ' — « ' + (r ? parcoursLabel(r.parcours_id) : '') + ' ». '
          + 'Choisissez le niveau d’étoiles (contenu visible selon les plages min–max).'],
        r?.niveau_parcours || 1,
        async (n) => {
          try { await traiter(id, 'accepte', n, 'Accès accordé (★' + n + ')'); }
          catch (err) { global.JpToast.fromError(err); }
        }
      );
    } else if (act === 'niveau') {
      const r = state.inscr.find((x) => x.id === id);
      const cur = Number(el.getAttribute('data-niveau')) || r?.niveau_parcours || 1;
      askNiveau(
        'Modifier le niveau',
        ['Nouveau niveau pour ' + (r ? nameOf(r.user_id) : 'ce joueur') + ' sur « '
          + (r ? parcoursLabel(r.parcours_id) : '') + ' ».'],
        cur,
        async (n) => {
          try { await majNiveau(id, n); } catch (err) { global.JpToast.fromError(err); }
        }
      );
    } else if (act === 'refuse') {
      void traiter(id, 'refuse', null, 'Demande refusée').catch((err) => global.JpToast.fromError(err));
    } else if (act === 'reinit') {
      const r = state.inscr.find((x) => x.id === id);
      const qui = r ? nameOf(r.user_id) : 'Cette personne';
      const parc = r ? parcoursLabel(r.parcours_id) : 'ce parcours';
      global.JpModal.open({
        title: 'Réinitialiser le parcours ?',
        body: [
          qui + ' — « ' + parc + ' ».',
          'Efface la progression (leçons lues / déblocage) et toutes les tentatives / scores des jeux de ce parcours, y compris les notes fiche aléatoire sur les molécules publiées ici.',
          'L’accès et le niveau ★ sont conservés. Cette action est irréversible.',
        ],
        confirmLabel: 'Réinitialiser',
        onConfirm: async () => {
          try { await reinitParcours(id); } catch (err) { global.JpToast.fromError(err); }
        },
      });
    } else if (act === 'revoke') {
      const r = state.inscr.find((x) => x.id === id);
      global.JpModal.open({
        title: 'Retirer l’accès ?',
        body: [(r ? nameOf(r.user_id) : 'Cette personne') + ' ne pourra plus ouvrir « ' + (r ? parcoursLabel(r.parcours_id) : '') + ' ». '
          + 'Ses scores sont conservés ; vous pourrez lui redonner l’accès.'],
        confirmLabel: 'Retirer l’accès',
        onConfirm: async () => {
          try { await traiter(id, 'refuse', null, 'Accès retiré'); } catch (err) { global.JpToast.fromError(err); }
        },
      });
    }
  }

  async function boot() {
    const host = $('list');
    host.innerHTML = '<p class="jp-muted">Chargement…</p>';
    try {
      await loadAll();
    } catch (e) {
      host.innerHTML = '<p class="jp-muted">Impossible de charger les accès.</p>';
      global.JpToast.fromError(e);
      return;
    }
    if (!counts().demande && counts().accepte) state.tab = 'accepte';
    const search = $('accSearch');
    let t = null;
    search.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { state.q = search.value || ''; renderList(); }, 120);
    });
    $('accRoot').addEventListener('click', onClick);
    render();
  }

  global.JpAdminAcces = { boot };
})(window);
