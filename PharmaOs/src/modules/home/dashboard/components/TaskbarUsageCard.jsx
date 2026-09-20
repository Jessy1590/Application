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
import { SideLegend } from './ChartShell.jsx';

const COLORS = ['#0284c7', '#16a34a', '#d97706', '#dc2626', '#7c3aed', '#db2777'];

const formatTime = (totalSeconds) => {
  if (!totalSeconds) return '0s';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-slate-200 shadow-lg rounded-lg">
        <p className="font-semibold text-slate-800 mb-2">{label}</p>
        {payload.map((entry, index) => {
          const data = entry.payload[`${entry.dataKey}_details`];
          if (!data) return null;
          return (
            <div key={index} className="mb-2 text-xs" style={{ color: entry.color }}>
              <span className="font-bold">{entry.name}</span>
              <ul className="ml-2 text-slate-600 mt-1">
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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col gap-4 col-span-full xl:col-span-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center shrink-0">
            <Activity size={16} className="text-sky-600" />
          </div>
          <div>
            <h2 className="text-slate-900 text-sm font-semibold">Utilisation de la barre</h2>
            <p className="text-[11px] text-slate-400">{days} derniers jours</p>
          </div>
        </div>

        {!isLoading && !error && statsData.length > 0 && (
          <button
            type="button"
            onClick={toggleMetric}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md text-xs font-semibold text-slate-700 transition-colors shadow-sm self-start sm:self-auto cursor-pointer flex items-center gap-2"
            title="Cliquez pour changer la donnée affichée sur le graphique"
          >
            Affichage : <span className="text-sky-600">{metricLabels[activeMetric]}</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="h-64 flex items-center justify-center text-slate-400">Chargement des graphiques...</div>
      ) : error ? (
        <div className="h-64 flex items-center justify-center text-red-500">Erreur : {error}</div>
      ) : statsData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-slate-400">Aucune donnée sur cette période</div>
      ) : (
        <div className="h-72 w-full mt-2 flex gap-3 min-h-0">
          <div className="flex-1 min-w-0 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartDataWithFilter} margin={{ top: 5, right: 12, left: -12, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
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
