import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

const LEVEL_COLORS = {
  debug: '#94a3b8',
  info: '#64748b',
  warn: '#d97706',
  error: '#dc2626',
};

const CAT_COLORS = ['#0284c7', '#16a34a', '#d97706', '#7c3aed', '#db2777', '#0d9488', '#ea580c', '#4f46e5'];
const PIE_COLORS = ['#16a34a', '#dc2626', '#d97706', '#64748b'];

const tipStyle = {
  background: '#fff',
  border: '1px solid #e2e8f0',
  borderRadius: 8,
  fontSize: 12,
};

function ChartCard({ title, subtitle, children, className = '' }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl p-4 ${className}`}>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {subtitle ? <p className="text-xs text-slate-500 mb-2">{subtitle}</p> : <div className="mb-2" />}
      <div className="h-52">{children}</div>
    </div>
  );
}

export default function LogsCharts({ stats, loading }) {
  if (loading && !stats) {
    return <p className="text-sm text-slate-500 mb-4">Chargement des graphiques…</p>;
  }
  if (!stats || stats.total === 0) {
    return (
      <div className="mb-4 p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-500">
        Aucune donnée pour les graphiques sur cette période.
      </div>
    );
  }

  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-baseline gap-3">
        <p className="text-sm text-slate-600">
          Synthèse : <span className="font-semibold text-slate-800">{stats.total}</span> événement(s)
          {stats.total >= 5000 ? ' (échantillon max. 5000)' : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="Tendance temporelle" subtitle="Volume et niveaux (info / warn / erreur)">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={stats.timeline} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" dataKey="info" name="Info" stackId="1" stroke="#64748b" fill="#cbd5e1" fillOpacity={0.7} />
              <Area type="monotone" dataKey="warn" name="Warn" stackId="1" stroke="#d97706" fill="#fcd34d" fillOpacity={0.7} />
              <Area type="monotone" dataKey="error" name="Erreur" stackId="1" stroke="#dc2626" fill="#fca5a5" fillOpacity={0.8} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Par catégorie" subtitle="Volumes client + trigger">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.byCategory} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tipStyle} />
              <Bar dataKey="count" name="Événements" radius={[0, 4, 4, 0]}>
                {stats.byCategory.map((_, i) => (
                  <Cell key={i} fill={CAT_COLORS[i % CAT_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Niveaux" subtitle="Répartition debug / info / warn / erreur">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={stats.byLevel}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={42}
                outerRadius={72}
                paddingAngle={2}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {stats.byLevel.map((entry) => (
                  <Cell key={entry.name} fill={LEVEL_COLORS[entry.name] || '#94a3b8'} />
                ))}
              </Pie>
              <Tooltip contentStyle={tipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Modules / entités" subtitle="Top tables ou domaines (entité)">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.byEntity} margin={{ top: 8, right: 12, left: -8, bottom: 28 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={50} interval={0} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tipStyle} />
              <Bar dataKey="count" name="Événements" fill="#0284c7" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {stats.successVsError?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stats.successVsError.map((s, i) => (
            <span
              key={s.name}
              className="text-xs font-medium px-2.5 py-1 rounded-lg border border-slate-200 bg-white"
              style={{ color: PIE_COLORS[i % PIE_COLORS.length] }}
            >
              {s.name} : {s.count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
