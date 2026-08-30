import React from 'react';
import { LogOut, BookOpen, PhoneCall, Calendar, CheckSquare, Activity, ShieldAlert, ClipboardCheck, FileText, AlertOctagon, Package, PackageX, BedDouble, Scale, FlaskConical, Droplets, Wallet, Users } from 'lucide-react';
import { useAuth } from '../core/AuthContext.jsx';
import AdviceStatsCard from '../components/AdviceStatsCard.jsx';
import TaskbarUsageCard from '../components/TaskbarUsageCard.jsx';
import TaskStatsCard from '../components/TaskStatsCard.jsx';
import CallStatsCard from '../components/CallStatsCard.jsx';
import IpStatsCard from '../components/IpStatsCard.jsx';
import QualityStatsCard from '../components/QualityStatsCard.jsx';

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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
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

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          <button onClick={() => onNavigate('quality')} className="flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 px-4 py-3 rounded-xl hover:bg-rose-50 hover:border-rose-200 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center text-rose-600 group-hover:scale-110 transition-transform"><ShieldAlert size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Qualité</span>
          </button>

          <button onClick={() => onNavigate('controls')} className="flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 px-4 py-3 rounded-xl hover:bg-teal-50 hover:border-teal-200 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600 group-hover:scale-110 transition-transform"><ClipboardCheck size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Contrôles</span>
          </button>

          <button onClick={() => onNavigate('documents')} className="flex flex-col items-center justify-center gap-2 bg-white border border-slate-200 px-4 py-3 rounded-xl hover:bg-indigo-50 hover:border-indigo-200 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform"><FileText size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">GED</span>
          </button>

          <button onClick={() => onNavigate('retrait_lot')} className="flex flex-col items-center justify-center gap-2 bg-white border border-red-200 px-4 py-3 rounded-xl hover:bg-red-50 hover:border-red-300 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center text-red-600 group-hover:scale-110 transition-transform"><AlertOctagon size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Retrait lot</span>
          </button>

          <button onClick={() => onNavigate('perimes')} className="flex flex-col items-center justify-center gap-2 bg-white border border-orange-200 px-4 py-3 rounded-xl hover:bg-orange-50 hover:border-orange-300 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600 group-hover:scale-110 transition-transform"><Package size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Périmés</span>
          </button>

          <button onClick={() => onNavigate('stock')} className="flex flex-col items-center justify-center gap-2 bg-white border border-violet-200 px-4 py-3 rounded-xl hover:bg-violet-50 hover:border-violet-300 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-violet-100 rounded-full flex items-center justify-center text-violet-600 group-hover:scale-110 transition-transform"><PackageX size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Stock</span>
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-10">
          <button onClick={() => onNavigate('rental')} className="flex flex-col items-center justify-center gap-2 bg-white border border-cyan-200 px-4 py-3 rounded-xl hover:bg-cyan-50 hover:border-cyan-300 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-cyan-100 rounded-full flex items-center justify-center text-cyan-600 group-hover:scale-110 transition-transform"><BedDouble size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Location</span>
          </button>
          <button onClick={() => onNavigate('magistral')} className="flex flex-col items-center justify-center gap-2 bg-white border border-fuchsia-200 px-4 py-3 rounded-xl hover:bg-fuchsia-50 hover:border-fuchsia-300 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-fuchsia-100 rounded-full flex items-center justify-center text-fuchsia-600 group-hover:scale-110 transition-transform"><FlaskConical size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Magistrales</span>
          </button>
          <button onClick={() => onNavigate('psl')} className="flex flex-col items-center justify-center gap-2 bg-white border border-rose-200 px-4 py-3 rounded-xl hover:bg-rose-50 hover:border-rose-300 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center text-rose-600 group-hover:scale-110 transition-transform"><Droplets size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">PSL</span>
          </button>
          <button onClick={() => onNavigate('cash')} className="flex flex-col items-center justify-center gap-2 bg-white border border-emerald-200 px-4 py-3 rounded-xl hover:bg-emerald-50 hover:border-emerald-300 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform"><Wallet size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Caisse</span>
          </button>
          <button onClick={() => onNavigate('disputes')} className="flex flex-col items-center justify-center gap-2 bg-white border border-amber-200 px-4 py-3 rounded-xl hover:bg-amber-50 hover:border-amber-300 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform"><Scale size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">Litiges</span>
          </button>
          <button onClick={() => onNavigate('hr')} className="flex flex-col items-center justify-center gap-2 bg-white border border-indigo-200 px-4 py-3 rounded-xl hover:bg-indigo-50 hover:border-indigo-300 shadow-sm transition-all group">
            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform"><Users size={20} /></div>
            <span className="font-semibold text-slate-700 text-sm">RH</span>
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
          <QualityStatsCard onNavigate={onNavigate} />
          <AdviceStatsCard />
        </div>
      </main>
    </div>
  );
}