import React, { useEffect, useState, useCallback } from 'react';
import { Lock } from 'lucide-react';
import StupefiantsCharts from '../../../stupefiants/dashboard/StupefiantsCharts.jsx';
import { fetchStupefiantOpsStats } from '../../../stupefiants/services/stupefiantService.js';

/** Graphiques opérateurs stupéfiants pour le tableau de bord (filtre module Stupéfiants). */
export default function StupefiantsChartsCard({ onNavigate, days = 90 }) {
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    try {
      setStats(await fetchStupefiantOpsStats(days));
    } catch {
      setStats(null);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <Lock size={16} className="text-rose-600" /> Stupéfiants — opérateurs
        </h2>
        {onNavigate && (
          <button
            type="button"
            onClick={() => onNavigate('stupefiants', { tab: 'verifier' })}
            className="text-xs text-rose-700 hover:underline"
          >
            Ouvrir →
          </button>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {stats
          ? `${stats.total} relevé(s) · ${stats.ouverts} ouvert(s) · ${days} j`
          : `Période ${days} j`}
      </p>
      <StupefiantsCharts days={days} embedded />
    </div>
  );
}
