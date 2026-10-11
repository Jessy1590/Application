/**
 * Studio parcours — arbre + canvas blocs + programme granulaire + jeux.
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
    programMatrices: [],
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

  function champLibelle(code) {
    const c = (global.JpConstants?.CHAMP_CODES || []).find((x) => x.code === code);
    return c?.libelle || code;
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
      + '<select id="parcoursSelect"></select>'
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
    const sel = root.querySelector('#parcoursSelect');
    sel.innerHTML = list.map((p) => '<option value="' + p.id + '">' + esc(p.libelle) + '</option>').join('');
    const qId = new URLSearchParams(location.search).get('parcours');
    if (qId && list.some((p) => p.id === qId)) sel.value = qId;
    else if (list[0]) sel.value = list[0].id;

    sel.addEventListener('change', () => void selectParcours(sel.value));
    root.querySelector('#btnNewParcours').addEventListener('click', () => void createParcours());
    root.querySelector('#btnPreview').addEventListener('click', () => {
      const m = selectedModule();
      if (!m || m.est_groupe) return global.JpToast?.warn?.('Choisir une leçon');
      window.open('../lecon.html?module=' + encodeURIComponent(m.id) + '&preview=1', '_blank');
    });

    if (sel.value) await selectParcours(sel.value);
    else {
      root.querySelector('#treePane').innerHTML = '<p class="jp-muted">Aucun parcours</p>';
    }
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
    state.selectedModuleId = childrenOf(null)[0]?.id || state.modules[0]?.id || null;
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
    const parentId = est_groupe
      ? (parent?.est_groupe ? parent.id : parent?.parent_id || null)
      : (parent?.est_groupe ? parent.id : parent?.parent_id || null);
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
      document.getElementById('canvasPane').innerHTML = '';
      document.getElementById('inspectorPane').innerHTML = '';
      return;
    }
    if (m.est_groupe) {
      state.blocs = [];
      renderCanvasGroup(m);
      renderInspectorMeta(m);
      return;
    }
    state.blocs = await loadBlocs(m.id);
    renderCanvas(m);
    await renderInspector(m);
  }

  function renderCanvasGroup(m) {
    const pane = document.getElementById('canvasPane');
    pane.innerHTML = '<h2 class="jp-title" style="font-size:1.35rem;margin:0 0 0.5rem">' + esc(m.titre) + '</h2>'
      + '<p class="jp-muted">Chapitre — ajoutez des leçons dans l’arbre.</p>';
  }

  function renderCanvas(m) {
    const pane = document.getElementById('canvasPane');
    let html = '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.75rem">'
      + '<h2 class="jp-title" style="font-size:1.35rem;margin:0;flex:1">' + esc(m.titre) + '</h2>'
      + '</div>'
      + '<div class="jp-add-blocks" id="addBlocks">'
      + ['texte', 'video', 'molecule', 'conseil', 'jeu'].map((t) =>
        '<button type="button" class="jp-btn jp-btn-ghost" data-add="' + t + '">' + t + '</button>'
      ).join('')
      + '</div><div id="blocksList"></div>';
    pane.innerHTML = html;
    pane.querySelectorAll('[data-add]').forEach((btn) => {
      btn.addEventListener('click', () => void addBloc(btn.getAttribute('data-add')));
    });
    paintBlocks();
  }

  function paintBlocks() {
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
        body = '<textarea data-field="html" data-id="' + b.id + '" rows="4" style="width:100%">' + esc(p.html || '') + '</textarea>';
      } else if (b.type_bloc === 'video') {
        body = '<input data-field="url" data-id="' + b.id + '" value="' + esc(p.url || '') + '" placeholder="URL YouTube / Vimeo" style="width:100%">'
          + (p.url ? videoEmbed(p.url) : '');
      } else if (b.type_bloc === 'molecule') {
        body = '<input data-field="matrice_id" data-id="' + b.id + '" value="' + esc(p.matrice_id || '') + '" placeholder="matrice_id" style="width:100%">';
      } else if (b.type_bloc === 'conseil') {
        body = '<input data-field="pathologie" data-id="' + b.id + '" value="' + esc(p.pathologie || '') + '" placeholder="Pathologie" style="width:100%;margin-bottom:0.35rem">'
          + '<textarea data-field="corps_html" data-id="' + b.id + '" rows="3" style="width:100%">' + esc(p.corps_html || '') + '</textarea>';
      } else if (b.type_bloc === 'jeu') {
        body = '<input data-field="code_unique" data-id="' + b.id + '" value="' + esc(p.code_unique || '') + '" placeholder="JP-*****" style="width:100%">';
      }
      return '<article class="jp-block-card" data-bloc="' + b.id + '">'
        + '<header><span class="jp-block-type">' + esc(b.type_bloc) + '</span>'
        + '<input data-field="titre" data-id="' + b.id + '" value="' + esc(b.titre || '') + '" placeholder="Titre" style="flex:1">'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-save="' + b.id + '">OK</button>'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-del="' + b.id + '">×</button></header>'
        + body + '</article>';
    }).join('');

    list.querySelectorAll('[data-save]').forEach((btn) => {
      btn.addEventListener('click', () => void saveBloc(btn.getAttribute('data-save')));
    });
    list.querySelectorAll('[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => void deleteBloc(btn.getAttribute('data-del')));
    });
  }

  function collectPayload(blocId, type) {
    const card = document.querySelector('[data-bloc="' + blocId + '"]');
    if (!card) return {};
    const val = (field) => card.querySelector('[data-field="' + field + '"]')?.value || '';
    if (type === 'texte') return { html: val('html') };
    if (type === 'video') return { url: val('url') };
    if (type === 'molecule') return { matrice_id: val('matrice_id'), mode: 'fiche' };
    if (type === 'conseil') return { pathologie: val('pathologie'), corps_html: val('corps_html') };
    if (type === 'jeu') return { code_unique: val('code_unique'), libelle_cta: 'Jouer' };
    return {};
  }

  async function addBloc(type) {
    const m = selectedModule();
    if (!m || m.est_groupe) return;
    if (type === 'jeu') {
      await openJeuWizard(m);
      return;
    }
    try {
      const row = await rpc('v2_upsert_bloc', {
        p_payload: {
          module_id: m.id,
          type_bloc: type,
          ordre: (state.blocs.length + 1) * 10,
          payload_json: type === 'texte' ? { html: '' } : {},
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
        p_payload: {
          id,
          titre,
          payload_json: collectPayload(id, b.type_bloc),
        },
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
    pane.innerHTML = '<div style="display:flex;align-items:center;gap:0.35rem;margin-bottom:0.75rem">'
      + '<strong>Propriétés</strong></div>'
      + '<div class="jp-field"><label>Titre</label><input id="metaTitre" value="' + esc(m.titre) + '"></div>'
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

  async function renderInspector(m) {
    const pane = document.getElementById('inspectorPane');
    pane.innerHTML = '<div style="display:flex;align-items:center;gap:0.35rem;margin-bottom:0.5rem">'
      + '<strong>Programme</strong><span id="helpProg"></span></div>'
      + '<div class="jp-field"><input id="searchMol" placeholder="Recherche molécule"></div>'
      + '<div class="jp-field"><input id="filterIndication" placeholder="Indication (norm)"></div>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnSearchMol">Chercher</button>'
      + '<div id="searchResults" style="margin:0.5rem 0"></div>'
      + '<div id="programTree"></div>'
      + '<hr style="margin:1rem 0;border:0;border-top:1px solid rgba(15,107,92,0.12)">'
      + '<strong>Jeux liés</strong>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnNewJeu" style="margin-top:0.5rem">Créer un jeu</button>'
      + '<div id="jeuxLies" style="margin-top:0.65rem"></div>';

    pane.querySelector('#helpProg').appendChild(
      global.JpModal.helpButton('Programme', [
        'Cochez chaque valeur à afficher dans cette leçon.',
        'Ex. bisoprolol : seulement IC ici ; angor dans un autre chapitre.',
      ])
    );

    pane.querySelector('#btnSearchMol').addEventListener('click', () => void runSearch());
    pane.querySelector('#btnNewJeu').addEventListener('click', () => void openJeuWizard(m));

    await refreshProgramTree(m);
    await refreshJeuxLies(m);
  }

  async function runSearch() {
    const q = document.getElementById('searchMol')?.value || '';
    const ind = document.getElementById('filterIndication')?.value || '';
    try {
      const rows = await rpc('v2_chercher_matrices', {
        p_q: q || null,
        p_indication_norm: ind || null,
        p_secteur_norm: null,
        p_classe_ther_norm: null,
        p_classe_pharma_norm: null,
        p_limit: 30,
      });
      const box = document.getElementById('searchResults');
      const list = Array.isArray(rows) ? rows : [];
      box.innerHTML = list.map((r) =>
        '<button type="button" class="jp-btn jp-btn-ghost" data-add-mol="' + r.id + '" style="display:block;width:100%;margin:0.25rem 0;text-align:left">'
        + esc(r.dci || '') + (r.noms ? ' · ' + esc(r.noms) : '') + '</button>'
      ).join('') || '<p class="jp-muted">Aucun résultat</p>';
      box.querySelectorAll('[data-add-mol]').forEach((btn) => {
        btn.addEventListener('click', () => void openMoleculeProgram(btn.getAttribute('data-add-mol'), btn.textContent));
      });
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  async function openMoleculeProgram(matriceId, label) {
    const m = selectedModule();
    if (!m) return;
    if (!state.programMatrices.find((x) => x.id === matriceId)) {
      state.programMatrices.push({ id: matriceId, label: label || matriceId });
    }
    await refreshProgramTree(m);
    const el = document.querySelector('details[data-matrice="' + matriceId + '"]');
    if (el) el.open = true;
  }

  async function refreshProgramTree(m) {
    const box = document.getElementById('programTree');
    if (!box) return;

    // Matrices déjà publiées sur le module
    const { data: pubs } = await sb()
      .from('publications_connaissances')
      .select('connaissance_id, connaissances!inner(matrice_id)')
      .eq('module_id', m.id)
      .eq('actif', true);
    const publishedMatrices = new Set();
    (pubs || []).forEach((p) => {
      const mid = p.connaissances?.matrice_id;
      if (mid) publishedMatrices.add(mid);
    });
    publishedMatrices.forEach((id) => {
      if (!state.programMatrices.find((x) => x.id === id)) {
        state.programMatrices.push({ id, label: id.slice(0, 8) });
      }
    });

    if (!state.programMatrices.length) {
      box.innerHTML = '<p class="jp-muted">Ajoutez une molécule</p>';
      return;
    }

    const chunks = [];
    for (const mol of state.programMatrices) {
      const rows = await rpc('v2_lister_connaissances_matrice', {
        p_matrice_id: mol.id,
        p_module_id: m.id,
      });
      const list = Array.isArray(rows) ? rows : [];
      // enrich label from dci if needed
      const dciRow = list.find((r) => r.champ_code === 'dci');
      if (dciRow?.texte) mol.label = dciRow.texte;

      const byChamp = {};
      list.forEach((r) => {
        if (r.champ_code === 'nom_commercial' || r.champ_code === 'dci') return;
        (byChamp[r.champ_code] = byChamp[r.champ_code] || []).push(r);
      });

      let inner = '';
      Object.keys(byChamp).sort().forEach((code) => {
        const vals = byChamp[code];
        const pubN = vals.filter((v) => v.publie).length;
        inner += '<div class="jp-prog-champ"><h4>'
          + esc(champLibelle(code)) + ' <span>' + pubN + '/' + vals.length + '</span>'
          + '<span><button type="button" class="jp-btn jp-btn-ghost" data-all-on="' + mol.id + '" data-champ="' + code + '">Tout</button>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-all-off="' + mol.id + '" data-champ="' + code + '">Rien</button></span></h4>';
        vals.forEach((v) => {
          inner += '<label class="jp-prog-val"><input type="checkbox" data-cid="' + v.connaissance_id + '" data-matrice="' + mol.id + '"'
            + (v.publie ? ' checked' : '') + '> <span>' + esc(v.texte || '—') + '</span></label>';
        });
        inner += '</div>';
      });

      chunks.push('<details class="jp-prog-mol" data-matrice="' + mol.id + '" open>'
        + '<summary>' + esc(mol.label)
        + ' <button type="button" class="jp-btn jp-btn-ghost" data-mol-on="' + mol.id + '">Tout</button>'
        + ' <button type="button" class="jp-btn jp-btn-ghost" data-mol-off="' + mol.id + '">Rien</button>'
        + ' <button type="button" class="jp-btn jp-btn-primary" data-sync="' + mol.id + '">Appliquer</button></summary>'
        + inner + '</details>');
    }
    box.innerHTML = chunks.join('');

    box.querySelectorAll('[data-all-on]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const mid = btn.getAttribute('data-all-on');
        const champ = btn.getAttribute('data-champ');
        box.querySelectorAll('details[data-matrice="' + mid + '"] .jp-prog-champ').forEach((ch) => {
          if (ch.querySelector('h4')?.textContent?.startsWith(champLibelle(champ)) || true) {
            // filter by data-champ via parent structure - check checkboxes in same champ section
          }
        });
        const detail = box.querySelector('details[data-matrice="' + mid + '"]');
        detail?.querySelectorAll('.jp-prog-champ').forEach((section) => {
          const h = section.querySelector('h4');
          if (h && h.childNodes[0] && h.textContent.indexOf(champLibelle(champ)) === 0) {
            section.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = true; });
          }
        });
        // simpler: match data-champ button's section
        let section = btn.closest('.jp-prog-champ');
        section?.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = true; });
      });
    });
    box.querySelectorAll('[data-all-off]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        btn.closest('.jp-prog-champ')?.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = false; });
      });
    });
    box.querySelectorAll('[data-mol-on]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mid = btn.getAttribute('data-mol-on');
        box.querySelectorAll('details[data-matrice="' + mid + '"] input[type=checkbox]').forEach((c) => { c.checked = true; });
      });
    });
    box.querySelectorAll('[data-mol-off]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const mid = btn.getAttribute('data-mol-off');
        box.querySelectorAll('details[data-matrice="' + mid + '"] input[type=checkbox]').forEach((c) => { c.checked = false; });
      });
    });
    box.querySelectorAll('[data-sync]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        void syncMoleculePubs(m, btn.getAttribute('data-sync'));
      });
    });
  }

  async function syncMoleculePubs(module, matriceId) {
    const detail = document.querySelector('details[data-matrice="' + matriceId + '"]');
    if (!detail) return;
    const checked = [];
    const unchecked = [];
    detail.querySelectorAll('input[type=checkbox][data-cid]').forEach((c) => {
      if (c.checked) checked.push(c.getAttribute('data-cid'));
      else unchecked.push(c.getAttribute('data-cid'));
    });
    try {
      if (checked.length) {
        await rpc('v2_publier_connaissances', {
          p_module_id: module.id,
          p_connaissance_ids: checked,
        });
      }
      if (unchecked.length) {
        await rpc('v2_depublier_connaissances', {
          p_module_id: module.id,
          p_connaissance_ids: unchecked,
        });
      }
      global.JpToast?.ok?.('Programme à jour');
      await refreshProgramTree(module);
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  async function refreshJeuxLies(m) {
    const box = document.getElementById('jeuxLies');
    if (!box) return;
    const { data, error } = await sb()
      .from('modeles_jeu')
      .select('id, code_unique, type_jeu, titre, en_pause, actif')
      .eq('parcours_id', state.parcoursId)
      .eq('actif', true)
      .contains('module_ids', [m.id]);
    if (error) {
      box.innerHTML = '<p class="jp-muted">—</p>';
      return;
    }
    const rows = data || [];
    box.innerHTML = rows.map((r) =>
      '<div class="jp-list-row"><span><code>' + esc(r.code_unique) + '</code> ' + esc(r.titre) + '</span></div>'
    ).join('') || '<p class="jp-muted">Aucun</p>';
  }

  async function openJeuWizard(m) {
    const wrap = document.createElement('div');
    wrap.innerHTML = '<div class="jp-field"><label>Type</label>'
      + '<select id="wizType"><option value="quiz">Quiz</option><option value="trous">Trous</option>'
      + '<option value="fiche_aleatoire">Fiche aléatoire</option><option value="ordonnance">Ordonnance</option></select></div>'
      + '<div class="jp-field"><label>Titre</label><input id="wizTitre" value="Jeu — ' + esc(m.titre) + '"></div>'
      + '<div class="jp-field"><label>Questions / fiches</label><input id="wizNb" type="number" value="8" min="1"></div>';
    global.JpModal.open({
      title: 'Nouveau jeu',
      body: wrap,
      confirmLabel: 'Créer',
      onConfirm: async () => {
        const type = wrap.querySelector('#wizType').value;
        const titre = wrap.querySelector('#wizTitre').value;
        const nb = Number(wrap.querySelector('#wizNb').value) || 8;
        const configuration_json = type === 'quiz'
          ? { nb_questions: nb, nb_propositions: 3, champs_interroges: ['indications', 'contre_indications', 'effets_indesirables'] }
          : type === 'trous'
            ? { nb_fiches: Math.min(nb, 6), densite_trous: 3, champs_interroges: ['indications', 'contre_indications', 'effets_indesirables'] }
            : type === 'fiche_aleatoire'
              ? { seuil_exclusion: 8, nb_notes_exclusion: 3 }
              : { champs: ['indications', 'contre_indications', 'effets_indesirables'], regles: [] };
        const created = await rpc('v2_creer_modele_jeu', {
          p_payload: {
            type_jeu: type,
            titre,
            parcours_id: state.parcoursId,
            module_ids: [m.id],
            mode: 'entrainement',
            configuration_json,
          },
        });
        await rpc('v2_upsert_bloc', {
          p_payload: {
            module_id: m.id,
            type_bloc: 'jeu',
            titre: created.titre || titre,
            ordre: (state.blocs.length + 1) * 10,
            payload_json: {
              modele_id: created.id,
              code_unique: created.code_unique,
              libelle_cta: 'Jouer',
            },
          },
        });
        state.blocs = await loadBlocs(m.id);
        paintBlocks();
        await refreshJeuxLies(m);
        global.JpToast?.ok?.(created.code_unique || 'Jeu créé');
      },
    });
  }

  global.JpStudioParcours = { boot };
})(window);
