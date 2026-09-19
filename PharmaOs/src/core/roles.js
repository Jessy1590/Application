/** Rôles d’accès PharmaOS (portail.profiles.role). */

export const ACCESS_ROLES = Object.freeze([
  'pharmacien',
  'administrateur',
  'gestionnaire',
  'préparateur',
]);

export const CANONICAL_ROLES = Object.freeze([
  ...ACCESS_ROLES,
  'désactivé',
]);

export const DISABLED_ROLE = 'désactivé';

export const DISABLED_ACCOUNT_MESSAGE =
  'Compte désactivé. Vous n’avez pas accès à PharmaOS avec ces identifiants.';

export const ROLE_LABELS = Object.freeze({
  pharmacien: 'Pharmacien',
  administrateur: 'Administrateur',
  gestionnaire: 'Gestionnaire',
  préparateur: 'Préparateur',
  désactivé: 'Désactivé',
  admin: 'Administrateur (legacy)',
  équipe: 'Préparateur (legacy)',
  member: 'Préparateur (legacy)',
});

/** Anciennes valeurs toujours acceptées en base. */
export const LEGACY_ROLE_MAP = Object.freeze({
  admin: 'administrateur',
  équipe: 'préparateur',
  member: 'préparateur',
});

/** Toutes les valeurs stockables (CHECK SQL). */
export const STORED_ROLES = Object.freeze([
  ...CANONICAL_ROLES,
  'admin',
  'équipe',
  'member',
]);

/** Personnel actif (listes équipe, assignations) — hors comptes désactivés. */
export const STAFF_ROLES = Object.freeze(
  STORED_ROLES.filter((r) => r !== DISABLED_ROLE),
);

/** Destinataires des tâches « admin » (pharmacien / administrateur). */
export const ADMIN_ROLES = Object.freeze(['admin', 'administrateur', 'pharmacien']);

export function canonicalRole(role) {
  if (!role) return 'préparateur';
  if (role === DISABLED_ROLE) return DISABLED_ROLE;
  if (LEGACY_ROLE_MAP[role]) return LEGACY_ROLE_MAP[role];
  if (CANONICAL_ROLES.includes(role)) return role;
  return 'préparateur';
}

export function labelRole(role) {
  const canon = canonicalRole(role);
  return ROLE_LABELS[role] || ROLE_LABELS[canon] || role;
}

export function isCanonicalRole(role) {
  return CANONICAL_ROLES.includes(role);
}

export function isDisabledRole(role) {
  return canonicalRole(role) === DISABLED_ROLE;
}

export function isStaffRole(role) {
  if (isDisabledRole(role)) return false;
  return STAFF_ROLES.includes(role) || ACCESS_ROLES.includes(canonicalRole(role));
}

/** Administrateur applicatif (logs, bugs, matrice d’accès) + legacy admin. */
export function isAppAdministrateur(role) {
  return canonicalRole(role) === 'administrateur';
}

/** Pharmacien ou administrateur (équivalent historique isAdmin métier). */
export function isPharmacistLevel(role) {
  const r = canonicalRole(role);
  return r === 'pharmacien' || r === 'administrateur';
}

/** Peut ouvrir le dashboard par défaut (avant overlay matrice). */
export function isDashboardRole(role) {
  if (isDisabledRole(role)) return false;
  const r = canonicalRole(role);
  return r === 'pharmacien' || r === 'administrateur' || r === 'gestionnaire';
}
