/**
 * Studio — critères de déblocage (migration 028 + 065 par niveau ★).
 *
 * - Leçon / chapitre : prérequis + critères de validation (`criteres_json`).
 * - Par niveau ★1–★5 : overrides dans `criteres_json.niveaux["N"]` ; base = fallback.
 * - Parcours : prérequis parcours + progression minimale + jeux (RPC v2_maj_parcours_criteres).
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
  const NIVEAUX = ['1', '2', '3', '4', '5'];

  /** Critères plats (sans `niveaux` / prérequis). */
  function platOf(crit) {
    const c = crit && typeof crit === 'object' ? crit : {};
    const lecs = Array.isArray(c.lecons_lecture_ids)
      ? c.lecons_lecture_ids.filter(Boolean)
      : [];
    return {
      lecture: c.lecture,
      jeux: Array.isArray(c.jeux) ? c.jeux.map((j) => ({
        modele_id: j.modele_id,
        score_min_pct: j.score_min_pct,
      })) : [],
      lecons_lecture_ids: lecs,
      logique: c.logique === 'ou' ? 'ou' : 'et',
      progression_min_pct: c.progression_min_pct,
    };
  }

  function hasNiveauOverride(crit, n) {
    const o = crit && crit.niveaux && crit.niveaux[String(n)];
    return !!(o && typeof o === 'object' && Object.keys(o).length);
  }

  /* ——— Éditeur de critères ——— */

  /**
   * @param {HTMLElement} host
   * @param {{ criteres: object, jeux: Array, kind: 'lecon'|'chapitre'|'parcours', modules?: Array, selfId?: string, onChange?: Function }} o
   * @returns {{ get: () => object, summary: () => string, count: () => number, set: (c: object) => void }}
   */
  function criteresEditor(host, o) {
    const kind = o.kind;
    const jeuxById = {};
    (o.jeux || []).forEach((j) => { jeuxById[j.id] = j; });
    const modsById = {};
    (o.modules || []).forEach((m) => { modsById[m.id] = m; });
    const st = {
      lecture: null,
      jeux: [],
      leconsLectureIds: [],
      logique: 'et',
      progMin: null,
    };

    function loadFrom(crit) {
      const c = platOf(crit);
      st.lecture = kind === 'lecon' ? c.lecture !== false : null;
      st.jeux = (c.jeux || []).map((j) => ({
        modele_id: j.modele_id,
        min10: (Number(j.score_min_pct) || 0) / 10,
      }));
      st.leconsLectureIds = (c.lecons_lecture_ids || []).filter((id) => id && id !== o.selfId);
      st.logique = c.logique === 'ou' ? 'ou' : 'et';
      st.progMin = kind === 'parcours'
        ? (c.progression_min_pct != null ? Number(c.progression_min_pct) : 100)
        : null;
    }
    loadFrom(o.criteres || {});

    const count = () => (st.lecture ? 1 : 0) + st.jeux.length + st.leconsLectureIds.length;

    function get() {
      const out = {};
      if (kind === 'lecon') out.lecture = !!st.lecture;
      out.jeux = st.jeux.map((j) => ({
        modele_id: j.modele_id,
        score_min_pct: Math.round(clamp(Number(j.min10) || 0, 0, 10) * 10),
      }));
      if (kind === 'lecon' || kind === 'chapitre') {
        out.lecons_lecture_ids = st.leconsLectureIds.slice();
      }
      out.logique = st.logique;
      if (kind === 'parcours') out.progression_min_pct = Math.round(clamp(Number(st.progMin) || 0, 0, 100));
      return out;
    }

    function jeuLabel(id) {
      const j = jeuxById[id];
      return j ? j.titre : 'Jeu archivé';
    }

    function leconLabel(id) {
      const m = modsById[id];
      return m ? m.titre : 'Leçon retirée';
    }

    function summary() {
      const parts = [];
      if (kind === 'lecon' && st.lecture) parts.push('lire la leçon jusqu’en bas');
      st.leconsLectureIds.forEach((id) => parts.push('lire « ' + leconLabel(id) + ' »'));
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

    function leconCands() {
      return (o.modules || [])
        .filter((m) => !m.est_groupe && m.id !== o.selfId && !st.leconsLectureIds.includes(m.id))
        .map((m) => ({
          id: m.id,
          label: m.titre,
          sub: m.parent_id && modsById[m.parent_id]
            ? modsById[m.parent_id].titre
            : 'Leçon',
        }));
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
      if (kind === 'lecon' || kind === 'chapitre') {
        html += '<div class="jp-field jp-field-tight" style="margin-top:0.6rem">'
          + '<label>Autres leçons à lire (toutes)</label>'
          + '<div data-lecons-lecture></div>'
          + '<small class="jp-field-hint">Le joueur doit avoir lu ces leçons jusqu’en bas pour valider.</small></div>';
      }
      html += '<div class="jp-crit-jeux">' + (st.jeux.length
        ? st.jeux.map((j, i) => {
          const meta = (o.jeux || []).find((x) => x.id === j.modele_id);
          const isFiche = meta && meta.type_jeu === 'fiche_aleatoire';
          return '<div class="jp-crit-row"><span class="jp-crit-name" title="' + esc(jeuLabel(j.modele_id)) + '">'
            + esc(jeuLabel(j.modele_id)) + '</span>'
            + '<label class="jp-st-inline">' + (isFiche ? 'Min. %' : 'Score min.')
            + '<input type="number" class="jp-st-input jp-st-num" min="0" max="10" step="0.5" data-min="' + i
            + '" value="' + esc(j.min10) + '"><span>' + (isFiche ? '×10 → %' : '/10') + '</span></label>'
            + '<button type="button" class="jp-crit-x" data-del="' + i + '" aria-label="Retirer ce jeu">×</button></div>'
            + (isFiche
              ? '<p class="jp-muted jp-field-hint" style="margin:0 0 0.4rem">Fiche aléatoire : % de molécules maîtrisées '
                + '(N notes ≥ seuil du jeu). Ex. 7/10 → 70 % du répertoire.</p>'
              : '');
        }).join('')
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

      const lecsHost = host.querySelector('[data-lecons-lecture]');
      if (lecsHost && global.JpTypeahead?.chips) {
        const initial = st.leconsLectureIds.map((id) => ({
          id,
          label: leconLabel(id),
          sub: 'Leçon',
        }));
        global.JpTypeahead.chips(lecsHost, {
          search: global.JpTypeahead.localSource(leconCands(), { limit: 12 }),
          placeholder: 'Ajouter une leçon à lire…',
          ariaLabel: 'Autres leçons à lire',
          initial,
          onChange: (items) => {
            st.leconsLectureIds = (items || []).map((it) => it.id).filter((id) => id !== o.selfId);
            paint();
            emit();
          },
        });
      }

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
    return {
      get,
      summary,
      count,
      set(crit) {
        loadFrom(crit || {});
        paint();
        emit();
      },
    };
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
      modules.filter((m) => m.parent_id === id).forEach((c) => {
        out.push(c.id);
        descendants(c.id).forEach((d) => out.push(d));
      });
      return out;
    }
    function idsOf(src) {
      if (!src) return [];
      if (Array.isArray(src.prerequis_module_ids) && src.prerequis_module_ids.length) {
        return src.prerequis_module_ids.filter(Boolean);
      }
      if (src.prerequis_module_id) return [src.prerequis_module_id];
      return [];
    }
    function depsOf(id) {
      const m = byId[id];
      const out = [];
      let a = m;
      while (a) {
        idsOf(a).forEach((x) => out.push(x));
        const nivs = a.criteres_json && a.criteres_json.niveaux;
        if (nivs && typeof nivs === 'object') {
          NIVEAUX.forEach((k) => {
            const ov = nivs[k];
            if (ov) idsOf(ov).forEach((x) => out.push(x));
          });
        }
        a = byId[a.parent_id];
      }
      if (m && m.est_groupe) descendants(id).forEach((d) => out.push(d));
      return out;
    }
    function reach(id) {
      const seen = new Set();
      const stack = [id];
      while (stack.length) {
        const cur = stack.pop();
        depsOf(cur).forEach((d) => {
          if (!seen.has(d)) { seen.add(d); stack.push(d); }
        });
      }
      return seen;
    }
    return { byId, ancestors, descendants, reach };
  }

  /** Candidats prérequis : jamais soi-même, ses parents / enfants, ni un élément qui dépendrait de soi. */
  function prereqCandidates(self, modules) {
    const g = buildGraph(modules);
    const banned = new Set([self.id].concat(g.ancestors(self.id), g.descendants(self.id)));
    return modules.filter((m) => !banned.has(m.id) && !g.reach(m.id).has(self.id)).map((m) => ({
      id: m.id,
      label: m.titre,
      sub: (m.est_groupe ? 'Chapitre' : 'Leçon')
        + (m.parent_id && g.byId[m.parent_id] ? ' · ' + g.byId[m.parent_id].titre : ''),
    }));
  }

  /**
   * Panneau « Déblocage » d’une leçon ou d’un chapitre — Base + overrides ★1–★5.
   * @param {HTMLElement} host
   * @param {{ module: object, modules: Array, parcoursId: string, onSaved?: Function, noHead?: boolean }} o
   */
  async function mountModule(host, o) {
    const m = o.module;
    const kind = m.est_groupe ? 'chapitre' : 'lecon';
    let jeux = [];
    try { jeux = await loadJeux(o.parcoursId); } catch (_) { /* éditeur sans jeux */ }
    if (!host.isConnected) return;

    function normalizeIds(src) {
      if (!src) return [];
      if (Array.isArray(src.prerequis_module_ids) && src.prerequis_module_ids.length) {
        return src.prerequis_module_ids.filter(Boolean);
      }
      if (src.prerequis_module_id) return [src.prerequis_module_id];
      return [];
    }

    const raw = m.criteres_json && typeof m.criteres_json === 'object' ? m.criteres_json : {};
    const baseCrit = platOf(raw);
    const overrides = {};
    NIVEAUX.forEach((n) => {
      if (hasNiveauOverride(raw, n)) {
        const ov = raw.niveaux[n];
        const hasIds = Object.prototype.hasOwnProperty.call(ov, 'prerequis_module_ids')
          || Object.prototype.hasOwnProperty.call(ov, 'prerequis_module_id');
        overrides[n] = {
          crit: platOf(ov),
          prereqIds: hasIds ? normalizeIds(ov) : undefined,
        };
      }
    });

    const SUIVANT_PRECEDENT = '__precedent__';
    const SUIVANT_ORIGINE = '__origine__';
    const suivantPrecedentItem = {
      id: SUIVANT_PRECEDENT,
      label: 'Leçon précédente',
      sub: 'Ordre officiel du parcours',
    };
    const suivantOrigineItem = {
      id: SUIVANT_ORIGINE,
      label: 'Leçon qui redirige ici',
      sub: 'Celle dont le bouton pointe vers cette leçon',
    };

    let tab = 'base';
    let basePrereqIds = normalizeIds(m);
    let suivantPrecedent = !!m.module_suivant_precedent;
    let suivantOrigine = !!m.module_suivant_origine;
    let suivantId = (suivantPrecedent || suivantOrigine) ? null : (m.module_suivant_id || null);
    let suivantLibelle = m.module_suivant_libelle ? String(m.module_suivant_libelle) : '';
    const cands = prereqCandidates(m, o.modules);
    const suivantCands = [suivantPrecedentItem, suivantOrigineItem].concat(
      o.modules
        .filter((x) => x.id !== m.id && !x.est_groupe)
        .map((x) => ({
          id: x.id,
          label: x.titre,
          sub: x.parent_id
            ? ((o.modules.find((p) => p.id === x.parent_id) || {}).titre || 'Leçon')
            : 'Leçon',
        }))
    );

    const head = o.noHead
      ? ''
      : '<div class="jp-inspector-head"><strong class="jp-inspector-title">Déblocage</strong><span data-help></span></div>';

    host.innerHTML = head
      + '<div class="jp-unlock-niv-bar">'
      + '<div class="jp-vtabs jp-unlock-vtabs" role="tablist" data-niv-tabs></div>'
      + '<p class="jp-muted jp-field-hint" data-niv-hint></p>'
      + '</div>'
      + '<div data-niv-actions></div>'
      + '<div class="jp-field jp-field-tight"><label>S’ouvre après validation de (toutes)</label><div data-prereq></div>'
      + '<small class="jp-field-hint" data-prereq-hint></small></div>'
      + (kind === 'lecon'
        ? '<div class="jp-field jp-field-tight"><label>Leçon suivante (bouton)</label><div data-suivant></div>'
          + '<small class="jp-field-hint" data-suivant-hint></small></div>'
          + '<div class="jp-field jp-field-tight"><label for="jpSuivantLibelle">Nom affiché sur le bouton (facultatif)</label>'
          + '<input id="jpSuivantLibelle" type="text" maxlength="120" data-suivant-libelle value="'
          + esc(suivantLibelle) + '" placeholder="Ex. Retour · Nom de la leçon d’origine">'
          + '<small class="jp-field-hint">Sinon : titre de la cible, ou « Leçon suivante / précédente ».</small></div>'
        : '')
      + '<div class="jp-field jp-field-tight"><span class="jp-field-label">'
      + (m.est_groupe ? 'Pour valider ce chapitre' : 'Pour valider cette leçon') + '</span><div data-crit></div></div>'
      + '<button type="button" class="jp-btn jp-btn-primary" data-save>Enregistrer le déblocage</button>';

    if (!o.noHead) {
      host.querySelector('[data-help]')?.appendChild(global.JpModal.helpButton('Déblocage', [
        'Base = critères communs à tous les niveaux ★ sans personnalisation.',
        '★N = override optionnel (prérequis, lecture, jeux, ET/OU) pour les joueurs inscrits en ★N.',
        'Plusieurs prérequis = la leçon s’ouvre seulement quand TOUTES sont validées.',
        '« Leçon suivante » : leçon précise, précédente (ordre), ou celle qui redirige ici.',
        'Vous pouvez donner un nom personnalisé au bouton.',
        'Sans override ★N, le joueur hérite de la base. Un prérequis hors plage ★ est ignoré.',
      ]));
    }

    host.querySelector('[data-suivant-libelle]')?.addEventListener('input', (e) => {
      suivantLibelle = e.target.value || '';
    });

    const hintEl = host.querySelector('[data-niv-hint]');
    const actionsEl = host.querySelector('[data-niv-actions]');
    const prereqHost = host.querySelector('[data-prereq]');
    const hintPrereq = host.querySelector('[data-prereq-hint]');
    const suivantHost = host.querySelector('[data-suivant]');
    const hintSuivant = host.querySelector('[data-suivant-hint]');
    let prereqChips = null;
    let suivantCombo = null;
    let ed = null;
    let suppress = false;

    function currentPrereqIds() {
      if (tab === 'base') return basePrereqIds.slice();
      const ov = overrides[tab];
      if (ov && ov.prereqIds !== undefined) return (ov.prereqIds || []).slice();
      return basePrereqIds.slice();
    }

    function currentCrit() {
      if (tab === 'base') return baseCrit;
      const ov = overrides[tab];
      return ov ? ov.crit : baseCrit;
    }

    function paintTabs() {
      const tabs = host.querySelector('[data-niv-tabs]');
      const items = [['base', 'Base']].concat(NIVEAUX.map((n) => [n, '★' + n]));
      tabs.innerHTML = items.map(([id, lab]) => {
        const on = tab === id ? ' is-active' : '';
        const custom = id !== 'base' && overrides[id] ? ' is-published' : '';
        const badge = id !== 'base' && overrides[id]
          ? '<span class="jp-vtab-dot" title="Personnalisé pour ce niveau" aria-hidden="true"></span>'
          : '';
        return '<button type="button" class="jp-vtab' + on + custom + '" data-niv="' + id + '" role="tab">'
          + '<span class="jp-vtab-label">' + lab + '</span>' + badge + '</button>';
      }).join('');
      tabs.querySelectorAll('[data-niv]').forEach((b) => {
        b.addEventListener('click', () => {
          if (tab === b.getAttribute('data-niv')) return;
          commitTab();
          tab = b.getAttribute('data-niv');
          paintAll();
        });
      });
    }

    function paintHint() {
      if (tab === 'base') {
        hintEl.textContent = 'Base = appliquée à tous les ★ sans personnalisation.';
      } else if (overrides[tab]) {
        hintEl.textContent = '★' + tab + ' personnalisé — les joueurs ★' + tab + ' utilisent ces critères.';
      } else {
        hintEl.textContent = '★' + tab + ' hérite de la base. Cliquez « Personnaliser » pour un déblocage distinct.';
      }
    }

    function paintActions() {
      if (tab === 'base') {
        actionsEl.innerHTML = '';
        return;
      }
      if (overrides[tab]) {
        actionsEl.innerHTML = '<button type="button" class="jp-btn jp-btn-ghost jp-btn-sm" data-reset-niv>'
          + 'Réinitialiser (hériter de la base)</button>';
        actionsEl.querySelector('[data-reset-niv]').addEventListener('click', () => {
          delete overrides[tab];
          paintAll();
        });
      } else {
        actionsEl.innerHTML = '<button type="button" class="jp-btn jp-btn-ghost jp-btn-sm" data-custom-niv>'
          + 'Personnaliser ★' + tab + '</button>';
        actionsEl.querySelector('[data-custom-niv]').addEventListener('click', () => {
          overrides[tab] = {
            crit: JSON.parse(JSON.stringify(baseCrit)),
            prereqIds: undefined,
          };
          paintAll();
        });
      }
    }

    function paintPrereqHint() {
      const ids = currentPrereqIds();
      const inherit = tab !== 'base' && (!overrides[tab] || overrides[tab].prereqIds === undefined);
      let t = !ids.length
        ? 'Aucun : ouvert dès le début.'
        : (ids.length === 1
          ? '1 prérequis à valider.'
          : ids.length + ' prérequis — tous doivent être validés (ET).');
      const unpublished = ids
        .map((id) => o.modules.find((x) => x.id === id))
        .filter((p) => p && !p.publie);
      if (unpublished.length) {
        t = 'Prérequis non publié(s) ignoré(s) pour les joueurs : '
          + unpublished.map((p) => p.titre).join(', ') + '.';
      }
      if (inherit && tab !== 'base') t = (t ? t + ' ' : '') + '(hérité de la base)';
      hintPrereq.textContent = t;
    }

    function itemsFromIds(ids) {
      return (ids || []).map((id) => {
        const cur = o.modules.find((x) => x.id === id);
        return cur
          ? { id: cur.id, label: cur.titre, sub: cur.est_groupe ? 'Chapitre' : 'Leçon' }
          : { id, label: 'Élément retiré', sub: '' };
      });
    }

    function mountPrereq() {
      const ids = currentPrereqIds();
      const initial = itemsFromIds(ids);
      const disabled = tab !== 'base' && !overrides[tab];
      prereqHost.innerHTML = '';
      prereqChips = null;
      if (disabled) {
        prereqHost.innerHTML = '<p class="jp-muted jp-crit-none" style="margin:0">'
          + (initial.length
            ? initial.map((it) => esc(it.label)).join(' · ')
            : 'Aucun (ouvert d’emblée)') + '</p>';
        paintPrereqHint();
        return;
      }
      prereqChips = global.JpTypeahead.chips(prereqHost, {
        search: global.JpTypeahead.localSource(cands, { limit: 12 }),
        placeholder: 'Ajouter une leçon / un chapitre…',
        ariaLabel: 'Prérequis (plusieurs possibles)',
        initial,
        onChange: (items) => {
          const next = (items || []).map((it) => it.id);
          if (tab === 'base') basePrereqIds = next;
          else if (overrides[tab]) overrides[tab].prereqIds = next;
          paintPrereqHint();
        },
      });
      paintPrereqHint();
    }

    function paintSuivantHint() {
      if (!hintSuivant) return;
      if (suivantOrigine) {
        hintSuivant.textContent = 'Le bouton renvoie à la leçon dont le « suivante » pointe vers celle-ci.';
        return;
      }
      if (suivantPrecedent) {
        hintSuivant.textContent = 'Le bouton renvoie à la leçon précédente dans l’ordre du parcours.';
        return;
      }
      if (!suivantId) {
        hintSuivant.textContent = 'Par défaut : leçon suivante dans l’ordre du parcours.';
        return;
      }
      const s = o.modules.find((x) => x.id === suivantId);
      hintSuivant.textContent = s
        ? 'Lien personnalisé vers « ' + s.titre + ' ».'
        : 'Cible introuvable — choisissez une autre leçon.';
    }

    function mountSuivant() {
      if (!suivantHost) return;
      let initial = null;
      if (suivantOrigine) {
        initial = suivantOrigineItem;
      } else if (suivantPrecedent) {
        initial = suivantPrecedentItem;
      } else if (suivantId) {
        const current = o.modules.find((x) => x.id === suivantId);
        initial = current
          ? { id: current.id, label: current.titre, sub: 'Leçon' }
          : null;
      }
      suivantHost.innerHTML = '';
      suivantCombo = global.JpTypeahead.combo(suivantHost, {
        search: global.JpTypeahead.localSource(suivantCands, { limit: 12 }),
        placeholder: 'Ordre officiel — « précédente », « redirige », ou une leçon…',
        ariaLabel: 'Leçon suivante personnalisée',
        initial,
        onChange: (it) => {
          if (it && it.id === SUIVANT_ORIGINE) {
            suivantOrigine = true;
            suivantPrecedent = false;
            suivantId = null;
          } else if (it && it.id === SUIVANT_PRECEDENT) {
            suivantPrecedent = true;
            suivantOrigine = false;
            suivantId = null;
          } else {
            suivantPrecedent = false;
            suivantOrigine = false;
            suivantId = it ? it.id : null;
          }
          paintSuivantHint();
        },
      });
      paintSuivantHint();
    }

    function mountCrit() {
      const disabled = tab !== 'base' && !overrides[tab];
      const critHost = host.querySelector('[data-crit]');
      if (disabled) {
        critHost.innerHTML = '<p class="jp-muted jp-field-hint" style="margin:0">Hérite des critères de la base.</p>';
        ed = null;
        return;
      }
      ed = criteresEditor(critHost, {
        criteres: currentCrit(),
        jeux,
        kind,
        modules: o.modules,
        selfId: m.id,
        onChange: () => {
          if (suppress) return;
          commitTab();
        },
      });
    }

    function commitTab() {
      if (!ed) return;
      const got = ed.get();
      if (tab === 'base') {
        Object.assign(baseCrit, got);
      } else if (overrides[tab]) {
        overrides[tab].crit = got;
      }
    }

    function paintAll() {
      suppress = true;
      paintTabs();
      paintHint();
      paintActions();
      mountPrereq();
      mountSuivant();
      mountCrit();
      suppress = false;
    }

    function buildPayload() {
      commitTab();
      const out = {
        lecture: kind === 'lecon' ? baseCrit.lecture !== false : undefined,
        jeux: baseCrit.jeux || [],
        lecons_lecture_ids: baseCrit.lecons_lecture_ids || [],
        logique: baseCrit.logique === 'ou' ? 'ou' : 'et',
      };
      if (kind !== 'lecon') delete out.lecture;
      const niveaux = {};
      NIVEAUX.forEach((n) => {
        const ov = overrides[n];
        if (!ov) return;
        const entry = {
          lecture: kind === 'lecon' ? ov.crit.lecture !== false : undefined,
          jeux: ov.crit.jeux || [],
          lecons_lecture_ids: ov.crit.lecons_lecture_ids || [],
          logique: ov.crit.logique === 'ou' ? 'ou' : 'et',
        };
        if (kind !== 'lecon') delete entry.lecture;
        if (ov.prereqIds !== undefined) {
          entry.prerequis_module_ids = ov.prereqIds || [];
          entry.prerequis_module_id = (ov.prereqIds && ov.prereqIds[0]) || null;
        }
        niveaux[n] = entry;
      });
      if (Object.keys(niveaux).length) out.niveaux = niveaux;
      return out;
    }

    paintAll();

    host.querySelector('[data-save]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const criteres_json = buildPayload();
        const payload = {
          id: m.id,
          prerequis_module_ids: basePrereqIds,
          criteres_json,
        };
        if (kind === 'lecon') {
          payload.module_suivant_precedent = suivantPrecedent;
          payload.module_suivant_origine = suivantOrigine;
          payload.module_suivant_id = (suivantPrecedent || suivantOrigine) ? null : suivantId;
          payload.module_suivant_libelle = String(
            host.querySelector('[data-suivant-libelle]')?.value || suivantLibelle || ''
          ).trim() || null;
          suivantLibelle = payload.module_suivant_libelle || '';
        }
        await rpc('v2_upsert_module', { p_payload: payload });
        m.prerequis_module_ids = basePrereqIds.slice();
        m.prerequis_module_id = basePrereqIds[0] || null;
        if (kind === 'lecon') {
          m.module_suivant_precedent = suivantPrecedent;
          m.module_suivant_origine = suivantOrigine;
          m.module_suivant_id = (suivantPrecedent || suivantOrigine) ? null : suivantId;
          m.module_suivant_libelle = payload.module_suivant_libelle;
        }
        m.criteres_json = criteres_json;
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
      + '<div class="jp-field"><label for="parcLibelle">Nom du parcours</label>'
      + '<input id="parcLibelle" type="text" maxlength="200" value="' + esc(p.libelle || '') + '" required></div>'
      + '<div class="jp-field"><label for="parcDesc">Description (facultatif)</label>'
      + '<textarea id="parcDesc" rows="3" maxlength="2000">' + esc(p.description || '') + '</textarea></div>'
      + '<hr class="jp-sheet-sep" aria-hidden="true">'
      + '<p class="jp-muted" style="margin-top:0">Conditions pour valider ce parcours et pour l’ouvrir.</p>'
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
    const ed = criteresEditor(overlay.querySelector('[data-crit]'), {
      criteres: p.criteres_json || {},
      jeux,
      kind: 'parcours',
    });

    overlay.querySelector('[data-save]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const libelle = String(overlay.querySelector('#parcLibelle')?.value || '').trim();
      const description = String(overlay.querySelector('#parcDesc')?.value || '');
      if (!libelle) {
        global.JpToast?.warn?.('Indiquez un nom de parcours');
        overlay.querySelector('#parcLibelle')?.focus();
        return;
      }
      btn.disabled = true;
      try {
        const row = await rpc('v2_maj_parcours_criteres', {
          p_parcours_id: p.id,
          p_prerequis_id: prereqId,
          p_criteres: ed.get(),
          p_libelle: libelle,
          p_description: description,
        });
        p.prerequis_parcours_id = prereqId;
        p.criteres_json = ed.get();
        p.libelle = row?.libelle || libelle;
        p.description = row?.description != null ? row.description : description;
        global.JpToast?.ok?.('Réglages enregistrés');
        close();
        if (o.onSaved) await o.onSaved(p);
      } catch (err) {
        btn.disabled = false;
        global.JpToast?.fromError?.(err);
      }
    });
  }

  global.JpStudioDeblocage = { mountModule, openParcours, criteresEditor };
})(window);
