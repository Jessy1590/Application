/**
 * Matrice fine Location (location_parametres.acces_roles) — sous-permissions module.
 * Gate shell PharmaOS : src/core/access.js + role_access (canAccess / isFeatureAllowed).
 */
import { isFeatureAllowed } from '../../../core/access.js';
import { canonicalRole, isAppAdministrateur } from '../../../core/roles.js';
import { loadParams } from './locationService.js';

export const PARAM_KEY = 'acces_roles';

export const ROLES = Object.freeze(['personnel', 'gestionnaire', 'administrateur']);

export const FEATURES = Object.freeze([
  { key: 'module_creation', label: 'Module Création' },
  { key: 'module_transcription', label: 'Module Transcription' },
  { key: 'module_suivi', label: 'Module Suivi (consultation)' },
  { key: 'edition_suivi', label: 'Édition dossier (Suivi)' },
  { key: 'module_contact', label: 'Module Contact' },
  { key: 'module_facture', label: 'Module Facture' },
  { key: 'module_parc', label: 'Module Parc' },
  { key: 'module_prolongation', label: 'Module Prolongation' },
  { key: 'module_cloture', label: 'Module Clôture' },
  { key: 'impression_fiche', label: 'Impression fiche (Suivi)' },
  { key: 'suppression_dossier', label: 'Suppression de dossier (Suivi)' },
  { key: 'parametres_location', label: 'Paramètres Location (tuile + page)' },
  {
    key: 'hub_equipe_bugs',
    label: 'Hub — équipe, invitations, gestion bugs',
    locationEnforced: false,
  },
]);

export const DEFAULTS = Object.freeze({
  module_creation: { personnel: true, gestionnaire: true, administrateur: true },
  module_transcription: { personnel: false, gestionnaire: false, administrateur: true },
  module_suivi: { personnel: true, gestionnaire: true, administrateur: true },
  edition_suivi: { personnel: true, gestionnaire: true, administrateur: true },
  module_contact: { personnel: true, gestionnaire: true, administrateur: true },
  module_facture: { personnel: true, gestionnaire: true, administrateur: true },
  module_parc: { personnel: true, gestionnaire: true, administrateur: true },
  module_prolongation: { personnel: true, gestionnaire: true, administrateur: true },
  module_cloture: { personnel: true, gestionnaire: true, administrateur: true },
  impression_fiche: { personnel: true, gestionnaire: true, administrateur: true },
  suppression_dossier: { personnel: false, gestionnaire: true, administrateur: true },
  parametres_location: { personnel: false, gestionnaire: false, administrateur: true },
  hub_equipe_bugs: { personnel: false, gestionnaire: false, administrateur: true },
});

export const MODULE_FEATURE = Object.freeze({
  creation: 'module_creation',
  transcription: 'module_transcription',
  suivi: 'module_suivi',
  contact: 'module_contact',
  facture: 'module_facture',
  parc: 'module_parc',
  prolongation: 'module_prolongation',
  cloture: 'module_cloture',
});

let cachedMatrix = null;

export function cloneDefaults() {
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

export function normalize(raw) {
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
  const legacyCloture = raw.cloture_dossier;
  if (
    legacyCloture
    && typeof legacyCloture === 'object'
    && !(raw.module_cloture && typeof raw.module_cloture === 'object')
  ) {
    const def = DEFAULTS.module_cloture;
    out.module_cloture = {
      personnel: boolOrDefault(legacyCloture.personnel, def.personnel),
      gestionnaire: boolOrDefault(legacyCloture.gestionnaire, def.gestionnaire),
      administrateur: boolOrDefault(legacyCloture.administrateur, def.administrateur),
    };
  }
  out.parametres_location.administrateur = true;
  return out;
}

export function isLocked(featureKey, role) {
  return featureKey === 'parametres_location' && role === 'administrateur';
}

export function isEditableFeature(featureKey) {
  const f = FEATURES.find((x) => x.key === featureKey);
  return !!(f && f.locationEnforced !== false);
}

export function can(role, feature, matrix) {
  const r = ROLES.includes(role) ? role : 'personnel';
  if (isLocked(feature, r)) return true;
  const m = matrix || cachedMatrix || cloneDefaults();
  const row = m[feature] || DEFAULTS[feature];
  if (!row) return false;
  return !!row[r];
}

/**
 * Mappe le rôle portail PharmaOS → rôle matrice fine Location.
 * administrateur (legacy admin) → administrateur ;
 * gestionnaire → gestionnaire ; pharmacien / préparateur → personnel.
 */
export function resolveRoleFromPortail(portailRole) {
  if (isAppAdministrateur(portailRole)) return 'administrateur';
  const r = canonicalRole(portailRole);
  if (r === 'gestionnaire') return 'gestionnaire';
  return 'personnel';
}

/** Compat snapshot PhieEquipe. */
export function resolveRole(snap) {
  if (!snap) return 'personnel';
  if (snap.role) return resolveRoleFromPortail(snap.role);
  if (snap.isAdmin || snap.portailAdmin || snap.equipeRole === 'administrateur') {
    return 'administrateur';
  }
  if (snap.equipeRole === 'gestionnaire') return 'gestionnaire';
  return 'personnel';
}

export async function loadMatrix(force) {
  if (cachedMatrix && !force) return cachedMatrix;
  const params = await loadParams();
  cachedMatrix = normalize(params[PARAM_KEY]);
  return cachedMatrix;
}

export function invalidate() {
  cachedMatrix = null;
}

export function featureForModule(moduleName) {
  return MODULE_FEATURE[moduleName] || null;
}

export function featureForView(view) {
  return MODULE_FEATURE[view] || (view === 'parametres' ? 'parametres_location' : null);
}

/**
 * Gate shell : matrice PharmaOS (taskbar/dashboard × location).
 * Feature fine optionnelle : sous-matrice Location une fois le shell ouvert.
 */
export function canAccessLocation(role, feature = null, overrides = []) {
  const shellOk = isFeatureAllowed(role, 'dashboard', 'location', overrides)
    || isFeatureAllowed(role, 'taskbar', 'location', overrides);
  if (!shellOk) return false;
  if (!feature) return true;
  return can(resolveRoleFromPortail(role), feature, cachedMatrix || cloneDefaults());
}

export function canAccessLocationView(role, view, overrides = []) {
  const feature = featureForView(view);
  return canAccessLocation(role, feature, overrides);
}

/** Objet global LocationAccess (modules UI montés en DOM). */
export const LocationAccessApi = {
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
  resolveRoleFromPortail,
  loadMatrix,
  invalidate,
  featureForModule,
};

if (typeof window !== 'undefined') {
  window.LocationAccess = LocationAccessApi;
}
