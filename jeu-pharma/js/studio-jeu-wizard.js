/**
 * Wizard création / édition de jeu (quiz, trous, fiche, ordonnance, classement, appariement).
 */
(function (global) {
  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    return data;
  }

  const CHAMPS = [
    ['indications', 'Indications'],
    ['contre_indications', 'Contre-indications'],
    ['effets_indesirables', 'Effets indésirables'],
    ['precautions_emploi', 'Précautions'],
    ['interactions', 'Interactions'],
    ['classe_pharmacologique', 'Classe pharmacologique'],
    ['classe_therapeutique', 'Classe thérapeutique'],
    ['surveillances', 'Surveillances'],
  ];

  const HYBRID_SOURCES = [
    { value: 'manuel', label: 'Texte libre' },
    { value: 'matrice', label: 'Molécule (DCI)' },
    { value: 'classes_pharmacologiques', label: 'Classe pharmacologique' },
    { value: 'classes_therapeutiques', label: 'Classe thérapeutique' },
    { value: 'indications', label: 'Indication' },
    { value: 'contre_indications', label: 'Contre-indication' },
    { value: 'effets_indesirables', label: 'Effet indésirable' },
    { value: 'precautions_emploi', label: 'Précaution' },
    { value: 'interactions', label: 'Interaction' },
    { value: 'surveillances', label: 'Surveillance' },
  ];

  function uid(prefix) {
    return prefix + Math.random().toString(36).slice(2, 9);
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

  /** Table entité → colonne jsonb de v_medicaments_complet / métadonnée liaison. */
  const ENTITE_LIAISON = {
    classes_pharmacologiques: {
      liaison: 'matrice_classes_pharmacologiques',
      fk: 'classe_pharmacologique_id',
    },
    classes_therapeutiques: {
      liaison: 'matrice_classes_therapeutiques',
      fk: 'classe_therapeutique_id',
    },
    indications: { liaison: 'matrice_indications', fk: 'indication_id' },
    contre_indications: { liaison: 'matrice_contre_indications', fk: 'contre_indication_id' },
    effets_indesirables: { liaison: 'matrice_effets_indesirables', fk: 'effet_indesirable_id' },
    precautions_emploi: { liaison: 'matrice_precautions_emploi', fk: 'precaution_emploi_id' },
    interactions: { liaison: 'matrice_interactions', fk: 'interaction_id' },
    surveillances: { liaison: 'matrice_surveillances', fk: 'surveillance_id' },
  };

  function isRefItem(it) {
    return !!(it && it.entite && it.entite_id && it.source !== 'manuel');
  }

  /**
   * Charge les ids d’entités liés à chaque matrice (ordre fiche).
   * @returns {Promise<Record<string, Record<string, string[]>>>} matriceId → entiteTable → [entityIds]
   */
  async function loadMatriceEntityLinks(matriceIds) {
    const ids = Array.from(new Set((matriceIds || []).filter(Boolean).map(String)));
    const out = {};
    ids.forEach((id) => { out[id] = {}; });
    if (!ids.length) return out;

    await Promise.all(Object.keys(ENTITE_LIAISON).map(async (table) => {
      const meta = ENTITE_LIAISON[table];
      const { data, error } = await sb()
        .from(meta.liaison)
        .select('matrice_id, ' + meta.fk + ', ordre')
        .in('matrice_id', ids)
        .order('ordre', { ascending: true });
      if (error) throw error;
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

  /** Libellés d’entités par ids (table référentiel). */
  async function loadEntiteLabels(table, ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean).map(String)));
    const map = {};
    if (!uniq.length || !ENTITE_LIAISON[table]) return map;
    const { data, error } = await sb()
      .from(table)
      .select('id, valeur')
      .in('id', uniq);
    if (error) throw error;
    (data || []).forEach((r) => {
      map[String(r.id)] = r.valeur || String(r.id);
    });
    return map;
  }

  /** Libellés DCI (et noms) pour des ids matrice. */
  async function loadMatriceLabels(ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean).map(String)));
    const map = {};
    if (!uniq.length) return map;
    const { data, error } = await sb()
      .from('v_medicaments_complet')
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
   * Molécules liées à des entités (inverse de loadMatriceEntityLinks).
   * @returns {Promise<Record<string, string[]>>} entityId → [matriceIds]
   */
  async function loadMatriceIdsByEntities(entiteTable, entityIds) {
    const meta = ENTITE_LIAISON[entiteTable];
    const uniq = Array.from(new Set((entityIds || []).filter(Boolean).map(String)));
    const out = {};
    uniq.forEach((id) => { out[id] = []; });
    if (!meta || !uniq.length) return out;
    const { data, error } = await sb()
      .from(meta.liaison)
      .select('matrice_id, ' + meta.fk + ', ordre')
      .in(meta.fk, uniq)
      .order('ordre', { ascending: true });
    if (error) throw error;
    (data || []).forEach((row) => {
      const eid = row[meta.fk] != null ? String(row[meta.fk]) : '';
      const mid = row.matrice_id != null ? String(row.matrice_id) : '';
      if (!eid || !mid || !out[eid]) return;
      if (out[eid].indexOf(mid) < 0) out[eid].push(mid);
    });
    return out;
  }

  function sourceLibelle(src) {
    if (src === 'matrice') return 'molécule';
    const hit = HYBRID_SOURCES.find((s) => s.value === src);
    return hit ? hit.label.toLowerCase() : (src || 'référentiel');
  }

  /**
   * Modale de choix d’équivalences.
   * @param {{ multiple: boolean, sourceLabel: string, candidates: {id,label}[] }} opts
   * @returns {Promise<string[]|null>}
   */
  function pickEquivalentsModal(parentEl, opts) {
    const multiple = !!opts.multiple;
    const candidates = opts.candidates || [];
    return new Promise((resolve) => {
      const modal = document.createElement('div');
      modal.className = 'jp-jeu-pick-overlay';
      modal.innerHTML = '<div class="jp-jeu-pick-sheet" role="dialog" aria-modal="true">'
        + '<h3 class="jp-quiz-admin-panel-title" style="margin-top:0">Équivalences</h3>'
        + '<p class="jp-muted">' + esc(opts.sourceLabel || 'Élément')
        + ' — plusieurs valeurs liées. '
        + (multiple ? 'Cochez une ou plusieurs cibles.' : 'Choisissez une seule cible.')
        + '</p>'
        + '<div class="jp-jeu-pick-list">'
        + candidates.map((c, i) => {
          const inp = multiple
            ? '<input type="checkbox" name="jwEq" value="' + esc(c.id) + '"' + (i === 0 ? ' checked' : '') + '>'
            : '<input type="radio" name="jwEq" value="' + esc(c.id) + '"' + (i === 0 ? ' checked' : '') + '>';
          return '<label class="jp-jeu-pick-opt">' + inp + ' <span>' + esc(c.label) + '</span></label>';
        }).join('')
        + '</div>'
        + '<div class="jp-jeu-pick-actions">'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-pick-cancel>Annuler</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" data-pick-ok>Valider</button>'
        + '</div></div>';
      (parentEl || document.body).appendChild(modal);
      function done(val) {
        modal.remove();
        resolve(val);
      }
      modal.querySelector('[data-pick-cancel]').addEventListener('click', () => done(null));
      modal.addEventListener('click', (e) => { if (e.target === modal) done(null); });
      modal.querySelector('[data-pick-ok]').addEventListener('click', () => {
        const checked = Array.from(modal.querySelectorAll('input[name="jwEq"]:checked'))
          .map((el) => el.value)
          .filter(Boolean);
        if (!checked.length) {
          global.JpToast?.warn?.(multiple ? 'Sélectionnez au moins une valeur' : 'Sélectionnez une valeur');
          return;
        }
        if (!multiple && checked.length > 1) {
          done([checked[0]]);
          return;
        }
        done(checked);
      });
    });
  }

  /**
   * @param {{
   *   parcoursId: string,
   *   moduleId: string,
   *   modules: Array,
   *   defaultTitre?: string,
   *   modeleId?: string,
   *   onCreated?: Function,
   *   onUpdated?: Function
   * }} opts
   */
  async function open(opts) {
    const { parcoursId, moduleId, modules } = opts;
    const editId = opts.modeleId || null;
    const TA = global.JpTypeahead;
    const byId = {};
    (modules || []).forEach((m) => { byId[m.id] = m; });
    const leafItems = (modules || []).filter((m) => !m.est_groupe).map((m) => ({
      id: m.id,
      label: m.titre,
      sub: m.parent_id && byId[m.parent_id] ? byId[m.parent_id].titre : '',
    }));

    let existing = null;
    if (editId) {
      const { data, error } = await sb()
        .from('modeles_jeu')
        .select('id, code_unique, type_jeu, titre, mode, parcours_id, module_ids, configuration_json')
        .eq('id', editId)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Jeu introuvable');
      existing = data;
    }

    const cfg0 = (existing && existing.configuration_json) || {};
    const regles = [];
    const quizManuelles = Array.isArray(cfg0.questions_manuelles)
      ? cfg0.questions_manuelles.map((q) => ({
        id: q.id || uid('qm'),
        question: q.question || '',
        propositions: Array.isArray(q.propositions) ? q.propositions.slice() : ['', ''],
        correct: q.correct || '',
      }))
      : [];
    const classItems = Array.isArray(cfg0.items)
      ? cfg0.items.map((it) => ({
        id: it.id || uid('i'),
        label: it.label || '',
        source: it.source || 'manuel',
        entite: it.entite || null,
        entite_id: it.entite_id || null,
      }))
      : [];
    const classZones = Array.isArray(cfg0.zones)
      ? cfg0.zones.map((z) => ({
        id: z.id || uid('z'),
        label: z.label || '',
        item_ids: Array.isArray(z.item_ids) ? z.item_ids.slice() : [],
        source: z.source || 'manuel',
        entite: z.entite || null,
        entite_id: z.entite_id || null,
      }))
      : [];
    const appGauche = Array.isArray(cfg0.gauche)
      ? cfg0.gauche.map((it) => ({
        id: it.id || uid('g'),
        label: it.label || '',
        source: it.source || 'manuel',
        entite: it.entite || null,
        entite_id: it.entite_id || null,
      }))
      : [];
    const appDroite = Array.isArray(cfg0.droite)
      ? cfg0.droite.map((it) => ({
        id: it.id || uid('d'),
        label: it.label || '',
        source: it.source || 'manuel',
        entite: it.entite || null,
        entite_id: it.entite_id || null,
      }))
      : [];
    const appPaires = {};
    (Array.isArray(cfg0.paires) ? cfg0.paires : []).forEach((p) => {
      if (p && p.gauche_id && p.droite_id) appPaires[p.gauche_id] = p.droite_id;
    });

    if (Array.isArray(cfg0.regles)) {
      cfg0.regles.forEach((rule) => {
        if (!rule || !rule.type) return;
        let label = rule.type;
        if (rule.type === 'matrice') label = 'Molécule fixe';
        else if (rule.type === 'classe_therapeutique') label = 'Classe thérapeutique × ' + (rule.nombre || 1);
        else if (rule.type === 'classe_pharmacologique') label = 'Classe pharmacologique × ' + (rule.nombre || 1);
        regles.push({ rule, label });
      });
    }

    const typeInit = (existing && existing.type_jeu) || 'quiz';
    const modeInit = (existing && existing.mode) || 'entrainement';
    const titreInit = (existing && existing.titre) || opts.defaultTitre || '';
    const champsInit = cfg0.champs_interroges || cfg0.champs || ['indications', 'contre_indications', 'effets_indesirables'];

    const overlay = document.createElement('div');
    overlay.className = 'jp-studio-overlay';
    overlay.innerHTML = '<div class="jp-studio-sheet jp-jeu-sheet">'
      + '<header class="jp-studio-sheet-head"><h2>' + (editId ? 'Modifier le jeu' : 'Créer un jeu') + '</h2>'
      + (existing && existing.code_unique ? '<code class="jp-muted">' + esc(existing.code_unique) + '</code>' : '')
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close>×</button></header>'
      + '<div class="jp-jeu-wiz-body">'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Type</label><select id="jwType"' + (editId ? ' disabled' : '') + '>'
      + '<option value="quiz">Quiz</option><option value="trous">Tableau à trous</option>'
      + '<option value="fiche_aleatoire">Fiche aléatoire</option><option value="ordonnance">Ordonnance</option>'
      + '<option value="classement">Classement</option><option value="appariement">Appariement</option>'
      + '</select></div>'
      + '<div class="jp-field"><label>Mode</label><select id="jwMode">'
      + '<option value="entrainement">Entraînement</option><option value="evaluation">Évaluation</option>'
      + '</select></div></div>'
      + '<div class="jp-field"><label>Titre</label><input id="jwTitre" maxlength="200" value="'
      + esc(titreInit) + '"></div>'
      + '<div class="jp-field"><span class="jp-field-label">Leçons du pool (tapez pour ajouter)</span>'
      + '<div id="jwMods"></div></div>'
      + '<div class="jp-field" id="jwChampsBlock"><span class="jp-field-label">Champs interrogés</span>'
      + '<div class="jp-quiz-admin-champs-grid">'
      + CHAMPS.map(([code, lib]) => '<label class="jp-quiz-admin-champ"><input type="checkbox" name="jwChamp" value="'
        + code + '"' + (champsInit.indexOf(code) >= 0 ? ' checked' : '') + '> <span>' + esc(lib) + '</span></label>').join('')
      + '</div></div>'
      + '<section class="jp-quiz-admin-panel" id="jwQuiz"><h3 class="jp-quiz-admin-panel-title">Quiz</h3>'
      + '<div class="jp-split jp-split-3">'
      + '<div class="jp-field"><label>Nb questions (tirage)</label><input id="jwNbQ" type="number" min="1" max="50" value="'
      + esc(String(cfg0.nb_questions || 10)) + '"></div>'
      + '<div class="jp-field"><label>Propositions</label><input id="jwNbProp" type="number" min="2" max="6" value="'
      + esc(String(cfg0.nb_propositions || 3)) + '"></div>'
      + '<div class="jp-field"><label>Plafond auto</label><input id="jwNbAutoMax" type="number" min="0" max="200" value="'
      + esc(cfg0.nb_auto_max != null ? String(cfg0.nb_auto_max) : '') + '" placeholder="Illimité">'
      + '<small class="jp-field-hint">Max de questions auto candidates (vide = illimité)</small></div>'
      + '</div>'
      + '<div class="jp-jeu-manuelles">'
      + '<h4 class="jp-quiz-admin-panel-title" style="font-size:1rem;margin-top:0.75rem">Questions manuelles</h4>'
      + '<p class="jp-muted jp-field-hint">Banque QCM libre + questions auto (molécules). Tirage aléatoire à chaque partie.</p>'
      + '<div id="jwManuellesList"></div>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jwAddManuelle">+ Question manuelle</button>'
      + '</div></section>'
      + '<section class="jp-quiz-admin-panel" id="jwTrous" hidden><h3 class="jp-quiz-admin-panel-title">Trous</h3>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Nb fiches</label><input id="jwNbFiches" type="number" min="1" max="30" value="'
      + esc(String(cfg0.nb_fiches || 5)) + '"></div>'
      + '<div class="jp-field"><label>Densité (1–5)</label><input id="jwDensite" type="number" min="1" max="5" value="'
      + esc(String(cfg0.densite_trous || 3)) + '"></div>'
      + '</div></section>'
      + '<section class="jp-quiz-admin-panel" id="jwFiche" hidden><h3 class="jp-quiz-admin-panel-title">Fiche aléatoire</h3>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Seuil exclusion /10</label><input id="jwSeuil" type="number" min="1" max="10" value="'
      + esc(String(cfg0.seuil_exclusion || 8)) + '"></div>'
      + '<div class="jp-field"><label>Nb notes &gt; seuil</label><input id="jwNbNotes" type="number" min="1" max="10" value="'
      + esc(String(cfg0.nb_notes_exclusion || 3)) + '"></div>'
      + '</div></section>'
      + '<section class="jp-quiz-admin-panel" id="jwOrdo" hidden><h3 class="jp-quiz-admin-panel-title">Règles ordonnance</h3>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Type règle</label><select id="jwRegleKind">'
      + '<option value="classe_therapeutique">Classe thérapeutique × N</option>'
      + '<option value="classe_pharmacologique">Classe pharmacologique × N</option>'
      + '<option value="matrice">Matrice fixe</option></select></div>'
      + '<div class="jp-field"><label>Nombre</label><input id="jwRegleN" type="number" min="1" max="20" value="2"></div></div>'
      + '<div class="jp-field" id="jwRegleTherWrap"><label>Classe thérapeutique</label><div id="jwRegleTher"></div></div>'
      + '<div class="jp-field" id="jwReglePharmaWrap" hidden><label>Classe pharmacologique</label><div id="jwReglePharma"></div></div>'
      + '<div class="jp-field" id="jwRegleMatWrap" hidden><label>Molécule fixe</label><div id="jwRegleMat"></div></div>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="jwAddRegle">Ajouter la règle</button>'
      + '<div id="jwReglesList" class="jp-muted" style="margin-top:0.75rem"></div>'
      + '</section>'
      + '<section class="jp-quiz-admin-panel" id="jwClassement" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Classement (glisser-déposer)</h3>'
      + '<div class="jp-field"><label>Consigne</label>'
      + '<input id="jwClassConsigne" maxlength="300" value="'
      + esc(cfg0.consigne || 'Classez chaque item dans la bonne catégorie') + '"></div>'
      + '<div class="jp-jeu-hybrid-add" id="jwClassItemAdd"></div>'
      + '<div id="jwClassItems" class="jp-jeu-list"></div>'
      + '<div class="jp-jeu-hybrid-add" id="jwClassZoneAdd" style="margin-top:1rem"></div>'
      + '<div id="jwClassZones" class="jp-jeu-list"></div>'
      + '<div id="jwClassAssign" class="jp-jeu-assign" style="margin-top:1rem"></div>'
      + '</section>'
      + '<section class="jp-quiz-admin-panel" id="jwAppariement" hidden>'
      + '<h3 class="jp-quiz-admin-panel-title">Appariement (relier)</h3>'
      + '<div class="jp-field"><label>Consigne</label>'
      + '<input id="jwAppConsigne" maxlength="300" value="'
      + esc(cfg0.consigne || 'Reliez chaque élément de gauche à celui de droite') + '"></div>'
      + '<div class="jp-split jp-split-2">'
      + '<div><h4 class="jp-quiz-admin-panel-title" style="font-size:0.95rem">Colonne gauche</h4>'
      + '<div class="jp-jeu-hybrid-add" id="jwAppGaucheAdd"></div>'
      + '<div id="jwAppGauche" class="jp-jeu-list"></div></div>'
      + '<div><h4 class="jp-quiz-admin-panel-title" style="font-size:0.95rem">Colonne droite</h4>'
      + '<div class="jp-jeu-hybrid-add" id="jwAppDroiteAdd"></div>'
      + '<div id="jwAppDroite" class="jp-jeu-list"></div></div>'
      + '</div>'
      + '<div id="jwAppPaires" class="jp-jeu-assign" style="margin-top:1rem"></div>'
      + '</section>'
      + '</div>'
      + '<footer class="jp-studio-sheet-foot">'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close>Annuler</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="jwCreate">'
      + (editId ? 'Enregistrer' : 'Créer le jeu') + '</button>'
      + '</footer></div>';

    document.body.appendChild(overlay);

    function close() { overlay.remove(); }
    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    overlay.querySelector('#jwType').value = typeInit;
    overlay.querySelector('#jwMode').value = modeInit;

    function syncPanels() {
      const t = overlay.querySelector('#jwType').value;
      overlay.querySelector('#jwQuiz').hidden = t !== 'quiz';
      overlay.querySelector('#jwTrous').hidden = t !== 'trous';
      overlay.querySelector('#jwFiche').hidden = t !== 'fiche_aleatoire';
      overlay.querySelector('#jwOrdo').hidden = t !== 'ordonnance';
      overlay.querySelector('#jwClassement').hidden = t !== 'classement';
      overlay.querySelector('#jwAppariement').hidden = t !== 'appariement';
      const needChamps = t === 'quiz' || t === 'trous' || t === 'ordonnance';
      overlay.querySelector('#jwChampsBlock').hidden = !needChamps;
    }
    overlay.querySelector('#jwType').addEventListener('change', syncPanels);
    syncPanels();

    function syncRegleKind() {
      const k = overlay.querySelector('#jwRegleKind').value;
      overlay.querySelector('#jwRegleTherWrap').hidden = k !== 'classe_therapeutique';
      overlay.querySelector('#jwReglePharmaWrap').hidden = k !== 'classe_pharmacologique';
      overlay.querySelector('#jwRegleMatWrap').hidden = k !== 'matrice';
    }
    overlay.querySelector('#jwRegleKind').addEventListener('change', syncRegleKind);
    syncRegleKind();

    const initialPool = existing && Array.isArray(existing.module_ids) && existing.module_ids.length
      ? leafItems.filter((it) => existing.module_ids.indexOf(it.id) >= 0)
      : leafItems.filter((it) => it.id === moduleId);

    const poolChips = TA.chips(overlay.querySelector('#jwMods'), {
      search: TA.localSource(leafItems, { limit: 12 }),
      placeholder: 'Chercher une leçon…',
      ariaLabel: 'Leçons du pool',
      initial: initialPool,
    });

    const comboTher = TA.combo(overlay.querySelector('#jwRegleTher'), {
      search: TA.entiteSource('classes_therapeutiques'),
      minChars: 1,
      placeholder: 'Chercher une classe thérapeutique…',
      ariaLabel: 'Classe thérapeutique',
    });
    const comboPharma = TA.combo(overlay.querySelector('#jwReglePharma'), {
      search: TA.entiteSource('classes_pharmacologiques'),
      minChars: 1,
      placeholder: 'Chercher une classe pharmacologique…',
      ariaLabel: 'Classe pharmacologique',
    });
    const comboMat = TA.combo(overlay.querySelector('#jwRegleMat'), {
      search: TA.matriceSource(),
      minChars: 2,
      placeholder: 'DCI ou nom commercial…',
      ariaLabel: 'Molécule fixe',
    });

    function renderRegles() {
      const box = overlay.querySelector('#jwReglesList');
      box.innerHTML = regles.length
        ? '<ul>' + regles.map((r, i) => '<li>' + esc(r.label)
          + ' <button type="button" data-del="' + i + '" aria-label="Retirer">×</button></li>').join('') + '</ul>'
        : '<p>Aucune règle</p>';
      box.querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', () => {
          regles.splice(Number(b.getAttribute('data-del')), 1);
          renderRegles();
        });
      });
    }
    renderRegles();

    overlay.querySelector('#jwAddRegle').addEventListener('click', () => {
      const kind = overlay.querySelector('#jwRegleKind').value;
      if (kind === 'matrice') {
        const mol = comboMat.getItem();
        if (!mol) return global.JpToast?.warn?.('Choisissez une molécule dans la liste');
        regles.push({
          rule: { type: 'matrice', matrice_id: mol.id },
          label: 'Molécule fixe : ' + mol.label + (mol.sub ? ' (' + mol.sub + ')' : ''),
        });
        comboMat.clear(true);
      } else {
        const combo = kind === 'classe_therapeutique' ? comboTher : comboPharma;
        const classe = combo.getItem();
        if (!classe) return global.JpToast?.warn?.('Choisissez une classe dans la liste');
        const nombre = Number(overlay.querySelector('#jwRegleN').value) || 1;
        regles.push({
          rule: { type: kind, classe_id: classe.id, nombre },
          label: (kind === 'classe_therapeutique' ? 'Classe thérapeutique' : 'Classe pharmacologique')
            + ' : ' + classe.label + ' × ' + nombre,
        });
        combo.clear(true);
      }
      renderRegles();
    });

    /* ——— Questions manuelles quiz ——— */
    function renderManuelles() {
      const box = overlay.querySelector('#jwManuellesList');
      if (!quizManuelles.length) {
        box.innerHTML = '<p class="jp-muted">Aucune question manuelle</p>';
        return;
      }
      box.innerHTML = quizManuelles.map((q, qi) => {
        const props = q.propositions.length ? q.propositions : ['', ''];
        return '<div class="jp-jeu-manuelle" data-qm="' + qi + '">'
          + '<div class="jp-field"><label>Énoncé</label>'
          + '<input data-qm-q value="' + esc(q.question) + '" placeholder="Question…"></div>'
          + '<div class="jp-jeu-props">' + props.map((p, pi) =>
            '<div class="jp-jeu-prop-row">'
            + '<label class="jp-jeu-prop-correct"><input type="radio" name="qmCorrect' + qi + '" value="' + pi + '"'
            + (q.correct === p && p ? ' checked' : '') + '> Bonne</label>'
            + '<input data-qm-p="' + pi + '" value="' + esc(p) + '" placeholder="Proposition ' + (pi + 1) + '">'
            + '<button type="button" class="jp-btn jp-btn-ghost" data-qm-del-p="' + pi + '" aria-label="Retirer">×</button>'
            + '</div>').join('') + '</div>'
          + '<div class="jp-jeu-manuelle-actions">'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-qm-add-p>+ Proposition</button>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-qm-del>Supprimer la question</button>'
          + '</div></div>';
      }).join('');

      box.querySelectorAll('[data-qm]').forEach((card) => {
        const qi = Number(card.getAttribute('data-qm'));
        const q = quizManuelles[qi];
        card.querySelector('[data-qm-q]').addEventListener('input', (e) => { q.question = e.target.value; });
        card.querySelectorAll('[data-qm-p]').forEach((inp) => {
          inp.addEventListener('input', (e) => {
            const pi = Number(inp.getAttribute('data-qm-p'));
            const old = q.propositions[pi];
            q.propositions[pi] = e.target.value;
            if (q.correct === old) q.correct = e.target.value;
          });
        });
        card.querySelectorAll('input[type="radio"]').forEach((r) => {
          r.addEventListener('change', () => {
            const pi = Number(r.value);
            q.correct = q.propositions[pi] || '';
          });
        });
        card.querySelector('[data-qm-add-p]')?.addEventListener('click', () => {
          if (q.propositions.length >= 6) return global.JpToast?.warn?.('6 propositions max');
          q.propositions.push('');
          renderManuelles();
        });
        card.querySelectorAll('[data-qm-del-p]').forEach((b) => {
          b.addEventListener('click', () => {
            if (q.propositions.length <= 2) return global.JpToast?.warn?.('2 propositions min');
            const pi = Number(b.getAttribute('data-qm-del-p'));
            const removed = q.propositions.splice(pi, 1)[0];
            if (q.correct === removed) q.correct = q.propositions[0] || '';
            renderManuelles();
          });
        });
        card.querySelector('[data-qm-del]')?.addEventListener('click', () => {
          quizManuelles.splice(qi, 1);
          renderManuelles();
        });
      });
    }
    renderManuelles();
    overlay.querySelector('#jwAddManuelle').addEventListener('click', () => {
      quizManuelles.push({
        id: uid('qm'),
        question: '',
        propositions: ['', ''],
        correct: '',
      });
      renderManuelles();
    });

    /* ——— Hybrid add bar (typeahead + texte libre) ——— */
    function mountHybridAdd(host, optsAdd) {
      const canPropose = !!optsAdd.proposeFromLeft;
      host.innerHTML = '<div class="jp-split jp-split-2">'
        + '<div class="jp-field"><label>' + esc(optsAdd.labelTitle || 'Libellé') + '</label>'
        + '<input class="jw-hyb-label" placeholder="Texte libre ou préremplir via recherche…"></div>'
        + '<div class="jp-field"><label>Source</label>'
        + '<select class="jw-hyb-src">' + HYBRID_SOURCES.map((s) =>
          '<option value="' + s.value + '">' + esc(s.label) + '</option>').join('') + '</select></div></div>'
        + '<div class="jp-field jw-hyb-ta-wrap" hidden>'
        + '<div class="jw-hyb-ta-row">'
        + '<div class="jw-hyb-ta-main"><label>Recherche référentiel</label><div class="jw-hyb-ta"></div></div>'
        + (canPropose
          ? '<button type="button" class="jp-btn jp-btn-ghost jw-hyb-propose" hidden title="Proposer depuis l’autre colonne">'
            + 'Proposer associations</button>'
          : '')
        + '</div>'
        + (canPropose
          ? '<small class="jp-field-hint jw-hyb-propose-hint" hidden>'
            + 'Depuis l’autre colonne : molécules ↔ classes / indications… (et l’inverse).</small>'
          : '')
        + '</div>'
        + '<button type="button" class="jp-btn jp-btn-ghost jw-hyb-add">' + esc(optsAdd.button || 'Ajouter') + '</button>';

      const srcSel = host.querySelector('.jw-hyb-src');
      const taWrap = host.querySelector('.jw-hyb-ta-wrap');
      const taHost = host.querySelector('.jw-hyb-ta');
      const labelInp = host.querySelector('.jw-hyb-label');
      const proposeBtn = host.querySelector('.jw-hyb-propose');
      const proposeHint = host.querySelector('.jw-hyb-propose-hint');
      let combo = null;

      function syncProposeVisibility() {
        const src = srcSel.value;
        const show = canPropose && (src === 'matrice' || !!ENTITE_LIAISON[src]);
        if (proposeBtn) proposeBtn.hidden = !show;
        if (proposeHint) proposeHint.hidden = !show;
      }

      function remountTa() {
        const src = srcSel.value;
        taWrap.hidden = src === 'manuel';
        taHost.innerHTML = '';
        combo = null;
        syncProposeVisibility();
        const search = hybridSearch(src);
        if (!search) return;
        combo = TA.combo(taHost, {
          search,
          minChars: 1,
          placeholder: 'Chercher…',
          ariaLabel: 'Recherche ' + src,
          clearOnPick: false,
          onPick: (it) => {
            if (it && it.label) labelInp.value = it.label;
          },
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

      if (proposeBtn && optsAdd.proposeFromLeft) {
        proposeBtn.addEventListener('click', async () => {
          try {
            await optsAdd.proposeFromLeft(srcSel.value);
          } catch (e) {
            global.JpToast?.fromError?.(e) || global.JpToast?.warn?.(e.message || 'Erreur');
          }
        });
      }
    }

    function refItemsOf(list, entite) {
      return (list || []).filter((it) => isRefItem(it) && it.entite === entite);
    }

    function ensureRefItem(list, idPrefix, entite, entiteId, label, extra) {
      const eid = String(entiteId);
      const found = list.find((x) => isRefItem(x) && x.entite === entite && String(x.entite_id) === eid);
      if (found) {
        if (extra && extra.item_ids && !Array.isArray(found.item_ids)) found.item_ids = [];
        return { item: found, created: false };
      }
      const source = entite === 'matrice' ? 'matrice' : entite;
      const item = Object.assign({
        id: uid(idPrefix),
        label: label || eid,
        source,
        entite,
        entite_id: eid,
      }, extra || {});
      list.push(item);
      return { item, created: true };
    }

    function failToast(lines) {
      const msg = (lines || []).filter(Boolean).join(' · ');
      global.JpToast?.warn?.(msg || 'Proposition impossible');
    }

    /**
     * Propose depuis `seedList` vers `fillList` selon `targetSource`.
     * - seeds molécules + cible entité → ajoute les entités liées
     * - seeds entités + cible molécule → ajoute les molécules liées
     * fillSide: 'items'|'zones'|'gauche'|'droite'
     */
    async function proposeAssociations(targetSource, mode, fillSide) {
      const targetIsMatrice = targetSource === 'matrice';
      const targetIsEntite = !!ENTITE_LIAISON[targetSource];
      if (!targetIsMatrice && !targetIsEntite) {
        failToast(['Choisissez « Molécule » ou un type référentiel (classe, indication…) — pas texte libre.']);
        return;
      }

      let seedList;
      let fillList;
      let fillPrefix;
      let seedSideLabel;
      let fillSideLabel;
      if (mode === 'classement') {
        if (fillSide === 'zones') {
          seedList = classItems;
          fillList = classZones;
          fillPrefix = 'z';
          seedSideLabel = 'items (haut)';
          fillSideLabel = 'zones';
        } else {
          seedList = classZones;
          fillList = classItems;
          fillPrefix = 'i';
          seedSideLabel = 'zones';
          fillSideLabel = 'items';
        }
      } else if (fillSide === 'droite') {
        seedList = appGauche;
        fillList = appDroite;
        fillPrefix = 'd';
        seedSideLabel = 'colonne gauche';
        fillSideLabel = 'colonne droite';
      } else {
        seedList = appDroite;
        fillList = appGauche;
        fillPrefix = 'g';
        seedSideLabel = 'colonne droite';
        fillSideLabel = 'colonne gauche';
      }

      const seedMatrices = refItemsOf(seedList, 'matrice');

      // Direction A : molécules → entités du type cible
      // Direction B : entités → molécules
      let direction = null;
      let seeds = [];
      if (targetIsEntite && seedMatrices.length) {
        direction = 'mol_to_entite';
        seeds = seedMatrices;
      } else if (targetIsMatrice) {
        const anyEnt = (seedList || []).filter((it) => isRefItem(it) && it.entite !== 'matrice' && ENTITE_LIAISON[it.entite]);
        if (anyEnt.length) {
          direction = 'entite_to_mol';
          seeds = anyEnt;
        }
      }

      if (!direction) {
        const reasons = [];
        if (!(seedList || []).length) {
          reasons.push('Aucun élément dans « ' + seedSideLabel + ' »');
        } else if (!(seedList || []).some(isRefItem)) {
          reasons.push('« ' + seedSideLabel + ' » ne contient que du texte libre — il faut des éléments référentiel (pas manuel)');
        } else if (targetIsEntite && !seedMatrices.length) {
          reasons.push(
            'Pour proposer des « ' + sourceLibelle(targetSource)
            + ' », placez des molécules en « ' + seedSideLabel
            + ' » (actuellement : '
            + (seedList || []).filter(isRefItem).map((x) => sourceLibelle(x.entite === 'matrice' ? 'matrice' : x.entite)).slice(0, 3).join(', ')
            + ')'
          );
        } else if (targetIsMatrice) {
          reasons.push(
            'Pour proposer des molécules, placez des classes / indications… en « '
            + seedSideLabel + ' » (pas uniquement des molécules)'
          );
        } else {
          reasons.push('Aucune correspondance possible entre « ' + seedSideLabel + ' » et « ' + sourceLibelle(targetSource) + ' »');
        }
        failToast(reasons);
        return;
      }

      const noLink = [];
      const cancelled = [];
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
            id: String(id),
            label: labels[String(id)] || String(id),
          }));
          if (!candidates.length) {
            noLink.push(mol.label + ' (aucune ' + sourceLibelle(targetSource) + ' liée en fiche)');
            continue;
          }
          let chosenIds;
          if (candidates.length === 1) {
            chosenIds = [candidates[0].id];
          } else {
            chosenIds = await pickEquivalentsModal(overlay, {
              multiple: mode === 'classement',
              sourceLabel: mol.label,
              candidates,
            });
            if (!chosenIds) {
              cancelled.push(mol.label);
              continue;
            }
            if (mode === 'appariement') chosenIds = chosenIds.slice(0, 1);
          }
          const applied = applySeedToTargets({
            mode, fillSide, seed: mol, targetEntite: targetSource,
            chosenIds, labels, fillList, fillPrefix, fillExtra,
          });
          added += applied.added;
          linked += applied.linked;
        }
      } else {
        // Group seeds by their entite table (IEC + indication possible)
        const byTable = {};
        seeds.forEach((s) => {
          if (!byTable[s.entite]) byTable[s.entite] = [];
          byTable[s.entite].push(s);
        });
        for (const entiteTable of Object.keys(byTable)) {
          const group = byTable[entiteTable];
          const byEnt = await loadMatriceIdsByEntities(entiteTable, group.map((s) => s.entite_id));
          const allMids = [];
          group.forEach((s) => {
            (byEnt[String(s.entite_id)] || []).forEach((id) => allMids.push(id));
          });
          const labels = await loadMatriceLabels(allMids);

          for (const seed of group) {
            const candidates = (byEnt[String(seed.entite_id)] || []).map((id) => ({
              id: String(id),
              label: labels[String(id)] || String(id),
            }));
            if (!candidates.length) {
              noLink.push(seed.label + ' (aucune molécule liée en référentiel)');
              continue;
            }
            let chosenIds;
            if (candidates.length === 1) {
              chosenIds = [candidates[0].id];
            } else {
              chosenIds = await pickEquivalentsModal(overlay, {
                multiple: mode === 'classement',
                sourceLabel: seed.label,
                candidates,
              });
              if (!chosenIds) {
                cancelled.push(seed.label);
                continue;
              }
              if (mode === 'appariement') chosenIds = chosenIds.slice(0, 1);
            }
            const applied = applySeedToTargets({
              mode, fillSide, seed, targetEntite: 'matrice',
              chosenIds, labels, fillList, fillPrefix, fillExtra,
            });
            added += applied.added;
            linked += applied.linked;
          }
        }
      }

      if (mode === 'classement') {
        renderClassItems();
        renderClassZones();
        renderClassAssign();
      } else {
        renderAppCol('gauche');
        renderAppCol('droite');
      }

      if (!linked) {
        const parts = ['Aucune association créée'];
        if (noLink.length) {
          parts.push('sans lien : ' + noLink.slice(0, 4).join(' ; ') + (noLink.length > 4 ? '…' : ''));
        }
        if (cancelled.length) {
          parts.push('annulé pour : ' + cancelled.slice(0, 3).join(', '));
        }
        if (!noLink.length && !cancelled.length) {
          parts.push('vérifiez le type « ' + sourceLibelle(targetSource) + ' » et le contenu de « ' + seedSideLabel + ' »');
        }
        failToast(parts);
        return;
      }

      global.JpToast?.ok?.(
        linked + ' association' + (linked > 1 ? 's' : '') + ' · '
        + added + ' ajoutée' + (added > 1 ? 's' : '') + ' en « ' + fillSideLabel + ' »'
        + (noLink.length ? ' · ' + noLink.length + ' sans lien' : '')
        + (cancelled.length ? ' · ' + cancelled.length + ' annulée(s)' : '')
      );
    }

    function applySeedToTargets(o) {
      const {
        mode, fillSide, seed, targetEntite, chosenIds, labels, fillList, fillPrefix, fillExtra,
      } = o;
      let added = 0;
      let linked = 0;

      if (mode === 'classement') {
        const seedIsItem = fillSide === 'zones'; // seed in items, fill zones
        if (seedIsItem) {
          // item (seed) → zones (targets): clear then assign
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
          // zone (seed) → items (targets): each target item assigned to this zone
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
        // Appariement 1↔1 : seed côté opposé, une cible
        const tid = chosenIds[0];
        const { item: other, created } = ensureRefItem(
          fillList, fillPrefix, targetEntite, tid, labels[tid]
        );
        if (created) added += 1;
        if (fillSide === 'droite') {
          Object.keys(appPaires).forEach((g) => {
            if (g !== seed.id && appPaires[g] === other.id) delete appPaires[g];
          });
          appPaires[seed.id] = other.id;
        } else {
          // seed est à droite, other à gauche
          Object.keys(appPaires).forEach((g) => {
            if (appPaires[g] === seed.id && g !== other.id) delete appPaires[g];
          });
          appPaires[other.id] = seed.id;
        }
        linked = 1;
      }
      return { added, linked };
    }

    function renderClassItems() {
      const box = overlay.querySelector('#jwClassItems');
      box.innerHTML = classItems.length
        ? '<ul>' + classItems.map((it, i) => '<li><strong>' + esc(it.label) + '</strong>'
          + ' <span class="jp-muted">(' + esc(it.source || 'manuel') + ')</span>'
          + ' <button type="button" data-del-item="' + i + '" aria-label="Retirer">×</button></li>').join('') + '</ul>'
        : '<p class="jp-muted">Aucun item</p>';
      box.querySelectorAll('[data-del-item]').forEach((b) => {
        b.addEventListener('click', () => {
          const id = classItems[Number(b.getAttribute('data-del-item'))]?.id;
          classItems.splice(Number(b.getAttribute('data-del-item')), 1);
          classZones.forEach((z) => { z.item_ids = z.item_ids.filter((x) => x !== id); });
          renderClassItems();
          renderClassAssign();
        });
      });
      renderClassAssign();
    }

    function renderClassZones() {
      const box = overlay.querySelector('#jwClassZones');
      box.innerHTML = classZones.length
        ? '<ul>' + classZones.map((z, i) => '<li><strong>' + esc(z.label) + '</strong>'
          + ' <span class="jp-muted">(' + esc(z.source || 'manuel') + ')</span>'
          + ' <button type="button" data-del-zone="' + i + '" aria-label="Retirer">×</button></li>').join('') + '</ul>'
        : '<p class="jp-muted">Aucune zone</p>';
      box.querySelectorAll('[data-del-zone]').forEach((b) => {
        b.addEventListener('click', () => {
          classZones.splice(Number(b.getAttribute('data-del-zone')), 1);
          renderClassZones();
          renderClassAssign();
        });
      });
      renderClassAssign();
    }

    function renderClassAssign() {
      const box = overlay.querySelector('#jwClassAssign');
      if (!classItems.length || !classZones.length) {
        box.innerHTML = '<p class="jp-muted">Ajoutez des items et des zones, puis cochez la ou les zone(s) correcte(s).</p>';
        return;
      }
      const zonesOf = {};
      classZones.forEach((z) => (z.item_ids || []).forEach((id) => {
        if (!zonesOf[id]) zonesOf[id] = new Set();
        zonesOf[id].add(z.id);
      }));
      box.innerHTML = '<h4 class="jp-quiz-admin-panel-title" style="font-size:0.95rem">Affectation correcte</h4>'
        + '<p class="jp-muted jp-field-hint">Plusieurs zones possibles par item (classement).</p>'
        + classItems.map((it) => '<div class="jp-jeu-assign-block"><span class="jp-jeu-assign-label">'
          + esc(it.label) + '</span><div class="jp-jeu-assign-checks" data-assign-item="' + esc(it.id) + '">'
          + classZones.map((z) => '<label class="jp-jeu-pick-opt"><input type="checkbox" value="'
            + esc(z.id) + '"' + (zonesOf[it.id] && zonesOf[it.id].has(z.id) ? ' checked' : '')
            + '> <span>' + esc(z.label) + '</span></label>').join('')
          + '</div></div>').join('');
      box.querySelectorAll('[data-assign-item]').forEach((wrap) => {
        const itemId = wrap.getAttribute('data-assign-item');
        wrap.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
          cb.addEventListener('change', () => {
            const zoneId = cb.value;
            const z = classZones.find((x) => x.id === zoneId);
            if (!z) return;
            z.item_ids = (z.item_ids || []).filter((x) => x !== itemId);
            if (cb.checked) z.item_ids.push(itemId);
          });
        });
      });
    }

    mountHybridAdd(overlay.querySelector('#jwClassItemAdd'), {
      labelTitle: 'Item à classer',
      button: '+ Item',
      idPrefix: 'i',
      proposeFromLeft: (src) => proposeAssociations(src, 'classement', 'items'),
      onAdd: (it) => {
        classItems.push(it);
        renderClassItems();
      },
    });
    mountHybridAdd(overlay.querySelector('#jwClassZoneAdd'), {
      labelTitle: 'Zone / catégorie',
      button: '+ Zone',
      idPrefix: 'z',
      proposeFromLeft: (src) => proposeAssociations(src, 'classement', 'zones'),
      onAdd: (it) => {
        classZones.push({
          id: it.id,
          label: it.label,
          item_ids: [],
          source: it.source || 'manuel',
          entite: it.entite || null,
          entite_id: it.entite_id || null,
        });
        renderClassZones();
      },
    });
    renderClassItems();
    renderClassZones();

    /* ——— Appariement ——— */
    function renderAppCol(side) {
      const list = side === 'gauche' ? appGauche : appDroite;
      const box = overlay.querySelector(side === 'gauche' ? '#jwAppGauche' : '#jwAppDroite');
      box.innerHTML = list.length
        ? '<ul>' + list.map((it, i) => '<li><strong>' + esc(it.label) + '</strong>'
          + ' <span class="jp-muted">(' + esc(it.source || 'manuel') + ')</span>'
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
      const box = overlay.querySelector('#jwAppPaires');
      if (!appGauche.length || !appDroite.length) {
        box.innerHTML = '<p class="jp-muted">Ajoutez des éléments à gauche et à droite, puis formez les paires 1↔1.</p>';
        return;
      }
      box.innerHTML = '<h4 class="jp-quiz-admin-panel-title" style="font-size:0.95rem">Paires correctes (1↔1)</h4>'
        + appGauche.map((g) => '<div class="jp-jeu-assign-row"><span>' + esc(g.label) + '</span>'
          + '<select data-pair="' + esc(g.id) + '">'
          + '<option value="">— droite —</option>'
          + appDroite.map((d) => '<option value="' + esc(d.id) + '"'
            + (appPaires[g.id] === d.id ? ' selected' : '') + '>' + esc(d.label) + '</option>').join('')
          + '</select></div>').join('');
      box.querySelectorAll('[data-pair]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const gid = sel.getAttribute('data-pair');
          const did = sel.value;
          if (!did) {
            delete appPaires[gid];
            return;
          }
          Object.keys(appPaires).forEach((g) => {
            if (g !== gid && appPaires[g] === did) delete appPaires[g];
          });
          appPaires[gid] = did;
          renderAppPaires();
        });
      });
    }

    mountHybridAdd(overlay.querySelector('#jwAppGaucheAdd'), {
      labelTitle: 'Élément gauche',
      button: '+ Gauche',
      idPrefix: 'g',
      proposeFromLeft: (src) => proposeAssociations(src, 'appariement', 'gauche'),
      onAdd: (it) => {
        appGauche.push(it);
        renderAppCol('gauche');
      },
    });
    mountHybridAdd(overlay.querySelector('#jwAppDroiteAdd'), {
      labelTitle: 'Élément droite',
      button: '+ Droite',
      idPrefix: 'd',
      proposeFromLeft: (src) => proposeAssociations(src, 'appariement', 'droite'),
      onAdd: (it) => {
        appDroite.push(it);
        renderAppCol('droite');
      },
    });
    renderAppCol('gauche');
    renderAppCol('droite');

    function buildConfiguration(type) {
      const champs = Array.from(overlay.querySelectorAll('input[name="jwChamp"]:checked')).map((el) => el.value);
      const base = {
        champs,
        champs_interroges: champs,
        regles: type === 'ordonnance' ? regles.map((r) => r.rule) : [],
        nb_questions: Number(overlay.querySelector('#jwNbQ').value) || 10,
        nb_propositions: Number(overlay.querySelector('#jwNbProp').value) || 3,
        nb_fiches: Number(overlay.querySelector('#jwNbFiches').value) || 5,
        densite_trous: Number(overlay.querySelector('#jwDensite').value) || 3,
        seuil_exclusion: Number(overlay.querySelector('#jwSeuil').value) || 8,
        nb_notes_exclusion: Number(overlay.querySelector('#jwNbNotes').value) || 3,
      };
      const autoMaxRaw = overlay.querySelector('#jwNbAutoMax').value;
      if (autoMaxRaw !== '' && !Number.isNaN(Number(autoMaxRaw))) {
        base.nb_auto_max = Math.max(0, Number(autoMaxRaw));
      }
      if (type === 'quiz') {
        base.questions_manuelles = quizManuelles.map((q) => ({
          id: q.id,
          question: (q.question || '').trim(),
          propositions: (q.propositions || []).map((p) => String(p || '').trim()).filter(Boolean),
          correct: (q.correct || '').trim(),
        })).filter((q) => q.question && q.propositions.length >= 2 && q.correct
          && q.propositions.indexOf(q.correct) >= 0);
      }
      if (type === 'classement') {
        base.consigne = (overlay.querySelector('#jwClassConsigne').value || '').trim()
          || 'Classez chaque item dans la bonne catégorie';
        base.items = classItems.map((it) => ({
          id: it.id,
          label: it.label,
          source: it.source || 'manuel',
          entite: it.entite || undefined,
          entite_id: it.entite_id || undefined,
        }));
        base.zones = classZones.map((z) => ({
          id: z.id,
          label: z.label,
          item_ids: (z.item_ids || []).slice(),
          source: z.source || 'manuel',
          entite: z.entite || undefined,
          entite_id: z.entite_id || undefined,
        }));
      }
      if (type === 'appariement') {
        base.consigne = (overlay.querySelector('#jwAppConsigne').value || '').trim()
          || 'Reliez chaque élément de gauche à celui de droite';
        base.gauche = appGauche.map((it) => ({
          id: it.id,
          label: it.label,
          source: it.source || 'manuel',
          entite: it.entite || undefined,
          entite_id: it.entite_id || undefined,
        }));
        base.droite = appDroite.map((it) => ({
          id: it.id,
          label: it.label,
          source: it.source || 'manuel',
          entite: it.entite || undefined,
          entite_id: it.entite_id || undefined,
        }));
        base.paires = Object.keys(appPaires).map((gid) => ({
          gauche_id: gid,
          droite_id: appPaires[gid],
        }));
      }
      return base;
    }

    function validate(type, configuration_json, moduleIds, titre) {
      if (!titre) throw new Error('Titre requis');
      if (!moduleIds.length) throw new Error('Ajoutez au moins une leçon au pool');
      if ((type === 'trous' || type === 'ordonnance') && !configuration_json.champs.length) {
        throw new Error('Sélectionnez au moins un champ');
      }
      if (type === 'ordonnance' && !regles.length) throw new Error('Ajoutez au moins une règle');
      if (type === 'quiz') {
        const man = configuration_json.questions_manuelles || [];
        if (!man.length && !configuration_json.champs.length) {
          throw new Error('Ajoutez des questions manuelles ou sélectionnez des champs auto');
        }
      }
      if (type === 'classement') {
        if (classItems.length < 2) throw new Error('Ajoutez au moins 2 items');
        if (classZones.length < 2) throw new Error('Ajoutez au moins 2 zones');
        const assigned = new Set();
        classZones.forEach((z) => z.item_ids.forEach((id) => assigned.add(id)));
        if (assigned.size < classItems.length) {
          throw new Error('Affectez une zone correcte à chaque item');
        }
      }
      if (type === 'appariement') {
        if (appGauche.length < 2 || appDroite.length < 2) {
          throw new Error('Au moins 2 éléments de chaque côté');
        }
        if (Object.keys(appPaires).length !== appGauche.length) {
          throw new Error('Formez une paire pour chaque élément de gauche');
        }
        const used = new Set(Object.values(appPaires));
        if (used.size !== appGauche.length) throw new Error('Chaque élément de droite ne peut être lié qu’une fois');
      }
    }

    overlay.querySelector('#jwCreate').addEventListener('click', async () => {
      try {
        const type = overlay.querySelector('#jwType').value;
        const titre = (overlay.querySelector('#jwTitre').value || '').trim();
        const moduleIds = poolChips.getIds();
        const configuration_json = buildConfiguration(type);
        validate(type, configuration_json, moduleIds, titre);

        if (editId) {
          const updated = await rpc('v2_update_modele_jeu', {
            p_modele_id: editId,
            p_payload: {
              titre,
              mode: overlay.querySelector('#jwMode').value,
              module_ids: moduleIds,
              configuration_json,
            },
          });
          global.JpToast?.ok?.('Jeu mis à jour');
          opts.onUpdated?.({ modele: updated });
          close();
          return;
        }

        const created = await rpc('v2_creer_modele_jeu', {
          p_payload: {
            type_jeu: type,
            titre,
            parcours_id: parcoursId,
            module_ids: moduleIds,
            mode: overlay.querySelector('#jwMode').value,
            configuration_json,
          },
        });

        const bloc = await rpc('v2_upsert_bloc', {
          p_payload: {
            module_id: moduleId,
            type_bloc: 'jeu',
            titre: created.titre || titre,
            ordre: 999,
            payload_json: {
              modele_id: created.id,
              code_unique: created.code_unique,
              libelle_cta: 'Jouer',
              type_jeu: type,
            },
          },
        });

        global.JpToast?.ok?.(created.code_unique || 'Jeu créé');
        opts.onCreated?.({ modele: created, bloc });
        close();
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
    });
  }

  global.JpStudioJeuWizard = { open };
})(window);
