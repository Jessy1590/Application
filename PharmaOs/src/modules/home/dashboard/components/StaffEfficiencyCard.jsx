import React from 'react';
import { Users, TrendingUp } from 'lucide-react';
import { JOB_TITLE_LABELS } from '../../../hr/services/hrService.js';

export default function StaffEfficiencyCard({ insights, onNavigate }) {
  const staff = (insights?.staff || []).slice(0, 8);

  return (
    <div
      className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col h-full cursor-pointer hover:border-indigo-300 transition md:col-span-2"
      onClick={() => onNavigate?.('hr')}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
          <TrendingUp size={20} />
        </div>
        <div>
          <h3 className="text-slate-800 font-semibold">Efficacité équipe (30 j)</h3>
          <p className="text-slate-500 text-xs">Tâches, IP, jours actifs taskbar, retards — clic → RH</p>
        </div>
      </div>

      {!insights ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-[10px] uppercase text-slate-400 border-b">
              <tr>
                <th className="py-2 pr-2">Personne</th>
                <th className="py-2 pr-2">Métier</th>
                <th className="py-2 pr-2 text-right">Tâches ✓</th>
                <th className="py-2 pr-2 text-right">Ouvertes</th>
                <th className="py-2 pr-2 text-right">IP</th>
                <th className="py-2 pr-2 text-right">J. actifs</th>
                <th className="py-2 text-right">Retards</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {staff.length === 0 ? (
                <tr><td colSpan={7} className="py-4 text-slate-500">Aucune donnée.</td></tr>
              ) : staff.map((u) => (
                <tr key={u.id}>
                  <td className="py-2 pr-2 font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      <Users size={12} className="text-slate-400 shrink-0" />
                      {u.name}
                    </span>
                  </td>
                  <td className="py-2 pr-2 text-xs text-slate-500">{JOB_TITLE_LABELS[u.job_title] || u.job_title}</td>
                  <td className="py-2 pr-2 text-right font-semibold text-emerald-700">{u.tasksDone}</td>
                  <td className="py-2 pr-2 text-right text-amber-700">{u.tasksOpen}</td>
                  <td className="py-2 pr-2 text-right">{u.ipCount}</td>
                  <td className="py-2 pr-2 text-right">{u.activeDays}</td>
                  <td className="py-2 text-right text-rose-600">{u.retards || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
