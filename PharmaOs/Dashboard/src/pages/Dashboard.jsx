import React from 'react';
import { LogOut, BookOpen, PhoneCall, Calendar, CheckSquare, Activity } from 'lucide-react';
import { useAuth } from '../core/AuthContext.jsx';
import AdviceStatsCard from '../components/AdviceStatsCard.jsx';
import TaskbarUsageCard from '../components/TaskbarUsageCard.jsx';
import TaskStatsCard from '../components/TaskStatsCard.jsx';
import CallStatsCard from '../components/CallStatsCard.jsx';
import IpStatsCard from '../components/IpStatsCard.jsx';

export default function Dashboard({ onNavigate }) {
  const { user, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-slate-900 text-lg font-semibold">PharmaOS — Dashboard Titulaire</h1>
            <p className="text-slate-500 text-xs">{user?.email}</p>
          </div>
          <button onClick={signOut} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 text-sm transition-colors">
            <LogOut size={14} /> Déconnexion
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        
        {/* BOUTONS RÉDUITS : py-3 au lieu de py-6, gap-2 au lieu de gap-3, icônes w-10 h-10 */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          <button onClick={() => onNavigate('calls')} className="flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 px-4 py-3 rounded-xl hover:bg-emerald-50 hover:border-emerald-200 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform"><PhoneCall size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Appels</span>
          </button>
          
          <button onClick={() => onNavigate('agenda')} className="flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 px-4 py-3 rounded-xl hover:bg-purple-50 hover:border-purple-200 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform"><Calendar size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Agenda</span>
          </button>

          <button onClick={() => onNavigate('tasks')} className="flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 px-4 py-3 rounded-xl hover:bg-orange-50 hover:border-orange-200 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform"><CheckSquare size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Tâches</span>
          </button>

          <button onClick={() => onNavigate('ip')} className="flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 px-4 py-3 rounded-xl hover:bg-sky-50 hover:border-sky-200 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-sky-100 rounded-full flex items-center justify-center text-sky-600 group-hover:scale-110 transition-transform"><Activity size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Act-IP</span>
          </button>

          <button onClick={() => onNavigate('directory')} className="flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 px-4 py-3 rounded-xl hover:bg-blue-50 hover:border-blue-200 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform"><BookOpen size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Annuaire</span>
          </button>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-bold text-slate-800 border-b border-slate-300 pb-2">Vue d'ensemble</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* La carte IP prendra désormais toute la largeur sur grand écran (xl:col-span-3) */}
          <IpStatsCard onNavigate={onNavigate} />
          
          <TaskbarUsageCard />
          <CallStatsCard onNavigate={onNavigate} />
          <TaskStatsCard onNavigate={onNavigate} />
          <AdviceStatsCard />
        </div>
      </main>
    </div>
  );
}