/**
 * Studio — critères de déblocage (migration 028).
 *
 * - Leçon / chapitre : prérequis (`prerequis_module_id`) + critères de validation (`criteres_json`).
 * - Parcours : prérequis parcours + progression minimale + jeux exigés (RPC v2_maj_parcours_criteres).
 *
 * Un élément est « validé » quand ses critères sont remplis (lecture jusqu’en bas et / ou score minimum à un jeu) ;
 * l’élément qui l’a pour prérequis s’ouvre alors. La RLS / les RPC restent la source de vérité.
 */
(function (global) {
  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function loadJeux(parcoursId) {
    const { data, error } = await sb()
      .from('modeles_jeu')
      .select('id, code_unique, type_jeu, titre, mode')
      .eq('parcours_id', parcoursId)
      .eq('actif', true)
      .order('created_at');
    if (error) throw error;
    return data || [];
  }

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const fmt10 = (v) => (Number.isInteger(v) ? String(v) : String(v).replace('.', ','));

  /* ——— Éditeur de critères ——— */

  /**
   * @param {HTMLElement} host
   * @param {{ criteres: object, jeux: Array, kind: 'lecon'|'chapitre'|'parcours', onChange?: Function }} o
   * @returns {{ get: () => object, summary: () => string, count: () => number }}
   */
  function criteresEditor(host, o) {
    const kind = o.kind;
    const crit = o.criteres || {};
    const jeuxById = {};
    (o.jeux || []).forEach((j) => { jeuxById[j.id] = j; });
    const st = {
      lecture: kind === 'lecon' ? crit.lecture !== false : null,
      jeux: (crit.jeux || []).map((j) => ({ modele_id: j.modele_id, min10: (Number(j.score_min_pct) || 0) / 10 })),
      logique: crit.logique === 'ou' ? 'ou' : 'et',
      progMin: kind === 'parcours' ? (crit.progression_min_pct != null ? Number(crit.progression_min_pct) : 100) : null,
    };

    const count = () => (st.lecture ? 1 : 0) + st.jeux.length;

    function get() {
      const out = {};
      if (kind === 'lecon') out.lecture = !!st.lecture;
      out.jeux = st.jeux.map((j) => ({ modele_id: j.modele_id, score_min_pct: Math.round(clamp(Number(j.min10) || 0, 0, 10) * 10) }));
      out.logique = st.logique;
      if (kind === 'parcours') out.progression_min_pct = Math.round(clamp(Number(st.progMin) || 0, 0, 100));
      return out;
    }

    function jeuLabel(id) {
      const j = jeuxById[id];
      return j ? j.titre : 'Jeu archivé';
    }

    function summary() {
      const parts = [];
      if (kind === 'lecon' && st.lecture) parts.push('lire la leçon jusqu’en bas');
      st.jeux.forEach((j) => parts.push('« ' + jeuLabel(j.modele_id) + ' » ≥ ' + fmt10(clamp(Number(j.min10) || 0, 0, 10)) + '/10'));
      const joiner = st.logique === 'ou' ? ' OU ' : ' ET ';
      if (kind === 'parcours') {
        const base = 'Progression ≥ ' + Math.round(clamp(Number(st.progMin) || 0, 0, 100)) + ' %';
        return base + (parts.length ? ' · puis ' + parts.join(joiner) : '');
      }
      if (kind === 'chapitre') {
        return 'Toutes les leçons du chapitre validées' + (parts.length ? ' · puis ' + parts.join(joiner) : '') + '.';
      }
      return parts.length ? 'Validée quand : ' + parts.join(joiner) + '.'
        : 'Aucun critère : la leçon est considérée comme validée d’office.';
    }

    function emit() {
      const sum = host.querySelector('[data-sum]');
      if (sum) sum.textContent = summary();
      if (o.onChange) o.onChange();
    }

    function paint() {
      const free = (o.jeux || []).filter((j) => !st.jeux.some((x) => x.modele_id === j.id))
        .map((j) => ({ id: j.id, label: j.titre, sub: j.code_unique + ' · ' + j.type_jeu }));
      let html = '<div class="jp-crit-ed">';
      if (kind === 'parcours') {
        html += '<div class="jp-field jp-field-tight"><label>Progression minimale pour valider le parcours</label>'
          + '<div class="jp-st-inline"><input type="number" class="jp-st-input jp-st-num" min="0" max="100" step="5" data-prog value="'
          + esc(st.progMin) + '"><span>%</span></div>'
          + '<small class="jp-field-hint">100 % = toutes les leçons validées.</small></div>';
      }
      if (kind === 'lecon') {
        html += '<label class="jp-st-check"><input type="checkbox" data-lecture' + (st.lecture ? ' checked' : '') + '>'
          + '<span>Lecture complète de la leçon requise</span></label>';
      }
      html += '<div class="jp-crit-jeux">' + (st.jeux.length
        ? st.jeux.map((j, i) => '<div class="jp-crit-row"><span class="jp-crit-name" title="' + esc(jeuLabel(j.modele_id)) + '">'
          + esc(jeuLabel(j.modele_id)) + '</span>'
          + '<label class="jp-st-inline">Score min.<input type="number" class="jp-st-input jp-st-num" min="0" max="10" step="0.5" data-min="' + i
          + '" value="' + esc(j.min10) + '"><span>/10</span></label>'
          + '<button type="button" class="jp-crit-x" data-del="' + i + '" aria-label="Retirer ce jeu">×</button></div>').join('')
        : '<p class="jp-muted jp-crit-none">Aucun jeu exigé.</p>') + '</div>';
      html += '<div class="jp-field jp-field-tight"><div data-add></div></div>';
      if (count() >= 2) {
        html += '<div class="jp-ed-seg" role="group" aria-label="Combinaison des critères">'
          + '<button type="button" data-logique="et" class="' + (st.logique === 'et' ? 'is-on' : '') + '">Tous (ET)</button>'
          + '<button type="button" data-logique="ou" class="' + (st.logique === 'ou' ? 'is-on' : '') + '">Au moins un (OU)</button></div>';
      }
      html += '<p class="jp-crit-sum" data-sum></p></div>';
      host.innerHTML = html;

      host.querySelector('[data-lecture]')?.addEventListener('change', (e) => {
        st.lecture = e.target.checked;
        paint();
        emit();
      });
      host.querySelector('[data-prog]')?.addEventListener('input', (e) => {
        st.progMin = e.target.value === '' ? 0 : Number(e.target.value);
        emit();
      });
      host.querySelectorAll('[data-min]').forEach((inp) => {
        inp.addEventListener('input', () => {
          st.jeux[Number(inp.getAttribute('data-min'))].min10 = inp.value === '' ? 0 : Number(inp.value);
          emit();
        });
      });
      host.querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', () => {
          st.jeux.splice(Number(b.getAttribute('data-del')), 1);
          paint();
          emit();
        });
      });
      host.querySelectorAll('[data-logique]').forEach((b) => {
        b.addEventListener('click', () => {
          st.logique = b.getAttribute('data-logique');
          paint();
          emit();
        });
      });
      const addHost = host.querySelector('[data-add]');
      if (free.length || !(o.jeux || []).length) {
        global.JpTypeahead.combo(addHost, {
          search: global.JpTypeahead.localSource(free, { limit: 12 }),
          placeholder: (o.jeux || []).length ? 'Ajouter un jeu exigé…' : 'Aucun jeu dans ce parcours — créez-en un d’abord',
          ariaLabel: 'Ajouter un jeu exigé',
          clearOnPick: true,
          emptyText: 'Aucun jeu disponible',
          onPick: (it) => {
            st.jeux.push({ modele_id: it.id, min10: 8 });
            paint();
            emit();
          },
        });
      } else {
        addHost.innerHTML = '<small class="jp-field-hint">Tous les jeux du parcours sont déjà exigés.</small>';
      }
      const sum = host.querySelector('[data-sum]');
      if (sum) sum.textContent = summary();
    }

    paint();
    return { get, summary, count };
  }

  /* ——— Prérequis (leçons / chapitres) ——— */

  function buildGraph(modules) {
    const byId = {};
    modules.forEach((m) => { byId[m.id] = m; });
    function ancestors(id) {
      const out = [];
      let cur = byId[id] && byId[byId[id].parent_id];
      while (cur) { out.push(cur.id); cur = byId[cur.parent_id]; }
      return out;
    }
    function descendants(id) {
      const out = [];
      modules.filter((m) => m.parent_id === id).forEach((c) => { out.push(c.id); descendants(c.id).forEach((d) => out.push(d)); });
      return out;
    }
    function depsOf(id) {
      const m = byId[id];
      const out = [];
      let a = m;
      while (a) { if (a.prerequis_module_id) out.push(a.prerequis_module_id); a = byId[a.parent_id]; }
      if (m && m.est_groupe) descendants(id).forEach((d) => out.push(d));
      return out;
    }
    function reach(id) {
      const seen = new Set();
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop();
        depsOf(cur).forEach((d) => { if (!seen.has(d)) { seen.add(d); stack.push(d); } });
      }
      return seen;
    }
    return { byId, ancestors, descendants, reach };
  }

  /** Candidats prérequis : jamais soi-même, ses parents / enfants, ni un élément qui dépendrait de soi (blocage mutuel). */
  function prereqCandidates(self, modules) {
    const g = buildGraph(modules);
    const banned = new Set([self.id].concat(g.ancestors(self.id), g.descendants(self.id)));
    return modules.filter((m) => !banned.has(m.id) && !g.reach(m.id).has(self.id)).map((m) => ({
      id: m.id,
      label: m.titre,
      sub: (m.est_groupe ? 'Chapitre' : 'Leçon') + (m.parent_id && g.byId[m.parent_id] ? ' · ' + g.byId[m.parent_id].titre : ''),
    }));
  }

  /**
   * Panneau « Déblocage » d’une leçon ou d’un chapitre.
   * @param {HTMLElement} host
   * @param {{ module: object, modules: Array, parcoursId: string, onSaved?: Function }} o
   */
  async function mountModule(host, o) {
    const m = o.module;
    const kind = m.est_groupe ? 'chapitre' : 'lecon';
    let jeux = [];
    try { jeux = await loadJeux(o.parcoursId); } catch (_) { /* éditeur sans jeux */ }
    if (!host.isConnected) return;

    host.innerHTML = '<div class="jp-inspector-head"><strong class="jp-inspector-title">Déblocage</strong><span data-help></span></div>'
      + '<div class="jp-field jp-field-tight"><label>S’ouvre après validation de</label><div data-prereq></div>'
      + '<small class="jp-field-hint" data-prereq-hint></small></div>'
      + '<div class="jp-field jp-field-tight"><span class="jp-field-label">'
      + (m.est_groupe ? 'Pour valider ce chapitre' : 'Pour valider cette leçon') + '</span><div data-crit></div></div>'
      + '<button type="button" class="jp-btn jp-btn-primary" data-save>Enregistrer le déblocage</button>';

    host.querySelector('[data-help]').appendChild(global.JpModal.helpButton('Déblocage', [
      'Choisissez ce qu’il faut avoir terminé avant d’ouvrir cet élément : sans prérequis, il est ouvert d’emblée.',
      'Une leçon est validée quand elle est lue jusqu’en bas et / ou quand un jeu atteint le score minimum (au choix ET / OU).',
      'Un chapitre est validé quand toutes ses leçons publiées le sont ; un prérequis non publié est ignoré.',
      'Le joueur voit exactement ce qu’il lui reste à faire (« veuillez faire le jeu … pour passer à la leçon suivante »).',
    ]));

    let prereqId = m.prerequis_module_id || null;
    const cands = prereqCandidates(m, o.modules);
    const current = prereqId ? o.modules.find((x) => x.id === prereqId) : null;
    const initial = current ? { id: current.id, label: current.titre, sub: current.est_groupe ? 'Chapitre' : 'Leçon' } : null;
    const hint = host.querySelector('[data-prereq-hint]');
    function paintHint() {
      const p = prereqId ? o.modules.find((x) => x.id === prereqId) : null;
      hint.textContent = !prereqId ? 'Aucun : ouvert dès le début.'
        : (p && !p.publie ? 'Ce prérequis n’est pas publié : il est ignoré pour les joueurs.' : '');
    }
    global.JpTypeahead.combo(host.querySelector('[data-prereq]'), {
      search: global.JpTypeahead.localSource(cands, { limit: 12 }),
      placeholder: 'Aucun (ouvert d’emblée) — chercher…',
      ariaLabel: 'Prérequis',
      initial,
      onChange: (it) => { prereqId = it ? it.id : null; paintHint(); },
    });
    paintHint();

    const ed = criteresEditor(host.querySelector('[data-crit]'), {
      criteres: m.criteres_json || {},
      jeux,
      kind,
    });

    host.querySelector('[data-save]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await rpc('v2_upsert_module', {
          p_payload: { id: m.id, prerequis_module_id: prereqId, criteres_json: ed.get() },
        });
        m.prerequis_module_id = prereqId;
        m.criteres_json = ed.get();
        global.JpToast?.ok?.('Déblocage enregistré');
        if (o.onSaved) await o.onSaved();
      } catch (err) {
        global.JpToast?.fromError?.(err);
      } finally {
        btn.disabled = false;
      }
    });
  }

  /* ——— Réglages du parcours ——— */

  async function openParcours(o) {
    const p = o.parcours;
    const others = (o.parcoursList || []).filter((x) => x.id !== p.id)
      .map((x) => ({ id: x.id, label: x.libelle, sub: x.code }));
    let jeux = [];
    try { jeux = await loadJeux(p.id); } catch (_) { /* sans jeux */ }

    const overlay = document.createElement('div');
    overlay.className = 'jp-studio-overlay';
    overlay.innerHTML = '<div class="jp-studio-sheet jp-jeu-sheet">'
      + '<header class="jp-studio-sheet-head"><h2>Réglages du parcours</h2>'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close aria-label="Fermer">×</button></header>'
      + '<div class="jp-jeu-wiz-body">'
      + '<p class="jp-muted" style="margin-top:0">« ' + esc(p.libelle) + ' » — conditions pour valider ce parcours et pour l’ouvrir.</p>'
      + '<div class="jp-field"><label>S’ouvre après validation du parcours</label><div data-prereq></div>'
      + '<small class="jp-field-hint">Un parcours verrouillé verrouille toutes ses leçons.</small></div>'
      + '<div class="jp-field"><span class="jp-field-label">Pour valider ce parcours</span><div data-crit></div></div>'
      + '</div><footer class="jp-studio-sheet-foot">'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close>Annuler</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" data-save>Enregistrer</button></footer></div>';
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    let prereqId = p.prerequis_parcours_id || null;
    const cur = prereqId ? others.find((x) => x.id === prereqId) : null;
    global.JpTypeahead.combo(overlay.querySelector('[data-prereq]'), {
      search: global.JpTypeahead.localSource(others, { limit: 12 }),
      placeholder: 'Aucun (ouvert d’emblée) — chercher…',
      ariaLabel: 'Parcours prérequis',
      initial: cur || null,
      onChange: (it) => { prereqId = it ? it.id : null; },
    });
    const ed = criteresEditor(overlay.querySelector('[data-crit]'), { criteres: p.criteres_json || {}, jeux, kind: 'parcours' });

    overlay.querySelector('[data-save]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await rpc('v2_maj_parcours_criteres', {
          p_parcours_id: p.id,
          p_prerequis_id: prereqId,
          p_criteres: ed.get(),
        });
        p.prerequis_parcours_id = prereqId;
        p.criteres_json = ed.get();
        global.JpToast?.ok?.('Réglages enregistrés');
        close();
        if (o.onSaved) await o.onSaved();
      } catch (err) {
        btn.disabled = false;
        global.JpToast?.fromError?.(err);
      }
    });
  }

  global.JpStudioDeblocage = { mountModule, openParcours, criteresEditor };
})(window);
