import React, { useEffect, useState } from 'react';
import AdviceStatsCard from './components/AdviceStatsCard.jsx';
import TaskbarUsageCard from './components/TaskbarUsageCard.jsx';
import TaskStatsCard from './components/TaskStatsCard.jsx';
import CallStatsCard from './components/CallStatsCard.jsx';
import IpStatsCard from './components/IpStatsCard.jsx';
import QualityStatsCard from './components/QualityStatsCard.jsx';
import StaffEfficiencyCard from './components/StaffEfficiencyCard.jsx';
import RecurringIssuesCard from './components/RecurringIssuesCard.jsx';
import { fetchDashboardInsights } from '../services/statsService.js';

export default function HomeDashboard({ onNavigate }) {
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    fetchDashboardInsights(30).then(setInsights).catch(console.error);
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Vue d&apos;ensemble</h1>
        <p className="text-slate-500 text-sm mt-1">
          Efficacité de l&apos;équipe, problèmes récurrents et alertes opérationnelles
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        <StaffEfficiencyCard insights={insights} onNavigate={onNavigate} />
        <RecurringIssuesCard insights={insights} onNavigate={onNavigate} />
        <IpStatsCard onNavigate={onNavigate} />
        <CallStatsCard onNavigate={onNavigate} />
        <TaskStatsCard onNavigate={onNavigate} />
        <QualityStatsCard onNavigate={onNavigate} />
        <TaskbarUsageCard />
        <AdviceStatsCard />
      </div>
    </div>
  );
}
