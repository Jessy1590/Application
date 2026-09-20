import React, { useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { ScrollText, Bug, ChevronRight } from 'lucide-react';
import ChartShell, { CHART_COLORS, tipStyle, EmptyChart, SideLegend } from './ChartShell.jsx';
import { fetchAppLogStats } from '../../../admin/services/adminLogService.js';
import { fetchBugStats } from '../../../admin/services/bugService.js';

const LEVEL_COLORS = {
  debug: '#94a3b8',
  info: '#64748b',
  warn: '#d97706',
  error: '#dc2626',
};

const BUG_COLORS = {
  nouveau: '#0284c7',
  en_cours: '#d97706',
  modifié: '#16a34a',
  impossible: '#dc2626',
};

function LinkBtn({ onNavigate, page, label = 'Voir' }) {
  if (!onNavigate) return null;
  return (
    <button
      type="button"
      onClick={() => onNavigate(page)}
      className="text-xs font-semibold text-sky-600 hover:text-sky-700 flex items-center gap-0.5 shrink-0"
    >
      {label} <ChevronRight size={14} />
    </button>
  );
}

function hasData(list) {
  return Array.isArray(list) && list.some((x) => (x.count ?? 0) > 0);
}

/** Graphiques app_logs — période = filtre dashboard (jours). */
export function LogsChartsCard({ days = 30, onNavigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchAppLogStats({ sinceHours: days * 24 })
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Erreur logs'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  if (loading && !stats) {
    return (
      <div className="md:col-span-2 xl:col-span-3 bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-400 animate-pulse">
        Chargement des graphiques logs…
      </div>
    );
  }

  if (error) {
    return (
      <div className="md:col-span-2 xl:col-span-3 bg-rose-50 border border-rose-100 rounded-xl p-4 text-sm text-rose-700">
        Logs : {error}
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="md:col-span-2 xl:col-span-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <ScrollText size={16} className="text-slate-400" />
          Aucun log sur les {days} derniers jours.
        </span>
        <LinkBtn onNavigate={onNavigate} page="logs" />
      </div>
    );
  }

  return (
    <div className="md:col-span-2 xl:col-span-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-600">
            <ScrollText size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Logs applicatifs</h2>
            <p className="text-[11px] text-slate-400">
              {stats.total} événement{stats.total > 1 ? 's' : ''} · {days} j
              {stats.total >= 5000 ? ' (échantillon max. 5000)' : ''}
            </p>
          </div>
        </div>
        <LinkBtn onNavigate={onNavigate} page="logs" label="Gérer" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartShell
          title="Tendance"
          subtitle="Info / warn / erreur"
          height="h-56"
          bodyLayout="row"
          legend={(
            <SideLegend
              items={[
                { name: 'Info', color: '#64748b' },
                { name: 'Warn', color: '#d97706' },
                { name: 'Erreur', color: '#dc2626' },
              ]}
            />
          )}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.timeline} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tipStyle} />
              <Area type="monotone" dataKey="info" name="Info" stackId="1" stroke="#64748b" fill="#cbd5e1" fillOpacity={0.7} />
              <Area type="monotone" dataKey="warn" name="Warn" stackId="1" stroke="#d97706" fill="#fcd34d" fillOpacity={0.7} />
              <Area type="monotone" dataKey="error" name="Erreur" stackId="1" stroke="#dc2626" fill="#fca5a5" fillOpacity={0.8} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartShell>

        <ChartShell
          title="Niveaux"
          height="h-56"
          bodyLayout="row"
          legend={(
            <SideLegend
              items={(stats.byLevel || []).map((d) => ({
                name: d.name,
                value: d.count,
                color: LEVEL_COLORS[d.name] || '#94a3b8',
              }))}
            />
          )}
        >
          {!hasData(stats.byLevel) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.byLevel}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="40%"
                  outerRadius="70%"
                  paddingAngle={2}
                >
                  {stats.byLevel.map((entry) => (
                    <Cell key={entry.name} fill={LEVEL_COLORS[entry.name] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartShell>

        <ChartShell title="Par catégorie" height="h-56">
          {!hasData(stats.byCategory) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byCategory} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="count" name="Événements" radius={[0, 4, 4, 0]}>
                  {stats.byCategory.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartShell>

        <ChartShell title="Modules / entités" height="h-56">
          {!hasData(stats.byEntity) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byEntity} margin={{ top: 8, right: 8, left: -8, bottom: 28 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={50} interval={0} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="count" name="Événements" fill="#0284c7" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartShell>
      </div>
    </div>
  );
}

/** Graphiques bugs — période = filtre dashboard. */
export function BugsChartsCard({ days = 30, onNavigate }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchBugStats({ days })
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((e) => { if (!cancelled) setError(e.message || 'Erreur bugs'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  if (loading && !stats) {
    return (
      <div className="md:col-span-2 bg-white border border-slate-200 rounded-xl p-6 text-sm text-slate-400 animate-pulse">
        Chargement des graphiques bugs…
      </div>
    );
  }

  if (error) {
    return (
      <div className="md:col-span-2 bg-rose-50 border border-rose-100 rounded-xl p-4 text-sm text-rose-700">
        Bugs : {error}
      </div>
    );
  }

  if (!stats || stats.total === 0) {
    return (
      <div className="md:col-span-2 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Bug size={16} className="text-slate-400" />
          Aucun bug signalé sur les {days} derniers jours.
        </span>
        <LinkBtn onNavigate={onNavigate} page="bugs" />
      </div>
    );
  }

  return (
    <div className="md:col-span-2 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
            <Bug size={16} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Bugs signalés</h2>
            <p className="text-[11px] text-slate-400">
              {stats.total} signalement{stats.total > 1 ? 's' : ''} · {stats.open} ouvert{stats.open > 1 ? 's' : ''} · {days} j
            </p>
          </div>
        </div>
        <LinkBtn onNavigate={onNavigate} page="bugs" label="Gérer" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ChartShell
          title="Par statut"
          height="h-56"
          bodyLayout="row"
          legend={(
            <SideLegend
              items={(stats.byStatut || []).map((d) => ({
                name: d.name,
                value: d.count,
                color: BUG_COLORS[d.id] || CHART_COLORS[0],
              }))}
            />
          )}
        >
          {!hasData(stats.byStatut) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.byStatut}
                  dataKey="count"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius="40%"
                  outerRadius="70%"
                  paddingAngle={2}
                >
                  {stats.byStatut.map((entry) => (
                    <Cell key={entry.id || entry.name} fill={BUG_COLORS[entry.id] || '#94a3b8'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tipStyle} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartShell>

        <ChartShell title="Tendance" height="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.timeline} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tipStyle} />
              <Area type="monotone" dataKey="count" name="Bugs" stroke="#e11d48" fill="#fda4af" fillOpacity={0.75} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartShell>

        <ChartShell title="Par auteur" className="sm:col-span-2" height="h-52">
          {!hasData(stats.byUser) ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.byUser} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={tipStyle} />
                <Bar dataKey="count" name="Signalements" fill="#e11d48" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartShell>
      </div>
    </div>
  );
}


