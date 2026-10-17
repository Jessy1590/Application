/**
 * Surface Preview parcours — complémentaire du studio Structure/Contenu.
 * Gauche : IA pré-brouillon (miroir) | Centre : courant (publié + brouillons)
 * Droite : params + Imprimer | Barre flottante Base|★1–5 + sélecteur | Publier.
 */
(function (global) {
  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }

  const KIND_LABELS = {
    chapitre: 'Chapitre',
    lecon: 'Leçon',
    section: 'Section',
    bloc: 'Bloc',
  };
  const ACTION_LABELS = {
    create: 'Création',
    update: 'Modification',
    delete: 'Suppression',
    keep: 'Inchangé',
  };
  const COUCHES = ['base', '1', '2', '3', '4', '5'];

  const state = {
    parcoursId: null,
    parcours: null,
    modules: [],
    selectedModuleId: null,
    couche: 'base',
    proposals: [],
    decisions: {},
    selectedTempId: null,
    currentBlocs: [],
    currentModule: null,
    sessionTouched: {},
    printScope: 'lecon',
    busy: false,
    avertissements: [],
    _molByDci: null,
    _molModuleId: null,
  };

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    return data;
  }

  function coucheKey() {
    return state.couche === 'base' ? 'base' : String(state.couche);
  }

  function coucheLabel(c) {
    return c === 'base' ? 'Base' : ('★' + c);
  }

  function decisionOf(tempId, couche) {
    const d = state.decisions[tempId] || {};
    return d[couche || coucheKey()] || 'pending';
  }

  function setDecision(tempId, couche, status) {
    if (!state.decisions[tempId]) state.decisions[tempId] = {};
    state.decisions[tempId][couche] = status;
  }

  /** Couches concernées par une proposition (base + variantes non vides). */
  function couchesForNode(node) {
    const out = ['base'];
    const v = (node && node.variantes) || {};
    for (let i = 1; i <= 5; i += 1) {
      const k = String(i);
      if (v[k] && typeof v[k] === 'object' && Object.keys(v[k]).length) out.push(k);
    }
    // Chapitres / leçons : une seule couche de décision structurelle
    if (node && (node.kind === 'chapitre' || node.kind === 'lecon')) return ['base'];
    return out;
  }

  function allDecided() {
    if (!state.proposals.length) return false;
    return state.proposals.every((n) => {
      if (n.action === 'keep') return true;
      return couchesForNode(n).every((c) => {
        const s = decisionOf(n.temp_id, c);
        return s === 'accepted' || s === 'rejected' || s === 'homemade';
      });
    });
  }

  function pendingCount() {
    let n = 0;
    state.proposals.forEach((node) => {
      if (node.action === 'keep') return;
      couchesForNode(node).forEach((c) => {
        if (decisionOf(node.temp_id, c) === 'pending') n += 1;
      });
    });
    return n;
  }

  async function loadParcours(id) {
    const { data, error } = await sb()
      .from('parcours_apprentissage')
      .select('id, code, libelle, description')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function loadModules(parcoursId) {
    const { data, error } = await sb()
      .from('modules_cours')
      .select('id, parcours_id, parent_id, code, titre, resume, ordre, publie, est_groupe, statut, niveau_min, niveau_max')
      .eq('parcours_id', parcoursId)
      .order('ordre');
    if (error) throw error;
    return data || [];
  }

  async function loadBlocs(moduleId) {
    const { data, error } = await sb()
      .from('module_blocs')
      .select('id, module_id, type_bloc, titre, ordre, payload_json, visible, niveau_min, niveau_max')
      .eq('module_id', moduleId)
      .order('ordre');
    if (error) throw error;
    return data || [];
  }

  function selectedModule() {
    return state.modules.find((m) => m.id === state.selectedModuleId) || null;
  }

  function moduleOptionsHtml() {
    const roots = state.modules.filter((m) => !m.parent_id).sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    const byParent = {};
    state.modules.forEach((m) => {
      if (!m.parent_id) return;
      if (!byParent[m.parent_id]) byParent[m.parent_id] = [];
      byParent[m.parent_id].push(m);
    });
    Object.keys(byParent).forEach((k) => byParent[k].sort((a, b) => (a.ordre || 0) - (b.ordre || 0)));

    let html = '';
    function walk(list, depth) {
      list.forEach((m) => {
        const pad = depth ? ' '.repeat(depth) : '';
        const kind = m.est_groupe ? 'chapitre' : 'leçon';
        const sel = m.id === state.selectedModuleId ? ' selected' : '';
        html += '<option value="' + esc(m.id) + '"' + sel + '>'
          + pad + esc(m.titre || '(sans titre)') + ' (' + kind + ')</option>';
        walk(byParent[m.id] || [], depth + 1);
      });
    }
    walk(roots, 0);
    // orphelins
    const seen = new Set();
    function mark(list) {
      list.forEach((m) => {
        seen.add(m.id);
        mark(byParent[m.id] || []);
      });
    }
    mark(roots);
    state.modules.filter((m) => !seen.has(m.id)).forEach((m) => {
      const sel = m.id === state.selectedModuleId ? ' selected' : '';
      html += '<option value="' + esc(m.id) + '"' + sel + '>'
        + esc(m.titre || '(sans titre)') + '</option>';
    });
    return html;
  }

  /* ——— Contexte IA (nœuds courants) ——— */

  function currentNodesForContext() {
    const m = selectedModule();
    const nodes = [];
    state.modules.forEach((mod) => {
      nodes.push({
        temp_id: 'm:' + mod.id,
        kind: mod.est_groupe ? 'chapitre' : 'lecon',
        ref_id: mod.id,
        parent_ref: mod.parent_id || null,
        action: 'keep',
        titre: mod.titre || '',
        niveaux: { min: Number(mod.niveau_min) || 1, max: Number(mod.niveau_max) || 5 },
        payload: { resume: mod.resume || '' },
        variantes: {},
      });
    });
    if (m && !m.est_groupe) {
      state.currentBlocs.forEach((b) => {
        const pub = global.JpLeconPlayer?.publishedPayload?.(b.payload_json) || {};
        const draft = (b.payload_json && b.payload_json._brouillon) || null;
        const eff = Object.assign({}, pub, (draft && draft.payload) || {});
        const kind = b.type_bloc === 'section' ? 'section' : 'bloc';
        nodes.push({
          temp_id: 'b:' + b.id,
          kind,
          ref_id: b.id,
          parent_ref: m.id,
          action: 'keep',
          titre: (draft && Object.prototype.hasOwnProperty.call(draft, 'titre') ? draft.titre : b.titre) || '',
          niveaux: { min: Number(b.niveau_min) || 1, max: Number(b.niveau_max) || 5 },
          payload: Object.assign({ type: b.type_bloc }, eff),
          variantes: (eff.variantes && typeof eff.variantes === 'object') ? eff.variantes : {},
        });
      });
    }
    return nodes;
  }

  async function lessonMolecules(moduleId) {
    if (!moduleId) return [];
    const { data, error } = await sb()
      .from('publications_connaissances')
      .select('connaissances!inner(matrice_id)')
      .eq('module_id', moduleId)
      .eq('actif', true);
    if (error) throw error;
    const ids = [];
    (data || []).forEach((p) => {
      const id = p.connaissances && p.connaissances.matrice_id;
      if (id && ids.indexOf(id) === -1) ids.push(id);
    });
    if (!ids.length) return [];
    const { data: rows, error: e2 } = await sb().from('v_medicaments_complet').select('id, dci').in('id', ids);
    if (e2) throw e2;
    return (rows || []).filter((r) => r.dci).map((r) => ({ id: r.id, dci: r.dci }));
  }

  /* ——— Couche affichée (extrait payload) ——— */

  function layerPayload(node, couche) {
    if (!node) return {};
    if (couche === 'base') return Object.assign({}, node.payload || {});
    const v = (node.variantes && node.variantes[String(couche)]) || {};
    return Object.assign({}, node.payload || {}, v);
  }

  function currentBlocByRef(refId) {
    return state.currentBlocs.find((b) => b.id === refId) || null;
  }

  function currentSideSnippet(refId, kind, couche) {
    if (!refId) return { empty: true, label: '(insertion — centre vide)' };
    if (kind === 'chapitre' || kind === 'lecon') {
      const m = state.modules.find((x) => x.id === refId);
      if (!m) return { empty: true, label: '(introuvable)' };
      return { empty: false, label: m.titre || '(sans titre)', html: esc(m.resume || '') };
    }
    const b = currentBlocByRef(refId);
    if (!b) return { empty: true, label: '(introuvable)' };
    const draft = (b.payload_json && b.payload_json._brouillon) || null;
    const pub = global.JpLeconPlayer?.publishedPayload?.(b.payload_json) || {};
    const eff = Object.assign({}, pub, (draft && draft.payload) || {});
    let layer = eff;
    if (couche !== 'base' && eff.variantes && eff.variantes[String(couche)]) {
      layer = Object.assign({}, eff, eff.variantes[String(couche)]);
    }
    const titre = (draft && Object.prototype.hasOwnProperty.call(draft, 'titre') ? draft.titre : b.titre) || '';
    const type = b.type_bloc;
    let preview = '';
    if (type === 'texte') preview = stripHtml(layer.html || '');
    else if (type === 'conseil') preview = stripHtml(layer.corps_html || '') || (layer.pathologie || '');
    else if (type === 'recommandation') preview = stripHtml(layer.corps_html || '');
    else if (type === 'molecule') {
      const ids = Array.isArray(layer.matrice_ids) ? layer.matrice_ids : (layer.matrice_id ? [layer.matrice_id] : []);
      preview = ids.length + ' molécule(s)';
    } else if (type === 'video' || type === 'photo') preview = layer.url || layer.path || '';
    else if (type === 'section') preview = titre;
    else preview = type || '';
    return {
      empty: false,
      label: titre || (TYPE_LABEL(type) + ' sans titre'),
      html: esc(preview).slice(0, 280),
      type,
    };
  }

  function TYPE_LABEL(t) {
    return (global.JpLeconPlayer?.BLOC_META?.[t]?.label) || t || 'Bloc';
  }

  function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    return (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function proposalSnippet(node, couche) {
    if (!node) return { empty: true, label: '(suppression proposée)' };
    if (node.action === 'delete') return { empty: true, label: '(suppression proposée)' };
    const layer = layerPayload(node, couche);
    const type = layer.type || (node.kind === 'section' ? 'section' : '');
    let preview = '';
    if (node.kind === 'chapitre' || node.kind === 'lecon') {
      preview = layer.resume || node.titre || '';
    } else if (type === 'texte') preview = stripHtml(layer.html || '');
    else if (type === 'conseil') preview = stripHtml(layer.corps_html || '') || (layer.pathologie || '');
    else if (type === 'recommandation') preview = stripHtml(layer.corps_html || '');
    else if (type === 'molecule') {
      const dci = Array.isArray(layer.dci) ? layer.dci : [];
      const ids = Array.isArray(layer.matrice_ids) ? layer.matrice_ids : [];
      preview = dci.length ? dci.join(', ') : (ids.length + ' molécule(s)');
    } else if (type === 'video' || type === 'photo') preview = layer.url || '';
    else preview = node.titre || type || '';
    return {
      empty: false,
      label: node.titre || (TYPE_LABEL(type) || KIND_LABELS[node.kind] || 'Proposition'),
      html: esc(preview).slice(0, 280),
      type,
    };
  }

  /* ——— Miroir aligné ——— */

  function buildMirrorRows() {
    const couche = coucheKey();
    const rows = [];
    const usedRefs = new Set();

    state.proposals.forEach((node) => {
      const ref = node.ref_id || null;
      if (ref) usedRefs.add(ref);
      const left = proposalSnippet(node, couche);
      const right = node.action === 'create' || !ref
        ? { empty: true, label: '(insertion — centre vide)' }
        : currentSideSnippet(ref, node.kind, couche);
      rows.push({
        tempId: node.temp_id,
        node,
        left,
        right,
        status: decisionOf(node.temp_id, couche),
      });
    });

    // Blocs / modules courants sans proposition (affichage centre seul, pas de validation)
    const m = selectedModule();
    if (m && !m.est_groupe) {
      state.currentBlocs.forEach((b) => {
        if (usedRefs.has(b.id)) return;
        const right = currentSideSnippet(b.id, b.type_bloc === 'section' ? 'section' : 'bloc', couche);
        rows.push({
          tempId: null,
          node: null,
          left: { empty: true, label: '—' },
          right,
          status: 'idle',
          refId: b.id,
        });
      });
    }
    return rows;
  }

  /* ——— Shell UI ——— */

  function shellHtml() {
    return '<div class="jp-preview-app" id="previewApp">'
      + '<header class="jp-preview-top no-print">'
      + '<a class="jp-btn jp-btn-ghost" href="parcours.html?parcours=' + esc(state.parcoursId || '') + '">← Studio</a>'
      + '<h1 class="jp-preview-title" id="previewTitle">Preview</h1>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnPublishUpdate" disabled'
      + ' title="Publie les brouillons du parcours quand toutes les décisions sont prises">'
      + 'Publier la mise à jour</button>'
      + '</header>'
      + '<div class="jp-preview-body">'
      + '<aside class="jp-preview-pane jp-preview-ia" id="iaPane"></aside>'
      + '<section class="jp-preview-pane jp-preview-center" id="centerPane"></section>'
      + '<aside class="jp-preview-pane jp-preview-params no-print" id="paramsPane"></aside>'
      + '</div>'
      + '<footer class="jp-preview-bar no-print" id="floatBar" role="toolbar" aria-label="Couche et navigation">'
      + '</footer>'
      + '</div>';
  }

  function renderFloatBar() {
    const bar = document.getElementById('floatBar');
    if (!bar) return;
    const couche = coucheKey();
    bar.innerHTML = '<div class="jp-preview-bar-couches" role="group" aria-label="Couche Base ou niveau">'
      + COUCHES.map((c) => {
        const on = c === couche ? ' is-active' : '';
        const lab = coucheLabel(c);
        return '<button type="button" class="jp-preview-couche' + on + '" data-couche="' + c
          + '" aria-pressed="' + (c === couche ? 'true' : 'false') + '">' + lab + '</button>';
      }).join('')
      + '</div>'
      + '<label class="jp-preview-nav">'
      + '<span>Leçon / chapitre</span>'
      + '<select id="previewModuleSel" aria-label="Choisir une leçon ou un chapitre">'
      + moduleOptionsHtml()
      + '</select></label>'
      + '<span class="jp-preview-pending" id="previewPending" role="status"></span>';

    bar.querySelectorAll('[data-couche]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.couche = btn.getAttribute('data-couche') || 'base';
        renderAll();
      });
    });
    bar.querySelector('#previewModuleSel')?.addEventListener('change', (ev) => {
      const id = ev.target.value;
      void selectModule(id);
    });
    updatePendingChip();
  }

  function updatePendingChip() {
    const el = document.getElementById('previewPending');
    const btn = document.getElementById('btnPublishUpdate');
    if (el) {
      const n = pendingCount();
      el.textContent = state.proposals.length
        ? (n ? (n + ' décision(s) en attente') : 'Toutes les décisions prises')
        : 'Aucune proposition IA';
    }
    if (btn) btn.disabled = !allDecided() || state.busy;
  }

  function renderIaPane() {
    const pane = document.getElementById('iaPane');
    if (!pane) return;
    const G = global.JpIaGemini;
    const couche = coucheKey();
    const rows = buildMirrorRows().filter((r) => r.node);

    pane.innerHTML = '<div class="jp-preview-ia-head">'
      + '<h2>IA — pré-brouillon</h2>'
      + '<p class="jp-muted jp-preview-lead">Propose Base + variantes ★. La barre flottante pilote l’affichage et la couche validée.</p>'
      + '<p class="jp-preview-ia-prompt-link no-print">'
      + '<button type="button" class="jp-link-btn" id="iaEditPrompt">Modifier le prompt de base</button></p>'
      + '</div>'
      + '<div class="jp-preview-ia-form no-print">'
      + '<div class="jp-field"><label for="iaInstruction">Instruction</label>'
      + '<textarea id="iaInstruction" rows="4" maxlength="8000" placeholder="Ex. Enrichir la leçon pour ★1, clarifier les CI…"></textarea></div>'
      + '<div class="jp-field"><label for="iaText">Texte complémentaire (optionnel)</label>'
      + '<textarea id="iaText" rows="3" maxlength="' + (G?.TEXT_MAX_CHARS || 80000) + '"></textarea></div>'
      + '<div class="jp-field"><label for="iaPdf">PDF (optionnel, 10 Mo)</label>'
      + '<input id="iaPdf" type="file" accept="application/pdf,.pdf"></div>'
      + '<div class="jp-preview-ia-actions">'
      + '<button type="button" class="jp-btn jp-btn-primary" id="iaRun">Générer le pré-brouillon</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="iaRejectAll" '
      + (rows.length ? '' : 'disabled ') + '>Tout rejeter (' + coucheLabel(couche) + ')</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="iaAcceptAll" '
      + (rows.length ? '' : 'disabled ') + '>Tout valider (' + coucheLabel(couche) + ')</button>'
      + '</div>'
      + '<div class="jp-ia-status" id="iaStatus" role="status" aria-live="polite" hidden></div>'
      + '</div>'
      + '<div class="jp-preview-mirror" id="mirrorList" aria-label="Miroir propositions"></div>';

    const list = pane.querySelector('#mirrorList');
    if (!rows.length) {
      list.innerHTML = '<p class="jp-muted">Lancez l’IA pour obtenir un pré-brouillon aligné sur la leçon.</p>';
    } else {
      list.innerHTML = rows.map((r) => mirrorRowHtml(r, couche)).join('');
      list.querySelectorAll('[data-temp]').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-act]')) return;
          state.selectedTempId = el.getAttribute('data-temp');
          renderMirrorSelection();
          renderParamsPane();
        });
      });
      list.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const temp = btn.closest('[data-temp]')?.getAttribute('data-temp');
          const act = btn.getAttribute('data-act');
          void handleLineAction(temp, act);
        });
      });
    }

    pane.querySelector('#iaRun')?.addEventListener('click', () => void runIa(pane));
    pane.querySelector('#iaRejectAll')?.addEventListener('click', () => void bulkDecide('rejected'));
    pane.querySelector('#iaAcceptAll')?.addEventListener('click', () => void bulkDecide('accepted'));
    pane.querySelector('#iaEditPrompt')?.addEventListener('click', () => {
      if (!global.JpStudioIA?.editBasePrompt) {
        global.JpToast?.warn?.('Éditeur de prompt indisponible');
        return;
      }
      void global.JpStudioIA.editBasePrompt();
    });
    renderMirrorSelection();
  }

  function mirrorRowHtml(r, couche) {
    const node = r.node;
    const on = node.temp_id === state.selectedTempId ? ' is-selected' : '';
    const st = r.status;
    const stLab = st === 'accepted' || st === 'homemade' ? 'validé'
      : (st === 'rejected' ? 'rejeté' : 'en attente');
    const kindLab = KIND_LABELS[node.kind] || node.kind;
    const actLab = ACTION_LABELS[node.action] || node.action;
    return '<article class="jp-mirror-row' + on + ' is-' + esc(st) + '" data-temp="' + esc(node.temp_id) + '">'
      + '<header class="jp-mirror-meta">'
      + '<span class="jp-mirror-kind">' + esc(kindLab) + '</span>'
      + '<span class="jp-mirror-action">' + esc(actLab) + '</span>'
      + '<span class="jp-mirror-status">' + esc(stLab) + ' · ' + coucheLabel(couche) + '</span>'
      + '</header>'
      + '<div class="jp-mirror-cols">'
      + '<div class="jp-mirror-col jp-mirror-ia">'
      + '<strong class="jp-mirror-col-lab">Proposition</strong>'
      + (r.left.empty
        ? '<p class="jp-muted">' + esc(r.left.label) + '</p>'
        : '<p class="jp-mirror-title">' + esc(r.left.label) + '</p><p class="jp-mirror-snip">' + r.left.html + '</p>')
      + '</div>'
      + '<div class="jp-mirror-col jp-mirror-cur">'
      + '<strong class="jp-mirror-col-lab">Courant</strong>'
      + (r.right.empty
        ? '<p class="jp-muted">' + esc(r.right.label) + '</p>'
        : '<p class="jp-mirror-title">' + esc(r.right.label) + '</p><p class="jp-mirror-snip">' + r.right.html + '</p>')
      + '</div>'
      + '</div>'
      + (st === 'pending'
        ? '<div class="jp-mirror-acts">'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-act="reject">Rejeter</button>'
          + '<button type="button" class="jp-btn jp-btn-primary" data-act="accept">Prendre IA</button>'
          + '</div>'
        : '')
      + '</article>';
  }

  function renderMirrorSelection() {
    document.querySelectorAll('.jp-mirror-row').forEach((el) => {
      el.classList.toggle('is-selected', el.getAttribute('data-temp') === state.selectedTempId);
    });
  }

  /* ——— Centre ——— */

  async function renderCenterPane() {
    const pane = document.getElementById('centerPane');
    if (!pane) return;
    const m = selectedModule();
    const couche = coucheKey();
    const niveau = couche === 'base' ? null : Number(couche);

    pane.innerHTML = '<div class="jp-preview-center-head no-print">'
      + '<h2>' + esc(m ? m.titre : 'Aperçu') + '</h2>'
      + '<p class="jp-muted">Couche affichée : ' + coucheLabel(couche)
      + ' · courant = publié + brouillons validés</p>'
      + '</div>'
      + '<div class="jp-preview-player" id="previewPlayer"></div>';

    const host = pane.querySelector('#previewPlayer');
    if (!m) {
      host.innerHTML = '<p class="jp-muted">Choisissez une leçon ou un chapitre.</p>';
      return;
    }
    if (m.est_groupe) {
      const kids = state.modules
        .filter((x) => x.parent_id === m.id)
        .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
      host.innerHTML = '<p class="jp-lecon-resume">' + esc(m.resume || '') + '</p>'
        + (kids.length
          ? '<ul class="jp-preview-chapter-list">' + kids.map((k) =>
            '<li><button type="button" class="jp-btn jp-btn-ghost" data-goto="' + esc(k.id) + '">'
            + esc(k.titre || '') + (k.est_groupe ? ' (chapitre)' : '') + '</button></li>'
          ).join('') + '</ul>'
          : '<p class="jp-muted">Aucune leçon dans ce chapitre.</p>');
      host.querySelectorAll('[data-goto]').forEach((btn) => {
        btn.addEventListener('click', () => void selectModule(btn.getAttribute('data-goto')));
      });
      return;
    }
    if (!global.JpLeconPlayer?.renderContent) {
      host.innerHTML = '<p class="jp-muted">Lecteur indisponible.</p>';
      return;
    }
    await global.JpLeconPlayer.renderContent(host, {
      module: Object.assign({}, m, { parcours_id: state.parcoursId }),
      blocs: state.currentBlocs,
      preview: true,
      niveau,
    });
  }

  /* ——— Params droite ——— */

  function renderParamsPane() {
    const pane = document.getElementById('paramsPane');
    if (!pane) return;
    const node = state.proposals.find((n) => n.temp_id === state.selectedTempId) || null;
    const couche = coucheKey();

    let body = '';
    if (!node) {
      body = '<p class="jp-muted">Sélectionnez une ligne du miroir IA pour éditer les paramètres ou une édition maison.</p>';
    } else {
      const st = decisionOf(node.temp_id, couche);
      const layer = layerPayload(node, couche);
      const payloadJson = JSON.stringify(layer, null, 2);
      body = '<div class="jp-field"><label for="paramKind">Type</label>'
        + '<select id="paramKind">'
        + Object.keys(KIND_LABELS).map((k) =>
          '<option value="' + k + '"' + (node.kind === k ? ' selected' : '') + '>'
          + KIND_LABELS[k] + '</option>'
        ).join('')
        + '</select></div>'
        + '<div class="jp-field"><label for="paramTitre">Titre</label>'
        + '<input id="paramTitre" type="text" value="' + esc(node.titre || '') + '" maxlength="200"></div>'
        + '<div class="jp-field"><label>Plage ★</label>'
        + '<div class="jp-plage">'
        + '<label>De <select id="paramMin">' + plageOpts(node.niveau_min || node.niveaux?.min || 1) + '</select></label>'
        + '<label>À <select id="paramMax">' + plageOpts(node.niveau_max || node.niveaux?.max || 5) + '</select></label>'
        + '</div></div>'
        + '<div class="jp-field"><label for="paramPayload">Contenu couche ' + coucheLabel(couche) + ' (JSON)</label>'
        + '<textarea id="paramPayload" rows="12" spellcheck="false">' + esc(payloadJson) + '</textarea></div>'
        + '<p class="jp-field-hint">Édition maison : modifiez le JSON puis « Valider édition maison ». '
        + 'Le reclassement (type) s’applique à la validation.</p>'
        + '<div class="jp-preview-param-acts">'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="paramReject" '
        + (st === 'pending' ? '' : 'disabled ') + '>Rejeter</button>'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="paramHomemade">Valider édition maison</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" id="paramAccept" '
        + (st === 'pending' ? '' : 'disabled ') + '>Prendre IA</button>'
        + '</div>';
    }

    pane.innerHTML = '<h2>Paramètres</h2>'
      + body
      + '<hr class="jp-preview-hr">'
      + '<h3>Impression</h3>'
      + '<div class="jp-field"><label for="printScope">Périmètre</label>'
      + '<select id="printScope">'
      + '<option value="lecon"' + (state.printScope === 'lecon' ? ' selected' : '') + '>Leçon courante</option>'
      + '<option value="chapitre"' + (state.printScope === 'chapitre' ? ' selected' : '') + '>Chapitre</option>'
      + '<option value="parcours"' + (state.printScope === 'parcours' ? ' selected' : '') + '>Parcours entier</option>'
      + '</select></div>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnPrint">Imprimer</button>';

    pane.querySelector('#printScope')?.addEventListener('change', (ev) => {
      state.printScope = ev.target.value || 'lecon';
    });
    pane.querySelector('#btnPrint')?.addEventListener('click', () => void doPrint());
    if (!node) return;

    pane.querySelector('#paramReject')?.addEventListener('click', () => void handleLineAction(node.temp_id, 'reject'));
    pane.querySelector('#paramAccept')?.addEventListener('click', () => void handleLineAction(node.temp_id, 'accept'));
    pane.querySelector('#paramHomemade')?.addEventListener('click', () => void handleHomemade(node.temp_id));
  }

  function plageOpts(selected) {
    let html = '';
    for (let i = 1; i <= 5; i += 1) {
      html += '<option value="' + i + '"' + (Number(selected) === i ? ' selected' : '') + '>★' + i + '</option>';
    }
    return html;
  }

  function applyParamEdits(node) {
    // Uniquement si le panneau params affiche ce nœud (évite d’écraser depuis « Prendre IA » miroir)
    if (!node || state.selectedTempId !== node.temp_id) return;
    if (!document.getElementById('paramKind')) return;
    const kind = document.getElementById('paramKind')?.value;
    const titre = document.getElementById('paramTitre')?.value;
    const min = Number(document.getElementById('paramMin')?.value) || 1;
    const max = Number(document.getElementById('paramMax')?.value) || 5;
    if (kind) node.kind = kind;
    if (titre != null) node.titre = titre;
    node.niveau_min = Math.min(min, max);
    node.niveau_max = Math.max(min, max);
    node.niveaux = { min: node.niveau_min, max: node.niveau_max };
    const raw = document.getElementById('paramPayload')?.value;
    if (raw != null && raw !== '') {
      try {
        const parsed = JSON.parse(raw);
        const couche = coucheKey();
        if (couche === 'base') {
          node.payload = parsed;
        } else {
          if (!node.variantes) node.variantes = {};
          node.variantes[couche] = parsed;
        }
      } catch (e) {
        throw new Error('JSON invalide dans le contenu');
      }
    }
  }

  /* ——— Actions validation ——— */

  async function handleLineAction(tempId, act) {
    const node = state.proposals.find((n) => n.temp_id === tempId);
    if (!node) return;
    const couche = coucheKey();
    if (decisionOf(tempId, couche) !== 'pending') return;
    try {
      if (act === 'reject') {
        setDecision(tempId, couche, 'rejected');
        global.JpToast?.ok?.('Ligne rejetée pour ' + coucheLabel(couche));
      } else if (act === 'accept') {
        applyParamEdits(node);
        await writeDraftFromNode(node, couche, false);
        setDecision(tempId, couche, 'accepted');
        global.JpToast?.ok?.('Brouillon écrit · ' + coucheLabel(couche));
        await refreshCurrent();
      }
      renderAll();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  async function handleHomemade(tempId) {
    const node = state.proposals.find((n) => n.temp_id === tempId);
    if (!node) return;
    const couche = coucheKey();
    try {
      applyParamEdits(node);
      await writeDraftFromNode(node, couche, true);
      setDecision(tempId, couche, 'homemade');
      global.JpToast?.ok?.('Édition maison enregistrée · ' + coucheLabel(couche));
      await refreshCurrent();
      renderAll();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  async function bulkDecide(status) {
    const couche = coucheKey();
    const pending = state.proposals.filter((n) =>
      n.action !== 'keep' && decisionOf(n.temp_id, couche) === 'pending'
    );
    if (!pending.length) return;
    try {
      state.busy = true;
      for (const node of pending) {
        if (status === 'rejected') {
          setDecision(node.temp_id, couche, 'rejected');
        } else {
          await writeDraftFromNode(node, couche, false);
          setDecision(node.temp_id, couche, 'accepted');
        }
      }
      await refreshCurrent();
      global.JpToast?.ok?.(
        status === 'rejected'
          ? ('Tout rejeté pour ' + coucheLabel(couche))
          : ('Tout validé pour ' + coucheLabel(couche))
      );
    } catch (e) {
      global.JpToast?.fromError?.(e);
    } finally {
      state.busy = false;
      renderAll();
    }
  }

  function emptyPayload(type) {
    if (type === 'texte') return { html: '<p></p>' };
    if (type === 'conseil') return { pathologie: '', corps_html: '<p></p>' };
    if (type === 'recommandation') {
      return { corps_html: '<p></p>', references: [] };
    }
    if (type === 'molecule') return { matrice_ids: [], mode: 'fiche' };
    if (type === 'photo') return { path: '', url: '', alt: '', legende: '' };
    if (type === 'video') return { url: '' };
    return {};
  }

  function sanitizeProposalPayload(layer, typeHint) {
    const type = (layer && layer.type) || typeHint || 'texte';
    const sanitize = global.JpStudioIA?.sanitizeHtml || ((h) => h);
    if (type === 'texte') return { html: sanitize(layer.html || '<p></p>') };
    if (type === 'conseil') {
      return {
        pathologie: String(layer.pathologie || '').slice(0, 160),
        corps_html: sanitize(layer.corps_html || '<p></p>'),
      };
    }
    if (type === 'recommandation') {
      return {
        corps_html: sanitize(layer.corps_html || '<p></p>'),
        references: Array.isArray(layer.references) ? layer.references : [],
        lien_label: String(layer.lien_label || '').slice(0, 120),
        lien_href: String(layer.lien_href || ''),
        lien_bloc_id: String(layer.lien_bloc_id || ''),
        lien_module_id: String(layer.lien_module_id || ''),
        lien_parcours_id: String(layer.lien_parcours_id || ''),
      };
    }
    if (type === 'photo') {
      return {
        path: String(layer.path || ''),
        url: String(layer.url || ''),
        alt: String(layer.alt || '').slice(0, 300),
        legende: String(layer.legende || '').slice(0, 300),
      };
    }
    if (type === 'video') return { url: String(layer.url || '') };
    if (type === 'molecule') {
      let ids = Array.isArray(layer.matrice_ids) ? layer.matrice_ids.filter(Boolean) : [];
      // DCI → matrice_id via cache rempli dans writeDraftFromNode
      if (!ids.length && Array.isArray(layer.dci) && state._molByDci) {
        layer.dci.forEach((d) => {
          const id = state._molByDci.get(String(d || '').trim().toLowerCase());
          if (id && ids.indexOf(id) === -1) ids.push(id);
        });
      }
      return {
        matrice_ids: ids,
        matrice_id: ids[0] || '',
        mode: 'fiche',
        valeurs: (layer.valeurs && typeof layer.valeurs === 'object') ? layer.valeurs : {},
      };
    }
    if (type === 'section') return {};
    return Object.assign({}, layer);
  }

  async function writeDraftFromNode(node, couche, _homemade) {
    const m = selectedModule();
    // Cache DCI → matrice pour les blocs molécule de la leçon
    if (m && !m.est_groupe && (!state._molByDci || state._molModuleId !== m.id)) {
      try {
        const mols = await lessonMolecules(m.id);
        state._molByDci = new Map(mols.map((x) => [x.dci.trim().toLowerCase(), x.id]));
        state._molModuleId = m.id;
      } catch (_) {
        state._molByDci = new Map();
      }
    }
    if (node.kind === 'chapitre' || node.kind === 'lecon') {
      const estGroupe = node.kind === 'chapitre';
      const payload = {
        titre: node.titre || 'Sans titre',
        resume: (node.payload && node.payload.resume) || '',
        niveau_min: node.niveau_min || 1,
        niveau_max: node.niveau_max || 5,
        est_groupe: estGroupe,
      };
      if (node.action === 'create' || !node.ref_id) {
        if (!state.parcoursId) throw new Error('Parcours manquant');
        const row = await rpc('v2_upsert_module', {
          p_payload: Object.assign({}, payload, {
            parcours_id: state.parcoursId,
            parent_id: resolveParentId(node) || (m && m.est_groupe ? m.id : (m && m.parent_id) || null),
            publie: false,
            statut: 'brouillon',
            ordre: (state.modules.reduce((mx, x) => Math.max(mx, x.ordre || 0), 0) || 0) + 10,
          }),
        });
        node.ref_id = row.id;
        state.sessionTouched[row.id] = 'module';
        state.modules = await loadModules(state.parcoursId);
      } else if (node.action === 'delete') {
        // Pas de suppression module auto — trop destructif ; on marque seulement
        global.JpToast?.warn?.('Suppression de chapitre/leçon : à faire dans le studio');
      } else {
        await rpc('v2_upsert_module', {
          p_payload: Object.assign({ id: node.ref_id }, payload),
        });
        state.sessionTouched[node.ref_id] = 'module';
        state.modules = await loadModules(state.parcoursId);
      }
      return;
    }

    // section / bloc
    if (!m || m.est_groupe) throw new Error('Sélectionnez une leçon pour valider un bloc');
    if (node.action === 'delete' && node.ref_id) {
      await rpc('v2_supprimer_bloc', { p_bloc_id: node.ref_id });
      state.sessionTouched[node.ref_id] = 'bloc-del';
      return;
    }

    const layer = layerPayload(node, couche);
    let typeBloc = layer.type || (node.kind === 'section' ? 'section' : 'texte');
    if (node.kind === 'section') typeBloc = 'section';
    if (typeBloc === 'jeu') throw new Error('Les blocs jeu ne sont pas gérés par l’IA Preview');

    const content = sanitizeProposalPayload(layer, typeBloc);
    const titre = node.titre || '';

    if (node.action === 'create' || !node.ref_id) {
      const basePay = emptyPayload(typeBloc);
      let payload;
      if (couche === 'base') {
        payload = Object.assign({}, basePay, content);
      } else {
        payload = Object.assign({}, basePay, {
          variantes: { [couche]: content },
        });
      }
      const pj = Object.assign({}, emptyPayload(typeBloc), {
        _brouillon: { titre, payload },
      });
      const row = await rpc('v2_upsert_bloc', {
        p_payload: {
          module_id: m.id,
          type_bloc: typeBloc,
          ordre: (state.currentBlocs.length + 1) * 10,
          payload_json: pj,
          visible: false,
          niveau_min: node.niveau_min || 1,
          niveau_max: node.niveau_max || 5,
        },
      });
      node.ref_id = row.id;
      state.sessionTouched[row.id] = 'bloc';
      return;
    }

    // update existant
    const b = currentBlocByRef(node.ref_id);
    if (!b) throw new Error('Bloc introuvable');
    const pub = global.JpLeconPlayer?.publishedPayload?.(b.payload_json) || {};
    const prevDraft = (b.payload_json && b.payload_json._brouillon) || null;
    const eff = Object.assign({}, pub, (prevDraft && prevDraft.payload) || {});
    let nextPayload;
    if (couche === 'base') {
      const { variantes } = eff;
      nextPayload = Object.assign({}, content);
      if (variantes) nextPayload.variantes = variantes;
    } else {
      const variantes = Object.assign({}, eff.variantes || {});
      variantes[couche] = content;
      nextPayload = Object.assign({}, eff, { variantes });
    }
    // Reclassement type (section ↔ autre) si demandé
    const newType = node.kind === 'section' ? 'section'
      : (typeBloc !== b.type_bloc && typeBloc !== 'jeu' ? typeBloc : b.type_bloc);

    const pj = Object.assign({}, pub, {
      _brouillon: {
        titre,
        payload: nextPayload,
      },
    });
    const upsert = {
      id: b.id,
      payload_json: pj,
      niveau_min: node.niveau_min || b.niveau_min || 1,
      niveau_max: node.niveau_max || b.niveau_max || 5,
    };
    if (newType !== b.type_bloc) upsert.type_bloc = newType;
    await rpc('v2_upsert_bloc', { p_payload: upsert });
    state.sessionTouched[b.id] = 'bloc';
  }

  function resolveParentId(node) {
    if (!node.parent_ref) return null;
    if (state.modules.some((m) => m.id === node.parent_ref)) return node.parent_ref;
    const parent = state.proposals.find((n) => n.temp_id === node.parent_ref);
    return parent && parent.ref_id ? parent.ref_id : null;
  }

  /* ——— IA invoke ——— */

  async function runIa(pane) {
    if (state.busy) return;
    const G = global.JpIaGemini;
    if (!G) return global.JpToast?.warn?.('Client IA indisponible');
    const instruction = pane.querySelector('#iaInstruction')?.value?.trim() || '';
    const text = pane.querySelector('#iaText')?.value?.trim() || '';
    const file = pane.querySelector('#iaPdf')?.files?.[0];
    const status = pane.querySelector('#iaStatus');
    function setStatus(msg, kind) {
      if (!status) return;
      status.hidden = !msg;
      status.className = 'jp-ia-status' + (kind ? ' is-' + kind : '');
      status.textContent = msg || '';
    }
    if (!instruction && !text && !file) {
      setStatus('Indiquez une instruction, un texte ou un PDF.', 'error');
      return;
    }
    if (file && file.size > (G.PDF_MAX_BYTES || 10e6)) {
      setStatus('PDF trop lourd (10 Mo maximum).', 'error');
      return;
    }
    const m = selectedModule();
    state.busy = true;
    const runBtn = pane.querySelector('#iaRun');
    if (runBtn) runBtn.disabled = true;
    try {
      setStatus('Préparation…', 'busy');
      const mols = m && !m.est_groupe ? await lessonMolecules(m.id).catch(() => []) : [];
      const body = {
        mode: 'modifier',
        instruction: instruction || undefined,
        text: text || undefined,
        pdfBase64: file ? await G.fileToBase64(file) : undefined,
        pdfName: file ? file.name : undefined,
        niveau: coucheKey(),
        cible: {
          parcours_id: state.parcoursId,
          module_id: m ? m.id : null,
        },
        context: {
          titre: m ? m.titre : (state.parcours?.libelle || ''),
          resume: m ? (m.resume || '') : '',
          molecules: mols.map((x) => x.dci),
          nodes: currentNodesForContext(),
        },
      };
      setStatus('Analyse IA…', 'busy');
      const ia = await G.invoke(G.FN_BLOCS, body);
      const nodes = Array.isArray(ia && ia.nodes) ? ia.nodes : [];
      if (!nodes.length) throw new Error('L’IA n’a proposé aucun nœud.');
      state.proposals = nodes;
      state.decisions = {};
      state.avertissements = Array.isArray(ia.avertissements) ? ia.avertissements : [];
      state.selectedTempId = nodes[0] ? nodes[0].temp_id : null;
      nodes.forEach((n) => {
        if (n.action === 'keep') {
          couchesForNode(n).forEach((c) => setDecision(n.temp_id, c, 'accepted'));
        }
      });
      void global.JpLogs?.action?.('preview_ia_modifier', {
        parcours_id: state.parcoursId,
        module_id: m?.id,
        count: nodes.length,
        model: ia.model || null,
      });
      setStatus('', '');
      const warns = state.avertissements.slice(0, 5);
      global.JpToast?.ok?.(nodes.length + ' proposition(s) IA');
      if (warns.length) global.JpToast?.warn?.(warns[0]);
      renderAll();
    } catch (e) {
      setStatus((e && e.message) || 'Erreur IA', 'error');
      global.JpToast?.fromError?.(e);
    } finally {
      state.busy = false;
      if (runBtn) runBtn.disabled = false;
      updatePendingChip();
    }
  }

  /* ——— Publier ——— */

  async function publishUpdate() {
    if (!allDecided() || !state.parcoursId) return;
    const btn = document.getElementById('btnPublishUpdate');
    if (btn) btn.disabled = true;
    state.busy = true;
    try {
      const res = await rpc('v2_publier_parcours', { p_parcours_id: state.parcoursId });
      state.sessionTouched = {};
      state.proposals = [];
      state.decisions = {};
      state.selectedTempId = null;
      await refreshCurrent();
      const n = Number(res?.lecons) || 0;
      global.JpToast?.ok?.(
        n ? ('Mise à jour publiée · ' + n + ' leçon(s)') : 'Mise à jour publiée'
      );
      void global.JpLogs?.action?.('preview_publier_maj', {
        parcours_id: state.parcoursId,
        n_lecons: n,
        blocs_promus: res?.blocs_promus,
      });
      renderAll();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    } finally {
      state.busy = false;
      updatePendingChip();
    }
  }

  /* ——— Impression ——— */

  async function doPrint() {
    const scope = state.printScope || 'lecon';
    const m = selectedModule();
    const title = (state.parcours?.libelle || 'Parcours')
      + (m ? (' — ' + (m.titre || '')) : '');
    try {
      let html = '';
      if (scope === 'lecon') {
        if (!m || m.est_groupe) {
          global.JpToast?.warn?.('Choisissez une leçon');
          return;
        }
        const host = document.createElement('div');
        await global.JpLeconPlayer.renderContent(host, {
          module: Object.assign({}, m, { parcours_id: state.parcoursId }),
          blocs: state.currentBlocs,
          preview: true,
          niveau: coucheKey() === 'base' ? null : Number(coucheKey()),
        });
        html = host.innerHTML;
      } else if (scope === 'chapitre') {
        const chap = m && m.est_groupe ? m
          : (m && m.parent_id ? state.modules.find((x) => x.id === m.parent_id) : null);
        if (!chap) {
          global.JpToast?.warn?.('Aucun chapitre pour cette leçon');
          return;
        }
        html = await buildChapterHtml(chap);
      } else {
        html = await buildParcoursHtml();
      }
      global.JpPrint.printHtml(html, {
        title,
        stylesheets: [
          '../css/app.css',
          '../css/player.css',
          '../css/print.css',
          '../css/preview-parcours.css',
        ],
      });
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  async function buildChapterHtml(chap) {
    const kids = state.modules
      .filter((x) => x.parent_id === chap.id && !x.est_groupe)
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    let html = '<h1>' + esc(chap.titre || '') + '</h1>'
      + (chap.resume ? '<p>' + esc(chap.resume) + '</p>' : '');
    for (const lecon of kids) {
      const blocs = await loadBlocs(lecon.id);
      const host = document.createElement('div');
      await global.JpLeconPlayer.renderContent(host, {
        module: Object.assign({}, lecon, { parcours_id: state.parcoursId }),
        blocs,
        preview: true,
        niveau: coucheKey() === 'base' ? null : Number(coucheKey()),
      });
      html += '<section class="jp-print-lecon">' + host.innerHTML + '</section>';
    }
    return html;
  }

  async function buildParcoursHtml() {
    const lecons = state.modules
      .filter((x) => !x.est_groupe)
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    let html = '<h1>' + esc(state.parcours?.libelle || '') + '</h1>';
    for (const lecon of lecons) {
      const blocs = await loadBlocs(lecon.id);
      const host = document.createElement('div');
      await global.JpLeconPlayer.renderContent(host, {
        module: Object.assign({}, lecon, { parcours_id: state.parcoursId }),
        blocs,
        preview: true,
        niveau: coucheKey() === 'base' ? null : Number(coucheKey()),
      });
      html += '<section class="jp-print-lecon">' + host.innerHTML + '</section>';
    }
    return html;
  }

  /* ——— Navigation / refresh ——— */

  async function selectModule(id) {
    state.selectedModuleId = id;
    await refreshCurrent();
    // Conserver les propositions mais resynchroniser l’affichage
    renderAll();
  }

  async function refreshCurrent() {
    const m = selectedModule();
    state.currentModule = m;
    if (m && !m.est_groupe) {
      state.currentBlocs = await loadBlocs(m.id);
    } else {
      state.currentBlocs = [];
    }
  }

  function renderAll() {
    const title = document.getElementById('previewTitle');
    if (title) {
      title.textContent = (state.parcours?.libelle || 'Preview')
        + (selectedModule() ? ' · ' + (selectedModule().titre || '') : '');
    }
    document.title = (state.parcours?.libelle || 'Preview') + ' — Preview';
    renderFloatBar();
    renderIaPane();
    void renderCenterPane();
    renderParamsPane();
    updatePendingChip();
  }

  async function boot(root) {
    const qs = new URLSearchParams(location.search);
    const parcoursId = qs.get('parcours');
    const moduleId = qs.get('module');
    if (!parcoursId) {
      root.innerHTML = '<p class="jp-muted" style="padding:2rem">Paramètre <code>parcours</code> manquant. '
        + '<a href="parcours.html">Retour au studio</a></p>';
      return;
    }
    state.parcoursId = parcoursId;
    root.innerHTML = shellHtml();
    document.getElementById('btnPublishUpdate')?.addEventListener('click', () => void publishUpdate());

    state.parcours = await loadParcours(parcoursId);
    if (!state.parcours) throw new Error('Parcours introuvable');
    state.modules = await loadModules(parcoursId);
    const initial = (moduleId && state.modules.find((m) => m.id === moduleId))
      || state.modules.find((m) => !m.est_groupe)
      || state.modules[0]
      || null;
    state.selectedModuleId = initial ? initial.id : null;
    await refreshCurrent();
    renderAll();
  }

  global.JpPreviewParcours = { boot };
})(window);
