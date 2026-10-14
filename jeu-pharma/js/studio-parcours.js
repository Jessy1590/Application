/**
 * Studio parcours — arbre + canvas blocs + programme + jeux (modules dédiés).
 *
 * Modèle brouillon / publié (sans migration) :
 *  - Le contenu publié d’un bloc = `payload_json` (clés sans « _ ») + `titre` : c’est ce que voient les joueurs.
 *  - Toute modification est enregistrée automatiquement (debounce) dans `payload_json._brouillon = { titre, payload }`.
 *  - Un bloc créé reste masqué (`visible = false`) jusqu’à la publication.
 *  - « Enregistrer et publier » : copie les brouillons vers le contenu publié, rend les blocs visibles
 *    et passe la leçon en `publie = true / statut = 'publie'`. Une leçon neuve est créée en brouillon.
 *  - Le programme (valeurs de fiche, `publications_connaissances`) reste géré dans le sélecteur de molécules.
 */
(function (global) {
  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }

  const AUTOSAVE_MS = 900;
  const TYPE_LABELS = {
    texte: 'Texte', video: 'Vidéo', photo: 'Photo', molecule: 'Molécules',
    conseil: 'Conseil', recommandation: 'Recommandation', jeu: 'Jeu',
  };

  const state = {
    parcoursId: null,
    parcours: null,
    modules: [],
    selectedModuleId: null,
    blocs: [],
    pending: null, // { moduleId, blocId } depuis l'URL
    focusBlocId: null,
    editors: {}, // blocId:field -> richtext instance
    molChips: {}, // blocId -> instance chips
    molLabels: {}, // matriceId -> { label, sub }
    timers: {}, // blocId -> timeout autosave
    chain: {}, // blocId -> promesse de sauvegarde (sérialisée)
    inflight: 0,
    saveError: false,
    lastSavedAt: null,
  };

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function loadParcoursList() {
    const { data, error } = await sb()
      .from('parcours_apprentissage')
      .select('id, code, libelle, mode_contenu, ordre, actif, prerequis_parcours_id, criteres_json')
      .eq('actif', true)
      .order('ordre');
    if (error) throw error;
    return data || [];
  }

  async function loadModules(parcoursId) {
    const { data, error } = await sb()
      .from('modules_cours')
      .select('id, parcours_id, parent_id, code, titre, resume, objectifs, ordre, publie, est_groupe, prerequis_module_id, criteres_json, icone, couleur_accent, couverture_url, statut')
      .eq('parcours_id', parcoursId)
      .order('ordre');
    if (error) throw error;
    return data || [];
  }

  async function loadBlocs(moduleId) {
    const data = await rpc('v2_lister_blocs', { p_module_id: moduleId });
    return Array.isArray(data) ? data : [];
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
    Object.values(state.editors).forEach((ed) => ed?.destroy?.());
    state.editors = {};
    state.molChips = {};
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

  function matriceIdsOf(payload) {
    if (Array.isArray(payload.matrice_ids) && payload.matrice_ids.length) return payload.matrice_ids.filter(Boolean);
    return payload.matrice_id ? [payload.matrice_id] : [];
  }

  /* ——— Statut d’enregistrement (chip en haut) ——— */

  function updateStatus() {
    const chip = document.getElementById('draftChip');
    const btn = document.getElementById('btnPublish');
    const m = selectedModule();
    const lesson = m && !m.est_groupe;
    if (btn) btn.disabled = !lesson || state.inflight > 0;
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
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnPreview">Aperçu</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnParcoursCfg" title="Prérequis et validation du parcours">Réglages du parcours</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnNewParcours">Nouveau parcours</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnPublish" disabled>Enregistrer et publier</button>'
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
    const combo = global.JpTypeahead.combo(root.querySelector('#parcoursCombo'), {
      search: global.JpTypeahead.localSource(items, { limit: 10 }),
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
    combo.input.addEventListener('blur', () => {
      // champ laissé sans choix : on réaffiche le parcours courant
      setTimeout(() => { if (!combo.getItem() && current) combo.setItem(current, true); }, 120);
    });
    root.querySelector('#btnNewParcours').addEventListener('click', () => void createParcours());
    root.querySelector('#btnParcoursCfg').addEventListener('click', () => void openParcoursCfg());
    root.querySelector('#btnPublish').addEventListener('click', () => void publishLesson());
    root.querySelector('#btnPreview').addEventListener('click', async () => {
      const m = selectedModule();
      if (!m || m.est_groupe) return global.JpToast?.warn?.('Choisir une leçon');
      await flushAll();
      window.open('../lecon.html?module=' + encodeURIComponent(m.id) + '&preview=1', '_blank');
    });

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
      onSaved: async () => { state.parcoursList = await loadParcoursList(); },
    });
  }

  /** Panneau « Déblocage » (prérequis + critères) dans l’inspecteur ; recharge l’arbre après enregistrement. */
  function mountDeblocage(m) {
    const host = document.getElementById('unlockHost');
    if (!host || !global.JpStudioDeblocage) return;
    void global.JpStudioDeblocage.mountModule(host, {
      module: m,
      modules: state.modules,
      parcoursId: state.parcoursId,
      onSaved: async () => {
        state.modules = await loadModules(state.parcoursId);
        const fresh = state.modules.find((x) => x.id === m.id);
        if (fresh) Object.assign(m, fresh);
      },
    });
  }

  async function createParcours() {
    const libelle = prompt('Nom du parcours');
    if (!libelle) return;
    try {
      await flushAll();
      const row = await rpc('v2_creer_parcours', {
        p_payload: { libelle, mode_contenu: 'publications', niveau_lie: 'apprenti' },
      });
      global.JpToast?.ok?.('Créé');
      location.search = '?parcours=' + encodeURIComponent(row.id);
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  async function selectParcours(id) {
    state.parcoursId = id;
    const list = await loadParcoursList();
    state.parcours = list.find((p) => p.id === id) || null;
    state.parcoursList = list;
    document.title = (state.parcours?.libelle ? state.parcours.libelle + ' — ' : '') + 'Modif parcours';
    state.modules = await loadModules(id);
    const pend = state.pending;
    state.pending = null;
    const wanted = pend?.moduleId && state.modules.some((m) => m.id === pend.moduleId) ? pend.moduleId : null;
    state.focusBlocId = wanted ? (pend.blocId || null) : null;
    state.selectedModuleId = wanted || childrenOf(null)[0]?.id || state.modules[0]?.id || null;
    renderTree();
    await selectModule(state.selectedModuleId);
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
    const titre = prompt(est_groupe ? 'Chapitre' : 'Leçon');
    if (!titre) return;
    const parent = selectedModule();
    const parentId = parent?.est_groupe ? parent.id : (parent?.parent_id || null);
    try {
      await flushAll();
      // Une leçon neuve est un brouillon (invisible) jusqu’à « Enregistrer et publier » ; un chapitre n’est qu’un conteneur.
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
    state.selectedModuleId = id;
    renderTree();
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
    await preloadMolLabels();
    renderCanvas(m);
    await renderInspector(m);
    updateStatus();
  }

  function renderCanvas(m) {
    const pane = document.getElementById('canvasPane');
    pane.innerHTML = '<div class="jp-studio-canvas-head">'
      + '<h2 class="jp-studio-h2">' + esc(m.titre) + '</h2></div>'
      + '<div class="jp-add-blocks" id="addBlocks"><span class="jp-add-blocks-label">Ajouter</span>'
      + ['texte', 'video', 'photo', 'molecule', 'conseil', 'recommandation', 'jeu'].map((t) =>
        '<button type="button" class="jp-btn jp-btn-ghost" data-add="' + t + '">+ ' + TYPE_LABELS[t] + '</button>'
      ).join('')
      + '</div><p class="jp-studio-autosave-hint">Les modifications sont enregistrées automatiquement en brouillon. '
      + 'Les joueurs ne voient le nouveau contenu qu’après « Enregistrer et publier ».</p>'
      + '<div id="blocksList"></div>';
    pane.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => void addBloc(btn.getAttribute('data-add')));
    });
    paintBlocks();
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
    cards.forEach((card, i) => {
      const up = card.querySelector('[data-bloc-up]');
      const down = card.querySelector('[data-bloc-down]');
      if (up) up.disabled = i === 0;
      if (down) down.disabled = i === cards.length - 1;
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

  /* ——— Rendu des blocs ——— */

  function paintBlocks() {
    clearEditors();
    const list = document.getElementById('blocksList');
    if (!list) return;
    if (!state.blocs.length) {
      list.innerHTML = '<p class="jp-muted jp-studio-empty">Aucun bloc — utilisez « Ajouter » ci-dessus.</p>';
      updateStatus();
      return;
    }

    list.innerHTML = state.blocs.map((b, i) => {
      const p = effPayload(b);
      let body = '';
      if (b.type_bloc === 'texte') {
        body = '<div class="jp-rte-host" data-rte="' + b.id + '" data-field="html"></div>';
      } else if (b.type_bloc === 'video') {
        body = '<div class="jp-field jp-field-tight"><label>Lien de la vidéo</label>'
          + '<input data-field="url" data-id="' + b.id + '" value="' + esc(p.url || '') + '" placeholder="URL YouTube / Vimeo / .mp4"></div>'
          + (p.url ? videoEmbed(p.url) : '');
      } else if (b.type_bloc === 'photo') {
        body = '<input type="hidden" data-field="path" data-id="' + b.id + '" value="' + esc(p.path || '') + '">'
          + '<div class="jp-photo-prev" data-photo-prev="' + b.id + '"></div>'
          + '<div class="jp-photo-actions">'
          + '<label class="jp-btn jp-btn-ghost jp-photo-pick">Téléverser une photo'
          + '<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-photo-file="' + b.id + '" hidden></label>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-photo-clear="' + b.id + '">Retirer la photo</button>'
          + '<small class="jp-field-hint">JPEG, PNG, WebP ou GIF — 5 Mo max.</small></div>'
          + '<div class="jp-field jp-field-tight"><label>… ou lien de l’image (https)</label>'
          + '<input data-field="url" data-id="' + b.id + '" value="' + esc(p.url || '') + '" placeholder="https://…/photo.jpg"></div>'
          + '<div class="jp-field jp-field-tight"><label>Texte alternatif (accessibilité)</label>'
          + '<input data-field="alt" data-id="' + b.id + '" value="' + esc(p.alt || '') + '" placeholder="Décrivez l’image"></div>'
          + '<div class="jp-field jp-field-tight"><label>Légende (facultatif)</label>'
          + '<input data-field="legende" data-id="' + b.id + '" value="' + esc(p.legende || '') + '" placeholder="Ex. Frottis sanguin"></div>';
      } else if (b.type_bloc === 'molecule') {
        body = '<div class="jp-field jp-field-tight"><label>Molécules de ce bloc</label>'
          + '<div class="jp-mol-multi" data-mol-multi="' + b.id + '"></div>'
          + '<small class="jp-field-hint">Tapez une DCI ou un nom commercial, plusieurs molécules possibles. '
          + 'Les valeurs de fiche affichées se règlent dans le programme de la leçon.</small></div>'
          + '<div class="jp-mol-bloc-actions">'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-mol-from-prog="' + b.id + '">+ Molécules du programme</button>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-mol-prog="' + b.id + '">Valeurs affichées…</button>'
          + '</div>';
      } else if (b.type_bloc === 'conseil') {
        body = '<div class="jp-field jp-field-tight"><label>Pathologie</label>'
          + '<input data-field="pathologie" data-id="' + b.id + '" value="' + esc(p.pathologie || '') + '" placeholder="Ex. Anémie ferriprive"></div>'
          + '<div class="jp-rte-host" data-rte="' + b.id + '" data-field="corps_html"></div>';
      } else if (b.type_bloc === 'recommandation') {
        const others = state.blocs.filter((x) => x.id !== b.id);
        const opts = '<option value="">— Aucun bloc cible —</option>'
          + others.map((x) => {
            const lab = effTitre(x) || TYPE_LABELS[x.type_bloc] || x.type_bloc;
            return '<option value="' + esc(x.id) + '"' + (String(p.lien_bloc_id || '') === String(x.id) ? ' selected' : '') + '>'
              + esc(lab) + '</option>';
          }).join('');
        body = '<div class="jp-rte-host" data-rte="' + b.id + '" data-field="corps_html"></div>'
          + '<fieldset class="jp-reco-link-fieldset"><legend>Lien / contexte (facultatif)</legend>'
          + '<div class="jp-field jp-field-tight"><label>Pointer vers un bloc de cette leçon</label>'
          + '<select data-field="lien_bloc_id" data-id="' + b.id + '">' + opts + '</select>'
          + '<small class="jp-field-hint">Ancre dans le document — le joueur reste sur la leçon.</small></div>'
          + '<div class="jp-field jp-field-tight"><label>… ou UUID d’une autre leçon</label>'
          + '<input data-field="lien_module_id" data-id="' + b.id + '" value="' + esc(p.lien_module_id || '') + '" placeholder="module_id"></div>'
          + '<div class="jp-field jp-field-tight"><label>… ou URL (https ou lecon.html?…)</label>'
          + '<input data-field="lien_href" data-id="' + b.id + '" value="' + esc(p.lien_href || '') + '" placeholder="lecon.html?module=… ou https://…"></div>'
          + '<div class="jp-field jp-field-tight"><label>Libellé du lien</label>'
          + '<input data-field="lien_label" data-id="' + b.id + '" value="' + esc(p.lien_label || '') + '" placeholder="Ex. Reprendre la section hémostase"></div>'
          + '</fieldset>';
      } else if (b.type_bloc === 'jeu') {
        body = '<p class="jp-bloc-jeu-line"><code>' + esc(p.code_unique || '—') + '</code>'
          + (p.type_jeu ? '<span class="jp-bloc-jeu-type">' + esc(p.type_jeu) + '</span>' : '') + '</p>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-edit-jeu="' + b.id + '">Remplacer / nouveau jeu</button>';
      }
      const tag = hasPending(b) ? '<span class="jp-bloc-tag" title="Pas encore publié">' + (isHidden(b) ? 'nouveau' : 'brouillon') + '</span>' : '';
      const upDis = i === 0 ? ' disabled' : '';
      const downDis = i === state.blocs.length - 1 ? ' disabled' : '';
      return '<article class="jp-block-card" data-bloc="' + b.id + '">'
        + '<header>'
        + '<span class="jp-block-tools" aria-label="Ordre du bloc">'
        + '<button type="button" class="jp-block-tool jp-block-drag" draggable="true" data-drag-bloc="' + b.id + '"'
        + ' title="Glisser pour réordonner" aria-label="Glisser pour réordonner">⠿</button>'
        + '<button type="button" class="jp-block-tool" data-bloc-up="' + b.id + '"' + upDis
        + ' title="Monter le bloc" aria-label="Monter le bloc">↑</button>'
        + '<button type="button" class="jp-block-tool" data-bloc-down="' + b.id + '"' + downDis
        + ' title="Descendre le bloc" aria-label="Descendre le bloc">↓</button>'
        + '</span>'
        + '<span class="jp-block-type">' + esc(TYPE_LABELS[b.type_bloc] || b.type_bloc) + '</span>'
        + '<input class="jp-block-title" data-field="titre" data-id="' + b.id + '" value="' + esc(effTitre(b)) + '" placeholder="Titre du bloc (facultatif)" aria-label="Titre du bloc">'
        + tag
        + '<button type="button" class="jp-block-del" data-del="' + b.id + '" title="Supprimer le bloc" aria-label="Supprimer le bloc">×</button></header>'
        + '<div class="jp-block-body">' + body + '</div></article>';
    }).join('');

    list.querySelectorAll('[data-rte]').forEach((host) => {
      const id = host.getAttribute('data-rte');
      const field = host.getAttribute('data-field') || 'html';
      const b = state.blocs.find((x) => x.id === id);
      const html = effPayload(b)[field] || '';
      state.editors[id + ':' + field] = global.JpStudioRichtext.mount(host, html, { onChange: () => scheduleSave(id) });
    });

    list.querySelectorAll('[data-mol-multi]').forEach((host) => {
      const id = host.getAttribute('data-mol-multi');
      const b = state.blocs.find((x) => x.id === id);
      const initial = matriceIdsOf(effPayload(b)).map(molItem);
      state.molChips[id] = global.JpTypeahead.chips(host, {
        search: global.JpTypeahead.matriceSource({ limit: 15 }),
        minChars: 1,
        placeholder: 'Ajouter une molécule…',
        ariaLabel: 'Ajouter une molécule',
        initial,
        chipEditHref: referentielEditHref,
        onChange: (items) => {
          items.forEach((it) => { state.molLabels[it.id] = { label: it.label, sub: it.sub || '' }; });
          scheduleSave(id);
        },
      });
    });

    // Auto-enregistrement : saisie dans titre / champs (les éditeurs riches et chips notifient eux-mêmes)
    list.querySelectorAll('.jp-block-card').forEach((card) => {
      const id = card.getAttribute('data-bloc');
      card.querySelectorAll('input[data-field], select[data-field]').forEach((inp) => {
        const ev = inp.tagName === 'SELECT' ? 'change' : 'input';
        inp.addEventListener(ev, () => {
          if (card.querySelector('[data-photo-prev]')) paintPhotoPreview(card);
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
    });

    list.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => confirmDeleteBloc(btn.getAttribute('data-del')));
    });
    list.querySelectorAll('[data-mol-prog]').forEach((btn) => {
      btn.addEventListener('click', () => void openProgramme());
    });
    list.querySelectorAll('[data-mol-from-prog]').forEach((btn) => {
      btn.addEventListener('click', () => void addFromProgramme(btn.getAttribute('data-mol-from-prog')));
    });
    list.querySelectorAll('[data-edit-jeu]').forEach((btn) => {
      btn.addEventListener('click', () => void openJeuWizard());
    });
    bindBlockReorder(list);

    if (state.focusBlocId) {
      const card = list.querySelector('[data-bloc="' + state.focusBlocId + '"]');
      state.focusBlocId = null;
      if (card) {
        card.classList.add('is-focus');
        card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
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
    if (type === 'texte') return { html: rte('html') };
    if (type === 'video') return { url: val('url') };
    if (type === 'photo') return { path: val('path'), url: val('url'), alt: val('alt'), legende: val('legende') };
    if (type === 'molecule') {
      const ids = state.molChips[blocId]?.getIds?.() || matriceIdsOf(effPayload(b));
      return { matrice_ids: ids, matrice_id: ids[0] || '', mode: 'fiche' };
    }
    if (type === 'conseil') return { pathologie: val('pathologie'), corps_html: rte('corps_html') };
    if (type === 'recommandation') {
      return {
        corps_html: rte('corps_html'),
        lien_bloc_id: val('lien_bloc_id'),
        lien_module_id: val('lien_module_id'),
        lien_parcours_id: val('lien_parcours_id'),
        lien_href: val('lien_href'),
        lien_label: val('lien_label'),
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
      const titre = card.querySelector('[data-field="titre"]')?.value || '';
      const payload = collectPayload(blocId, b.type_bloc);
      const pub = pubPayload(b);
      const same = JSON.stringify(payload) === JSON.stringify(pub) && titre === (b.titre || '');
      const pj = Object.assign({}, pub);
      if (!same || isHidden(b)) pj._brouillon = { titre, payload };
      state.inflight += 1;
      updateStatus();
      try {
        const row = await rpc('v2_upsert_bloc', { p_payload: { id: blocId, payload_json: pj } });
        b.payload_json = row.payload_json;
        b.updated_at = row.updated_at;
        state.saveError = false;
        state.lastSavedAt = nowLabel();
        const tagHost = card.querySelector('header');
        if (tagHost && !tagHost.querySelector('.jp-bloc-tag') && hasPending(b)) {
          tagHost.querySelector('.jp-block-del')?.insertAdjacentHTML('beforebegin',
            '<span class="jp-bloc-tag" title="Pas encore publié">' + (isHidden(b) ? 'nouveau' : 'brouillon') + '</span>');
        } else if (tagHost && !hasPending(b)) {
          tagHost.querySelector('.jp-bloc-tag')?.remove();
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
    const ids = Object.keys(state.timers);
    ids.forEach((id) => { clearTimeout(state.timers[id]); delete state.timers[id]; });
    ids.forEach((id) => { void saveDraft(id); });
    await Promise.all(Object.values(state.chain));
    updateStatus();
  }

  /* ——— Publication ——— */

  /** Fiches choisies dans un bloc molécule : si aucune valeur n’est au programme, tout publier (identité incluse). */
  async function ensureProgramme(m) {
    const ids = [];
    state.blocs.filter((b) => b.type_bloc === 'molecule').forEach((b) => {
      matriceIdsOf(effPayload(b)).forEach((id) => { if (ids.indexOf(id) === -1) ids.push(id); });
    });
    for (const mid of ids) {
      const rows = await rpc('v2_lister_connaissances_matrice', { p_matrice_id: mid, p_module_id: m.id });
      const list = Array.isArray(rows) ? rows : [];
      if (!list.length || list.some((r) => r.publie)) continue;
      await rpc('v2_publier_connaissances', {
        p_module_id: m.id,
        p_connaissance_ids: list.map((r) => r.connaissance_id),
      });
    }
  }

  async function publishLesson() {
    const m = selectedModule();
    if (!m || m.est_groupe) return;
    const btn = document.getElementById('btnPublish');
    if (btn) btn.disabled = true;
    try {
      await flushAll();
      await ensureProgramme(m);
      for (const b of state.blocs.filter(hasPending)) {
        await rpc('v2_upsert_bloc', {
          p_payload: { id: b.id, titre: effTitre(b), payload_json: effPayload(b), visible: true },
        });
      }
      await rpc('v2_upsert_module', { p_payload: { id: m.id, publie: true, statut: 'publie' } });
      state.modules = await loadModules(state.parcoursId);
      state.blocs = await loadBlocs(m.id);
      state.lastSavedAt = null;
      state.saveError = false;
      renderTree();
      paintBlocks();
      global.JpToast?.ok?.('Leçon publiée');
      void global.JpLogs?.action?.('studio_publier_lecon', { module_id: m.id });
    } catch (e) {
      global.JpToast?.fromError?.(e);
    } finally {
      updateStatus();
    }
  }

  /** `v2_publier_connaissances` force `publie = true` sur la leçon : on rétablit le brouillon si besoin. */
  async function keepDraftState(m, wasDraft) {
    if (!wasDraft) return;
    await rpc('v2_upsert_module', { p_payload: { id: m.id, publie: false, statut: 'brouillon' } });
    state.modules = await loadModules(state.parcoursId);
    renderTree();
    updateStatus();
  }

  /* ——— Actions blocs ——— */

  async function openProgramme(afterApplied) {
    const m = selectedModule();
    if (!m) return;
    const wasDraft = isModuleDraft(m);
    await global.JpStudioMolPicker.open({
      moduleId: m.id,
      onApplied: async () => {
        try { await keepDraftState(m, wasDraft); } catch (e) { global.JpToast?.fromError?.(e); }
        if (afterApplied) await afterApplied();
      },
    });
  }

  async function addFromProgramme(blocId) {
    const m = selectedModule();
    const chips = state.molChips[blocId];
    if (!m || !chips) return;
    try {
      const { data, error } = await sb()
        .from('publications_connaissances')
        .select('connaissances!inner(matrice_id)')
        .eq('module_id', m.id)
        .eq('actif', true);
      if (error) throw error;
      const ids = [];
      (data || []).forEach((p) => {
        const id = p.connaissances?.matrice_id;
        if (id && ids.indexOf(id) === -1) ids.push(id);
      });
      const have = new Set(chips.getIds().map(String));
      const toAdd = ids.filter((id) => !have.has(String(id)));
      if (!toAdd.length) return global.JpToast?.warn?.(ids.length ? 'Déjà toutes présentes' : 'Aucune molécule au programme');
      await describeMatrices(toAdd);
      toAdd.forEach((id) => chips.add(molItem(id)));
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
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
      const initial = type === 'texte' ? { html: '<p></p>' }
        : (type === 'conseil' ? { pathologie: '', corps_html: '<p></p>' }
          : (type === 'recommandation' ? {
            corps_html: '<p></p>',
            lien_bloc_id: '',
            lien_module_id: '',
            lien_parcours_id: '',
            lien_href: '',
            lien_label: '',
          }
            : (type === 'molecule' ? { matrice_ids: [], mode: 'fiche' } : {})));
      const row = await rpc('v2_upsert_bloc', {
        p_payload: {
          module_id: m.id,
          type_bloc: type,
          ordre: (state.blocs.length + 1) * 10,
          payload_json: initial,
          visible: false, // brouillon : masqué pour les joueurs jusqu’à « Enregistrer et publier »
        },
      });
      state.blocs.push(row);
      paintBlocks();
      const card = document.querySelector('[data-bloc="' + row.id + '"]');
      card?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      (state.molChips[row.id]?.input || card?.querySelector('input[data-field], .jp-rte-surface'))?.focus?.();
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
      paintBlocks();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  function renderInspectorMeta(m) {
    const pane = document.getElementById('inspectorPane');
    pane.innerHTML = '<strong class="jp-inspector-title">Propriétés</strong>'
      + '<div class="jp-field"><label for="metaTitre">Titre</label><input id="metaTitre" value="' + esc(m.titre) + '"></div>'
      + '<div class="jp-field"><label for="metaResume">Résumé</label><textarea id="metaResume" rows="3">' + esc(m.resume || '') + '</textarea></div>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnSaveMeta">Enregistrer</button>'
      + '<div class="jp-inspector-cta jp-unlock" id="unlockHost"></div>';
    mountDeblocage(m);
    pane.querySelector('#btnSaveMeta').addEventListener('click', async () => {
      try {
        await rpc('v2_upsert_module', {
          p_payload: {
            id: m.id,
            titre: pane.querySelector('#metaTitre').value,
            resume: pane.querySelector('#metaResume').value,
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

  async function countProgramme(moduleId) {
    const { data } = await sb()
      .from('publications_connaissances')
      .select('connaissance_id, connaissances!inner(matrice_id)')
      .eq('module_id', moduleId)
      .eq('actif', true);
    const mats = new Set();
    (data || []).forEach((p) => {
      if (p.connaissances?.matrice_id) mats.add(p.connaissances.matrice_id);
    });
    return { connaissances: (data || []).length, molecules: mats.size };
  }

  async function renderInspector(m) {
    const pane = document.getElementById('inspectorPane');
    const stats = await countProgramme(m.id);
    pane.innerHTML = '<div class="jp-inspector-cta">'
      + '<div class="jp-inspector-head"><strong class="jp-inspector-title">Programme</strong><span id="helpProg"></span></div>'
      + '<p class="jp-muted" id="progStats" style="margin:0">' + stats.molecules + ' molécule(s) · '
      + stats.connaissances + ' valeur(s)</p>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnOpenMol">Sélectionner les molécules</button>'
      + '</div>'
      + '<div class="jp-inspector-cta">'
      + '<strong class="jp-inspector-title">Jeux</strong>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnNewJeu">Créer un jeu</button>'
      + '<div id="jeuxLies"></div>'
      + '</div>'
      + '<div class="jp-inspector-cta jp-unlock" id="unlockHost"></div>';
    mountDeblocage(m);

    pane.querySelector('#helpProg').appendChild(
      global.JpModal.helpButton('Programme', [
        'Ouvrez le sélecteur pour chercher parmi tout le catalogue.',
        'Pour chaque molécule, affichez ou masquez chaque valeur (ex. une seule indication).',
        'Le programme s’applique tout de suite ; le contenu des blocs, lui, ne devient visible qu’après « Enregistrer et publier ».',
      ])
    );

    pane.querySelector('#btnOpenMol').addEventListener('click', () => {
      void openProgramme(async () => {
        const s = await countProgramme(m.id);
        const el = document.getElementById('progStats');
        if (el) el.textContent = s.molecules + ' molécule(s) · ' + s.connaissances + ' valeur(s)';
      });
    });
    pane.querySelector('#btnNewJeu').addEventListener('click', () => void openJeuWizard());
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
    box.innerHTML = rows.map((r) =>
      '<div class="jp-list-row" style="margin-top:0.4rem"><span><code>' + esc(r.code_unique)
      + '</code><br>' + esc(r.titre) + '</span></div>'
    ).join('') || '<p class="jp-muted" style="margin:0.5rem 0 0">Aucun</p>';
  }

  async function openJeuWizard() {
    const m = selectedModule();
    if (!m || m.est_groupe) return;
    await flushAll();
    await global.JpStudioJeuWizard.open({
      parcoursId: state.parcoursId,
      moduleId: m.id,
      modules: state.modules,
      defaultTitre: 'Jeu — ' + m.titre,
      onCreated: async (res) => {
        try {
          // Le bloc jeu suit le même cycle que les autres : masqué jusqu’à la publication.
          if (res?.bloc?.id) {
            await rpc('v2_upsert_bloc', { p_payload: { id: res.bloc.id, visible: false } });
          }
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
        state.blocs = await loadBlocs(m.id);
        paintBlocks();
        await refreshJeuxLies(m);
      },
    });
  }

  global.JpStudioParcours = { boot };
})(window);
