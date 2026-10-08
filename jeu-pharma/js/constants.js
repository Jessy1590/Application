/**
 * Référentiels UI Jeu Pharma (niveaux + codes de champs quiz).
 * `actif: false` = legacy (gardé en base, masqué UI / CSV / quiz / trous).
 */
(function (global) {
  const NIVEAUX = [
    { code: 'apprenti', libelle: 'Apprenti' },
    { code: 'pharmacien', libelle: 'Pharmacien' },
    { code: 'preparatrice', libelle: 'Préparatrice' },
    { code: 'etu_3a', libelle: 'Étudiant pharma 3A' },
    { code: 'etu_4a', libelle: 'Étudiant pharma 4A' },
    { code: 'etu_6a', libelle: 'Étudiant pharma 6A' },
  ];

  /** Niveaux pédagogiques proposés dans l’UI. */
  function niveauxStandards() {
    return NIVEAUX.map((n) => n.code);
  }

  /** Codes champ pour configuration quiz / affichage fiches */
  const CHAMP_CODES = [
    { code: 'nom_commercial', libelle: 'Noms commerciaux', table: 'noms_commerciaux', card: 'N', liaison: 'matrice_noms_commerciaux', liaisonFk: 'nom_commercial_id', actif: true },
    { code: 'dci', libelle: 'DCI', table: 'dcis', card: 1, fk: 'dci_id', actif: true },
    { code: 'secteur_therapeutique', libelle: 'Secteur thérapeutique', table: 'secteurs_therapeutiques', card: 'N', liaison: 'matrice_secteurs_therapeutiques', liaisonFk: 'secteur_therapeutique_id', fk: 'secteur_therapeutique_id', actif: true },
    { code: 'classe_therapeutique', libelle: 'Classe thérapeutique', table: 'classes_therapeutiques', card: 'N', liaison: 'matrice_classes_therapeutiques', liaisonFk: 'classe_therapeutique_id', fk: 'classe_therapeutique_id', actif: true },
    { code: 'classe_pharmacologique', libelle: 'Classe pharmacologique', table: 'classes_pharmacologiques', card: 'N', liaison: 'matrice_classes_pharmacologiques', liaisonFk: 'classe_pharmacologique_id', fk: 'classe_pharmacologique_id', actif: true },
    { code: 'detail_pharmacologie', libelle: 'Détail pharmacologie', table: 'details_pharmacologie', card: 1, fk: 'detail_pharmacologie_id', actif: true },
    { code: 'posologie_generale', libelle: 'Posologie générale', table: 'posologies_generales', card: 1, fk: 'posologie_generale_id', actif: false },
    { code: 'grossesse_allaitement', libelle: 'Grossesse & allaitement', table: 'grossesse_allaitement', card: 1, fk: 'grossesse_allaitement_id', actif: false },
    { code: 'indications', libelle: 'Indications', table: 'indications', card: 'N', liaison: 'matrice_indications', liaisonFk: 'indication_id', actif: true },
    { code: 'contre_indications', libelle: 'Contre-indications', table: 'contre_indications', card: 'N', liaison: 'matrice_contre_indications', liaisonFk: 'contre_indication_id', actif: true },
    { code: 'effets_indesirables', libelle: 'Effets indésirables', table: 'effets_indesirables', card: 'N', liaison: 'matrice_effets_indesirables', liaisonFk: 'effet_indesirable_id', actif: true },
    { code: 'precautions_emploi', libelle: 'Précautions d’emploi', table: 'precautions_emploi', card: 'N', liaison: 'matrice_precautions_emploi', liaisonFk: 'precaution_emploi_id', actif: true },
    { code: 'interactions', libelle: 'Interactions', table: 'interactions', card: 'N', liaison: 'matrice_interactions', liaisonFk: 'interaction_id', actif: true },
    { code: 'surveillances', libelle: 'Surveillances', table: 'surveillances', card: 'N', liaison: 'matrice_surveillances', liaisonFk: 'surveillance_id', actif: true },
    { code: 'voies_administration', libelle: 'Voies d’administration', table: 'voies_administration', card: 'N', liaison: 'matrice_voies_administration', liaisonFk: 'voie_administration_id', actif: false },
  ];

  function champsActifs() {
    return CHAMP_CODES.filter((c) => c.actif !== false);
  }

  function isChampActif(code) {
    const c = CHAMP_CODES.find((x) => x.code === code);
    return !!(c && c.actif !== false);
  }

  const ENTITY_TABLES = CHAMP_CODES.map((c) => ({
    table: c.table,
    libelle: c.libelle,
    code: c.code,
    card: c.card,
    actif: c.actif !== false,
  }));

  const STATUTS_FICHE = [
    { code: 'brouillon', libelle: 'Brouillon' },
    { code: 'publie', libelle: 'Publié' },
    { code: 'archive', libelle: 'Archivé' },
  ];

  const QUIZ_MODES = [
    { code: 'entrainement', libelle: 'Entraînement' },
    { code: 'evaluation', libelle: 'Évaluation' },
  ];

  global.JpConstants = {
    NIVEAUX,
    niveauxStandards,
    CHAMP_CODES,
    champsActifs,
    isChampActif,
    ENTITY_TABLES,
    STATUTS_FICHE,
    QUIZ_MODES,
  };
})(window);
