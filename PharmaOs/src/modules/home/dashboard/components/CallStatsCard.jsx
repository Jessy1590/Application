import React, { useState, useEffect } from 'react';
import { fetchCallLogs } from '../../../calls/services/callService.js';
import { Phone, AlertCircle, AlertTriangle } from 'lucide-react';

export default function CallStatsCard({ onNavigate }) {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    fetchCallLogs().then(setLogs).catch(console.error);
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = logs.filter((l) => l.created_at.startsWith(todayStr)).length;

  const toRecallCount = logs.filter((l) => l.statut_traitement === 'a_rappeler').length;
  const waitingPharma = logs.filter((l) =>
    l.statut_traitement === 'attente_pharmacien' || l.statut_traitement === 'transmis_pharmacien'
  ).length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col h-full">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">
          <Phone size={20} />
        </div>
        <div>
          <h3 className="text-slate-800 font-semibold">Suivi des Appels</h3>
          <p className="text-slate-500 text-xs font-medium">Totaux et actions requises</p>
        </div>
      </div>

      <div className="mb-4 text-center p-3 bg-slate-50 rounded-lg border border-slate-100">
        <span className="text-sm text-slate-500">Appels aujourd&apos;hui : </span>
        <span className="text-xl font-bold text-slate-800">{todayCount}</span>
      </div>

      <div className="grid grid-cols-1 gap-2 flex-grow">
        <button
          type="button"
          onClick={() => onNavigate('calls')}
          className="flex items-center justify-between p-2 rounded-lg hover:bg-rose-50 transition border border-transparent hover:border-rose-100"
        >
          <div className="flex items-center gap-2 text-rose-600 font-medium text-sm">
            <AlertCircle size={16} /> À rappeler
          </div>
          <span className="font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full">{toRecallCount}</span>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('calls')}
          className="flex items-center justify-between p-2 rounded-lg hover:bg-amber-50 transition border border-transparent hover:border-amber-100"
        >
          <div className="flex items-center gap-2 text-amber-600 font-medium text-sm">
            <AlertTriangle size={16} /> Attente pharmacien
          </div>
          <span className="font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">{waitingPharma}</span>
        </button>
      </div>
    </div>
  );
}
