/**
 * Matrice d’accès Location (param location_parametres.acces_roles).
 * UI uniquement — la RLS reste la source de vérité serveur.
 *
 * Hub PhieEvreux (équipe / invitations / bugs) : hors périmètre — reste PhieEquipe.isAdmin.
 */
(function (global) {
  const PARAM_KEY = 'acces_roles';

  const ROLES = Object.freeze(['personnel', 'gestionnaire', 'administrateur']);

  /** Features alignées sur le tableau Accès (comportement historique du code). */
  const FEATURES = Object.freeze([
    { key: 'module_creation', label: 'Module Création' },
    { key: 'module_suivi', label: 'Module Suivi (consultation / édition)' },
    { key: 'module_contact', label: 'Module Contact' },
    { key: 'module_facture', label: 'Module Facture' },
    { key: 'module_parc', label: 'Module Parc' },
    { key: 'module_prolongation', label: 'Module Prolongation' },
    { key: 'module_cloture', label: 'Module Clôture' },
    { key: 'impression_fiche', label: 'Impression fiche (Suivi)' },
    { key: 'cloture_dossier', label: 'Clôture de dossier (Suivi / Clôture)' },
    { key: 'suppression_dossier', label: 'Suppression de dossier (Suivi)' },
    { key: 'parametres_location', label: 'Paramètres Location (tuile + page)' },
    {
      key: 'hub_equipe_bugs',
      label: 'Hub — équipe, invitations, gestion bugs',
      /** Affiché pour info ; non appliqué ici (PhieEquipe). */
      locationEnforced: false,
    },
  ]);

  const DEFAULTS = Object.freeze({
    module_creation: { personnel: true, gestionnaire: true, administrateur: true },
    module_suivi: { personnel: true, gestionnaire: true, administrateur: true },
    module_contact: { personnel: true, gestionnaire: true, administrateur: true },
    module_facture: { personnel: true, gestionnaire: true, administrateur: true },
    module_parc: { personnel: true, gestionnaire: true, administrateur: true },
    module_prolongation: { personnel: true, gestionnaire: true, administrateur: true },
    module_cloture: { personnel: true, gestionnaire: true, administrateur: true },
    impression_fiche: { personnel: true, gestionnaire: true, administrateur: true },
    cloture_dossier: { personnel: true, gestionnaire: true, administrateur: true },
    suppression_dossier: { personnel: false, gestionnaire: true, administrateur: true },
    parametres_location: { personnel: false, gestionnaire: false, administrateur: true },
    hub_equipe_bugs: { personnel: false, gestionnaire: false, administrateur: true },
  });

  /** Feature → page module (body[data-module]). */
  const MODULE_FEATURE = Object.freeze({
    creation: 'module_creation',
    suivi: 'module_suivi',
    contact: 'module_contact',
    facture: 'module_facture',
    parc: 'module_parc',
    prolongation: 'module_prolongation',
    cloture: 'module_cloture',
  });

  let cachedMatrix = null;

  function cloneDefaults() {
    const out = {};
    for (const f of FEATURES) {
      const d = DEFAULTS[f.key];
      out[f.key] = {
        personnel: !!d.personnel,
        gestionnaire: !!d.gestionnaire,
        administrateur: !!d.administrateur,
      };
    }
    return out;
  }

  function boolOrDefault(val, def) {
    if (val === true) return true;
    if (val === false) return false;
    return !!def;
  }

  function normalize(raw) {
    const out = cloneDefaults();
    if (!raw || typeof raw !== 'object') return out;
    for (const f of FEATURES) {
      const row = raw[f.key];
      if (!row || typeof row !== 'object') continue;
      const def = DEFAULTS[f.key];
      out[f.key] = {
        personnel: boolOrDefault(row.personnel, def.personnel),
        gestionnaire: boolOrDefault(row.gestionnaire, def.gestionnaire),
        administrateur: boolOrDefault(row.administrateur, def.administrateur),
      };
    }
    // Verrou : admin ne peut pas perdre Paramètres Location
    out.parametres_location.administrateur = true;
    return out;
  }

  function isLocked(featureKey, role) {
    return featureKey === 'parametres_location' && role === 'administrateur';
  }

  function isEditableFeature(featureKey) {
    const f = FEATURES.find((x) => x.key === featureKey);
    return !!(f && f.locationEnforced !== false);
  }

  /**
   * @param {string} role personnel|gestionnaire|administrateur
   * @param {string} feature
   * @param {object} [matrix]
   */
  function can(role, feature, matrix) {
    const r = ROLES.includes(role) ? role : 'personnel';
    if (isLocked(feature, r)) return true;
    const m = matrix || cachedMatrix || cloneDefaults();
    const row = m[feature] || DEFAULTS[feature];
    if (!row) return false;
    return !!row[r];
  }

  /**
   * Rôle matrice à partir du snapshot PhieEquipe.
   * Admin Location = equipe.administrateur ∪ portail profiles.role === 'admin'.
   */
  function resolveRole(snap) {
    if (!snap) return 'personnel';
    if (snap.isAdmin || snap.portailAdmin || snap.equipeRole === 'administrateur') {
      return 'administrateur';
    }
    if (snap.equipeRole === 'gestionnaire') return 'gestionnaire';
    return 'personnel';
  }

  async function loadMatrix(force) {
    if (cachedMatrix && !force) return cachedMatrix;
    const params = await global.LocationData.loadParams();
    cachedMatrix = normalize(params[PARAM_KEY]);
    return cachedMatrix;
  }

  function invalidate() {
    cachedMatrix = null;
  }

  function featureForModule(moduleName) {
    return MODULE_FEATURE[moduleName] || null;
  }

  global.LocationAccess = {
    PARAM_KEY,
    ROLES,
    FEATURES,
    DEFAULTS,
    MODULE_FEATURE,
    cloneDefaults,
    normalize,
    isLocked,
    isEditableFeature,
    can,
    resolveRole,
    loadMatrix,
    invalidate,
    featureForModule,
  };
})(window);
