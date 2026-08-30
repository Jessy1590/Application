import React from 'react';
import { BookOpen } from 'lucide-react';
import StatCard from './StatCard.jsx';
import { getMockAdviceStats } from '../services/statsService.js';

// MOCK DATA — a remplacer par une requete sur PharmaOs.advice_events
// une fois le module Advice (Phase 2 de l'app Electron) branche.
export default function AdviceStatsCard() {
  const stats = getMockAdviceStats();

  return (
    <StatCard
      title="Stats de Conseil"
      icon={BookOpen}
      metrics={[
        { label: 'Conseils donnés', value: stats.conseilsDonnes },
        { label: 'Ventes associées', value: stats.ventesAssociees },
        { label: 'Taux de transformation', value: `${stats.tauxTransformation}%` },
      ]}
      footnote="Données fictives (mock) — module Advice non branché"
    />
  );
}
