import React, { useState, useEffect } from 'react';
import { fetchTasks } from '../services/agendaTaskService';
import { CheckSquare, Clock, Users } from 'lucide-react';

export default function TaskStatsCard({ onNavigate }) {
  const [stats, setStats] = useState({ inProgressByUser: {}, avgTime: 0 });

  useEffect(() => {
    fetchTasks().then(tasks => {
      let inProgress = {};
      let totalSeconds = 0;
      let completedCount = 0;

      tasks.forEach(t => {
        t.task_assignments.forEach(a => {
          if (a.statut === 'en_cours') {
            const name = a.profiles?.display_name || 'Inconnu';
            inProgress[name] = (inProgress[name] || 0) + 1;
          } else if (a.statut === 'terminee' && a.completion_time_seconds) {
            totalSeconds += a.completion_time_seconds;
            completedCount++;
          }
        });
      });

      setStats({
        inProgressByUser: inProgress,
        avgTime: completedCount > 0 ? Math.round(totalSeconds / completedCount / 3600) : 0 // en heures
      });
    });
  }, []);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col h-full cursor-pointer hover:border-orange-300 transition" onClick={() => onNavigate('tasks')}>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center text-orange-600"><CheckSquare size={20} /></div>
        <div>
          <h3 className="text-slate-800 font-semibold">Suivi des Tâches</h3>
          <p className="text-slate-500 text-xs font-medium">Temps moyen : {stats.avgTime}h / tâche</p>
        </div>
      </div>
      <div className="flex-grow space-y-2">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Tâches en cours</h4>
        {Object.entries(stats.inProgressByUser).map(([name, count]) => (
          <div key={name} className="flex justify-between items-center text-sm p-2 bg-slate-50 rounded-md">
            <span className="flex items-center gap-2 text-slate-700"><Users size={14} className="text-slate-400"/> {name}</span>
            <span className="font-bold text-orange-600 bg-orange-100 px-2 py-0.5 rounded-full">{count}</span>
          </div>
        ))}
        {Object.keys(stats.inProgressByUser).length === 0 && <p className="text-sm text-slate-500 italic">Aucune tâche en cours.</p>}
      </div>
    </div>
  );
}