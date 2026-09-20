/**
 * Compat LocationAccess (modules DOM Phie).
 * Les sous-permissions `acces_roles` sont désactivées : seul le gate PharmaOS
 * (canAccess / role_access OU casquette location) contrôle l’accès Location.
 *
 * IMPORTANT — sous-rôle métier Phie `gestionnaire` :
 * ce n’est PAS le rôle portail (supprimé → préparateur). C’est un libellé
 * interne Location (personnel | gestionnaire | administrateur) pour l’UI Phie.
 * Mapping : administrateur portail → administrateur Phie ;
 * casquette `location` (ou équipeRole legacy) → gestionnaire Phie ;
 * sinon → personnel.
 */
import { isFeatureAllowed, hasCasquetteGrant } from '../../../core/access.js';
import { isAppAdministrateur } from '../../../core/roles.js';

export const PARAM_KEY = 'acces_roles';

/** Sous-rôles métier Location Phie (≠ rôles portail.profiles). */
export const ROLES = Object.freeze(['personnel', 'gestionnaire', 'administrateur']);

export const FEATURES = Object.freeze([]);

export const DEFAULTS = Object.freeze({});

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

export function cloneDefaults() {
  return {};
}

export function normalize() {
  return {};
}

export function isLocked() {
  return false;
}

export function isEditableFeature() {
  return false;
}

/** Toujours autorisé une fois le shell Location ouvert (plus de sous-perms). */
export function can() {
  return true;
}

/**
 * Mappe le rôle portail PharmaOS → libellé interne Location (admin / UI).
 * @param {string} portailRole
 * @param {{ hasLocationCasquette?: boolean, equipeRole?: string }} [opts]
 */
export function resolveRoleFromPortail(portailRole, opts = {}) {
  if (isAppAdministrateur(portailRole)) return 'administrateur';
  /* Casquette location → sous-rôle Phie « gestionnaire » (métier, pas portail). */
  if (opts.hasLocationCasquette) return 'gestionnaire';
  if (opts.equipeRole === 'gestionnaire') return 'gestionnaire';
  return 'personnel';
}

export function resolveRole(snap) {
  if (!snap) return 'personnel';
  if (snap.role) {
    return resolveRoleFromPortail(snap.role, {
      hasLocationCasquette: !!snap.hasLocationCasquette,
      equipeRole: snap.equipeRole,
    });
  }
  if (snap.isAdmin || snap.portailAdmin || snap.equipeRole === 'administrateur') {
    return 'administrateur';
  }
  if (snap.equipeRole === 'gestionnaire' || snap.hasLocationCasquette) return 'gestionnaire';
  return 'personnel';
}

export async function loadMatrix() {
  return {};
}

export function invalidate() {}

export function featureForModule(moduleName) {
  return MODULE_FEATURE[moduleName] || null;
}

export function featureForView(view) {
  return MODULE_FEATURE[view] || (view === 'parametres' ? 'parametres_location' : null);
}

/** Gate shell : matrice PharmaOS OU grant casquette location. */
export function canAccessLocation(role, _feature = null, overrides = [], casquetteGrants = []) {
  return (
    isFeatureAllowed(role, 'dashboard', 'location', overrides)
    || isFeatureAllowed(role, 'taskbar', 'location', overrides)
    || hasCasquetteGrant(casquetteGrants, 'dashboard', 'location')
    || hasCasquetteGrant(casquetteGrants, 'taskbar', 'location')
  );
}

export function canAccessLocationView(role, _view, overrides = [], casquetteGrants = []) {
  return canAccessLocation(role, null, overrides, casquetteGrants);
}

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
