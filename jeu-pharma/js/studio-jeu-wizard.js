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
      host.innerHTML = '<div class="jp-split jp-split-2">'
        + '<div class="jp-field"><label>' + esc(optsAdd.labelTitle || 'Libellé') + '</label>'
        + '<input class="jw-hyb-label" placeholder="Texte libre ou préremplir via recherche…"></div>'
        + '<div class="jp-field"><label>Source</label>'
        + '<select class="jw-hyb-src">' + HYBRID_SOURCES.map((s) =>
          '<option value="' + s.value + '">' + esc(s.label) + '</option>').join('') + '</select></div></div>'
        + '<div class="jp-field jw-hyb-ta-wrap" hidden><label>Recherche référentiel</label><div class="jw-hyb-ta"></div></div>'
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
        box.innerHTML = '<p class="jp-muted">Ajoutez des items et des zones, puis affectez la bonne zone à chaque item.</p>';
        return;
      }
      const zoneByItem = {};
      classZones.forEach((z) => z.item_ids.forEach((id) => { zoneByItem[id] = z.id; }));
      box.innerHTML = '<h4 class="jp-quiz-admin-panel-title" style="font-size:0.95rem">Affectation correcte</h4>'
        + classItems.map((it) => '<div class="jp-jeu-assign-row"><span>' + esc(it.label) + '</span>'
          + '<select data-assign="' + esc(it.id) + '">'
          + '<option value="">— zone —</option>'
          + classZones.map((z) => '<option value="' + esc(z.id) + '"'
            + (zoneByItem[it.id] === z.id ? ' selected' : '') + '>' + esc(z.label) + '</option>').join('')
          + '</select></div>').join('');
      box.querySelectorAll('[data-assign]').forEach((sel) => {
        sel.addEventListener('change', () => {
          const itemId = sel.getAttribute('data-assign');
          const zoneId = sel.value;
          classZones.forEach((z) => {
            z.item_ids = z.item_ids.filter((x) => x !== itemId);
            if (z.id === zoneId) z.item_ids.push(itemId);
          });
        });
      });
    }

    mountHybridAdd(overlay.querySelector('#jwClassItemAdd'), {
      labelTitle: 'Item à classer',
      button: '+ Item',
      idPrefix: 'i',
      onAdd: (it) => { classItems.push(it); renderClassItems(); },
    });
    mountHybridAdd(overlay.querySelector('#jwClassZoneAdd'), {
      labelTitle: 'Zone / catégorie',
      button: '+ Zone',
      idPrefix: 'z',
      onAdd: (it) => {
        classZones.push({ id: it.id, label: it.label, item_ids: [] });
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
      onAdd: (it) => { appGauche.push(it); renderAppCol('gauche'); },
    });
    mountHybridAdd(overlay.querySelector('#jwAppDroiteAdd'), {
      labelTitle: 'Élément droite',
      button: '+ Droite',
      idPrefix: 'd',
      onAdd: (it) => { appDroite.push(it); renderAppCol('droite'); },
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
