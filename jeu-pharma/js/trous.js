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

  function modeLibelle(mode) {
    const m = (global.JpConstants?.QUIZ_MODES || []).find((x) => x.code === mode);
    return m?.libelle || mode;
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
      const arr =
        champ === 'nom_commercial'
          ? med.noms_commerciaux
          : med[champ];
      if (!Array.isArray(arr) || !arr.length) {
        // fallback déprécié : 1er nom seul
        if (champ === 'nom_commercial' && med.nom_commercial) {
          return {
            valeur: med.nom_commercial,
            entite_id: null,
            valeurs: [med.nom_commercial],
          };
        }
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
    const idMap = {
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
    const { data, error } = await q.order('dci');
    if (error) throw error;
    return data || [];
  }

  /**
   * Limite le nombre de médicaments candidats (shuffle puis slice).
   * @param {object[]} meds
   * @param {number|null|undefined} maxLignes
   */
  function limiterMeds(meds, maxLignes) {
    const list = meds || [];
    const max = maxLignes != null ? Number(maxLignes) : NaN;
    if (!Number.isFinite(max) || max < 1 || list.length <= max) return list;
    return shuffle(list).slice(0, Math.min(Math.floor(max), 100));
  }

  /**
   * Construit snapshot_grille.
   * @param {{
   *   meds: object[],
   *   colonnes: string[],
   *   modeTrous: 'ALEATOIRE'|'MANUEL',
   *   trousManuels?: Record<string, boolean>, // key `${matriceId}|${champ}`
   *   densite?: number, // 0–1 pour ALEATOIRE (défaut 0.4)
   *   maxLignes?: number, // plafond de lignes médicaments (défaut : pas de limite)
   * }} opts
   */
  function buildSnapshot(opts) {
    const colonnes = (opts.colonnes || []).filter(Boolean);
    if (!colonnes.length) throw new Error('Sélectionnez au moins une colonne');
    const meds = limiterMeds(opts.meds || [], opts.maxLignes);
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
      const nomsLabel = global.JpMedicaments?.formatNoms?.(med) || med.nom_commercial || '';
      return {
        matrice_id: med.id,
        label: nomsLabel || med.dci || med.id,
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
   * Liste les trous + valeurs attendues (corrigé), sans score ni comparaison aux saisies.
   * @param {string} partieId
   */
  async function listerTrous(partieId) {
    const partie = await getById(partieId);
    if (!partie) throw new Error('Partie introuvable');
    const snap = partie.snapshot_grille;
    if (!snap) throw new Error('Grille manquante');

    const trous = [];
    const lignes = [];

    (snap.lignes || []).forEach((ligne) => {
      const cases = [];
      (ligne.cells || []).forEach((cell) => {
        if (!cell.trou) return;
        const item = {
          matrice_id: ligne.matrice_id,
          label: ligne.label || '',
          champ_code: cell.champ_code,
          bonne_valeur: cellDisplay(cell),
        };
        trous.push(item);
        cases.push(item);
      });
      if (cases.length) {
        lignes.push({
          matrice_id: ligne.matrice_id,
          label: ligne.label || '',
          cases,
        });
      }
    });

    return {
      mode: partie.mode || 'entrainement',
      trous,
      lignes,
      score_max: trous.length,
      snapshot: snap,
    };
  }

  /**
   * Compare réponses aux valeurs du snapshot (rechargé depuis la DB), sans écrire.
   * @param {string} partieId
   * @param {{ matrice_id: string, champ_code: string, reponse: string }[]} reponses
   */
  async function evaluer(partieId, reponses) {
    const partie = await getById(partieId);
    if (!partie) throw new Error('Partie introuvable');
    const snap = partie.snapshot_grille;
    const mode = partie.mode || 'entrainement';
    if (!snap) throw new Error('Grille manquante');

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

    return {
      mode,
      score_obtenu: score,
      score_max: total,
      details,
      snapshot: snap,
    };
  }

  async function assertPasDeDoubleEvaluation(partieId, userId, mode) {
    if (mode !== 'evaluation') return;
    const { data: existing } = await sb()
      .from('parties_reponses_utilisateur')
      .select('id')
      .eq('partie_id', partieId)
      .eq('utilisateur_id', userId)
      .eq('mode', 'evaluation')
      .maybeSingle();
    if (existing) throw new Error('Tentative évaluation déjà enregistrée');
  }

  /**
   * Évalue puis enregistre le score dans parties_reponses_utilisateur.
   * @param {string} partieId
   * @param {{ matrice_id: string, champ_code: string, reponse: string }[]} reponses
   */
  async function soumettre(partieId, reponses) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non authentifié');

    const result = await evaluer(partieId, reponses);
    const mode = result.mode || 'entrainement';
    await assertPasDeDoubleEvaluation(partieId, user.id, mode);

    const { data, error } = await sb()
      .from('parties_reponses_utilisateur')
      .insert({
        partie_id: partieId,
        utilisateur_id: user.id,
        mode,
        score_obtenu: result.score_obtenu,
        score_max: result.score_max,
        details_reponses: result.details,
      })
      .select('id, score_obtenu, score_max, mode')
      .single();
    if (error) throw error;

    void global.JpLogs?.action?.('trous_soumettre', {
      partie_id: partieId,
      score: result.score_obtenu,
      max: result.score_max,
    });

    return {
      reponse_id: data.id,
      mode: data.mode,
      score_obtenu: result.score_obtenu,
      score_max: result.score_max,
      details: result.details,
    };
  }

  /**
   * Enregistre un score saisi manuellement (popup Indiquer un score).
   * Aucune évaluation des champs écran.
   * @param {string} partieId
   * @param {{
   *   mode_saisie: 'general'|'ligne'|'case',
   *   score_obtenu: number,
   *   score_max: number,
   *   details?: object,
   * }} payload
   */
  async function soumettreManuel(partieId, payload) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non authentifié');

    const partie = await getById(partieId);
    if (!partie) throw new Error('Partie introuvable');
    const mode = partie.mode || 'entrainement';

    const modeSaisie = payload?.mode_saisie;
    if (!['general', 'ligne', 'case'].includes(modeSaisie)) {
      throw new Error('Mode de saisie invalide');
    }

    const score_obtenu = Number(payload.score_obtenu);
    const score_max = Number(payload.score_max);
    if (!Number.isFinite(score_obtenu) || !Number.isFinite(score_max)) {
      throw new Error('Score invalide');
    }
    if (score_max < 1 || score_obtenu < 0 || score_obtenu > score_max) {
      throw new Error('Score incohérent');
    }

    await assertPasDeDoubleEvaluation(partieId, user.id, mode);

    const extra =
      payload.details && typeof payload.details === 'object' && !Array.isArray(payload.details)
        ? payload.details
        : {};
    const details = {
      ...extra,
      mode_saisie: modeSaisie,
      manuel: true,
    };

    const { data, error } = await sb()
      .from('parties_reponses_utilisateur')
      .insert({
        partie_id: partieId,
        utilisateur_id: user.id,
        mode,
        score_obtenu: Math.floor(score_obtenu),
        score_max: Math.floor(score_max),
        details_reponses: details,
      })
      .select('id, score_obtenu, score_max, mode')
      .single();
    if (error) throw error;

    void global.JpLogs?.action?.('trous_soumettre_manuel', {
      partie_id: partieId,
      mode_saisie: modeSaisie,
      score: data.score_obtenu,
      max: data.score_max,
    });

    return {
      reponse_id: data.id,
      mode: data.mode,
      score_obtenu: data.score_obtenu,
      score_max: data.score_max,
      mode_saisie: modeSaisie,
      details,
    };
  }

  /** Soft-archive : actif = false (pas de hard-delete). */
  async function setActif(id, actif) {
    const { data, error } = await sb()
      .from('parties_tableau_trous')
      .update({ actif: !!actif })
      .eq('id', id)
      .select('id, code_unique, actif')
      .single();
    if (error) throw error;
    void global.JpLogs?.action?.(actif ? 'trous_desarchiver' : 'trous_archiver', {
      partie_id: id,
      code: data?.code_unique,
    });
    return data;
  }

  async function mesScores() {
    const user = await global.JpApp.getUser();
    if (!user) return [];
    const { data, error } = await sb()
      .from('parties_reponses_utilisateur')
      .select('id, partie_id, mode, score_obtenu, score_max, created_at, parties_tableau_trous(code_unique, titre, mode)')
      .eq('utilisateur_id', user.id)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  /** Admin : réponses / scores pour une partie donnée. */
  async function listScores(partieId) {
    if (!partieId) return [];
    const { data, error } = await sb()
      .from('parties_reponses_utilisateur')
      .select('id, utilisateur_id, mode, score_obtenu, score_max, created_at')
      .eq('partie_id', partieId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  function archive(id) {
    return setActif(id, false);
  }

  function desarchiver(id) {
    return setActif(id, true);
  }

  global.JpTrous = {
    COLONNES_DEFAUT,
    genCode,
    champLibelle,
    modeLibelle,
    champMeta,
    cellDisplay,
    cellAcceptedValues,
    listSecteurs,
    listParties,
    fetchMedicaments,
    limiterMeds,
    buildSnapshot,
    grillePourJoueur,
    createPartie,
    getByCode,
    getById,
    ouvrir,
    listerTrous,
    evaluer,
    soumettre,
    soumettreManuel,
    mesScores,
    listScores,
    shuffle,
    normalizeAnswer,
    setActif,
    archive,
    desarchiver,
  };
})(window);
