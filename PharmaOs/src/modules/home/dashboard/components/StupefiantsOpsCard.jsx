import React, { useEffect, useState, useCallback } from 'react';
import { Lock } from 'lucide-react';
import StatCard from './StatCard.jsx';
import { fetchStupefiantOpsStats } from '../../../stupefiants/services/stupefiantService.js';

/** Widget accueil : synthèse stupéfiants + top opérateurs. */
export default function StupefiantsOpsCard({ onNavigate, days = 90 }) {
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    try {
      setStats(await fetchStupefiantOpsStats(days));
    } catch {
      setStats(null);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const topReception = stats?.receptions?.[0];
  const topErreur = stats?.erreurs?.[0];

  return (
    <StatCard
      title="Stupéfiants"
      icon={Lock}
      onClick={onNavigate ? () => onNavigate('stupefiants', { tab: 'verifier' }) : undefined}
      metrics={[
        { label: 'Relevés', value: stats?.total ?? '—' },
        { label: 'Ouverts', value: stats?.ouverts ?? '—' },
        {
          label: 'Top réception',
          value: topReception ? `${topReception.name} (${topReception.count})` : '—',
        },
        {
          label: 'Top erreur',
          value: topErreur ? `${topErreur.name} (${topErreur.count})` : '—',
        },
      ]}
      footnote={`${days} derniers jours`}
    />
  );
}
