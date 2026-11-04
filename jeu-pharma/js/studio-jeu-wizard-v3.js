/**
 * Wizard jeux V3 — parcours laboratoire uniquement (jeux / jeu_creer / jeu_maj).
 */
(function (global) {
  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    return data;
  }

  function champsActifsList() {
    if (typeof global.JpConstants?.champsActifs === 'function') {
      return global.JpConstants.champsActifs().map((c) => [c.code, c.libelle]);
    }
    return [
      ['indications', 'Indications'],
      ['contre_indications', 'Contre-indications'],
      ['effets_indesirables', 'Effets indésirables'],
      ['surveillances', 'Surveillances'],
    ];
  }

  const HYBRID_SOURCES = [
    { value: 'manuel', label: 'Texte libre' },
    { value: 'matrice', label: 'Molécule (DCI)' },
    { value: 'dcis', label: 'DCI' },
    { value: 'noms_commerciaux', label: 'Nom commercial' },
    { value: 'secteurs_therapeutiques', label: 'Secteur' },
    { value: 'classes_pharmacologiques', label: 'Classe pharmacologique' },
    { value: 'classes_therapeutiques', label: 'Classe thérapeutique' },
    { value: 'details_pharmacologie', label: 'Détail pharmacologie' },
    { value: 'posologies_generales', label: 'Posologie' },
    { value: 'grossesse_allaitement', label: 'Grossesse / allaitement' },
    { value: 'indications', label: 'Indication' },
    { value: 'contre_indications', label: 'Contre-indication' },
    { value: 'effets_indesirables', label: 'Effet indésirable' },
    { value: 'precautions_emploi', label: 'Précaution' },
    { value: 'interactions', label: 'Interaction' },
    { value: 'surveillances', label: 'Surveillance' },
    { value: 'voies_administration', label: 'Voie' },
    { value: 'conditions_prescription_delivrance', label: 'CPD' },
    { value: 'conseils_delivrance', label: 'Conseil délivrance' },
  ];

  const ENTITE_LIAISON = {
    classes_pharmacologiques: {
      liaison: 'matrice_classes_pharmacologiques', fk: 'classe_pharmacologique_id',
    },
    classes_therapeutiques: {
      liaison: 'matrice_classes_therapeutiques', fk: 'classe_therapeutique_id',
    },
    indications: { liaison: 'matrice_indications', fk: 'indication_id' },
    contre_indications: { liaison: 'matrice_contre_indications', fk: 'contre_indication_id' },
    effets_indesirables: { liaison: 'matrice_effets_indesirables', fk: 'effet_indesirable_id' },
    precautions_emploi: { liaison: 'matrice_precautions_emploi', fk: 'precaution_emploi_id' },
    interactions: { liaison: 'matrice_interactions', fk: 'interaction_id' },
    surveillances: { liaison: 'matrice_surveillances', fk: 'surveillance_id' },
    voies_administration: { liaison: 'matrice_voies_administration', fk: 'voie_administration_id' },
    conditions_prescription_delivrance: {
      liaison: 'matrice_conditions_prescription_delivrance',
      fk: 'condition_prescription_delivrance_id',
    },
    conseils_delivrance: { liaison: 'matrice_conseils_delivrance', fk: 'conseil_delivrance_id' },
    secteurs_therapeutiques: {
      liaison: 'matrice_secteurs_therapeutiques', fk: 'secteur_therapeutique_id',
    },
    noms_commerciaux: { liaison: 'matrice_noms_commerciaux', fk: 'nom_commercial_id' },
    details_pharmacologie: { fromMatrice: true, fk: 'detail_pharmacologie_id' },
    posologies_generales: { fromMatrice: true, fk: 'posologie_generale_id' },
    grossesse_allaitement: { fromMatrice: true, fk: 'grossesse_allaitement_id' },
    dcis: { fromMatrice: true, fk: 'dci_id' },
  };

  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 9);
  }

  function isRefItem(it) {
    return !!(it && it.entite && it.entite_id && it.source !== 'manuel');
  }

  function collectMatriceIdsFromPayload(payload) {
    const ids = new Set();
    function fromLayer(src) {
      if (!src || typeof src !== 'object') return;
      if (Array.isArray(src.matrice_ids)) {
        src.matrice_ids.forEach((id) => { if (id) ids.add(String(id)); });
      } else if (src.matrice_id) {
        ids.add(String(src.matrice_id));
      }
    }
    const p = payload && typeof payload === 'object' ? payload : {};
    fromLayer(p);
    const draft = p._brouillon && p._brouillon.payload;
    if (draft) fromLayer(draft);
    const variantes = p.variantes && typeof p.variantes === 'object' ? p.variantes : {};
    Object.keys(variantes).forEach((k) => fromLayer(variantes[k]));
    return Array.from(ids);
  }

  function tip(title) {
    return ' <span class="jp-tip" title="' + esc(title) + '" aria-label="' + esc(title) + '">?</span>';
  }

  const CLASSE_MODES = [
    { value: 'secteur', label: 'Secteur', entite: 'secteurs_therapeutiques' },
    { value: 'classe_thera', label: 'Classe théra.', entite: 'classes_therapeutiques' },
    { value: 'classe_pharma', label: 'Classe pharma.', entite: 'classes_pharmacologiques' },
  ];

  function classeModeMeta(mode) {
    return CLASSE_MODES.find((m) => m.value === mode) || null;
  }

  function idList(arr) {
    return (Array.isArray(arr) ? arr : []).map((x) => String(x || '')).filter(Boolean);
  }

  function filtreHasIds(f) {
    if (!f || typeof f !== 'object') return false;
    return idList(f.module_ids).length + idList(f.bloc_ids).length
      + idList(f.matrice_ids).length + idList(f.entite_ids).length > 0;
  }

  /** Filtre de tirage (leçon, bloc, molécules, secteur, classe). Jamais {}. */
  function normalizeFiltre(f) {
    const src = f && typeof f === 'object' ? f : {};
    const mode = src.mode || 'lecons';
    const out = { mode };
    const labels = idList(src.labels);
    if (labels.length) out.labels = (src.labels || []).map((x) => String(x || '')).filter(Boolean);
    if (mode === 'blocs') out.bloc_ids = idList(src.bloc_ids);
    else if (mode === 'molecules') out.matrice_ids = idList(src.matrice_ids);
    else if (classeModeMeta(mode) || mode === 'entite') {
      const meta = classeModeMeta(mode);
      out.entite = src.entite || (meta && meta.entite) || '';
      out.entite_ids = idList(src.entite_ids);
    } else {
      out.mode = 'lecons';
      out.module_ids = idList(src.module_ids);
    }
    return out;
  }

  function mountMolFilters(host, onChange) {
    const TA = global.JpTypeahead;
    host.innerHTML = '<div class="jp-split jp-split-3">'
      + '<div class="jp-field"><label>Secteur' + tip('Restreint la recherche') + '</label><div data-f="secteurs_therapeutiques"></div></div>'
      + '<div class="jp-field"><label>Classe théra.</label><div data-f="classes_therapeutiques"></div></div>'
      + '<div class="jp-field"><label>Classe pharma.</label><div data-f="classes_pharmacologiques"></div></div>'
      + '</div>';
    const norms = {};
    host.querySelectorAll('[data-f]').forEach((el) => {
      const table = el.getAttribute('data-f');
      TA.combo(el, {
        search: TA.entiteSource(table, { limit: 8 }),
        minChars: 0,
        placeholder: '…',
        ariaLabel: 'Filtre',
        onChange: (it) => {
          const next = it
            ? ((it.data && it.data.valeur_norm) || TA.norm(it.label || ''))
            : null;
          if (norms[table] === next) return;
          norms[table] = next;
          if (onChange) onChange();
        },
      });
    });
    return {
      norms() {
        return {
          secteurNorm: norms.secteurs_therapeutiques || null,
          classeTherNorm: norms.classes_therapeutiques || null,
          classePharmaNorm: norms.classes_pharmacologiques || null,
        };
      },
    };
  }

  function freshRow(base, extra) {
    const row = Object.assign({}, extra || {}, base);
    if (extra && Object.prototype.hasOwnProperty.call(extra, 'item_ids')) row.item_ids = [];
    return row;
  }

  function checkedCodes(root, name) {
    return Array.from(root.querySelectorAll('input[name="' + name + '"]:checked')).map((el) => el.value);
  }

  function champsChecksHtml(name, selected, prefix) {
    const sel = new Set((selected || []).map(String));
    return '<div class="jp-quiz-admin-champs-grid">'
      + champsActifsList().map(([code, lib]) =>
        '<label class="jp-quiz-admin-champ"><input type="checkbox" name="' + name + '" value="'
        + code + '"' + (sel.has(code) ? ' checked' : '') + '> <span>' + esc(lib) + '</span></label>').join('')
      + '</div>';
  }

  async function loadPoolForJeu(jeuId) {
    const out = { mode: 'lecons', module_ids: [], bloc_ids: [], matrice_ids: [] };
    if (!jeuId) return out;
    const { data: poolRow } = await sb().from('jeux_pool').select('mode').eq('jeu_id', jeuId).maybeSingle();
    if (!poolRow) return out;
    out.mode = poolRow.mode || 'lecons';
    if (out.mode === 'lecons') {
      const { data } = await sb().from('jeux_pool_modules').select('module_id').eq('jeu_id', jeuId);
      out.module_ids = (data || []).map((r) => r.module_id).filter(Boolean);
    } else if (out.mode === 'blocs') {
      const { data } = await sb().from('jeux_pool_blocs').select('bloc_id').eq('jeu_id', jeuId);
      out.bloc_ids = (data || []).map((r) => r.bloc_id).filter(Boolean);
    } else if (out.mode === 'molecules') {
      const { data } = await sb().from('jeux_pool_molecules').select('matrice_id').eq('jeu_id', jeuId);
      out.matrice_ids = (data || []).map((r) => r.matrice_id).filter(Boolean);
    }
    return out;
  }

  /** Leçons de tous les parcours (pool cross-parcours, y compris DEUST). */
  async function loadGlobalLeafItems() {
    const { data, error } = await sb()
      .from('modules_cours')
      .select('id, titre, parent_id, est_groupe, parcours_id, parcours_apprentissage(libelle, code)')
      .eq('est_groupe', false)
      .order('titre');
    if (error) throw error;
    const parentIds = Array.from(new Set((data || []).map((m) => m.parent_id).filter(Boolean)));
    const parentMap = {};
    if (parentIds.length) {
      const { data: parents } = await sb().from('modules_cours').select('id, titre').in('id', parentIds);
      (parents || []).forEach((p) => { parentMap[p.id] = p.titre; });
    }
    return (data || []).map((m) => {
      const pa = m.parcours_apprentissage;
      const parcoursLib = (pa && (pa.libelle || pa.code)) || '';
      const chap = m.parent_id ? (parentMap[m.parent_id] || '') : '';
      return {
        id: m.id,
        label: m.titre,
        sub: [parcoursLib, chap].filter(Boolean).join(' · '),
        parcours_id: m.parcours_id,
      };
    });
  }

  /** Blocs molécule de toutes les leçons (cross-parcours). */
  async function loadGlobalMolBlocItems() {
    const { data, error } = await sb()
      .from('module_blocs')
      .select('id, module_id, titre, payload_json, type_bloc, modules_cours!inner(id, titre, parcours_id, parcours_apprentissage(libelle, code))')
      .eq('type_bloc', 'molecule')
      .order('ordre');
    if (error) throw error;
    return (data || []).map((b) => {
      const mod = b.modules_cours;
      const pa = mod && mod.parcours_apprentissage;
      const parcoursLib = (pa && (pa.libelle || pa.code)) || '';
      return {
        id: b.id,
        label: b.titre || 'Bloc molécule',
        sub: [parcoursLib, mod && mod.titre].filter(Boolean).join(' · '),
        module_id: b.module_id,
        payload_json: b.payload_json,
      };
    });
  }

  async function loadMatriceLabels(ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean).map(String)));
    const map = {};
    if (!uniq.length) return map;
    const { data, error } = await sb()
      .from('v_medicaments_liste')
      .select('id, dci, noms_commerciaux')
      .in('id', uniq);
    if (error) throw error;
    (data || []).forEach((r) => {
      const noms = global.JpTypeahead?.nomsToText?.(r.noms_commerciaux) || '';
      map[String(r.id)] = r.dci || noms || String(r.id);
    });
    return map;
  }

  async function loadEntiteLabels(table, ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean).map(String)));
    const map = {};
    if (!uniq.length || !ENTITE_LIAISON[table]) return map;
    const { data, error } = await sb().from(table).select('id, valeur').in('id', uniq);
    if (error) throw error;
    (data || []).forEach((r) => { map[String(r.id)] = r.valeur || String(r.id); });
    return map;
  }

  async function loadMatriceEntityLinks(matriceIds) {
    const ids = Array.from(new Set((matriceIds || []).filter(Boolean).map(String)));
    const out = {};
    ids.forEach((id) => { out[id] = {}; });
    if (!ids.length) return out;
    try {
      const { data, error } = await sb().rpc('v2_liens_matrices_entites', { p_matrice_ids: ids });
      if (error) throw error;
      const raw = data && typeof data === 'object' ? data : {};
      ids.forEach((id) => {
        const tables = raw[id] || {};
        out[id] = {};
        Object.keys(ENTITE_LIAISON).forEach((table) => {
          const arr = tables[table];
          if (Array.isArray(arr) && arr.length) out[id][table] = arr.map(String);
        });
      });
      return out;
    } catch (_) { /* fallback below */ }
    await Promise.all(Object.keys(ENTITE_LIAISON).map(async (table) => {
      const meta = ENTITE_LIAISON[table];
      if (meta.fromMatrice) {
        const { data } = await sb().from('matrice_medicaments').select('id, ' + meta.fk).in('id', ids);
        (data || []).forEach((row) => {
          const mid = String(row.id);
          const eid = row[meta.fk] != null ? String(row[meta.fk]) : '';
          if (mid && eid && out[mid]) out[mid][table] = [eid];
        });
        return;
      }
      const { data } = await sb()
        .from(meta.liaison)
        .select('matrice_id, ' + meta.fk + ', ordre')
        .in('matrice_id', ids)
        .order('ordre', { ascending: true });
      (data || []).forEach((row) => {
        const mid = String(row.matrice_id);
        const eid = row[meta.fk] != null ? String(row[meta.fk]) : '';
        if (!mid || !eid || !out[mid]) return;
        if (!out[mid][table]) out[mid][table] = [];
        out[mid][table].push(eid);
      });
    }));
    return out;
  }

  async function loadMatriceIdsByEntities(entiteTable, entityIds) {
    const meta = ENTITE_LIAISON[entiteTable];
    const uniq = Array.from(new Set((entityIds || []).filter(Boolean).map(String)));
    const out = {};
    uniq.forEach((id) => { out[id] = []; });
    if (!meta || !uniq.length) return out;
    try {
      const { data, error } = await sb().rpc('v2_liens_matrices_entites', {
        p_entite_table: entiteTable, p_entite_ids: uniq,
      });
      if (error) throw error;
      const raw = data && typeof data === 'object' ? data : {};
      uniq.forEach((id) => {
        out[id] = Array.isArray(raw[id]) ? raw[id].map(String) : [];
      });
      return out;
    } catch (_) { /* fallback */ }
    if (meta.fromMatrice) {
      const { data } = await sb().from('matrice_medicaments').select('id, ' + meta.fk).in(meta.fk, uniq);
      (data || []).forEach((row) => {
        const eid = row[meta.fk] != null ? String(row[meta.fk]) : '';
        const mid = row.id != null ? String(row.id) : '';
        if (eid && mid && out[eid] && out[eid].indexOf(mid) < 0) out[eid].push(mid);
      });
    } else {
      const { data } = await sb()
        .from(meta.liaison)
        .select('matrice_id, ' + meta.fk)
        .in(meta.fk, uniq);
      (data || []).forEach((row) => {
        const eid = row[meta.fk] != null ? String(row[meta.fk]) : '';
        const mid = row.matrice_id != null ? String(row.matrice_id) : '';
        if (eid && mid && out[eid] && out[eid].indexOf(mid) < 0) out[eid].push(mid);
      });
    }
    return out;
  }

  function pickEquivalentsModal(parentEl, opts) {
    const multiple = !!opts.multiple;
    const candidates = opts.candidates || [];
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'jp-jeu-pick-overlay';
      modal.innerHTML = '<div class="jp-jeu-pick-sheet" role="dialog" aria-modal="true">'
        + '<h3 class="jp-quiz-admin-panel-title" style="margin-top:0">Équivalences</h3>'
        + '<p class="jp-muted">' + esc(opts.sourceLabel || 'Élément') + '</p>'
        + '<div class="jp-jeu-pick-list">'
        + candidates.map((c, i) => {
          const inp = multiple
            ? '<input type="checkbox" name="jw3Eq" value="' + esc(c.id) + '"' + (i === 0 ? ' checked' : '') + '>'
            : '<input type="radio" name="jw3Eq" value="' + esc(c.id) + '"' + (i === 0 ? ' checked' : '') + '>';
          return '<label class="jp-jeu-pick-opt">' + inp + ' <span>' + esc(c.label) + '</span></label>';
        }).join('')
        + '</div>'
        + '<div class="jp-jeu-pick-actions">'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-pick-cancel>Annuler</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" data-pick-ok>Valider</button>'
        + '</div></div>';
      (parentEl || document.body).appendChild(modal);
      function done(val) { modal.remove(); resolve(val); }
      modal.querySelector('[data-pick-cancel]').addEventListener('click', () => done(null));
      modal.querySelector('[data-pick-ok]').addEventListener('click', () => {
        const checked = Array.from(modal.querySelectorAll('input[name="jw3Eq"]:checked')).map((el) => el.value);
        if (!checked.length) {
          global.JpToast?.warn?.(multiple ? 'Sélectionnez au moins une valeur' : 'Sélectionnez une valeur');
          return;
        }
        done(multiple ? checked : [checked[0]]);
      });
    });
  }

  async function loadAssociationOptions(matriceIds) {
    const ids = Array.from(new Set((matriceIds || []).filter(Boolean).map(String)));
    if (!ids.length) return [];
    const { data, error } = await sb()
      .from('matrice_composants')
      .select('matrice_id, composant_matrice_id, ordre')
      .in('matrice_id', ids);
    if (error) throw error;
    const byAsso = {};
    (data || []).forEach((r) => {
      const aid = String(r.matrice_id);
      if (!byAsso[aid]) byAsso[aid] = [];
      byAsso[aid].push(String(r.composant_matrice_id));
    });
    const assoIds = Object.keys(byAsso).filter((id) => (byAsso[id] || []).length >= 2);
    if (!assoIds.length) {
      // aussi : associations dont les composants sont dans le pool
      const { data: inv } = await sb()
        .from('matrice_composants')
        .select('matrice_id, composant_matrice_id')
        .in('composant_matrice_id', ids);
      const invMap = {};
      (inv || []).forEach((r) => {
        const aid = String(r.matrice_id);
        if (!invMap[aid]) invMap[aid] = [];
        invMap[aid].push(String(r.composant_matrice_id));
      });
      Object.keys(invMap).forEach((aid) => {
        if ((invMap[aid] || []).length >= 2 && assoIds.indexOf(aid) < 0) assoIds.push(aid);
        byAsso[aid] = invMap[aid];
      });
    }
    if (!assoIds.length) return [];
    const labels = await loadMatriceLabels(assoIds);
    return assoIds.map((id) => ({
      id,
      label: labels[id] || id,
      composants: byAsso[id] || [],
      kind: 'asso',
    }));
  }

  /**
   * @param {{
   *   parcoursId: string,
   *   moduleId: string,
   *   modules: Array,
   *   defaultTitre?: string,
   *   jeuId?: string,
   *   modeleId?: string,
   *   blocId?: string,
   *   onCreated?: Function,
   *   onUpdated?: Function
   * }} opts
   */
  async function open(opts) {
    const { parcoursId, moduleId, modules } = opts;
    const editId = opts.jeuId || opts.modeleId || null;
    const linkBlocId = (!editId && opts.blocId) || null;
    const TA = global.JpTypeahead;
    const byId = {};
    (modules || []).forEach((m) => { byId[m.id] = m; });
    const leafItems = (modules || []).filter((m) => !m.est_groupe).map((m) => ({
      id: m.id,
      label: m.titre,
      sub: m.parent_id && byId[m.parent_id] ? byId[m.parent_id].titre : '',
    }));

    let existing = null;
    let typeCfg = null;
    let poolInit = { mode: 'lecons', module_ids: moduleId ? [moduleId] : [], bloc_ids: [], matrice_ids: [] };

    if (editId) {
      const { data, error } = await sb()
        .from('jeux')
        .select('id, code_unique, type_jeu, titre, parcours_id, module_ids, statut')
        .eq('id', editId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Jeu introuvable');
      existing = data;
      typeCfg = await rpc('jeu_type_config', { p_jeu_id: editId });
      poolInit = await loadPoolForJeu(editId);
    }

    const typeInit = (existing && existing.type_jeu) || 'quiz';
    const titreInit = (existing && existing.titre) || opts.defaultTitre || '';
    const champsList = champsActifsList();

    /* ——— State quiz ——— */
    const q0 = (typeInit === 'quiz' && typeCfg) ? typeCfg : {};
    let quizStyle = q0.style || 'manuel';
    const quizQuestions = Array.isArray(q0.questions)
      ? q0.questions.map((q) => ({
        id: q.id || uid('qm'),
        enonce: q.enonce || '',
        propositions: (Array.isArray(q.propositions) && q.propositions.length
          ? q.propositions
          : [{ texte: '', est_correcte: true }, { texte: '', est_correcte: false }]
        ).map((p, i) => ({
          id: p.id || uid('p'),
          texte: p.texte || '',
          est_correcte: !!p.est_correcte || (i === 0 && !q.propositions),
        })),
        open: false,
      }))
      : [];
    let openQId = null;

    /* ——— State classement / appariement ——— */
    const classItems = Array.isArray(typeCfg?.items)
      ? typeCfg.items.map((it) => Object.assign({ id: uid('i'), label: '', source: 'manuel' }, it))
      : [];
    const classZones = Array.isArray(typeCfg?.zones)
      ? typeCfg.zones.map((z) => Object.assign({
        id: uid('z'), label: '', item_ids: [], source: 'manuel',
      }, z, { item_ids: Array.isArray(z.item_ids) ? z.item_ids.slice() : [] }))
      : [];
    const appGauche = Array.isArray(typeCfg?.gauche)
      ? typeCfg.gauche.map((it) => Object.assign({ id: uid('g'), label: '', source: 'manuel' }, it))
      : [];
    const appDroite = Array.isArray(typeCfg?.droite)
      ? typeCfg.droite.map((it) => Object.assign({ id: uid('d'), label: '', source: 'manuel' }, it))
      : [];
    const appPaires = {};
    const rawPaires = typeCfg?.paires;
    if (Array.isArray(rawPaires)) {
      rawPaires.forEach((p) => {
        if (p && p.gauche_id && p.droite_id) appPaires[p.gauche_id] = p.droite_id;
      });
    } else if (rawPaires && typeof rawPaires === 'object') {
      Object.keys(rawPaires).forEach((k) => { if (rawPaires[k]) appPaires[k] = rawPaires[k]; });
    }

    /* ——— State ordonnance besoins ——— */
    const ordoBesoins = Array.isArray(typeCfg?.besoins)
      ? typeCfg.besoins.map((b) => ({
        id: b.id || uid('b'),
        mode: b.mode || 'aleatoire',
        matrice_id: b.matrice_id || null,
        label: '',
        kind: (b.association_id || (b.filtre_json && b.filtre_json.kind === 'asso')) ? 'asso' : null,
        association_id: b.association_id || ((b.filtre_json && b.filtre_json.kind === 'asso') ? b.matrice_id : null),
        filtre_json: (b.filtre_json && typeof b.filtre_json === 'object') ? b.filtre_json : {},
      }))
      : [];

    /* ——— State fiche emplacements ——— */
    const ficheEmplacements = Array.isArray(typeCfg?.emplacements)
      ? typeCfg.emplacements.map((e) => ({
        id: e.id || uid('e'),
        mode: e.mode || 'aleatoire',
        matrice_id: e.matrice_id || null,
        label: e.label || '',
        ordre: e.ordre || 0,
      }))
      : [];

    /* ——— State grille trous ——— */
    const t0 = (typeInit === 'trous' && typeCfg) ? typeCfg : {};
    const f0 = (typeInit === 'fiche_aleatoire' && typeCfg) ? typeCfg : {};
    const o0 = (typeInit === 'ordonnance' && typeCfg) ? typeCfg : {};
    const grilleState = {
      lignes: Array.isArray(t0.grille_json?.lignes) ? t0.grille_json.lignes.map(String) : [],
      trous: (t0.grille_json && typeof t0.grille_json.trous === 'object' && t0.grille_json.trous)
        ? Object.fromEntries(
          Object.keys(t0.grille_json.trous).map((k) => [
            k, Array.isArray(t0.grille_json.trous[k]) ? t0.grille_json.trous[k].map(String) : [],
          ])
        )
        : {},
      labels: {},
    };

    const quizChampsInit = Array.isArray(q0.champs) ? q0.champs : ['indications', 'contre_indications'];
    const trousColsInit = Array.isArray(t0.colonnes) ? t0.colonnes : [];
    const ficheChampsInit = Array.isArray(f0.champs) ? f0.champs : [];
    const ordoChampsInit = Array.isArray(o0.champs) ? o0.champs : [];

    const overlay = document.createElement('div');
    overlay.className = 'jp-studio-overlay';
    overlay.innerHTML = '<div class="jp-studio-sheet jp-jeu-sheet">'
      + '<header class="jp-studio-sheet-head"><h2>' + (editId ? 'Modifier le jeu' : 'Créer un jeu') + '</h2>'
      + (existing && existing.code_unique ? '<code>' + esc(existing.code_unique) + '</code>' : '')
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close aria-label="Fermer">×</button></header>'
      + '<div class="jp-jeu-wiz-body">'
      + '<div class="jp-field"><label>Type</label><select id="jw3Type"' + (editId ? ' disabled' : '') + '>'
      + '<option value="quiz">Quiz</option><option value="trous">Tableau à trous</option>'
      + '<option value="fiche_aleatoire">Fiche aléatoire</option><option value="ordonnance">Ordonnance</option>'
      + '<option value="classement">Classement</option><option value="appariement">Appariement</option>'
      + '</select></div>'
      + '<div class="jp-field"><label>Titre</label><input id="jw3Titre" maxlength="200" value="'
      + esc(titreInit) + '"></div>'
      + '<div class="jp-field"><span class="jp-field-label">Leçons liées'
      + tip('Rattachement pédagogique (hors pool de tirage)') + '</span>'
      + '<div id="jw3Mods"></div></div>'
      + '<div class="jp-field" id="jw3PoolBlock">'
      + '<label for="jw3PoolMode">Pool</label>'
      + '<select id="jw3PoolMode">'
      + '<option value="lecons">Leçon(s)</option>'
      + '<option value="blocs">Blocs molécule</option>'
      + '<option value="molecules">Molécules</option>'
      + '</select>'
      + '<div id="jw3PoolFilters" hidden style="margin-top:0.5rem"></div>'
      + '<div id="jw3PoolChips" style="margin-top:0.5rem"></div>'
      + '</div>'

      /* Quiz */
      + '<section class="jp-quiz-admin-panel" id="jw3Quiz" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Quiz</h3>'
      + '<div class="jp-field"><span class="jp-field-label">Style</span>'
      + '<div class="jp-split jp-split-3">'
      + '<label class="jp-quiz-admin-champ"><input type="radio" name="jw3Style" value="manuel"'
      + (quizStyle === 'manuel' ? ' checked' : '') + '> Manuel</label>'
      + '<label class="jp-quiz-admin-champ"><input type="radio" name="jw3Style" value="auto"'
      + (quizStyle === 'auto' ? ' checked' : '') + '> Auto</label>'
      + '<label class="jp-quiz-admin-champ"><input type="radio" name="jw3Style" value="mixte"'
      + (quizStyle === 'mixte' ? ' checked' : '') + '> Mixte</label>'
      + '</div></div>'
      + '<div class="jp-split jp-split-3">'
      + '<div class="jp-field" id="jw3NbQWrap"><label>Nb questions</label>'
      + '<input id="jw3NbQ" type="number" min="1" max="50" value="'
      + esc(String(q0.nb_questions || 10)) + '"></div>'
      + '<div class="jp-field" id="jw3NbManWrap" hidden><label>Nb manuelles</label>'
      + '<input id="jw3NbMan" type="number" min="0" max="50" value="'
      + esc(String(q0.nb_manuelles != null ? q0.nb_manuelles : 5)) + '"></div>'
      + '<div class="jp-field" id="jw3NbAutoWrap" hidden><label>Nb auto</label>'
      + '<input id="jw3NbAuto" type="number" min="0" max="50" value="'
      + esc(String(q0.nb_auto != null ? q0.nb_auto : 5)) + '"></div>'
      + '<div class="jp-field"><label>Propositions</label>'
      + '<input id="jw3NbProp" type="number" min="2" max="6" value="'
      + esc(String(q0.nb_propositions || 3)) + '"></div>'
      + '</div>'
      + '<div id="jw3QuizManuel">'
      + '<div id="jw3BankList" class="jp-jeu-manuelles"></div>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3AddQ">+ Question</button>'
      + '</div>'
      + '<div id="jw3QuizAuto" hidden>'
      + '<div class="jp-field"><span class="jp-field-label">Champs</span>'
      + champsChecksHtml('jw3QChamp', quizChampsInit) + '</div>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Sens' + tip('Direction de la question auto') + '</label>'
      + '<select id="jw3Sens">'
      + '<option value="mol_vers_valeur">Molécule → valeur</option>'
      + '<option value="valeur_vers_mol">Valeur → molécule</option>'
      + '<option value="les_deux">Les deux</option></select></div>'
      + '<div class="jp-field"><label>Difficulté</label><select id="jw3Diff">'
      + '<option value="1">1</option><option value="2">2</option><option value="3">3</option>'
      + '</select></div></div>'
      + '<div class="jp-v2-actions" style="margin-top:0.5rem">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3TestTirage" title="Aperçu sans enregistrer">Tester un tirage</button>'
      + '</div></div></section>'

      /* Trous */
      + '<section class="jp-quiz-admin-panel" id="jw3Trous" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Tableau à trous</h3>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Composition' + tip('Auto : trous tirés. Grille : cases choisies.') + '</label><select id="jw3TrousComp">'
      + '<option value="auto">Auto</option><option value="grille">Grille</option></select></div>'
      + '<div class="jp-field" id="jw3NbLignesWrap"><label>Nb lignes' + tip('Tirées dans le pool') + '</label>'
      + '<input id="jw3NbLignes" type="number" min="1" max="50" value="'
      + esc(String(t0.nb_lignes || 5)) + '"></div></div>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field" id="jw3LignesModeWrap"><label>Lignes' + tip('Aléatoire : N lignes. Groupe : tout le pool.') + '</label><select id="jw3LignesMode">'
      + '<option value="aleatoire">Aléatoire</option>'
      + '<option value="groupe">Groupe</option></select></div>'
      + '<div class="jp-field" id="jw3TauxWrap"><label>Cases vides (%)' + tip('Part des colonnes trouables masquées') + '</label>'
      + '<input id="jw3TauxTrous" type="number" min="0" max="100" step="5" value="'
      + esc(String(t0.taux_trous != null ? t0.taux_trous : 40)) + '"></div></div>'
      + '<div class="jp-field"><span class="jp-field-label">Colonnes' + tip('Visible : toujours affichée. Trouable : peut être masquée. DCI et nom : visibles par défaut.') + '</span>'
      + '<div class="jp-quiz-admin-champs-grid" id="jw3TrousCols">'
      + champsList.map(([code, lib]) => {
        const col = trousColsInit.find((c) => c.champ_code === code);
        const role = col
          ? col.role
          : (!trousColsInit.length && (code === 'dci' || code === 'nom_commercial') ? 'visible' : '');
        return '<div class="jp-quiz-admin-champ jp-jeu-col-role">'
          + '<span>' + esc(lib) + '</span> '
          + '<select data-col="' + code + '">'
          + '<option value="">—</option>'
          + '<option value="visible"' + (role === 'visible' ? ' selected' : '') + '>Visible</option>'
          + '<option value="trouable"' + (role === 'trouable' ? ' selected' : '') + '>Trouable</option>'
          + '</select></div>';
      }).join('')
      + '</div></div>'
      + '<div class="jp-field" id="jw3GrilleUi" hidden>'
      + '<span class="jp-field-label">Grille' + tip('Clic : trou ou visible. Lignes = pool.') + '</span>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3GrilleFromPool">Lignes du pool</button>'
      + '<div id="jw3GrilleTable" class="jp-table-wrap"></div>'
      + '</div>'
      + '</section>'

      /* Fiche */
      + '<section class="jp-quiz-admin-panel" id="jw3Fiche" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Fiche aléatoire</h3>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Composition' + tip('Auto : tirage. Manuel : un emplacement = fixe ou aléatoire.') + '</label><select id="jw3FicheComp">'
      + '<option value="auto">Auto</option><option value="manuel">Manuel</option></select></div>'
      + '<div class="jp-field" id="jw3NbFichesWrap"><label>Nb fiches' + tip('Ignoré en mode groupe') + '</label>'
      + '<input id="jw3NbFiches" type="number" min="1" max="30" value="'
      + esc(String(f0.nb_fiches || 5)) + '"></div></div>'
      + '<div class="jp-split jp-split-3" id="jw3FicheAutoOpts">'
      + '<div class="jp-field"><label>Fiches' + tip('Aléatoire : N fiches. Groupe : une fiche par molécule.') + '</label><select id="jw3FichesMode">'
      + '<option value="aleatoire">Aléatoire</option><option value="groupe">Groupe</option></select></div>'
      + '<div class="jp-field" id="jw3SeuilWrap"><label>Seuil' + tip('Note /10 à partir de laquelle la molécule compte comme sue') + '</label>'
      + '<input id="jw3Seuil" type="number" min="1" max="10" value="'
      + esc(String(f0.seuil_exclusion != null ? f0.seuil_exclusion : 8)) + '"></div>'
      + '<div class="jp-field" id="jw3NbNotesWrap"><label>Nb notes' + tip('Notes ≥ seuil pour sortir du tirage auto') + '</label>'
      + '<input id="jw3NbNotes" type="number" min="1" max="10" value="'
      + esc(String(f0.nb_notes_exclusion || 3)) + '"></div></div>'
      + '<div class="jp-field"><span class="jp-field-label">Champs' + tip('Visible avant révélation, ou à restituer. Défaut : DCI et nom.') + '</span>'
      + '<div class="jp-quiz-admin-champs-grid" id="jw3FicheChamps">'
      + champsList.map(([code, lib]) => {
        const ch = ficheChampsInit.find((c) => (c.champ_code || c) === code);
        const savedRole = ch && typeof ch === 'object' ? (ch.role || '') : (ch ? 'restituer' : '');
        const role = savedRole || (!ficheChampsInit.length && (code === 'dci' || code === 'nom_commercial') ? 'visible' : '');
        return '<div class="jp-quiz-admin-champ jp-jeu-col-role">'
          + '<span>' + esc(lib) + '</span> '
          + '<select data-fchamp="' + code + '">'
          + '<option value="">—</option>'
          + '<option value="visible"' + (role === 'visible' ? ' selected' : '') + '>Visible</option>'
          + '<option value="restituer"' + (role === 'restituer' ? ' selected' : '') + '>Restituer</option>'
          + '</select></div>';
      }).join('')
      + '</div></div>'
      + '<div class="jp-field" id="jw3EmpUi" hidden>'
      + '<span class="jp-field-label">Emplacements</span>'
      + '<div id="jw3EmpList"></div>'
      + '<div class="jp-split jp-split-2" style="margin-top:0.35rem">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3AddEmpAlea">+ Aléatoire</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3AddEmpFixe">+ Fixe</button>'
      + '</div>'
      + '<div id="jw3EmpFixeTa" class="jp-field" hidden><label>Molécule</label><div id="jw3EmpMat"></div></div>'
      + '</div></section>'

      /* Ordonnance */
      + '<section class="jp-quiz-admin-panel" id="jw3Ordo" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Ordonnance</h3>'
      + '<label class="jp-quiz-admin-champ"><input type="checkbox" id="jw3Assoc"'
      + (o0.associations_possibles ? ' checked' : '') + '> Associations possibles'
      + tip('Une association du sélecteur peut couvrir plusieurs lignes. Sinon, encart vigilance.') + '</label>'
      + '<div class="jp-field"><span class="jp-field-label">Champs à restituer</span>'
      + champsChecksHtml('jw3OChamp', ordoChampsInit) + '</div>'
      + '<div class="jp-field"><span class="jp-field-label">Besoins</span>'
      + '<div id="jw3Besoins"></div>'
      + '<div class="jp-split jp-split-3" style="margin-top:0.5rem">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3AddBesoinAlea">+ Aléatoire</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3AddBesoinMan">+ Manuel</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3AddBesoinAsso" title="Ligne association fixe">+ Association</button>'
      + '</div>'
      + '<div id="jw3BesoinEdit" class="jp-field" hidden>'
      + '<label id="jw3BesoinEditLabel">Molécule</label>'
      + '<div id="jw3BesoinMat"></div>'
      + '<div id="jw3BesoinFiltre" style="margin-top:0.5rem" hidden>'
      + '<span class="jp-field-label">Filtre' + tip('Leçon, bloc, molécules ou classe. Appliqué au tirage.') + '</span>'
      + '<select id="jw3BesoinFiltreMode">'
      + '<option value="lecons">Leçon(s)</option>'
      + '<option value="blocs">Blocs</option>'
      + '<option value="molecules">Molécules</option>'
      + '<option value="secteur">Secteur</option>'
      + '<option value="classe_thera">Classe théra.</option>'
      + '<option value="classe_pharma">Classe pharma.</option></select>'
      + '<div id="jw3BesoinMolFilters" hidden style="margin-top:0.35rem"></div>'
      + '<div id="jw3BesoinFiltreChips" style="margin-top:0.35rem"></div>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="jw3BesoinFiltreOk" style="margin-top:0.35rem">Ajouter</button>'
      + '</div></div>'
      + '</div></section>'

      /* Classement */
      + '<section class="jp-quiz-admin-panel" id="jw3Classement" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Classement</h3>'
      + '<div class="jp-field"><label>Consigne</label>'
      + '<input id="jw3ClassConsigne" maxlength="300" value="'
      + esc((typeInit === 'classement' && typeCfg && typeCfg.consigne) || '') + '"></div>'
      + '<div class="jp-field"><span class="jp-field-label">Items</span>'
      + '<div class="jp-jeu-hybrid-add" id="jw3ClassItemAdd"></div></div>'
      + '<div id="jw3ClassItems" class="jp-jeu-list"></div>'
      + '<div class="jp-field" style="margin-top:0.75rem"><span class="jp-field-label">Zones</span>'
      + '<div class="jp-jeu-hybrid-add" id="jw3ClassZoneAdd"></div></div>'
      + '<div id="jw3ClassZones" class="jp-jeu-list"></div>'
      + '<div id="jw3ClassAssign" class="jp-jeu-assign" style="margin-top:1rem"></div>'
      + '</section>'

      /* Appariement */
      + '<section class="jp-quiz-admin-panel" id="jw3Appariement" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Appariement</h3>'
      + '<div class="jp-field"><label>Consigne</label>'
      + '<input id="jw3AppConsigne" maxlength="300" value="'
      + esc((typeInit === 'appariement' && typeCfg && typeCfg.consigne) || '') + '"></div>'
      + '<div class="jp-split jp-split-2">'
      + '<div><span class="jp-field-label">Gauche</span>'
      + '<div class="jp-jeu-hybrid-add" id="jw3AppGaucheAdd"></div>'
      + '<div id="jw3AppGauche" class="jp-jeu-list"></div></div>'
      + '<div><span class="jp-field-label">Droite</span>'
      + '<div class="jp-jeu-hybrid-add" id="jw3AppDroiteAdd"></div>'
      + '<div id="jw3AppDroite" class="jp-jeu-list"></div></div>'
      + '</div>'
      + '<div id="jw3AppPaires" class="jp-jeu-assign" style="margin-top:1rem"></div>'
      + '</section>'
      + '</div>'
      + '<footer class="jp-studio-sheet-foot">'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close>Annuler</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="jw3Save">'
      + (editId ? 'Enregistrer' : 'Créer le jeu') + '</button>'
      + '</footer></div>';

    document.body.appendChild(overlay);

    function close() { overlay.remove(); }
    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#jw3Type').value = typeInit;
    if (q0.sens_auto) overlay.querySelector('#jw3Sens').value = q0.sens_auto;
    if (q0.difficulte) overlay.querySelector('#jw3Diff').value = String(q0.difficulte);
    if (t0.lignes_mode === 'manuel' && t0.composition !== 'grille') {
      overlay.querySelector('#jw3TrousComp').value = 'grille';
    } else if (t0.composition) {
      overlay.querySelector('#jw3TrousComp').value = t0.composition;
    }
    if (t0.lignes_mode === 'aleatoire' || t0.lignes_mode === 'groupe') {
      overlay.querySelector('#jw3LignesMode').value = t0.lignes_mode;
    }
    if (f0.composition) overlay.querySelector('#jw3FicheComp').value = f0.composition;
    if (f0.fiches_mode) overlay.querySelector('#jw3FichesMode').value = f0.fiches_mode;
    overlay.querySelector('#jw3PoolMode').value = poolInit.mode || 'lecons';

    /* ——— Leçons liées ——— */
    const initialMods = existing && Array.isArray(existing.module_ids) && existing.module_ids.length
      ? leafItems.filter((it) => existing.module_ids.indexOf(it.id) >= 0)
      : leafItems.filter((it) => it.id === moduleId);
    const modChips = TA.chips(overlay.querySelector('#jw3Mods'), {
      search: TA.localSource(leafItems, { limit: 12 }),
      placeholder: 'Leçon…',
      ariaLabel: 'Leçons liées',
      initial: initialMods,
    });

    /* ——— Pool chips : cross-parcours (tous parcours) ——— */
    const [globalLeafItems, molBlocItems] = await Promise.all([
      loadGlobalLeafItems().catch(() => leafItems.slice()),
      loadGlobalMolBlocItems().catch(() => []),
    ]);
    let poolChips = null;
    const poolFilterCtl = mountMolFilters(overlay.querySelector('#jw3PoolFilters'), () => {
      void remountPoolChips(true);
    });

    async function remountPoolChips(fromFilter) {
      const host = overlay.querySelector('#jw3PoolChips');
      const mode = overlay.querySelector('#jw3PoolMode').value;
      const filterHost = overlay.querySelector('#jw3PoolFilters');
      if (filterHost) filterHost.hidden = mode !== 'molecules';
      const keptMol = (fromFilter && poolChips && mode === 'molecules') ? poolChips.getItems() : null;
      host.innerHTML = '';
      let search;
      let initial = [];
      let placeholder = '…';
      if (mode === 'lecons') {
        search = TA.localSource(globalLeafItems, { limit: 12 });
        initial = globalLeafItems.filter((it) => (poolInit.module_ids || []).indexOf(it.id) >= 0);
        if (!editId && !initial.length && moduleId) {
          initial = globalLeafItems.filter((it) => it.id === moduleId);
        }
        placeholder = 'Leçon (tous parcours)…';
      } else if (mode === 'blocs') {
        search = TA.localSource(molBlocItems, { limit: 12 });
        initial = molBlocItems.filter((it) => (poolInit.bloc_ids || []).map(String).indexOf(String(it.id)) >= 0);
        placeholder = 'Bloc molécule…';
      } else {
        search = TA.matriceSource(Object.assign({ limit: 12 }, poolFilterCtl.norms()));
        if (keptMol) {
          initial = keptMol;
        } else {
          const ids = (poolInit.matrice_ids || []).map(String);
          if (ids.length) {
            try {
              const labs = await loadMatriceLabels(ids);
              initial = ids.map((id) => ({ id, label: labs[id] || id, sub: '' }));
            } catch (_) {
              initial = ids.map((id) => ({ id, label: id }));
            }
          }
        }
        placeholder = 'DCI…';
      }
      poolChips = TA.chips(host, {
        search,
        minChars: mode === 'molecules' ? 1 : 0,
        placeholder,
        ariaLabel: 'Pool',
        initial,
      });
    }
    await remountPoolChips();
    overlay.querySelector('#jw3PoolMode').addEventListener('change', () => {
      poolInit = { mode: overlay.querySelector('#jw3PoolMode').value, module_ids: [], bloc_ids: [], matrice_ids: [] };
      void remountPoolChips();
    });

    function needsPool(t) {
      return t === 'quiz' || t === 'trous' || t === 'fiche_aleatoire';
    }

    function syncQuizStyle() {
      const st = (overlay.querySelector('input[name="jw3Style"]:checked') || {}).value || 'manuel';
      quizStyle = st;
      const showMan = st === 'manuel' || st === 'mixte';
      const showAuto = st === 'auto' || st === 'mixte';
      overlay.querySelector('#jw3QuizManuel').hidden = !showMan;
      overlay.querySelector('#jw3QuizAuto').hidden = !showAuto;
      overlay.querySelector('#jw3NbQWrap').hidden = st === 'mixte';
      overlay.querySelector('#jw3NbManWrap').hidden = st !== 'mixte';
      overlay.querySelector('#jw3NbAutoWrap').hidden = st !== 'mixte';
    }

    function syncTrousComp() {
      const comp = overlay.querySelector('#jw3TrousComp').value;
      const lignesMode = overlay.querySelector('#jw3LignesMode').value;
      const groupe = comp === 'auto' && lignesMode === 'groupe';
      overlay.querySelector('#jw3TauxWrap').hidden = comp !== 'auto';
      overlay.querySelector('#jw3GrilleUi').hidden = comp !== 'grille';
      overlay.querySelector('#jw3NbLignesWrap').hidden = comp === 'grille' || groupe;
      overlay.querySelector('#jw3LignesModeWrap').hidden = comp === 'grille';
      if (comp === 'grille') renderGrille();
    }

    function syncFicheComp() {
      const comp = overlay.querySelector('#jw3FicheComp').value;
      const fichesMode = overlay.querySelector('#jw3FichesMode').value;
      const groupe = comp === 'auto' && fichesMode === 'groupe';
      overlay.querySelector('#jw3EmpUi').hidden = comp !== 'manuel';
      overlay.querySelector('#jw3FicheAutoOpts').hidden = comp === 'manuel';
      overlay.querySelector('#jw3NbFichesWrap').hidden = comp === 'manuel' || groupe;
      overlay.querySelector('#jw3SeuilWrap').hidden = comp !== 'auto' || groupe;
      overlay.querySelector('#jw3NbNotesWrap').hidden = comp !== 'auto' || groupe;
      if (comp === 'manuel') renderEmplacements();
    }

    function syncPanels() {
      const t = overlay.querySelector('#jw3Type').value;
      overlay.querySelector('#jw3Quiz').hidden = t !== 'quiz';
      overlay.querySelector('#jw3Trous').hidden = t !== 'trous';
      overlay.querySelector('#jw3Fiche').hidden = t !== 'fiche_aleatoire';
      overlay.querySelector('#jw3Ordo').hidden = t !== 'ordonnance';
      overlay.querySelector('#jw3Classement').hidden = t !== 'classement';
      overlay.querySelector('#jw3Appariement').hidden = t !== 'appariement';
      overlay.querySelector('#jw3PoolBlock').hidden = !needsPool(t);
      if (t === 'quiz') syncQuizStyle();
      if (t === 'trous') syncTrousComp();
      if (t === 'fiche_aleatoire') syncFicheComp();
    }
    overlay.querySelector('#jw3Type').addEventListener('change', syncPanels);
    overlay.querySelectorAll('input[name="jw3Style"]').forEach((r) => {
      r.addEventListener('change', syncQuizStyle);
    });
    overlay.querySelector('#jw3TrousComp').addEventListener('change', syncTrousComp);
    overlay.querySelector('#jw3LignesMode').addEventListener('change', syncTrousComp);
    overlay.querySelector('#jw3FicheComp').addEventListener('change', syncFicheComp);
    overlay.querySelector('#jw3FichesMode').addEventListener('change', syncFicheComp);
    syncPanels();

    /* ——— Banque quiz (liste collapsible, pas de rebuild au frappe) ——— */
    function renderBankList() {
      const box = overlay.querySelector('#jw3BankList');
      if (!quizQuestions.length) {
        box.innerHTML = '<p class="jp-muted">Aucune question</p>';
        return;
      }
      box.innerHTML = quizQuestions.map((q, i) => {
        const isOpen = openQId === q.id;
        const preview = (q.enonce || '').trim() || ('Question ' + (i + 1));
        if (!isOpen) {
          return '<div class="jp-jeu-manuelle jp-jeu-bank-row" data-qid="' + esc(q.id) + '">'
            + '<button type="button" class="jp-btn jp-btn-ghost jp-jeu-bank-toggle" data-open="'
            + esc(q.id) + '">' + esc(preview.slice(0, 80)) + '</button>'
            + '<span class="jp-jeu-manuelle-actions">'
            + '<button type="button" class="jp-btn jp-btn-ghost" data-dup="' + esc(q.id)
            + '" title="Dupliquer">⧉</button>'
            + '<button type="button" class="jp-btn jp-btn-ghost" data-del="' + esc(q.id)
            + '" aria-label="Supprimer">×</button>'
            + '</span></div>';
        }
        const props = q.propositions.length ? q.propositions : [
          { id: uid('p'), texte: '', est_correcte: true },
          { id: uid('p'), texte: '', est_correcte: false },
        ];
        return '<div class="jp-jeu-manuelle is-open" data-qid="' + esc(q.id) + '">'
          + '<div class="jp-jeu-manuelle-actions" style="margin-bottom:0.35rem">'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-collapse="' + esc(q.id) + '">Replier</button>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-dup="' + esc(q.id) + '" title="Dupliquer">⧉</button>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-del="' + esc(q.id)
          + '" aria-label="Supprimer">×</button></div>'
          + '<div class="jp-field"><label>Énoncé</label>'
          + '<textarea data-enonce rows="2" placeholder="Énoncé…">' + esc(q.enonce) + '</textarea></div>'
          + '<div class="jp-jeu-props">' + props.map((p, pi) =>
            '<div class="jp-jeu-prop-row" data-pid="' + esc(p.id) + '">'
            + '<label class="jp-jeu-prop-correct"><input type="radio" name="jw3Correct' + esc(q.id)
            + '" value="' + esc(p.id) + '"' + (p.est_correcte ? ' checked' : '') + '> Correcte</label>'
            + '<input data-prop value="' + esc(p.texte) + '" placeholder="Proposition ' + (pi + 1) + '">'
            + '<button type="button" class="jp-btn jp-btn-ghost" data-del-p="' + esc(p.id)
            + '" aria-label="Retirer">×</button></div>').join('') + '</div>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-add-p>+ Proposition</button>'
          + '</div>';
      }).join('');

      box.querySelectorAll('[data-open]').forEach((b) => {
        b.addEventListener('click', () => {
          openQId = b.getAttribute('data-open');
          renderBankList();
          box.querySelector('[data-enonce]')?.focus();
        });
      });
      box.querySelectorAll('[data-collapse]').forEach((b) => {
        b.addEventListener('click', () => { openQId = null; renderBankList(); });
      });
      box.querySelectorAll('[data-dup]').forEach((b) => {
        b.addEventListener('click', () => {
          const src = quizQuestions.find((x) => x.id === b.getAttribute('data-dup'));
          if (!src) return;
          const copy = {
            id: uid('qm'),
            enonce: src.enonce,
            propositions: src.propositions.map((p) => ({
              id: uid('p'), texte: p.texte, est_correcte: !!p.est_correcte,
            })),
          };
          quizQuestions.push(copy);
          openQId = copy.id;
          renderBankList();
        });
      });
      box.querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', () => {
          const id = b.getAttribute('data-del');
          const idx = quizQuestions.findIndex((x) => x.id === id);
          if (idx < 0) return;
          quizQuestions.splice(idx, 1);
          if (openQId === id) openQId = null;
          renderBankList();
        });
      });

      const openCard = box.querySelector('.jp-jeu-manuelle.is-open');
      if (!openCard) return;
      const q = quizQuestions.find((x) => x.id === openCard.getAttribute('data-qid'));
      if (!q) return;
      openCard.querySelector('[data-enonce]')?.addEventListener('input', (e) => {
        q.enonce = e.target.value;
      });
      openCard.querySelectorAll('[data-pid]').forEach((row) => {
        const pid = row.getAttribute('data-pid');
        const prop = q.propositions.find((p) => p.id === pid);
        if (!prop) return;
        row.querySelector('[data-prop]')?.addEventListener('input', (e) => {
          prop.texte = e.target.value;
        });
        row.querySelector('input[type="radio"]')?.addEventListener('change', () => {
          q.propositions.forEach((p) => { p.est_correcte = p.id === pid; });
        });
        row.querySelector('[data-del-p]')?.addEventListener('click', () => {
          if (q.propositions.length <= 2) return global.JpToast?.warn?.('2 propositions min');
          const wasCorrect = prop.est_correcte;
          q.propositions = q.propositions.filter((p) => p.id !== pid);
          if (wasCorrect && q.propositions[0]) q.propositions[0].est_correcte = true;
          renderBankList();
        });
      });
      openCard.querySelector('[data-add-p]')?.addEventListener('click', () => {
        if (q.propositions.length >= 6) return global.JpToast?.warn?.('6 propositions max');
        q.propositions.push({ id: uid('p'), texte: '', est_correcte: false });
        renderBankList();
      });
    }
    renderBankList();
    overlay.querySelector('#jw3AddQ').addEventListener('click', () => {
      const q = {
        id: uid('qm'),
        enonce: '',
        propositions: [
          { id: uid('p'), texte: '', est_correcte: true },
          { id: uid('p'), texte: '', est_correcte: false },
        ],
      };
      quizQuestions.push(q);
      openQId = q.id;
      renderBankList();
    });

    /* ——— Grille trous (clic cellules) ——— */
    function trouableCols() {
      return Array.from(overlay.querySelectorAll('#jw3TrousCols [data-col]'))
        .filter((sel) => sel.value === 'trouable' || sel.value === 'visible')
        .map((sel) => ({ code: sel.getAttribute('data-col'), role: sel.value }));
    }

    function renderGrille() {
      const host = overlay.querySelector('#jw3GrilleTable');
      const cols = trouableCols().filter((c) => c.role === 'trouable');
      if (!grilleState.lignes.length) {
        host.innerHTML = '<p class="jp-muted">Aucune ligne</p>';
      } else {
        host.innerHTML = '<table class="jp-table jp-trous-grid"><thead><tr><th>Molécule</th>'
          + cols.map((c) => '<th>' + esc(champLibelleSafe(c.code)) + '</th>').join('')
          + '<th></th></tr></thead><tbody>'
          + grilleState.lignes.map((mid) => {
            const trous = new Set(grilleState.trous[mid] || []);
            return '<tr data-mid="' + esc(mid) + '"><th scope="row">'
              + esc(grilleState.labels[mid] || mid) + '</th>'
              + cols.map((c) => {
                const isTrou = trous.has(c.code);
                return '<td><button type="button" class="jp-btn jp-btn-ghost jp-grille-cell'
                  + (isTrou ? ' is-trou' : '') + '" data-mid="' + esc(mid)
                  + '" data-champ="' + esc(c.code) + '" title="'
                  + (isTrou ? 'Trou' : 'Visible') + '">'
                  + (isTrou ? '???' : 'OK') + '</button></td>';
              }).join('')
              + '<td><button type="button" class="jp-btn jp-btn-ghost" data-del-ligne="'
              + esc(mid) + '" aria-label="Retirer">×</button></td></tr>';
          }).join('')
          + '</tbody></table>';
        host.querySelectorAll('.jp-grille-cell').forEach((btn) => {
          btn.addEventListener('click', () => {
            const mid = btn.getAttribute('data-mid');
            const champ = btn.getAttribute('data-champ');
            if (!grilleState.trous[mid]) grilleState.trous[mid] = [];
            const arr = grilleState.trous[mid];
            const ix = arr.indexOf(champ);
            if (ix >= 0) arr.splice(ix, 1);
            else arr.push(champ);
            renderGrille();
          });
        });
        host.querySelectorAll('[data-del-ligne]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const mid = btn.getAttribute('data-del-ligne');
            grilleState.lignes = grilleState.lignes.filter((id) => id !== mid);
            delete grilleState.trous[mid];
            renderGrille();
          });
        });
      }
    }

    function champLibelleSafe(code) {
      const hit = champsActifsList().find(([c]) => c === code);
      return hit ? hit[1] : code;
    }

    async function resolveScopeIds(filtre) {
      const f = normalizeFiltre(filtre);
      if (f.mode === 'molecules') return f.matrice_ids.slice();
      if (f.mode === 'blocs') {
        const want = new Set(f.bloc_ids);
        const ids = [];
        molBlocItems.forEach((b) => {
          if (!want.has(String(b.id))) return;
          collectMatriceIdsFromPayload(b.payload_json).forEach((id) => {
            if (ids.indexOf(id) < 0) ids.push(id);
          });
        });
        return ids;
      }
      if (f.mode === 'lecons') {
        if (!f.module_ids.length || !global.JpV2Resolver?.listerMedicaments) return [];
        const byParcours = {};
        f.module_ids.forEach((id) => {
          const it = globalLeafItems.find((x) => String(x.id) === String(id));
          const pid = (it && it.parcours_id) || '_null';
          if (!byParcours[pid]) byParcours[pid] = [];
          byParcours[pid].push(id);
        });
        const out = [];
        for (const pid of Object.keys(byParcours)) {
          const rows = await global.JpV2Resolver.listerMedicaments({
            parcoursId: pid === '_null' ? null : pid,
            moduleIds: byParcours[pid],
          });
          (rows || []).forEach((r) => {
            const id = r && r.id ? String(r.id) : '';
            if (id && out.indexOf(id) < 0) out.push(id);
          });
        }
        return out;
      }
      if (f.entite && f.entite_ids.length) {
        const by = await loadMatriceIdsByEntities(f.entite, f.entite_ids);
        const ids = [];
        f.entite_ids.forEach((eid) => {
          (by[String(eid)] || []).forEach((mid) => {
            if (ids.indexOf(mid) < 0) ids.push(mid);
          });
        });
        return ids;
      }
      return [];
    }

    async function applyPoolToGrille() {
      const ids = (await resolveScopeIds(readPool())).slice(0, 40);
      const labels = await loadMatriceLabels(ids);
      const next = {};
      ids.forEach((mid) => {
        next[mid] = Array.isArray(grilleState.trous[mid]) ? grilleState.trous[mid].slice() : [];
        grilleState.labels[mid] = labels[mid] || grilleState.labels[mid] || mid;
      });
      grilleState.lignes = ids;
      grilleState.trous = next;
      renderGrille();
      if (!ids.length) global.JpToast?.warn?.('Pool sans molécule');
    }

    overlay.querySelector('#jw3GrilleFromPool')?.addEventListener('click', () => {
      applyPoolToGrille().catch((e) => global.JpToast?.fromError?.(e));
    });
    if (grilleState.lignes.length) {
      loadMatriceLabels(grilleState.lignes).then((labs) => {
        Object.assign(grilleState.labels, labs);
        renderGrille();
      }).catch(() => {});
    }
    overlay.querySelectorAll('#jw3TrousCols [data-col]').forEach((sel) => {
      sel.addEventListener('change', () => {
        if (!overlay.querySelector('#jw3GrilleUi').hidden) renderGrille();
      });
    });

    /* ——— Fiche emplacements ——— */
    function renderEmplacements() {
      const box = overlay.querySelector('#jw3EmpList');
      if (!ficheEmplacements.length) {
        box.innerHTML = '<p class="jp-muted">Aucun emplacement</p>';
        return;
      }
      box.innerHTML = '<ul>' + ficheEmplacements.map((e, i) =>
        '<li>' + (e.mode === 'fixe'
          ? ('Fixe · ' + esc(e.label || e.matrice_id || '—'))
          : 'Aléatoire (pool)')
        + ' <button type="button" data-del-e="' + i + '" aria-label="Retirer">×</button></li>'
      ).join('') + '</ul>';
      box.querySelectorAll('[data-del-e]').forEach((btn) => {
        btn.addEventListener('click', () => {
          ficheEmplacements.splice(Number(btn.getAttribute('data-del-e')), 1);
          renderEmplacements();
        });
      });
    }
    overlay.querySelector('#jw3AddEmpAlea')?.addEventListener('click', () => {
      ficheEmplacements.push({
        id: uid('e'), mode: 'aleatoire', matrice_id: null, label: '', ordre: ficheEmplacements.length,
      });
      renderEmplacements();
    });
    overlay.querySelector('#jw3AddEmpFixe')?.addEventListener('click', () => {
      const wrap = overlay.querySelector('#jw3EmpFixeTa');
      wrap.hidden = !wrap.hidden;
    });
    TA.combo(overlay.querySelector('#jw3EmpMat'), {
      search: TA.matriceSource({ limit: 12 }),
      minChars: 1,
      placeholder: 'DCI…',
      ariaLabel: 'Molécule fixe',
      clearOnPick: true,
      onPick: (it) => {
        if (!it) return;
        ficheEmplacements.push({
          id: uid('e'), mode: 'fixe', matrice_id: it.id, label: it.label, ordre: ficheEmplacements.length,
        });
        renderEmplacements();
        overlay.querySelector('#jw3EmpFixeTa').hidden = true;
      },
    });
    if (ficheEmplacements.some((e) => e.mode === 'fixe' && e.matrice_id && !e.label)) {
      const ids = ficheEmplacements.filter((e) => e.matrice_id).map((e) => e.matrice_id);
      loadMatriceLabels(ids).then((labs) => {
        ficheEmplacements.forEach((e) => {
          if (e.matrice_id && labs[String(e.matrice_id)]) e.label = labs[String(e.matrice_id)];
        });
        renderEmplacements();
      }).catch(() => {});
    }

    /* ——— Ordonnance besoins ——— */
    let besoinFiltreChips = null;
    let besoinEditMode = 'manuel'; // manuel | asso | aleatoire

    function filtreResume(f) {
      if (!f || typeof f !== 'object') return '';
      const labels = Array.isArray(f.labels) ? f.labels.filter(Boolean) : [];
      if (labels.length) return ' · ' + labels.slice(0, 3).join(', ');
      const n = idList(f.module_ids).length + idList(f.bloc_ids).length
        + idList(f.matrice_ids).length + idList(f.entite_ids).length;
      if (!n) return '';
      return ' · ' + (f.mode || 'lecons') + ' ×' + n;
    }

    function renderBesoins() {
      const box = overlay.querySelector('#jw3Besoins');
      box.innerHTML = ordoBesoins.length
        ? '<ul>' + ordoBesoins.map((b, i) => {
          let lab = 'Aléatoire' + filtreResume(b.filtre_json);
          if (b.mode === 'manuel' && b.kind !== 'asso') {
            lab = 'Manuel · ' + esc(b.label || b.matrice_id || '—');
          }
          if (b.mode === 'association' || b.kind === 'asso') {
            lab = 'Asso · ' + esc(b.label || b.association_id || b.matrice_id || '—');
          }
          return '<li>' + lab
            + ' <button type="button" data-del-b="' + i + '" aria-label="Retirer">×</button></li>';
        }).join('') + '</ul>'
        : '<p class="jp-muted">Aucun besoin</p>';
      box.querySelectorAll('[data-del-b]').forEach((btn) => {
        btn.addEventListener('click', () => {
          ordoBesoins.splice(Number(btn.getAttribute('data-del-b')), 1);
          renderBesoins();
        });
      });
    }
    renderBesoins();

    const besoinFilterCtl = mountMolFilters(overlay.querySelector('#jw3BesoinMolFilters'), () => {
      if (besoinEditMode === 'aleatoire') void remountBesoinFiltre(true);
    });

    async function remountBesoinFiltre(fromFilter) {
      const host = overlay.querySelector('#jw3BesoinFiltreChips');
      const mode = overlay.querySelector('#jw3BesoinFiltreMode').value;
      const molFilters = overlay.querySelector('#jw3BesoinMolFilters');
      if (molFilters) molFilters.hidden = mode !== 'molecules';
      const kept = (fromFilter && besoinFiltreChips && mode === 'molecules')
        ? besoinFiltreChips.getItems()
        : null;
      host.innerHTML = '';
      let search;
      let placeholder = '…';
      let minChars = 0;
      const meta = classeModeMeta(mode);
      if (mode === 'lecons') {
        search = TA.localSource(globalLeafItems, { limit: 12 });
        placeholder = 'Leçon…';
      } else if (mode === 'blocs') {
        search = TA.localSource(molBlocItems, { limit: 12 });
        placeholder = 'Bloc…';
      } else if (mode === 'molecules') {
        search = TA.matriceSource(Object.assign({ limit: 12 }, besoinFilterCtl.norms()));
        placeholder = 'DCI…';
        minChars = 1;
      } else if (meta) {
        search = TA.entiteSource(meta.entite, { limit: 12 });
        placeholder = meta.label + '…';
      } else {
        search = TA.localSource(globalLeafItems, { limit: 12 });
        placeholder = 'Leçon…';
      }
      besoinFiltreChips = TA.chips(host, {
        search,
        minChars,
        placeholder,
        ariaLabel: 'Filtre besoin',
        initial: kept || [],
      });
    }

    function showBesoinEdit(mode) {
      besoinEditMode = mode;
      const wrap = overlay.querySelector('#jw3BesoinEdit');
      const filtre = overlay.querySelector('#jw3BesoinFiltre');
      const matHost = overlay.querySelector('#jw3BesoinMat');
      wrap.hidden = false;
      if (mode === 'aleatoire') {
        overlay.querySelector('#jw3BesoinEditLabel').textContent = 'Filtre';
        matHost.hidden = true;
        filtre.hidden = false;
        void remountBesoinFiltre();
      } else {
        overlay.querySelector('#jw3BesoinEditLabel').textContent =
          mode === 'asso' ? 'Association' : 'Molécule';
        matHost.hidden = false;
        filtre.hidden = true;
        matHost.innerHTML = '';
        TA.combo(matHost, {
          search: TA.matriceSource({ limit: 12 }),
          minChars: 1,
          placeholder: mode === 'asso' ? 'Association…' : 'DCI…',
          ariaLabel: 'Besoin',
          clearOnPick: true,
          onPick: async (it) => {
            if (!it) return;
            if (mode === 'asso') {
              const assos = await loadAssociationOptions([it.id]).catch(() => []);
              const hit = assos.find((a) => a.id === String(it.id));
              if (!hit && !(await global.JpMedicaments?.listComposants?.(it.id) || []).length) {
                global.JpToast?.warn?.('Pas une association (≥2 composants)');
                return;
              }
              ordoBesoins.push({
                id: uid('b'), mode: 'manuel', kind: 'asso',
                matrice_id: null, association_id: it.id, label: it.label,
                filtre_json: { kind: 'asso', association_id: String(it.id) },
              });
            } else {
              ordoBesoins.push({
                id: uid('b'), mode: 'manuel', kind: null,
                matrice_id: it.id, association_id: null, label: it.label,
                filtre_json: { kind: 'molecule', matrice_id: String(it.id) },
              });
            }
            renderBesoins();
            wrap.hidden = true;
          },
        });
      }
    }

    overlay.querySelector('#jw3AddBesoinAlea').addEventListener('click', () => showBesoinEdit('aleatoire'));
    overlay.querySelector('#jw3AddBesoinMan').addEventListener('click', () => showBesoinEdit('manuel'));
    overlay.querySelector('#jw3AddBesoinAsso').addEventListener('click', () => showBesoinEdit('asso'));
    overlay.querySelector('#jw3BesoinFiltreMode').addEventListener('change', () => void remountBesoinFiltre(false));
    overlay.querySelector('#jw3BesoinFiltreOk').addEventListener('click', () => {
      const mode = overlay.querySelector('#jw3BesoinFiltreMode').value;
      const items = besoinFiltreChips ? besoinFiltreChips.getItems() : [];
      const ids = items.map((it) => String(it.id)).filter(Boolean);
      const filtre = { mode, labels: items.map((it) => it.label).filter(Boolean) };
      if (mode === 'lecons') filtre.module_ids = ids;
      else if (mode === 'blocs') filtre.bloc_ids = ids;
      else if (mode === 'molecules') filtre.matrice_ids = ids;
      else {
        const meta = classeModeMeta(mode);
        if (!meta) return;
        filtre.entite = meta.entite;
        filtre.entite_ids = ids;
      }
      const clean = normalizeFiltre(filtre);
      if (filtre.labels) clean.labels = filtre.labels;
      if (!filtreHasIds(clean)) {
        global.JpToast?.warn?.('Filtre vide');
        return;
      }
      ordoBesoins.push({
        id: uid('b'), mode: 'aleatoire', matrice_id: null, association_id: null,
        label: '', filtre_json: clean,
      });
      renderBesoins();
      overlay.querySelector('#jw3BesoinEdit').hidden = true;
    });

    /* hydrate ordo labels */
    (async () => {
      const ids = ordoBesoins.map((b) => b.association_id || b.matrice_id).filter(Boolean);
      if (!ids.length) return;
      try {
        const labs = await loadMatriceLabels(ids);
        ordoBesoins.forEach((b) => {
          const id = b.association_id || b.matrice_id;
          if (id && labs[String(id)]) b.label = labs[String(id)];
        });
        renderBesoins();
      } catch (_) { /* ignore */ }
    })();

    /* ——— Ajout liste : texte, leçon, bloc, molécules, entité ——— */
    function mountListAdder(host, optsAdd) {
      const entOpts = HYBRID_SOURCES.filter((s) => s.value !== 'manuel' && s.value !== 'matrice')
        .map((s) => '<option value="' + s.value + '">' + esc(s.label) + '</option>').join('');
      host.innerHTML = '<div class="jp-split jp-split-2">'
        + '<div class="jp-field"><label>Ajouter' + tip('Texte, leçon, bloc, molécules ou entité') + '</label>'
        + '<select class="jw-add-mode">'
        + '<option value="texte">Texte</option>'
        + '<option value="lecons">Leçon</option>'
        + '<option value="blocs">Bloc</option>'
        + '<option value="molecules">Molécules</option>'
        + '<option value="entite">Entité</option>'
        + '</select></div>'
        + '<div class="jp-field jw-add-entwrap" hidden><label>Type</label>'
        + '<select class="jw-add-ent">' + entOpts + '</select></div></div>'
        + '<div class="jw-add-filters" hidden></div>'
        + '<div class="jp-field jw-add-main"></div>'
        + '<div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-ghost jw-add-go">Ajouter</button>'
        + (optsAdd.proposeFromLeft
          ? '<button type="button" class="jp-btn jp-btn-ghost jw-add-propose" hidden title="Depuis l’autre liste">Proposer associations</button>'
          : '')
        + '</div>';
      const modeSel = host.querySelector('.jw-add-mode');
      const entWrap = host.querySelector('.jw-add-entwrap');
      const entSel = host.querySelector('.jw-add-ent');
      const filtersHost = host.querySelector('.jw-add-filters');
      const main = host.querySelector('.jw-add-main');
      const proposeBtn = host.querySelector('.jw-add-propose');
      const filterCtl = mountMolFilters(filtersHost, () => remountMain());
      let widget = null;

      function proposeSource() {
        const mode = modeSel.value;
        if (mode === 'molecules' || mode === 'lecons' || mode === 'blocs') return 'matrice';
        if (mode === 'entite') return entSel.value;
        return '';
      }

      function remountMain() {
        const mode = modeSel.value;
        entWrap.hidden = mode !== 'entite';
        filtersHost.hidden = mode !== 'molecules';
        if (proposeBtn) {
          const src = proposeSource();
          proposeBtn.hidden = !(src === 'matrice' || ENTITE_LIAISON[src]);
        }
        main.innerHTML = '';
        widget = null;
        if (mode === 'texte') {
          main.innerHTML = '<input class="jw-add-text" placeholder="Libellé…" maxlength="200">';
          return;
        }
        if (mode === 'lecons') {
          widget = TA.combo(main, {
            search: TA.localSource(globalLeafItems, { limit: 12 }),
            minChars: 0,
            placeholder: 'Leçon…',
            ariaLabel: 'Leçon',
          });
          return;
        }
        if (mode === 'blocs') {
          widget = TA.combo(main, {
            search: TA.localSource(molBlocItems, { limit: 12 }),
            minChars: 0,
            placeholder: 'Bloc molécule…',
            ariaLabel: 'Bloc',
          });
          return;
        }
        if (mode === 'molecules') {
          widget = TA.chips(main, {
            search: TA.matriceSource(Object.assign({ limit: 12 }, filterCtl.norms())),
            minChars: 1,
            placeholder: 'DCI…',
            ariaLabel: 'Molécules',
          });
          return;
        }
        widget = TA.combo(main, {
          search: TA.entiteSource(entSel.value, { limit: 12 }),
          minChars: 0,
          placeholder: 'Entité…',
          ariaLabel: 'Entité',
        });
      }

      modeSel.addEventListener('change', remountMain);
      entSel.addEventListener('change', remountMain);
      remountMain();

      host.querySelector('.jw-add-go').addEventListener('click', async () => {
        const mode = modeSel.value;
        try {
          if (mode === 'texte') {
            const label = (host.querySelector('.jw-add-text').value || '').trim();
            if (!label) return global.JpToast?.warn?.('Libellé requis');
            optsAdd.onAdd({ id: uid(optsAdd.idPrefix), label, source: 'manuel' });
            host.querySelector('.jw-add-text').value = '';
            return;
          }
          if (mode === 'lecons' || mode === 'blocs') {
            const it = widget && widget.getItem ? widget.getItem() : null;
            if (!it || !it.id) return global.JpToast?.warn?.('Choisissez une source');
            if (mode === 'blocs') {
              await importBlocMolecules(it.id, optsAdd.list, optsAdd.idPrefix, optsAdd.onDone, optsAdd.extra);
            } else {
              await importLessonMolecules(it.id, optsAdd.list, optsAdd.idPrefix, optsAdd.onDone, optsAdd.extra);
            }
            if (widget.clear) widget.clear(true);
            return;
          }
          if (mode === 'molecules') {
            const items = widget ? widget.getItems() : [];
            if (!items.length) return global.JpToast?.warn?.('Choisissez des molécules');
            let n = 0;
            items.forEach((it) => {
              const mid = String(it.id);
              const exists = optsAdd.list.some(
                (x) => isRefItem(x) && x.entite === 'matrice' && String(x.entite_id) === mid
              );
              if (exists) return;
              optsAdd.list.push(freshRow({
                id: uid(optsAdd.idPrefix),
                label: it.label || mid,
                source: 'matrice',
                entite: 'matrice',
                entite_id: mid,
              }, optsAdd.extra));
              n += 1;
            });
            optsAdd.onDone();
            remountMain();
            global.JpToast?.ok?.(n + ' molécule(s)');
            return;
          }
          const it = widget && widget.getItem ? widget.getItem() : null;
          if (!it || !it.id) return global.JpToast?.warn?.('Choisissez une entité');
          const src = entSel.value;
          const exists = optsAdd.list.some(
            (x) => isRefItem(x) && x.entite === src && String(x.entite_id) === String(it.id)
          );
          if (!exists) {
            optsAdd.onAdd(freshRow({
              id: uid(optsAdd.idPrefix),
              label: it.label,
              source: src,
              entite: src,
              entite_id: String(it.id),
            }, optsAdd.extra));
          } else {
            global.JpToast?.warn?.('Déjà dans la liste');
          }
          if (widget.clear) widget.clear(true);
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });

      if (proposeBtn && optsAdd.proposeFromLeft) {
        proposeBtn.addEventListener('click', async () => {
          try { await optsAdd.proposeFromLeft(proposeSource()); }
          catch (e) { global.JpToast?.fromError?.(e); }
        });
      }
    }

    function refItemsOf(list, entite) {
      return (list || []).filter((it) => isRefItem(it) && it.entite === entite);
    }

    function ensureRefItem(list, idPrefix, entite, entiteId, label, extra) {
      const eid = String(entiteId);
      const found = list.find((x) => isRefItem(x) && x.entite === entite && String(x.entite_id) === eid);
      if (found) return { item: found, created: false };
      const source = entite === 'matrice' ? 'matrice' : entite;
      const item = freshRow({
        id: uid(idPrefix), label: label || eid, source, entite, entite_id: eid,
      }, extra);
      list.push(item);
      return { item, created: true };
    }

    function applySeedToTargets(o) {
      const {
        mode, fillSide, seed, targetEntite, chosenIds, labels, fillList, fillPrefix, fillExtra,
      } = o;
      let added = 0;
      let linked = 0;
      if (mode === 'classement') {
        const seedIsItem = fillSide === 'zones';
        if (seedIsItem) {
          classZones.forEach((z) => {
            z.item_ids = (z.item_ids || []).filter((x) => x !== seed.id);
          });
          chosenIds.forEach((tid) => {
            const { item: zone, created } = ensureRefItem(
              fillList, fillPrefix, targetEntite, tid, labels[tid], fillExtra || { item_ids: [] }
            );
            if (created) added += 1;
            if (!Array.isArray(zone.item_ids)) zone.item_ids = [];
            if (zone.item_ids.indexOf(seed.id) < 0) zone.item_ids.push(seed.id);
          });
          linked = 1;
        } else {
          chosenIds.forEach((tid) => {
            const { item: it, created } = ensureRefItem(
              fillList, fillPrefix, targetEntite, tid, labels[tid]
            );
            if (created) added += 1;
            classZones.forEach((z) => {
              if (z.id === seed.id) return;
              z.item_ids = (z.item_ids || []).filter((x) => x !== it.id);
            });
            if (!Array.isArray(seed.item_ids)) seed.item_ids = [];
            if (seed.item_ids.indexOf(it.id) < 0) seed.item_ids.push(it.id);
          });
          linked = 1;
        }
      } else {
        const tid = chosenIds[0];
        const { item: other, created } = ensureRefItem(
          fillList, fillPrefix, targetEntite, tid, labels[tid]
        );
        if (created) added += 1;
        if (fillSide === 'droite') appPaires[seed.id] = other.id;
        else appPaires[other.id] = seed.id;
        linked = 1;
      }
      return { added, linked };
    }

    async function proposeAssociations(targetSource, mode, fillSide) {
      const targetIsMatrice = targetSource === 'matrice';
      const targetIsEntite = !!ENTITE_LIAISON[targetSource];
      if (!targetIsMatrice && !targetIsEntite) {
        global.JpToast?.warn?.('Choisissez Molécule ou un type référentiel');
        return;
      }
      let seedList;
      let fillList;
      let fillPrefix;
      if (mode === 'classement') {
        if (fillSide === 'zones') {
          seedList = classItems; fillList = classZones; fillPrefix = 'z';
        } else {
          seedList = classZones; fillList = classItems; fillPrefix = 'i';
        }
      } else if (fillSide === 'droite') {
        seedList = appGauche; fillList = appDroite; fillPrefix = 'd';
      } else {
        seedList = appDroite; fillList = appGauche; fillPrefix = 'g';
      }
      const seedMatrices = refItemsOf(seedList, 'matrice');
      let direction = null;
      let seeds = [];
      if (targetIsEntite && seedMatrices.length) {
        direction = 'mol_to_entite'; seeds = seedMatrices;
      } else if (targetIsMatrice) {
        const anyEnt = (seedList || []).filter(
          (it) => isRefItem(it) && it.entite !== 'matrice' && ENTITE_LIAISON[it.entite]
        );
        if (anyEnt.length) { direction = 'entite_to_mol'; seeds = anyEnt; }
      }
      if (!direction) {
        global.JpToast?.warn?.('Placez des éléments référentiels dans l’autre colonne');
        return;
      }
      let added = 0;
      let linked = 0;
      const fillExtra = (mode === 'classement' && fillSide === 'zones') ? { item_ids: [] } : null;
      if (direction === 'mol_to_entite') {
        const links = await loadMatriceEntityLinks(seeds.map((m) => m.entite_id));
        const allIds = [];
        seeds.forEach((m) => {
          ((links[String(m.entite_id)] || {})[targetSource] || []).forEach((id) => allIds.push(id));
        });
        const labels = await loadEntiteLabels(targetSource, allIds);
        for (const mol of seeds) {
          const candidates = ((links[String(mol.entite_id)] || {})[targetSource] || []).map((id) => ({
            id: String(id), label: labels[String(id)] || String(id),
          }));
          if (!candidates.length) continue;
          let chosenIds = candidates.length === 1
            ? [candidates[0].id]
            : await pickEquivalentsModal(overlay, {
              multiple: mode === 'classement', sourceLabel: mol.label, candidates,
            });
          if (!chosenIds) continue;
          if (mode === 'appariement') chosenIds = chosenIds.slice(0, 1);
          const applied = applySeedToTargets({
            mode, fillSide, seed: mol, targetEntite: targetSource,
            chosenIds, labels, fillList, fillPrefix, fillExtra,
          });
          added += applied.added; linked += applied.linked;
        }
      } else {
        const byTable = {};
        seeds.forEach((s) => {
          if (!byTable[s.entite]) byTable[s.entite] = [];
          byTable[s.entite].push(s);
        });
        for (const entiteTable of Object.keys(byTable)) {
          const group = byTable[entiteTable];
          const byEnt = await loadMatriceIdsByEntities(entiteTable, group.map((s) => s.entite_id));
          const allMids = [];
          group.forEach((s) => { (byEnt[String(s.entite_id)] || []).forEach((id) => allMids.push(id)); });
          const labels = await loadMatriceLabels(allMids);
          for (const seed of group) {
            const candidates = (byEnt[String(seed.entite_id)] || []).map((id) => ({
              id: String(id), label: labels[String(id)] || String(id),
            }));
            if (!candidates.length) continue;
            let chosenIds = candidates.length === 1
              ? [candidates[0].id]
              : await pickEquivalentsModal(overlay, {
                multiple: mode === 'classement', sourceLabel: seed.label, candidates,
              });
            if (!chosenIds) continue;
            if (mode === 'appariement') chosenIds = chosenIds.slice(0, 1);
            const applied = applySeedToTargets({
              mode, fillSide, seed, targetEntite: 'matrice',
              chosenIds, labels, fillList, fillPrefix, fillExtra,
            });
            added += applied.added; linked += applied.linked;
          }
        }
      }
      if (mode === 'classement') {
        renderClassItems(); renderClassZones(); renderClassAssign();
      } else {
        renderAppCol('gauche'); renderAppCol('droite'); renderAppPaires();
      }
      global.JpToast?.ok?.(linked + ' association(s) · ' + added + ' ajoutée(s)');
    }

    async function importBlocMolecules(blocId, targetList, idPrefix, onDone, extra) {
      const bloc = molBlocItems.find((b) => String(b.id) === String(blocId));
      if (!bloc) return global.JpToast?.warn?.('Bloc introuvable');
      const ids = collectMatriceIdsFromPayload(bloc.payload_json);
      if (!ids.length) return global.JpToast?.warn?.('Aucune molécule dans le bloc');
      const labels = await loadMatriceLabels(ids);
      let n = 0;
      ids.forEach((mid) => {
        const exists = targetList.some(
          (it) => isRefItem(it) && it.entite === 'matrice' && String(it.entite_id) === mid
        );
        if (exists) return;
        targetList.push(freshRow({
          id: uid(idPrefix), label: labels[mid] || mid, source: 'matrice',
          entite: 'matrice', entite_id: mid,
        }, extra));
        n += 1;
      });
      onDone();
      global.JpToast?.ok?.(n + ' molécule(s) importée(s)');
    }

    async function importLessonMolecules(moduleId, targetList, idPrefix, onDone, extra) {
      const blocs = molBlocItems.filter((b) => String(b.module_id) === String(moduleId));
      if (!blocs.length) return global.JpToast?.warn?.('Aucun bloc molécule');
      const ids = [];
      blocs.forEach((b) => {
        collectMatriceIdsFromPayload(b.payload_json).forEach((id) => {
          if (ids.indexOf(id) < 0) ids.push(id);
        });
      });
      if (!ids.length) return global.JpToast?.warn?.('Aucune molécule');
      const labels = await loadMatriceLabels(ids);
      let n = 0;
      ids.forEach((mid) => {
        const exists = targetList.some(
          (it) => isRefItem(it) && it.entite === 'matrice' && String(it.entite_id) === mid
        );
        if (exists) return;
        targetList.push(freshRow({
          id: uid(idPrefix), label: labels[mid] || mid, source: 'matrice',
          entite: 'matrice', entite_id: mid,
        }, extra));
        n += 1;
      });
      onDone();
      global.JpToast?.ok?.(n + ' molécule(s)');
    }

    function renderClassItems() {
      const box = overlay.querySelector('#jw3ClassItems');
      box.innerHTML = classItems.length
        ? '<ul>' + classItems.map((it, i) =>
          '<li><strong>' + esc(it.label) + '</strong>'
          + ' <span class="jp-muted">(' + esc(it.source || 'manuel') + ')</span>'
          + ' <button type="button" data-del="' + i + '" aria-label="Retirer">×</button></li>').join('') + '</ul>'
        : '<p class="jp-muted">Aucun item</p>';
      box.querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', () => {
          const removed = classItems.splice(Number(b.getAttribute('data-del')), 1)[0];
          classZones.forEach((z) => {
            z.item_ids = (z.item_ids || []).filter((id) => id !== removed.id);
          });
          renderClassItems();
          renderClassAssign();
        });
      });
      renderClassAssign();
    }
    function renderClassZones() {
      const box = overlay.querySelector('#jw3ClassZones');
      box.innerHTML = classZones.length
        ? '<ul>' + classZones.map((z, i) =>
          '<li><strong>' + esc(z.label) + '</strong>'
          + ' <button type="button" data-del="' + i + '" aria-label="Retirer">×</button></li>').join('') + '</ul>'
        : '<p class="jp-muted">Aucune zone</p>';
      box.querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', () => {
          classZones.splice(Number(b.getAttribute('data-del')), 1);
          renderClassZones();
          renderClassAssign();
        });
      });
      renderClassAssign();
    }
    function renderClassAssign() {
      const box = overlay.querySelector('#jw3ClassAssign');
      if (!classItems.length || !classZones.length) {
        box.innerHTML = '';
        return;
      }
      box.innerHTML = '<span class="jp-field-label">Affectation</span>'
        + classItems.map((it) => {
          const cur = classZones.find((z) => (z.item_ids || []).indexOf(it.id) >= 0);
          return '<div class="jp-jeu-assign-row"><span>' + esc(it.label) + '</span>'
            + '<select data-item="' + esc(it.id) + '">'
            + '<option value="">—</option>'
            + classZones.map((z) => '<option value="' + esc(z.id) + '"'
              + (cur && cur.id === z.id ? ' selected' : '') + '>' + esc(z.label) + '</option>').join('')
            + '</select></div>';
        }).join('');
      box.querySelectorAll('[data-item]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const itemId = sel.getAttribute('data-item');
          classZones.forEach((z) => {
            z.item_ids = (z.item_ids || []).filter((id) => id !== itemId);
          });
          const z = classZones.find((x) => x.id === sel.value);
          if (z) z.item_ids.push(itemId);
        });
      });
    }
    mountListAdder(overlay.querySelector('#jw3ClassItemAdd'), {
      idPrefix: 'i',
      list: classItems,
      onAdd: (it) => { classItems.push(it); renderClassItems(); },
      onDone: () => renderClassItems(),
      proposeFromLeft: (src) => proposeAssociations(src, 'classement', 'items'),
    });
    mountListAdder(overlay.querySelector('#jw3ClassZoneAdd'), {
      idPrefix: 'z',
      list: classZones,
      extra: { item_ids: [] },
      onAdd: (it) => {
        classZones.push({
          id: it.id, label: it.label, item_ids: Array.isArray(it.item_ids) ? it.item_ids : [],
          source: it.source, entite: it.entite, entite_id: it.entite_id,
        });
        renderClassZones();
      },
      onDone: () => renderClassZones(),
      proposeFromLeft: (src) => proposeAssociations(src, 'classement', 'zones'),
    });
    renderClassItems();
    renderClassZones();

    function renderAppCol(side) {
      const list = side === 'gauche' ? appGauche : appDroite;
      const box = overlay.querySelector(side === 'gauche' ? '#jw3AppGauche' : '#jw3AppDroite');
      box.innerHTML = list.length
        ? '<ul>' + list.map((it, i) =>
          '<li><strong>' + esc(it.label) + '</strong>'
          + ' <button type="button" data-del="' + i + '" aria-label="Retirer">×</button></li>').join('') + '</ul>'
        : '<p class="jp-muted">Aucun</p>';
      box.querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', () => {
          const removed = list.splice(Number(b.getAttribute('data-del')), 1)[0];
          if (side === 'gauche' && removed) delete appPaires[removed.id];
          if (side === 'droite' && removed) {
            Object.keys(appPaires).forEach((g) => {
              if (appPaires[g] === removed.id) delete appPaires[g];
            });
          }
          renderAppCol(side);
          renderAppPaires();
        });
      });
      renderAppPaires();
    }
    function renderAppPaires() {
      const box = overlay.querySelector('#jw3AppPaires');
      if (!appGauche.length || !appDroite.length) {
        box.innerHTML = '';
        return;
      }
      box.innerHTML = '<span class="jp-field-label">Paires</span>'
        + appGauche.map((g) => '<div class="jp-jeu-assign-row"><span>' + esc(g.label) + '</span>'
          + '<select data-pair="' + esc(g.id) + '">'
          + '<option value="">—</option>'
          + appDroite.map((d) => '<option value="' + esc(d.id) + '"'
            + (appPaires[g.id] === d.id ? ' selected' : '') + '>' + esc(d.label) + '</option>').join('')
          + '</select></div>').join('');
      box.querySelectorAll('[data-pair]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const gid = sel.getAttribute('data-pair');
          const did = sel.value;
          if (!did) { delete appPaires[gid]; return; }
          Object.keys(appPaires).forEach((g) => {
            if (g !== gid && appPaires[g] === did) delete appPaires[g];
          });
          appPaires[gid] = did;
        });
      });
    }
    mountListAdder(overlay.querySelector('#jw3AppGaucheAdd'), {
      idPrefix: 'g',
      list: appGauche,
      onAdd: (it) => { appGauche.push(it); renderAppCol('gauche'); },
      onDone: () => renderAppCol('gauche'),
      proposeFromLeft: (src) => proposeAssociations(src, 'appariement', 'gauche'),
    });
    mountListAdder(overlay.querySelector('#jw3AppDroiteAdd'), {
      idPrefix: 'd',
      list: appDroite,
      onAdd: (it) => { appDroite.push(it); renderAppCol('droite'); },
      onDone: () => renderAppCol('droite'),
      proposeFromLeft: (src) => proposeAssociations(src, 'appariement', 'droite'),
    });
    renderAppCol('gauche');
    renderAppCol('droite');

    /* ——— Build / validate / save ——— */
    function readPool() {
      const mode = overlay.querySelector('#jw3PoolMode').value;
      const ids = poolChips ? poolChips.getIds().filter(Boolean) : [];
      if (mode === 'lecons') return { mode, module_ids: ids };
      if (mode === 'blocs') return { mode, bloc_ids: ids };
      return { mode, matrice_ids: ids };
    }

    function readQuizQuestions() {
      return quizQuestions.map((q) => {
        const props = (q.propositions || [])
          .map((p) => ({ texte: String(p.texte || '').trim(), est_correcte: !!p.est_correcte }))
          .filter((p) => p.texte);
        return {
          enonce: (q.enonce || '').trim(),
          propositions: props,
        };
      }).filter((q) => q.enonce && q.propositions.length >= 2 && q.propositions.some((p) => p.est_correcte));
    }

    function buildPayload(type) {
      const titre = (overlay.querySelector('#jw3Titre').value || '').trim();
      const moduleIds = modChips.getIds();
      const payload = {
        type_jeu: type,
        titre,
        parcours_id: parcoursId,
        module_ids: moduleIds,
      };
      if (needsPool(type)) payload.pool = readPool();
      else if (type === 'ordonnance') payload.pool = {};

      if (type === 'quiz') {
        const style = (overlay.querySelector('input[name="jw3Style"]:checked') || {}).value || 'manuel';
        const quiz = {
          style,
          nb_propositions: Number(overlay.querySelector('#jw3NbProp').value) || 3,
          sens_auto: overlay.querySelector('#jw3Sens').value || 'mol_vers_valeur',
          difficulte: Number(overlay.querySelector('#jw3Diff').value) || 1,
          champs: checkedCodes(overlay, 'jw3QChamp'),
          questions: [],
        };
        if (style === 'manuel') {
          quiz.nb_questions = Number(overlay.querySelector('#jw3NbQ').value) || 10;
          quiz.questions = readQuizQuestions();
        } else if (style === 'auto') {
          quiz.nb_questions = Number(overlay.querySelector('#jw3NbQ').value) || 10;
        } else {
          quiz.nb_manuelles = Number(overlay.querySelector('#jw3NbMan').value) || 0;
          quiz.nb_auto = Number(overlay.querySelector('#jw3NbAuto').value) || 0;
          quiz.nb_questions = quiz.nb_manuelles + quiz.nb_auto;
          quiz.questions = readQuizQuestions();
        }
        payload.quiz = quiz;
      }

      if (type === 'trous') {
        const colonnes = [];
        overlay.querySelectorAll('#jw3TrousCols [data-col]').forEach((sel, ordre) => {
          if (!sel.value) return;
          colonnes.push({ champ_code: sel.getAttribute('data-col'), role: sel.value, ordre });
        });
        const composition = overlay.querySelector('#jw3TrousComp').value || 'auto';
        const lignesMode = overlay.querySelector('#jw3LignesMode').value || 'aleatoire';
        payload.trous = {
          composition,
          nb_lignes: Number(overlay.querySelector('#jw3NbLignes').value) || 5,
          lignes_mode: composition === 'grille' ? 'groupe' : (lignesMode === 'groupe' ? 'groupe' : 'aleatoire'),
          taux_trous: (() => {
            const n = Number(overlay.querySelector('#jw3TauxTrous').value);
            return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 40;
          })(),
          grille_json: {
            lignes: grilleState.lignes.slice(),
            trous: Object.assign({}, grilleState.trous),
          },
          colonnes,
        };
      }

      if (type === 'fiche_aleatoire') {
        const champs = [];
        overlay.querySelectorAll('#jw3FicheChamps [data-fchamp]').forEach((sel) => {
          if (!sel.value) return;
          champs.push({ champ_code: sel.getAttribute('data-fchamp'), role: sel.value });
        });
        payload.fiche = {
          composition: overlay.querySelector('#jw3FicheComp').value || 'auto',
          nb_fiches: Number(overlay.querySelector('#jw3NbFiches').value) || 5,
          fiches_mode: overlay.querySelector('#jw3FichesMode').value || 'aleatoire',
          seuil_exclusion: Number(overlay.querySelector('#jw3Seuil').value) || 8,
          nb_notes_exclusion: Number(overlay.querySelector('#jw3NbNotes').value) || 3,
          champs,
          emplacements: ficheEmplacements.map((e, i) => ({
            ordre: i, mode: e.mode || 'aleatoire', matrice_id: e.matrice_id || null,
          })),
        };
      }

      if (type === 'ordonnance') {
        payload.ordonnance = {
          associations_possibles: !!overlay.querySelector('#jw3Assoc')?.checked,
          champs: checkedCodes(overlay, 'jw3OChamp'),
          besoins: ordoBesoins.map((b, i) => {
            const isAsso = b.kind === 'asso' || b.mode === 'association';
            const assoId = isAsso ? (b.association_id || b.matrice_id || null) : null;
            const mode = (b.mode === 'manuel' || b.mode === 'association') ? 'manuel' : 'aleatoire';
            let filtre;
            if (mode === 'aleatoire') {
              filtre = normalizeFiltre(b.filtre_json);
              if (Array.isArray(b.filtre_json?.labels)) filtre.labels = b.filtre_json.labels;
            } else if (isAsso) {
              filtre = { kind: 'asso', association_id: assoId ? String(assoId) : '' };
            } else {
              filtre = { kind: 'molecule', matrice_id: b.matrice_id ? String(b.matrice_id) : '' };
            }
            return {
              ordre: i,
              mode,
              matrice_id: isAsso ? null : (b.matrice_id || null),
              association_id: assoId,
              filtre_json: filtre,
            };
          }),
        };
      }

      if (type === 'classement') {
        payload.classement = {
          consigne: (overlay.querySelector('#jw3ClassConsigne').value || '').trim(),
          items: classItems.map((it) => ({
            id: it.id, label: it.label, source: it.source || 'manuel',
            entite: it.entite || undefined, entite_id: it.entite_id || undefined,
          })),
          zones: classZones.map((z) => ({
            id: z.id, label: z.label, item_ids: (z.item_ids || []).slice(),
            source: z.source || 'manuel',
            entite: z.entite || undefined, entite_id: z.entite_id || undefined,
          })),
        };
      }

      if (type === 'appariement') {
        payload.appariement = {
          consigne: (overlay.querySelector('#jw3AppConsigne').value || '').trim(),
          gauche: appGauche.map((it) => ({
            id: it.id, label: it.label, source: it.source || 'manuel',
            entite: it.entite || undefined, entite_id: it.entite_id || undefined,
          })),
          droite: appDroite.map((it) => ({
            id: it.id, label: it.label, source: it.source || 'manuel',
            entite: it.entite || undefined, entite_id: it.entite_id || undefined,
          })),
          paires: Object.keys(appPaires).map((gid) => ({
            gauche_id: gid, droite_id: appPaires[gid],
          })),
        };
      }

      return payload;
    }

    function validate(type, payload) {
      if (!payload.titre) throw new Error('Titre requis');
      if (!(payload.module_ids || []).length) throw new Error('Ajoutez au moins une leçon liée');
      if (needsPool(type)) {
        const p = payload.pool || {};
        const n = (p.module_ids || p.bloc_ids || p.matrice_ids || []).length;
        if (!n) throw new Error('Pool vide');
      }
      if (type === 'quiz') {
        const q = payload.quiz;
        if (q.style === 'manuel' || q.style === 'mixte') {
          if (!(q.questions || []).length) throw new Error('Ajoutez des questions manuelles');
        }
        if (q.style === 'auto' || q.style === 'mixte') {
          if (!(q.champs || []).length) throw new Error('Sélectionnez des champs auto');
        }
      }
      if (type === 'trous') {
        const cols = payload.trous.colonnes || [];
        if (!cols.length) throw new Error('Sélectionnez au moins une colonne');
        if (!cols.some((c) => c.role === 'trouable' && c.champ_code !== 'dci' && c.champ_code !== 'nom_commercial')) {
          throw new Error('Une colonne trouable');
        }
        if (payload.trous.composition === 'grille') {
          const g = payload.trous.grille_json || {};
          if (!(g.lignes || []).length) throw new Error('Pool sans molécule');
          const nHoles = Object.keys(g.trous || {}).reduce((n, k) => n + ((g.trous[k] || []).length), 0);
          if (!nHoles) throw new Error('Marquez au moins un trou');
        }
      }
      if (type === 'fiche_aleatoire') {
        const f = payload.fiche;
        if (!(f.champs || []).some((c) => c.role === 'restituer')) {
          throw new Error('Choisissez un champ à restituer');
        }
        if (f.composition === 'manuel') {
          if (!(f.emplacements || []).length) throw new Error('Ajoutez un emplacement');
          if (f.emplacements.some((e) => e.mode === 'fixe' && !e.matrice_id)) {
            throw new Error('Emplacement fixe sans molécule');
          }
        }
      }
      if (type === 'ordonnance') {
        if (!(payload.ordonnance.champs || []).length) throw new Error('Sélectionnez au moins un champ');
        if (!(payload.ordonnance.besoins || []).length) throw new Error('Ajoutez un besoin');
        (payload.ordonnance.besoins || []).forEach((b) => {
          if (b.mode === 'aleatoire' && !filtreHasIds(b.filtre_json)) throw new Error('Filtre de besoin vide');
          if (b.mode === 'manuel' && !b.matrice_id && !b.association_id) throw new Error('Besoin manuel incomplet');
        });
      }
      if (type === 'classement') {
        if (classItems.length < 2) throw new Error('Au moins 2 items');
        if (classZones.length < 2) throw new Error('Au moins 2 zones');
        const assigned = new Set();
        classZones.forEach((z) => (z.item_ids || []).forEach((id) => assigned.add(id)));
        if (assigned.size < classItems.length) throw new Error('Affectez chaque item');
      }
      if (type === 'appariement') {
        if (appGauche.length < 2 || appDroite.length < 2) throw new Error('Au moins 2 de chaque côté');
        if (Object.keys(appPaires).length !== appGauche.length) throw new Error('Complétez les paires');
      }
    }

    function asStudioModele(jeu) {
      const row = jeu && typeof jeu === 'object' ? jeu : {};
      return Object.assign({}, row, {
        id: row.id,
        code_unique: row.code_unique,
        type_jeu: row.type_jeu,
        titre: row.titre,
        _v3: true,
      });
    }

    /* ——— Tester un tirage quiz ——— */
    overlay.querySelector('#jw3TestTirage')?.addEventListener('click', async () => {
      try {
        const style = (overlay.querySelector('input[name="jw3Style"]:checked') || {}).value || 'manuel';
        if (style === 'manuel') {
          const qs = readQuizQuestions();
          if (!qs.length) throw new Error('Aucune question manuelle valide');
          const n = Math.min(qs.length, Number(overlay.querySelector('#jw3NbQ').value) || qs.length);
          const sample = qs.slice().sort(() => Math.random() - 0.5).slice(0, n);
          global.JpToast?.ok?.(n + ' question(s) · ex. « ' + (sample[0].enonce || '').slice(0, 60) + ' »');
          return;
        }
        if (!global.JpJeuxPlayV3?.previewQuizTirage) {
          global.JpToast?.warn?.('Aperçu indisponible (rechargez la page)');
          return;
        }
        const pool = readPool();
        const cfg = {
          style,
          nb_questions: Number(overlay.querySelector('#jw3NbQ').value) || 10,
          nb_manuelles: Number(overlay.querySelector('#jw3NbMan').value) || 0,
          nb_auto: Number(overlay.querySelector('#jw3NbAuto').value) || 5,
          nb_propositions: Number(overlay.querySelector('#jw3NbProp').value) || 3,
          sens_auto: overlay.querySelector('#jw3Sens').value,
          difficulte: Number(overlay.querySelector('#jw3Diff').value) || 1,
          champs: checkedCodes(overlay, 'jw3QChamp'),
          questions: readQuizQuestions(),
        };
        const preview = await global.JpJeuxPlayV3.previewQuizTirage({
          parcours_id: parcoursId,
          module_ids: modChips.getIds(),
          pool,
        }, cfg);
        const n = (preview && preview.questions && preview.questions.length) || 0;
        if (!n) throw new Error('Aucune question générée — élargissez le pool / champs');
        const q0p = preview.questions[0];
        global.JpToast?.ok?.(n + ' question(s) · ex. « ' + String(q0p.enonce || '').slice(0, 60) + ' »');
      } catch (e) {
        global.JpToast?.fromError?.(e) || global.JpToast?.warn?.(e.message || 'Erreur');
      }
    });

    overlay.querySelector('#jw3Save').addEventListener('click', async () => {
      try {
        const type = overlay.querySelector('#jw3Type').value;
        if (type === 'trous' && overlay.querySelector('#jw3TrousComp').value === 'grille' && !grilleState.lignes.length) {
          await applyPoolToGrille();
        }
        const payload = buildPayload(type);
        validate(type, payload);

        if (editId) {
          const updated = await rpc('jeu_maj', { p_jeu_id: editId, p_payload: payload });
          global.JpToast?.ok?.('Jeu mis à jour');
          const modele = asStudioModele(updated);
          opts.onUpdated?.({ modele, jeu: modele });
          close();
          return;
        }

        const created = await rpc('jeu_creer', { p_payload: payload });
        const jeu = asStudioModele(created);

        if (linkBlocId) {
          global.JpToast?.ok?.(jeu.code_unique || 'Jeu créé');
          opts.onCreated?.({ modele: jeu, jeu, blocId: linkBlocId, linked: true });
          close();
          return;
        }

        const bloc = await rpc('v2_upsert_bloc', {
          p_payload: {
            module_id: moduleId,
            type_bloc: 'jeu',
            titre: jeu.titre || payload.titre,
            ordre: 999,
            payload_json: {
              jeu_id: jeu.id,
              code_unique: jeu.code_unique,
              type_jeu: type,
              libelle_cta: 'Jouer',
            },
          },
        });

        global.JpToast?.ok?.(jeu.code_unique || 'Jeu créé');
        opts.onCreated?.({
          modele: jeu,
          jeu,
          bloc,
          insertAfterBlocId: opts.insertAfterBlocId || null,
        });
        close();
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
    });
  }

  global.JpStudioJeuWizardV3 = { open };
})(window);
