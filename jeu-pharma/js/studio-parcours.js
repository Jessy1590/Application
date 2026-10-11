/**
 * Studio parcours — arbre + canvas blocs + programme + jeux (modules dédiés).
 */
(function (global) {
  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }

  const state = {
    parcoursId: null,
    parcours: null,
    modules: [],
    selectedModuleId: null,
    blocs: [],
    pending: null, // { moduleId, blocId } depuis l'URL
    focusBlocId: null,
    editors: {}, // blocId -> richtext instance
  };

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    return data;
  }

  async function loadParcoursList() {
    const { data, error } = await sb()
      .from('parcours_apprentissage')
      .select('id, code, libelle, mode_contenu, ordre, actif')
      .eq('actif', true)
      .order('ordre');
    if (error) throw error;
    return data || [];
  }

  async function loadModules(parcoursId) {
    const { data, error } = await sb()
      .from('modules_cours')
      .select('id, parcours_id, parent_id, code, titre, resume, objectifs, ordre, publie, est_groupe, prerequis_module_id, icone, couleur_accent, couverture_url, statut')
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

  function clearEditors() {
    Object.values(state.editors).forEach((ed) => ed?.destroy?.());
    state.editors = {};
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
      + '<h1 id="studioTitle">Studio</h1>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnPreview">Aperçu</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnNewParcours">Nouveau</button>'
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
        void selectParcours(it.id);
      },
    });
    combo.input.addEventListener('blur', () => {
      // champ laissé sans choix : on réaffiche le parcours courant
      setTimeout(() => { if (!combo.getItem() && current) combo.setItem(current, true); }, 120);
    });
    root.querySelector('#btnNewParcours').addEventListener('click', () => void createParcours());
    root.querySelector('#btnPreview').addEventListener('click', () => {
      const m = selectedModule();
      if (!m || m.est_groupe) return global.JpToast?.warn?.('Choisir une leçon');
      window.open('../lecon.html?module=' + encodeURIComponent(m.id) + '&preview=1', '_blank');
    });

    if (initial) await selectParcours(initial.id);
    else root.querySelector('#treePane').innerHTML = '<p class="jp-muted">Aucun parcours</p>';
  }

  async function createParcours() {
    const libelle = prompt('Nom du parcours');
    if (!libelle) return;
    try {
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
    document.getElementById('studioTitle').textContent = state.parcours?.libelle || 'Studio';
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
      return childrenOf(parentId).map((m) => {
        const kids = renderNode(m.id, depth + 1);
        return '<div>'
          + '<button type="button" class="jp-tree-item' + (m.est_groupe ? ' is-group' : '')
          + (m.id === state.selectedModuleId ? ' is-active' : '') + '" data-id="' + m.id + '" style="padding-left:' + (0.5 + depth * 0.65) + 'rem">'
          + esc(m.titre)
          + (m.statut === 'brouillon' || !m.publie ? ' ·' : '')
          + '</button>'
          + (kids ? '<div class="jp-tree-children">' + kids + '</div>' : '')
          + '</div>';
      }).join('');
    }
    pane.innerHTML = '<div style="display:flex;gap:0.35rem;margin-bottom:0.65rem;flex-wrap:wrap">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnAddChapitre">Chapitre</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnAddLecon">Leçon</button>'
      + '</div>'
      + renderNode(null, 0);

    pane.querySelectorAll('[data-id]').forEach((btn) => {
      btn.addEventListener('click', () => void selectModule(btn.getAttribute('data-id')));
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
      const row = await rpc('v2_upsert_module', {
        p_payload: {
          parcours_id: state.parcoursId,
          parent_id: parentId,
          titre,
          est_groupe: !!est_groupe,
          publie: true,
          statut: 'publie',
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

  async function selectModule(id) {
    state.selectedModuleId = id;
    renderTree();
    const m = selectedModule();
    if (!m) {
      clearEditors();
      document.getElementById('canvasPane').innerHTML = '';
      document.getElementById('inspectorPane').innerHTML = '';
      return;
    }
    if (m.est_groupe) {
      state.blocs = [];
      clearEditors();
      document.getElementById('canvasPane').innerHTML = '<h2 class="jp-title" style="font-size:1.35rem;margin:0 0 0.5rem">'
        + esc(m.titre) + '</h2><p class="jp-muted">Chapitre — ajoutez des leçons.</p>';
      renderInspectorMeta(m);
      return;
    }
    state.blocs = await loadBlocs(m.id);
    renderCanvas(m);
    await renderInspector(m);
  }

  function renderCanvas(m) {
    const pane = document.getElementById('canvasPane');
    pane.innerHTML = '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem">'
      + '<h2 class="jp-title" style="font-size:1.35rem;margin:0;flex:1">' + esc(m.titre) + '</h2></div>'
      + '<div class="jp-add-blocks" id="addBlocks">'
      + ['texte', 'video', 'molecule', 'conseil', 'jeu'].map((t) =>
        '<button type="button" class="jp-btn jp-btn-ghost" data-add="' + t + '">' + t + '</button>'
      ).join('')
      + '</div><div id="blocksList"></div>';
    pane.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => void addBloc(btn.getAttribute('data-add')));
    });
    paintBlocks();
  }

  function paintBlocks() {
    clearEditors();
    const list = document.getElementById('blocksList');
    if (!list) return;
    if (!state.blocs.length) {
      list.innerHTML = '<p class="jp-muted">Aucun bloc</p>';
      return;
    }

    list.innerHTML = state.blocs.map((b) => {
      const p = b.payload_json || {};
      let body = '';
      if (b.type_bloc === 'texte') {
        body = '<div class="jp-rte-host" data-rte="' + b.id + '" data-field="html"></div>';
      } else if (b.type_bloc === 'video') {
        body = '<input data-field="url" data-id="' + b.id + '" value="' + esc(p.url || '') + '" placeholder="URL YouTube / Vimeo" style="width:100%;margin-bottom:0.5rem">'
          + (p.url ? videoEmbed(p.url) : '');
      } else if (b.type_bloc === 'molecule') {
        body = '<p class="jp-muted" style="margin:0 0 0.5rem">' + (p.matrice_id
          ? ('Fiche : <code>' + esc(p.matrice_id) + '</code>')
          : 'Aucune molécule') + '</p>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-pick-mol-bloc="' + b.id + '">Choisir une molécule</button>';
      } else if (b.type_bloc === 'conseil') {
        body = '<input data-field="pathologie" data-id="' + b.id + '" value="' + esc(p.pathologie || '') + '" placeholder="Pathologie" style="width:100%;margin-bottom:0.5rem">'
          + '<div class="jp-rte-host" data-rte="' + b.id + '" data-field="corps_html"></div>';
      } else if (b.type_bloc === 'jeu') {
        body = '<p style="margin:0 0 0.35rem"><code>' + esc(p.code_unique || '—') + '</code>'
          + (p.type_jeu ? ' · ' + esc(p.type_jeu) : '') + '</p>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-edit-jeu="' + b.id + '">Remplacer / nouveau jeu</button>';
      }
      return '<article class="jp-block-card" data-bloc="' + b.id + '">'
        + '<header><span class="jp-block-type">' + esc(b.type_bloc) + '</span>'
        + '<input data-field="titre" data-id="' + b.id + '" value="' + esc(b.titre || '') + '" placeholder="Titre" style="flex:1">'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-save="' + b.id + '">OK</button>'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-del="' + b.id + '">×</button></header>'
        + body + '</article>';
    }).join('');

    list.querySelectorAll('[data-rte]').forEach((host) => {
      const id = host.getAttribute('data-rte');
      const field = host.getAttribute('data-field') || 'html';
      const b = state.blocs.find((x) => x.id === id);
      const html = (b?.payload_json || {})[field] || '';
      state.editors[id + ':' + field] = global.JpStudioRichtext.mount(host, html);
    });

    list.querySelectorAll('[data-save]').forEach((btn) => {
      btn.addEventListener('click', () => void saveBloc(btn.getAttribute('data-save')));
    });
    list.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => void deleteBloc(btn.getAttribute('data-del')));
    });
    list.querySelectorAll('[data-pick-mol-bloc]').forEach((btn) => {
      btn.addEventListener('click', () => void pickMoleculeForBloc(btn.getAttribute('data-pick-mol-bloc')));
    });
    list.querySelectorAll('[data-edit-jeu]').forEach((btn) => {
      btn.addEventListener('click', () => void openJeuWizard());
    });

    if (state.focusBlocId) {
      const card = list.querySelector('[data-bloc="' + state.focusBlocId + '"]');
      state.focusBlocId = null;
      if (card) {
        card.classList.add('is-focus');
        card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    }
  }

  function collectPayload(blocId, type) {
    const card = document.querySelector('[data-bloc="' + blocId + '"]');
    if (!card) return {};
    const val = (field) => card.querySelector('[data-field="' + field + '"]')?.value || '';
    const rte = (field) => state.editors[blocId + ':' + field]?.getHtml?.() || '';
    if (type === 'texte') return { html: rte('html') };
    if (type === 'video') return { url: val('url') };
    if (type === 'molecule') {
      const b = state.blocs.find((x) => x.id === blocId);
      return { matrice_id: b?.payload_json?.matrice_id || '', mode: 'fiche' };
    }
    if (type === 'conseil') return { pathologie: val('pathologie'), corps_html: rte('corps_html') };
    if (type === 'jeu') {
      const b = state.blocs.find((x) => x.id === blocId);
      return Object.assign({ libelle_cta: 'Jouer' }, b?.payload_json || {});
    }
    return {};
  }

  async function pickMoleculeForBloc(blocId) {
    const m = selectedModule();
    if (!m) return;
    await global.JpStudioMolPicker.open({
      moduleId: m.id,
      onApplied: async ({ matriceId }) => {
        const b = state.blocs.find((x) => x.id === blocId);
        if (!b) return;
        const payload = Object.assign({}, b.payload_json || {}, { matrice_id: matriceId, mode: 'fiche' });
        const row = await rpc('v2_upsert_bloc', { p_payload: { id: blocId, payload_json: payload } });
        Object.assign(b, row);
        paintBlocks();
        global.JpToast?.ok?.('Molécule liée');
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
    if (type === 'molecule') {
      try {
        const row = await rpc('v2_upsert_bloc', {
          p_payload: {
            module_id: m.id,
            type_bloc: 'molecule',
            ordre: (state.blocs.length + 1) * 10,
            payload_json: { mode: 'fiche' },
          },
        });
        state.blocs.push(row);
        paintBlocks();
        await pickMoleculeForBloc(row.id);
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
      return;
    }
    try {
      const row = await rpc('v2_upsert_bloc', {
        p_payload: {
          module_id: m.id,
          type_bloc: type,
          ordre: (state.blocs.length + 1) * 10,
          payload_json: type === 'texte' ? { html: '<p></p>' } : (type === 'conseil' ? { pathologie: '', corps_html: '<p></p>' } : {}),
        },
      });
      state.blocs.push(row);
      paintBlocks();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  async function saveBloc(id) {
    const b = state.blocs.find((x) => x.id === id);
    if (!b) return;
    const card = document.querySelector('[data-bloc="' + id + '"]');
    const titre = card?.querySelector('[data-field="titre"]')?.value || '';
    try {
      const row = await rpc('v2_upsert_bloc', {
        p_payload: { id, titre, payload_json: collectPayload(id, b.type_bloc) },
      });
      Object.assign(b, row);
      global.JpToast?.ok?.('Enregistré');
      paintBlocks();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  async function deleteBloc(id) {
    try {
      await rpc('v2_supprimer_bloc', { p_bloc_id: id });
      state.blocs = state.blocs.filter((b) => b.id !== id);
      paintBlocks();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  function renderInspectorMeta(m) {
    const pane = document.getElementById('inspectorPane');
    pane.innerHTML = '<strong>Propriétés</strong>'
      + '<div class="jp-field" style="margin-top:0.75rem"><label>Titre</label><input id="metaTitre" value="' + esc(m.titre) + '"></div>'
      + '<div class="jp-field"><label>Résumé</label><textarea id="metaResume" rows="3">' + esc(m.resume || '') + '</textarea></div>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnSaveMeta">Enregistrer</button>';
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
        global.JpToast?.ok?.('OK');
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
      + '<div style="display:flex;align-items:center;gap:0.35rem"><strong>Programme</strong><span id="helpProg"></span></div>'
      + '<p class="jp-muted" id="progStats" style="margin:0">' + stats.molecules + ' molécule(s) · '
      + stats.connaissances + ' valeur(s)</p>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnOpenMol">Sélectionner les molécules</button>'
      + '</div>'
      + '<div class="jp-inspector-cta">'
      + '<strong>Jeux</strong>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnNewJeu">Créer un jeu</button>'
      + '<div id="jeuxLies"></div>'
      + '</div>';

    pane.querySelector('#helpProg').appendChild(
      global.JpModal.helpButton('Programme', [
        'Ouvrez le sélecteur pour chercher parmi tout le catalogue.',
        'Pour chaque molécule, affichez ou masquez chaque valeur (ex. une seule indication).',
      ])
    );

    pane.querySelector('#btnOpenMol').addEventListener('click', () => {
      void global.JpStudioMolPicker.open({
        moduleId: m.id,
        onApplied: async () => {
          const s = await countProgramme(m.id);
          const el = document.getElementById('progStats');
          if (el) el.textContent = s.molecules + ' molécule(s) · ' + s.connaissances + ' valeur(s)';
        },
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
    await global.JpStudioJeuWizard.open({
      parcoursId: state.parcoursId,
      moduleId: m.id,
      modules: state.modules,
      defaultTitre: 'Jeu — ' + m.titre,
      onCreated: async () => {
        state.blocs = await loadBlocs(m.id);
        paintBlocks();
        await refreshJeuxLies(m);
      },
    });
  }

  global.JpStudioParcours = { boot };
})(window);
