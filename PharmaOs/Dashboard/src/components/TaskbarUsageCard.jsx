import React, { useEffect, useState, useMemo } from 'react';
import { Activity } from 'lucide-react';
import { fetchTaskbarUsageStats } from '../services/statsService.js';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

const WINDOW_DAYS = 7;
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
          const data = entry.payload[entry.dataKey + '_details'];
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

export default function TaskbarUsageCard() {
  const [statsData, setStatsData] = useState([]);
  const [usersList, setUsersList] = useState([]);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // NOUVEAU : État pour gérer la donnée affichée sur l'axe Y
  const [activeMetric, setActiveMetric] = useState('collapse');

  useEffect(() => {
    let isMounted = true;
    fetchTaskbarUsageStats(WINDOW_DAYS).then(({ chartData, users, error: fetchError }) => {
      if (!isMounted) return;
      if (fetchError) {
        setError(fetchError.message);
      } else {
        setStatsData(chartData);
        setUsersList(users);
      }
      setIsLoading(false);
    });
    return () => { isMounted = false; };
  }, []);

  // NOUVEAU : Fonction qui fait boucler le choix
  const toggleMetric = () => {
    if (activeMetric === 'collapse') setActiveMetric('login');
    else if (activeMetric === 'login') setActiveMetric('expand');
    else setActiveMetric('collapse');
  };

  const metricLabels = {
    collapse: 'Fermetures',
    login: 'Connexions',
    expand: 'Ouvertures'
  };

  // NOUVEAU : On modifie les données envoyées au graphique selon le bouton cliqué
  const chartDataWithFilter = useMemo(() => {
    return statsData.map(day => {
      const newDay = { ...day };
      usersList.forEach(userId => {
        const details = day[userId + '_details'];
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
          <h2 className="text-slate-900 text-sm font-semibold">Utilisation de la barre (7 derniers jours)</h2>
        </div>
        
        {/* NOUVEAU : Le bouton cliquable qui change le texte */}
        {!isLoading && !error && statsData.length > 0 && (
          <button 
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
        <div className="h-72 w-full mt-2">
          <ResponsiveContainer width="100%" height="100%">
            {/* On injecte les données filtrées */}
            <LineChart data={chartDataWithFilter} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              
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
      )}
    </div>
  );
}