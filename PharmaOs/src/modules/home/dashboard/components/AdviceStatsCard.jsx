import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import StatCard from './StatCard.jsx';
import { fetchConseilStats } from '../../../conseil/services/conseilService.js';

export default function AdviceStatsCard({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchConseilStats({ days: 30 })
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((e) => { if (!cancelled) setErr(e.message || 'Erreur stats'); });
    return () => { cancelled = true; };
  }, []);

  const metrics = stats
    ? [
        { label: 'Acceptés (30 j)', value: stats.accepte },
        { label: 'Refusés (30 j)', value: stats.refuse },
        { label: 'Taux d’acceptation', value: `${stats.tauxAcceptation}%` },
      ]
    : [
        { label: 'Acceptés (30 j)', value: '…' },
        { label: 'Refusés (30 j)', value: '…' },
        { label: 'Taux d’acceptation', value: '…' },
      ];

  return (
    <StatCard
      title="Stats de Conseil"
      icon={BookOpen}
      metrics={metrics}
      footnote={err || 'Ventes associées : N/A (données non branchées)'}
      onClick={onNavigate ? () => onNavigate('conseil') : undefined}
    />
  );
}
