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

  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 9);
  }

  function tip(title) {
    return ' <span class="jp-tip" title="' + esc(title) + '" aria-label="' + esc(title) + '">?</span>';
  }

  function hybridSearch(source) {
    const TA = global.JpTypeahead;
    if (source === 'matrice') return TA.matriceSource({ limit: 12 });
    if (source && source !== 'manuel') return TA.entiteSource(source, { limit: 12 });
    return null;
  }

  function itemFromHybrid(label, source, picked) {
    const lab = (label || (picked && picked.label) || '').trim();
    if (!lab) return null;
    const out = { id: uid('i'), label: lab, source: source || 'manuel' };
    if (picked && source === 'matrice') {
      out.entite = 'matrice';
      out.entite_id = picked.id;
    } else if (picked && source && source !== 'manuel') {
      out.entite = source;
      out.entite_id = picked.id;
    }
    return out;
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

  async function loadMolBlocItems(modules) {
    const lessonIds = (modules || []).filter((m) => !m.est_groupe).map((m) => m.id);
    if (!lessonIds.length) return [];
    const { data, error } = await sb()
      .from('module_blocs')
      .select('id, module_id, titre, payload_json, type_bloc')
      .in('module_id', lessonIds)
      .eq('type_bloc', 'molecule')
      .order('ordre');
    if (error) throw error;
    const byMod = {};
    (modules || []).forEach((m) => { byMod[m.id] = m.titre; });
    return (data || []).map((b) => ({
      id: b.id,
      label: b.titre || 'Bloc molécule',
      sub: byMod[b.module_id] || '',
    }));
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
        filtre_json: b.filtre_json || {},
      }))
      : [];

    /* ——— State fiche emplacements (stub) ——— */
    const ficheEmplacements = Array.isArray(typeCfg?.emplacements)
      ? typeCfg.emplacements.map((e) => ({
        id: e.id || uid('e'),
        mode: e.mode || 'aleatoire',
        matrice_id: e.matrice_id || null,
        ordre: e.ordre || 0,
      }))
      : [];

    const t0 = (typeInit === 'trous' && typeCfg) ? typeCfg : {};
    const f0 = (typeInit === 'fiche_aleatoire' && typeCfg) ? typeCfg : {};
    const o0 = (typeInit === 'ordonnance' && typeCfg) ? typeCfg : {};

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
      + '</div>'
      + '<div id="jw3QuizManuel">'
      + '<div id="jw3BankList" class="jp-jeu-manuelles"></div>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3AddQ">+ Question</button>'
      + '</div>'
      + '<div id="jw3QuizAuto" hidden>'
      + '<div class="jp-field"><span class="jp-field-label">Champs</span>'
      + champsChecksHtml('jw3QChamp', quizChampsInit) + '</div>'
      + '<div class="jp-split jp-split-3">'
      + '<div class="jp-field"><label>Sens' + tip('Direction de la question auto') + '</label>'
      + '<select id="jw3Sens">'
      + '<option value="mol_vers_valeur">Molécule → valeur</option>'
      + '<option value="valeur_vers_mol">Valeur → molécule</option>'
      + '<option value="les_deux">Les deux</option></select></div>'
      + '<div class="jp-field"><label>Difficulté</label><select id="jw3Diff">'
      + '<option value="1">1</option><option value="2">2</option><option value="3">3</option>'
      + '</select></div>'
      + '<div class="jp-field"><label>Propositions</label>'
      + '<input id="jw3NbProp" type="number" min="2" max="6" value="'
      + esc(String(q0.nb_propositions || 3)) + '"></div>'
      + '</div></div></section>'

      /* Trous */
      + '<section class="jp-quiz-admin-panel" id="jw3Trous" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Tableau à trous</h3>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Composition</label><select id="jw3TrousComp">'
      + '<option value="auto">Auto</option><option value="grille">Grille</option></select></div>'
      + '<div class="jp-field"><label>Nb lignes</label>'
      + '<input id="jw3NbLignes" type="number" min="1" max="50" value="'
      + esc(String(t0.nb_lignes || 5)) + '"></div></div>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Lignes</label><select id="jw3LignesMode">'
      + '<option value="aleatoire">Aléatoire</option><option value="groupe">Groupe</option></select></div>'
      + '<div class="jp-field" id="jw3TauxWrap"><label>Taux trous (%)</label>'
      + '<input id="jw3TauxTrous" type="number" min="0" max="100" step="5" value="'
      + esc(String(t0.taux_trous != null ? t0.taux_trous : 40)) + '"></div></div>'
      + '<div class="jp-field"><span class="jp-field-label">Colonnes</span>'
      + '<div class="jp-quiz-admin-champs-grid" id="jw3TrousCols">'
      + champsList.map(([code, lib]) => {
        const col = trousColsInit.find((c) => c.champ_code === code);
        const role = col ? col.role : '';
        return '<div class="jp-quiz-admin-champ jp-jeu-col-role">'
          + '<span>' + esc(lib) + '</span> '
          + '<select data-col="' + code + '">'
          + '<option value="">—</option>'
          + '<option value="visible"' + (role === 'visible' ? ' selected' : '') + '>Visible</option>'
          + '<option value="trouable"' + (role === 'trouable' ? ' selected' : '') + '>Trouable</option>'
          + '</select></div>';
      }).join('')
      + '</div></div>'
      + '<div class="jp-field" id="jw3GrilleStub" hidden>'
      + '<label>Grille (JSON)</label>'
      + '<textarea id="jw3GrilleJson" rows="3" placeholder="{}">'
      + esc(typeof t0.grille_json === 'object' ? JSON.stringify(t0.grille_json || {}) : (t0.grille_json || '{}'))
      + '</textarea></div>'
      + '</section>'

      /* Fiche */
      + '<section class="jp-quiz-admin-panel" id="jw3Fiche" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Fiche aléatoire</h3>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Composition</label><select id="jw3FicheComp">'
      + '<option value="auto">Auto</option><option value="manuel">Manuel</option></select></div>'
      + '<div class="jp-field"><label>Nb fiches</label>'
      + '<input id="jw3NbFiches" type="number" min="1" max="30" value="'
      + esc(String(f0.nb_fiches || 5)) + '"></div></div>'
      + '<div class="jp-split jp-split-3">'
      + '<div class="jp-field"><label>Mode</label><select id="jw3FichesMode">'
      + '<option value="aleatoire">Aléatoire</option><option value="groupe">Groupe</option></select></div>'
      + '<div class="jp-field"><label>Seuil exclusion</label>'
      + '<input id="jw3Seuil" type="number" min="1" max="10" value="'
      + esc(String(f0.seuil_exclusion != null ? f0.seuil_exclusion : 8)) + '"></div>'
      + '<div class="jp-field"><label>Nb notes</label>'
      + '<input id="jw3NbNotes" type="number" min="1" max="10" value="'
      + esc(String(f0.nb_notes_exclusion || 3)) + '"></div></div>'
      + '<div class="jp-field"><span class="jp-field-label">Champs</span>'
      + '<div class="jp-quiz-admin-champs-grid" id="jw3FicheChamps">'
      + champsList.map(([code, lib]) => {
        const ch = ficheChampsInit.find((c) => (c.champ_code || c) === code);
        const role = ch && typeof ch === 'object' ? (ch.role || '') : (ch ? 'restituer' : '');
        return '<div class="jp-quiz-admin-champ jp-jeu-col-role">'
          + '<span>' + esc(lib) + '</span> '
          + '<select data-fchamp="' + code + '">'
          + '<option value="">—</option>'
          + '<option value="visible"' + (role === 'visible' ? ' selected' : '') + '>Visible</option>'
          + '<option value="restituer"' + (role === 'restituer' ? ' selected' : '') + '>Restituer</option>'
          + '</select></div>';
      }).join('')
      + '</div></div>'
      + '<div class="jp-field" id="jw3EmpStub" hidden>'
      + '<span class="jp-field-label">Emplacements</span>'
      + '<p class="jp-muted" id="jw3EmpCount">0 emplacement(s)</p>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3AddEmp">+ Emplacement aléatoire</button>'
      + '</div></section>'

      /* Ordonnance */
      + '<section class="jp-quiz-admin-panel" id="jw3Ordo" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Ordonnance</h3>'
      + '<label class="jp-quiz-admin-champ"><input type="checkbox" id="jw3Assoc"'
      + (o0.associations_possibles ? ' checked' : '') + '> Associations possibles</label>'
      + '<div class="jp-field"><span class="jp-field-label">Champs</span>'
      + champsChecksHtml('jw3OChamp', ordoChampsInit) + '</div>'
      + '<div class="jp-field"><span class="jp-field-label">Besoins</span>'
      + '<div id="jw3Besoins"></div>'
      + '<div class="jp-split jp-split-2" style="margin-top:0.5rem">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3AddBesoinAlea">+ Aléatoire</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jw3AddBesoinMan">+ Manuel</button>'
      + '</div>'
      + '<div id="jw3BesoinManTa" class="jp-field" hidden><label>Molécule</label><div id="jw3BesoinMat"></div></div>'
      + '</div></section>'

      /* Classement */
      + '<section class="jp-quiz-admin-panel" id="jw3Classement" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Classement</h3>'
      + '<div class="jp-field"><label>Consigne</label>'
      + '<input id="jw3ClassConsigne" maxlength="300" value="'
      + esc((typeCfg && typeCfg.consigne) || '') + '"></div>'
      + '<div class="jp-jeu-hybrid-add" id="jw3ClassItemAdd"></div>'
      + '<div id="jw3ClassItems" class="jp-jeu-list"></div>'
      + '<div class="jp-jeu-hybrid-add" id="jw3ClassZoneAdd" style="margin-top:1rem"></div>'
      + '<div id="jw3ClassZones" class="jp-jeu-list"></div>'
      + '<div id="jw3ClassAssign" class="jp-jeu-assign" style="margin-top:1rem"></div>'
      + '</section>'

      /* Appariement */
      + '<section class="jp-quiz-admin-panel" id="jw3Appariement" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Appariement</h3>'
      + '<div class="jp-field"><label>Consigne</label>'
      + '<input id="jw3AppConsigne" maxlength="300" value="'
      + esc((typeCfg && typeCfg.consigne) || '') + '"></div>'
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
    if (t0.composition) overlay.querySelector('#jw3TrousComp').value = t0.composition;
    if (t0.lignes_mode) overlay.querySelector('#jw3LignesMode').value = t0.lignes_mode;
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

    /* ——— Pool chips (mode-dependent) ——— */
    const molBlocItems = await loadMolBlocItems(modules).catch(() => []);
    let poolChips = null;

    async function remountPoolChips() {
      const host = overlay.querySelector('#jw3PoolChips');
      host.innerHTML = '';
      const mode = overlay.querySelector('#jw3PoolMode').value;
      let search;
      let initial = [];
      let placeholder = '…';
      if (mode === 'lecons') {
        search = TA.localSource(leafItems, { limit: 12 });
        initial = leafItems.filter((it) => (poolInit.module_ids || []).indexOf(it.id) >= 0);
        if (!editId && !initial.length && moduleId) {
          initial = leafItems.filter((it) => it.id === moduleId);
        }
        placeholder = 'Leçon…';
      } else if (mode === 'blocs') {
        search = TA.localSource(molBlocItems, { limit: 12 });
        initial = molBlocItems.filter((it) => (poolInit.bloc_ids || []).map(String).indexOf(String(it.id)) >= 0);
        placeholder = 'Bloc molécule…';
      } else {
        search = TA.matriceSource({ limit: 12 });
        const ids = (poolInit.matrice_ids || []).map(String);
        if (ids.length) {
          try {
            const labs = await loadMatriceLabels(ids);
            initial = ids.map((id) => ({ id, label: labs[id] || id, sub: '' }));
          } catch (_) {
            initial = ids.map((id) => ({ id, label: id }));
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
      return t === 'quiz' || t === 'trous' || t === 'fiche_aleatoire' || t === 'ordonnance';
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
      overlay.querySelector('#jw3TauxWrap').hidden = comp !== 'auto';
      overlay.querySelector('#jw3GrilleStub').hidden = comp !== 'grille';
    }

    function syncFicheComp() {
      const comp = overlay.querySelector('#jw3FicheComp').value;
      overlay.querySelector('#jw3EmpStub').hidden = comp !== 'manuel';
      overlay.querySelector('#jw3EmpCount').textContent = ficheEmplacements.length + ' emplacement(s)';
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
    overlay.querySelector('#jw3FicheComp').addEventListener('change', syncFicheComp);
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
          + '<input data-enonce value="' + esc(q.enonce) + '" placeholder="Énoncé…"></div>'
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

    /* ——— Fiche emplacements stub ——— */
    overlay.querySelector('#jw3AddEmp')?.addEventListener('click', () => {
      ficheEmplacements.push({ id: uid('e'), mode: 'aleatoire', matrice_id: null, ordre: ficheEmplacements.length });
      syncFicheComp();
    });

    /* ——— Ordonnance besoins ——— */
    function renderBesoins() {
      const box = overlay.querySelector('#jw3Besoins');
      box.innerHTML = ordoBesoins.length
        ? '<ul>' + ordoBesoins.map((b, i) =>
          '<li>' + (b.mode === 'manuel'
            ? ('Manuel · ' + esc(b.label || b.matrice_id || '—'))
            : 'Aléatoire')
          + ' <button type="button" data-del-b="' + i + '" aria-label="Retirer">×</button></li>').join('') + '</ul>'
        : '<p class="jp-muted">Aucun besoin</p>';
      box.querySelectorAll('[data-del-b]').forEach((btn) => {
        btn.addEventListener('click', () => {
          ordoBesoins.splice(Number(btn.getAttribute('data-del-b')), 1);
          renderBesoins();
        });
      });
    }
    renderBesoins();
    overlay.querySelector('#jw3AddBesoinAlea').addEventListener('click', () => {
      ordoBesoins.push({ id: uid('b'), mode: 'aleatoire', matrice_id: null, filtre_json: {}, label: '' });
      renderBesoins();
    });
    overlay.querySelector('#jw3AddBesoinMan').addEventListener('click', () => {
      const wrap = overlay.querySelector('#jw3BesoinManTa');
      wrap.hidden = !wrap.hidden;
    });
    TA.combo(overlay.querySelector('#jw3BesoinMat'), {
      search: TA.matriceSource({ limit: 12 }),
      minChars: 1,
      placeholder: 'DCI…',
      ariaLabel: 'Molécule besoin',
      clearOnPick: true,
      onPick: (it) => {
        if (!it) return;
        ordoBesoins.push({
          id: uid('b'), mode: 'manuel', matrice_id: it.id, label: it.label, filtre_json: {},
        });
        renderBesoins();
        overlay.querySelector('#jw3BesoinManTa').hidden = true;
      },
    });

    /* ——— Hybrid add (laconic) ——— */
    function mountHybridAdd(host, optsAdd) {
      host.innerHTML = '<div class="jp-split jp-split-2">'
        + '<div class="jp-field"><label>' + esc(optsAdd.labelTitle || 'Libellé') + '</label>'
        + '<input class="jw-hyb-label" placeholder="Texte…"></div>'
        + '<div class="jp-field"><label>Source</label>'
        + '<select class="jw-hyb-src">' + HYBRID_SOURCES.map((s) =>
          '<option value="' + s.value + '">' + esc(s.label) + '</option>').join('') + '</select></div></div>'
        + '<div class="jp-field jw-hyb-ta-wrap" hidden><label>Recherche</label><div class="jw-hyb-ta"></div></div>'
        + '<button type="button" class="jp-btn jp-btn-ghost jw-hyb-add">' + esc(optsAdd.button || 'Ajouter') + '</button>';
      const srcSel = host.querySelector('.jw-hyb-src');
      const taWrap = host.querySelector('.jw-hyb-ta-wrap');
      const taHost = host.querySelector('.jw-hyb-ta');
      const labelInp = host.querySelector('.jw-hyb-label');
      let combo = null;
      function remountTa() {
        const src = srcSel.value;
        taWrap.hidden = src === 'manuel';
        taHost.innerHTML = '';
        combo = null;
        const search = hybridSearch(src);
        if (!search) return;
        combo = TA.combo(taHost, {
          search,
          minChars: 1,
          placeholder: 'Chercher…',
          ariaLabel: 'Recherche',
          clearOnPick: false,
          onPick: (it) => { if (it && it.label) labelInp.value = it.label; },
        });
      }
      srcSel.addEventListener('change', remountTa);
      remountTa();
      host.querySelector('.jw-hyb-add').addEventListener('click', () => {
        const src = srcSel.value;
        const picked = combo && combo.getItem ? combo.getItem() : null;
        const item = itemFromHybrid(labelInp.value, src, picked);
        if (!item) return global.JpToast?.warn?.('Libellé requis');
        if (optsAdd.idPrefix) item.id = uid(optsAdd.idPrefix);
        optsAdd.onAdd(item);
        labelInp.value = '';
        if (combo && combo.clear) combo.clear(true);
      });
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
    mountHybridAdd(overlay.querySelector('#jw3ClassItemAdd'), {
      labelTitle: 'Item', button: '+ Item', idPrefix: 'i',
      onAdd: (it) => { classItems.push(it); renderClassItems(); },
    });
    mountHybridAdd(overlay.querySelector('#jw3ClassZoneAdd'), {
      labelTitle: 'Zone', button: '+ Zone', idPrefix: 'z',
      onAdd: (it) => {
        classZones.push({
          id: it.id, label: it.label, item_ids: [],
          source: it.source, entite: it.entite, entite_id: it.entite_id,
        });
        renderClassZones();
      },
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
    mountHybridAdd(overlay.querySelector('#jw3AppGaucheAdd'), {
      labelTitle: 'Gauche', button: '+ Gauche', idPrefix: 'g',
      onAdd: (it) => { appGauche.push(it); renderAppCol('gauche'); },
    });
    mountHybridAdd(overlay.querySelector('#jw3AppDroiteAdd'), {
      labelTitle: 'Droite', button: '+ Droite', idPrefix: 'd',
      onAdd: (it) => { appDroite.push(it); renderAppCol('droite'); },
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
        let grille = {};
        try {
          grille = JSON.parse(overlay.querySelector('#jw3GrilleJson').value || '{}');
        } catch (_) { grille = {}; }
        payload.trous = {
          composition: overlay.querySelector('#jw3TrousComp').value || 'auto',
          nb_lignes: Number(overlay.querySelector('#jw3NbLignes').value) || 5,
          lignes_mode: overlay.querySelector('#jw3LignesMode').value || 'aleatoire',
          taux_trous: Number(overlay.querySelector('#jw3TauxTrous').value) || 40,
          grille_json: grille,
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
          besoins: ordoBesoins.map((b, i) => ({
            ordre: i,
            mode: b.mode || 'aleatoire',
            matrice_id: b.matrice_id || null,
            filtre_json: b.filtre_json || {},
          })),
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
      if (type === 'trous' && !(payload.trous.colonnes || []).length) {
        throw new Error('Sélectionnez au moins une colonne');
      }
      if (type === 'ordonnance' && !(payload.ordonnance.champs || []).length) {
        throw new Error('Sélectionnez au moins un champ');
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

    overlay.querySelector('#jw3Save').addEventListener('click', async () => {
      try {
        const type = overlay.querySelector('#jw3Type').value;
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
