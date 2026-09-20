/**

 * Catalogue des widgets d’accueil HomeDashboard.

 * La matrice role_dashboard_widgets contrôle la visibilité par rôle.

 *

 * module  → filtre « par module »

 * category → filtre « par catégorie d’utilité »

 */



export const DASHBOARD_CATEGORIES = Object.freeze([

  { id: 'pilotage', label: 'Pilotage' },

  { id: 'alertes', label: 'Alertes' },

  { id: 'activite', label: 'Activité' },

  { id: 'qualite', label: 'Qualité & sécurité' },

  { id: 'equipe', label: 'Équipe' },

  { id: 'metier', label: 'Métier' },

  { id: 'usage', label: 'Usage' },

]);



export const DASHBOARD_MODULES = Object.freeze([

  { id: 'overview', label: 'Vue d’ensemble' },

  { id: 'calls', label: 'Appels' },

  { id: 'tasks', label: 'Tâches' },

  { id: 'ip', label: 'Act-IP' },

  { id: 'quality', label: 'Qualité' },

  { id: 'stock', label: 'Stock' },

  { id: 'disputes', label: 'Litiges' },

  { id: 'magistral', label: 'Magistrales' },

  { id: 'conseil', label: 'Conseil' },

  { id: 'stupefiants', label: 'Stupéfiants' },

  { id: 'location', label: 'Location' },

  { id: 'cash', label: 'Caisse' },

  { id: 'hr', label: 'RH' },

  { id: 'taskbar', label: 'Taskbar' },

  { id: 'logs', label: 'Logs' },

  { id: 'bugs', label: 'Bugs' },

]);



/** @typedef {{ id: string, label: string, module: string, category: string, span?: 'full' | 'wide' | 'normal' }} DashboardWidget */



/** @type {readonly DashboardWidget[]} */

export const DASHBOARD_WIDGETS = Object.freeze([

  // Pilotage

  { id: 'overview_kpis', label: 'Indicateurs clés', module: 'overview', category: 'pilotage', span: 'full' },

  { id: 'activity_timeline', label: 'Tendance multi-modules', module: 'overview', category: 'activite', span: 'wide' },

  { id: 'module_compare', label: 'Volumes par module', module: 'overview', category: 'activite', span: 'normal' },

  { id: 'recurring_issues', label: 'Problèmes récurrents', module: 'overview', category: 'alertes', span: 'full' },



  // Appels

  { id: 'calls', label: 'Appels — actions', module: 'calls', category: 'alertes', span: 'normal' },

  { id: 'calls_charts', label: 'Appels — graphiques', module: 'calls', category: 'activite', span: 'wide' },



  // Tâches

  { id: 'tasks', label: 'Tâches — en cours', module: 'tasks', category: 'alertes', span: 'normal' },

  { id: 'tasks_charts', label: 'Tâches — graphiques', module: 'tasks', category: 'activite', span: 'wide' },



  // IP

  { id: 'ip', label: 'Act-IP — détail', module: 'ip', category: 'qualite', span: 'full' },

  { id: 'ip_charts', label: 'Act-IP — graphiques', module: 'ip', category: 'activite', span: 'wide' },



  // Qualité / stock / litiges

  { id: 'quality', label: 'Qualité — synthèse', module: 'quality', category: 'qualite', span: 'normal' },

  { id: 'quality_charts', label: 'Qualité — graphiques', module: 'quality', category: 'activite', span: 'wide' },

  { id: 'stock_charts', label: 'Stock — graphiques', module: 'stock', category: 'qualite', span: 'normal' },

  { id: 'disputes_charts', label: 'Litiges — graphiques', module: 'disputes', category: 'qualite', span: 'normal' },



  // Métier

  { id: 'magistral', label: 'Magistrales — alertes', module: 'magistral', category: 'alertes', span: 'normal' },

  { id: 'magistral_charts', label: 'Magistrales — graphiques', module: 'magistral', category: 'metier', span: 'wide' },

  { id: 'conseil', label: 'Conseil — synthèse', module: 'conseil', category: 'metier', span: 'normal' },

  { id: 'conseil_charts', label: 'Conseil — graphiques', module: 'conseil', category: 'activite', span: 'normal' },

  { id: 'stupefiants_ops', label: 'Stupéfiants — synthèse', module: 'stupefiants', category: 'metier', span: 'normal' },

  { id: 'stupefiants_charts', label: 'Stupéfiants — graphiques', module: 'stupefiants', category: 'metier', span: 'wide' },

  { id: 'location_charts', label: 'Location — graphiques', module: 'location', category: 'metier', span: 'wide' },

  { id: 'cash_charts', label: 'Caisse — graphiques', module: 'cash', category: 'metier', span: 'normal' },



  // Équipe / usage / admin

  { id: 'staff_efficiency', label: 'Efficacité équipe', module: 'hr', category: 'equipe', span: 'wide' },

  { id: 'hr_charts', label: 'RH — graphiques', module: 'hr', category: 'equipe', span: 'wide' },

  { id: 'taskbar_usage', label: 'Usage taskbar', module: 'taskbar', category: 'usage', span: 'wide' },

  { id: 'logs_charts', label: 'Logs — graphiques', module: 'logs', category: 'usage', span: 'full' },

  { id: 'bugs_charts', label: 'Bugs — graphiques', module: 'bugs', category: 'usage', span: 'wide' },

]);



const PREPA_DEFAULTS = new Set([

  'overview_kpis',

  'calls',

  'tasks',

  'ip',

  'activity_timeline',

  'magistral',

]);



/** Defaults si aucune ligne BDD (préparateur allégé ; logs/bugs hors défaut préparateur). */

export function defaultWidgetVisible(role, widgetId) {

  if (role === 'préparateur') {

    return PREPA_DEFAULTS.has(widgetId);

  }

  return true;

}



export function widgetSpanClass(span) {

  if (span === 'full') return 'md:col-span-2 xl:col-span-3';

  if (span === 'wide') return 'md:col-span-2';

  return '';

}


