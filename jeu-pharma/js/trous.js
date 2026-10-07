/**
 * Tableau à trous Jeu Pharma — création admin + jeu + scores.
 */
(function (global) {
  const PREFIX = 'TT';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  /** Colonnes usuelles pour une grille (cardinalité 1). */
  const COLONNES_DEFAUT = [
    'nom_commercial',
    'dci',
    'classe_therapeutique',
    'classe_pharmacologique',
  ];

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

  function champMeta(code) {
    return (global.JpConstants?.CHAMP_CODES || []).find((x) => x.code === code) || null;
  }

  /** Affichage cellule : multi → jointure « ; ». */
  function cellDisplay(cell) {
    if (!cell) return '';
    if (Array.isArray(cell.valeurs) && cell.valeurs.length) {
      return cell.valeurs.join('; ');
    }
    return cell.valeur || '';
  }

  /** Liste des valeurs acceptées pour scoring (multi ou mono). */
  function cellAcceptedValues(cell) {
    if (!cell) return [];
    if (Array.isArray(cell.valeurs) && cell.valeurs.length) {
      return cell.valeurs.filter(Boolean);
    }
    const v = cell.valeur;
    if (v == null || v === '') return [];
    if (String(v).includes(';')) {
      return String(v).split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
    }
    return [v];
  }

  function cellValeurFromMed(med, champ) {
    const meta = champMeta(champ);
    if (!meta) return { valeur: null, entite_id: null, valeurs: null };
    if (meta.card === 'N') {
      const arr = med[champ];
      if (!Array.isArray(arr) || !arr.length) {
        return { valeur: null, entite_id: null, valeurs: null };
      }
      const valeurs = arr.map((x) => x.valeur).filter(Boolean);
      return {
        valeur: valeurs.length ? valeurs.join('; ') : null,
        entite_id: arr[0]?.id || null,
        valeurs: valeurs.length ? valeurs : null,
      };
    }
    const idKey = `${champ}_id`;
    // mapping ids view columns
    const idMap = {
      nom_commercial: 'nom_commercial_id',
      dci: 'dci_id',
      secteur_therapeutique: 'secteur_therapeutique_id',
      classe_therapeutique: 'classe_therapeutique_id',
      classe_pharmacologique: 'classe_pharmacologique_id',
      detail_pharmacologie: 'detail_pharmacologie_id',
      posologie_generale: 'posologie_generale_id',
      grossesse_allaitement: 'grossesse_allaitement_id',
    };
    return {
      valeur: med[champ] || null,
      entite_id: med[idMap[champ] || idKey] || null,
      valeurs: null,
    };
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function normalizeAnswer(s) {
    return String(s || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
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

  async function listParties(opts = {}) {
    let q = sb()
      .from('parties_tableau_trous')
      .select('id, code_unique, titre, niveau_cible, mode, secteur_therapeutique_id, created_at, actif')
      .order('created_at', { ascending: false });
    if (opts.actifsOnly !== false) q = q.eq('actif', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  /**
   * Charge fiches publiées pour construire la grille.
   * @param {{ secteurId?: string|null, matriceIds?: string[], niveau?: string }} opts
   */
  async function fetchMedicaments(opts = {}) {
    let q = sb()
      .from('v_medicaments_complet')
      .select('*')
      .eq('statut', 'publie');
    if (opts.matriceIds?.length) {
      q = q.in('id', opts.matriceIds);
    } else if (opts.secteurId) {
      q = q.eq('secteur_therapeutique_id', opts.secteurId);
    }
    const { data, error } = await q.order('nom_commercial');
    if (error) throw error;
    return data || [];
  }

  /**
   * Construit snapshot_grille.
   * @param {{
   *   meds: object[],
   *   colonnes: string[],
   *   modeTrous: 'ALEATOIRE'|'MANUEL',
   *   trousManuels?: Record<string, boolean>, // key `${matriceId}|${champ}`
   *   densite?: number, // 0–1 pour ALEATOIRE (défaut 0.4)
   * }} opts
   */
  function buildSnapshot(opts) {
    const colonnes = (opts.colonnes || []).filter(Boolean);
    if (!colonnes.length) throw new Error('Sélectionnez au moins une colonne');
    const meds = opts.meds || [];
    if (!meds.length) throw new Error('Aucun médicament sélectionné');

    const modeTrous = opts.modeTrous === 'MANUEL' ? 'MANUEL' : 'ALEATOIRE';
    const densite = opts.densite != null ? opts.densite : 0.4;
    const manuels = opts.trousManuels || {};

    const lignes = meds.map((med) => {
      const cells = colonnes.map((champ) => {
        const cv = cellValeurFromMed(med, champ);
        const key = `${med.id}|${champ}`;
        let trou = false;
        if (cv.valeur) {
          if (modeTrous === 'MANUEL') {
            trou = !!manuels[key];
          } else {
            trou = Math.random() < densite;
          }
        }
        return {
          champ_code: champ,
          valeur: cv.valeur,
          entite_id: cv.entite_id,
          valeurs: cv.valeurs || null,
          trou,
        };
      });
      // Garantir au moins un trou si ALEATOIRE et des valeurs
      if (modeTrous === 'ALEATOIRE') {
        const fillables = cells.filter((c) => c.valeur);
        if (fillables.length && !cells.some((c) => c.trou)) {
          const pick = fillables[Math.floor(Math.random() * fillables.length)];
          pick.trou = true;
        }
      }
      return {
        matrice_id: med.id,
        label: med.nom_commercial || med.dci || med.id,
        cells,
      };
    });

    return {
      colonnes,
      mode_trous: modeTrous,
      lignes,
    };
  }

  /**
   * Vue joueur : masque les valeurs des trous (corrigé côté serveur/client au submit).
   */
  function grillePourJoueur(snapshot, mode) {
    if (!snapshot) return null;
    const hideCorrect = mode === 'evaluation';
    return {
      colonnes: snapshot.colonnes,
      mode_trous: snapshot.mode_trous,
      lignes: (snapshot.lignes || []).map((ligne) => ({
        matrice_id: ligne.matrice_id,
        label: ligne.label,
        cells: (ligne.cells || []).map((c) => {
          if (!c.trou) {
            return {
              champ_code: c.champ_code,
              trou: false,
              valeur: c.valeur,
            };
          }
          return {
            champ_code: c.champ_code,
            trou: true,
            valeur: hideCorrect ? null : null,
            // jamais exposer la bonne réponse au joueur avant soumission
          };
        }),
      })),
    };
  }

  /**
   * @param {{
   *   titre: string,
   *   niveau_cible: string,
   *   mode?: 'entrainement'|'evaluation',
   *   secteur_therapeutique_id?: string|null,
   *   configuration_json: object,
   *   snapshot_grille: object,
   * }} input
   */
  async function createPartie(input) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non authentifié');
    if (!input.titre?.trim()) throw new Error('Titre obligatoire');
    if (!input.niveau_cible) throw new Error('Niveau obligatoire');
    if (!input.snapshot_grille) throw new Error('Grille manquante');

    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code_unique = genCode();
      const row = {
        code_unique,
        titre: String(input.titre).trim(),
        secteur_therapeutique_id: input.secteur_therapeutique_id || null,
        niveau_cible: input.niveau_cible,
        mode: input.mode === 'evaluation' ? 'evaluation' : 'entrainement',
        configuration_json: input.configuration_json || {},
        snapshot_grille: input.snapshot_grille,
        created_by: user.id,
        actif: true,
      };
      const { data, error } = await sb()
        .from('parties_tableau_trous')
        .insert(row)
        .select('id, code_unique, titre, mode, niveau_cible')
        .single();
      if (error) {
        lastErr = error;
        if (/code_unique|duplicate|unique/i.test(error.message || '')) continue;
        throw error;
      }
      void global.JpLogs?.action?.('trous_create', { code: data.code_unique });
      return data;
    }
    throw lastErr || new Error('Impossible de générer un code unique');
  }

  async function getByCode(code) {
    const c = String(code || '').trim().toUpperCase();
    const { data, error } = await sb()
      .from('parties_tableau_trous')
      .select('*')
      .eq('code_unique', c)
      .eq('actif', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function getById(id) {
    const { data, error } = await sb()
      .from('parties_tableau_trous')
      .select('*')
      .eq('id', id)
      .eq('actif', true)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Ouvre une partie pour le joueur (sans corrigé dans les trous).
   */
  async function ouvrir(codeOrId) {
    let partie = null;
    if (/^TT-/i.test(String(codeOrId || ''))) {
      partie = await getByCode(codeOrId);
    } else {
      partie = await getById(codeOrId);
    }
    if (!partie) throw new Error('Partie introuvable ou inactive');
    if (!partie.snapshot_grille) throw new Error('Grille manquante');

    void global.JpLogs?.action?.('trous_ouvrir', { code: partie.code_unique });

    return {
      id: partie.id,
      code_unique: partie.code_unique,
      titre: partie.titre,
      mode: partie.mode,
      niveau_cible: partie.niveau_cible,
      grille: grillePourJoueur(partie.snapshot_grille, partie.mode),
    };
  }

  /**
   * Compare réponses aux valeurs du snapshot (rechargé depuis la DB), insert score.
   * @param {string} partieId
   * @param {{ matrice_id: string, champ_code: string, reponse: string }[]} reponses
   */
  async function soumettre(partieId, reponses) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non authentifié');

    const partie = await getById(partieId);
    if (!partie) throw new Error('Partie introuvable');
    const snap = partie.snapshot_grille;
    const mode = partie.mode || 'entrainement';
    if (!snap) throw new Error('Grille manquante');

    if (mode === 'evaluation') {
      const { data: existing } = await sb()
        .from('parties_reponses_utilisateur')
        .select('id')
        .eq('partie_id', partieId)
        .eq('utilisateur_id', user.id)
        .eq('mode', 'evaluation')
        .maybeSingle();
      if (existing) throw new Error('Tentative évaluation déjà enregistrée');
    }

    const byKey = {};
    (reponses || []).forEach((r) => {
      byKey[`${r.matrice_id}|${r.champ_code}`] = r.reponse;
    });

    let score = 0;
    let total = 0;
    const details = [];

    (snap.lignes || []).forEach((ligne) => {
      (ligne.cells || []).forEach((cell) => {
        if (!cell.trou) return;
        total += 1;
        const key = `${ligne.matrice_id}|${cell.champ_code}`;
        const given = byKey[key] || '';
        const alts = cellAcceptedValues(cell);
        const expected = cellDisplay(cell);
        const ok = alts.some((a) => normalizeAnswer(a) === normalizeAnswer(given));
        if (ok) score += 1;
        details.push({
          matrice_id: ligne.matrice_id,
          champ_code: cell.champ_code,
          reponse: given,
          bonne_valeur: expected,
          correct: ok,
        });
      });
    });

    const { data, error } = await sb()
      .from('parties_reponses_utilisateur')
      .insert({
        partie_id: partieId,
        utilisateur_id: user.id,
        mode,
        score_obtenu: score,
        score_max: total,
        details_reponses: details,
      })
      .select('id, score_obtenu, score_max, mode')
      .single();
    if (error) throw error;

    void global.JpLogs?.action?.('trous_soumettre', {
      partie_id: partieId,
      score,
      max: total,
    });

    return {
      reponse_id: data.id,
      mode: data.mode,
      score_obtenu: score,
      score_max: total,
      details: mode === 'entrainement' ? details : details,
    };
  }

  global.JpTrous = {
    COLONNES_DEFAUT,
    genCode,
    champLibelle,
    champMeta,
    cellDisplay,
    cellAcceptedValues,
    listSecteurs,
    listParties,
    fetchMedicaments,
    buildSnapshot,
    grillePourJoueur,
    createPartie,
    getByCode,
    getById,
    ouvrir,
    soumettre,
    shuffle,
    normalizeAnswer,
  };
})(window);
