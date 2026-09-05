import React, { useState, useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import StatCard from './StatCard.jsx';
import { fetchQualityStats } from '../../../quality/services/qualityService.js';

export default function QualityStatsCard({ onNavigate }) {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchQualityStats().then(setStats).catch(console.error);
  }, []);

  if (!stats) return null;

  return (
    <StatCard
      title="Qualité ISO 9001"
      icon={ShieldCheck}
      onClick={() => onNavigate?.('quality')}
      metrics={[
        { label: 'Événements ouverts', value: stats.open },
        { label: 'Critiques en cours', value: stats.critical },
        { label: 'CAPA en attente', value: stats.capaPending },
      ]}
      footnote={`${stats.total} événement(s) au total — ${stats.closed} clôturé(s)`}
    />
  );
}
