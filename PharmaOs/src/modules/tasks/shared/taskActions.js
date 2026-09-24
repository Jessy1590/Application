/**
 * Registre des actions « À traiter » par `details.type`.
 * Trois familles : clôturer sur place | ouvrir dashboard | reprendre en module taskbar.
 *
 * Couvre toutes les clés de TASK_RULE_CATEGORIES (+ legacy `perimes_mensuel`).
 */
import { openDashboardWindow, openModuleWindow, closeModuleWindow } from '../../../shared/windowService.js';
import { parseTaskDetails } from './taskDisplay.js';

/** @typedef {'close' | 'dashboard' | 'resume'} TaskActionKind */

/**
 * @typedef {object} TaskActionDef
 * @property {TaskActionKind} action
 * @property {'inline'|'retrait_lot'|'stock_recompte'} [closeMode]
 * @property {string} [page] dashboard page id
 * @property {(details: object) => object|null} [pageDataFromDetails]
 * @property {string} [view] module view for resume
 * @property {(details: object) => object|null} [moduleDataFromDetails]
 *   Retourne `null` si reprise impossible (id manquant) ; un objet (même vide) ouvre le module.
 * @property {string} [label] bouton principal
 * @property {string} [buttonClass] classes Tailwind bouton
 */

const BTN_VIOLET = 'bg-violet-600 hover:bg-violet-700';
const BTN_ROSE = 'bg-rose-600 hover:bg-rose-700';
const BTN_AMBER = 'bg-amber-600 hover:bg-amber-700';
const BTN_INDIGO = 'bg-indigo-600 hover:bg-indigo-700';
const BTN_SKY = 'bg-sky-600 hover:bg-sky-700';
const BTN_EMERALD = 'bg-emerald-600 hover:bg-emerald-700';
const BTN_FUCHSIA = 'bg-fuchsia-600 hover:bg-fuchsia-700';
const BTN_CYAN = 'bg-cyan-600 hover:bg-cyan-700';

/** @type {Readonly<Record<string, TaskActionDef>>} */
export const TASK_ACTIONS = Object.freeze({
  // —— Clôture sur place ——
  retrait_lot: {
    action: 'close',
    closeMode: 'retrait_lot',
    label: 'Clôturer',
  },
  stock_recompte: {
    action: 'close',
    closeMode: 'stock_recompte',
    label: 'Clôturer',
  },
  commande: {
    action: 'close',
    closeMode: 'inline',
    label: 'Clôturer',
  },
  facturation: {
    action: 'close',
    closeMode: 'inline',
    label: 'Clôturer',
  },
  libre: {
    action: 'close',
    closeMode: 'inline',
    label: 'Clôturer',
  },
  hr_absence_reponse: {
    action: 'close',
    closeMode: 'inline',
    label: 'Clôturer',
  },
  hr_horaire_reponse: {
    action: 'close',
    closeMode: 'inline',
    label: 'Clôturer',
  },
  perime_mea: {
    action: 'close',
    closeMode: 'inline',
    label: 'Clôturer',
  },
  perime_promo: {
    action: 'close',
    closeMode: 'inline',
    label: 'Clôturer',
  },
  perime_challenge: {
    action: 'close',
    closeMode: 'inline',
    label: 'Clôturer',
  },
  etalonnage_rdv: {
    action: 'close',
    closeMode: 'inline',
    label: 'Clôturer',
  },

  // —— Dashboard ——
  stock_error: {
    action: 'dashboard',
    page: 'stock',
    // TODO: StockErrorManager n’applique pas encore focusStockErrorId
    pageDataFromDetails: (d) => ({
      stockErrorId: d.stock_error_id || null,
    }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_VIOLET,
  },
  stock_recompte_result: {
    action: 'dashboard',
    page: 'stock',
    pageDataFromDetails: (d) => ({
      stockErrorId: d.stock_error_id || null,
    }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_VIOLET,
  },
  stupefiant_verification: {
    action: 'dashboard',
    page: 'stupefiants',
    pageDataFromDetails: (d) => ({
      releveId: d.releve_id || null,
      tab: 'verifier',
    }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_ROSE,
  },
  stupefiant_recompte: {
    action: 'dashboard',
    page: 'stupefiants',
    pageDataFromDetails: (d) => ({
      releveId: d.releve_id || null,
      tab: 'verifier',
    }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_ROSE,
  },
  perime_decision: {
    action: 'dashboard',
    page: 'perimes',
    pageDataFromDetails: (d) => ({
      perimeId: d.perime_id || null,
    }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_AMBER,
  },
  /** Legacy agrégat mensuel (plus de nouvelles créations). */
  perimes_mensuel: {
    action: 'dashboard',
    page: 'perimes',
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_AMBER,
  },
  hr_absence_demande: {
    action: 'dashboard',
    page: 'hr',
    // TODO: HrManager n’applique pas encore focusAbsenceId
    pageDataFromDetails: (d) => ({
      absenceId: d.absence_id || null,
      tab: 'absences',
    }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_INDIGO,
  },
  hr_horaire_demande: {
    action: 'dashboard',
    page: 'hr',
    // TODO: HrManager n’applique pas encore focusHoraireId
    pageDataFromDetails: (d) => ({
      horaireId: d.horaire_id || d.schedule_change_id || null,
      tab: 'horaires',
    }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_INDIGO,
  },
  cash_ecart: {
    action: 'dashboard',
    page: 'cash',
    // TODO: CashManager n’applique pas encore focusClosureId
    pageDataFromDetails: (d) => ({
      closureId: d.closure_id || null,
    }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_EMERALD,
  },

  // Magistrale — navigation vers l’écran métier ; deep-load orderId à brancher côté Magistral*
  magistral_devis: {
    action: 'dashboard',
    page: 'magistral_devis',
    // TODO: MagistralDevis / MagistralManager ne consomment pas encore orderId
    pageDataFromDetails: (d) => ({ orderId: d.order_id || null }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_FUCHSIA,
  },
  magistral_a_controler: {
    action: 'dashboard',
    page: 'magistral_rappel',
    // TODO: deep-load orderId (contrôle réception dans MagistralRappel)
    pageDataFromDetails: (d) => ({ orderId: d.order_id || null }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_FUCHSIA,
  },
  magistral_a_rappeler: {
    action: 'dashboard',
    page: 'magistral_rappel',
    // TODO: deep-load orderId
    pageDataFromDetails: (d) => ({ orderId: d.order_id || null }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_FUCHSIA,
  },
  magistral_a_dispenser: {
    action: 'dashboard',
    page: 'magistral_dispenser',
    // TODO: deep-load orderId
    pageDataFromDetails: (d) => ({ orderId: d.order_id || null }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_FUCHSIA,
  },
  magistral_non_conforme: {
    action: 'dashboard',
    page: 'magistral_suivi',
    // TODO: MagistralManager ne consomme pas encore orderId / focusOrderId
    pageDataFromDetails: (d) => ({ orderId: d.order_id || null }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_FUCHSIA,
  },

  location_a_rappeler: {
    action: 'dashboard',
    page: 'location_contact',
    // TODO: vue Contact n’applique pas encore contactId (dossierId oui via LocationManager suivi)
    pageDataFromDetails: (d) => ({
      contactId: d.contact_id || null,
      dossierId: d.dossier_id || null,
    }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_CYAN,
  },
  location_attente_suite: {
    action: 'dashboard',
    page: 'location_suivi',
    pageDataFromDetails: (d) => ({
      contactId: d.contact_id || null,
      dossierId: d.dossier_id || null,
      resultat: d.resultat || null,
    }),
    label: 'Ouvrir le dashboard',
    buttonClass: BTN_CYAN,
  },

  // —— Reprise module comptoir ——
  appel_brouillon: {
    action: 'resume',
    view: 'call',
    moduleDataFromDetails: (d) => (d.call_id ? { callId: d.call_id } : null),
    label: 'Reprendre',
    buttonClass: BTN_SKY,
  },
  appel_attente_pharmacien: {
    action: 'resume',
    view: 'call',
    moduleDataFromDetails: (d) => (d.call_id ? { callId: d.call_id } : null),
    label: 'Reprendre',
    buttonClass: BTN_AMBER,
  },
  ip_brouillon: {
    action: 'resume',
    view: 'ip',
    moduleDataFromDetails: (d) => (d.ip_id ? { ipId: d.ip_id } : null),
    label: 'Reprendre',
    buttonClass: BTN_INDIGO,
  },
  nc_brouillon: {
    action: 'resume',
    view: 'quality',
    moduleDataFromDetails: (d) => (d.quality_id ? { qualityId: d.quality_id } : null),
    label: 'Reprendre',
    buttonClass: BTN_ROSE,
  },
  litige_brouillon: {
    action: 'resume',
    view: 'disputes',
    moduleDataFromDetails: (d) => (d.dispute_id ? { disputeId: d.dispute_id } : null),
    label: 'Reprendre',
    buttonClass: BTN_AMBER,
  },
});

const DEFAULT_CLOSE = Object.freeze({
  action: 'close',
  closeMode: 'inline',
  label: 'Clôturer',
});

/**
 * @param {object|string|null|undefined} detailsOrDesc parsed details or raw description
 * @returns {TaskActionDef}
 */
export function getTaskAction(detailsOrDesc) {
  const details = typeof detailsOrDesc === 'string' || detailsOrDesc == null
    ? parseTaskDetails(detailsOrDesc)
    : detailsOrDesc;
  const type = details?.type;
  if (type && TASK_ACTIONS[type]) return TASK_ACTIONS[type];
  return DEFAULT_CLOSE;
}

/**
 * Exécute une action dashboard ou resume (pas les clôtures — gérées par l’UI).
 * @param {TaskActionDef} def
 * @param {object} details
 * @returns {Promise<boolean>} true si une navigation a été lancée
 */
export async function runTaskNavigation(def, details) {
  if (def.action === 'dashboard') {
    const pageData = def.pageDataFromDetails?.(details) || null;
    await openDashboardWindow(pageData ? { page: def.page, ...pageData } : { page: def.page });
    await closeModuleWindow();
    return true;
  }
  if (def.action === 'resume') {
    if (!def.view) return false;
    const data = def.moduleDataFromDetails?.(details);
    if (data === null) return false;
    await openModuleWindow(def.view, data || null);
    return true;
  }
  return false;
}
