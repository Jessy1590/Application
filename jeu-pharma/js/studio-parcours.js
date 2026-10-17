/**
 * Studio parcours — arbre + canvas blocs + programme + jeux (modules dédiés).
 *
 * Modèle brouillon / publié (sans migration) :
 *  - Le contenu publié d’un bloc = `payload_json` (clés sans « _ ») + `titre` : c’est ce que voient les joueurs.
 *  - Toute modification est enregistrée automatiquement (debounce) dans `payload_json._brouillon = { titre, payload }`.
 *  - Un bloc créé reste masqué (`visible = false`) jusqu’à la publication.
 *  - « Publier tout le parcours » : flush + copie les brouillons de **toutes** les leçons du parcours,
 *    sync pubs molécule, passe chaque leçon en `publie = true / statut = 'publie'`.
 *  - Bloc molécule = source unique (matrice_ids + valeurs + variantes ★ additives).
 *    Les publications_connaissances sont dérivées au sync / publication.
 */
(function (global) {
  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }

  const AUTOSAVE_MS = 900;
  const TYPE_LABELS = {
    section: 'Section',
    texte: 'Texte', video: 'Vidéo', photo: 'Photo', molecule: 'Molécules',
    conseil: 'Conseil', recommandation: 'Recommandation', jeu: 'Jeu',
  };
  const TYPE_JEU_LABELS = {
    quiz: 'Quiz',
    trous: 'Tableau à trous',
    fiche_aleatoire: 'Fiche aléatoire',
    ordonnance: 'Ordonnance',
    classement: 'Classement',
    appariement: 'Appariement',
  };
  const ADD_TYPES = ['section', 'texte', 'video', 'photo', 'molecule', 'conseil', 'recommandation', 'jeu'];

  const state = {
    parcoursId: null,
    parcours: null,
    modules: [],
    selectedModuleId: null,
    blocs: [],
    pending: null, // { moduleId, blocId } depuis l'URL
    focusBlocId: null,
    viewMode: 'structure', // structure | contenu
    selectedBlocId: null,
    inspectorTab: 'lecon', // lecon | bloc | programme
    variantTab: 'base', // base | 1..5
    /** ★N sans variante : aperçu base surligné (non enregistré). Jamais écrit dans scratch.base. */
    variantInherit: false,
    variantScratch: {}, // blocId -> { field, base, tabs }
    editors: {}, // blocId:field[:vN] -> richtext instance
    molChips: {}, // blocId -> instance chips
    recoCombos: {}, // rowId -> typeahead cible (bloc recommandation)
    recoTargetCache: null, // { parcours, lecons, chapitres } multi-parcours
    molLabels: {}, // matriceId -> { label, sub }
    timers: {}, // blocId -> timeout autosave
    chain: {}, // blocId -> promesse de sauvegarde (sérialisée)
    inflight: 0,
    saveError: false,
    lastSavedAt: null,
    blocsCache: {}, // moduleId -> blocs[]
    progCountCache: {}, // moduleId -> { connaissances, molecules }
    lastSavedHash: {}, // blocId -> JSON.stringify(payload_json) dernier RPC OK
  };

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function loadParcoursList() {
    const { data, error } = await sb()
      .from('parcours_apprentissage')
      .select('id, code, libelle, description, mode_contenu, ordre, actif, prerequis_parcours_id, criteres_json')
      .eq('actif', true)
      .order('ordre');
    if (error) throw error;
    return data || [];
  }

  async function loadModules(parcoursId) {
    const { data, error } = await sb()
      .from('modules_cours')
      .select('id, parcours_id, parent_id, code, titre, resume, objectifs, ordre, publie, est_groupe, prerequis_module_id, criteres_json, icone, couleur_accent, couverture_url, statut, niveau_min, niveau_max')
      .eq('parcours_id', parcoursId)
      .order('ordre');
    if (error) throw error;
    return data || [];
  }

  function plageOpts(selected) {
    let html = '';
    for (let i = 1; i <= 5; i += 1) {
      html += '<option value="' + i + '"' + (Number(selected) === i ? ' selected' : '') + '>★' + i + '</option>';
    }
    return html;
  }

  /** Contrôle De ★N / À ★M + raccourcis. */
  function plageControlsHtml(min, max, idPrefix) {
    const a = Number(min) || 1;
    const b = Number(max) || 5;
    return '<div class="jp-plage" data-plage="' + esc(idPrefix) + '">'
      + '<label>De <select data-plage-min>' + plageOpts(a) + '</select></label>'
      + '<label>À <select data-plage-max>' + plageOpts(b) + '</select></label>'
      + '<span class="jp-plage-shortcuts">'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-plage-quick="all">Tous</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-plage-quick="only">Uniquement ★</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-plage-quick="from">À partir de ★</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-plage-quick="until">Jusqu’à ★</button>'
      + '</span></div>';
  }

  function readPlage(host) {
    const minEl = host.querySelector('[data-plage-min]');
    const maxEl = host.querySelector('[data-plage-max]');
    let min = Number(minEl?.value) || 1;
    let max = Number(maxEl?.value) || 5;
    if (min > max) { const t = min; min = max; max = t; }
    return { niveau_min: min, niveau_max: max };
  }

  function bindPlage(host, onChange) {
    if (!host) return;
    const applyQuick = (mode) => {
      const minEl = host.querySelector('[data-plage-min]');
      const maxEl = host.querySelector('[data-plage-max]');
      const cur = Number(minEl.value) || 1;
      if (mode === 'all') { minEl.value = '1'; maxEl.value = '5'; }
      else if (mode === 'only') { maxEl.value = String(cur); }
      else if (mode === 'from') { maxEl.value = '5'; }
      else if (mode === 'until') { minEl.value = '1'; maxEl.value = String(cur); }
      onChange(readPlage(host));
    };
    host.querySelectorAll('[data-plage-min], [data-plage-max]').forEach((el) => {
      el.addEventListener('change', () => onChange(readPlage(host)));
    });
    host.querySelectorAll('[data-plage-quick]').forEach((btn) => {
      btn.addEventListener('click', () => applyQuick(btn.getAttribute('data-plage-quick')));
    });
  }

  function plageBadge(min, max) {
    const a = Number(min) || 1;
    const b = Number(max) || 5;
    if (a === 1 && b === 5) return '<span class="jp-plage-badge is-all" title="Tous les niveaux">★1–5</span>';
    if (a === b) return '<span class="jp-plage-badge" title="Uniquement ★' + a + '">★' + a + '</span>';
    return '<span class="jp-plage-badge" title="★' + a + ' à ★' + b + '">★' + a + '–' + b + '</span>';
  }

  function visibleBlocs() {
    return state.blocs;
  }

  function variantFieldOf(type) {
    return type === 'conseil' ? 'corps_html' : 'html';
  }

  function ensureVariantScratch(blocId, type, payload) {
    if (state.variantScratch[blocId]) return state.variantScratch[blocId];
    const field = variantFieldOf(type);
    const v = (payload && payload.variantes) || {};
    const scratch = { field, base: payload?.[field] || '', tabs: {} };
    for (let i = 1; i <= 5; i += 1) {
      scratch.tabs[String(i)] = (v[String(i)] && v[String(i)][field]) || '';
    }
    state.variantScratch[blocId] = scratch;
    return scratch;
  }

  /** HTML « vide » (RTE) : pas de variante → héritage base. */
  function isEmptyHtml(html) {
    const t = String(html || '')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return !t;
  }

  /** Normalise pour comparer base ↔ éditeur (évite de créer une variante fantôme). */
  function normalizeHtml(html) {
    return String(html || '')
      .replace(/\u00a0/g, ' ')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<p>\s*<\/p>/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function htmlLooksSame(a, b) {
    return normalizeHtml(a) === normalizeHtml(b);
  }

  function pubVariantHtml(b, niveau, field) {
    const v = (pubPayload(b).variantes || {})[String(niveau)];
    return (v && v[field]) || '';
  }

  /**
   * Statut d’un onglet ★ : inherit (pas de variante) | draft (brouillon ≠ publié) | published.
   */
  function variantTabStatus(b, scratch, niveau) {
    const n = String(niveau);
    const cur = scratch.tabs[n] || '';
    if (isEmptyHtml(cur)) return 'inherit';
    const pub = pubVariantHtml(b, n, scratch.field);
    if (!htmlLooksSame(cur, pub)) return 'draft';
    return 'published';
  }

  function flushVariantEditor(blocId) {
    const scratch = state.variantScratch[blocId];
    if (!scratch) return;
    const key = blocId + ':' + scratch.field;
    const ed = state.editors[key];
    if (!ed) return;
    const html = ed.getHtml?.() || '';
    // Base : seule source d’écriture de scratch.base (les onglets ★ ne la touchent jamais)
    if (state.variantTab === 'base') {
      scratch.base = html;
      return;
    }
    const tab = String(state.variantTab);
    // Héritage surligné : ne pas créer de variante tant que le HTML = base (ou éditeur encore en inherit)
    if (state.variantInherit || (ed.isInherit && ed.isInherit())) {
      scratch.tabs[tab] = '';
      return;
    }
    if (htmlLooksSame(html, scratch.base) || isEmptyHtml(html)) {
      scratch.tabs[tab] = '';
      return;
    }
    scratch.tabs[tab] = html;
  }

  function molVariantTabStatus(b, niveau) {
    const n = String(niveau);
    const pub = pubPayload(b);
    const draft = (draftOf(b) && draftOf(b).payload) || null;
    const layerPub = molLayerOf(pub, n);
    const layerCur = molLayerOf(effPayload(b), n);
    const empty = !layerCur.matrice_ids.length
      && !Object.keys(layerCur.valeurs || {}).some((k) => (layerCur.valeurs[k] || []).length);
    if (empty) return 'inherit';
    if (JSON.stringify(layerCur) !== JSON.stringify(layerPub)) return 'draft';
    return 'published';
  }

  function variantesTabsHtml(type, blocId) {
    if (type !== 'texte' && type !== 'conseil' && type !== 'molecule') return '';
    const b = state.blocs.find((x) => x.id === blocId);
    const isMol = type === 'molecule';
    const scratch = (!isMol && b) ? ensureVariantScratch(blocId, type, effPayload(b)) : null;
    const tabs = ['base', '1', '2', '3', '4', '5'].map((t) => {
      const label = t === 'base' ? 'Base' : '★' + t;
      const on = String(state.variantTab) === String(t) ? ' is-active' : '';
      let status = '';
      let badge = '';
      if (t !== 'base' && b) {
        status = isMol ? molVariantTabStatus(b, t) : (scratch ? variantTabStatus(b, scratch, t) : '');
        if (status === 'draft') {
          badge = '<span class="jp-vtab-badge" title="Variante en brouillon">brouillon</span>';
        } else if (status === 'published') {
          badge = '<span class="jp-vtab-dot" title="Variante personnalisée" aria-hidden="true"></span>';
        }
      }
      const stCls = status ? ' is-' + status : '';
      return '<button type="button" class="jp-vtab' + on + stCls + '" data-vtab="' + t + '">'
        + '<span class="jp-vtab-label">' + label + '</span>' + badge + '</button>';
    }).join('');
    const hint = isMol
      ? '<p class="jp-muted jp-field-hint">Base = molécules et valeurs communes. '
        + '★N = <strong>ajouts</strong> (union avec la base pour le joueur ★N). '
        + 'Sans variante ★ = hérite uniquement de la base.</p>'
        + '<p class="jp-muted jp-field-hint jp-mol-inherit-hint"'
        + (state.variantTab === 'base' ? ' hidden' : '') + '>'
        + '+ héritage de la base (molécules et valeurs) pour le joueur.</p>'
      : '<p class="jp-muted jp-field-hint">Base = référence commune (modifiable uniquement ici). '
        + '★N sans personnalisation = aperçu <strong>surligné</strong> de la base (non enregistré). '
        + 'Toute modification crée une variante en brouillon. ↶ remet la base surlignée.</p>'
        + '<p class="jp-muted jp-field-hint jp-variant-inherit-hint" hidden>'
        + 'Hérite de la base — surlignage ★ uniquement à l’écran. Modifiez pour créer une variante.</p>';
    return '<div class="jp-variant-bar">'
      + '<div class="jp-vtabs" role="tablist">' + tabs + '</div>'
      + hint
      + '</div>';
  }

  function paintVariantTabs(card, b) {
    if (!card || !b) return;
    const isMol = b.type_bloc === 'molecule';
    const scratch = state.variantScratch[b.id];
    if (!isMol && !scratch) return;
    card.querySelectorAll('.jp-vtab[data-vtab]').forEach((btn) => {
      const t = btn.getAttribute('data-vtab');
      btn.classList.toggle('is-active', String(t) === String(state.variantTab));
      btn.classList.remove('is-inherit', 'is-draft', 'is-published');
      btn.querySelector('.jp-vtab-badge')?.remove();
      btn.querySelector('.jp-vtab-dot')?.remove();
      if (t === 'base') return;
      const status = isMol ? molVariantTabStatus(b, t) : variantTabStatus(b, scratch, t);
      btn.classList.add('is-' + status);
      if (status === 'draft') {
        btn.insertAdjacentHTML('beforeend',
          '<span class="jp-vtab-badge" title="Variante en brouillon">brouillon</span>');
      } else if (status === 'published') {
        btn.insertAdjacentHTML('beforeend',
          '<span class="jp-vtab-dot" title="Variante personnalisée" aria-hidden="true"></span>');
      }
    });
    const hint = card.querySelector('.jp-variant-inherit-hint');
    if (hint) hint.hidden = !state.variantInherit;
    const molHint = card.querySelector('.jp-mol-inherit-hint');
    if (molHint) molHint.hidden = state.variantTab === 'base';
  }

  function invalidateBlocsCache(moduleId) {
    if (moduleId) delete state.blocsCache[moduleId];
    else state.blocsCache = {};
  }

  function rememberBlocsCache(moduleId, blocs) {
    if (moduleId) state.blocsCache[moduleId] = blocs;
  }

  function invalidateProgCount(moduleId) {
    if (moduleId) delete state.progCountCache[moduleId];
    else state.progCountCache = {};
  }

  function hashPayloadJson(pj) {
    return JSON.stringify(pj || {});
  }

  function rememberSavedHashes(blocs) {
    (blocs || []).forEach((b) => {
      if (b?.id) state.lastSavedHash[b.id] = hashPayloadJson(b.payload_json);
    });
  }

  async function loadBlocs(moduleId, opts) {
    const force = !!(opts && opts.force);
    if (!force && Array.isArray(state.blocsCache[moduleId])) {
      return state.blocsCache[moduleId];
    }
    const data = await rpc('v2_lister_blocs', { p_module_id: moduleId });
    const rows = Array.isArray(data) ? data : [];
    state.blocsCache[moduleId] = rows;
    rememberSavedHashes(rows);
    return rows;
  }

  function childrenOf(parentId) {
    return state.modules
      .filter((m) => (m.parent_id || null) === (parentId || null))
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  }

  function selectedModule() {
    return state.modules.find((m) => m.id === state.selectedModuleId) || null;
  }

  const isModuleDraft = (m) => !!m && !m.est_groupe && (m.statut === 'brouillon' || !m.publie);

  function clearEditors() {
    Object.keys(state.variantScratch).forEach((id) => flushVariantEditor(id));
    syncMolChipsToState();
    Object.values(state.editors).forEach((ed) => ed?.destroy?.());
    state.editors = {};
    state.molChips = {};
    state.recoCombos = {};
  }

  function selectBloc(id, opts) {
    const o = opts || {};
    const prevId = state.selectedBlocId;
    const sameMode = state.viewMode === 'contenu' && !o.toContenu;
    const sameBloc = prevId && id && prevId === id;
    if (o.toContenu) state.viewMode = 'contenu';
    if (o.inspectorTab) state.inspectorTab = o.inspectorTab;
    else if (id) state.inspectorTab = 'bloc';
    if (!sameBloc) state.variantTab = 'base';
    state.selectedBlocId = id || null;

    const afterFlush = () => {
      // Contenu déjà affiché : ne pas tout reconstruire (scroll outline + focus RTE).
      if (sameMode && document.querySelector('.jp-contenu-layout')) {
        if (!sameBloc) {
          const outline = document.querySelector('.jp-outline');
          const scrollTop = outline ? outline.scrollTop : 0;
          flushVariantEditor(prevId);
          paintContenuEditorOnly();
          syncOutlineActive();
          if (outline) outline.scrollTop = scrollTop;
          ensureOutlineVisible(id);
        }
      } else {
        paintBlocks();
        ensureOutlineVisible(id);
      }
      const m = selectedModule();
      if (m && !m.est_groupe) void renderInspector(m);
    };

    // Flush molécules avant destruction des chips (sinon retrait → fallback ancienne liste).
    if (!sameBloc && prevId && state.molChips[prevId]) {
      void flushMolChips(prevId).then(afterFlush, afterFlush);
      return;
    }
    afterFlush();
  }

  function syncOutlineActive() {
    const id = state.selectedBlocId;
    document.querySelectorAll('.jp-outline-item').forEach((el) => {
      el.classList.toggle('is-active', el.getAttribute('data-outline') === id);
    });
  }

  function ensureOutlineVisible(id) {
    if (!id) return;
    const btn = document.querySelector('.jp-outline-item[data-outline="' + id + '"]');
    btn?.scrollIntoView({ block: 'nearest' });
  }

  /** Remplace uniquement le panneau d’édition (outline intact). */
  function paintContenuEditorOnly() {
    const layout = document.querySelector('.jp-contenu-layout');
    if (!layout) {
      paintBlocks();
      return;
    }
    const shown = visibleBlocs();
    let b = shown.find((x) => x.id === state.selectedBlocId) || null;
    if (!b) {
      b = shown.find((x) => x.type_bloc !== 'section') || shown[0];
      state.selectedBlocId = b ? b.id : null;
    }
    clearEditors();
    let pane = layout.querySelector('.jp-contenu-editor');
    if (!pane) {
      pane = document.createElement('div');
      pane.className = 'jp-contenu-editor';
      layout.appendChild(pane);
    }
    // Retirer l’ancien article hors du wrapper s’il était en frère direct
    layout.querySelectorAll(':scope > .jp-block-card').forEach((n) => n.remove());
    if (!b) {
      pane.innerHTML = '<p class="jp-muted">Sélectionnez un bloc.</p>';
      return;
    }
    const tag = hasPending(b)
      ? '<span class="jp-bloc-tag" title="Pas encore publié">' + (isHidden(b) ? 'nouveau' : 'brouillon') + '</span>'
      : '';
    pane.innerHTML = '<article class="jp-block-card jp-block-contenu' + (b.type_bloc === 'section' ? ' is-section' : '') + '" data-bloc="' + b.id + '">'
      + '<header>'
      + '<span class="jp-block-type">' + esc(TYPE_LABELS[b.type_bloc] || b.type_bloc) + '</span>'
      + '<input class="jp-block-title" data-field="titre" data-id="' + b.id + '" value="' + esc(effTitre(b)) + '" placeholder="'
      + (b.type_bloc === 'section' ? 'Titre de la section' : 'Titre du bloc (facultatif)') + '" aria-label="Titre">'
      + tag
      + plageBadge(b.niveau_min, b.niveau_max)
      + '<button type="button" class="jp-block-del" data-del="' + b.id + '" title="Supprimer" aria-label="Supprimer">×</button>'
      + '</header>'
      + '<div class="jp-block-body">' + blockBodyHtml(b) + '</div></article>';
    const card = pane.querySelector('.jp-block-card');
    if (card) bindContenuEditors(card, b);
    pane.querySelector('[data-del]')?.addEventListener('click', () => confirmDeleteBloc(b.id));
  }

  /* ——— Bloc recommandation : références (URL ou cible multi-parcours) ——— */

  function recoRefHasContent(ref) {
    if (!ref || typeof ref !== 'object') return false;
    return !!(
      String(ref.label || ref.lien_label || '').trim()
      || String(ref.href || ref.lien_href || '').trim()
      || String(ref.module_id || ref.lien_module_id || '').trim()
      || String(ref.parcours_id || ref.lien_parcours_id || '').trim()
      || String(ref.bloc_id || ref.lien_bloc_id || '').trim()
    );
  }

  function recoNormalizeRef(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const kindRaw = String(r.target_kind || '').trim();
    const kind = (kindRaw === 'parcours' || kindRaw === 'chapitre' || kindRaw === 'lecon' || kindRaw === 'url')
      ? kindRaw
      : '';
    return {
      label: String(r.label ?? r.lien_label ?? '').trim(),
      href: String(r.href ?? r.lien_href ?? '').trim(),
      module_id: String(r.module_id ?? r.lien_module_id ?? '').trim(),
      parcours_id: String(r.parcours_id ?? r.lien_parcours_id ?? '').trim(),
      bloc_id: String(r.bloc_id ?? r.lien_bloc_id ?? '').trim(),
      target_kind: kind,
    };
  }

  /** Lit `references[]` ou migre les champs legacy `lien_*` (un seul item). */
  function recoReferencesList(p) {
    const pay = p && typeof p === 'object' ? p : {};
    if (Array.isArray(pay.references) && pay.references.length) {
      return pay.references.map(recoNormalizeRef);
    }
    const legacy = recoNormalizeRef({
      label: pay.lien_label,
      href: pay.lien_href,
      module_id: pay.lien_module_id,
      parcours_id: pay.lien_parcours_id,
      bloc_id: pay.lien_bloc_id,
      target_kind: pay.target_kind,
    });
    return recoRefHasContent(legacy) ? [legacy] : [];
  }

  /** Mode UI : url | cible (leçon / chapitre / parcours, y compris hors parcours courant). */
  function recoLinkMode(ref) {
    const kind = String(ref.target_kind || '').trim();
    if (kind === 'url') return 'url';
    if (kind === 'lecon' || kind === 'chapitre' || kind === 'parcours') return 'cible';
    if (String(ref.module_id || '').trim() || String(ref.parcours_id || '').trim()) return 'cible';
    return 'url';
  }

  function recoInferTargetKind(ref) {
    const kind = String(ref.target_kind || '').trim();
    if (kind === 'parcours' || kind === 'chapitre' || kind === 'lecon') return kind;
    if (String(ref.module_id || '').trim()) return 'lecon';
    if (String(ref.parcours_id || '').trim()) return 'parcours';
    return 'lecon';
  }

  function recoKindLabel(kind) {
    if (kind === 'parcours') return 'Parcours';
    if (kind === 'chapitre') return 'Chapitre';
    return 'Leçon';
  }

  /** Leçons du parcours courant (déplacer bloc / réorganiser — inchangé). */
  function recoLessonItems() {
    const byId = {};
    state.modules.forEach((m) => { byId[m.id] = m; });
    const parc = state.parcours?.libelle || state.parcours?.code || '';
    return state.modules
      .filter((m) => !m.est_groupe)
      .map((m) => {
        const chap = m.parent_id && byId[m.parent_id] ? byId[m.parent_id].titre : '';
        return {
          id: m.id,
          label: m.titre || m.code || String(m.id).slice(0, 8),
          sub: [chap, parc].filter(Boolean).join(' · '),
          data: { parcours_id: m.parcours_id || state.parcoursId, kind: 'lecon' },
        };
      });
  }

  /** Catalogue multi-parcours pour les cibles recommandation (admin). */
  async function ensureRecoTargetCache() {
    if (state.recoTargetCache) return state.recoTargetCache;
    const parcours = (state.parcoursList && state.parcoursList.length)
      ? state.parcoursList
      : await loadParcoursList();
    if (!state.parcoursList || !state.parcoursList.length) state.parcoursList = parcours;
    const parcIds = parcours.map((p) => p.id).filter(Boolean);
    const parcById = {};
    parcours.forEach((p) => { parcById[p.id] = p; });

    let mods = [];
    if (parcIds.length) {
      const { data, error } = await sb()
        .from('modules_cours')
        .select('id, parcours_id, parent_id, titre, code, est_groupe, ordre')
        .in('parcours_id', parcIds)
        .order('ordre');
      if (error) throw error;
      mods = data || [];
    }
    const modById = {};
    mods.forEach((m) => { modById[m.id] = m; });

    const lecons = [];
    const chapitres = [];
    mods.forEach((m) => {
      const parc = parcById[m.parcours_id];
      const parcLab = parc?.libelle || parc?.code || '';
      const parent = m.parent_id && modById[m.parent_id] ? modById[m.parent_id] : null;
      const item = {
        id: m.id,
        label: m.titre || m.code || String(m.id).slice(0, 8),
        sub: [
          m.est_groupe ? 'Chapitre' : (parent ? parent.titre : 'Leçon'),
          parcLab,
        ].filter(Boolean).join(' · '),
        data: {
          parcours_id: m.parcours_id,
          est_groupe: !!m.est_groupe,
          kind: m.est_groupe ? 'chapitre' : 'lecon',
        },
      };
      if (m.est_groupe) chapitres.push(item);
      else lecons.push(item);
    });

    const parcoursItems = parcours.map((p) => ({
      id: p.id,
      label: p.libelle || p.code || String(p.id).slice(0, 8),
      sub: 'Parcours',
      data: { parcours_id: p.id, kind: 'parcours' },
    }));

    state.recoTargetCache = { parcours: parcoursItems, lecons, chapitres };
    return state.recoTargetCache;
  }

  function renderRecoReferenceRow(blocId, ref, rowId) {
    const mode = recoLinkMode(ref);
    const targetKind = recoInferTargetKind(ref);
    const urlHidden = mode === 'cible' ? ' hidden' : '';
    const cibleHidden = mode === 'url' ? ' hidden' : '';
    const modeLabel = mode === 'url' ? 'Lien d\'accès' : recoKindLabel(targetKind);
    const toggleTitle = mode === 'url'
      ? 'Choisir une cible (leçon, chapitre, parcours)'
      : 'Saisir une URL ou un chemin';
    return '<div class="jp-reco-ref-row" data-reco-row-id="' + esc(rowId) + '" data-reco-mode="' + mode + '">'
      + '<div class="jp-field jp-field-tight jp-reco-label"><label>Libellé</label>'
      + '<input data-field="label" value="' + esc(ref.label || '') + '" placeholder="Ex. Reprendre la section hémostase"></div>'
      + '<div class="jp-field jp-field-tight jp-reco-target">'
      + '<div class="jp-reco-target-head">'
      + '<label class="jp-reco-mode-label">' + esc(modeLabel) + '</label>'
      + '<button type="button" class="jp-reco-mode-toggle" title="' + esc(toggleTitle) + '" aria-label="' + esc(toggleTitle) + '">↑↓</button>'
      + '</div>'
      + '<div class="jp-reco-mode-url"' + urlHidden + '>'
      + '<input data-field="href" value="' + esc(ref.href || '') + '" placeholder="https://… ou lecon.html?module=…"></div>'
      + '<div class="jp-reco-mode-cible"' + cibleHidden + '>'
      + '<div class="jp-reco-kind-row">'
      + '<label class="jp-reco-kind-label">Type</label>'
      + '<select data-field="target_kind" class="jp-reco-kind-select">'
      + '<option value="lecon"' + (targetKind === 'lecon' ? ' selected' : '') + '>Leçon</option>'
      + '<option value="chapitre"' + (targetKind === 'chapitre' ? ' selected' : '') + '>Chapitre</option>'
      + '<option value="parcours"' + (targetKind === 'parcours' ? ' selected' : '') + '>Parcours</option>'
      + '</select></div>'
      + '<div class="jp-reco-mode-lesson" data-reco-lesson="' + esc(rowId) + '"></div>'
      + '</div>'
      + '<input type="hidden" data-field="module_id" value="' + esc(ref.module_id || '') + '">'
      + '<input type="hidden" data-field="parcours_id" value="' + esc(ref.parcours_id || '') + '">'
      + '<input type="hidden" data-field="bloc_id" value="' + esc(ref.bloc_id || '') + '">'
      + '</div>'
      + '<button type="button" class="jp-reco-remove" title="Retirer la référence" aria-label="Retirer la référence">×</button>'
      + '</div>';
  }

  function renderRecoReference(b, p) {
    const id = b.id;
    const refs = recoReferencesList(p);
    const rows = refs.map((ref, i) => renderRecoReferenceRow(id, ref, id + '-r' + i)).join('');
    const openCls = refs.length ? ' is-open' : '';
    return '<div class="jp-reco-ref' + openCls + '" data-reco-wrap="' + id + '">'
      + '<div class="jp-reco-ref-list">' + rows + '</div>'
      + '<button type="button" class="jp-btn jp-btn-ghost jp-reco-add" data-reco-add="' + id + '">Ajouter une référence</button>'
      + '</div>';
  }

  function recoItemsForKind(cache, kind) {
    if (kind === 'parcours') return cache.parcours || [];
    if (kind === 'chapitre') return cache.chapitres || [];
    return cache.lecons || [];
  }

  function recoFindInitial(items, rowEl, kind) {
    const modId = rowEl.querySelector('[data-field="module_id"]')?.value || '';
    const parcId = rowEl.querySelector('[data-field="parcours_id"]')?.value || '';
    if (kind === 'parcours') {
      const id = parcId || modId;
      return id ? items.find((it) => String(it.id) === String(id)) : null;
    }
    return modId ? items.find((it) => String(it.id) === String(modId)) : null;
  }

  async function mountRecoTargetCombo(blocId, rowEl) {
    const rowId = rowEl.getAttribute('data-reco-row-id');
    const host = rowEl.querySelector('[data-reco-lesson]');
    const kindSel = rowEl.querySelector('[data-field="target_kind"]');
    if (!rowId || !host || rowEl.getAttribute('data-reco-mode') !== 'cible') return;
    delete state.recoCombos[rowId];
    host.innerHTML = '<p class="jp-muted jp-field-hint">Chargement…</p>';
    let cache;
    try {
      cache = await ensureRecoTargetCache();
    } catch (e) {
      host.innerHTML = '';
      global.JpToast?.fromError?.(e);
      return;
    }
    let kind = kindSel?.value || 'lecon';
    const modIdEarly = rowEl.querySelector('[data-field="module_id"]')?.value || '';
    // Legacy : module_id qui est un chapitre → basculer le type
    if (kind === 'lecon' && modIdEarly
      && (cache.chapitres || []).some((c) => String(c.id) === String(modIdEarly))) {
      kind = 'chapitre';
      if (kindSel) kindSel.value = 'chapitre';
      const modeLab = rowEl.querySelector('.jp-reco-mode-label');
      if (modeLab) modeLab.textContent = recoKindLabel('chapitre');
    }
    const items = recoItemsForKind(cache, kind);
    const initial = recoFindInitial(items, rowEl, kind);
    host.innerHTML = '';
    const placeholders = {
      lecon: 'Rechercher une leçon (tous parcours)…',
      chapitre: 'Rechercher un chapitre…',
      parcours: 'Rechercher un parcours…',
    };
    state.recoCombos[rowId] = global.JpTypeahead.combo(host, {
      search: global.JpTypeahead.localSource(items, { limit: 15 }),
      minChars: 0,
      placeholder: placeholders[kind] || placeholders.lecon,
      ariaLabel: 'Choisir une cible',
      hint: 'Tapez pour filtrer…',
      initial: initial || null,
      onChange: (it) => {
        const modEl = rowEl.querySelector('[data-field="module_id"]');
        const parEl = rowEl.querySelector('[data-field="parcours_id"]');
        const k = kindSel?.value || 'lecon';
        if (k === 'parcours') {
          if (modEl) modEl.value = '';
          if (parEl) parEl.value = it ? it.id : '';
        } else {
          if (modEl) modEl.value = it ? it.id : '';
          if (parEl) parEl.value = it?.data?.parcours_id || '';
        }
        scheduleSave(blocId);
      },
    });
  }

  function bindRecoReferenceRow(card, blocId, rowEl) {
    // Boutons en classes CSS (pas data-*) — aligner les sélecteurs sur le HTML rendu.
    rowEl.querySelector('.jp-reco-remove')?.addEventListener('click', () => {
      const rowId = rowEl.getAttribute('data-reco-row-id');
      delete state.recoCombos[rowId];
      rowEl.remove();
      const wrap = card.querySelector('[data-reco-wrap]');
      if (wrap && !wrap.querySelector('.jp-reco-ref-row')) wrap.classList.remove('is-open');
      scheduleSave(blocId);
    });
    rowEl.querySelector('.jp-reco-mode-toggle')?.addEventListener('click', () => {
      const cur = rowEl.getAttribute('data-reco-mode') === 'cible' ? 'cible' : 'url';
      const next = cur === 'url' ? 'cible' : 'url';
      rowEl.setAttribute('data-reco-mode', next);
      const urlBox = rowEl.querySelector('.jp-reco-mode-url');
      const cibleBox = rowEl.querySelector('.jp-reco-mode-cible');
      const modeLab = rowEl.querySelector('.jp-reco-mode-label');
      const toggle = rowEl.querySelector('.jp-reco-mode-toggle');
      const kindSel = rowEl.querySelector('[data-field="target_kind"]');
      if (next === 'cible') {
        if (urlBox) urlBox.hidden = true;
        if (cibleBox) cibleBox.hidden = false;
        if (modeLab) modeLab.textContent = recoKindLabel(kindSel?.value || 'lecon');
        if (toggle) {
          toggle.title = 'Saisir une URL ou un chemin';
          toggle.setAttribute('aria-label', 'Saisir une URL ou un chemin');
        }
        const hrefEl = rowEl.querySelector('[data-field="href"]');
        const blocEl = rowEl.querySelector('[data-field="bloc_id"]');
        if (hrefEl) hrefEl.value = '';
        if (blocEl) blocEl.value = '';
        void mountRecoTargetCombo(blocId, rowEl);
      } else {
        if (urlBox) urlBox.hidden = false;
        if (cibleBox) cibleBox.hidden = true;
        if (modeLab) modeLab.textContent = 'Lien d\'accès';
        if (toggle) {
          toggle.title = 'Choisir une cible (leçon, chapitre, parcours)';
          toggle.setAttribute('aria-label', 'Choisir une cible (leçon, chapitre, parcours)');
        }
        const rowId = rowEl.getAttribute('data-reco-row-id');
        delete state.recoCombos[rowId];
        const modEl = rowEl.querySelector('[data-field="module_id"]');
        const parEl = rowEl.querySelector('[data-field="parcours_id"]');
        if (modEl) modEl.value = '';
        if (parEl) parEl.value = '';
        if (kindSel) kindSel.value = 'lecon';
      }
      scheduleSave(blocId);
    });
    rowEl.querySelector('[data-field="target_kind"]')?.addEventListener('change', () => {
      const kind = rowEl.querySelector('[data-field="target_kind"]')?.value || 'lecon';
      const modeLab = rowEl.querySelector('.jp-reco-mode-label');
      if (modeLab && rowEl.getAttribute('data-reco-mode') === 'cible') {
        modeLab.textContent = recoKindLabel(kind);
      }
      const modEl = rowEl.querySelector('[data-field="module_id"]');
      const parEl = rowEl.querySelector('[data-field="parcours_id"]');
      if (modEl) modEl.value = '';
      if (parEl) parEl.value = '';
      void mountRecoTargetCombo(blocId, rowEl);
      scheduleSave(blocId);
    });
    rowEl.querySelectorAll('input[data-field]').forEach((inp) => {
      inp.addEventListener('input', () => scheduleSave(blocId));
    });
    if (rowEl.getAttribute('data-reco-mode') === 'cible') void mountRecoTargetCombo(blocId, rowEl);
  }

  function bindRecoReferenceCard(card, blocId) {
    const wrap = card.querySelector('[data-reco-wrap]');
    if (!wrap) return;
    wrap.querySelectorAll('.jp-reco-ref-row').forEach((rowEl) => bindRecoReferenceRow(card, blocId, rowEl));
    card.querySelector('[data-reco-add]')?.addEventListener('click', () => {
      const list = wrap.querySelector('.jp-reco-ref-list');
      if (!list) return;
      const rowId = blocId + '-r' + Date.now();
      list.insertAdjacentHTML('beforeend', renderRecoReferenceRow(blocId, {}, rowId));
      wrap.classList.add('is-open');
      const rowEl = list.querySelector('[data-reco-row-id="' + rowId + '"]');
      if (rowEl) {
        bindRecoReferenceRow(card, blocId, rowEl);
        rowEl.querySelector('[data-field="label"]')?.focus();
      }
      scheduleSave(blocId);
    });
  }

  function collectRecoReferences(card, blocId) {
    const refs = [];
    card.querySelectorAll('.jp-reco-ref-row[data-reco-row-id]').forEach((rowEl) => {
      const val = (field) => rowEl.querySelector('[data-field="' + field + '"]')?.value || '';
      const mode = rowEl.getAttribute('data-reco-mode') === 'cible' ? 'cible' : 'url';
      const label = val('label').trim();
      let ref;
      if (mode === 'cible') {
        const rowId = rowEl.getAttribute('data-reco-row-id') || '';
        const kind = val('target_kind') || 'lecon';
        const it = state.recoCombos[rowId]?.getItem?.();
        let moduleId = '';
        let parcoursId = '';
        if (kind === 'parcours') {
          parcoursId = val('parcours_id') || state.recoCombos[rowId]?.getId?.() || it?.id || '';
        } else {
          moduleId = val('module_id') || state.recoCombos[rowId]?.getId?.() || '';
          parcoursId = val('parcours_id') || it?.data?.parcours_id || '';
        }
        ref = {
          label,
          target_kind: kind,
          module_id: moduleId,
          parcours_id: parcoursId,
          href: '',
          bloc_id: '',
        };
      } else {
        ref = {
          label,
          target_kind: 'url',
          href: val('href').trim(),
          bloc_id: val('bloc_id').trim(),
          module_id: '',
          parcours_id: '',
        };
      }
      if (recoRefHasContent(ref)) refs.push(ref);
    });
    return refs;
  }

  /* ——— Brouillon / publié (blocs) ——— */

  function pubPayload(b) {
    const out = {};
    const p = b?.payload_json || {};
    Object.keys(p).forEach((k) => { if (k.charAt(0) !== '_') out[k] = p[k]; });
    return out;
  }
  const draftOf = (b) => (b?.payload_json || {})._brouillon || null;
  function effPayload(b) {
    const d = draftOf(b);
    return Object.assign(pubPayload(b), (d && d.payload) || {});
  }
  function effTitre(b) {
    const d = draftOf(b);
    return d && Object.prototype.hasOwnProperty.call(d, 'titre') ? (d.titre || '') : (b?.titre || '');
  }
  const isHidden = (b) => b?.visible === false;
  const hasPending = (b) => !!draftOf(b) || isHidden(b);

  /** Si `matrice_ids` est un tableau (même vide), il prime — ne pas retomber sur `matrice_id` publié. */
  function matriceIdsOf(payload) {
    const p = payload || {};
    if (Array.isArray(p.matrice_ids)) return p.matrice_ids.filter(Boolean);
    return p.matrice_id ? [p.matrice_id] : [];
  }

  function cloneValeursMap(map) {
    const out = {};
    Object.keys(map || {}).forEach((k) => {
      const arr = (map[k] || []).filter(Boolean);
      if (arr.length) out[k] = arr.slice();
    });
    return out;
  }

  function mergeValeursMaps(a, b) {
    const out = cloneValeursMap(a);
    Object.keys(b || {}).forEach((k) => {
      const set = new Set([...(out[k] || []), ...((b[k] || []).filter(Boolean))]);
      if (set.size) out[k] = [...set];
      else delete out[k];
    });
    return out;
  }

  /** Couche Base ou ajouts ★N du payload molécule (sans résolution). */
  function molLayerOf(payload, tab) {
    const p = payload || {};
    if (!tab || tab === 'base') {
      return {
        matrice_ids: matriceIdsOf(p),
        valeurs: cloneValeursMap(p.valeurs),
      };
    }
    const v = (p.variantes || {})[String(tab)] || {};
    return {
      matrice_ids: Array.isArray(v.matrice_ids) ? v.matrice_ids.filter(Boolean) : [],
      valeurs: cloneValeursMap(v.valeurs),
    };
  }

  /** Résolution additive : Base ∪ variante ★N (pas cumul 1…N). */
  function resolveMolPayload(payload, niveau) {
    const base = molLayerOf(payload, 'base');
    const n = Number(niveau);
    if (!n || n < 1) return base;
    const add = molLayerOf(payload, String(n));
    const ids = [];
    const seen = new Set();
    [...base.matrice_ids, ...add.matrice_ids].forEach((id) => {
      if (id && !seen.has(String(id))) {
        seen.add(String(id));
        ids.push(id);
      }
    });
    return { matrice_ids: ids, valeurs: mergeValeursMaps(base.valeurs, add.valeurs) };
  }

  function setMolLayerOnPayload(payload, tab, layer) {
    const base = Object.assign({ mode: 'fiche' }, payload || {});
    delete base._brouillon;
    const matIds = (layer.matrice_ids || []).filter(Boolean);
    const vals = cloneValeursMap(layer.valeurs);
    if (!tab || tab === 'base') {
      base.matrice_ids = matIds;
      base.matrice_id = matIds[0] || '';
      base.valeurs = vals;
      return base;
    }
    const variantes = Object.assign({}, base.variantes || {});
    const empty = !matIds.length && !Object.keys(vals).length;
    if (empty) delete variantes[String(tab)];
    else variantes[String(tab)] = { matrice_ids: matIds, valeurs: vals };
    if (Object.keys(variantes).length) base.variantes = variantes;
    else delete base.variantes;
    return base;
  }

  /**
   * Diff minimal pour `_brouillon.payload` (Object.assign(pub, diff) = effectif).
   * Si une clé publiée disparaît, on stocke le payload complet (assign ne peut pas supprimer).
   */
  function draftPayloadMinimal(pub, payload) {
    const p = pub || {};
    const next = payload || {};
    const pubKeys = Object.keys(p);
    for (let i = 0; i < pubKeys.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(next, pubKeys[i])) return next;
    }
    const diff = {};
    let n = 0;
    Object.keys(next).forEach((k) => {
      if (JSON.stringify(next[k]) !== JSON.stringify(p[k])) {
        diff[k] = next[k];
        n += 1;
      }
    });
    return n ? diff : {};
  }

  function buildDraftPayloadJson(b, titre, payload) {
    const pub = pubPayload(b);
    const same = JSON.stringify(payload) === JSON.stringify(pub) && titre === (b.titre || '');
    const pj = Object.assign({}, pub);
    if (!same || isHidden(b)) {
      pj._brouillon = { titre, payload: draftPayloadMinimal(pub, payload) };
    }
    return pj;
  }

  function writeMolPayload(blocId, payload) {
    const b = state.blocs.find((x) => x.id === blocId);
    if (!b) return;
    b.payload_json = buildDraftPayloadJson(b, effTitre(b), payload);
  }

  /** Écrit les chips molécule dans le brouillon local (couche Base ou ★ courante). */
  function syncMolChipsToState(blocId) {
    const ids = blocId
      ? (state.molChips[blocId] ? [blocId] : [])
      : Object.keys(state.molChips);
    ids.forEach((id) => {
      const chips = state.molChips[id];
      const b = state.blocs.find((x) => x.id === id);
      if (!chips || !b || b.type_bloc !== 'molecule') return;
      const matIds = (chips.getIds?.() || []).filter(Boolean);
      const tab = state.variantTab || 'base';
      const cur = effPayload(b);
      const layer = molLayerOf(cur, tab);
      layer.matrice_ids = matIds;
      // Retirer les valeurs des molécules absentes de cette couche
      const keep = new Set(matIds.map(String));
      Object.keys(layer.valeurs).forEach((k) => {
        if (!keep.has(String(k))) delete layer.valeurs[k];
      });
      writeMolPayload(id, setMolLayerOnPayload(cur, tab, layer));
    });
  }

  function flushMolChips(blocId) {
    syncMolChipsToState(blocId || null);
    if (!blocId) return flushAll();
    if (state.timers[blocId]) {
      clearTimeout(state.timers[blocId]);
      delete state.timers[blocId];
    }
    const b = state.blocs.find((x) => x.id === blocId);
    // Sauvegarder si chips encore montées, timer annulé, ou brouillon local présent.
    if (state.molChips[blocId] || draftOf(b) || b?.type_bloc === 'molecule') {
      return saveDraft(blocId);
    }
    return Promise.resolve();
  }

  /* ——— Statut d’enregistrement (chip en haut) ——— */

  function updateStatus() {
    const chip = document.getElementById('draftChip');
    const btn = document.getElementById('btnPublish');
    const m = selectedModule();
    const lesson = m && !m.est_groupe;
    if (btn) btn.disabled = !state.parcoursId || state.inflight > 0;
    if (!chip) return;
    if (!lesson) { chip.hidden = true; return; }
    chip.hidden = false;
    let cls = 'is-pub';
    let txt = 'Publiée';
    const waiting = Object.keys(state.timers).length > 0;
    if (state.saveError) { cls = 'is-err'; txt = 'Échec de l’enregistrement — réessai à la prochaine modification'; }
    else if (state.inflight > 0 || waiting) { cls = 'is-saving'; txt = 'Enregistrement du brouillon…'; }
    else if (isModuleDraft(m)) {
      cls = 'is-draft';
      txt = 'Brouillon' + (state.lastSavedAt ? ' enregistré à ' + state.lastSavedAt : '') + ' · non publié';
    } else if (state.blocs.some(hasPending)) {
      cls = 'is-draft';
      txt = 'Brouillon' + (state.lastSavedAt ? ' enregistré à ' + state.lastSavedAt : '') + ' · modifications non publiées';
    }
    chip.className = 'jp-draft-chip ' + cls;
    chip.textContent = txt;
  }

  function nowLabel() {
    return new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function videoEmbed(url) {
    if (!url) return '';
    const u = String(url).trim();
    let src = '';
    const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,})/i);
    if (yt) src = 'https://www.youtube.com/embed/' + yt[1];
    const vim = u.match(/vimeo\.com\/(\d+)/i);
    if (vim) src = 'https://player.vimeo.com/video/' + vim[1];
    if (!src && /\.(mp4|webm)(\?|$)/i.test(u)) {
      return '<video controls src="' + esc(u) + '"></video>';
    }
    if (!src) src = u;
    return '<div class="jp-video-wrap"><iframe src="' + esc(src) + '" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin"></iframe></div>';
  }

  async function boot(root) {
    root.innerHTML = '<div class="jp-studio-narrow"><p>Ouvrir sur ordinateur</p></div>'
      + '<div class="jp-studio-app" id="studioApp">'
      + '<header class="jp-studio-top">'
      + '<a class="jp-btn jp-btn-ghost" href="index.html">Admin</a>'
      + '<div id="parcoursCombo" class="jp-studio-parcours-combo"></div>'
      + '<h1 id="studioTitle">Modif parcours</h1>'
      + '<span id="draftChip" class="jp-draft-chip" role="status" aria-live="polite" hidden></span>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnParcoursCfg" title="Prérequis et validation du parcours">Réglages du parcours</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnNewParcours">Nouveau parcours</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnPublish" disabled title="Publie toutes les leçons du parcours">Publier tout le parcours</button>'
      + '</header>'
      + '<div class="jp-studio-body">'
      + '<aside class="jp-studio-pane jp-studio-tree" id="treePane"></aside>'
      + '<section class="jp-studio-pane jp-studio-canvas" id="canvasPane"></section>'
      + '<aside class="jp-studio-pane jp-studio-inspector" id="inspectorPane"></aside>'
      + '</div></div>';

    const list = await loadParcoursList();
    const items = list.map((p) => ({ id: p.id, label: p.libelle, sub: p.code }));
    const qs = new URLSearchParams(location.search);
    const qId = qs.get('parcours');
    // Liens profonds depuis admin/jeux.html : ?parcours=…&module=…&bloc=…
    state.pending = { moduleId: qs.get('module'), blocId: qs.get('bloc') };
    const initial = items.find((i) => i.id === qId) || items[0] || null;

    let current = initial;
    let parcoursItems = items;
    const combo = global.JpTypeahead.combo(root.querySelector('#parcoursCombo'), {
      search: (q) => global.JpTypeahead.localSource(parcoursItems, { limit: 10 })(q),
      placeholder: 'Chercher un parcours…',
      ariaLabel: 'Parcours',
      initial,
      onChange: (it) => {
        if (!it) return;
        current = it;
        void (async () => {
          await flushAll();
          await selectParcours(it.id);
        })();
      },
    });
    state.parcoursCombo = combo;
    state.refreshParcoursCombo = async () => {
      const list = await loadParcoursList();
      state.parcoursList = list;
      parcoursItems = list.map((p) => ({ id: p.id, label: p.libelle, sub: p.code }));
      const cur = parcoursItems.find((i) => i.id === state.parcoursId) || null;
      if (cur) {
        current = cur;
        combo.setItem(cur, true);
      }
      if (state.parcours) {
        const fresh = list.find((p) => p.id === state.parcours.id);
        if (fresh) Object.assign(state.parcours, fresh);
      }
      document.title = (state.parcours?.libelle ? state.parcours.libelle + ' — ' : '') + 'Modif parcours';
      const h1 = document.getElementById('studioTitle');
      if (h1 && state.parcours?.libelle) h1.textContent = state.parcours.libelle;
    };
    combo.input.addEventListener('blur', () => {
      // champ laissé sans choix : on réaffiche le parcours courant
      setTimeout(() => { if (!combo.getItem() && current) combo.setItem(current, true); }, 120);
    });
    root.querySelector('#btnNewParcours').addEventListener('click', () => void createParcours());
    root.querySelector('#btnParcoursCfg').addEventListener('click', () => void openParcoursCfg());
    root.querySelector('#btnPublish').addEventListener('click', () => void publishParcours());

    window.addEventListener('beforeunload', (e) => {
      if (Object.keys(state.timers).length || state.inflight > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    if (initial) await selectParcours(initial.id);
    else root.querySelector('#treePane').innerHTML = '<p class="jp-muted">Aucun parcours</p>';
  }

  async function openParcoursCfg() {
    if (!state.parcours) return global.JpToast?.warn?.('Choisir un parcours');
    await flushAll();
    await global.JpStudioDeblocage.openParcours({
      parcours: state.parcours,
      parcoursList: state.parcoursList || [],
      onSaved: async () => {
        if (typeof state.refreshParcoursCombo === 'function') await state.refreshParcoursCombo();
        else state.parcoursList = await loadParcoursList();
      },
    });
  }

  /** Section repliable de l’inspecteur (gagne de la place à droite). */
  function inspFold(title, bodyHtml, opts) {
    const open = opts && opts.open === false ? '' : ' open';
    const cls = 'jp-insp-fold jp-inspector-cta'
      + (opts && opts.cls ? ' ' + opts.cls : '');
    const idAttr = opts && opts.bodyId ? ' id="' + opts.bodyId + '"' : '';
    return '<details class="' + cls + '"' + open + '>'
      + '<summary class="jp-insp-fold-sum"><strong class="jp-inspector-title">' + title + '</strong></summary>'
      + '<div class="jp-insp-fold-body"' + idAttr + '>' + bodyHtml + '</div></details>';
  }

  /** Panneau « Déblocage » (prérequis + critères) dans l’inspecteur ; recharge l’arbre après enregistrement. */
  function mountDeblocage(m) {
    const host = document.getElementById('unlockHost');
    if (!host || !global.JpStudioDeblocage) return;
    void global.JpStudioDeblocage.mountModule(host, {
      module: m,
      modules: state.modules,
      parcoursId: state.parcoursId,
      noHead: true,
      onSaved: async () => {
        state.modules = await loadModules(state.parcoursId);
        const fresh = state.modules.find((x) => x.id === m.id);
        if (fresh) Object.assign(m, fresh);
      },
    });
  }

  async function createParcours() {
    const libelle = await global.JpModal.ask({
      title: 'Nouveau parcours',
      label: 'Nom du parcours',
      placeholder: 'Ex. Cardiovasculaires',
      confirmLabel: 'Créer',
      emptyMessage: 'Indiquez un nom de parcours',
    });
    if (!libelle) return;
    try {
      await flushAll();
      const row = await rpc('v2_creer_parcours', {
        p_payload: { libelle, mode_contenu: 'publications' },
      });
      global.JpToast?.ok?.('Créé');
      location.search = '?parcours=' + encodeURIComponent(row.id);
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  async function selectParcours(id) {
    state.parcoursId = id;
    state.recoTargetCache = null;
    invalidateBlocsCache();
    invalidateProgCount();
    const list = await loadParcoursList();
    state.parcours = list.find((p) => p.id === id) || null;
    state.parcoursList = list;
    document.title = (state.parcours?.libelle ? state.parcours.libelle + ' — ' : '') + 'Modif parcours';
    const h1 = document.getElementById('studioTitle');
    if (h1) h1.textContent = state.parcours?.libelle || 'Modif parcours';
    state.modules = await loadModules(id);
    const pend = state.pending;
    state.pending = null;
    const wanted = pend?.moduleId && state.modules.some((m) => m.id === pend.moduleId) ? pend.moduleId : null;
    state.focusBlocId = wanted ? (pend.blocId || null) : null;
    state.selectedModuleId = wanted || childrenOf(null)[0]?.id || state.modules[0]?.id || null;
    renderTree();
    await selectModule(state.selectedModuleId);
  }

  /** Patch `is-active` sans réécrire l’arbre (navigation leçon). */
  function patchTreeActive(moduleId) {
    const pane = document.getElementById('treePane');
    if (!pane?.querySelector('.jp-tree-item')) {
      renderTree();
      return;
    }
    pane.querySelectorAll('.jp-tree-row.is-active, .jp-tree-item.is-active').forEach((el) => {
      el.classList.remove('is-active');
    });
    const btn = moduleId
      ? pane.querySelector('.jp-tree-item[data-id="' + moduleId + '"]')
      : null;
    if (!btn) {
      renderTree();
      return;
    }
    btn.classList.add('is-active');
    btn.closest('.jp-tree-row')?.classList.add('is-active');
  }

  function renderTree() {
    const pane = document.getElementById('treePane');
    function renderNode(parentId, depth) {
      const sibs = childrenOf(parentId);
      return sibs.map((m, i) => {
        const kids = renderNode(m.id, depth + 1);
        const kind = m.est_groupe ? 'le chapitre' : 'la leçon';
        return '<div>'
          + '<div class="jp-tree-row' + (m.id === state.selectedModuleId ? ' is-active' : '') + '">'
          + '<button type="button" class="jp-tree-item' + (m.est_groupe ? ' is-group' : '')
          + (m.id === state.selectedModuleId ? ' is-active' : '') + '" data-id="' + m.id + '" style="padding-left:' + (0.5 + depth * 0.65) + 'rem">'
          + '<span class="jp-tree-label">' + esc(m.titre) + '</span>'
          + (isModuleDraft(m) ? '<span class="jp-tree-badge" title="Non publiée : invisible pour les joueurs">brouillon</span>' : '')
          + '</button>'
          + '<span class="jp-tree-tools">'
          + '<button type="button" class="jp-tree-tool" data-move-up="' + m.id + '"' + (i === 0 ? ' disabled' : '')
          + ' title="Monter" aria-label="Monter ' + kind + '">↑</button>'
          + '<button type="button" class="jp-tree-tool" data-move-down="' + m.id + '"' + (i === sibs.length - 1 ? ' disabled' : '')
          + ' title="Descendre" aria-label="Descendre ' + kind + '">↓</button>'
          + '<button type="button" class="jp-tree-tool jp-tree-tool-del" data-del-module="' + m.id + '"'
          + ' title="Supprimer" aria-label="Supprimer ' + kind + '">×</button>'
          + '</span>'
          + '</div>'
          + (kids ? '<div class="jp-tree-children">' + kids + '</div>' : '')
          + '</div>';
      }).join('');
    }
    pane.innerHTML = '<div class="jp-tree-actions">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnAddChapitre">+ Chapitre</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnAddLecon">+ Leçon</button>'
      + '</div>'
      + renderNode(null, 0);

    pane.querySelectorAll('[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => void selectModule(btn.getAttribute('data-id')));
    });
    pane.querySelectorAll('[data-move-up]').forEach((btn) => {
      btn.addEventListener('click', () => void moveModule(btn.getAttribute('data-move-up'), -1));
    });
    pane.querySelectorAll('[data-move-down]').forEach((btn) => {
      btn.addEventListener('click', () => void moveModule(btn.getAttribute('data-move-down'), 1));
    });
    pane.querySelectorAll('[data-del-module]').forEach((btn) => {
      btn.addEventListener('click', () => confirmDeleteModule(btn.getAttribute('data-del-module')));
    });
    pane.querySelector('#btnAddChapitre')?.addEventListener('click', () => void addModule({ est_groupe: true }));
    pane.querySelector('#btnAddLecon')?.addEventListener('click', () => void addModule({ est_groupe: false }));
  }

  async function addModule({ est_groupe }) {
    const titre = await global.JpModal.ask({
      title: est_groupe ? 'Nouveau chapitre' : 'Nouvelle leçon',
      label: est_groupe ? 'Titre du chapitre' : 'Titre de la leçon',
      placeholder: est_groupe ? 'Ex. Hypertension' : 'Ex. Diurétiques thiazidiques',
      confirmLabel: 'Ajouter',
      emptyMessage: est_groupe ? 'Indiquez un titre de chapitre' : 'Indiquez un titre de leçon',
    });
    if (!titre) return;
    const parent = selectedModule();
    const parentId = parent?.est_groupe ? parent.id : (parent?.parent_id || null);
    try {
      await flushAll();
      // Une leçon neuve est un brouillon (invisible) jusqu’à « Publier tout le parcours » ; un chapitre n’est qu’un conteneur.
      const draft = !est_groupe;
      const row = await rpc('v2_upsert_module', {
        p_payload: {
          parcours_id: state.parcoursId,
          parent_id: parentId,
          titre,
          est_groupe: !!est_groupe,
          publie: !draft,
          statut: draft ? 'brouillon' : 'publie',
          ordre: (state.modules.reduce((m, x) => Math.max(m, x.ordre || 0), 0) || 0) + 10,
        },
      });
      state.modules = await loadModules(state.parcoursId);
      state.recoTargetCache = null;
      state.selectedModuleId = row.id;
      renderTree();
      await selectModule(row.id);
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  /* ——— Réordonner / supprimer chapitres et leçons ——— */

  let treeBusy = false;
  let blocsBusy = false;
  let dragBlocId = null;

  /** Monte / descend un module parmi ses frères (même parent) ; renumérote tout le niveau (ordre × 10). */
  async function moveModule(id, dir) {
    if (treeBusy) return;
    const m = state.modules.find((x) => x.id === id);
    if (!m) return;
    const sibs = childrenOf(m.parent_id || null);
    const i = sibs.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= sibs.length) return;
    const arr = sibs.slice();
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const items = arr.map((x, k) => ({ id: x.id, ordre: (k + 1) * 10 }));
    treeBusy = true;
    try {
      await rpc('v2_reorder_modules', { p_items: items });
      items.forEach((it) => {
        const mod = state.modules.find((x) => x.id === it.id);
        if (mod) mod.ordre = it.ordre;
      });
      renderTree();
      void global.JpLogs?.action?.('studio_reordonner_module', { module_id: id, sens: dir < 0 ? 'haut' : 'bas' });
    } catch (e) {
      global.JpToast?.fromError?.(e);
      try { state.modules = await loadModules(state.parcoursId); renderTree(); } catch (_) { /* silencieux */ }
    } finally {
      treeBusy = false;
    }
  }

  function subtreeIds(rootId) {
    const out = [];
    const walk = (id) => {
      if (out.indexOf(id) !== -1) return;
      out.push(id);
      state.modules.filter((x) => x.parent_id === id).forEach((x) => walk(x.id));
    };
    walk(rootId);
    return out;
  }

  function confirmDeleteModule(id) {
    const m = state.modules.find((x) => x.id === id);
    if (!m) return;
    const ids = subtreeIds(id);
    const subs = state.modules.filter((x) => ids.indexOf(x.id) !== -1 && x.id !== id);
    const nbLecons = subs.filter((x) => !x.est_groupe).length;
    const lines = [];
    if (m.est_groupe) {
      lines.push('Le chapitre « ' + m.titre + ' » sera supprimé'
        + (subs.length ? ' avec ses ' + subs.length + ' élément(s) (dont ' + nbLecons + ' leçon(s)).' : '.'));
    } else {
      lines.push('La leçon « ' + m.titre + ' » sera supprimée.');
    }
    lines.push('Seront aussi supprimés : blocs, programme (molécules publiées) et progression des joueurs sur ces leçons.');
    lines.push('Les jeux liés perdent ces leçons de leur pool ; un jeu sans aucune leçon restante est archivé (scores conservés).');
    lines.push('Les éléments qui dépendaient de celui-ci reprennent son prérequis. Cette action est définitive.');
    global.JpModal.open({
      title: m.est_groupe ? 'Supprimer ce chapitre ?' : 'Supprimer cette leçon ?',
      body: lines,
      confirmLabel: 'Supprimer',
      onConfirm: async () => { await deleteModule(id); },
    });
  }

  async function deleteModule(id) {
    const m = state.modules.find((x) => x.id === id);
    if (!m || treeBusy) return;
    treeBusy = true;
    try {
      const ids = subtreeIds(id);
      if (ids.indexOf(state.selectedModuleId) !== -1) {
        // Le module affiché disparaît : inutile de sauvegarder ses brouillons de blocs.
        Object.keys(state.timers).forEach((k) => { clearTimeout(state.timers[k]); delete state.timers[k]; });
        await Promise.all(Object.values(state.chain));
      } else {
        await flushAll();
      }
      const res = await rpc('v2_supprimer_module', { p_module_id: id });
      ids.forEach((mid) => {
        invalidateBlocsCache(mid);
        invalidateProgCount(mid);
      });
      const parentId = m.parent_id || null;
      const siblings = childrenOf(parentId).filter((x) => x.id !== id);
      const wasSelected = ids.indexOf(state.selectedModuleId) !== -1;
      state.modules = await loadModules(state.parcoursId);
      if (wasSelected) {
        const next = (parentId && state.modules.some((x) => x.id === parentId) ? parentId : null)
          || siblings.find((x) => state.modules.some((y) => y.id === x.id))?.id
          || childrenOf(null)[0]?.id
          || state.modules[0]?.id
          || null;
        state.selectedModuleId = next;
        renderTree();
        await selectModule(next);
      } else {
        renderTree();
        const cur = selectedModule();
        if (cur) mountDeblocage(cur); // les listes de prérequis ont pu changer
      }
      global.JpToast?.ok?.(m.est_groupe ? 'Chapitre supprimé' : 'Leçon supprimée');
      void global.JpLogs?.action?.('studio_supprimer_module', {
        module_id: id, est_groupe: !!m.est_groupe, modules: res?.modules, blocs: res?.blocs, jeux_archives: res?.jeux_archives,
      });
    } catch (e) {
      global.JpToast?.fromError?.(e);
    } finally {
      treeBusy = false;
    }
  }

  async function selectModule(id) {
    await flushAll();
    const prevId = state.selectedModuleId;
    if (prevId && Array.isArray(state.blocs) && prevId !== id) {
      rememberBlocsCache(prevId, state.blocs);
    }
    state.selectedModuleId = id;
    patchTreeActive(id);
    const m = selectedModule();
    if (!m) {
      clearEditors();
      state.blocs = [];
      document.getElementById('canvasPane').innerHTML = '';
      document.getElementById('inspectorPane').innerHTML = '';
      updateStatus();
      return;
    }
    if (m.est_groupe) {
      state.blocs = [];
      clearEditors();
      document.getElementById('canvasPane').innerHTML = '<h2 class="jp-studio-h2">'
        + esc(m.titre) + '</h2><p class="jp-muted">Chapitre — ajoutez des leçons.</p>';
      renderInspectorMeta(m);
      updateStatus();
      return;
    }
    state.blocs = await loadBlocs(m.id);
    rememberBlocsCache(m.id, state.blocs);
    state.selectedBlocId = state.focusBlocId || null;
    state.variantScratch = {};
    state.variantTab = 'base';
    if (!state.inspectorTab) state.inspectorTab = 'lecon';
    await preloadMolLabels();
    renderCanvas(m);
    await renderInspector(m);
    updateStatus();
  }

  function renderCanvas(m) {
    const pane = document.getElementById('canvasPane');
    const mode = state.viewMode === 'contenu' ? 'contenu' : 'structure';
    pane.innerHTML = '<div class="jp-studio-canvas-head">'
      + '<h2 class="jp-studio-h2">' + esc(m.titre) + '</h2>'
      + '<div class="jp-studio-mode" role="group" aria-label="Mode d’édition">'
      + '<button type="button" class="jp-mode-btn' + (mode === 'structure' ? ' is-active' : '')
      + '" data-view="structure" aria-pressed="' + (mode === 'structure' ? 'true' : 'false') + '">Structure</button>'
      + '<button type="button" class="jp-mode-btn' + (mode === 'contenu' ? ' is-active' : '')
      + '" data-view="contenu" aria-pressed="' + (mode === 'contenu' ? 'true' : 'false') + '">Contenu</button>'
      + '</div>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnVoirPreview"'
      + ' title="Ouvre la surface Preview (IA, validation, impression)">Voir preview</button>'
      + '</div>'
      + '<div class="jp-add-blocks" id="addBlocks"><span class="jp-add-blocks-label">Ajouter</span>'
      + ADD_TYPES.map((t) =>
        '<button type="button" class="jp-btn jp-btn-ghost" data-add="' + t + '">+ ' + TYPE_LABELS[t] + '</button>'
      ).join('')
      + (global.JpStudioIA ? '<button type="button" class="jp-btn jp-btn-ghost jp-btn-ia" id="btnIa" '
        + 'title="Créer des blocs brouillon depuis un texte ou un PDF de cours">IA</button>' : '')
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnReorganiser"'
      + ' title="Déplacer plusieurs blocs vers une autre leçon">Réorganiser…</button>'
      + '</div><p class="jp-studio-autosave-hint">Structure = ordre et plages · Contenu = rédaction d’un bloc. '
      + 'Brouillon auto · publication via « Publier tout le parcours ».</p>'
      + '<div id="blocksList" class="jp-blocks-' + mode + '"></div>';
    pane.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.getAttribute('data-view');
        if (next === state.viewMode) return;
        state.viewMode = next === 'contenu' ? 'contenu' : 'structure';
        syncViewModeToggle();
        paintBlocks();
        const mod = selectedModule();
        if (mod) void renderInspector(mod);
      });
    });
    pane.querySelector('#btnVoirPreview')?.addEventListener('click', () => void openVoirPreview());
    pane.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => void addBloc(btn.getAttribute('data-add')));
    });
    pane.querySelector('#btnIa')?.addEventListener('click', () => openIa());
    pane.querySelector('#btnReorganiser')?.addEventListener('click', () => void openReorganiser());
    syncReorgButton();
    paintBlocks();
  }

  /** Surface Preview complémentaire (pas un mode studio). */
  async function openVoirPreview() {
    const m = selectedModule();
    if (!state.parcoursId) return global.JpToast?.warn?.('Choisir un parcours');
    try {
      await flushAll();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
    let url = 'preview-parcours.html?parcours=' + encodeURIComponent(state.parcoursId);
    if (m && m.id) url += '&module=' + encodeURIComponent(m.id);
    window.location.assign(url);
  }

  /** Hook IA (logique dans IA/studio-blocs.js) : expose seulement l’état nécessaire. */
  function openIa() {
    const m = selectedModule();
    if (!m || m.est_groupe || !global.JpStudioIA) return;
    global.JpStudioIA.open({
      module: m,
      getBlocs: () => state.blocs,
      flush: flushAll,
      rpc,
      refresh: async () => {
        state.blocs = await loadBlocs(m.id, { force: true });
        rememberBlocsCache(m.id, state.blocs);
        await preloadMolLabels();
        paintBlocks();
        updateStatus();
      },
    });
  }

  /* ——— Molécules : libellés (cache) ——— */

  async function describeMatrices(ids) {
    const missing = ids.filter((id) => !state.molLabels[id]);
    if (!missing.length) return;
    const { data, error } = await sb()
      .from('v_medicaments_complet')
      .select('id, dci, noms_commerciaux')
      .in('id', missing);
    if (error) throw error;
    (data || []).forEach((r) => {
      state.molLabels[r.id] = { label: r.dci || r.id.slice(0, 8), sub: global.JpTypeahead.nomsToText(r.noms_commerciaux) };
    });
    missing.forEach((id) => {
      if (!state.molLabels[id]) state.molLabels[id] = { label: id.slice(0, 8), sub: '' };
    });
  }

  async function preloadMolLabels() {
    const ids = [];
    state.blocs.filter((b) => b.type_bloc === 'molecule').forEach((b) => {
      matriceIdsOf(effPayload(b)).forEach((id) => { if (ids.indexOf(id) === -1) ids.push(id); });
    });
    try { await describeMatrices(ids); } catch (_) { /* libellés de repli */ }
  }

  function molItem(id) {
    const l = state.molLabels[id] || { label: String(id).slice(0, 8), sub: '' };
    return { id, label: l.label, sub: l.sub };
  }

  function referentielEditHref(matriceId) {
    return 'referentiel.html?id=' + encodeURIComponent(matriceId);
  }

  /* ——— Réordonner les blocs d’une leçon ——— */

  function syncBlocMoveButtons(list) {
    if (!list) return;
    const cards = [...list.querySelectorAll('.jp-block-card')];
    cards.forEach((card) => {
      const id = card.getAttribute('data-bloc');
      const i = state.blocs.findIndex((b) => b.id === id);
      const up = card.querySelector('[data-bloc-up]');
      const down = card.querySelector('[data-bloc-down]');
      if (up) up.disabled = i <= 0;
      if (down) down.disabled = i < 0 || i >= state.blocs.length - 1;
    });
  }

  async function applyBlocOrder(ids) {
    const m = selectedModule();
    if (!m || blocsBusy) return;
    blocsBusy = true;
    try {
      await rpc('v2_reorder_blocs', { p_module_id: m.id, p_ids: ids });
      const map = new Map(state.blocs.map((b) => [b.id, b]));
      state.blocs = ids.map((id, k) => {
        const b = map.get(id);
        if (b) b.ordre = (k + 1) * 10;
        return b;
      }).filter(Boolean);
      const list = document.getElementById('blocksList');
      if (list) {
        ids.forEach((id) => {
          const card = list.querySelector('[data-bloc="' + id + '"]');
          if (card) list.appendChild(card);
        });
        syncBlocMoveButtons(list);
      }
      void global.JpLogs?.action?.('studio_reordonner_bloc', { module_id: m.id, count: ids.length });
    } catch (e) {
      global.JpToast?.fromError?.(e);
      try {
        state.blocs = await loadBlocs(m.id);
        paintBlocks();
      } catch (_) { /* silencieux */ }
    } finally {
      blocsBusy = false;
    }
  }

  async function moveBloc(id, dir) {
    if (blocsBusy) return;
    const i = state.blocs.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= state.blocs.length) return;
    const ids = state.blocs.map((x) => x.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await applyBlocOrder(ids);
  }

  async function reorderBlocDrop(sourceId, targetId) {
    if (!sourceId || !targetId || sourceId === targetId || blocsBusy) return;
    const ids = state.blocs.map((x) => x.id);
    const from = ids.indexOf(sourceId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, sourceId);
    await applyBlocOrder(ids);
  }

  function bindBlockReorder(list) {
    if (!list) return;
    list.querySelectorAll('[data-bloc-up]').forEach((btn) => {
      btn.addEventListener('click', () => void moveBloc(btn.getAttribute('data-bloc-up'), -1));
    });
    list.querySelectorAll('[data-bloc-down]').forEach((btn) => {
      btn.addEventListener('click', () => void moveBloc(btn.getAttribute('data-bloc-down'), 1));
    });
    list.querySelectorAll('[data-bloc-move]').forEach((btn) => {
      btn.addEventListener('click', () => void openDeplacerBloc(btn.getAttribute('data-bloc-move')));
    });
    list.querySelectorAll('[data-drag-bloc]').forEach((handle) => {
      handle.addEventListener('dragstart', (ev) => {
        const id = handle.getAttribute('data-drag-bloc');
        dragBlocId = id;
        ev.dataTransfer.effectAllowed = 'move';
        try { ev.dataTransfer.setData('text/plain', id); } catch (_) { /* IE legacy */ }
        handle.closest('.jp-block-card')?.classList.add('is-dragging');
      });
      handle.addEventListener('dragend', () => {
        dragBlocId = null;
        list.querySelectorAll('.jp-block-card').forEach((c) => c.classList.remove('is-dragging', 'is-drop-target'));
      });
    });
    list.querySelectorAll('.jp-block-card').forEach((card) => {
      card.addEventListener('dragover', (ev) => {
        if (!dragBlocId) return;
        ev.preventDefault();
        ev.dataTransfer.dropEffect = 'move';
        card.classList.add('is-drop-target');
      });
      card.addEventListener('dragleave', (ev) => {
        if (!card.contains(ev.relatedTarget)) card.classList.remove('is-drop-target');
      });
      card.addEventListener('drop', (ev) => {
        ev.preventDefault();
        card.classList.remove('is-drop-target');
        const targetId = card.getAttribute('data-bloc');
        const sourceId = ev.dataTransfer.getData('text/plain') || dragBlocId;
        void reorderBlocDrop(sourceId, targetId);
      });
    });
  }

  /* ——— Rendu des blocs (Structure / Contenu) ——— */

  /** Nombre de ★ personnalisées (scratch live si présent, sinon payload). */
  function variantCount(b) {
    if (!b) return 0;
    if (b.type_bloc === 'molecule') {
      const v = effPayload(b).variantes || {};
      return Object.keys(v).filter((k) => {
        const layer = molLayerOf({ variantes: { [k]: v[k] } }, k);
        return layer.matrice_ids.length
          || Object.keys(layer.valeurs).some((id) => (layer.valeurs[id] || []).length);
      }).length;
    }
    const scratch = state.variantScratch[b.id];
    if (scratch) {
      let n = 0;
      for (let i = 1; i <= 5; i += 1) {
        if (!isEmptyHtml(scratch.tabs[String(i)])) n += 1;
      }
      return n;
    }
    const p = effPayload(b);
    const v = p.variantes || {};
    return Object.keys(v).filter((k) => {
      const o = v[k];
      return o && (o.html || o.corps_html);
    }).length;
  }

  /** Met à jour le badge +N (outline Contenu / ligne Structure) sans tout redessiner. */
  function paintVariantCountBadge(blocId) {
    const b = state.blocs.find((x) => x.id === blocId);
    if (!b) return;
    const vc = variantCount(b);
    const outlineBtn = document.querySelector('[data-outline="' + blocId + '"]');
    if (outlineBtn) {
      let badge = outlineBtn.querySelector('.jp-outline-var');
      if (vc) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'jp-outline-var';
          badge.title = 'Variantes';
          outlineBtn.appendChild(badge);
        }
        badge.textContent = '+' + vc;
      } else {
        badge?.remove();
      }
    }
    const row = document.querySelector('[data-bloc="' + blocId + '"]');
    if (row) {
      let badge = row.querySelector(':scope > header .jp-outline-var');
      if (vc) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'jp-outline-var';
          const openBtn = row.querySelector('.jp-block-open');
          if (openBtn) openBtn.insertAdjacentElement('beforebegin', badge);
          else row.querySelector('header')?.appendChild(badge);
        }
        badge.textContent = '+' + vc + ' var.';
      } else {
        badge?.remove();
      }
    }
    // Inspecteur « N variante(s) » si ce bloc est sélectionné
    if (state.selectedBlocId === blocId && state.inspectorTab === 'bloc') {
      const meta = document.querySelector('#inspectorBody .jp-inspector-cta > p.jp-muted');
      if (meta) {
        const title = effTitre(b) || 'Sans titre';
        meta.textContent = title + (vc ? ' · ' + vc + ' variante(s)' : '');
      }
    }
  }

  function blockBodyHtml(b) {
    const p = effPayload(b);
    if (b.type_bloc === 'section') {
      return '<p class="jp-muted jp-field-hint">Séparateur de leçon — le titre s’affiche comme sous-partie pour le joueur.</p>';
    }
    if (b.type_bloc === 'texte') {
      ensureVariantScratch(b.id, 'texte', p);
      return variantesTabsHtml('texte', b.id)
        + '<div class="jp-rte-host" data-rte="' + b.id + '" data-field="html"></div>';
    }
    if (b.type_bloc === 'video') {
      return '<div class="jp-field jp-field-tight"><label>Lien de la vidéo</label>'
        + '<input data-field="url" data-id="' + b.id + '" value="' + esc(p.url || '') + '" placeholder="URL YouTube / Vimeo / .mp4"></div>'
        + (p.url ? videoEmbed(p.url) : '');
    }
    if (b.type_bloc === 'photo') {
      return '<input type="hidden" data-field="path" data-id="' + b.id + '" value="' + esc(p.path || '') + '">'
        + '<div class="jp-photo-prev" data-photo-prev="' + b.id + '"></div>'
        + '<div class="jp-photo-actions">'
        + '<label class="jp-btn jp-btn-ghost jp-photo-pick">Téléverser une photo'
        + '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-photo-file="' + b.id + '" hidden></label>'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-photo-clear="' + b.id + '">Retirer la photo</button>'
        + '<small class="jp-field-hint">JPEG, PNG, WebP ou GIF — 5 Mo max.</small></div>'
        + '<div class="jp-field jp-field-tight"><label>… ou lien de l’image (https)</label>'
        + '<input data-field="url" data-id="' + b.id + '" value="' + esc(p.url || '') + '" placeholder="https://…/photo.jpg"></div>'
        + '<div class="jp-field jp-field-tight"><label>Légende (facultatif)</label>'
        + '<input data-field="legende" data-id="' + b.id + '" value="' + esc(p.legende || '') + '" placeholder="Ex. Frottis sanguin"></div>';
    }
    if (b.type_bloc === 'molecule') {
      const tab = state.variantTab || 'base';
      const layer = molLayerOf(p, tab);
      const nVals = Object.values(layer.valeurs || {}).reduce((n, a) => n + (a || []).length, 0);
      return variantesTabsHtml('molecule', b.id)
        + '<div class="jp-field jp-field-tight"><label>'
        + (tab === 'base' ? 'Molécules (base)' : 'Ajouts molécules ★' + tab)
        + '</label>'
        + '<div class="jp-mol-multi" data-mol-multi="' + b.id + '"></div>'
        + '<small class="jp-field-hint">Tapez une DCI ou un nom commercial.'
        + (tab === 'base' ? '' : ' Uniquement les ajouts de cet onglet — la base est héritée.')
        + '</small></div>'
        + '<div class="jp-mol-bloc-actions">'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-mol-prog="' + b.id + '">Valeurs affichées…'
        + (nVals ? ' (' + nVals + ')' : '') + '</button>'
        + '</div>';
    }
    if (b.type_bloc === 'conseil') {
      ensureVariantScratch(b.id, 'conseil', p);
      return '<div class="jp-field jp-field-tight"><label>Pathologie</label>'
        + '<input data-field="pathologie" data-id="' + b.id + '" value="' + esc(p.pathologie || '') + '" placeholder="Ex. Anémie ferriprive"></div>'
        + variantesTabsHtml('conseil', b.id)
        + '<div class="jp-rte-host" data-rte="' + b.id + '" data-field="corps_html"></div>';
    }
    if (b.type_bloc === 'recommandation') {
      return '<div class="jp-rte-host" data-rte="' + b.id + '" data-field="corps_html"></div>'
        + renderRecoReference(b, p);
    }
    if (b.type_bloc === 'jeu') {
      return jeuBlocPanelHtml(b, { showTitle: true });
    }
    return '';
  }

  function blockToolsHtml(b, i, total) {
    const upDis = i === 0 ? ' disabled' : '';
    const downDis = i === total - 1 ? ' disabled' : '';
    return '<span class="jp-block-tools" aria-label="Ordre du bloc">'
      + '<button type="button" class="jp-block-tool jp-block-drag" draggable="true" data-drag-bloc="' + b.id + '"'
      + ' title="Glisser pour réordonner" aria-label="Glisser pour réordonner">⠿</button>'
      + '<button type="button" class="jp-block-tool" data-bloc-up="' + b.id + '"' + upDis
      + ' title="Monter le bloc" aria-label="Monter le bloc">↑</button>'
      + '<button type="button" class="jp-block-tool" data-bloc-down="' + b.id + '"' + downDis
      + ' title="Descendre le bloc" aria-label="Descendre le bloc">↓</button>'
      + '<button type="button" class="jp-block-tool" data-bloc-move="' + b.id + '"'
      + ' title="Déplacer vers une autre leçon" aria-label="Déplacer vers…">↪</button>'
      + '</span>';
  }

  async function openDeplacerBloc(blocId) {
    const b = state.blocs.find((x) => x.id === blocId);
    const m = selectedModule();
    if (!b || !m) return;
    const items = recoLessonItems().filter((it) => String(it.id) !== String(m.id));
    if (!items.length) {
      global.JpToast?.warn?.('Aucune autre leçon dans ce parcours');
      return;
    }
    let picked = null;
    const body = document.createElement('div');
    body.innerHTML = '<p class="jp-muted">Choisir la leçon cible (même parcours).</p>'
      + '<div id="deplacerLessonHost"></div>';
    global.JpTypeahead.combo(body.querySelector('#deplacerLessonHost'), {
      search: global.JpTypeahead.localSource(items, { limit: 15 }),
      minChars: 0,
      placeholder: 'Rechercher une leçon…',
      ariaLabel: 'Leçon cible',
      hint: 'Tapez pour filtrer…',
      onChange: (it) => { picked = it; },
    });
    global.JpModal.open({
      title: 'Déplacer vers…',
      body,
      confirmLabel: 'Déplacer',
      onConfirm: async () => {
        if (!picked?.id) {
          global.JpToast?.warn?.('Choisissez une leçon');
          return false;
        }
        await flushAll();
        await rpc('v2_deplacer_bloc', {
          p_bloc_id: blocId,
          p_module_cible_id: picked.id,
          p_avant_bloc_id: null,
        });
        state.blocs = await loadBlocs(m.id);
        if (state.selectedBlocId === blocId) state.selectedBlocId = null;
        paintBlocks();
        void renderInspector(m);
        global.JpToast?.ok?.('Bloc déplacé vers « ' + (picked.label || '') + ' »');
        void global.JpLogs?.action?.('studio_deplacer_bloc', {
          bloc_id: blocId,
          from: m.id,
          to: picked.id,
        });
      },
    });
  }

  /** Fenêtre bulk : découper une grosse leçon en déplaçant plusieurs blocs. */
  async function openReorganiser() {
    const m = selectedModule();
    if (!m || m.est_groupe) {
      global.JpToast?.warn?.('Ouvrez une leçon pour réorganiser ses blocs');
      return;
    }
    if (!state.blocs.length) {
      global.JpToast?.warn?.('Aucun bloc à déplacer');
      return;
    }

    let picked = null;
    let lessonCombo = null;
    const selected = new Set();

    const body = document.createElement('div');
    body.className = 'jp-reorg';
    body.innerHTML = '<div class="jp-reorg-col">'
      + '<h3>Blocs de cette leçon</h3>'
      + '<div class="jp-reorg-toolbar">'
      + '<label><input type="checkbox" id="reorgSelectAll"> Tout sélectionner</label>'
      + '<span class="jp-reorg-count" id="reorgCount">0 sélectionné(s)</span>'
      + '</div>'
      + '<ul class="jp-reorg-list" id="reorgList"></ul>'
      + '</div>'
      + '<div class="jp-reorg-col">'
      + '<h3>Leçon cible</h3>'
      + '<p class="jp-muted" style="margin:0">Même parcours — les blocs partent à la fin de la leçon cible, dans l’ordre actuel.</p>'
      + '<div id="reorgLessonHost"></div>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="reorgCreateToggle">Créer une leçon…</button>'
      + '<div class="jp-reorg-create" id="reorgCreateRow" hidden>'
      + '<input type="text" id="reorgNewTitle" placeholder="Titre de la nouvelle leçon" maxlength="200" autocomplete="off">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="reorgCreateConfirm">Créer</button>'
      + '</div>'
      + '</div>';

    const listEl = body.querySelector('#reorgList');
    const countEl = body.querySelector('#reorgCount');
    const selectAll = body.querySelector('#reorgSelectAll');
    const createRow = body.querySelector('#reorgCreateRow');
    const newTitle = body.querySelector('#reorgNewTitle');

    function lessonItems() {
      return recoLessonItems().filter((it) => String(it.id) !== String(m.id));
    }

    function mountLessonCombo(initial) {
      const host = body.querySelector('#reorgLessonHost');
      if (!host) return;
      host.innerHTML = '';
      const items = lessonItems();
      lessonCombo = global.JpTypeahead.combo(host, {
        search: global.JpTypeahead.localSource(items, { limit: 15 }),
        minChars: 0,
        placeholder: items.length ? 'Rechercher une leçon…' : 'Aucune autre leçon — créez-en une',
        ariaLabel: 'Leçon cible',
        hint: 'Tapez pour filtrer…',
        initial: initial || null,
        onChange: (it) => { picked = it; },
      });
      if (initial) picked = initial;
    }

    function updateCount() {
      const n = selected.size;
      if (countEl) countEl.textContent = n + ' sélectionné(s)';
      if (selectAll) {
        const boxes = listEl.querySelectorAll('input[data-reorg-id]');
        selectAll.checked = boxes.length > 0 && n === boxes.length;
        selectAll.indeterminate = n > 0 && n < boxes.length;
      }
    }

    function paintReorgList() {
      const blocs = state.blocs;
      if (!blocs.length) {
        listEl.innerHTML = '<li class="jp-reorg-empty">Plus aucun bloc dans cette leçon.</li>';
        selected.clear();
        updateCount();
        return;
      }
      listEl.innerHTML = blocs.map((b, i) => {
        const on = selected.has(b.id) ? ' checked' : '';
        return '<li class="jp-reorg-item">'
          + '<input type="checkbox" data-reorg-id="' + esc(b.id) + '"' + on + '>'
          + '<span class="jp-reorg-ord">' + (i + 1) + '</span>'
          + '<span class="jp-reorg-meta">'
          + '<span class="jp-reorg-type">' + esc(TYPE_LABELS[b.type_bloc] || b.type_bloc) + '</span>'
          + '<span class="jp-reorg-title">' + esc(effTitre(b) || 'Sans titre') + '</span>'
          + '</span></li>';
      }).join('');
      listEl.querySelectorAll('input[data-reorg-id]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const id = cb.getAttribute('data-reorg-id');
          if (cb.checked) selected.add(id);
          else selected.delete(id);
          updateCount();
        });
      });
      listEl.querySelectorAll('.jp-reorg-item').forEach((row) => {
        row.addEventListener('click', (ev) => {
          if (ev.target.tagName === 'INPUT') return;
          const cb = row.querySelector('input[data-reorg-id]');
          if (!cb) return;
          cb.checked = !cb.checked;
          cb.dispatchEvent(new Event('change'));
        });
      });
      updateCount();
    }

    selectAll.addEventListener('change', () => {
      const on = selectAll.checked;
      listEl.querySelectorAll('input[data-reorg-id]').forEach((cb) => {
        cb.checked = on;
        const id = cb.getAttribute('data-reorg-id');
        if (on) selected.add(id);
        else selected.delete(id);
      });
      updateCount();
    });

    body.querySelector('#reorgCreateToggle')?.addEventListener('click', () => {
      createRow.hidden = !createRow.hidden;
      if (!createRow.hidden) {
        newTitle.value = '';
        setTimeout(() => newTitle.focus(), 20);
      }
    });

    body.querySelector('#reorgCreateConfirm')?.addEventListener('click', async () => {
      const titre = String(newTitle.value || '').trim();
      if (!titre) {
        global.JpToast?.warn?.('Indiquez un titre de leçon');
        newTitle.focus();
        return;
      }
      const parent = selectedModule();
      const parentId = parent?.est_groupe ? parent.id : (parent?.parent_id || null);
      try {
        await flushAll();
        const row = await rpc('v2_upsert_module', {
          p_payload: {
            parcours_id: state.parcoursId,
            parent_id: parentId,
            titre,
            est_groupe: false,
            publie: false,
            statut: 'brouillon',
            ordre: (state.modules.reduce((mx, x) => Math.max(mx, x.ordre || 0), 0) || 0) + 10,
          },
        });
        state.modules = await loadModules(state.parcoursId);
        renderTree();
        const items = recoLessonItems();
        const initial = items.find((it) => String(it.id) === String(row.id)) || {
          id: row.id,
          label: titre,
          sub: '',
          data: { parcours_id: state.parcoursId },
        };
        mountLessonCombo(initial);
        createRow.hidden = true;
        global.JpToast?.ok?.('Leçon « ' + titre + ' » créée (brouillon)');
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
    });

    paintReorgList();
    mountLessonCombo(null);

    global.JpModal.open({
      title: 'Réorganiser…',
      body,
      panelClass: 'jp-modal-wide',
      confirmLabel: 'Déplacer la sélection',
      cancelLabel: 'Fermer',
      onConfirm: async () => {
        const ids = state.blocs.map((b) => b.id).filter((id) => selected.has(id));
        if (!ids.length) {
          global.JpToast?.warn?.('Sélectionnez au moins un bloc');
          return false;
        }
        if (!picked?.id) {
          global.JpToast?.warn?.('Choisissez une leçon cible');
          return false;
        }
        if (String(picked.id) === String(m.id)) {
          global.JpToast?.warn?.('Choisissez une autre leçon');
          return false;
        }
        await flushAll();
        await rpc('v2_deplacer_blocs', {
          p_bloc_ids: ids,
          p_module_cible_id: picked.id,
          p_avant_bloc_id: null,
        });
        invalidateBlocsCache(picked.id);
        state.blocs = await loadBlocs(m.id, { force: true });
        rememberBlocsCache(m.id, state.blocs);
        if (state.selectedBlocId && ids.indexOf(state.selectedBlocId) !== -1) {
          state.selectedBlocId = null;
        }
        ids.forEach((id) => selected.delete(id));
        paintBlocks();
        void renderInspector(m);
        paintReorgList();
        mountLessonCombo(picked);
        const n = ids.length;
        global.JpToast?.ok?.(
          n + ' bloc' + (n > 1 ? 's' : '') + ' déplacé' + (n > 1 ? 's' : '')
            + ' vers « ' + (picked.label || '') + ' »'
        );
        void global.JpLogs?.action?.('studio_reorganiser_blocs', {
          from: m.id,
          to: picked.id,
          count: n,
          bloc_ids: ids,
        });
        return false; // garder la fenêtre pour un autre lot
      },
    });
  }

  function resolveVariantDisplay(scratch, tab) {
    if (tab === 'base') {
      return { html: scratch.base || '', inherit: false, inheritLevel: null };
    }
    const raw = scratch.tabs[String(tab)] || '';
    if (isEmptyHtml(raw)) {
      return { html: scratch.base || '', inherit: true, inheritLevel: Number(tab) };
    }
    return { html: raw, inherit: false, inheritLevel: null };
  }

  function mountVariantRte(card, b, host) {
    const id = b.id;
    const field = host.getAttribute('data-field') || variantFieldOf(b.type_bloc);
    const prev = state.editors[id + ':' + field];
    prev?.destroy?.();
    const scratch = ensureVariantScratch(id, b.type_bloc, effPayload(b));
    const disp = resolveVariantDisplay(scratch, state.variantTab);
    state.variantInherit = disp.inherit;

    const isStarTab = state.variantTab !== 'base';
    state.editors[id + ':' + field] = global.JpStudioRichtext.mount(host, disp.html, {
      inheritLevel: disp.inheritLevel,
      onReset: isStarTab
        ? () => {
          scratch.tabs[String(state.variantTab)] = '';
          state.variantInherit = true;
          remountVariantRte(card, b);
          paintVariantTabs(card, b);
          paintVariantCountBadge(id);
          scheduleSave(id);
        }
        : undefined,
      resetTitle: 'Revenir à la base surlignée (efface la variante ★)',
      onChange: () => {
        const ed = state.editors[id + ':' + field];
        // Première frappe quitte l’héritage → variante brouillon
        if (state.variantInherit) state.variantInherit = false;
        flushVariantEditor(id);
        const tab = String(state.variantTab);
        // Plus de variante (vide ou = base) → héritage
        if (tab !== 'base' && isEmptyHtml(scratch.tabs[tab])) {
          if (isEmptyHtml(ed?.getHtml?.())) {
            remountVariantRte(card, b);
            paintVariantCountBadge(id);
            scheduleSave(id);
            return;
          }
          state.variantInherit = true;
          ed?.setInheritLevel?.(Number(tab));
        }
        paintVariantTabs(card, b);
        paintVariantCountBadge(id);
        scheduleSave(id);
      },
    });
    paintVariantTabs(card, b);
    paintVariantCountBadge(id);
  }

  function remountVariantRte(card, b) {
    const host = card.querySelector('[data-rte]');
    if (!host || (b.type_bloc !== 'texte' && b.type_bloc !== 'conseil')) return;
    mountVariantRte(card, b, host);
  }

  function mountMolChips(card, b) {
    const id = b.id;
    const host = card.querySelector('[data-mol-multi]');
    if (!host) return;
    const tab = state.variantTab || 'base';
    const layer = molLayerOf(effPayload(b), tab);
    const initial = layer.matrice_ids.map(molItem);
    state.molChips[id]?.destroy?.();
    state.molChips[id] = global.JpTypeahead.chips(host, {
      search: global.JpTypeahead.matriceSource({ limit: 15 }),
      minChars: 1,
      placeholder: tab === 'base' ? 'Ajouter une molécule…' : 'Ajouter une molécule (★' + tab + ')…',
      ariaLabel: 'Ajouter une molécule',
      initial,
      chipEditHref: referentielEditHref,
      onChange: (items) => {
        items.forEach((it) => { state.molLabels[it.id] = { label: it.label, sub: it.sub || '' }; });
        syncMolChipsToState(id);
        scheduleSave(id);
      },
    });
  }

  /** Onglet ★ molécule : remonte le corps du bloc sans paintBlocks() full. */
  function remountMolContenu(card, b) {
    if (!card || !b || b.type_bloc !== 'molecule') {
      paintContenuEditorOnly();
      return;
    }
    const body = card.querySelector('.jp-block-body');
    if (!body || state.viewMode !== 'contenu') {
      paintContenuEditorOnly();
      return;
    }
    state.molChips[b.id]?.destroy?.();
    delete state.molChips[b.id];
    body.innerHTML = blockBodyHtml(b);
    // Rebind onglets + chips + bouton valeurs (header inchangé)
    card.querySelectorAll('.jp-block-body .jp-vtab[data-vtab]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const next = btn.getAttribute('data-vtab');
        if (String(next) === String(state.variantTab)) return;
        syncMolChipsToState(b.id);
        state.molChips[b.id]?.destroy?.();
        delete state.molChips[b.id];
        void saveDraft(b.id).then(() => {
          state.variantTab = next;
          remountMolContenu(card, b);
        });
      });
    });
    mountMolChips(card, b);
    card.querySelectorAll('[data-mol-prog]').forEach((btn) => {
      btn.addEventListener('click', () => void openBlocValeurs(btn.getAttribute('data-mol-prog')));
    });
    paintVariantTabs(card, b);
    paintVariantCountBadge(b.id);
    updateStatus();
  }

  function bindContenuEditors(card, b) {
    const id = b.id;
    // Uniquement les boutons d’onglet — pas l’hôte RTE (qui ne doit plus avoir data-vtab).
    card.querySelectorAll('.jp-vtab[data-vtab]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const next = btn.getAttribute('data-vtab');
        if (String(next) === String(state.variantTab)) return;
        if (b.type_bloc === 'molecule') {
          // Sync + save tant que chips = onglet courant ; sinon collectPayload
          // écrirait la couche ★ suivante avec les chips de l’onglet précédent.
          syncMolChipsToState(id);
          state.molChips[id]?.destroy?.();
          delete state.molChips[id];
          void saveDraft(id).then(() => {
            state.variantTab = next;
            remountMolContenu(card, b);
          });
          return;
        }
        flushVariantEditor(id);
        paintVariantTabs(card, b);
        state.variantTab = next;
        remountVariantRte(card, b);
      });
    });
    card.querySelectorAll('[data-rte]').forEach((host) => {
      if (b.type_bloc === 'texte' || b.type_bloc === 'conseil') {
        mountVariantRte(card, b, host);
        return;
      }
      const field = host.getAttribute('data-field') || 'html';
      const html = effPayload(b)[field] || '';
      state.editors[id + ':' + field] = global.JpStudioRichtext.mount(host, html, {
        onChange: () => scheduleSave(id),
      });
    });
    if (b.type_bloc === 'molecule') mountMolChips(card, b);
    card.querySelectorAll('input[data-field], select[data-field]').forEach((inp) => {
      const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
      inp.addEventListener(ev, () => {
        // Ne relire l’image que si path/url change — pas à chaque lettre de légende/titre.
        const field = inp.getAttribute('data-field');
        if (card.querySelector('[data-photo-prev]') && (field === 'path' || field === 'url')) {
          paintPhotoPreview(card);
        } else if (field === 'legende') {
          const cap = card.querySelector('.jp-photo-cap');
          const leg = inp.value || '';
          if (cap) {
            if (leg) cap.textContent = leg;
            else cap.remove();
          } else if (leg) {
            const fig = card.querySelector('figure.jp-photo');
            if (fig) {
              const c = document.createElement('figcaption');
              c.className = 'jp-photo-cap';
              c.textContent = leg;
              fig.appendChild(c);
            }
          }
        }
        scheduleSave(id);
      });
    });
    if (card.querySelector('[data-photo-prev]')) {
      paintPhotoPreview(card);
      card.querySelector('[data-photo-file]')?.addEventListener('change', (ev) => void pickPhoto(card, id, ev.target));
      card.querySelector('[data-photo-clear]')?.addEventListener('click', () => {
        ['path', 'url'].forEach((f) => { const el = card.querySelector('[data-field="' + f + '"]'); if (el) el.value = ''; });
        paintPhotoPreview(card);
        scheduleSave(id);
      });
    }
    if (card.querySelector('[data-reco-wrap]')) bindRecoReferenceCard(card, id);
    card.querySelector('[data-field="titre"]')?.addEventListener('input', () => scheduleSave(id));
    card.querySelectorAll('[data-mol-prog]').forEach((btn) => {
      btn.addEventListener('click', () => void openBlocValeurs(btn.getAttribute('data-mol-prog')));
    });
    bindJeuBlocActions(card, b);
  }

  /** Panneau jeu lié (canvas Contenu + inspecteur) — code JP, type, actions. */
  function jeuBlocPanelHtml(b, opts) {
    const o = opts || {};
    const p = effPayload(b);
    const typeLab = p.type_jeu ? (TYPE_JEU_LABELS[p.type_jeu] || p.type_jeu) : '';
    const titre = o.showTitle ? effTitre(b) : '';
    const empty = !p.modele_id && !(p.code_unique || '').trim();
    let html = (o.bare ? '' : '<div class="jp-bloc-jeu">')
      + '<div class="jp-bloc-jeu-meta">'
      + (empty
        ? '<p class="jp-muted jp-bloc-jeu-empty">Aucun jeu lié — changez ou créez-en un.</p>'
        : '<p class="jp-bloc-jeu-line"><code>' + esc(p.code_unique || '—') + '</code>'
          + (typeLab ? '<span class="jp-bloc-jeu-type">' + esc(typeLab) + '</span>' : '') + '</p>')
      + (titre ? '<p class="jp-bloc-jeu-titre">' + esc(titre) + '</p>' : '')
      + '</div>'
      + '<div class="jp-bloc-jeu-actions">';
    if (p.modele_id) {
      html += '<button type="button" class="jp-btn jp-btn-primary" data-mod-jeu="' + b.id
        + '">Modifier les paramètres</button>';
    }
    html += '<div class="jp-bloc-jeu-actions-sec">'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-change-jeu="' + b.id + '">Changer</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-new-jeu="' + b.id + '">Créer</button>'
      + '</div></div>'
      + (o.bare ? '' : '</div>');
    return html;
  }

  function bindJeuBlocActions(root, b) {
    if (!root || !b || b.type_bloc !== 'jeu') return;
    root.querySelectorAll('[data-mod-jeu]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mid = effPayload(b).modele_id;
        if (mid) void openJeuWizard({ modeleId: mid, blocId: b.id });
      });
    });
    root.querySelectorAll('[data-new-jeu]').forEach((btn) => {
      btn.addEventListener('click', () => void openJeuWizard({ blocId: b.id }));
    });
    root.querySelectorAll('[data-change-jeu]').forEach((btn) => {
      btn.addEventListener('click', () => void openChangerJeu(b.id));
    });
  }

  /** Aligné le switch Structure|Contenu (is-active + aria-pressed) sur state.viewMode. */
  function syncViewModeToggle() {
    const mode = state.viewMode === 'contenu' ? 'contenu' : 'structure';
    document.querySelectorAll('.jp-mode-btn[data-view]').forEach((btn) => {
      const on = btn.getAttribute('data-view') === mode;
      btn.classList.toggle('is-active', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const list = document.getElementById('blocksList');
    if (list) {
      list.classList.toggle('jp-blocks-contenu', mode === 'contenu');
      list.classList.toggle('jp-blocks-structure', mode === 'structure');
    }
    syncReorgButton();
  }

  function syncReorgButton() {
    const btn = document.getElementById('btnReorganiser');
    if (!btn) return;
    const show = state.viewMode !== 'contenu';
    btn.hidden = !show;
  }

  function paintBlocks() {
    clearEditors();
    syncViewModeToggle();
    const list = document.getElementById('blocksList');
    if (!list) return;
    const all = state.blocs;
    const shown = visibleBlocs();
    if (!all.length) {
      list.innerHTML = '<p class="jp-muted jp-studio-empty">Aucun bloc — utilisez « Ajouter » ci-dessus.</p>';
      updateStatus();
      return;
    }
    if (!shown.length) {
      list.innerHTML = '<p class="jp-muted jp-studio-empty">Aucun bloc — utilisez « Ajouter » ci-dessus.</p>';
      updateStatus();
      return;
    }

    if (state.viewMode === 'contenu') {
      let b = shown.find((x) => x.id === state.selectedBlocId) || null;
      if (!b) {
        b = shown.find((x) => x.type_bloc !== 'section') || shown[0];
        state.selectedBlocId = b ? b.id : null;
      }
      const outline = shown.map((x) => {
        const on = x.id === state.selectedBlocId ? ' is-active' : '';
        const sec = x.type_bloc === 'section' ? ' is-section' : '';
        const vc = variantCount(x);
        return '<button type="button" class="jp-outline-item' + on + sec + '" data-outline="' + x.id + '">'
          + '<span class="jp-outline-type">' + esc(TYPE_LABELS[x.type_bloc] || x.type_bloc) + '</span>'
          + '<span class="jp-outline-title">' + esc(effTitre(x) || 'Sans titre') + '</span>'
          + plageBadge(x.niveau_min, x.niveau_max)
          + (vc ? '<span class="jp-outline-var" title="Variantes">+' + vc + '</span>' : '')
          + '</button>';
      }).join('');
      list.innerHTML = '<div class="jp-contenu-layout">'
        + '<nav class="jp-outline" aria-label="Blocs de la leçon">' + outline + '</nav>'
        + '<div class="jp-contenu-editor"></div></div>';
      list.querySelectorAll('[data-outline]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const nid = btn.getAttribute('data-outline');
          if (nid === state.selectedBlocId) return;
          selectBloc(nid, { inspectorTab: 'bloc' });
        });
      });
      paintContenuEditorOnly();
      ensureOutlineVisible(state.selectedBlocId);
    } else {
      // Structure : lignes compactes + sections en bandeau
      list.innerHTML = shown.map((b) => {
        const i = all.findIndex((x) => x.id === b.id);
        const tag = hasPending(b)
          ? '<span class="jp-bloc-tag">' + (isHidden(b) ? 'nouveau' : 'brouillon') + '</span>'
          : '';
        const vc = variantCount(b);
        const on = b.id === state.selectedBlocId ? ' is-selected' : '';
        if (b.type_bloc === 'section') {
          return '<article class="jp-block-card jp-block-section' + on + '" data-bloc="' + b.id + '">'
            + '<header>'
            + blockToolsHtml(b, i, all.length)
            + '<span class="jp-block-type">Section</span>'
            + '<input class="jp-block-title" data-field="titre" data-id="' + b.id + '" value="' + esc(effTitre(b)) + '"'
            + ' placeholder="Titre de la section" aria-label="Titre de section">'
            + tag + plageBadge(b.niveau_min, b.niveau_max)
            + '<button type="button" class="jp-btn jp-btn-ghost jp-block-open" data-open="' + b.id + '">Ouvrir</button>'
            + '<button type="button" class="jp-block-del" data-del="' + b.id + '" title="Supprimer" aria-label="Supprimer">×</button>'
            + '</header></article>';
        }
        return '<article class="jp-block-card jp-block-row' + on + '" data-bloc="' + b.id + '">'
          + '<header>'
          + blockToolsHtml(b, i, all.length)
          + '<button type="button" class="jp-block-hit" data-open="' + b.id + '">'
          + '<span class="jp-block-type">' + esc(TYPE_LABELS[b.type_bloc] || b.type_bloc) + '</span>'
          + '<span class="jp-block-title-ro">' + esc(effTitre(b) || 'Sans titre') + '</span>'
          + '</button>'
          + tag + plageBadge(b.niveau_min, b.niveau_max)
          + (vc ? '<span class="jp-outline-var">+' + vc + ' var.</span>' : '')
          + '<button type="button" class="jp-btn jp-btn-ghost jp-block-open" data-open="' + b.id + '">Écrire</button>'
          + '<button type="button" class="jp-block-del" data-del="' + b.id + '" title="Supprimer" aria-label="Supprimer">×</button>'
          + '</header></article>';
      }).join('');

      list.querySelectorAll('[data-open]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          selectBloc(btn.getAttribute('data-open'), { toContenu: true, inspectorTab: 'bloc' });
        });
      });
      list.querySelectorAll('.jp-block-section [data-field="titre"]').forEach((inp) => {
        inp.addEventListener('input', () => scheduleSave(inp.getAttribute('data-id')));
        inp.addEventListener('click', (ev) => ev.stopPropagation());
      });
      list.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          confirmDeleteBloc(btn.getAttribute('data-del'));
        });
      });
      bindBlockReorder(list);
    }

    if (state.focusBlocId) {
      const id = state.focusBlocId;
      state.focusBlocId = null;
      state.selectedBlocId = id;
      state.viewMode = 'contenu';
      paintBlocks();
      const m = selectedModule();
      if (m) void renderInspector(m);
      return;
    }
    updateStatus();
  }

  /* ——— Bloc photo ——— */

  function paintPhotoPreview(card) {
    const host = card.querySelector('[data-photo-prev]');
    if (!host) return;
    const v = (f) => card.querySelector('[data-field="' + f + '"]')?.value || '';
    const p = { path: v('path'), url: v('url'), alt: v('alt'), legende: v('legende') };
    const hasImg = global.JpBlocPhoto.safePath(p.path) || global.JpBlocPhoto.safeUrl(p.url);
    host.innerHTML = hasImg
      ? global.JpBlocPhoto.figureHtml(p)
      : '<p class="jp-muted jp-photo-empty">Aucune photo — téléversez un fichier ou collez un lien https.</p>';
    global.JpBlocPhoto.hydrate(host);
  }

  async function pickPhoto(card, blocId, input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    const m = selectedModule();
    try {
      const path = await global.JpBlocPhoto.upload(file, m && m.id);
      const pathEl = card.querySelector('[data-field="path"]');
      const urlEl = card.querySelector('[data-field="url"]');
      if (pathEl) pathEl.value = path;
      if (urlEl) urlEl.value = '';
      paintPhotoPreview(card);
      scheduleSave(blocId);
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  /* ——— Collecte + auto-enregistrement du brouillon ——— */

  function collectPayload(blocId, type) {
    const card = document.querySelector('[data-bloc="' + blocId + '"]');
    const b = state.blocs.find((x) => x.id === blocId);
    if (!card) return effPayload(b);
    const val = (field) => card.querySelector('[data-field="' + field + '"]')?.value || '';
    const rte = (field) => state.editors[blocId + ':' + field]?.getHtml?.() || '';
    function collectVariantesFromScratch(field) {
      flushVariantEditor(blocId);
      const scratch = state.variantScratch[blocId];
      if (!scratch) return null;
      const variantes = {};
      for (let i = 1; i <= 5; i += 1) {
        const html = String(scratch.tabs[String(i)] || '');
        if (isEmptyHtml(html)) continue;
        variantes[String(i)] = { [field]: html };
      }
      return Object.keys(variantes).length ? variantes : null;
    }
    if (type === 'section') return {};
    if (type === 'texte') {
      flushVariantEditor(blocId);
      const scratch = ensureVariantScratch(blocId, 'texte', effPayload(b));
      const out = { html: scratch.base || rte('html') };
      const v = collectVariantesFromScratch('html');
      if (v) out.variantes = v;
      return out;
    }
    if (type === 'video') return { url: val('url') };
    if (type === 'photo') {
      return {
        path: val('path'),
        url: val('url'),
        alt: (effPayload(b).alt || ''),
        legende: val('legende'),
      };
    }
    if (type === 'molecule') {
      syncMolChipsToState(blocId);
      const cur = effPayload(b);
      // Sans chips montées (changement d’onglet / structure) : ne pas réécrire une couche
      // avec un variantTab déjà basculé — le state local (writeMolPayload) prime.
      if (!state.molChips[blocId]) return cur;
      const tab = state.variantTab || 'base';
      const layer = molLayerOf(cur, tab);
      layer.matrice_ids = (state.molChips[blocId].getIds?.() || []).filter(Boolean);
      return setMolLayerOnPayload(cur, tab, layer);
    }
    if (type === 'conseil') {
      flushVariantEditor(blocId);
      const scratch = ensureVariantScratch(blocId, 'conseil', effPayload(b));
      const out = { pathologie: val('pathologie'), corps_html: scratch.base || rte('corps_html') };
      const v = collectVariantesFromScratch('corps_html');
      if (v) out.variantes = v;
      return out;
    }
    if (type === 'recommandation') {
      return {
        corps_html: rte('corps_html'),
        references: collectRecoReferences(card, blocId),
        lien_bloc_id: '',
        lien_module_id: '',
        lien_parcours_id: '',
        lien_href: '',
        lien_label: '',
      };
    }
    return Object.assign({ libelle_cta: 'Jouer' }, effPayload(b));
  }

  function scheduleSave(blocId) {
    clearTimeout(state.timers[blocId]);
    state.timers[blocId] = setTimeout(() => {
      delete state.timers[blocId];
      void saveDraft(blocId);
    }, AUTOSAVE_MS);
    updateStatus();
  }

  function enqueue(blocId, fn) {
    const prev = state.chain[blocId] || Promise.resolve();
    const next = prev.then(fn, fn);
    state.chain[blocId] = next.catch(() => {});
    return next;
  }

  function saveDraft(blocId) {
    return enqueue(blocId, async () => {
      const b = state.blocs.find((x) => x.id === blocId);
      const card = document.querySelector('[data-bloc="' + blocId + '"]');
      if (!b || !card) return;
      // En structure, seule la section a un titre éditable ; sinon on garde le brouillon existant.
      const titreEl = card.querySelector('[data-field="titre"]');
      const titre = titreEl ? (titreEl.value || '') : effTitre(b);
      const payload = (state.viewMode === 'structure' && b.type_bloc !== 'section')
        ? effPayload(b)
        : collectPayload(blocId, b.type_bloc);
      const pj = buildDraftPayloadJson(b, titre, payload);
      // Dirty-flag : skip RPC si identique au dernier enregistrement réussi.
      const hash = hashPayloadJson(pj);
      if (hash === state.lastSavedHash[blocId]) return;
      state.inflight += 1;
      updateStatus();
      try {
        const row = await rpc('v2_upsert_bloc', { p_payload: { id: blocId, payload_json: pj } });
        b.payload_json = row.payload_json;
        b.updated_at = row.updated_at;
        state.lastSavedHash[blocId] = hashPayloadJson(b.payload_json);
        rememberBlocsCache(state.selectedModuleId, state.blocs);
        state.saveError = false;
        state.lastSavedAt = nowLabel();
        const tagHost = card.querySelector('header');
        if (tagHost && !tagHost.querySelector('.jp-bloc-tag') && hasPending(b)) {
          tagHost.querySelector('.jp-block-del')?.insertAdjacentHTML('beforebegin',
            '<span class="jp-bloc-tag" title="Pas encore publié">' + (isHidden(b) ? 'nouveau' : 'brouillon') + '</span>');
        } else if (tagHost && !hasPending(b)) {
          tagHost.querySelector('.jp-bloc-tag')?.remove();
        }
        if (b.type_bloc === 'texte' || b.type_bloc === 'conseil' || b.type_bloc === 'molecule') {
          paintVariantTabs(card, b);
        }
      } catch (e) {
        state.saveError = true;
        global.JpToast?.fromError?.(e);
      } finally {
        state.inflight -= 1;
        updateStatus();
      }
    });
  }

  async function flushAll() {
    syncMolChipsToState();
    const ids = new Set(Object.keys(state.timers));
    state.blocs.forEach((b) => {
      if (b.type_bloc === 'molecule' && (state.molChips[b.id] || draftOf(b))) ids.add(b.id);
    });
    ids.forEach((id) => { clearTimeout(state.timers[id]); delete state.timers[id]; });
    ids.forEach((id) => { void saveDraft(id); });
    await Promise.all(Object.values(state.chain));
    updateStatus();
  }

  /* ——— Publication ——— */

  /** Sync pubs dérivées des blocs molécule (RPC SQL). */
  async function syncPubsDepuisBlocs(moduleId) {
    if (!moduleId) return;
    await rpc('v2_sync_pubs_depuis_blocs_molecule', { p_module_id: moduleId });
  }

  /** Publie toutes les leçons du parcours (RPC bulk : brouillons → publié, sync pubs, statut). */
  async function publishParcours() {
    if (!state.parcoursId) return;
    const btn = document.getElementById('btnPublish');
    if (btn) btn.disabled = true;
    try {
      await flushAll();
      const res = await rpc('v2_publier_parcours', { p_parcours_id: state.parcoursId });
      invalidateBlocsCache();
      invalidateProgCount();
      state.lastSavedHash = {};
      state.modules = await loadModules(state.parcoursId);
      const cur = selectedModule();
      if (cur && !cur.est_groupe) {
        state.blocs = await loadBlocs(cur.id, { force: true });
        rememberBlocsCache(cur.id, state.blocs);
      } else {
        state.blocs = [];
      }
      state.lastSavedAt = null;
      state.saveError = false;
      renderTree();
      paintBlocks();
      const n = Number(res?.lecons) || state.modules.filter((mod) => !mod.est_groupe).length;
      global.JpToast?.ok?.(
        n === 0
          ? 'Aucune leçon à publier'
          : ('Parcours publié · ' + n + ' leçon' + (n > 1 ? 's' : ''))
      );
      void global.JpLogs?.action?.('studio_publier_parcours', {
        parcours_id: state.parcoursId,
        n_lecons: n,
        blocs_promus: res?.blocs_promus,
      });
      if (cur && !cur.est_groupe) void renderInspector(cur);
    } catch (e) {
      global.JpToast?.fromError?.(e);
    } finally {
      updateStatus();
    }
  }

  /* ——— Actions blocs ——— */

  /** Valeurs affichées pour le bloc molécule (onglet Base / ★ courant). */
  async function openBlocValeurs(blocId) {
    const m = selectedModule();
    const b = state.blocs.find((x) => x.id === blocId);
    if (!m || !b || b.type_bloc !== 'molecule') return;
    syncMolChipsToState(blocId);
    const tab = state.variantTab || 'base';
    const cur = effPayload(b);
    const layer = molLayerOf(cur, tab);
    const baseLayer = molLayerOf(cur, 'base');
    const scopeIds = tab === 'base'
      ? layer.matrice_ids.slice()
      : [...new Set([...baseLayer.matrice_ids, ...layer.matrice_ids].map(String))].map((id) =>
        baseLayer.matrice_ids.find((x) => String(x) === id)
          || layer.matrice_ids.find((x) => String(x) === id)
          || id);
    if (!scopeIds.length) {
      global.JpToast?.warn?.('Ajoutez d’abord des molécules à ce bloc');
      return;
    }
    await global.JpStudioMolPicker.open({
      moduleId: m.id,
      blocId,
      mode: 'bloc',
      scopeMatriceIds: scopeIds,
      initialValeurs: layer.valeurs,
      title: tab === 'base'
        ? 'Valeurs affichées (base)'
        : 'Valeurs ajoutées ★' + tab,
      onApplyValeurs: async ({ matriceId, checked }) => {
        const fresh = effPayload(b);
        const lay = molLayerOf(fresh, tab);
        if (checked && checked.length) lay.valeurs[matriceId] = checked.slice();
        else delete lay.valeurs[matriceId];
        writeMolPayload(blocId, setMolLayerOnPayload(fresh, tab, lay));
        await saveDraft(blocId);
        const card = document.querySelector('[data-bloc="' + blocId + '"]');
        if (card && state.viewMode === 'contenu' && state.selectedBlocId === blocId) {
          // Maj locale du libellé « Valeurs affichées (N) » + onglets — pas de paintBlocks().
          const body = card.querySelector('.jp-block-body');
          if (body) {
            const nVals = Object.values(molLayerOf(effPayload(b), state.variantTab || 'base').valeurs || {})
              .reduce((n, a) => n + (a || []).length, 0);
            const progBtn = body.querySelector('[data-mol-prog]');
            if (progBtn) {
              progBtn.textContent = 'Valeurs affichées…' + (nVals ? ' (' + nVals + ')' : '');
            }
          }
          paintVariantTabs(card, b);
          paintVariantCountBadge(blocId);
          updateStatus();
        } else {
          remountMolContenu(card, b);
        }
      },
    });
  }

  async function addBloc(type) {
    const m = selectedModule();
    if (!m || m.est_groupe) return;
    if (type === 'jeu') {
      await openJeuWizard();
      return;
    }
    try {
      await flushAll();
      const afterId = state.selectedBlocId;
      const afterIdx = afterId ? state.blocs.findIndex((b) => b.id === afterId) : -1;
      const initial = type === 'section' ? {}
        : (type === 'texte' ? { html: '<p></p>' }
          : (type === 'conseil' ? { pathologie: '', corps_html: '<p></p>' }
            : (type === 'recommandation' ? {
              corps_html: '<p></p>',
              references: [],
            }
              : (type === 'molecule'
                ? { matrice_ids: [], valeurs: {}, mode: 'fiche' }
                : {}))));
      const row = await rpc('v2_upsert_bloc', {
        p_payload: {
          module_id: m.id,
          type_bloc: type,
          ordre: (state.blocs.length + 1) * 10,
          payload_json: initial,
          visible: false,
        },
      });
      if (afterIdx >= 0) {
        const ids = state.blocs.map((b) => b.id);
        ids.splice(afterIdx + 1, 0, row.id);
        state.blocs.splice(afterIdx + 1, 0, row);
        await applyBlocOrder(ids);
      } else {
        state.blocs.push(row);
      }
      state.lastSavedHash[row.id] = hashPayloadJson(row.payload_json);
      rememberBlocsCache(m.id, state.blocs);
      delete state.variantScratch[row.id];
      selectBloc(row.id, { toContenu: type !== 'section', inspectorTab: 'bloc' });
      const card = document.querySelector('[data-bloc="' + row.id + '"]');
      card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      card?.querySelector('[data-field="titre"], .jp-rte-surface')?.focus?.();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  function confirmDeleteBloc(id) {
    const b = state.blocs.find((x) => x.id === id);
    if (!b) return;
    global.JpModal.open({
      title: 'Supprimer ce bloc ?',
      body: [isHidden(b)
        ? 'Ce bloc n’a pas encore été publié.'
        : 'La suppression est immédiate : le bloc disparaît aussi de la leçon publiée.'],
      confirmLabel: 'Supprimer',
      onConfirm: async () => { await deleteBloc(id); },
    });
  }

  async function deleteBloc(id) {
    try {
      clearTimeout(state.timers[id]);
      delete state.timers[id];
      await (state.chain[id] || Promise.resolve());
      await rpc('v2_supprimer_bloc', { p_bloc_id: id });
      state.blocs = state.blocs.filter((b) => b.id !== id);
      delete state.variantScratch[id];
      delete state.lastSavedHash[id];
      rememberBlocsCache(state.selectedModuleId, state.blocs);
      if (state.selectedBlocId === id) state.selectedBlocId = null;
      paintBlocks();
      const m = selectedModule();
      if (m && !m.est_groupe) void renderInspector(m);
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  function renderInspectorMeta(m) {
    const pane = document.getElementById('inspectorPane');
    pane.innerHTML = inspFold('Propriétés',
      '<div class="jp-field"><label for="metaTitre">Titre</label><input id="metaTitre" value="' + esc(m.titre) + '"></div>'
      + '<div class="jp-field"><label for="metaResume">Résumé</label><textarea id="metaResume" rows="3">' + esc(m.resume || '') + '</textarea></div>'
      + '<div class="jp-field"><span class="jp-inspector-title" style="display:block;margin-bottom:0.35rem">Visibilité ★</span>'
      + plageControlsHtml(m.niveau_min, m.niveau_max, 'mod-' + m.id) + '</div>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnSaveMeta">Enregistrer</button>',
      { open: true })
      + inspFold('Déblocage', '', { open: true, cls: 'jp-unlock', bodyId: 'unlockHost' });
    mountDeblocage(m);
    const plageHost = pane.querySelector('[data-plage]');
    bindPlage(plageHost, () => {});
    pane.querySelector('#btnSaveMeta').addEventListener('click', async () => {
      try {
        const plage = readPlage(plageHost);
        await rpc('v2_upsert_module', {
          p_payload: {
            id: m.id,
            titre: pane.querySelector('#metaTitre').value,
            resume: pane.querySelector('#metaResume').value,
            niveau_min: plage.niveau_min,
            niveau_max: plage.niveau_max,
          },
        });
        state.modules = await loadModules(state.parcoursId);
        renderTree();
        global.JpToast?.ok?.('Enregistré');
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
    });
  }

  async function countProgramme(moduleId, opts) {
    const force = !!(opts && opts.force);
    if (!force && state.progCountCache[moduleId]) {
      return state.progCountCache[moduleId];
    }
    const { data } = await sb()
      .from('publications_connaissances')
      .select('connaissance_id, connaissances!inner(matrice_id)')
      .eq('module_id', moduleId)
      .eq('actif', true);
    const mats = new Set();
    (data || []).forEach((p) => {
      if (p.connaissances?.matrice_id) mats.add(p.connaissances.matrice_id);
    });
    const stats = { connaissances: (data || []).length, molecules: mats.size };
    state.progCountCache[moduleId] = stats;
    return stats;
  }

  async function renderInspector(m) {
    const pane = document.getElementById('inspectorPane');
    const tab = state.inspectorTab || 'lecon';
    const stats = await countProgramme(m.id);
    const bloc = state.blocs.find((b) => b.id === state.selectedBlocId) || null;

    pane.innerHTML = '<div class="jp-insp-tabs" role="tablist">'
      + [['lecon', 'Leçon'], ['bloc', 'Bloc'], ['programme', 'Programme']].map(([id, lab]) =>
        '<button type="button" class="jp-insp-tab' + (tab === id ? ' is-active' : '') + '" data-insp="' + id + '" role="tab">'
        + lab + '</button>'
      ).join('')
      + '</div><div id="inspBody"></div>';

    pane.querySelectorAll('[data-insp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.inspectorTab = btn.getAttribute('data-insp');
        void renderInspector(m);
      });
    });

    const body = pane.querySelector('#inspBody');
    if (tab === 'programme') {
      const molBlocs = state.blocs.filter((b) => b.type_bloc === 'molecule');
      const synth = [];
      const seen = new Set();
      molBlocs.forEach((b) => {
        const resolved = resolveMolPayload(effPayload(b), null);
        resolved.matrice_ids.forEach((mid) => {
          if (seen.has(String(mid))) return;
          seen.add(String(mid));
          const n = (resolved.valeurs[mid] || []).length;
          const lab = state.molLabels[mid]?.label || String(mid).slice(0, 8);
          synth.push({ id: mid, label: lab, n });
        });
      });
      body.innerHTML = '<div class="jp-inspector-cta">'
        + '<div class="jp-inspector-head"><strong class="jp-inspector-title">Programme</strong><span id="helpProg"></span></div>'
        + '<p class="jp-muted" id="progStats" style="margin:0">' + stats.molecules + ' molécule(s) · '
        + stats.connaissances + ' valeur(s) publiée(s)</p>'
        + '<p class="jp-muted jp-field-hint">Lecture seule — source = blocs molécule '
        + '(Base + ajouts ★). Éditez les molécules et « Valeurs affichées » dans le bloc.</p>'
        + (synth.length
          ? '<ul class="jp-prog-synth">' + synth.map((s) =>
            '<li><strong>' + esc(s.label) + '</strong> · ' + s.n + ' valeur(s)</li>'
          ).join('') + '</ul>'
          : '<p class="jp-muted">Aucun bloc molécule dans cette leçon.</p>')
        + '<button type="button" class="jp-btn jp-btn-ghost" id="btnSyncPubs" style="margin-top:0.5rem">'
        + 'Resynchroniser les publications</button>'
        + '</div>';
      body.querySelector('#helpProg').appendChild(
        global.JpModal.helpButton('Programme', [
          'Le programme de la leçon est dérivé des blocs molécule (Base + variantes ★ additives).',
          'Choisissez les molécules et les valeurs dans chaque bloc, puis publiez la leçon.',
          'Le catalogue « acquis » n’affiche que les leçons validées ; jeux / leçon courante = dès déblocage.',
        ])
      );
      body.querySelector('#btnSyncPubs')?.addEventListener('click', async () => {
        try {
          await flushAll();
          await syncPubsDepuisBlocs(m.id);
          invalidateProgCount(m.id);
          const s = await countProgramme(m.id, { force: true });
          const el = document.getElementById('progStats');
          if (el) el.textContent = s.molecules + ' molécule(s) · ' + s.connaissances + ' valeur(s) publiée(s)';
          global.JpToast?.ok?.('Publications synchronisées');
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
      return;
    }

    if (tab === 'bloc') {
      if (!bloc) {
        body.innerHTML = '<p class="jp-muted">Sélectionnez un bloc dans le canvas (mode Structure ou Contenu).</p>';
        return;
      }
      const vc = variantCount(bloc);
      const pj = effPayload(bloc);
      let jeuInsp = '';
      if (bloc.type_bloc === 'jeu') {
        jeuInsp = '<div class="jp-inspector-cta jp-inspector-jeu">'
          + '<strong class="jp-inspector-title">Jeu lié</strong>'
          + jeuBlocPanelHtml(bloc, { showTitle: false, bare: true })
          + '</div>';
      }
      body.innerHTML = '<div class="jp-inspector-cta">'
        + '<strong class="jp-inspector-title">' + esc(TYPE_LABELS[bloc.type_bloc] || bloc.type_bloc) + '</strong>'
        + '<p class="jp-muted" style="margin:0.25rem 0 0.6rem">' + esc(effTitre(bloc) || 'Sans titre')
        + (vc ? ' · ' + vc + ' variante(s)' : '') + '</p>'
        + '<span class="jp-inspector-title" style="display:block;margin-bottom:0.35rem">Visibilité ★</span>'
        + plageControlsHtml(bloc.niveau_min, bloc.niveau_max, 'bloc-' + bloc.id)
        + '<p class="jp-muted jp-field-hint">Enregistré dès modification. Le contenu (texte, variantes) s’édite en mode Contenu.</p>'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnOpenContenu" style="margin-top:0.5rem">Écrire ce bloc</button>'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="btnDeplacerBloc" style="margin-top:0.35rem">Déplacer vers…</button>'
        + '</div>'
        + jeuInsp;
      const host = body.querySelector('[data-plage]');
      bindPlage(host, async (plage) => {
        try {
          const row = await rpc('v2_upsert_bloc', {
            p_payload: { id: bloc.id, niveau_min: plage.niveau_min, niveau_max: plage.niveau_max },
          });
          bloc.niveau_min = row.niveau_min;
          bloc.niveau_max = row.niveau_max;
          paintBlocks();
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
      body.querySelector('#btnOpenContenu')?.addEventListener('click', () => {
        selectBloc(bloc.id, { toContenu: true, inspectorTab: 'bloc' });
      });
      body.querySelector('#btnDeplacerBloc')?.addEventListener('click', () => {
        void openDeplacerBloc(bloc.id);
      });
      if (bloc.type_bloc === 'jeu') bindJeuBlocActions(body, bloc);
      return;
    }

    // Onglet Leçon — sections repliables
    body.innerHTML = inspFold('Leçon',
      '<div class="jp-field"><label for="metaTitreLecon">Titre</label>'
      + '<input id="metaTitreLecon" value="' + esc(m.titre || '') + '" placeholder="Titre de la leçon"></div>'
      + '<div class="jp-field"><label for="metaResumeLecon">Résumé</label>'
      + '<textarea id="metaResumeLecon" rows="2" placeholder="Court résumé (facultatif)">'
      + esc(m.resume || '') + '</textarea></div>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnSaveMetaLecon">Enregistrer le titre</button>',
      { open: true })
      + inspFold('Visibilité ★',
        plageControlsHtml(m.niveau_min, m.niveau_max, 'lecon-' + m.id)
        + '<button type="button" class="jp-btn jp-btn-ghost" id="btnSavePlage" style="margin-top:0.4rem">Enregistrer la plage</button>',
        { open: false })
      + inspFold('Jeux',
        '<button type="button" class="jp-btn jp-btn-primary" id="btnNewJeu">Créer un jeu</button>'
        + '<div id="jeuxLies"></div>',
        { open: false })
      + inspFold('Déblocage', '', { open: true, cls: 'jp-unlock', bodyId: 'unlockHost' });
    mountDeblocage(m);
    const leconPlage = body.querySelector('[data-plage="lecon-' + m.id + '"]');
    bindPlage(leconPlage, () => {});
    body.querySelector('#btnSaveMetaLecon')?.addEventListener('click', async () => {
      try {
        const titre = (body.querySelector('#metaTitreLecon')?.value || '').trim();
        if (!titre) {
          global.JpToast?.warn?.('Indiquez un titre de leçon');
          return;
        }
        const resume = body.querySelector('#metaResumeLecon')?.value || '';
        const row = await rpc('v2_upsert_module', {
          p_payload: { id: m.id, titre, resume },
        });
        Object.assign(m, { titre: row.titre, resume: row.resume });
        state.modules = await loadModules(state.parcoursId);
        renderTree();
        const h2 = document.querySelector('#canvasPane .jp-studio-h2');
        if (h2) h2.textContent = row.titre || titre;
        global.JpToast?.ok?.('Titre enregistré');
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
    });
    body.querySelector('#btnSavePlage')?.addEventListener('click', async () => {
      try {
        const plage = readPlage(leconPlage);
        const row = await rpc('v2_upsert_module', {
          p_payload: { id: m.id, niveau_min: plage.niveau_min, niveau_max: plage.niveau_max },
        });
        Object.assign(m, { niveau_min: row.niveau_min, niveau_max: row.niveau_max });
        state.modules = await loadModules(state.parcoursId);
        renderTree();
        global.JpToast?.ok?.('Plage enregistrée');
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
    });
    body.querySelector('#btnNewJeu').addEventListener('click', () => void openJeuWizard());
    await refreshJeuxLies(m);
  }

  async function refreshJeuxLies(m) {
    const box = document.getElementById('jeuxLies');
    if (!box) return;
    const { data } = await sb()
      .from('modeles_jeu')
      .select('id, code_unique, type_jeu, titre, en_pause, actif')
      .eq('parcours_id', state.parcoursId)
      .eq('actif', true)
      .contains('module_ids', [m.id]);
    const rows = data || [];
    box.innerHTML = rows.length
      ? '<div class="jp-jeux-lies">' + rows.map((r) => {
        const typeLab = TYPE_JEU_LABELS[r.type_jeu] || r.type_jeu || '';
        return '<div class="jp-jeux-lies-item">'
          + '<code>' + esc(r.code_unique || '—') + '</code>'
          + (typeLab ? '<span class="jp-bloc-jeu-type">' + esc(typeLab) + '</span>' : '')
          + '<span class="jp-jeux-lies-titre">' + esc(r.titre || 'Sans titre') + '</span>'
          + '</div>';
      }).join('') + '</div>'
      : '<p class="jp-muted jp-jeux-lies-empty">Aucun jeu lié à cette leçon</p>';
  }

  /** Lie un modèle de jeu au bloc (brouillon si déjà publié, sinon payload direct). */
  async function lierModeleAuBloc(blocId, modele) {
    const b = state.blocs.find((x) => x.id === blocId);
    if (!b || b.type_bloc !== 'jeu' || !modele?.id) return null;
    const prev = effPayload(b);
    const payload = Object.assign({}, prev, {
      modele_id: modele.id,
      code_unique: modele.code_unique || '',
      type_jeu: modele.type_jeu || prev.type_jeu || '',
      libelle_cta: prev.libelle_cta || 'Jouer',
    });
    const titre = modele.titre || effTitre(b) || '';
    const pj = buildDraftPayloadJson(b, titre, payload);
    const hash = hashPayloadJson(pj);
    if (hash === state.lastSavedHash[blocId]) return b;
    const row = await rpc('v2_upsert_bloc', { p_payload: { id: blocId, payload_json: pj } });
    b.payload_json = row.payload_json;
    if (row.titre != null) b.titre = row.titre;
    state.lastSavedHash[blocId] = hashPayloadJson(b.payload_json);
    rememberBlocsCache(state.selectedModuleId, state.blocs);
    return b;
  }

  async function listModelesParcours() {
    const { data, error } = await sb()
      .from('modeles_jeu')
      .select('id, code_unique, type_jeu, titre, en_pause, actif, module_ids')
      .eq('parcours_id', state.parcoursId)
      .eq('actif', true)
      .order('code_unique');
    if (error) throw error;
    return data || [];
  }

  async function openChangerJeu(blocId) {
    const m = selectedModule();
    const b = state.blocs.find((x) => x.id === blocId);
    if (!m || !b || b.type_bloc !== 'jeu') return;
    await flushAll();
    let rows;
    try {
      rows = await listModelesParcours();
    } catch (e) {
      global.JpToast?.fromError?.(e);
      return;
    }
    const curId = effPayload(b).modele_id || '';
    const items = rows.map((r) => ({
      id: r.id,
      label: (r.code_unique || 'JP-?????') + ' — ' + (r.titre || 'Sans titre'),
      sub: (TYPE_JEU_LABELS[r.type_jeu] || r.type_jeu || '')
        + (r.en_pause ? ' · en pause' : '')
        + (r.id === curId ? ' · actuel' : ''),
      modele: r,
    }));

    const overlay = document.createElement('div');
    overlay.className = 'jp-studio-overlay';
    overlay.innerHTML = '<div class="jp-jeu-change-sheet" role="dialog" aria-modal="true" aria-labelledby="jpChangeJeuTitle">'
      + '<header class="jp-studio-sheet-head"><h2 id="jpChangeJeuTitle">Changer le jeu</h2>'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close aria-label="Fermer">×</button></header>'
      + '<div class="jp-jeu-change-body">'
      + '<p class="jp-muted jp-jeu-change-hint">Choisissez un jeu existant du parcours (code JP-***** ou titre).</p>'
      + '<div class="jp-field"><label for="jpChangeJeuTa">Jeu</label><div id="jpChangeJeuTa"></div></div>'
      + '</div>'
      + '<footer class="jp-studio-sheet-foot jp-jeu-pick-actions">'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close>Annuler</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="jpChangeJeuOk" disabled>Lier à ce bloc</button>'
      + '</footer></div>';
    document.body.appendChild(overlay);

    let picked = null;
    const close = () => overlay.remove();
    overlay.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', close));
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });

    const okBtn = overlay.querySelector('#jpChangeJeuOk');
    const initial = items.find((it) => it.id === curId) || null;
    if (initial) picked = initial;
    global.JpTypeahead.combo(overlay.querySelector('#jpChangeJeuTa'), {
      search: global.JpTypeahead.localSource(items, { limit: 15 }),
      placeholder: items.length ? 'Code JP-***** ou titre…' : 'Aucun jeu actif dans ce parcours',
      ariaLabel: 'Choisir un jeu',
      emptyText: 'Aucun jeu trouvé',
      initial,
      onChange: (it) => {
        picked = it;
        okBtn.disabled = !it || it.id === curId;
      },
    });

    okBtn.addEventListener('click', async () => {
      if (!picked?.modele || picked.id === curId) return;
      okBtn.disabled = true;
      try {
        await lierModeleAuBloc(blocId, picked.modele);
        close();
        state.blocs = await loadBlocs(m.id, { force: true });
        rememberBlocsCache(m.id, state.blocs);
        selectBloc(blocId, { toContenu: true, inspectorTab: 'bloc' });
        await refreshJeuxLies(m);
        global.JpToast?.ok?.('Jeu lié au bloc');
      } catch (e) {
        okBtn.disabled = false;
        global.JpToast?.fromError?.(e);
      }
    });
  }

  async function openJeuWizard(extra) {
    const m = selectedModule();
    if (!m || m.est_groupe) return;
    await flushAll();
    const editId = extra && extra.modeleId;
    const linkBlocId = (!editId && extra && extra.blocId) || null;
    const editBlocId = (editId && extra && extra.blocId) || null;
    const insertAfterId = (!editId && !linkBlocId) ? state.selectedBlocId : null;
    await global.JpStudioJeuWizard.open({
      parcoursId: state.parcoursId,
      moduleId: m.id,
      modules: state.modules,
      defaultTitre: 'Jeu — ' + m.titre,
      modeleId: editId || undefined,
      blocId: linkBlocId || undefined,
      insertAfterBlocId: insertAfterId || undefined,
      onUpdated: async (res) => {
        try {
          const modele = res && res.modele;
          if (modele && modele.id) {
            const bloc = (editBlocId && state.blocs.find((x) => x.id === editBlocId))
              || state.blocs.find((b) => b.type_bloc === 'jeu'
                && effPayload(b).modele_id === modele.id);
            if (bloc) await lierModeleAuBloc(bloc.id, modele);
          }
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
        state.blocs = await loadBlocs(m.id, { force: true });
        rememberBlocsCache(m.id, state.blocs);
        const focusId = editBlocId
          || (res?.modele?.id
            && (state.blocs.find((b) => b.type_bloc === 'jeu' && effPayload(b).modele_id === res.modele.id)?.id));
        if (focusId) selectBloc(focusId, { inspectorTab: 'bloc' });
        else paintBlocks();
        await refreshJeuxLies(m);
      },
      onCreated: async (res) => {
        try {
          if (res?.linked && res?.blocId && res?.modele) {
            await lierModeleAuBloc(res.blocId, res.modele);
          } else if (res?.bloc?.id) {
            // Nouveau bloc : masqué jusqu’à la publication.
            await rpc('v2_upsert_bloc', { p_payload: { id: res.bloc.id, visible: false } });
            const afterId = insertAfterId || res.insertAfterBlocId || null;
            if (afterId) {
              state.blocs = await loadBlocs(m.id, { force: true });
              const ids = state.blocs.map((b) => b.id).filter((id) => id !== res.bloc.id);
              const idx = ids.indexOf(afterId);
              if (idx >= 0) ids.splice(idx + 1, 0, res.bloc.id);
              else ids.push(res.bloc.id);
              await applyBlocOrder(ids);
            }
          }
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
        state.blocs = await loadBlocs(m.id, { force: true });
        rememberBlocsCache(m.id, state.blocs);
        const focusId = (res?.linked && res?.blocId) || res?.bloc?.id || null;
        if (focusId) selectBloc(focusId, { toContenu: true, inspectorTab: 'bloc' });
        else paintBlocks();
        await refreshJeuxLies(m);
      },
    });
  }

  global.JpStudioParcours = { boot };
})(window);
