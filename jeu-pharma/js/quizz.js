/**
 * Quiz Jeu Pharma — CRUD admin + génération client + RPC joueur.
 *
 * Création admin : snapshot figé côté client (filtres multi, delete / régénérer
 * une question). La RPC `generer_et_geler_quiz` reste pour regénération globale
 * d’un quiz déjà créé (sans édition unitaire).
 */
(function (global) {
  const PREFIX = 'PH';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  const LIBELLES_CHAMP_ENONCE = {
    nom_commercial: 'nom commercial',
    dci: 'DCI',
    secteur_therapeutique: 'secteur thérapeutique',
    classe_therapeutique: 'classe thérapeutique',
    classe_pharmacologique: 'classe pharmacologique',
    detail_pharmacologie: 'détail pharmacologie',
    posologie_generale: 'posologie générale',
    grossesse_allaitement: 'précautions grossesse & allaitement',
    indications: 'indication',
    contre_indications: 'contre-indication',
    effets_indesirables: 'effet indésirable',
    precautions_emploi: 'précaution d\'emploi',
    interactions: 'interaction',
    surveillances: 'surveillance',
    voies_administration: 'voie d\'administration',
  };

  function sb() {
    return global.JpApp.sbJeu();
  }

  function genCode() {
    let s = '';
    for (let i = 0; i < 5; i++) {
      s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return `${PREFIX}-${s}`;
  }

  function champLibelle(code) {
    const c = (global.JpConstants?.CHAMP_CODES || []).find((x) => x.code === code);
    return c?.libelle || code;
  }

  function modeLibelle(mode) {
    const m = (global.JpConstants?.QUIZ_MODES || []).find((x) => x.code === mode);
    return m?.libelle || mode;
  }

  function champMeta(code) {
    return (global.JpConstants?.CHAMP_CODES || []).find((x) => x.code === code) || null;
  }

  function shuffle(arr) {
    if (global.JpTrous?.shuffle) return global.JpTrous.shuffle(arr);
    const a = (arr || []).slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  }

  function formatNoms(med) {
    return global.JpMedicaments?.formatNoms?.(med) || med?.nom_commercial || '';
  }

  /**
   * Une valeur (id + libellé) pour un champ — miroir léger de `_valeur_champ_matrice`.
   * Multi : tire une entité au hasard ; singulier : contrôle `*_niveaux` si présent.
   */
  function pickValeurChamp(med, champ, niveau) {
    if (!med || !champ) return null;
    const meta = champMeta(champ);
    if (!meta) return null;
    if (global.JpNiveaux && !global.JpNiveaux.champDisponible(niveau, champ)) return null;

    if (meta.card === 'N') {
      const arr = champ === 'nom_commercial' ? med.noms_commerciaux : med[champ];
      if (!Array.isArray(arr) || !arr.length) return null;
      const candidats = arr.filter(function (x) {
        return x && x.id && global.JpMedicaments?.labelFrom?.(x)
          && (!global.JpNiveaux || global.JpNiveaux.entiteDisponible(niveau, champ, x.id));
      });
      if (!candidats.length) return null;
      const pick = candidats[Math.floor(Math.random() * candidats.length)];
      return { entite_id: pick.id, valeur: global.JpMedicaments.labelFrom(pick) };
    }

    if (global.JpTrous?.cellValeurFromMed) {
      const cv = global.JpTrous.cellValeurFromMed(med, champ, null);
      if (!cv?.valeur || !cv.entite_id) return null;
      return { entite_id: cv.entite_id, valeur: cv.valeur };
    }

    return null;
  }

  function buildEnonce(champ, med, bonne) {
    const dciVal = med.dci || null;
    const nomVal = formatNoms(med) || null;
    if (champ === 'dci') {
      return 'Quelle est la DCI de ' + (nomVal || 'ce médicament') + ' ?';
    }
    if (champ === 'nom_commercial') {
      return 'Quel est le nom commercial de ' + (dciVal || 'cette DCI') + ' ?';
    }
    const lib = LIBELLES_CHAMP_ENONCE[champ] || champLibelle(champ).toLowerCase();
    return 'Quelle est la ' + lib + ' de '
      + (dciVal || '…') + ' (' + (nomVal || '…') + ') ?';
  }

  /**
   * Distracteurs depuis le pool (priorité même secteur, puis reste).
   * @returns {{ id: string, valeur: string, correct: boolean }[]}
   */
  function collectDistracteurs(pool, champ, excludeId, secteurId, niveau, limit) {
    const need = Math.max(0, Number(limit) || 0);
    if (!need) return [];

    const seen = {};
    const same = [];
    const other = [];

    (pool || []).forEach(function (med) {
      const v = pickValeurChamp(med, champ, niveau);
      if (!v || !v.entite_id || String(v.entite_id) === String(excludeId)) return;
      if (seen[v.entite_id]) return;
      seen[v.entite_id] = true;
      const item = { id: v.entite_id, valeur: v.valeur, correct: false };
      if (secteurId && med.secteur_therapeutique_id === secteurId) same.push(item);
      else other.push(item);
    });

    const ordered = shuffle(same).concat(shuffle(other));
    return ordered.slice(0, need);
  }

  /**
   * Tente de construire un QCM depuis un médicament + champ.
   * @returns {object|null}
   */
  function tryBuildQuestion(med, champ, pool, opts) {
    const niveau = opts?.niveau || null;
    const nbProp = Math.max(2, Number(opts?.nb_propositions) || 3);
    const bonne = pickValeurChamp(med, champ, niveau);
    if (!bonne) return null;

    const distracteurs = collectDistracteurs(
      pool,
      champ,
      bonne.entite_id,
      med.secteur_therapeutique_id || null,
      niveau,
      nbProp - 1
    );
    if (distracteurs.length < nbProp - 1) return null;

    const props = shuffle(distracteurs.concat([{
      id: bonne.entite_id,
      valeur: bonne.valeur,
      correct: true,
    }]));

    return {
      enonce: buildEnonce(champ, med, bonne),
      matrice_id: med.id,
      champ_code: champ,
      bonne_reponse_id: bonne.entite_id,
      propositions: props,
    };
  }

  /**
   * Génère une question (ou null) depuis le pool + champs.
   * @param {{
   *   meds: object[],
   *   champs: string[],
   *   niveau?: string,
   *   nb_propositions?: number,
   *   avoidKeys?: Set<string>|string[],
   * }} opts
   */
  function genererUneQuestion(opts) {
    const meds = opts?.meds || [];
    const champs = (opts?.champs || []).filter(Boolean);
    if (!meds.length || !champs.length) return null;

    const avoid = new Set();
    (opts.avoidKeys || []).forEach(function (k) { avoid.add(String(k)); });

    const maxAttempts = Math.max(40, meds.length * champs.length * 2);
    for (let a = 0; a < maxAttempts; a++) {
      const med = meds[Math.floor(Math.random() * meds.length)];
      const champ = champs[Math.floor(Math.random() * champs.length)];
      const key = String(med.id) + '|' + champ;
      if (avoid.has(key) && a < maxAttempts - 10) continue;
      const q = tryBuildQuestion(med, champ, meds, opts);
      if (q) return q;
    }
    return null;
  }

  /**
   * Génère N questions (tableau sans `ordre` — l’appelant numérote).
   */
  function genererQuestions(opts) {
    const nb = Math.max(1, Number(opts?.nb_questions) || 10);
    const out = [];
    const avoid = new Set();
    let attempts = 0;
    const maxAttempts = nb * 25;

    while (out.length < nb && attempts < maxAttempts) {
      attempts += 1;
      const q = genererUneQuestion({
        meds: opts.meds,
        champs: opts.champs,
        niveau: opts.niveau,
        nb_propositions: opts.nb_propositions,
        avoidKeys: avoid,
      });
      if (!q) continue;
      avoid.add(String(q.matrice_id) + '|' + q.champ_code);
      out.push(q);
    }

    if (out.length < nb) {
      throw new Error(
        'Pas assez de QCM possibles avec ces filtres / champs (généré : '
          + out.length + ' / ' + nb + ')'
      );
    }
    return out;
  }

  function renumeroter(questions) {
    return (questions || []).map(function (q, i) {
      return Object.assign({}, q, { ordre: i + 1 });
    });
  }

  async function listSecteurs() {
    const { data, error } = await sb()
      .from('secteurs_therapeutiques')
      .select('id, valeur')
      .eq('actif', true)
      .order('valeur');
    if (error) throw error;
    return data || [];
  }

  async function listQuiz(opts = {}) {
    let q = sb()
      .from('quizz')
      .select('id, code_unique, titre, niveau_cible, mode, secteur_therapeutique_id, created_at, actif, snapshot_questions')
      .order('created_at', { ascending: false });
    if (opts.actifsOnly !== false) q = q.eq('actif', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  /**
   * Crée un quiz avec snapshot déjà figé (pas de re-tirage RPC).
   * @param {{
   *   titre: string,
   *   secteur_therapeutique_id?: string|null,
   *   niveau_cible: string,
   *   mode: 'entrainement'|'evaluation',
   *   champs_interroges: string[],
   *   nb_questions?: number,
   *   nb_propositions?: number,
   *   filtres?: object,
   *   snapshot_questions: object[],
   * }} input
   */
  async function createWithSnapshot(input) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non authentifié');

    const champs = (input.champs_interroges || []).filter(Boolean);
    if (!champs.length) throw new Error('Sélectionnez au moins un champ');
    if (!input.niveau_cible) throw new Error('Niveau obligatoire');
    if (!input.titre?.trim()) throw new Error('Titre obligatoire');

    const snap = renumeroter(input.snapshot_questions || []);
    if (!snap.length) throw new Error('Aucune question à enregistrer');

    snap.forEach(function (q, i) {
      if (!q.enonce || !q.bonne_reponse_id || !Array.isArray(q.propositions) || !q.propositions.length) {
        throw new Error('Question invalide (n°' + (i + 1) + ')');
      }
    });

    const configuration_json = {
      champs_interroges: champs,
      nb_questions: snap.length,
      nb_propositions: Math.max(2, Number(input.nb_propositions) || 3),
      distracteurs: 'meme_secteur',
      filtres: input.filtres || null,
    };

    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code_unique = genCode();
      const row = {
        code_unique,
        titre: String(input.titre).trim(),
        secteur_therapeutique_id: input.secteur_therapeutique_id || null,
        niveau_cible: input.niveau_cible,
        mode: input.mode === 'evaluation' ? 'evaluation' : 'entrainement',
        configuration_json,
        snapshot_questions: snap,
        created_by: user.id,
        actif: true,
      };
      const { data: created, error: insErr } = await sb()
        .from('quizz')
        .insert(row)
        .select('id, code_unique, titre, mode, niveau_cible')
        .single();
      if (insErr) {
        lastErr = insErr;
        if (/code_unique|duplicate|unique/i.test(insErr.message || '')) continue;
        throw insErr;
      }

      void global.JpLogs?.action?.('quiz_create', {
        code: created.code_unique,
        mode: created.mode,
        nb: snap.length,
      });

      return { ...created, snapshot_questions: snap };
    }
    throw lastErr || new Error('Impossible de générer un code unique');
  }

  /**
   * Legacy : crée puis génère via RPC (re-tirage serveur).
   * Préférer `createWithSnapshot` pour la création admin guidée.
   */
  async function createAndGenerate(input) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non authentifié');

    const champs = (input.champs_interroges || []).filter(Boolean);
    if (!champs.length) throw new Error('Sélectionnez au moins un champ');
    if (!input.niveau_cible) throw new Error('Niveau obligatoire');
    if (!input.titre?.trim()) throw new Error('Titre obligatoire');

    const configuration_json = {
      champs_interroges: champs,
      nb_questions: Math.max(1, Number(input.nb_questions) || 10),
      nb_propositions: Math.max(2, Number(input.nb_propositions) || 3),
      distracteurs: 'meme_secteur',
    };

    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code_unique = genCode();
      const row = {
        code_unique,
        titre: String(input.titre).trim(),
        secteur_therapeutique_id: input.secteur_therapeutique_id || null,
        niveau_cible: input.niveau_cible,
        mode: input.mode === 'evaluation' ? 'evaluation' : 'entrainement',
        configuration_json,
        created_by: user.id,
        actif: true,
      };
      const { data: created, error: insErr } = await sb()
        .from('quizz')
        .insert(row)
        .select('id, code_unique, titre, mode, niveau_cible')
        .single();
      if (insErr) {
        lastErr = insErr;
        if (/code_unique|duplicate|unique/i.test(insErr.message || '')) continue;
        throw insErr;
      }

      const { data: snap, error: rpcErr } = await sb().rpc('generer_et_geler_quiz', {
        p_quizz_id: created.id,
      });
      if (rpcErr) {
        await sb().from('quizz').delete().eq('id', created.id);
        throw rpcErr;
      }

      void global.JpLogs?.action?.('quiz_create', {
        code: created.code_unique,
        mode: created.mode,
        nb: Array.isArray(snap) ? snap.length : null,
      });

      return { ...created, snapshot_questions: snap };
    }
    throw lastErr || new Error('Impossible de générer un code unique');
  }

  async function regenerer(quizzId) {
    const { data, error } = await sb().rpc('generer_et_geler_quiz', { p_quizz_id: quizzId });
    if (error) throw error;
    void global.JpLogs?.action?.('quiz_regenerer', { quizz_id: quizzId });
    return data;
  }

  async function ouvrir(code) {
    const { data, error } = await sb().rpc('ouvrir_quiz', {
      p_code: String(code || '').trim().toUpperCase(),
    });
    if (error) throw error;
    void global.JpLogs?.action?.('quiz_ouvrir', { code: String(code || '').trim().toUpperCase() });
    return data;
  }

  /**
   * @param {string} quizzId
   * @param {{ ordre: number, proposition_id: string }[]} reponses
   */
  async function soumettre(quizzId, reponses) {
    const { data, error } = await sb().rpc('soumettre_quiz', {
      p_quizz_id: quizzId,
      p_reponses: reponses || [],
    });
    if (error) throw error;
    void global.JpLogs?.action?.('quiz_soumettre', {
      quizz_id: quizzId,
      score: data?.score_obtenu,
      max: data?.score_max,
    });
    return data;
  }

  async function mesScores() {
    const user = await global.JpApp.getUser();
    if (!user) return [];
    const { data, error } = await sb()
      .from('quizz_reponses_utilisateur')
      .select('id, quizz_id, mode, score_obtenu, score_max, created_at, quizz(code_unique, titre, mode)')
      .eq('utilisateur_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /** Admin : réponses / scores pour un quiz donné. */
  async function listScores(quizzId) {
    if (!quizzId) return [];
    const { data, error } = await sb()
      .from('quizz_reponses_utilisateur')
      .select('id, utilisateur_id, mode, score_obtenu, score_max, created_at')
      .eq('quizz_id', quizzId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /** Charge snapshot admin (avec corrigé) pour impression — lecture table si admin. */
  async function getByCode(code) {
    const c = String(code || '').trim().toUpperCase();
    const { data, error } = await sb()
      .from('quizz')
      .select('id, code_unique, titre, mode, niveau_cible, snapshot_questions, created_at')
      .eq('code_unique', c)
      .eq('actif', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Soft-archive : actif = false (pas de hard-delete). */
  async function setActif(id, actif) {
    const { data, error } = await sb()
      .from('quizz')
      .update({ actif: !!actif })
      .eq('id', id)
      .select('id, code_unique, actif')
      .single();
    if (error) throw error;
    void global.JpLogs?.action?.(actif ? 'quiz_desarchiver' : 'quiz_archiver', {
      quizz_id: id,
      code: data?.code_unique,
    });
    return data;
  }

  function archive(id) {
    return setActif(id, false);
  }

  function desarchiver(id) {
    return setActif(id, true);
  }

  global.JpQuizz = {
    genCode,
    champLibelle,
    modeLibelle,
    listSecteurs,
    listQuiz,
    pickValeurChamp,
    genererUneQuestion,
    genererQuestions,
    renumeroter,
    createWithSnapshot,
    createAndGenerate,
    regenerer,
    ouvrir,
    soumettre,
    mesScores,
    listScores,
    getByCode,
    setActif,
    archive,
    desarchiver,
  };
})(window);
