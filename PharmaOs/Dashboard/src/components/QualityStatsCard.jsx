import React from 'react';
import { ShieldCheck } from 'lucide-react';
import StatCard from './StatCard.jsx';
import { getMockQualityStats } from '../services/statsService.js';

// MOCK DATA — a remplacer par une requete sur PharmaOs.quality_events
// une fois le module Quality (Phase 2 de l'app Electron) branche.
export default function QualityStatsCard() {
  const stats = getMockQualityStats();

  return (
    <StatCard
      title="Stats de Qualité"
      icon={ShieldCheck}
      metrics={[
        { label: 'Interventions Pharmaceutiques', value: stats.interventionsPharmaceutiques },
        { label: 'Appels traités', value: stats.appelsTraites },
        { label: 'Taux de conformité', value: `${stats.tauxConformite}%` },
      ]}
      footnote="Données fictives (mock) — module Quality non branché"
    />
  );
}
