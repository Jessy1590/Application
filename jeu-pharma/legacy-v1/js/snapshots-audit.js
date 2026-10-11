/**
 * Contrôle admin : snapshots quiz / trous référencant des matrices archivées
 * (fusions DCI, soft-archives). Régénération quiz via RPC legacy si pertinent.
 */
(function (global) {
  function sb() {
    return global.JpApp.sbJeu();
  }

  function uniq(ids) {
    const seen = {};
    const out = [];
    (ids || []).forEach(function (id) {
      const k = String(id || '');
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push(k);
    });
    return out;
  }

  /** Extraire les matrice_id d’un snapshot_questions (quiz). */
  function matriceIdsQuiz(snapshotQuestions) {
    const ids = [];
    (Array.isArray(snapshotQuestions) ? snapshotQuestions : []).forEach(function (q) {
      if (q && q.matrice_id) ids.push(q.matrice_id);
    });
    return uniq(ids);
  }

  /** Extraire les matrice_id d’un snapshot_grille (trous). */
  function matriceIdsTrous(snapshotGrille) {
    const ids = [];
    const lignes = snapshotGrille && Array.isArray(snapshotGrille.lignes)
      ? snapshotGrille.lignes
      : [];
    lignes.forEach(function (ligne) {
      if (ligne && ligne.matrice_id) ids.push(ligne.matrice_id);
    });
    return uniq(ids);
  }

  /**
   * @returns {Promise<{
   *   quiz: { id, code_unique, titre, actif, niveau_cible, archived_matrice_ids: string[] }[],
   *   trous: { id, code_unique, titre, actif, niveau_cible, archived_matrice_ids: string[] }[],
   * }>}
   */
  async function auditer() {
    const [quizRes, trousRes, archRes] = await Promise.all([
      sb().from('quizz').select(
        'id, code_unique, titre, actif, niveau_cible, created_at, snapshot_questions'
      ).order('created_at', { ascending: false }),
      sb().from('parties_tableau_trous').select(
        'id, code_unique, titre, actif, niveau_cible, created_at, snapshot_grille'
      ).order('created_at', { ascending: false }),
      sb().from('matrice_medicaments').select('id').eq('statut', 'archive'),
    ]);
    const error = quizRes.error || trousRes.error || archRes.error;
    if (error) throw error;

    const archived = {};
    (archRes.data || []).forEach(function (r) {
      if (r && r.id) archived[String(r.id)] = true;
    });

    function hit(ids) {
      return (ids || []).filter(function (id) { return archived[String(id)]; });
    }

    const quiz = [];
    (quizRes.data || []).forEach(function (row) {
      const bad = hit(matriceIdsQuiz(row.snapshot_questions));
      if (!bad.length) return;
      quiz.push({
        id: row.id,
        code_unique: row.code_unique,
        titre: row.titre,
        actif: row.actif,
        niveau_cible: row.niveau_cible,
        created_at: row.created_at,
        archived_matrice_ids: bad,
      });
    });

    const trous = [];
    (trousRes.data || []).forEach(function (row) {
      const bad = hit(matriceIdsTrous(row.snapshot_grille));
      if (!bad.length) return;
      trous.push({
        id: row.id,
        code_unique: row.code_unique,
        titre: row.titre,
        actif: row.actif,
        niveau_cible: row.niveau_cible,
        created_at: row.created_at,
        archived_matrice_ids: bad,
      });
    });

    return { quiz: quiz, trous: trous };
  }

  /**
   * Régénère le snapshot d’un quiz via RPC `generer_et_geler_quiz`
   * (re-tirage sur le pool actuel, hors matrices archivées).
   */
  async function regenererQuiz(quizzId) {
    if (!global.JpQuizz?.regenerer) throw new Error('JpQuizz.regenerer indisponible');
    return global.JpQuizz.regenerer(quizzId);
  }

  global.JpSnapshotsAudit = {
    matriceIdsQuiz,
    matriceIdsTrous,
    auditer,
    regenererQuiz,
  };
})(window);
