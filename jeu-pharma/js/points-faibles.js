/**
 * Agrégation simple des erreurs / scores faibles (quiz, trous, fiche aléatoire).
 * Aucune IA : comptage des échecs déjà stockés.
 */
(function (global) {
  const PAGE = 1000;
  /** Note fiche aléatoire ≤ seuil acquis (8) = point faible. */
  const SEUIL_FAIBLE_FICHE = global.JpFicheAleatoire?.SEUIL_ACQUIS ?? 8;

  function sb() {
    return global.JpApp.sbJeu();
  }

  function bump(map, key, n) {
    if (!key) return;
    const k = String(key);
    map.set(k, (map.get(k) || 0) + (n || 1));
  }

  function sortedEntries(map) {
    return [...map.entries()]
      .map(([id, erreurs]) => ({ id, erreurs }))
      .sort((a, b) => b.erreurs - a.erreurs || String(a.id).localeCompare(String(b.id)));
  }

  /**
   * Extrait les échecs d’un détail quiz (tableau) ou trous (tableau / objet manuel).
   * @param {unknown} details
   * @param {{ matrices: Map<string, number>, champs: Map<string, number> }} acc
   */
  function collectFromDetails(details, acc) {
    if (!details) return;

    if (Array.isArray(details)) {
      details.forEach((d) => {
        if (!d || d.correct !== false) return;
        bump(acc.matrices, d.matrice_id);
        bump(acc.champs, d.champ_code);
      });
      return;
    }

    if (typeof details !== 'object') return;

    if (details.type === 'ligne' && Array.isArray(details.lignes)) {
      details.lignes.forEach((l) => {
        if (l && l.correct === false) bump(acc.matrices, l.matrice_id);
      });
      return;
    }

    if (details.type === 'case' && Array.isArray(details.cases)) {
      details.cases.forEach((c) => {
        if (c && c.correct === false) {
          bump(acc.matrices, c.matrice_id);
          bump(acc.champs, c.champ_code);
        }
      });
    }
    // mode general / manuel sans détail par fiche : non attribuable → ignoré
  }

  async function chargerQuizDetails(userId) {
    const all = [];
    let from = 0;
    for (;;) {
      const { data, error } = await sb()
        .from('quizz_reponses_utilisateur')
        .select('id, details_reponses, score_obtenu, score_max, created_at')
        .eq('utilisateur_id', userId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }

  async function chargerTrousDetails(userId) {
    const all = [];
    let from = 0;
    for (;;) {
      const { data, error } = await sb()
        .from('parties_reponses_utilisateur')
        .select('id, details_reponses, score_obtenu, score_max, created_at')
        .eq('utilisateur_id', userId)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }

  /**
   * @returns {Promise<{
   *   matrices: { id: string, erreurs: number }[],
   *   champs: { id: string, erreurs: number, libelle: string }[],
   *   totalErreurs: number,
   * }>}
   */
  async function agreger() {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non connecté');

    const acc = {
      matrices: new Map(),
      champs: new Map(),
    };

    const [quizRows, trousRows, ficheRows] = await Promise.all([
      chargerQuizDetails(user.id),
      chargerTrousDetails(user.id),
      global.JpFicheAleatoire?.mesScores?.() || Promise.resolve([]),
    ]);

    quizRows.forEach((r) => collectFromDetails(r.details_reponses, acc));
    trousRows.forEach((r) => collectFromDetails(r.details_reponses, acc));

    (ficheRows || []).forEach((s) => {
      const obtenu = Number(s.score_obtenu);
      const max = Number(s.score_max);
      if (!s.matrice_id || !Number.isFinite(obtenu) || !Number.isFinite(max)) return;
      if (max === (global.JpFicheAleatoire?.SCORE_MAX ?? 10) && obtenu <= SEUIL_FAIBLE_FICHE) {
        bump(acc.matrices, s.matrice_id);
      }
    });

    const champLibelle = (code) => {
      const c = (global.JpConstants?.CHAMP_CODES || []).find((x) => x.code === code);
      return c?.libelle || code || '—';
    };

    const matrices = sortedEntries(acc.matrices);
    const champs = sortedEntries(acc.champs).map((c) => ({
      ...c,
      libelle: champLibelle(c.id),
    }));
    const totalErreurs = matrices.reduce((n, m) => n + m.erreurs, 0);

    return { matrices, champs, totalErreurs };
  }

  /**
   * Fiches publiées éligibles au niveau, ordonnées par poids d’erreur décroissant.
   * @param {{ matrices: { id: string, erreurs: number }[] }} agg
   * @param {object[]} [eligibles]
   */
  async function poolRevision(agg, eligibles) {
    const rows = eligibles || (await global.JpFicheAleatoire.listerEligibles());
    const weight = new Map((agg?.matrices || []).map((m) => [String(m.id), m.erreurs]));
    return (rows || [])
      .filter((r) => r && weight.has(String(r.id)))
      .sort((a, b) => {
        const wa = weight.get(String(a.id)) || 0;
        const wb = weight.get(String(b.id)) || 0;
        return wb - wa || String(a.id).localeCompare(String(b.id));
      })
      .map((r) => ({
        ...r,
        _erreurs: weight.get(String(r.id)) || 0,
      }));
  }

  /**
   * Progression acquises par secteur (fiche aléatoire : 3 notes > 8/10).
   * @returns {Promise<{
   *   secteurs: { id: string, label: string, acquises: number, total: number }[],
   *   acquisesTotal: number,
   *   total: number,
   * }>}
   */
  async function progressionParSecteur() {
    const [eligibles, scores] = await Promise.all([
      global.JpFicheAleatoire.listerEligibles(),
      global.JpFicheAleatoire.mesScores(),
    ]);
    const acquises = global.JpFicheAleatoire.idsAcquises(scores);
    const bySecteur = new Map();

    function ensure(id, label) {
      const key = id || '_none';
      if (!bySecteur.has(key)) {
        bySecteur.set(key, {
          id: key,
          label: label || 'Sans secteur',
          acquises: 0,
          total: 0,
        });
      }
      return bySecteur.get(key);
    }

    (eligibles || []).forEach((row) => {
      const ids = global.JpMedicaments?.idsOf?.(row, 'secteur_therapeutique') || [];
      const labs = global.JpMedicaments?.labelsOf?.(row.secteur_therapeutique) || [];
      if (!ids.length) {
        const bucket = ensure('_none', 'Sans secteur');
        bucket.total += 1;
        if (acquises.has(row.id)) bucket.acquises += 1;
        return;
      }
      ids.forEach((sid, i) => {
        const bucket = ensure(String(sid), labs[i] || labs[0] || 'Secteur');
        bucket.total += 1;
        if (acquises.has(row.id)) bucket.acquises += 1;
      });
    });

    const secteurs = [...bySecteur.values()].sort((a, b) =>
      a.label.localeCompare(b.label, 'fr')
    );
    return {
      secteurs,
      acquisesTotal: acquises.size,
      total: (eligibles || []).length,
    };
  }

  global.JpPointsFaibles = {
    SEUIL_FAIBLE_FICHE,
    agreger,
    poolRevision,
    progressionParSecteur,
  };
})(window);
