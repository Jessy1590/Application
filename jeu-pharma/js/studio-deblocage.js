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
    return {
      lecture: c.lecture,
      jeux: Array.isArray(c.jeux) ? c.jeux.map((j) => ({
        modele_id: j.modele_id,
        score_min_pct: j.score_min_pct,
      })) : [],
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
   * @param {{ criteres: object, jeux: Array, kind: 'lecon'|'chapitre'|'parcours', onChange?: Function }} o
   * @returns {{ get: () => object, summary: () => string, count: () => number, set: (c: object) => void }}
   */
  function criteresEditor(host, o) {
    const kind = o.kind;
    const jeuxById = {};
    (o.jeux || []).forEach((j) => { jeuxById[j.id] = j; });
    const st = {
      lecture: null,
      jeux: [],
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
      st.logique = c.logique === 'ou' ? 'ou' : 'et';
      st.progMin = kind === 'parcours'
        ? (c.progression_min_pct != null ? Number(c.progression_min_pct) : 100)
        : null;
    }
    loadFrom(o.criteres || {});

    const count = () => (st.lecture ? 1 : 0) + st.jeux.length;

    function get() {
      const out = {};
      if (kind === 'lecon') out.lecture = !!st.lecture;
      out.jeux = st.jeux.map((j) => ({
        modele_id: j.modele_id,
        score_min_pct: Math.round(clamp(Number(j.min10) || 0, 0, 10) * 10),
      }));
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
    function depsOf(id) {
      const m = byId[id];
      const out = [];
      let a = m;
      while (a) {
        if (a.prerequis_module_id) out.push(a.prerequis_module_id);
        const nivs = a.criteres_json && a.criteres_json.niveaux;
        if (nivs && typeof nivs === 'object') {
          NIVEAUX.forEach((k) => {
            const ov = nivs[k];
            if (ov && ov.prerequis_module_id) out.push(ov.prerequis_module_id);
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

    const raw = m.criteres_json && typeof m.criteres_json === 'object' ? m.criteres_json : {};
    const baseCrit = platOf(raw);
    const overrides = {};
    NIVEAUX.forEach((n) => {
      if (hasNiveauOverride(raw, n)) {
        const ov = raw.niveaux[n];
        overrides[n] = {
          crit: platOf(ov),
          prereqId: Object.prototype.hasOwnProperty.call(ov, 'prerequis_module_id')
            ? (ov.prerequis_module_id || null)
            : undefined,
        };
      }
    });

    let tab = 'base';
    let basePrereqId = m.prerequis_module_id || null;
    const cands = prereqCandidates(m, o.modules);

    const head = o.noHead
      ? ''
      : '<div class="jp-inspector-head"><strong class="jp-inspector-title">Déblocage</strong><span data-help></span></div>';

    host.innerHTML = head
      + '<div class="jp-unlock-niv-bar">'
      + '<div class="jp-vtabs jp-unlock-vtabs" role="tablist" data-niv-tabs></div>'
      + '<p class="jp-muted jp-field-hint" data-niv-hint></p>'
      + '</div>'
      + '<div data-niv-actions></div>'
      + '<div class="jp-field jp-field-tight"><label>S’ouvre après validation de</label><div data-prereq></div>'
      + '<small class="jp-field-hint" data-prereq-hint></small></div>'
      + '<div class="jp-field jp-field-tight"><span class="jp-field-label">'
      + (m.est_groupe ? 'Pour valider ce chapitre' : 'Pour valider cette leçon') + '</span><div data-crit></div></div>'
      + '<button type="button" class="jp-btn jp-btn-primary" data-save>Enregistrer le déblocage</button>';

    if (!o.noHead) {
      host.querySelector('[data-help]')?.appendChild(global.JpModal.helpButton('Déblocage', [
        'Base = critères communs à tous les niveaux ★ sans personnalisation.',
        '★N = override optionnel (prérequis, lecture, jeux, ET/OU) pour les joueurs inscrits en ★N.',
        'Sans override ★N, le joueur hérite de la base. Un prérequis hors plage ★ est ignoré.',
        'Le joueur voit exactement ce qu’il lui reste à faire pour débloquer la suite.',
      ]));
    }

    const hintEl = host.querySelector('[data-niv-hint]');
    const actionsEl = host.querySelector('[data-niv-actions]');
    const prereqHost = host.querySelector('[data-prereq]');
    const hintPrereq = host.querySelector('[data-prereq-hint]');
    let prereqCombo = null;
    let ed = null;
    let suppress = false;

    function currentPrereqId() {
      if (tab === 'base') return basePrereqId;
      const ov = overrides[tab];
      if (ov && ov.prereqId !== undefined) return ov.prereqId;
      return basePrereqId;
    }

    function currentCrit() {
      if (tab === 'base') return baseCrit;
      const ov = overrides[tab];
      return ov ? ov.crit : baseCrit;
    }

    function isCustom() {
      return tab !== 'base' && !!overrides[tab];
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
            prereqId: undefined,
          };
          paintAll();
        });
      }
    }

    function paintPrereqHint() {
      const pid = currentPrereqId();
      const p = pid ? o.modules.find((x) => x.id === pid) : null;
      const inherit = tab !== 'base' && (!overrides[tab] || overrides[tab].prereqId === undefined);
      let t = !pid ? 'Aucun : ouvert dès le début.' : '';
      if (p && !p.publie) t = 'Ce prérequis n’est pas publié : il est ignoré pour les joueurs.';
      if (inherit && tab !== 'base') t = (t ? t + ' ' : '') + '(hérité de la base)';
      hintPrereq.textContent = t;
    }

    function mountPrereq() {
      const pid = currentPrereqId();
      const current = pid ? o.modules.find((x) => x.id === pid) : null;
      const initial = current
        ? { id: current.id, label: current.titre, sub: current.est_groupe ? 'Chapitre' : 'Leçon' }
        : null;
      const disabled = tab !== 'base' && !overrides[tab];
      prereqHost.innerHTML = '';
      if (disabled) {
        prereqHost.innerHTML = '<p class="jp-muted jp-crit-none" style="margin:0">'
          + (initial ? esc(initial.label) : 'Aucun (ouvert d’emblée)') + '</p>';
        paintPrereqHint();
        return;
      }
      prereqCombo = global.JpTypeahead.combo(prereqHost, {
        search: global.JpTypeahead.localSource(cands, { limit: 12 }),
        placeholder: 'Aucun (ouvert d’emblée) — chercher…',
        ariaLabel: 'Prérequis',
        initial,
        onChange: (it) => {
          const id = it ? it.id : null;
          if (tab === 'base') basePrereqId = id;
          else if (overrides[tab]) overrides[tab].prereqId = id;
          paintPrereqHint();
        },
      });
      paintPrereqHint();
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
      mountCrit();
      suppress = false;
    }

    function buildPayload() {
      commitTab();
      const out = {
        lecture: kind === 'lecon' ? baseCrit.lecture !== false : undefined,
        jeux: baseCrit.jeux || [],
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
          logique: ov.crit.logique === 'ou' ? 'ou' : 'et',
        };
        if (kind !== 'lecon') delete entry.lecture;
        if (ov.prereqId !== undefined) {
          entry.prerequis_module_id = ov.prereqId;
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
        await rpc('v2_upsert_module', {
          p_payload: {
            id: m.id,
            prerequis_module_id: basePrereqId,
            criteres_json,
          },
        });
        m.prerequis_module_id = basePrereqId;
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
