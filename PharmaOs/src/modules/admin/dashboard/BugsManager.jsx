import React, { useCallback, useEffect, useState } from 'react';
import { Bug } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { fetchBugs, updateBugStatut, BUG_STATUTS, BUG_STATUT_LABELS } from '../services/bugService.js';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';

const STATUT_CLASS = {
  nouveau: 'bg-sky-50 text-sky-800 border-sky-200',
  en_cours: 'bg-amber-50 text-amber-800 border-amber-200',
  modifié: 'bg-violet-50 text-violet-800 border-violet-200',
  impossible: 'bg-slate-100 text-slate-600 border-slate-200',
};

function formatTs(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR');
}

export default function BugsManager() {
  const { user, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statut, setStatut] = useState('all');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setRows(await fetchBugs({ statut }));
    } catch (e) {
      setErr(e.message || 'Impossible de charger les bugs.');
    } finally {
      setLoading(false);
    }
  }, [statut]);

  useEffect(() => { load(); }, [load]);
  useRealtimeRefresh(load, { tables: ['bugs'] });

  const handleStatut = async (id, next) => {
    try {
      await updateBugStatut(id, next, {
        userId: user?.id,
        userName: profile?.display_name || user?.email,
      });
      load();
    } catch (e) {
      setErr(e.message || 'Mise à jour impossible.');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-1 flex items-center gap-2">
        <Bug className="text-rose-600" /> Bugs
      </h1>
      <p className="text-sm text-slate-500 mb-4">
        Signalements équipe : date, auteur, description, statut (nouveau, en cours, modifié, impossible).
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <select
          value={statut}
          onChange={(e) => setStatut(e.target.value)}
          className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
        >
          <option value="all">Tous les statuts</option>
          {BUG_STATUTS.map((s) => (
            <option key={s} value={s}>{BUG_STATUT_LABELS[s]}</option>
          ))}
        </select>
        <span className="text-xs text-slate-400">{rows.length} ticket(s)</span>
      </div>

      {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}
      {loading && rows.length === 0 && <p className="text-sm text-slate-500">Chargement…</p>}

      <div className="space-y-3">
        {rows.map((b) => (
          <article key={b.id} className="bg-white border border-slate-200 rounded-xl p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">{b.user_name || 'Inconnu'}</p>
                <p className="text-xs text-slate-500">{formatTs(b.created_at)}</p>
              </div>
              <select
                value={b.statut}
                onChange={(e) => handleStatut(b.id, e.target.value)}
                className={`text-xs font-semibold border rounded-lg px-2 py-1.5 ${STATUT_CLASS[b.statut] || ''}`}
              >
                {BUG_STATUTS.map((s) => (
                  <option key={s} value={s}>{BUG_STATUT_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <p className="text-sm text-slate-700 mt-3 whitespace-pre-wrap">{b.information}</p>
            {b.updated_by_name && b.updated_at !== b.created_at && (
              <p className="text-[11px] text-slate-400 mt-2">
                MAJ {formatTs(b.updated_at)} par {b.updated_by_name}
              </p>
            )}
          </article>
        ))}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-6 text-center">
            Aucun signalement.
          </p>
        )}
      </div>
    </div>
  );
}
