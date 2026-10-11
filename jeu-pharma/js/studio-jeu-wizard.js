/**
 * Wizard création de jeu complet (quiz / trous / fiche / ordonnance) pour le studio.
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

  /**
   * @param {{
   *   parcoursId: string,
   *   moduleId: string,
   *   modules: Array,
   *   defaultTitre?: string,
   *   onCreated?: Function
   * }} opts
   */
  async function open(opts) {
    const { parcoursId, moduleId, modules } = opts;
    const TA = global.JpTypeahead;
    const byId = {};
    (modules || []).forEach((m) => { byId[m.id] = m; });
    const leafItems = (modules || []).filter((m) => !m.est_groupe).map((m) => ({
      id: m.id,
      label: m.titre,
      sub: m.parent_id && byId[m.parent_id] ? byId[m.parent_id].titre : '',
    }));
    // Chaque entrée : { rule, label } — seul `rule` part dans configuration_json
    const regles = [];

    const overlay = document.createElement('div');
    overlay.className = 'jp-studio-overlay';
    overlay.innerHTML = '<div class="jp-studio-sheet jp-jeu-sheet">'
      + '<header class="jp-studio-sheet-head"><h2>Créer un jeu</h2>'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close>×</button></header>'
      + '<div class="jp-jeu-wiz-body">'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Type</label><select id="jwType">'
      + '<option value="quiz">Quiz</option><option value="trous">Tableau à trous</option>'
      + '<option value="fiche_aleatoire">Fiche aléatoire</option><option value="ordonnance">Ordonnance</option>'
      + '</select></div>'
      + '<div class="jp-field"><label>Mode</label><select id="jwMode">'
      + '<option value="entrainement">Entraînement</option><option value="evaluation">Évaluation</option>'
      + '</select></div></div>'
      + '<div class="jp-field"><label>Titre</label><input id="jwTitre" maxlength="200" value="'
      + esc(opts.defaultTitre || '') + '"></div>'
      + '<div class="jp-field"><span class="jp-field-label">Leçons du pool (tapez pour ajouter)</span>'
      + '<div id="jwMods"></div></div>'
      + '<div class="jp-field" id="jwChampsBlock"><span class="jp-field-label">Champs interrogés</span>'
      + '<div class="jp-quiz-admin-champs-grid">'
      + CHAMPS.map(([code, lib], i) => '<label class="jp-quiz-admin-champ"><input type="checkbox" name="jwChamp" value="'
        + code + '"' + (i < 3 ? ' checked' : '') + '> <span>' + esc(lib) + '</span></label>').join('')
      + '</div></div>'
      + '<section class="jp-quiz-admin-panel" id="jwQuiz"><h3 class="jp-quiz-admin-panel-title">Quiz</h3>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Nb questions</label><input id="jwNbQ" type="number" min="1" max="50" value="10"></div>'
      + '<div class="jp-field"><label>Propositions</label><input id="jwNbProp" type="number" min="2" max="6" value="3"></div>'
      + '</div></section>'
      + '<section class="jp-quiz-admin-panel" id="jwTrous" hidden><h3 class="jp-quiz-admin-panel-title">Trous</h3>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Nb fiches</label><input id="jwNbFiches" type="number" min="1" max="30" value="5"></div>'
      + '<div class="jp-field"><label>Densité (1–5)</label><input id="jwDensite" type="number" min="1" max="5" value="3"></div>'
      + '</div></section>'
      + '<section class="jp-quiz-admin-panel" id="jwFiche" hidden><h3 class="jp-quiz-admin-panel-title">Fiche aléatoire</h3>'
      + '<div class="jp-split jp-split-2">'
      + '<div class="jp-field"><label>Seuil exclusion /10</label><input id="jwSeuil" type="number" min="1" max="10" value="8"></div>'
      + '<div class="jp-field"><label>Nb notes &gt; seuil</label><input id="jwNbNotes" type="number" min="1" max="10" value="3"></div>'
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
      + '</div>'
      + '<footer class="jp-studio-sheet-foot">'
      + '<button type="button" class="jp-btn jp-btn-ghost" data-close>Annuler</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="jwCreate">Créer le jeu</button>'
      + '</footer></div>';

    document.body.appendChild(overlay);

    function close() { overlay.remove(); }
    overlay.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

    function syncPanels() {
      const t = overlay.querySelector('#jwType').value;
      overlay.querySelector('#jwQuiz').hidden = t !== 'quiz';
      overlay.querySelector('#jwTrous').hidden = t !== 'trous';
      overlay.querySelector('#jwFiche').hidden = t !== 'fiche_aleatoire';
      overlay.querySelector('#jwOrdo').hidden = t !== 'ordonnance';
      overlay.querySelector('#jwChampsBlock').hidden = t === 'fiche_aleatoire';
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

    // Pool de leçons (pastilles + recherche), leçon courante préchoisie
    const poolChips = TA.chips(overlay.querySelector('#jwMods'), {
      search: TA.localSource(leafItems, { limit: 12 }),
      placeholder: 'Chercher une leçon…',
      ariaLabel: 'Leçons du pool',
      initial: leafItems.filter((it) => it.id === moduleId),
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

    overlay.querySelector('#jwCreate').addEventListener('click', async () => {
      try {
        const type = overlay.querySelector('#jwType').value;
        const titre = (overlay.querySelector('#jwTitre').value || '').trim();
        if (!titre) throw new Error('Titre requis');
        const moduleIds = poolChips.getIds();
        if (!moduleIds.length) throw new Error('Ajoutez au moins une leçon au pool');
        const champs = Array.from(overlay.querySelectorAll('input[name="jwChamp"]:checked')).map((el) => el.value);
        if (type !== 'fiche_aleatoire' && !champs.length) throw new Error('Sélectionnez au moins un champ');
        if (type === 'ordonnance' && !regles.length) throw new Error('Ajoutez au moins une règle');

        const configuration_json = {
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
