/**
 * Quiz Jeu Pharma — CRUD admin + RPC joueur.
 */
(function (global) {
  const PREFIX = 'PH';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

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
   * Crée un quiz puis génère/gèle le snapshot via RPC.
   * @param {{
   *   titre: string,
   *   secteur_therapeutique_id?: string|null,
   *   niveau_cible: string,
   *   mode: 'entrainement'|'evaluation',
   *   champs_interroges: string[],
   *   nb_questions?: number,
   *   nb_propositions?: number,
   * }} input
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
    createAndGenerate,
    regenerer,
    ouvrir,
    soumettre,
    mesScores,
    getByCode,
    setActif,
    archive,
    desarchiver,
  };
})(window);
