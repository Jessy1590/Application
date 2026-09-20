import React, { useCallback, useEffect, useState } from 'react';
import { ScrollText, Filter } from 'lucide-react';
import { fetchAppLogs, fetchAppLogStats } from '../services/adminLogService.js';
import { useRealtimeRefresh } from '../../../shared/useRealtimeRefresh.js';
import LogsCharts from './LogsCharts.jsx';

const LEVELS = [
  { id: 'all', label: 'Tous niveaux' },
  { id: 'info', label: 'Info' },
  { id: 'warn', label: 'Warn' },
  { id: 'error', label: 'Erreur' },
  { id: 'debug', label: 'Debug' },
];

const CATEGORIES = [
  { id: 'all', label: 'Toutes catégories' },
  { id: 'data', label: 'Données' },
  { id: 'ui', label: 'Interface' },
  { id: 'auth', label: 'Auth' },
  { id: 'window', label: 'Fenêtres' },
  { id: 'bug', label: 'Bugs' },
  { id: 'access', label: 'Accès' },
  { id: 'mail', label: 'Mails' },
  { id: 'settings', label: 'Paramètres' },
  { id: 'magistral', label: 'Magistrales' },
  { id: 'location', label: 'Location' },
  { id: 'cash', label: 'Caisse' },
  { id: 'error', label: 'Erreurs' },
];

const WINDOWS = [
  { id: 6, label: '6 h' },
  { id: 24, label: '24 h' },
  { id: 48, label: '48 h' },
  { id: 168, label: '7 j' },
  { id: 720, label: '30 j' },
];

const LEVEL_CLASS = {
  error: 'bg-red-50 text-red-700',
  warn: 'bg-amber-50 text-amber-800',
  info: 'bg-slate-100 text-slate-600',
  debug: 'bg-slate-50 text-slate-500',
};

function formatTs(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('fr-FR');
}

export default function LogsManager() {
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [level, setLevel] = useState('all');
  const [category, setCategory] = useState('all');
  const [sinceHours, setSinceHours] = useState(48);
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setRows(await fetchAppLogs({ level, category, search, sinceHours, limit: 300 }));
    } catch (e) {
      setErr(e.message || 'Impossible de charger les logs.');
    } finally {
      setLoading(false);
    }
  }, [level, category, search, sinceHours]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      setStats(await fetchAppLogStats({ sinceHours }));
    } catch {
      setStats(null);
    } finally {
      setStatsLoading(false);
    }
  }, [sinceHours]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStats(); }, [loadStats]);

  const refreshAll = useCallback(() => {
    load();
    loadStats();
  }, [load, loadStats]);

  useRealtimeRefresh(refreshAll, { tables: ['app_logs'] });

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-800 mb-1 flex items-center gap-2">
        <ScrollText className="text-slate-600" /> Logs
      </h1>
      <p className="text-sm text-slate-500 mb-4">
        Journal détaillé : actions interface, auth, mails, paramètres, fenêtres, et chaque INSERT / UPDATE / DELETE métier.
      </p>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Filter size={14} className="text-slate-400" />
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
          {LEVELS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
          {CATEGORIES.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <select value={sinceHours} onChange={(e) => setSinceHours(Number(e.target.value))} className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white">
          {WINDOWS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Recherche message, action, personne…"
          className="text-sm border border-slate-300 rounded-lg px-3 py-1.5 bg-white min-w-[220px] flex-1"
        />
        <span className="text-xs text-slate-400">{rows.length} entrée(s)</span>
      </div>

      <LogsCharts stats={stats} loading={statsLoading} />

      {err && <div className="mb-3 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{err}</div>}
      {loading && rows.length === 0 && <p className="text-sm text-slate-500">Chargement…</p>}

      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="p-2.5 font-semibold">Date</th>
              <th className="p-2.5 font-semibold">Personne</th>
              <th className="p-2.5 font-semibold">Niveau</th>
              <th className="p-2.5 font-semibold">Catégorie</th>
              <th className="p-2.5 font-semibold">Action</th>
              <th className="p-2.5 font-semibold">Entité</th>
              <th className="p-2.5 font-semibold">Message</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <React.Fragment key={r.id}>
                <tr
                  className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setOpenId(openId === r.id ? null : r.id)}
                >
                  <td className="p-2.5 whitespace-nowrap text-slate-600">{formatTs(r.created_at)}</td>
                  <td className="p-2.5">
                    <div className="font-medium text-slate-800">{r.user_name || '—'}</div>
                    <div className="text-[11px] text-slate-400">{r.user_role || ''} {r.surface ? `· ${r.surface}` : ''}</div>
                  </td>
                  <td className="p-2.5">
                    <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${LEVEL_CLASS[r.level] || LEVEL_CLASS.info}`}>
                      {r.level}
                    </span>
                  </td>
                  <td className="p-2.5 text-slate-600">{r.category}</td>
                  <td className="p-2.5 font-medium text-slate-800">{r.action}</td>
                  <td className="p-2.5 text-xs text-slate-500">
                    {r.entity || '—'}
                    {r.entity_id ? <div className="font-mono text-[10px] truncate max-w-[140px]">{r.entity_id}</div> : null}
                  </td>
                  <td className="p-2.5 text-slate-600 max-w-sm truncate">{r.message || '—'}</td>
                </tr>
                {openId === r.id && (
                  <tr className="bg-slate-50">
                    <td colSpan={7} className="p-3">
                      <pre className="text-[11px] leading-relaxed text-slate-700 whitespace-pre-wrap break-all max-h-64 overflow-auto bg-white border border-slate-200 rounded-lg p-3">
                        {JSON.stringify(r.details || {}, null, 2)}
                      </pre>
                      <p className="text-[11px] text-slate-400 mt-1">source {r.source} · id {r.id}</p>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-500">Aucun log sur cette période.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
