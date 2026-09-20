import { ACCESS_ROLES, canonicalRole, isDisabledRole } from './roles.js';

export const TASKBAR_FEATURES = Object.freeze([
  { id: 'inbox', label: 'À traiter / mes saisies' },
  { id: 'tasks', label: 'Mes tâches' },
  { id: 'order', label: 'Commande médicament' },
  { id: 'billing', label: 'Facturation' },
  { id: 'directory', label: 'Annuaire' },
  { id: 'call', label: 'Appels' },
  { id: 'ip', label: 'Act-IP' },
  { id: 'documents', label: 'Documents' },
  { id: 'quality', label: 'Qualité' },
  { id: 'lot_alerts', label: 'Retrait de lot' },
  { id: 'perimes', label: 'Périmés' },
  { id: 'perimes_vitrine', label: 'MEA / Promo / Challenge' },
  { id: 'stock', label: 'Erreur de stock' },
  { id: 'disputes', label: 'Litiges' },
  { id: 'location', label: 'Location' },
  { id: 'magistral', label: 'Magistrales' },
  { id: 'psl', label: 'MDS' },
  { id: 'stupefiants', label: 'Stupéfiants' },
  { id: 'hr', label: 'RH' },
  { id: 'cash', label: 'Clôture de caisse' },
]);

export const DASHBOARD_FEATURES = Object.freeze([
  { id: 'dashboard', label: 'Ouvrir le dashboard / accueil' },
  { id: 'inbox', label: 'À traiter / mes saisies' },
  { id: 'calls', label: 'Appels' },
  { id: 'agenda', label: 'Agenda' },
  { id: 'tasks', label: 'Tâches' },
  { id: 'directory', label: 'Annuaire' },
  { id: 'ip', label: 'Act-IP' },
  { id: 'documents', label: 'GED' },
  { id: 'quality', label: 'Qualité' },
  { id: 'retrait_lot', label: 'Retrait lot' },
  { id: 'perimes', label: 'Périmés' },
  { id: 'stock', label: 'Stock' },
  { id: 'disputes', label: 'Litiges' },
  { id: 'location', label: 'Location' },
  { id: 'magistral', label: 'Magistrales' },
  { id: 'psl', label: 'MDS' },
  { id: 'stupefiants', label: 'Stupéfiants' },
  { id: 'conseil', label: 'Conseil' },
  { id: 'bdm', label: 'BDPM' },
  { id: 'hr', label: 'RH' },
  { id: 'cash', label: 'Caisse' },
  { id: 'logs', label: 'Logs' },
  { id: 'bugs', label: 'Bugs' },
  { id: 'access', label: 'Accès & rôles' },
  { id: 'parametres', label: 'Paramètres' },
]);

export const MODULE_VIEW_FEATURE = Object.freeze({
  inbox: 'inbox',
  directory: 'directory',
  call: 'call',
  ip: 'ip',
  tasks: 'tasks',
  order: 'order',
  billing: 'billing',
  quality: 'quality',
  documents: 'documents',
  perimes: 'perimes',
  perimes_vitrine: 'perimes_vitrine',
  stock: 'stock',
  location_creation: 'location',
  location_prolongation: 'location',
  location_cloture: 'location',
  location_contact: 'location',
  location_suivi: 'location',
  location_parc: 'location',
  location_facture: 'location',
  location_parametres: 'location',
  location_transcription: 'location',
  location: 'location',
  disputes: 'disputes',
  lot_alerts: 'lot_alerts',
  magistral_creation: 'magistral',
  magistral_devis: 'magistral',
  magistral_rappel: 'magistral',
  magistral_dispenser: 'magistral',
  magistral_renouvellement: 'magistral',
  magistral_suivi: 'magistral',
  magistral_parametres: 'magistral',
  magistral: 'magistral',
  psl: 'psl',
  psl_reception: 'psl',
  psl_delivrance: 'psl',
  stupefiants: 'stupefiants',
  cash: 'cash',
  hr: 'hr',
});

/** Modules dont les paramètres sont regroupés sous Administration → Paramètres. */
export const SETTINGS_MODULE_FEATURES = Object.freeze([
  'location', 'magistral', 'perimes', 'cash',
]);

/** Onglets dashboard Location / Préparations → feature d’accès unique. */
export function resolveAccessFeatureId(surface, featureId) {
  if (surface === 'dashboard') {
    if (featureId === 'location' || String(featureId || '').startsWith('location_')) return 'location';
    if (featureId === 'magistral' || String(featureId || '').startsWith('magistral_')) return 'magistral';
  }
  return featureId;
}

function emptyRoleMap() {
  const map = {};
  for (const role of ACCESS_ROLES) {
    map[role] = { taskbar: {}, dashboard: {} };
  }
  return map;
}

function buildDefaultAccess() {
  const map = emptyRoleMap();

  for (const role of ACCESS_ROLES) {
    for (const f of TASKBAR_FEATURES) {
      map[role].taskbar[f.id] = true;
    }
    for (const f of DASHBOARD_FEATURES) {
      map[role].dashboard[f.id] = role !== 'préparateur';
    }
  }

  /* Location / magistrales : rôle seul ne suffit pas — casquettes ou override matrice. */
  map.pharmacien.taskbar.location = false;
  map.préparateur.taskbar.location = false;
  map.pharmacien.dashboard.location = false;
  map.préparateur.dashboard.location = false;
  map.administrateur.taskbar.location = true;
  map.administrateur.dashboard.location = true;

  map.pharmacien.taskbar.magistral = false;
  map.préparateur.taskbar.magistral = false;
  map.pharmacien.dashboard.magistral = false;
  map.préparateur.dashboard.magistral = false;
  map.administrateur.taskbar.magistral = true;
  map.administrateur.dashboard.magistral = true;

  map.préparateur.taskbar.cash = false;

  /* Inbox / mes saisies : accessibles au préparateur (autocorrection hors LGO). */
  map.préparateur.dashboard.inbox = true;

  map.pharmacien.dashboard.access = false;
  map.préparateur.dashboard.access = false;

  map.administrateur.dashboard.logs = true;
  map.administrateur.dashboard.bugs = true;
  map.administrateur.dashboard.access = true;
  map.administrateur.dashboard.parametres = true;
  map.pharmacien.dashboard.logs = true;
  map.pharmacien.dashboard.bugs = true;
  map.pharmacien.dashboard.parametres = true;

  return map;
}

export const DEFAULT_ACCESS = Object.freeze(buildDefaultAccess());

function overrideMap(overrides) {
  const map = {};
  for (const row of overrides || []) {
    if (!row?.role || !row?.surface || !row?.feature_id) continue;
    const role = canonicalRole(row.role);
    const key = `${role}|${row.surface}|${row.feature_id}`;
    map[key] = !!row.allowed;
  }
  return map;
}

/**
 * Grants casquettes : tableau de { surface, feature_id } (ou Set de clés surface|feature).
 */
export function hasCasquetteGrant(grants, surface, featureId) {
  if (!grants?.length) return false;
  const resolved = resolveAccessFeatureId(surface, featureId);
  const key = `${surface}|${resolved}`;
  for (const g of grants) {
    if (typeof g === 'string') {
      if (g === key) return true;
      continue;
    }
    if (g?.surface === surface && g?.feature_id === resolved) return true;
  }
  return false;
}

export function isFeatureAllowed(role, surface, featureId, overrides = []) {
  if (isDisabledRole(role)) return false;
  const canon = canonicalRole(role);
  const resolved = resolveAccessFeatureId(surface, featureId);
  const key = `${canon}|${surface}|${resolved}`;
  const overlay = overrideMap(overrides);
  if (Object.prototype.hasOwnProperty.call(overlay, key)) return overlay[key];
  return DEFAULT_ACCESS[canon]?.[surface]?.[resolved] === true;
}

/**
 * Accès final = matrice rôle OU grant casquette.
 * Page Paramètres : aussi visible si au moins un module configurable est accessible.
 */
export function canAccessFeature(role, surface, featureId, overrides = [], casquetteGrants = []) {
  if (isDisabledRole(role)) return false;
  if (
    isFeatureAllowed(role, surface, featureId, overrides)
    || hasCasquetteGrant(casquetteGrants, surface, featureId)
  ) {
    return true;
  }
  if (surface === 'dashboard' && featureId === 'parametres') {
    return SETTINGS_MODULE_FEATURES.some(
      (m) => isFeatureAllowed(role, surface, m, overrides)
        || hasCasquetteGrant(casquetteGrants, surface, m),
    );
  }
  return false;
}

export function firstAllowedDashboardPage(role, overrides = [], casquetteGrants = []) {
  if (canAccessFeature(role, 'dashboard', 'dashboard', overrides, casquetteGrants)) return 'dashboard';
  for (const f of DASHBOARD_FEATURES) {
    if (canAccessFeature(role, 'dashboard', f.id, overrides, casquetteGrants)) return f.id;
  }
  return null;
}
