import React, { useEffect, useState, useCallback, useMemo } from 'react';
import AdviceStatsCard from './components/AdviceStatsCard.jsx';
import TaskbarUsageCard from './components/TaskbarUsageCard.jsx';
import TaskStatsCard from './components/TaskStatsCard.jsx';
import CallStatsCard from './components/CallStatsCard.jsx';
import IpStatsCard from './components/IpStatsCard.jsx';
import QualityStatsCard from './components/QualityStatsCard.jsx';
import StaffEfficiencyCard from './components/StaffEfficiencyCard.jsx';
import RecurringIssuesCard from './components/RecurringIssuesCard.jsx';
import MagistralAlertsCard from './components/MagistralAlertsCard.jsx';
import DashboardFilters from './components/DashboardFilters.jsx';
import {
  OverviewKpisCard,
  ActivityTimelineCard,
  ModuleCompareCard,
  CallsChartsCard,
  TasksChartsCard,
  IpChartsCard,
  QualityChartsCard,
  StockChartsCard,
  DisputesChartsCard,
  MagistralChartsCard,
  ConseilChartsCard,
  HrChartsCard,
  LocationChartsCard,
  CashChartsCard,
} from './components/DashboardCharts.jsx';
import { LogsChartsCard, BugsChartsCard } from './components/AdminOpsCharts.jsx';
import StupefiantsOpsCard from './components/StupefiantsOpsCard.jsx';
import StupefiantsChartsCard from './components/StupefiantsChartsCard.jsx';
import { fetchDashboardInsights, fetchDashboardCharts } from '../services/statsService.js';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';
import { useAuth } from '../../../core/AuthContext.jsx';
import { canonicalRole } from '../../../core/roles.js';
import {
  DASHBOARD_WIDGETS,
  DASHBOARD_CATEGORIES,
  DASHBOARD_MODULES,
  defaultWidgetVisible,
  widgetSpanClass,
} from '../../../core/dashboardWidgets.js';
import { fetchRoleDashboardWidgets } from '../../admin/services/accessService.js';

const WIDGET_COMPONENTS = {
  overview_kpis: OverviewKpisCard,
  activity_timeline: ActivityTimelineCard,
  module_compare: ModuleCompareCard,
  recurring_issues: RecurringIssuesCard,
  staff_efficiency: StaffEfficiencyCard,
  calls: CallStatsCard,
  calls_charts: CallsChartsCard,
  tasks: TaskStatsCard,
  tasks_charts: TasksChartsCard,
  ip: IpStatsCard,
  ip_charts: IpChartsCard,
  quality: QualityStatsCard,
  quality_charts: QualityChartsCard,
  stock_charts: StockChartsCard,
  disputes_charts: DisputesChartsCard,
  magistral: MagistralAlertsCard,
  magistral_charts: MagistralChartsCard,
  conseil: AdviceStatsCard,
  conseil_charts: ConseilChartsCard,
  stupefiants_ops: StupefiantsOpsCard,
  stupefiants_charts: StupefiantsChartsCard,
  location_charts: LocationChartsCard,
  cash_charts: CashChartsCard,
  hr_charts: HrChartsCard,
  taskbar_usage: TaskbarUsageCard,
  logs_charts: LogsChartsCard,
  bugs_charts: BugsChartsCard,
};

const CHART_PROP_IDS = new Set([
  'overview_kpis',
  'activity_timeline',
  'module_compare',
  'calls_charts',
  'tasks_charts',
  'ip_charts',
  'quality_charts',
  'stock_charts',
  'disputes_charts',
  'magistral_charts',
  'conseil_charts',
  'hr_charts',
  'location_charts',
  'cash_charts',
]);

const DAYS_PROP_IDS = new Set(['taskbar_usage', 'logs_charts', 'bugs_charts', 'stupefiants_ops', 'stupefiants_charts']);

const INSIGHT_PROP_IDS = new Set(['staff_efficiency', 'recurring_issues']);

export default function HomeDashboard({ onNavigate }) {
  const { role } = useAuth();
  const canon = canonicalRole(role);
  const [insights, setInsights] = useState(null);
  const [charts, setCharts] = useState(null);
  const [widgetRows, setWidgetRows] = useState([]);
  const [days, setDays] = useState(30);
  const [category, setCategory] = useState('all');
  const [module, setModule] = useState('all');

  const load = useCallback(() => {
    fetchDashboardInsights(days).then(setInsights).catch(console.error);
    fetchDashboardCharts(days).then(setCharts).catch(console.error);
    fetchRoleDashboardWidgets().then(setWidgetRows).catch(() => setWidgetRows([]));
  }, [days]);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(load, {
    tables: [
      'call_logs', 'act_ip_logs', 'tasks', 'task_assignments', 'quality_events',
      'supplier_disputes', 'stock_errors', 'magistral_orders', 'role_dashboard_widgets',
      'conseil_events', 'cash_closures', 'location_dossiers', 'hr_absences', 'hr_schedule_changes',
      'app_logs', 'bugs', 'taskbar_logs', 'stupefiant_releves',
    ],
  });

  const visibleMeta = useMemo(() => {
    return DASHBOARD_WIDGETS.filter((w) => {
      const row = widgetRows.find((r) => r.role === canon && r.widget_id === w.id);
      const visible = row ? !!row.visible : defaultWidgetVisible(canon, w.id);
      if (!visible) return false;
      if (category !== 'all' && w.category !== category) return false;
      if (module !== 'all' && w.module !== module) return false;
      return true;
    });
  }, [widgetRows, canon, category, module]);

  const categoryLabel = category === 'all'
    ? null
    : DASHBOARD_CATEGORIES.find((c) => c.id === category)?.label;
  const moduleLabel = module === 'all'
    ? null
    : DASHBOARD_MODULES.find((m) => m.id === module)?.label;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Vue d&apos;ensemble</h1>
        <p className="text-slate-500 text-sm mt-1">
          Pilotage, alertes et graphiques opérationnels
          {categoryLabel || moduleLabel ? (
            <span className="text-slate-400">
              {' — '}
              {[categoryLabel, moduleLabel].filter(Boolean).join(' · ')}
            </span>
          ) : null}
        </p>
      </div>

      <DashboardFilters
        days={days}
        onDaysChange={setDays}
        category={category}
        onCategoryChange={setCategory}
        module={module}
        onModuleChange={setModule}
        resultCount={visibleMeta.length}
      />

      {!charts && (
        <p className="text-sm text-slate-400 mb-4">Chargement des indicateurs…</p>
      )}
      {charts?.errors?.length > 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
          Certaines sources n&apos;ont pas pu être chargées ({charts.errors.length}). Les graphiques disponibles restent affichés.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {visibleMeta.map((w) => {
          const Comp = WIDGET_COMPONENTS[w.id];
          if (!Comp) return null;
          const span = widgetSpanClass(w.span);
          const wrap = (node) => (
            <div key={w.id} className={span || undefined}>
              {node}
            </div>
          );

          if (DAYS_PROP_IDS.has(w.id)) {
            return wrap(<Comp days={days} onNavigate={onNavigate} />);
          }
          if (CHART_PROP_IDS.has(w.id)) {
            return <Comp key={w.id} charts={charts} onNavigate={onNavigate} days={days} />;
          }
          if (INSIGHT_PROP_IDS.has(w.id)) {
            return wrap(<Comp insights={insights} onNavigate={onNavigate} />);
          }
          return wrap(<Comp onNavigate={onNavigate} days={days} />);
        })}
      </div>

      {visibleMeta.length === 0 && (
        <div className="text-center py-16 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl">
          <p className="text-sm text-slate-600 font-medium">Aucun widget pour ce filtre</p>
          <p className="text-xs text-slate-400 mt-1">
            Élargissez la catégorie / le module, ou activez des widgets dans Accès &amp; rôles.
          </p>
          <button
            type="button"
            onClick={() => { setCategory('all'); setModule('all'); }}
            className="mt-3 text-xs font-semibold text-sky-600 hover:text-sky-700"
          >
            Réinitialiser les filtres
          </button>
        </div>
      )}
    </div>
  );
}

