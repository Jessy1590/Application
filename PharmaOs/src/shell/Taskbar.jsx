import React, { useState, useEffect, useRef } from 'react';
import {
  Phone, BookOpen, ChevronUp, ChevronDown, CheckSquare, ShoppingBag, FileText,
  ShieldAlert, BookMarked, Package, PackageX, BedDouble, Scale,
  AlertOctagon, FlaskConical, Droplets, Wallet, LayoutDashboard, Sparkles,
} from 'lucide-react';
import { useAuth } from '../core/AuthContext.jsx';
import { supabase } from '../shared/supabaseClient.js';
import {
  expandWindow, reduceWindow, openModuleWindow, openDashboardWindow,
} from '../shared/windowService.js';
import { logTaskbarToggle } from '../shared/dbServices.js';

function TbBtn({ title, onClick, className = '', children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`p-1.5 rounded hover:bg-slate-700/70 transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

function SectionSep({ label }) {
  return (
    <div className="flex items-center gap-1 mx-0.5" title={label}>
      <div className="h-4 w-px bg-slate-600" />
      <span className="text-[9px] uppercase tracking-wide text-slate-500 hidden xl:inline">{label}</span>
    </div>
  );
}

export default function Taskbar() {
  const { user, profile, role, signOut } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const initLogged = useRef(false);

  useEffect(() => {
    if (user?.id && !initLogged.current) {
      initLogged.current = true;
      logTaskbarToggle(user.id, 'login');
      logTaskbarToggle(user.id, 'expand');
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const fetchPendingTasksCount = async () => {
      const { data, error } = await supabase
        .schema('PharmaOs')
        .from('task_assignments')
        .select('id, tasks(description)')
        .eq('user_id', user.id)
        .eq('statut', 'en_cours');

      if (!error && data) {
        const today = new Date().toISOString().split('T')[0];
        const count = data.filter((assignment) => {
          let taskDate = null;
          try {
            const parsed = JSON.parse(assignment.tasks?.description);
            taskDate = parsed.date;
          } catch { /* ignore */ }
          if (!taskDate) return true;
          return taskDate <= today;
        }).length;
        setPendingCount(count);
      }
    };

    fetchPendingTasksCount();
    const subscription = supabase
      .channel('task_assignments_changes')
      .on('postgres_changes', {
        event: '*', schema: 'PharmaOs', table: 'task_assignments', filter: `user_id=eq.${user.id}`,
      }, () => { fetchPendingTasksCount(); })
      .subscribe();

    return () => { supabase.removeChannel(subscription); };
  }, [user?.id]);

  const handleCollapse = async () => {
    setIsCollapsed(true);
    await reduceWindow();
    if (user?.id) logTaskbarToggle(user.id, 'collapse');
  };

  const handleExpand = async () => {
    setIsCollapsed(false);
    await expandWindow();
    if (user?.id) logTaskbarToggle(user.id, 'expand');
  };

  const getInitials = (name) => {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  const open = (view) => () => openModuleWindow(view);

  if (isCollapsed) {
    return (
      <div className="w-full h-full flex items-center justify-center" style={{ background: 'transparent' }}>
        <button
          type="button"
          title="Afficher la barre d'outils PharmaOS"
          aria-label="Afficher la barre d'outils"
          onClick={handleExpand}
          className="h-full w-full flex items-center justify-center rounded-b-lg bg-slate-900/95 text-slate-300 hover:text-white transition-colors shadow"
        >
          <ChevronDown size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-between px-2 bg-slate-900/90 text-white">
      <div className="flex items-center gap-0.5 min-w-0 overflow-x-auto">
        <SectionSep label="Tâches" />
        <TbBtn title="Mes tâches du jour" onClick={open('tasks')} className="relative text-amber-300">
          <CheckSquare size={18} />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow">
              {pendingCount}
            </span>
          )}
        </TbBtn>
        <TbBtn title="Commander un médicament" onClick={open('order')} className="text-emerald-400"><ShoppingBag size={18} /></TbBtn>
        <TbBtn title="Facturation à effectuer" onClick={open('billing')} className="text-sky-300"><FileText size={18} /></TbBtn>

        <SectionSep label="Communication" />
        <TbBtn title="Annuaire des contacts" onClick={open('directory')} className="text-sky-400"><BookOpen size={18} /></TbBtn>
        <TbBtn title="Tracer un appel téléphonique" onClick={open('call')}><Phone size={18} /></TbBtn>
        <TbBtn title="Interventions pharmaceutiques (Act-IP)" onClick={open('ip')} className="!px-1.5 !py-0.5 bg-indigo-100 text-indigo-700 font-black text-xs hover:bg-indigo-200">IP</TbBtn>

        <SectionSep label="Qualité" />
        <TbBtn title="Procédures / documents" onClick={open('documents')} className="text-blue-300"><BookMarked size={18} /></TbBtn>
        <TbBtn title="Non-conformités qualité" onClick={open('quality')} className="text-rose-400"><ShieldAlert size={18} /></TbBtn>
        <TbBtn title="Alertes retrait de lot" onClick={open('lot_alerts')} className="text-red-400"><AlertOctagon size={18} /></TbBtn>

        <SectionSep label="Stock" />
        <TbBtn title="Gestion des périmés" onClick={open('perimes')} className="text-orange-400"><Package size={18} /></TbBtn>
        <TbBtn title="Mises en avant / promo / challenges du jour" onClick={open('perimes_vitrine')} className="text-amber-300"><Sparkles size={18} /></TbBtn>
        <TbBtn title="Déclarer une erreur de stock" onClick={open('stock')} className="text-violet-400"><PackageX size={18} /></TbBtn>
        <TbBtn title="Litiges fournisseurs" onClick={open('disputes')} className="text-amber-300"><Scale size={18} /></TbBtn>

        <SectionSep label="Métier" />
        <TbBtn title="Location de matériel" onClick={open('rental')} className="text-cyan-300"><BedDouble size={18} /></TbBtn>
        <TbBtn title="Préparations magistrales" onClick={open('magistral')} className="text-fuchsia-300"><FlaskConical size={18} /></TbBtn>
        <TbBtn title="Registre MDS (dérivés du sang)" onClick={open('psl')} className="text-rose-300"><Droplets size={18} /></TbBtn>
        <TbBtn title="Clôture de caisse" onClick={open('cash')} className="text-emerald-300"><Wallet size={18} /></TbBtn>
      </div>

      <div className="flex items-center gap-2 shrink-0 pl-2">
        <span className="text-xs text-slate-300 truncate max-w-[160px] hidden lg:inline" title="Conseil du jour">
          Conseil : proposez un produit associé.
        </span>
        {role === 'admin' && (
          <TbBtn
            title="Ouvrir le Dashboard titulaire"
            onClick={() => openDashboardWindow()}
            className="text-sky-300"
          >
            <LayoutDashboard size={18} />
          </TbBtn>
        )}
        <button
          type="button"
          title={`Se déconnecter (${profile?.display_name || 'utilisateur'})`}
          aria-label="Se déconnecter"
          onClick={signOut}
          className="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-xs font-bold hover:bg-red-500 transition-colors"
        >
          {getInitials(profile?.display_name)}
        </button>
        <button
          type="button"
          title="Réduire la barre"
          aria-label="Réduire la barre"
          onClick={handleCollapse}
          className="p-1.5 rounded hover:bg-slate-700/70 transition-colors"
        >
          <ChevronUp size={16} />
        </button>
      </div>
    </div>
  );
}
