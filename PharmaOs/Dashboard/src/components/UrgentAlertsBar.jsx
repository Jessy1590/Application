import React, { useState, useEffect } from 'react';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import { fetchUrgentAlerts } from '../services/urgentService';

export default function UrgentAlertsBar({ onNavigate }) {
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const load = () => fetchUrgentAlerts().then(setAlerts).catch(() => setAlerts([]));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  if (alerts.length === 0) return null;

  const high = alerts.filter((a) => a.severity === 'high');

  return (
    <div className={`mb-6 rounded-xl border p-4 ${high.length ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
      <p className={`font-semibold flex items-center gap-2 text-sm mb-3 ${high.length ? 'text-red-800' : 'text-amber-800'}`}>
        <AlertTriangle size={18} /> Alertes urgentes ({alerts.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {alerts.map((a, i) => (
          <button
            key={`${a.type}-${i}`}
            type="button"
            onClick={() => onNavigate(a.page, a.params || {})}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              a.severity === 'high' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-amber-600 text-white hover:bg-amber-700'
            }`}
          >
            {a.label} <ChevronRight size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}
