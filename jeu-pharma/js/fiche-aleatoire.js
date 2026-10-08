/**
 * Fiche aléatoire — tirage joueur, révélation sans score, note manuelle /10.
 * Une fiche n’est plus proposée après 3 notes > 8/10 pour l’utilisateur connecté.
 */
(function (global) {
  const SCORE_MAX = 10;
  const SEUIL_ACQUIS = 8;
  const NB_SCORES_ACQUIS = 3;
  const PAGE = 1000;
  let niveauCourant = null;

  function sb() {
    return global.JpApp.sbJeu();
  }

  function champsActifs() {
    const champs = typeof global.JpConstants?.champsActifs === 'function'
      ? global.JpConstants.champsActifs()
      : (global.JpConstants?.CHAMP_CODES || []).filter((c) => c.actif !== false);
    return global.JpNiveaux?.champsPourNiveau
      ? global.JpNiveaux.champsPourNiveau(niveauCourant, champs)
      : champs;
  }

  /** Noms commerciaux + DCI : toujours visibles. */
  function estIdentite(code) {
    return code === 'nom_commercial' || code === 'dci';
  }

  function texteChamp(row, champ) {
    if (!row || !champ) return '';
    if (champ.code === 'nom_commercial') {
      return global.JpMedicaments?.formatNoms?.(row) || '';
    }
    if (champ.card === 'N' || Array.isArray(row[champ.code]) || (row[champ.code] && typeof row[champ.code] === 'object')) {
      const labs = global.JpMedicaments?.labelsOf?.(row[champ.code]) || [];
      return labs.join(', ');
    }
    const v = row[champ.code];
    return v != null && typeof v !== 'object' ? String(v) : '';
  }

  /**
   * @param {{ matrice_id: string, score_obtenu: number, score_max: number }[]} scores
   * @returns {Set<string>}
   */
  function idsAcquises(scores) {
    const counts = new Map();
    (scores || []).forEach((s) => {
      const obtenu = Number(s.score_obtenu);
      const max = Number(s.score_max);
      if (max === SCORE_MAX && obtenu > SEUIL_ACQUIS && s.matrice_id) {
        counts.set(s.matrice_id, (counts.get(s.matrice_id) || 0) + 1);
      }
    });
    const ids = new Set();
    counts.forEach((n, id) => {
      if (n >= NB_SCORES_ACQUIS) ids.add(id);
    });
    return ids;
  }

  async function listerPubliees() {
    const all = [];
    let from = 0;
    for (;;) {
      const { data, error } = await sb()
        .from('v_medicaments_complet')
        .select('*')
        .eq('statut', 'publie')
        .order('id', { ascending: true })
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
   * Fiches publiées visibles pour le niveau du profil (filtre joueur, pas le bypass admin).
   */
  async function listerEligibles() {
    const rows = await listerPubliees();
    let niveau = null;
    try {
      niveau = await global.JpProfil?.getNiveauCode?.();
    } catch (_) {
      niveau = null;
    }
    niveauCourant = niveau;
    if (global.JpNiveaux?.load) await global.JpNiveaux.load();
    if (global.JpNiveaux?.filtrerMedicaments) {
      return global.JpNiveaux.filtrerMedicaments(rows, niveau);
    }
    const visible = global.JpMedicaments?.visiblePourNiveau;
    if (typeof visible !== 'function') return rows;
    return rows.filter((r) => visible(r, niveau || null));
  }

  const SCORE_SELECT =
    'id, matrice_id, score_obtenu, score_max, created_at, '
    + 'matrice_medicaments('
    + 'id, secteur_therapeutique_id, '
    + 'secteurs_therapeutiques(valeur), '
    + 'dcis(valeur), '
    + 'matrice_noms_commerciaux(noms_commerciaux(valeur))'
    + ')';

  const SCORE_SELECT_LIGHT = 'id, matrice_id, score_obtenu, score_max, created_at';

  /**
   * Libellé médicament pour suivi (DCI · noms).
   * @param {object} scoreRow
   */
  function libelleFiche(scoreRow) {
    const m = scoreRow?.matrice_medicaments;
    if (!m) return '—';
    const dci = m.dcis?.valeur ? String(m.dcis.valeur) : '';
    const noms = (m.matrice_noms_commerciaux || [])
      .map((x) => x?.noms_commerciaux?.valeur)
      .filter(Boolean)
      .map(String);
    const nomsStr = noms.join(', ');
    if (dci && nomsStr) return dci + ' · ' + nomsStr;
    return dci || nomsStr || '—';
  }

  function secteurLabel(scoreRow) {
    const m = scoreRow?.matrice_medicaments;
    return m?.secteurs_therapeutiques?.valeur || 'Sans secteur';
  }

  async function mesScores() {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non connecté');
    const all = [];
    let from = 0;
    let useLight = false;
    for (;;) {
      const select = useLight ? SCORE_SELECT_LIGHT : SCORE_SELECT;
      const { data, error } = await sb()
        .from('scores_fiche_aleatoire')
        .select(select)
        .eq('utilisateur_id', user.id)
        .order('created_at', { ascending: false })
        .range(from, from + PAGE - 1);
      if (error) {
        if (!useLight && from === 0) {
          useLight = true;
          continue;
        }
        throw error;
      }
      const rows = data || [];
      all.push(...rows);
      if (rows.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }

  function filtrerAcquises(rows, scores) {
    const exclus = idsAcquises(scores);
    return (rows || []).filter((r) => r && !exclus.has(r.id));
  }

  /**
   * @param {object[]} pool
   * @param {string|null} [excludeId]
   */
  function tirer(pool, excludeId) {
    let list = pool || [];
    if (excludeId && list.length > 1) {
      list = list.filter((r) => r.id !== excludeId);
    }
    if (!list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  /**
   * Enregistre une note entière 0–10. L’appelant ne doit appeler qu’après validation.
   * @param {string} matriceId
   * @param {number} note
   */
  async function enregistrer(matriceId, note) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non connecté');
    if (!matriceId) throw new Error('Fiche manquante');
    const n = Number(note);
    if (!Number.isInteger(n) || n < 0 || n > SCORE_MAX) {
      throw new Error('Note invalide');
    }
    const { data, error } = await sb()
      .from('scores_fiche_aleatoire')
      .insert({
        utilisateur_id: user.id,
        matrice_id: matriceId,
        score_obtenu: n,
        score_max: SCORE_MAX,
      })
      .select('id, matrice_id, score_obtenu, score_max, created_at')
      .single();
    if (error) throw error;
    void global.JpLogs?.action?.('fiche_aleatoire_score', {
      matrice_id: matriceId,
      score_obtenu: data.score_obtenu,
      score_max: data.score_max,
    });
    return data;
  }

  global.JpFicheAleatoire = {
    SCORE_MAX,
    SEUIL_ACQUIS,
    NB_SCORES_ACQUIS,
    champsActifs,
    estIdentite,
    texteChamp,
    idsAcquises,
    libelleFiche,
    secteurLabel,
    listerEligibles,
    mesScores,
    filtrerAcquises,
    tirer,
    enregistrer,
  };
})(window);
