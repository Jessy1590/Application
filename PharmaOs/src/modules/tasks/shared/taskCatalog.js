/**
 * Catalogue des catégories de tâches pour la matrice d’assignation (task_role_rules).
 * `id` = clé stable stockée dans details.type / colonne category.
 * Groupés par gros modules (onglets Administration → Assignation).
 */

export const TASK_MODULES = Object.freeze([
  { id: 'taches', label: 'Tâches' },
  { id: 'communication', label: 'Communication' },
  { id: 'qualite', label: 'Qualité' },
  { id: 'stock', label: 'Stock' },
  { id: 'perimes', label: 'Périmés' },
  { id: 'stupefiants', label: 'Stupéfiants' },
  { id: 'preparations', label: 'Préparations' },
  { id: 'location', label: 'Location' },
  { id: 'rh', label: 'RH' },
  { id: 'caisse', label: 'Caisse' },
  { id: 'divers', label: 'Divers' },
]);

/**
 * @typedef {{ id: string, module: string, label: string, description: string }} TaskRuleCategory
 */

/** @type {readonly TaskRuleCategory[]} */
export const TASK_RULE_CATEGORIES = Object.freeze([
  // —— Tâches / agenda comptoir ——
  {
    id: 'commande',
    module: 'taches',
    label: 'Commande médicament',
    description: 'Créée depuis la taskbar (Commander) ou l’agenda. À traiter à la date prévue pour le patient.',
  },
  {
    id: 'facturation',
    module: 'taches',
    label: 'Facturation',
    description: 'Créée depuis la taskbar (Facturation) ou l’agenda. Rappelle une facturation patient à effectuer.',
  },
  {
    id: 'libre',
    module: 'taches',
    label: 'Tâche libre',
    description: 'Tâche manuelle créée depuis le dashboard Tâches (texte libre, assignation choisie à la création).',
  },

  // —— Communication ——
  {
    id: 'appel_attente_pharmacien',
    module: 'communication',
    label: 'Appel — attente pharmacien',
    description: 'Créée quand un appel est marqué « attente pharmacien ». Le destinataire doit reprendre le dossier.',
  },
  {
    id: 'appel_brouillon',
    module: 'communication',
    label: 'Appel à finaliser',
    description: 'Brouillon d’appel sauvegardé au comptoir. Destinée en priorité au créateur pour compléter la fiche.',
  },
  {
    id: 'ip_brouillon',
    module: 'communication',
    label: 'IP à finaliser',
    description: 'Intervention pharmaceutique enregistrée « En attente ». Le créateur doit finaliser ou clôturer l’IP.',
  },

  // —— Qualité ——
  {
    id: 'nc_brouillon',
    module: 'qualite',
    label: 'NC à finaliser',
    description: 'Non-conformité qualité en brouillon. À compléter puis valider dans Qualité.',
  },
  {
    id: 'litige_brouillon',
    module: 'qualite',
    label: 'Litige à finaliser',
    description: 'Litige fournisseur sauvegardé en attente. Le créateur doit finaliser la déclaration.',
  },

  // —— Stock ——
  {
    id: 'stock_error',
    module: 'stock',
    label: 'Erreur de stock',
    description: 'Déclarée au comptoir (écart inventaire). Les rôles « immédiat » décident de la suite (recomptage, correction…).',
  },
  {
    id: 'stock_recompte',
    module: 'stock',
    label: 'Recomptage stock',
    description: 'Demande de recomptage suite à une erreur. L’équipe physique recompte le produit.',
  },
  {
    id: 'stock_recompte_result',
    module: 'stock',
    label: 'Résultat recomptage',
    description: 'Résultat du recomptage à valider / corriger côté stock officiel.',
  },
  {
    id: 'retrait_lot',
    module: 'stock',
    label: 'Retrait de lot',
    description: 'Alerte retrait de lot (ANSM / labo). Isoler le stock et suivre les étapes de l’alerte.',
  },

  // —— Stupéfiants ——
  {
    id: 'stupefiant_verification',
    module: 'stupefiants',
    label: 'Stupéfiant — vérification',
    description: 'Écart après comptage réceptionnaire (armoire ≠ LGO). Ouvre le dashboard Stupéfiants → Vérifier.',
  },
  {
    id: 'stupefiant_recompte',
    module: 'stupefiants',
    label: 'Stupéfiant — recomptage',
    description: 'Legacy / escalade recomptage. Le flux actuel passe par stupefiant_verification.',
  },

  // —— Périmés ——
  {
    id: 'perime_decision',
    module: 'perimes',
    label: 'Périmé à décider',
    description: 'Produit déclaré périmé sans décision. Pharmacien / admin choisit la valorisation (MEA, litige…).',
  },
  {
    id: 'perime_mea',
    module: 'perimes',
    label: 'Mise en avant périmé',
    description: 'Exécution MEA à J−3 mois : placer le produit en mise en avant selon les paramètres.',
  },
  {
    id: 'perime_promo',
    module: 'perimes',
    label: 'Promo périmé',
    description: 'Exécution promo à J−3 mois : appliquer la promotion prévue sur le périmé.',
  },
  {
    id: 'perime_challenge',
    module: 'perimes',
    label: 'Challenge périmé',
    description: 'Challenge commercial lié à un périmé valorisé : suivre l’objectif jusqu’à la date limite.',
  },

  // —— Préparations (magistrales) ——
  {
    id: 'magistral_devis',
    module: 'preparations',
    label: 'Magistrale — devis patient',
    description: 'Dossier en statut devis : présenter / faire accepter le devis ST au patient.',
  },
  {
    id: 'magistral_a_controler',
    module: 'preparations',
    label: 'Magistrale — à contrôler',
    description: 'Arrivage ST : contrôle réception BPP (checklist, lot, libération) avant rappel patient.',
  },
  {
    id: 'magistral_a_rappeler',
    module: 'preparations',
    label: 'Magistrale — à rappeler',
    description: 'Patient à rappeler pour indiquer que la préparation est disponible (ou report).',
  },
  {
    id: 'magistral_a_dispenser',
    module: 'preparations',
    label: 'Magistrale — à dispenser',
    description: 'Préparation prête (réceptionnée) : dispensation + n° ordonnancier donneur d’ordre.',
  },
  {
    id: 'magistral_non_conforme',
    module: 'preparations',
    label: 'Magistrale — non conforme',
    description: 'Contrôle réception en échec : traiter la non-conformité (relance ST / clôture).',
  },

  // —— Location ——
  {
    id: 'location_a_rappeler',
    module: 'location',
    label: 'Location — à rappeler',
    description: 'Contact Location ouvert à rappeler (fin de location, prolongation, etc.).',
  },
  {
    id: 'location_attente_suite',
    module: 'location',
    label: 'Location — attente prolongation / retour',
    description: 'Appel abouti : dossier en attente de suite métier (prolongation, retour appareil ou perte).',
  },

  // —— RH ——
  {
    id: 'hr_absence_demande',
    module: 'rh',
    label: 'RH — demande d’absence',
    description: 'Demande d’absence équipe : à valider ou refuser dans RH (génère ensuite une réponse au salarié).',
  },
  {
    id: 'hr_absence_reponse',
    module: 'rh',
    label: 'RH — réponse absence',
    description: 'Notification au salarié de la décision sur sa demande d’absence (destinataire = demandeur).',
  },
  {
    id: 'hr_horaire_demande',
    module: 'rh',
    label: 'RH — demande horaire',
    description: 'Demande de changement d’horaire équipe : à valider ou refuser dans RH.',
  },
  {
    id: 'hr_horaire_reponse',
    module: 'rh',
    label: 'RH — réponse horaire',
    description: 'Notification au salarié de la décision sur son changement d’horaire.',
  },

  // —— Caisse ——
  {
    id: 'cash_ecart',
    module: 'caisse',
    label: 'Caisse — écart de clôture',
    description: 'Créée quand une clôture de caisse présente un écart fond réel / logiciel ≠ 0. À contrôler.',
  },

  // —— Divers / legacy ——
  {
    id: 'etalonnage_rdv',
    module: 'divers',
    label: 'Étalonnage (legacy)',
    description: 'Ancien module contrôles / étalonnage. Affichage conservé ; plus de nouvelles créations.',
  },
]);

export function taskCategoriesForModule(moduleId) {
  return TASK_RULE_CATEGORIES.filter((c) => c.module === moduleId);
}

export function getTaskRuleCategory(id) {
  return TASK_RULE_CATEGORIES.find((c) => c.id === id) || null;
}
