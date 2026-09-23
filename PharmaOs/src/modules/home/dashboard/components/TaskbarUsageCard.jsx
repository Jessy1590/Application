import React, { useEffect, useState, useMemo } from 'react';
import { Activity } from 'lucide-react';
import { fetchTaskbarUsageStats } from '../../services/statsService.js';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { SideLegend, CHART_COLORS, gridStroke, tickFill } from './ChartShell.jsx';

const COLORS = CHART_COLORS;

const formatTime = (totalSeconds) => {
  if (!totalSeconds) return '0s';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[var(--surface-elevated)] p-3 border border-[var(--border)] shadow-lg rounded-lg">
        <p className="font-semibold text-[var(--fg)] mb-2">{label}</p>
        {payload.map((entry, index) => {
          const data = entry.payload[`${entry.dataKey}_details`];
          if (!data) return null;
          return (
            <div key={index} className="mb-2 text-xs" style={{ color: entry.color }}>
              <span className="font-bold">{entry.name}</span>
              <ul className="ml-2 text-[var(--muted)] mt-1">
                <li>Connexions (Login) : {data.loginCount}</li>
                <li>Ouvertures (Expand) : {data.expandCount}</li>
                <li>Fermetures (Collapse) : {data.collapseCount}</li>
                <li className="mt-1">Temps moy. ouvert : {formatTime(data.avgExpandSec)}</li>
                <li>Temps moy. fermé : {formatTime(data.avgCollapseSec)}</li>
              </ul>
            </div>
          );
        })}
      </div>
    );
  }
  return null;
};

export default function TaskbarUsageCard({ days = 30 }) {
  const [statsData, setStatsData] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeMetric, setActiveMetric] = useState('collapse');

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    setError(null);
    fetchTaskbarUsageStats(days).then(({ chartData, users, error: fetchError }) => {
      if (!isMounted) return;
      if (fetchError) {
        setError(fetchError.message);
        setStatsData([]);
        setUsersList([]);
      } else {
        setStatsData(chartData);
        setUsersList(users);
      }
      setIsLoading(false);
    });
    return () => { isMounted = false; };
  }, [days]);

  const toggleMetric = () => {
    if (activeMetric === 'collapse') setActiveMetric('login');
    else if (activeMetric === 'login') setActiveMetric('expand');
    else setActiveMetric('collapse');
  };

  const metricLabels = {
    collapse: 'Fermetures',
    login: 'Connexions',
    expand: 'Ouvertures',
  };

  const chartDataWithFilter = useMemo(() => {
    return statsData.map((day) => {
      const newDay = { ...day };
      usersList.forEach((userId) => {
        const details = day[`${userId}_details`];
        if (details) {
          if (activeMetric === 'collapse') newDay[userId] = details.collapseCount;
          else if (activeMetric === 'login') newDay[userId] = details.loginCount;
          else if (activeMetric === 'expand') newDay[userId] = details.expandCount;
        } else {
          newDay[userId] = 0;
        }
      });
      return newDay;
    });
  }, [statsData, activeMetric, usersList]);

  return (
    <div className="bg-[var(--surface-elevated)] rounded-xl shadow-sm border border-[var(--border)] p-5 flex flex-col gap-4 col-span-full xl:col-span-2 min-w-0 overflow-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--input-bg)] flex items-center justify-center shrink-0">
            <Activity size={16} className="text-[var(--accent)]" />
          </div>
          <div>
            <h2 className="text-[var(--fg)] text-sm font-semibold">Utilisation de la barre</h2>
            <p className="text-[11px] text-[var(--muted)]">{days} derniers jours</p>
          </div>
        </div>

        {!isLoading && !error && statsData.length > 0 && (
          <button
            type="button"
            onClick={toggleMetric}
            className="px-3 py-1.5 bg-[var(--input-bg)] hover:opacity-90 border border-[var(--border)] rounded-md text-xs font-semibold text-[var(--fg)] transition-colors shadow-sm self-start sm:self-auto cursor-pointer flex items-center gap-2"
            title="Cliquez pour changer la donnée affichée sur le graphique"
          >
            Affichage : <span className="text-[var(--accent)]">{metricLabels[activeMetric]}</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="min-h-[16rem] h-64 flex items-center justify-center text-[var(--muted)]">Chargement des graphiques...</div>
      ) : error ? (
        <div className="min-h-[16rem] h-64 flex items-center justify-center text-[var(--danger)]">Erreur : {error}</div>
      ) : statsData.length === 0 ? (
        <div className="min-h-[16rem] h-64 flex items-center justify-center text-[var(--muted)]">Aucune donnée sur cette période</div>
      ) : (
        <div className="h-72 w-full mt-2 flex gap-3 min-h-[16rem]">
          <div className="flex-1 min-w-0 h-full relative">
            <ResponsiveContainer width="100%" height="100%" minHeight={200}>
              <LineChart data={chartDataWithFilter} margin={{ top: 5, right: 12, left: -12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: tickFill }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: tickFill }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                {usersList.map((userId, index) => (
                  <Line
                    key={userId}
                    type="monotone"
                    dataKey={userId}
                    name={userId}
                    stroke={COLORS[index % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 4, strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="shrink-0 w-[7.5rem] sm:w-40 self-stretch overflow-y-auto flex flex-col justify-center">
            <SideLegend
              items={usersList.map((userId, index) => ({
                name: userId,
                color: COLORS[index % COLORS.length],
              }))}
            />
          </div>
        </div>
      )}
    </div>
  );
}

