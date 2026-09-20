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
import { fetchDashboardInsights } from '../services/statsService.js';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';
import { useAuth } from '../../../core/AuthContext.jsx';
import { canonicalRole } from '../../../core/roles.js';
import { DASHBOARD_WIDGETS, defaultWidgetVisible } from '../../../core/dashboardWidgets.js';
import { fetchRoleDashboardWidgets } from '../../admin/services/accessService.js';

const WIDGET_COMPONENTS = {
  staff_efficiency: StaffEfficiencyCard,
  recurring_issues: RecurringIssuesCard,
  ip: IpStatsCard,
  calls: CallStatsCard,
  tasks: TaskStatsCard,
  quality: QualityStatsCard,
  magistral: MagistralAlertsCard,
  taskbar_usage: TaskbarUsageCard,
  conseil: AdviceStatsCard,
};

export default function HomeDashboard({ onNavigate }) {
  const { role } = useAuth();
  const canon = canonicalRole(role);
  const [insights, setInsights] = useState(null);
  const [widgetRows, setWidgetRows] = useState([]);

  const load = useCallback(() => {
    fetchDashboardInsights(30).then(setInsights).catch(console.error);
    fetchRoleDashboardWidgets().then(setWidgetRows).catch(() => setWidgetRows([]));
  }, []);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(load, {
    tables: [
      'call_logs', 'act_ip_logs', 'tasks', 'task_assignments', 'quality_events',
      'supplier_disputes', 'stock_errors', 'magistral_orders', 'role_dashboard_widgets',
    ],
  });

  const visibleIds = useMemo(() => {
    const ids = [];
    for (const w of DASHBOARD_WIDGETS) {
      const row = widgetRows.find((r) => r.role === canon && r.widget_id === w.id);
      const visible = row ? !!row.visible : defaultWidgetVisible(canon, w.id);
      if (visible) ids.push(w.id);
    }
    return ids;
  }, [widgetRows, canon]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Vue d&apos;ensemble</h1>
        <p className="text-slate-500 text-sm mt-1">
          Efficacité de l&apos;équipe, problèmes récurrents et alertes opérationnelles
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {visibleIds.map((id) => {
          const Comp = WIDGET_COMPONENTS[id];
          if (!Comp) return null;
          if (id === 'staff_efficiency' || id === 'recurring_issues') {
            return <Comp key={id} insights={insights} onNavigate={onNavigate} />;
          }
          if (id === 'taskbar_usage') {
            return <Comp key={id} />;
          }
          return <Comp key={id} onNavigate={onNavigate} />;
        })}
      </div>
      {visibleIds.length === 0 && (
        <p className="text-sm text-slate-500">Aucun widget activé pour votre rôle.</p>
      )}
    </div>
  );
}
