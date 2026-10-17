/**
 * Surface Preview parcours — complémentaire du studio Structure/Contenu.
 * Comparaison 3 colonnes : proposition IA | paramètres + RTE | version actuelle.
 * Preview centrale ; Demande IA (modale) → miroir 3 colonnes. Barre Base|★ + Publier.
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
    parcoursList: [],
    selectedModuleId: null,
    couche: 'base',
    proposals: [],
    decisions: {},
    selectedTempId: null,
    currentBlocs: [],
    /** Cache leçonId → blocs[] (chapitre = toutes les leçons chargées). */
    blocsByModule: {},
    currentModule: null,
    sessionTouched: {},
    printScope: 'lecon',
    busy: false,
    avertissements: [],
    iaForm: { instruction: '', text: '' },
    editMode: false,
    editBase: 'ia', // ia | initial
    iaCtx: {
      includeCurrentParcours: true,
      extraParcoursId: '',
      extraChapitreId: '',
      extraLeconId: '',
    },
    _ctxPackCache: {},
    _molByDci: null,
    _molModuleId: null,
    _rte: null,
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

  /** Bouton « ? » → modale d’aide (même pattern que le reste de l’admin). */
  function attachHelp(host, title, lines) {
    if (!host || !global.JpModal?.helpButton) return;
    host.appendChild(global.JpModal.helpButton(title, lines));
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

  /* ——— Contexte IA (cible entière + références) ——— */

  function moduleToNode(mod) {
    return {
      temp_id: 'm:' + mod.id,
      kind: mod.est_groupe ? 'chapitre' : 'lecon',
      ref_id: mod.id,
      parent_ref: mod.parent_id || null,
      action: 'keep',
      titre: mod.titre || '',
      ordre: Number(mod.ordre) || 0,
      niveaux: { min: Number(mod.niveau_min) || 1, max: Number(mod.niveau_max) || 5 },
      payload: { resume: mod.resume || '' },
      variantes: {},
    };
  }

  function blocToNode(b, parentId) {
    const pub = global.JpLeconPlayer?.publishedPayload?.(b.payload_json) || {};
    const draft = (b.payload_json && b.payload_json._brouillon) || null;
    const eff = Object.assign({}, pub, (draft && draft.payload) || {});
    const kind = b.type_bloc === 'section' ? 'section' : 'bloc';
    return {
      temp_id: 'b:' + b.id,
      kind,
      ref_id: b.id,
      parent_ref: parentId,
      action: 'keep',
      titre: (draft && Object.prototype.hasOwnProperty.call(draft, 'titre') ? draft.titre : b.titre) || '',
      ordre: Number(b.ordre) || 0,
      niveaux: { min: Number(b.niveau_min) || 1, max: Number(b.niveau_max) || 5 },
      payload: Object.assign({ type: b.type_bloc }, eff),
      variantes: (eff.variantes && typeof eff.variantes === 'object') ? eff.variantes : {},
    };
  }

  /** Descendants leçons d’un chapitre (directs + imbriqués). */
  function lessonDescendants(chapitreId, modules) {
    const byParent = {};
    (modules || []).forEach((m) => {
      if (!m.parent_id) return;
      if (!byParent[m.parent_id]) byParent[m.parent_id] = [];
      byParent[m.parent_id].push(m);
    });
    const out = [];
    function walk(pid) {
      (byParent[pid] || []).forEach((m) => {
        if (m.est_groupe) walk(m.id);
        else out.push(m);
      });
    }
    walk(chapitreId);
    return out.sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
  }

  async function nodesForLesson(lecon, opts) {
    const full = !opts || opts.full !== false;
    const nodes = [moduleToNode(lecon)];
    if (!full) return nodes;
    const blocs = await loadBlocs(lecon.id);
    blocs.forEach((b) => nodes.push(blocToNode(b, lecon.id)));
    return nodes;
  }

  /** Chapitre entier = méta + toutes les leçons + tous leurs blocs. */
  async function nodesForChapter(chapitre, modules) {
    const nodes = [moduleToNode(chapitre)];
    const lecons = lessonDescendants(chapitre.id, modules);
    for (const lecon of lecons) {
      const part = await nodesForLesson(lecon, { full: true });
      nodes.push.apply(nodes, part);
    }
    return nodes;
  }

  /** Parcours : arbre modules ; si fullContent, blocs de chaque leçon. */
  async function nodesForParcours(parcoursMeta, modules, fullContent) {
    const nodes = (modules || []).map(moduleToNode);
    if (!fullContent) return { parcours: parcoursMeta, nodes };
    for (const mod of modules || []) {
      if (mod.est_groupe) continue;
      const blocs = await loadBlocs(mod.id);
      blocs.forEach((b) => nodes.push(blocToNode(b, mod.id)));
    }
    return { parcours: parcoursMeta, nodes };
  }

  async function loadParcoursPack(parcoursId) {
    if (!parcoursId) return null;
    if (state._ctxPackCache[parcoursId]) return state._ctxPackCache[parcoursId];
    const parcours = await loadParcours(parcoursId);
    const modules = await loadModules(parcoursId);
    const pack = { parcours, modules };
    state._ctxPackCache[parcoursId] = pack;
    return pack;
  }

  async function loadParcoursList() {
    const { data, error } = await sb()
      .from('parcours_apprentissage')
      .select('id, code, libelle')
      .order('libelle');
    if (error) throw error;
    return data || [];
  }

  /**
   * Cible (barre bas) toujours envoyée en entier ;
   * références optionnelles : autre parcours / chapitre / leçon.
   */
  async function buildIaPayloadContext() {
    const m = selectedModule();
    const parcoursMeta = {
      id: state.parcours?.id,
      code: state.parcours?.code,
      libelle: state.parcours?.libelle,
      description: state.parcours?.description || '',
    };

    let cibleType = 'parcours';
    let cibleNodes = [];
    let chapitre = null;
    let lecon = null;

    if (m) {
      if (m.est_groupe) {
        cibleType = 'chapitre';
        chapitre = { id: m.id, titre: m.titre, resume: m.resume || '' };
        cibleNodes = await nodesForChapter(m, state.modules);
      } else {
        cibleType = 'lecon';
        lecon = { id: m.id, titre: m.titre, resume: m.resume || '' };
        const parent = m.parent_id
          ? state.modules.find((x) => x.id === m.parent_id)
          : null;
        if (parent && parent.est_groupe) {
          chapitre = { id: parent.id, titre: parent.titre, resume: parent.resume || '' };
          // Chapitre parent en structure + leçon cible en entier
          cibleNodes = [moduleToNode(parent)].concat(await nodesForLesson(m, { full: true }));
        } else {
          cibleNodes = await nodesForLesson(m, { full: true });
        }
      }
    } else {
      const pack = await nodesForParcours(parcoursMeta, state.modules, true);
      cibleNodes = pack.nodes;
    }

    const references = [];
    const ctx = state.iaCtx;

    if (ctx.includeCurrentParcours) {
      const pack = await nodesForParcours(parcoursMeta, state.modules, false);
      references.push({
        role: 'parcours',
        label: parcoursMeta.libelle || 'Parcours courant',
        parcours: parcoursMeta,
        nodes: pack.nodes,
        note: 'Arbre du parcours courant (sans contenu des blocs — la cible ci-dessus est complète).',
      });
    }

    if (ctx.extraParcoursId && ctx.extraParcoursId !== state.parcoursId) {
      const pack = await loadParcoursPack(ctx.extraParcoursId);
      if (pack?.parcours) {
        const full = await nodesForParcours(
          {
            id: pack.parcours.id,
            code: pack.parcours.code,
            libelle: pack.parcours.libelle,
            description: pack.parcours.description || '',
          },
          pack.modules,
          true
        );
        references.push({
          role: 'parcours',
          label: pack.parcours.libelle || 'Autre parcours',
          parcours: full.parcours,
          nodes: full.nodes,
          note: 'Parcours de référence complet (leçons + blocs).',
        });
      }
    }

    if (ctx.extraChapitreId) {
      let chap = state.modules.find((x) => x.id === ctx.extraChapitreId);
      let mods = state.modules;
      if (!chap && ctx.extraParcoursId) {
        const pack = await loadParcoursPack(ctx.extraParcoursId);
        mods = pack?.modules || [];
        chap = mods.find((x) => x.id === ctx.extraChapitreId);
      }
      // Aussi chercher dans le cache de tous les packs chargés
      if (!chap) {
        for (const id of Object.keys(state._ctxPackCache)) {
          const pack = state._ctxPackCache[id];
          const found = (pack.modules || []).find((x) => x.id === ctx.extraChapitreId);
          if (found) { chap = found; mods = pack.modules; break; }
        }
      }
      if (chap && chap.est_groupe) {
        // Ne pas dupliquer si c’est déjà la cible
        if (!(m && m.id === chap.id)) {
          references.push({
            role: 'chapitre',
            label: chap.titre || 'Chapitre',
            nodes: await nodesForChapter(chap, mods),
            note: 'Chapitre de référence entier (leçons + blocs).',
          });
        }
      }
    }

    if (ctx.extraLeconId) {
      let lec = state.modules.find((x) => x.id === ctx.extraLeconId);
      if (!lec) {
        for (const id of Object.keys(state._ctxPackCache)) {
          const pack = state._ctxPackCache[id];
          const found = (pack.modules || []).find((x) => x.id === ctx.extraLeconId);
          if (found) { lec = found; break; }
        }
      }
      if (lec && !lec.est_groupe && !(m && m.id === lec.id)) {
        references.push({
          role: 'lecon',
          label: lec.titre || 'Leçon',
          nodes: await nodesForLesson(lec, { full: true }),
          note: 'Leçon de référence complète.',
        });
      }
    }

    return {
      parcours: parcoursMeta,
      chapitre: chapitre,
      lecon: lecon,
      titre: m ? m.titre : (parcoursMeta.libelle || ''),
      resume: m ? (m.resume || '') : (parcoursMeta.description || ''),
      cible: {
        type: cibleType,
        module_id: m ? m.id : null,
        parcours_id: state.parcoursId,
        nodes: cibleNodes,
      },
      references,
      molecules: await (async () => {
        if (!m) return [];
        if (!m.est_groupe) {
          return (await lessonMolecules(m.id).catch(() => [])).map((x) => x.dci);
        }
        const lecons = lessonDescendants(m.id, state.modules);
        const all = [];
        for (const lec of lecons) {
          const mols = await lessonMolecules(lec.id).catch(() => []);
          mols.forEach((x) => {
            if (x.dci && all.indexOf(x.dci) === -1) all.push(x.dci);
          });
        }
        return all;
      })(),
    };
  }

  function chapterOptionsHtml(modules, selectedId) {
    const chaps = (modules || []).filter((m) => m.est_groupe);
    let html = '<option value="">— Aucun —</option>';
    chaps.forEach((m) => {
      html += '<option value="' + esc(m.id) + '"'
        + (m.id === selectedId ? ' selected' : '') + '>'
        + esc(m.titre || '(sans titre)') + '</option>';
    });
    return html;
  }

  function lessonOptionsHtml(modules, selectedId) {
    const lecs = (modules || []).filter((m) => !m.est_groupe);
    let html = '<option value="">— Aucune —</option>';
    lecs.forEach((m) => {
      html += '<option value="' + esc(m.id) + '"'
        + (m.id === selectedId ? ' selected' : '') + '>'
        + esc(m.titre || '(sans titre)') + '</option>';
    });
    return html;
  }

  function modulesForCtxSelects() {
    const mods = state.modules.slice();
    const extraId = state.iaCtx.extraParcoursId;
    if (extraId && state._ctxPackCache[extraId]) {
      (state._ctxPackCache[extraId].modules || []).forEach((m) => {
        if (!mods.some((x) => x.id === m.id)) mods.push(m);
      });
    }
    return mods;
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
    if (!refId) return null;
    const local = state.currentBlocs.find((b) => b.id === refId);
    if (local) return local;
    const ids = Object.keys(state.blocsByModule || {});
    for (let i = 0; i < ids.length; i += 1) {
      const list = state.blocsByModule[ids[i]] || [];
      const found = list.find((b) => b.id === refId);
      if (found) return found;
    }
    return null;
  }

  function moduleForBlocRef(refId) {
    const b = currentBlocByRef(refId);
    if (!b) return selectedModule();
    return state.modules.find((m) => m.id === b.module_id) || selectedModule();
  }

  /** Leçon cible pour écrire un bloc (chapitre sélectionné OK si parent_ref / ref_id connus). */
  function resolveBlocModuleId(node) {
    if (!node) return null;
    if (node.ref_id) {
      const b = currentBlocByRef(node.ref_id);
      if (b && b.module_id) {
        const mod = state.modules.find((m) => m.id === b.module_id);
        if (mod && !mod.est_groupe) return mod.id;
        if (b.module_id) return b.module_id;
      }
    }
    if (node.parent_ref) {
      const mod = state.modules.find((m) => m.id === node.parent_ref);
      if (mod && !mod.est_groupe) return mod.id;
      const parent = state.proposals.find((n) => n.temp_id === node.parent_ref);
      if (parent && parent.kind === 'lecon' && parent.ref_id) return parent.ref_id;
      if (parent && parent.kind === 'lecon' && !parent.ref_id) {
        throw new Error('Validez d’abord la leçon parente avant ce bloc');
      }
    }
    const m = selectedModule();
    if (m && !m.est_groupe) return m.id;
    return null;
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

  /* ——— Miroir aligné (chapitre = leçons enchaînées) ——— */

  /** Épine « version actuelle » : chapitre → leçons → blocs, dans l’ordre. */
  function buildCurrentSpine() {
    const m = selectedModule();
    const spine = [];
    if (!m) return spine;

    if (m.est_groupe) {
      spine.push({ kind: 'chapitre', refId: m.id, moduleId: m.id });
      const lecons = lessonDescendants(m.id, state.modules);
      lecons.forEach((lec) => {
        spine.push({ kind: 'lecon', refId: lec.id, moduleId: lec.id, leconBanner: true });
        const blocs = (state.blocsByModule[lec.id] || []).slice()
          .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
        blocs.forEach((b) => {
          spine.push({
            kind: b.type_bloc === 'section' ? 'section' : 'bloc',
            refId: b.id,
            moduleId: lec.id,
          });
        });
      });
      return spine;
    }

    spine.push({ kind: 'lecon', refId: m.id, moduleId: m.id, leconBanner: false });
    const blocs = (state.currentBlocs || []).slice()
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    blocs.forEach((b) => {
      spine.push({
        kind: b.type_bloc === 'section' ? 'section' : 'bloc',
        refId: b.id,
        moduleId: m.id,
      });
    });
    return spine;
  }

  function buildMirrorRows() {
    const couche = coucheKey();
    const rows = [];
    const byRef = new Map();
    const creates = [];

    state.proposals.forEach((node) => {
      if (node.action === 'keep') return;
      const ref = node.ref_id || null;
      if (ref) byRef.set(ref, node);
      else creates.push(node);
    });

    const usedCreates = new Set();
    const spine = buildCurrentSpine();

    function pushProposalRow(node) {
      rows.push({
        tempId: node.temp_id,
        node,
        leftEmpty: node.action === 'delete',
        rightEmpty: node.action === 'create' || !node.ref_id,
        status: decisionOf(node.temp_id, couche),
        moduleId: null,
      });
    }

    function pushCurrentOnly(item) {
      rows.push({
        tempId: null,
        node: null,
        leftEmpty: true,
        rightEmpty: false,
        status: 'idle',
        refId: item.refId,
        kind: item.kind,
        moduleId: item.moduleId,
        leconBanner: !!item.leconBanner,
      });
    }

    // Créations sans parent_ref : en tête
    creates.filter((n) => !n.parent_ref).forEach((n) => {
      usedCreates.add(n.temp_id);
      pushProposalRow(n);
    });

    spine.forEach((item) => {
      // Insertions IA rattachées juste avant cet élément (parent_ref = refId)
      creates.filter((n) => n.parent_ref === item.refId && !usedCreates.has(n.temp_id)).forEach((n) => {
        usedCreates.add(n.temp_id);
        pushProposalRow(n);
      });

      const prop = byRef.get(item.refId);
      if (prop) {
        byRef.delete(item.refId);
        rows.push({
          tempId: prop.temp_id,
          node: prop,
          leftEmpty: prop.action === 'delete',
          rightEmpty: false,
          status: decisionOf(prop.temp_id, couche),
          moduleId: item.moduleId,
          leconBanner: !!item.leconBanner,
        });
      } else {
        pushCurrentOnly(item);
      }
    });

    // Propositions liées à des refs hors épine (autre leçon, etc.)
    byRef.forEach((node) => pushProposalRow(node));

    // Créations restantes (parent_ref inconnu)
    creates.filter((n) => !usedCreates.has(n.temp_id)).forEach((n) => pushProposalRow(n));

    return rows;
  }

  function emptySlotHtml(side) {
    const lab = side === 'left'
      ? 'Aucun contenu proposé'
      : 'Pas encore dans la version actuelle';
    return '<div class="jp-cmp-ghost" aria-hidden="true"><span class="jp-cmp-ghost-lab">'
      + esc(lab) + '</span></div>';
  }

  /* ——— Shell UI ——— */

  function shellHtml() {
    return '<div class="jp-preview-app" id="previewApp">'
      + '<header class="jp-preview-top no-print">'
      + '<a class="jp-btn jp-btn-ghost" href="parcours.html?parcours=' + esc(state.parcoursId || '') + '">← Studio</a>'
      + '<h1 class="jp-preview-title" id="previewTitle">Preview</h1>'
      + '<div class="jp-preview-top-actions">'
      + '<button type="button" class="jp-btn jp-btn-primary" id="btnDemandeIa">Demande IA</button>'
      + '<label class="jp-preview-print-wrap" title="Périmètre d’impression">'
      + '<select id="printScope" aria-label="Périmètre impression">'
      + '<option value="lecon"' + (state.printScope === 'lecon' ? ' selected' : '') + '>Leçon</option>'
      + '<option value="chapitre"' + (state.printScope === 'chapitre' ? ' selected' : '') + '>Chapitre</option>'
      + '<option value="parcours"' + (state.printScope === 'parcours' ? ' selected' : '') + '>Parcours</option>'
      + '</select></label>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnPrint" title="Imprimer">Imprimer</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="btnPublishUpdate" disabled'
      + ' title="Publie les brouillons du parcours quand toutes les décisions sont prises">'
      + 'Publier la mise à jour</button>'
      + '</div>'
      + '</header>'
      + '<div class="jp-preview-body" id="previewBody">'
      + '<div class="jp-cmp" id="cmpRoot"></div>'
      + '</div>'
      + '<footer class="jp-preview-bar no-print" id="floatBar" role="toolbar" aria-label="Couche et navigation">'
      + '</footer>'
      + '</div>';
  }

  function acceptLabel(node) {
    if (!node) return 'Valider';
    const isCreate = node.action === 'create' || !node.ref_id;
    if (isCreate) {
      if (node.kind === 'chapitre') return 'Ajouter ce chapitre';
      if (node.kind === 'lecon') return 'Ajouter cette leçon';
      if (node.kind === 'section') return 'Ajouter cette section';
      return 'Ajouter ce bloc';
    }
    if (node.action === 'delete') return 'Valider la suppression';
    return 'Valider la modification';
  }

  function rejectLabel(node) {
    if (!node) return 'Rejeter';
    if (node.action === 'create' || !node.ref_id) return 'Ne pas ajouter';
    if (node.action === 'delete') return 'Garder l’existant';
    return 'Rejeter la modification';
  }

  function destroyRte() {
    if (state._rte && typeof state._rte.destroy === 'function') {
      try { state._rte.destroy(); } catch (_) { /* ignore */ }
    }
    state._rte = null;
    const host = document.getElementById('cmpEditRte');
    if (host) host.innerHTML = '';
  }

  function moduleCardHtml(titre, resume, kindLab) {
    return '<div class="jp-cmp-mod-card">'
      + (kindLab ? '<p class="jp-cmp-mod-kind">' + esc(kindLab) + '</p>' : '')
      + '<h3 class="jp-cmp-mod-title">' + esc(titre || '(sans titre)') + '</h3>'
      + (resume ? '<p class="jp-cmp-mod-resume">' + esc(resume) + '</p>' : '')
      + '</div>';
  }

  function proposalPlayerHtml(node, couche) {
    if (!node || node.action === 'delete') return emptySlotHtml('left');
    if (node.kind === 'chapitre' || node.kind === 'lecon') {
      const layer = layerPayload(node, couche);
      return moduleCardHtml(node.titre, layer.resume || '', KIND_LABELS[node.kind]);
    }
    const layer = layerPayload(node, couche);
    const typeBloc = layer.type || (node.kind === 'section' ? 'section' : 'texte');
    const faux = {
      id: node.temp_id || 'ia',
      type_bloc: typeBloc,
      titre: node.titre || '',
      payload_json: layer,
    };
    const m = moduleForBlocRef(node.ref_id) || selectedModule() || {};
    const niveau = couche === 'base' ? null : Number(couche);
    if (!global.JpLeconPlayer?.blocArticleHtml) {
      return '<p class="jp-muted">Lecteur indisponible.</p>';
    }
    return global.JpLeconPlayer.blocArticleHtml(faux, {
      niveau,
      module: Object.assign({}, m, { parcours_id: state.parcoursId }),
      idPrefix: 'jp-ia-',
    }) || emptySlotHtml('left');
  }

  function currentPlayerHtml(refId, kind, couche) {
    if (!refId) return emptySlotHtml('right');
    if (kind === 'chapitre' || kind === 'lecon') {
      const mod = state.modules.find((x) => x.id === refId);
      if (!mod) return '<p class="jp-muted">(introuvable)</p>';
      return moduleCardHtml(mod.titre, mod.resume || '', KIND_LABELS[kind]);
    }
    const b = currentBlocByRef(refId);
    if (!b) return '<p class="jp-muted">(introuvable)</p>';
    const drafted = global.JpLeconPlayer?.withDraft
      ? global.JpLeconPlayer.withDraft(b)
      : b;
    const m = moduleForBlocRef(refId) || selectedModule() || {};
    const niveau = couche === 'base' ? null : Number(couche);
    if (!global.JpLeconPlayer?.blocArticleHtml) {
      return '<p class="jp-muted">Lecteur indisponible.</p>';
    }
    return global.JpLeconPlayer.blocArticleHtml(drafted, {
      niveau,
      module: Object.assign({}, m, { parcours_id: state.parcoursId }),
      idPrefix: 'jp-cur-',
    }) || emptySlotHtml('right');
  }

  /** Version actuelle complète d’un chapitre (toutes leçons + blocs), sans miroir. */
  function chapterFullCurrentHtml(chapitre, couche) {
    const niveau = couche === 'base' ? null : Number(couche);
    const lecons = lessonDescendants(chapitre.id, state.modules);
    let html = moduleCardHtml(chapitre.titre, chapitre.resume || '', 'Chapitre');
    lecons.forEach((lec) => {
      html += '<div class="jp-cmp-lecon-wrap">'
        + '<div class="jp-cmp-lecon-banner">' + esc(lec.titre || 'Leçon') + '</div>'
        + moduleCardHtml(lec.titre, lec.resume || '', 'Leçon');
      const blocs = (state.blocsByModule[lec.id] || []).slice()
        .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
      if (!blocs.length) {
        html += '<p class="jp-muted">Aucun bloc.</p>';
      } else if (global.JpLeconPlayer?.blocArticleHtml) {
        blocs.forEach((b) => {
          const drafted = global.JpLeconPlayer.withDraft
            ? global.JpLeconPlayer.withDraft(b)
            : b;
          html += global.JpLeconPlayer.blocArticleHtml(drafted, {
            niveau,
            module: Object.assign({}, lec, { parcours_id: state.parcoursId }),
            idPrefix: 'jp-cur-',
          }) || '';
        });
      }
      html += '</div>';
    });
    if (!lecons.length) html += '<p class="jp-muted">Aucune leçon dans ce chapitre.</p>';
    return html;
  }

  function editSourceLayer(node, couche, base) {
    if (base === 'ia') return layerPayload(node, couche);
    if (node.kind === 'chapitre' || node.kind === 'lecon') {
      const mod = node.ref_id ? state.modules.find((x) => x.id === node.ref_id) : null;
      return {
        resume: mod ? (mod.resume || '') : '',
        titre: mod ? (mod.titre || '') : (node.titre || ''),
      };
    }
    const b = node.ref_id ? currentBlocByRef(node.ref_id) : null;
    if (!b) return {};
    const drafted = global.JpLeconPlayer?.withDraft
      ? global.JpLeconPlayer.withDraft(b)
      : b;
    const p = drafted.payload_json || {};
    if (couche !== 'base' && p.variantes && p.variantes[String(couche)]) {
      return Object.assign({}, p, p.variantes[String(couche)]);
    }
    const { variantes: _v, ...rest } = p;
    return rest;
  }

  function mountCmpRte(node) {
    destroyRte();
    const host = document.getElementById('cmpEditRte');
    if (!host || !node || !global.JpStudioRichtext?.mount) return;
    if (node.kind === 'chapitre' || node.kind === 'lecon') return;
    const couche = coucheKey();
    const layer = editSourceLayer(node, couche, state.editBase);
    const type = layer.type || (node.kind === 'section' ? 'section' : 'texte');
    if (type !== 'texte' && type !== 'conseil' && type !== 'recommandation') return;
    const html = type === 'texte'
      ? (layer.html || '<p></p>')
      : (layer.corps_html || '<p></p>');
    const niveau = couche === 'base' ? null : Number(couche);
    state._rte = global.JpStudioRichtext.mount(host, html, {
      inheritLevel: niveau,
    });
  }

  function hydrateCmpHost(host) {
    if (!host) return;
    if (global.JpBlocPhoto) global.JpBlocPhoto.hydrate(host);
  }

  function renderFloatBar() {
    const bar = document.getElementById('floatBar');
    if (!bar) return;
    const couche = coucheKey();
    const hasProp = state.proposals.length > 0;
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
      + (hasProp
        ? '<div class="jp-preview-bar-bulk">'
          + '<button type="button" class="jp-btn jp-btn-ghost jp-btn-sm" id="iaRejectAll">Tout rejeter</button>'
          + '<button type="button" class="jp-btn jp-btn-ghost jp-btn-sm" id="iaAcceptAll">Tout valider</button>'
          + '</div>'
        : '')
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
    bar.querySelector('#iaRejectAll')?.addEventListener('click', () => void bulkDecide('rejected'));
    bar.querySelector('#iaAcceptAll')?.addEventListener('click', () => void bulkDecide('accepted'));
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

  function syncIaFormFromDom(pane) {
    if (!pane) return;
    const instr = pane.querySelector('#iaInstruction');
    const text = pane.querySelector('#iaText');
    if (instr) state.iaForm.instruction = instr.value;
    if (text) state.iaForm.text = text.value;
  }

  function syncIaCtxFromDom(pane) {
    if (!pane) return;
    const cur = pane.querySelector('#iaCtxParcoursCourant');
    if (cur) state.iaCtx.includeCurrentParcours = !!cur.checked;
    const ep = pane.querySelector('#iaCtxExtraParcours');
    if (ep) state.iaCtx.extraParcoursId = ep.value || '';
    const ec = pane.querySelector('#iaCtxExtraChapitre');
    if (ec) state.iaCtx.extraChapitreId = ec.value || '';
    const el = pane.querySelector('#iaCtxExtraLecon');
    if (el) state.iaCtx.extraLeconId = el.value || '';
  }

  function iaCtxFormHtml() {
    const ctx = state.iaCtx;
    const mods = modulesForCtxSelects();
    const otherParcours = (state.parcoursList || []).filter((p) => p.id !== state.parcoursId);
    return '<fieldset class="jp-ia-ctx">'
      + '<legend>Contexte envoyé à l’IA <span data-help="ia-ctx"></span></legend>'
      + '<p class="jp-muted jp-ia-ctx-lead">La leçon / le chapitre choisi dans la barre est toujours envoyé en entier (blocs + ordre). Ci-dessous : références optionnelles.</p>'
      + '<label class="jp-ia-ctx-check">'
      + '<input type="checkbox" id="iaCtxParcoursCourant"'
      + (ctx.includeCurrentParcours ? ' checked' : '') + '>'
      + ' Inclure l’arbre du parcours courant</label>'
      + '<div class="jp-field"><label for="iaCtxExtraParcours">Parcours de référence (complet)</label>'
      + '<select id="iaCtxExtraParcours">'
      + '<option value="">— Aucun —</option>'
      + otherParcours.map((p) =>
        '<option value="' + esc(p.id) + '"'
        + (p.id === ctx.extraParcoursId ? ' selected' : '') + '>'
        + esc(p.libelle || p.code || p.id) + '</option>'
      ).join('')
      + '</select></div>'
      + '<div class="jp-field"><label for="iaCtxExtraChapitre">Chapitre de référence (entier)</label>'
      + '<select id="iaCtxExtraChapitre">'
      + chapterOptionsHtml(mods, ctx.extraChapitreId)
      + '</select></div>'
      + '<div class="jp-field"><label for="iaCtxExtraLecon">Leçon de référence (complète)</label>'
      + '<select id="iaCtxExtraLecon">'
      + lessonOptionsHtml(mods, ctx.extraLeconId)
      + '</select></div>'
      + '</fieldset>';
  }

  function bindIaCtxControls(pane) {
    const onCtx = () => syncIaCtxFromDom(pane);
    pane.querySelector('#iaCtxParcoursCourant')?.addEventListener('change', onCtx);
    pane.querySelector('#iaCtxExtraChapitre')?.addEventListener('change', onCtx);
    pane.querySelector('#iaCtxExtraLecon')?.addEventListener('change', onCtx);
    pane.querySelector('#iaCtxExtraParcours')?.addEventListener('change', (ev) => {
      const id = ev.target.value || '';
      state.iaCtx.extraParcoursId = id;
      void (async () => {
        if (id) {
          try { await loadParcoursPack(id); }
          catch (e) { global.JpToast?.fromError?.(e); }
        }
        syncIaFormFromDom(pane);
        // Rafraîchir les listes chapitre / leçon dans la modale
        const chap = pane.querySelector('#iaCtxExtraChapitre');
        const lec = pane.querySelector('#iaCtxExtraLecon');
        const mods = modulesForCtxSelects();
        if (chap) chap.innerHTML = chapterOptionsHtml(mods, state.iaCtx.extraChapitreId);
        if (lec) lec.innerHTML = lessonOptionsHtml(mods, state.iaCtx.extraLeconId);
      })();
    });
  }

  function iaDemandFormNode() {
    const G = global.JpIaGemini;
    const form = state.iaForm;
    const wrap = document.createElement('div');
    wrap.className = 'jp-ia-demand-form';
    wrap.innerHTML = '<p class="jp-preview-ia-prompt-link">'
      + '<button type="button" class="jp-link-btn" id="iaEditPrompt">Modifier le prompt de base</button>'
      + ' <span data-help="ia"></span></p>'
      + '<div class="jp-field"><label for="iaInstruction">Instruction</label>'
      + '<textarea id="iaInstruction" rows="4" maxlength="8000" placeholder="Ex. Enrichir la leçon pour ★1…">'
      + esc(form.instruction || '') + '</textarea></div>'
      + iaCtxFormHtml()
      + '<div class="jp-field"><label for="iaText">Texte complémentaire (optionnel)</label>'
      + '<textarea id="iaText" rows="3" maxlength="' + (G?.TEXT_MAX_CHARS || 80000) + '">'
      + esc(form.text || '') + '</textarea></div>'
      + '<div class="jp-field"><label for="iaPdf">PDF (optionnel, 10 Mo)</label>'
      + '<input id="iaPdf" type="file" accept="application/pdf,.pdf"></div>'
      + '<div class="jp-ia-status" id="iaStatus" role="status" aria-live="polite" hidden></div>';
    bindIaCtxControls(wrap);
    attachHelp(wrap.querySelector('[data-help="ia"]'), 'Demande IA', [
      'La leçon ou le chapitre sélectionné (barre du bas) est envoyé en entier à l’IA : titres, résumés, blocs, HTML, ordre actuel.',
      'L’IA peut modifier, réordonner, ajouter ou proposer de supprimer à partir de cet état.',
      'Après génération : validez ligne à ligne, puis publiez la mise à jour.',
    ]);
    attachHelp(wrap.querySelector('[data-help="ia-ctx"]'), 'Contexte envoyé à l’IA', [
      'Cible (obligatoire) : contenu actuel complet de la leçon ou du chapitre choisi dans la barre.',
      'Chapitre = toutes les leçons + tous leurs blocs, dans l’ordre.',
      'Références optionnelles : parcours / autre chapitre / autre leçon (contexte secondaire).',
    ]);
    wrap.querySelector('#iaEditPrompt')?.addEventListener('click', () => {
      if (!global.JpStudioIA?.editBasePrompt) {
        global.JpToast?.warn?.('Éditeur de prompt indisponible');
        return;
      }
      void global.JpStudioIA.editBasePrompt();
    });
    return wrap;
  }

  function openIaDemandModal() {
    if (!global.JpModal?.open) {
      global.JpToast?.warn?.('Modale indisponible');
      return;
    }
    const body = iaDemandFormNode();
    global.JpModal.open({
      title: 'Demande IA',
      body,
      panelClass: 'jp-modal-wide jp-modal-ia-demand',
      confirmLabel: 'Générer le pré-brouillon',
      cancelLabel: 'Fermer',
      focus: body.querySelector('#iaInstruction'),
      onConfirm: async () => {
        const ok = await runIa(body);
        if (!ok) return false; // garder la modale ouverte (erreur / validation)
        return undefined; // fermer
      },
    });
  }

  function midCompactHtml(r, couche) {
    const node = r.node;
    if (!node) {
      const kindLab = KIND_LABELS[r.kind] || r.kind || 'Contenu';
      let title = '';
      if (r.kind === 'chapitre' || r.kind === 'lecon') {
        const mod = state.modules.find((x) => x.id === r.refId);
        title = mod ? (mod.titre || '') : '';
      } else {
        const b = currentBlocByRef(r.refId);
        title = b ? (b.titre || TYPE_LABEL(b.type_bloc)) : '';
      }
      return '<div class="jp-cmp-mid-idle">'
        + '<span class="jp-cmp-mid-kind">' + esc(kindLab) + '</span>'
        + '<span class="jp-cmp-mid-title">' + esc(title || 'Version actuelle') + '</span>'
        + '<span class="jp-cmp-mid-st">conservé · ' + coucheLabel(couche) + '</span>'
        + '</div>';
    }
    const on = node.temp_id === state.selectedTempId ? ' is-selected' : '';
    const st = r.status;
    const stLab = st === 'accepted' || st === 'homemade' ? 'validé'
      : (st === 'rejected' ? 'rejeté' : 'en attente');
    return '<button type="button" class="jp-cmp-mid-compact' + on + ' is-' + esc(st)
      + '" data-select-temp="' + esc(node.temp_id) + '">'
      + '<span class="jp-cmp-mid-kind">' + esc(KIND_LABELS[node.kind] || node.kind) + '</span>'
      + '<span class="jp-cmp-mid-act">' + esc(ACTION_LABELS[node.action] || node.action) + '</span>'
      + '<span class="jp-cmp-mid-title">' + esc(node.titre || '(sans titre)') + '</span>'
      + '<span class="jp-cmp-mid-st">' + esc(stLab) + ' · ' + coucheLabel(couche) + '</span>'
      + '</button>';
  }

  function midSelectedHtml(node, couche) {
    const st = decisionOf(node.temp_id, couche);
    const stLab = st === 'accepted' || st === 'homemade' ? 'validé'
      : (st === 'rejected' ? 'rejeté' : 'en attente');
    const layer = layerPayload(node, couche);
    const typeHint = layer.type || (node.kind === 'section' ? 'section' : 'texte');
    const src = editSourceLayer(node, couche, state.editBase);

    let html = '<div class="jp-cmp-mid-panel">'
      + '<p class="jp-cmp-mid-status">' + esc(stLab) + ' · ' + coucheLabel(couche)
      + ' <span data-help="cmp-mid"></span></p>'
      + '<div class="jp-field"><label for="paramKind">Type</label>'
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
      + '</div></div>';

    if (st === 'pending' && !state.editMode) {
      html += '<div class="jp-preview-param-acts">'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-act="reject">'
        + esc(rejectLabel(node)) + '</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" data-act="accept">'
        + esc(acceptLabel(node)) + '</button>'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="paramEditStart">Modifier</button>'
        + '</div>';
    } else if (!state.editMode) {
      html += '<div class="jp-preview-param-acts">'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="paramEditStart">Modifier</button>'
        + '</div>';
    }

    if (state.editMode) {
      html += '<fieldset class="jp-cmp-edit-base">'
        + '<legend>Base d’édition</legend>'
        + '<label><input type="radio" name="editBase" value="ia"'
        + (state.editBase === 'ia' ? ' checked' : '') + '> Proposition IA</label>'
        + '<label><input type="radio" name="editBase" value="initial"'
        + (state.editBase === 'initial' ? ' checked' : '') + '> Version initiale</label>'
        + '</fieldset>';

      if (node.kind === 'chapitre' || node.kind === 'lecon') {
        html += '<div class="jp-field"><label for="paramTitreEdit">Titre (édition)</label>'
          + '<input id="paramTitreEdit" type="text" value="'
          + esc(src.titre != null ? src.titre : (node.titre || '')) + '" maxlength="200"></div>'
          + '<div class="jp-field"><label for="paramResume">Résumé</label>'
          + '<textarea id="paramResume" rows="4">' + esc(src.resume || '') + '</textarea></div>';
      } else if (typeHint === 'conseil') {
        html += '<div class="jp-field"><label for="paramPathologie">Pathologie</label>'
          + '<input id="paramPathologie" type="text" value="'
          + esc(src.pathologie || '') + '" maxlength="160"></div>'
          + '<div class="jp-field"><label>Corps</label>'
          + '<div id="cmpEditRte" class="jp-cmp-rte"></div></div>';
      } else if (typeHint === 'recommandation') {
        html += '<div class="jp-field"><label>Corps</label>'
          + '<div id="cmpEditRte" class="jp-cmp-rte"></div></div>';
      } else if (typeHint === 'texte') {
        html += '<div class="jp-field"><label>Contenu</label>'
          + '<div id="cmpEditRte" class="jp-cmp-rte"></div></div>';
      } else {
        html += '<p class="jp-muted">Édition riche non disponible pour ce type (« '
          + esc(TYPE_LABEL(typeHint)) + ' »). Modifiez type/titre/plage puis validez.</p>';
      }

      html += '<div class="jp-preview-param-acts">'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="paramEditCancel">Annuler</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" id="paramHomemade">Enregistrer l’édition</button>'
        + '</div>';
    }

    html += '</div>';
    return html;
  }

  function bindMidPanel(root, node) {
    if (!root || !node) return;
    attachHelp(root.querySelector('[data-help="cmp-mid"]'), 'Paramètres', [
      'Reclassement type, titre et plage ★ pour la couche active.',
      'Validez, rejetez, ou modifiez avec l’éditeur (base IA ou version initiale).',
    ]);
    root.querySelectorAll('[data-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        void handleLineAction(node.temp_id, btn.getAttribute('data-act'));
      });
    });
    root.querySelector('#paramEditStart')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.editMode = true;
      state.editBase = 'ia';
      void renderCompare();
    });
    root.querySelector('#paramEditCancel')?.addEventListener('click', (e) => {
      e.stopPropagation();
      state.editMode = false;
      destroyRte();
      void renderCompare();
    });
    root.querySelectorAll('input[name="editBase"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        state.editBase = radio.value === 'initial' ? 'initial' : 'ia';
        const couche = coucheKey();
        const src = editSourceLayer(node, couche, state.editBase);
        if (node.kind === 'chapitre' || node.kind === 'lecon') {
          const t = document.getElementById('paramTitreEdit');
          const r = document.getElementById('paramResume');
          if (t) t.value = src.titre != null ? src.titre : (node.titre || '');
          if (r) r.value = src.resume || '';
        } else {
          const patho = document.getElementById('paramPathologie');
          if (patho) patho.value = src.pathologie || '';
          mountCmpRte(node);
        }
      });
    });
    root.querySelector('#paramHomemade')?.addEventListener('click', (e) => {
      e.stopPropagation();
      void handleHomemade(node.temp_id);
    });
    if (state.editMode) mountCmpRte(node);
  }

  async function renderCompare() {
    const root = document.getElementById('cmpRoot');
    if (!root) return;
    destroyRte();
    const couche = coucheKey();
    const m = selectedModule();
    const niveau = couche === 'base' ? null : Number(couche);

    if (!state.proposals.length) {
      root.innerHTML = '<div class="jp-preview-solo">'
        + '<div class="jp-preview-solo-head no-print">'
        + '<h2>Preview <span class="jp-preview-couche-badge">' + coucheLabel(couche) + '</span>'
        + ' <span data-help="solo"></span></h2>'
        + '<p class="jp-muted">Version actuelle · utilisez <strong>Demande IA</strong> pour comparer une proposition.</p>'
        + '</div>'
        + '<div class="jp-preview-player" id="cmpCurrentFull"></div>'
        + '</div>';
      attachHelp(root.querySelector('[data-help="solo"]'), 'Preview', [
        'Affiche la version actuelle (publié + brouillons validés) pour la couche de la barre flottante.',
        'Cliquez « Demande IA » pour ouvrir le formulaire, puis générer un pré-brouillon à comparer.',
      ]);
      const host = root.querySelector('#cmpCurrentFull');
      if (!host) return;
      if (!m) {
        host.innerHTML = '<p class="jp-muted">Choisissez une leçon ou un chapitre.</p>';
        return;
      }
      if (m.est_groupe) {
        host.innerHTML = chapterFullCurrentHtml(m, couche);
        hydrateCmpHost(host);
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
      return;
    }

    const rows = buildMirrorRows();
    let body = '<div class="jp-cmp-head no-print">'
      + '<div class="jp-cmp-col-lab">Proposition IA</div>'
      + '<div class="jp-cmp-col-lab">Paramètres <span data-help="cmp"></span></div>'
      + '<div class="jp-cmp-col-lab">Version actuelle · ' + coucheLabel(couche) + '</div>'
      + '</div>'
      + '<div class="jp-cmp-rows">';

    rows.forEach((r) => {
      const temp = r.node ? r.node.temp_id : (r.refId || '');
      const selected = !!(r.node && r.node.temp_id === state.selectedTempId);
      const kind = r.node ? r.node.kind : (r.kind || 'bloc');
      const leftEmpty = r.leftEmpty || (!r.node);
      const rightEmpty = r.rightEmpty || (r.node && (r.node.action === 'create' || !r.node.ref_id));

      let leftHtml;
      if (leftEmpty) leftHtml = emptySlotHtml('left');
      else if (r.node) leftHtml = proposalPlayerHtml(r.node, couche);
      else leftHtml = emptySlotHtml('left');

      let rightHtml;
      if (rightEmpty) rightHtml = emptySlotHtml('right');
      else if (r.node) rightHtml = currentPlayerHtml(r.node.ref_id, r.node.kind, couche);
      else rightHtml = currentPlayerHtml(r.refId, kind, couche);

      // Bandeau leçon (chapitre déroulé) sur les deux colonnes
      if (r.leconBanner && (kind === 'lecon' || (r.node && r.node.kind === 'lecon'))) {
        const modId = r.refId || (r.node && r.node.ref_id);
        const mod = state.modules.find((x) => x.id === modId);
        const banner = '<div class="jp-cmp-lecon-banner">' + esc(mod?.titre || 'Leçon') + '</div>';
        leftHtml = banner + leftHtml;
        rightHtml = banner + rightHtml;
      }

      const midHtml = selected && r.node
        ? midSelectedHtml(r.node, couche)
        : midCompactHtml(r, couche);
      const rowCls = 'jp-cmp-row'
        + (selected ? ' is-selected' : '')
        + (r.status && r.status !== 'idle' ? ' is-' + esc(r.status) : '')
        + (leftEmpty ? ' is-left-empty' : '')
        + (rightEmpty ? ' is-right-empty' : '')
        + (r.leconBanner ? ' is-lecon-start' : '');
      body += '<article class="' + rowCls + '"'
        + (r.node ? ' data-temp="' + esc(temp) + '"' : ' data-ref="' + esc(r.refId || '') + '"') + '>'
        + '<div class="jp-cmp-left jp-preview-player">' + leftHtml + '</div>'
        + '<div class="jp-cmp-mid">' + midHtml + '</div>'
        + '<div class="jp-cmp-right jp-preview-player">' + rightHtml + '</div>'
        + '</article>';
    });
    body += '</div>';
    root.innerHTML = body;

    attachHelp(root.querySelector('[data-help="cmp"]'), 'Comparaison', [
      'Gauche : proposition IA · Droite : version actuelle (publié + brouillons).',
      'Cliquez une ligne au centre pour valider, rejeter ou modifier.',
    ]);

    root.querySelectorAll('[data-select-temp]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.selectedTempId = btn.getAttribute('data-select-temp');
        state.editMode = false;
        void renderCompare();
      });
    });

    const selectedNode = state.proposals.find((n) => n.temp_id === state.selectedTempId) || null;
    const midEl = root.querySelector('.jp-cmp-row.is-selected .jp-cmp-mid');
    if (selectedNode && midEl) bindMidPanel(midEl, selectedNode);

    hydrateCmpHost(root);
  }

  function plageOpts(selected) {
    let html = '';
    for (let i = 1; i <= 5; i += 1) {
      html += '<option value="' + i + '"' + (Number(selected) === i ? ' selected' : '') + '>★' + i + '</option>';
    }
    return html;
  }

  function applyParamEdits(node) {
    // Uniquement si le panneau milieu affiche ce nœud
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

    if (!state.editMode) return;

    const couche = coucheKey();
    let layer = Object.assign({}, layerPayload(node, couche));

    if (node.kind === 'chapitre' || node.kind === 'lecon') {
      const titreEdit = document.getElementById('paramTitreEdit')?.value;
      const resume = document.getElementById('paramResume')?.value;
      if (titreEdit != null) node.titre = titreEdit;
      if (resume != null) layer.resume = resume;
    } else {
      const type = layer.type || (node.kind === 'section' ? 'section' : 'texte');
      if (state._rte && typeof state._rte.getHtml === 'function') {
        const html = state._rte.getHtml();
        if (type === 'texte') layer.html = html;
        else if (type === 'conseil' || type === 'recommandation') layer.corps_html = html;
      }
      const patho = document.getElementById('paramPathologie')?.value;
      if (patho != null && type === 'conseil') layer.pathologie = patho;
    }

    if (couche === 'base') {
      node.payload = layer;
    } else {
      if (!node.variantes) node.variantes = {};
      node.variantes[couche] = layer;
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
        global.JpToast?.ok?.(rejectLabel(node) + ' · ' + coucheLabel(couche));
      } else if (act === 'accept') {
        applyParamEdits(node);
        await writeDraftFromNode(node, couche, false);
        setDecision(tempId, couche, 'accepted');
        global.JpToast?.ok?.(acceptLabel(node) + ' · ' + coucheLabel(couche));
        await refreshCurrent();
      }
      state.editMode = false;
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
      state.editMode = false;
      global.JpToast?.ok?.('Édition enregistrée · ' + coucheLabel(couche));
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
    // Chapitres → leçons → blocs (parents avant enfants)
    const kindRank = { chapitre: 0, lecon: 1, section: 2, bloc: 3 };
    pending.sort((a, b) => (kindRank[a.kind] ?? 9) - (kindRank[b.kind] ?? 9));
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

    // section / bloc — rattacher à la leçon (même si un chapitre est sélectionné)
    const lessonId = resolveBlocModuleId(node);
    if (!lessonId) {
      throw new Error('Impossible de rattacher ce bloc à une leçon (parent manquant)');
    }
    if (!state._molByDci || state._molModuleId !== lessonId) {
      try {
        const mols = await lessonMolecules(lessonId);
        state._molByDci = new Map(mols.map((x) => [x.dci.trim().toLowerCase(), x.id]));
        state._molModuleId = lessonId;
      } catch (_) {
        state._molByDci = new Map();
        state._molModuleId = lessonId;
      }
    }
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
    const lessonBlocs = state.blocsByModule[lessonId]
      || (m && m.id === lessonId ? state.currentBlocs : null)
      || [];

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
          module_id: lessonId,
          type_bloc: typeBloc,
          ordre: (lessonBlocs.length + 1) * 10,
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

  /** @returns {Promise<boolean>} true si propositions prêtes (fermer la modale). */
  async function runIa(pane) {
    if (state.busy) return false;
    const G = global.JpIaGemini;
    if (!G) {
      global.JpToast?.warn?.('Client IA indisponible');
      return false;
    }
    if (!pane) return false;
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
      return false;
    }
    if (file && file.size > (G.PDF_MAX_BYTES || 10e6)) {
      setStatus('PDF trop lourd (10 Mo maximum).', 'error');
      return false;
    }
    const m = selectedModule();
    syncIaFormFromDom(pane);
    syncIaCtxFromDom(pane);
    state.busy = true;
    try {
      setStatus('Préparation du contexte…', 'busy');
      const context = await buildIaPayloadContext();
      const body = {
        mode: 'modifier',
        instruction: instruction || undefined,
        text: text || undefined,
        pdfBase64: file ? await G.fileToBase64(file) : undefined,
        pdfName: file ? file.name : undefined,
        niveau: coucheKey(),
        cible: {
          type: context.cible.type,
          parcours_id: context.cible.parcours_id,
          module_id: context.cible.module_id,
          chapitre: context.chapitre,
          lecon: context.lecon,
          // Contenu actuel complet (prioritaire côté Edge) — leçon ou chapitre entier
          nodes: context.cible.nodes,
        },
        context: {
          // nodes en premier : contenu actuel à modifier / réordonner
          nodes: context.cible.nodes,
          note_cible: 'nodes = CONTENU ACTUEL COMPLET de la cible sélectionnée '
            + '(leçon = tous les blocs dans l’ordre ; chapitre = toutes les leçons + tous leurs blocs). '
            + 'Conserve ref_id pour update/keep/delete ; change l’ordre du tableau nodes pour réordonner. '
            + 'references = contextes optionnels (ne remplacent pas la cible).',
          parcours: context.parcours,
          chapitre: context.chapitre,
          lecon: context.lecon,
          titre: context.titre,
          resume: context.resume,
          molecules: context.molecules,
          references: context.references,
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
      state.editMode = false;
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
      return true;
    } catch (e) {
      setStatus((e && e.message) || 'Erreur IA', 'error');
      global.JpToast?.fromError?.(e);
      return false;
    } finally {
      state.busy = false;
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
      state.editMode = false;
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
    state.blocsByModule = {};
    if (!m) {
      state.currentBlocs = [];
      return;
    }
    if (m.est_groupe) {
      state.currentBlocs = [];
      const lecons = lessonDescendants(m.id, state.modules);
      for (const lec of lecons) {
        state.blocsByModule[lec.id] = await loadBlocs(lec.id);
      }
      return;
    }
    state.currentBlocs = await loadBlocs(m.id);
    state.blocsByModule[m.id] = state.currentBlocs;
  }

  function renderAll() {
    const title = document.getElementById('previewTitle');
    if (title) {
      title.textContent = (state.parcours?.libelle || 'Preview')
        + (selectedModule() ? ' · ' + (selectedModule().titre || '') : '');
    }
    document.title = (state.parcours?.libelle || 'Preview') + ' — Preview';
    document.getElementById('previewBody')?.classList.toggle('has-compare', state.proposals.length > 0);
    renderFloatBar();
    void renderCompare();
    updatePendingChip();
  }

  function bindShellChrome() {
    document.getElementById('btnPublishUpdate')?.addEventListener('click', () => void publishUpdate());
    document.getElementById('btnPrint')?.addEventListener('click', () => void doPrint());
    document.getElementById('printScope')?.addEventListener('change', (ev) => {
      state.printScope = ev.target.value || 'lecon';
    });
    document.getElementById('btnDemandeIa')?.addEventListener('click', () => openIaDemandModal());
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
    bindShellChrome();

    state.parcours = await loadParcours(parcoursId);
    if (!state.parcours) throw new Error('Parcours introuvable');
    state.modules = await loadModules(parcoursId);
    try {
      state.parcoursList = await loadParcoursList();
    } catch (_) {
      state.parcoursList = state.parcours ? [state.parcours] : [];
    }
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
