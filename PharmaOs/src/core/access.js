import { ACCESS_ROLES, canonicalRole, isDisabledRole } from './roles.js';

export const TASKBAR_FEATURES = Object.freeze([
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
  { id: 'hr', label: 'RH' },
  { id: 'cash', label: 'Clôture de caisse' },
]);

export const DASHBOARD_FEATURES = Object.freeze([
  { id: 'dashboard', label: 'Ouvrir le dashboard / accueil' },
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
  { id: 'conseil', label: 'Conseil' },
  { id: 'bdm', label: 'BDPM' },
  { id: 'hr', label: 'RH' },
  { id: 'cash', label: 'Caisse' },
  { id: 'logs', label: 'Logs' },
  { id: 'bugs', label: 'Bugs' },
  { id: 'access', label: 'Accès & rôles' },
]);

export const MODULE_VIEW_FEATURE = Object.freeze({
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
  magistral: 'magistral',
  psl: 'psl',
  cash: 'cash',
  hr: 'hr',
});

/** Onglets dashboard Location → feature d’accès unique `location`. */
export function resolveAccessFeatureId(surface, featureId) {
  if (surface === 'dashboard' && (featureId === 'location' || String(featureId || '').startsWith('location_'))) {
    return 'location';
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

  /* Location : ouvert par défaut à administrateur (legacy admin) ;
   * les autres rôles suivent la matrice Accès & rôles (role_access). */
  map.pharmacien.taskbar.location = false;
  map.préparateur.taskbar.location = false;
  map.gestionnaire.taskbar.location = false;
  map.pharmacien.dashboard.location = false;
  map.préparateur.dashboard.location = false;
  map.gestionnaire.dashboard.location = false;
  map.administrateur.taskbar.location = true;
  map.administrateur.dashboard.location = true;
  map.préparateur.taskbar.cash = false;

  for (const id of ['magistral', 'psl', 'conseil', 'bdm', 'logs', 'bugs', 'access']) {
    map.gestionnaire.dashboard[id] = false;
  }

  map.pharmacien.dashboard.access = false;
  map.préparateur.dashboard.access = false;

  map.administrateur.dashboard.logs = true;
  map.administrateur.dashboard.bugs = true;
  map.administrateur.dashboard.access = true;
  map.pharmacien.dashboard.logs = true;
  map.pharmacien.dashboard.bugs = true;

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

export function isFeatureAllowed(role, surface, featureId, overrides = []) {
  if (isDisabledRole(role)) return false;
  const canon = canonicalRole(role);
  const resolved = resolveAccessFeatureId(surface, featureId);
  const key = `${canon}|${surface}|${resolved}`;
  const overlay = overrideMap(overrides);
  if (Object.prototype.hasOwnProperty.call(overlay, key)) return overlay[key];
  return DEFAULT_ACCESS[canon]?.[surface]?.[resolved] === true;
}

export function firstAllowedDashboardPage(role, overrides = []) {
  if (isFeatureAllowed(role, 'dashboard', 'dashboard', overrides)) return 'dashboard';
  for (const f of DASHBOARD_FEATURES) {
    if (isFeatureAllowed(role, 'dashboard', f.id, overrides)) return f.id;
  }
  return null;
}
