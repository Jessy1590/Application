import React, { useEffect, useState, useCallback } from 'react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { Users, AlertTriangle } from 'lucide-react';
import { fetchStupefiantOpsStats } from '../services/stupefiantService.js';

const tipStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
};

/**
 * Graphiques opérateurs : réceptions vs responsables d’erreur.
 */
export default function StupefiantsCharts({ days = 90, embedded = false }) {
  const [stats, setStats] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    try {
      setStats(await fetchStupefiantOpsStats(days));
      setErr('');
    } catch (e) {
      setErr(e.message);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  if (err) {
    return <p className="text-sm text-red-600">{err}</p>;
  }
  if (!stats) {
    return <p className="text-sm text-slate-400">Chargement graphiques…</p>;
  }

  const body = (
    <div className={`grid ${embedded ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1 md:grid-cols-2'} gap-4`}>
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <Users size={16} className="text-rose-600" /> Opérateurs réception ({days} j)
        </h3>
        {stats.receptions.length === 0 ? (
          <p className="text-xs text-slate-400">Aucune réception sur la période.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.receptions} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="count" name="Réceptions" fill="#e11d48" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600" /> Responsables d’erreur ({days} j)
        </h3>
        {stats.erreurs.length === 0 ? (
          <p className="text-xs text-slate-400">Aucune clôture avec responsable sur la période.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.erreurs} layout="vertical" margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={tipStyle} />
                <Legend />
                <Bar dataKey="count" name="Écarts" fill="#d97706" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );

  if (embedded) return body;

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        {stats.total} relevé(s) — {stats.ouverts} ouvert(s)
      </p>
      {body}
    </div>
  );
}
