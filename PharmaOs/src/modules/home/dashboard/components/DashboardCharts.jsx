import React from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import {
  Activity,
  Phone,
  CheckSquare,
  ShieldAlert,
  PackageX,
  Scale,
  FlaskConical,
  BookOpen,
  Users,
  BedDouble,
  Wallet,
  ChevronRight,
} from 'lucide-react';
import ChartShell, {
  CHART_COLORS,
  tipStyle,
  EmptyChart,
  SideLegend,
} from './ChartShell.jsx';

function hasData(list) {
  return Array.isArray(list) && list.some((x) => (x.count ?? x.closures ?? 0) > 0);
}

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

function Donut({ data, colors = CHART_COLORS }) {
  if (!hasData(data)) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
        <Pie
          data={data}
          dataKey="count"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius="42%"
          outerRadius="72%"
          paddingAngle={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tipStyle} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function donutLegend(data, colors = CHART_COLORS) {
  return (
    <SideLegend
      colors={colors}
      items={(data || []).map((d, i) => ({
        name: d.name,
        value: d.count,
        color: colors[i % colors.length],
      }))}
    />
  );
}

function HBar({ data, color = '#0284c7' }) {
  if (!hasData(data)) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={tipStyle} />
        <Bar dataKey="count" name="Volume" radius={[0, 4, 4, 0]}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length] || color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function VBar({ data, color = '#0284c7', dataKey = 'count' }) {
  if (!hasData(data)) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 28 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis dataKey="name" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" height={52} interval={0} />
        <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={tipStyle} />
        <Bar dataKey={dataKey} name="Volume" fill={color} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const TIMELINE_SERIES = [
  { key: 'calls', name: 'Appels', stroke: '#059669', fill: '#6ee7b7' },
  { key: 'ip', name: 'IP', stroke: '#0284c7', fill: '#7dd3fc' },
  { key: 'tasks', name: 'Tâches', stroke: '#ea580c', fill: '#fdba74' },
  { key: 'quality', name: 'Qualité', stroke: '#e11d48', fill: '#fda4af' },
  { key: 'magistral', name: 'Magistrales', stroke: '#c026d3', fill: '#f0abfc' },
  { key: 'conseil', name: 'Conseil', stroke: '#7c3aed', fill: '#c4b5fd' },
];

/* ——— Widgets graphiques ——— */

export function OverviewKpisCard({ charts, onNavigate }) {
  const k = charts?.kpis;
  if (!k) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse h-28 md:col-span-2 xl:col-span-3" />
    );
  }

  const items = [
    { label: 'Événements', value: k.totalEvents, hint: `${k.days} j`, page: null, color: 'slate' },
    { label: 'Appels à traiter', value: k.callsAction, hint: `${k.calls} total`, page: 'calls', color: 'emerald' },
    { label: 'IP en attente', value: k.ipPending, hint: `${k.ip} total`, page: 'ip', color: 'sky' },
    { label: 'Tâches ouvertes', value: k.tasksOpen, hint: k.avgTaskMin != null ? `moy. ${k.avgTaskMin} min` : null, page: 'tasks', color: 'orange' },
    { label: 'Qualité ouverts', value: k.openQuality, hint: `${k.quality} total`, page: 'quality', color: 'rose' },
    { label: 'Stock ouverts', value: k.openStock, hint: `${k.stock} total`, page: 'stock', color: 'violet' },
    { label: 'Litiges ouverts', value: k.openDisputes, hint: `${k.disputes} total`, page: 'disputes', color: 'amber' },
    { label: 'Conseil accept.', value: k.conseilTaux != null ? `${k.conseilTaux}%` : '—', hint: `${k.conseil} événements`, page: 'conseil', color: 'fuchsia' },
  ];

  const colorMap = {
    slate: 'bg-slate-50 text-slate-800 border-slate-100',
    emerald: 'bg-emerald-50 text-emerald-900 border-emerald-100',
    sky: 'bg-sky-50 text-sky-900 border-sky-100',
    orange: 'bg-orange-50 text-orange-900 border-orange-100',
    rose: 'bg-rose-50 text-rose-900 border-rose-100',
    violet: 'bg-violet-50 text-violet-900 border-violet-100',
    amber: 'bg-amber-50 text-amber-900 border-amber-100',
    fuchsia: 'bg-fuchsia-50 text-fuchsia-900 border-fuchsia-100',
  };

  return (
    <div className="md:col-span-2 xl:col-span-3 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          disabled={!it.page || !onNavigate}
          onClick={() => it.page && onNavigate?.(it.page)}
          className={`text-left rounded-xl border p-3 transition ${colorMap[it.color]} ${
            it.page ? 'hover:shadow-sm cursor-pointer' : 'cursor-default'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wide opacity-70">{it.label}</div>
          <div className="text-xl font-bold mt-0.5">{it.value}</div>
          {it.hint && <div className="text-[10px] opacity-60 mt-0.5 truncate">{it.hint}</div>}
        </button>
      ))}
    </div>
  );
}

export function ActivityTimelineCard({ charts }) {
  const data = charts?.timeline || [];
  const empty = !data.some(
    (d) => d.calls + d.ip + d.tasks + d.quality + d.stock + d.disputes + d.magistral + d.conseil > 0,
  );

  return (
    <ChartShell
      title="Tendance multi-modules"
      subtitle={`Volume quotidien (${charts?.days || 30} j)`}
      className="md:col-span-2"
      height="h-72"
      bodyLayout="row"
      legend={(
        <SideLegend
          items={TIMELINE_SERIES.map((s) => ({ name: s.name, color: s.stroke }))}
        />
      )}
    >
      {empty ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={tipStyle} />
            {TIMELINE_SERIES.map((s) => (
              <Area
                key={s.key}
                type="monotone"
                dataKey={s.key}
                name={s.name}
                stackId="1"
                stroke={s.stroke}
                fill={s.fill}
                fillOpacity={0.7}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

export function ModuleCompareCard({ charts, onNavigate }) {
  const data = charts?.moduleCompare || [];
  return (
    <ChartShell title="Volumes par module" subtitle="Comparaison sur la période" height="h-72">
      {!hasData(data) ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 12, left: 4, bottom: 0 }}
            onClick={(state) => {
              const m = state?.activePayload?.[0]?.payload?.module;
              if (m && onNavigate) {
                const page = m === 'magistral' ? 'magistral_suivi' : m === 'location' ? 'location_suivi' : m;
                onNavigate(page);
              }
            }}
            className="cursor-pointer"
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={tipStyle} />
            <Bar dataKey="count" name="Événements" radius={[0, 4, 4, 0]}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

export function CallsChartsCard({ charts, onNavigate }) {
  const c = charts?.calls;
  return (
    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
      <ChartShell title="Appels — motifs" action={<LinkBtn onNavigate={onNavigate} page="calls" />} height="h-56">
        <HBar data={c?.byMotif} />
      </ChartShell>
      <ChartShell
        title="Appels — statuts"
        height="h-56"
        bodyLayout="row"
        legend={donutLegend(c?.byStatut)}
      >
        <Donut data={c?.byStatut} />
      </ChartShell>
      <ChartShell
        title="Appels — type"
        height="h-56"
        bodyLayout="row"
        legend={donutLegend(c?.byType, ['#059669', '#0284c7'])}
      >
        <Donut data={c?.byType} colors={['#059669', '#0284c7']} />
      </ChartShell>
    </div>
  );
}

export function TasksChartsCard({ charts, onNavigate }) {
  const t = charts?.tasks;
  return (
    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <ChartShell
        title="Tâches — répartition"
        subtitle={t?.avgTaskMin != null ? `Temps moyen : ${t.avgTaskMin} min` : undefined}
        action={<LinkBtn onNavigate={onNavigate} page="tasks" />}
        height="h-56"
        bodyLayout="row"
        legend={donutLegend(t?.byStatut, ['#16a34a', '#ea580c'])}
      >
        <Donut data={t?.byStatut} colors={['#16a34a', '#ea580c']} />
      </ChartShell>
      <ChartShell title="Tâches — volume journalier" height="h-56">
        {!charts?.timeline?.length ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={charts.timeline} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tipStyle} />
              <Line type="monotone" dataKey="tasks" name="Assignations" stroke="#ea580c" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartShell>
    </div>
  );
}

export function IpChartsCard({ charts, onNavigate }) {
  const ip = charts?.ip;
  return (
    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <ChartShell
        title="Act-IP — statuts"
        action={<LinkBtn onNavigate={onNavigate} page="ip" />}
        height="h-56"
        bodyLayout="row"
        legend={donutLegend(ip?.byStatut)}
      >
        <Donut data={ip?.byStatut} />
      </ChartShell>
      <ChartShell title="Act-IP — problèmes fréquents" height="h-56">
        <HBar data={ip?.byProblem} />
      </ChartShell>
    </div>
  );
}

export function QualityChartsCard({ charts, onNavigate }) {
  const q = charts?.quality;
  return (
    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
      <ChartShell
        title="Qualité — types"
        action={<LinkBtn onNavigate={onNavigate} page="quality" />}
        height="h-56"
        bodyLayout="row"
        legend={donutLegend(q?.byType)}
      >
        <Donut data={q?.byType} />
      </ChartShell>
      <ChartShell
        title="Qualité — sévérité"
        height="h-56"
        bodyLayout="row"
        legend={donutLegend(q?.bySeverity, ['#94a3b8', '#d97706', '#dc2626'])}
      >
        <Donut data={q?.bySeverity} colors={['#94a3b8', '#d97706', '#dc2626']} />
      </ChartShell>
      <ChartShell title="Qualité — statuts" height="h-56">
        <VBar data={q?.byStatus} color="#e11d48" />
      </ChartShell>
    </div>
  );
}

export function StockChartsCard({ charts, onNavigate }) {
  const s = charts?.stock;
  return (
    <div className="grid grid-cols-1 gap-3">
      <ChartShell
        title="Erreurs stock — top médicaments"
        action={<LinkBtn onNavigate={onNavigate} page="stock" />}
        height="h-56"
      >
        <HBar data={s?.byMed} />
      </ChartShell>
      <ChartShell
        title="Erreurs stock — statut"
        height="h-52"
        bodyLayout="row"
        legend={donutLegend(s?.byStatus)}
      >
        <Donut data={s?.byStatus} />
      </ChartShell>
    </div>
  );
}

export function DisputesChartsCard({ charts, onNavigate }) {
  const d = charts?.disputes;
  return (
    <div className="grid grid-cols-1 gap-3">
      <ChartShell
        title="Litiges — types"
        action={<LinkBtn onNavigate={onNavigate} page="disputes" />}
        height="h-56"
        bodyLayout="row"
        legend={donutLegend(d?.byType)}
      >
        <Donut data={d?.byType} />
      </ChartShell>
      <ChartShell title="Litiges — statuts" height="h-52">
        <VBar data={d?.byStatut} color="#d97706" />
      </ChartShell>
    </div>
  );
}

export function MagistralChartsCard({ charts, onNavigate }) {
  const m = charts?.magistral;
  return (
    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <ChartShell
        title="Magistrales — par statut"
        action={<LinkBtn onNavigate={onNavigate} page="magistral_suivi" />}
        height="h-64"
      >
        <HBar data={m?.byStatut} />
      </ChartShell>
      <ChartShell title="Magistrales — tendance" height="h-64">
        {!charts?.timeline?.length ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={charts.timeline} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tipStyle} />
              <Area type="monotone" dataKey="magistral" name="Créations" stroke="#c026d3" fill="#f0abfc" fillOpacity={0.75} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartShell>
    </div>
  );
}

export function ConseilChartsCard({ charts, onNavigate }) {
  const c = charts?.conseil;
  const colors = ['#16a34a', '#dc2626', '#94a3b8'];
  return (
    <ChartShell
      title="Conseil — acceptation"
      subtitle={c?.taux != null ? `Taux d’acceptation : ${c.taux}%` : undefined}
      action={<LinkBtn onNavigate={onNavigate} page="conseil" />}
      height="h-64"
      bodyLayout="row"
      legend={donutLegend(c?.byStatus, colors)}
    >
      <Donut data={c?.byStatus} colors={colors} />
    </ChartShell>
  );
}

export function HrChartsCard({ charts, onNavigate }) {
  const hr = charts?.hr;
  return (
    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <ChartShell
        title="RH — types d’événements"
        action={<LinkBtn onNavigate={onNavigate} page="hr" />}
        height="h-56"
        bodyLayout="row"
        legend={donutLegend(hr?.byType)}
      >
        <Donut data={hr?.byType} />
      </ChartShell>
      <ChartShell title="RH — volume journalier" height="h-56">
        {!charts?.timeline?.length ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={charts.timeline} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tipStyle} />
              <Bar dataKey="hr" name="RH" fill="#4f46e5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartShell>
    </div>
  );
}

export function LocationChartsCard({ charts, onNavigate }) {
  const loc = charts?.location;
  return (
    <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
      <ChartShell
        title="Location — dossiers par statut"
        action={<LinkBtn onNavigate={onNavigate} page="location_suivi" />}
        height="h-64"
      >
        <HBar data={loc?.byStatut} />
      </ChartShell>
      <ChartShell title="Location — créations" height="h-64">
        {!charts?.timeline?.length ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={charts.timeline} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis allowDecimals={false} tick={{ fontSize: 10 }} />
              <Tooltip contentStyle={tipStyle} />
              <Area type="monotone" dataKey="location" name="Dossiers" stroke="#0891b2" fill="#67e8f9" fillOpacity={0.75} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartShell>
    </div>
  );
}

export function CashChartsCard({ charts, onNavigate }) {
  const data = charts?.cash?.timeline || [];
  return (
    <ChartShell
      title="Caisse — clôtures & écarts"
      subtitle="Somme des écarts fond réel − logiciel"
      action={<LinkBtn onNavigate={onNavigate} page="cash" />}
      height="h-64"
      bodyLayout="row"
      legend={(
        <SideLegend
          items={[
            { name: 'Clôtures', color: '#059669' },
            { name: 'Écart (€)', color: '#dc2626' },
          ]}
        />
      )}
    >
      {!data.length ? (
        <EmptyChart />
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip contentStyle={tipStyle} />
            <Line type="monotone" dataKey="closures" name="Clôtures" stroke="#059669" strokeWidth={2} />
            <Line type="monotone" dataKey="ecart" name="Écart (€)" stroke="#dc2626" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartShell>
  );
}

export const CHART_WIDGET_ICONS = {
  overview_kpis: Activity,
  activity_timeline: Activity,
  module_compare: Activity,
  calls_charts: Phone,
  tasks_charts: CheckSquare,
  ip_charts: Activity,
  quality_charts: ShieldAlert,
  stock_charts: PackageX,
  disputes_charts: Scale,
  magistral_charts: FlaskConical,
  conseil_charts: BookOpen,
  hr_charts: Users,
  location_charts: BedDouble,
  cash_charts: Wallet,
};
