/**
 * Catalogue des widgets d’accueil HomeDashboard.
 * La matrice role_dashboard_widgets contrôle la visibilité par rôle.
 */

export const DASHBOARD_WIDGETS = Object.freeze([
  { id: 'staff_efficiency', label: 'Efficacité équipe' },
  { id: 'recurring_issues', label: 'Problèmes récurrents' },
  { id: 'ip', label: 'Act-IP' },
  { id: 'calls', label: 'Appels' },
  { id: 'tasks', label: 'Tâches' },
  { id: 'quality', label: 'Qualité' },
  { id: 'magistral', label: 'Magistrales' },
  { id: 'taskbar_usage', label: 'Usage taskbar' },
  { id: 'conseil', label: 'Conseil' },
]);

/** Defaults si aucune ligne BDD (préparateur allégé). */
export function defaultWidgetVisible(role, widgetId) {
  if (role === 'préparateur') {
    return ['tasks', 'calls', 'ip'].includes(widgetId);
  }
  return true;
}
