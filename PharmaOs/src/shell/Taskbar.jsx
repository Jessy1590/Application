import React, { useState, useEffect, useRef } from 'react';
import {
  Phone, BookOpen, ChevronUp, ChevronDown, CheckSquare, ShoppingBag, FileText,
  ShieldAlert, BookMarked, Package, PackageX, BedDouble, Scale,
  AlertOctagon, FlaskConical, Droplets, Wallet, LayoutDashboard, Sparkles, Bug,
  Users, Plus, X, Pill, ClipboardCheck, RefreshCw, Lock, ArrowDownToLine, Inbox, UserCog,
} from 'lucide-react';
import { useAuth } from '../core/AuthContext.jsx';
import { countTodayPendingAssignments } from '../modules/tasks/services/taskService.js';
import {
  expandWindow, reduceWindow, openModuleWindow, openDashboardWindow, openBugWindow,
} from '../shared/windowService.js';
import { logTaskbarToggle } from '../shared/dbServices.js';
import { setLogSurface } from '../shared/logService.js';
import { supabase } from '../shared/supabaseClient.js';
import ConseilPanel from '../modules/conseil/comptoir/ConseilPanel.jsx';

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
  const { user, profile, signOut, canAccess, canDashboard } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const initLogged = useRef(false);

  useEffect(() => {
    setLogSurface('taskbar');
  }, []);

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
      const count = await countTodayPendingAssignments(user.id);
      setPendingCount(count);
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

  const open = (view, featureId = view) => () => {
    if (!canAccess('taskbar', featureId)) return;
    openModuleWindow(view);
  };

  const show = (featureId) => canAccess('taskbar', featureId);

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
        {(show('inbox') || show('tasks') || show('order') || show('billing')) && <SectionSep label="Tâches" />}
        {show('inbox') && (
          <TbBtn title="À traiter & mes saisies" onClick={open('inbox')} className="relative text-indigo-300">
            <Inbox size={18} />
          </TbBtn>
        )}
        {show('tasks') && (
          <TbBtn title="Mes tâches du jour" onClick={open('tasks')} className="relative text-amber-300">
            <CheckSquare size={18} />
            {pendingCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow">
                {pendingCount}
              </span>
            )}
          </TbBtn>
        )}
        {show('order') && (
          <TbBtn title="Commander un médicament" onClick={open('order')} className="text-emerald-400"><ShoppingBag size={18} /></TbBtn>
        )}
        {show('billing') && (
          <TbBtn title="Facturation à effectuer" onClick={open('billing')} className="text-sky-300"><FileText size={18} /></TbBtn>
        )}

        {(show('directory') || show('call') || show('ip')) && <SectionSep label="Communication" />}
        {show('directory') && (
          <TbBtn title="Annuaire des contacts" onClick={open('directory')} className="text-sky-400"><BookOpen size={18} /></TbBtn>
        )}
        {show('call') && (
          <TbBtn title="Tracer un appel téléphonique" onClick={open('call')}><Phone size={18} /></TbBtn>
        )}
        {show('ip') && (
          <TbBtn title="Interventions pharmaceutiques (Act-IP)" onClick={open('ip')} className="!px-1.5 !py-0.5 bg-indigo-100 text-indigo-700 font-black text-xs hover:bg-indigo-200">IP</TbBtn>
        )}

        {(show('documents') || show('quality') || show('lot_alerts')) && <SectionSep label="Qualité" />}
        {show('documents') && (
          <TbBtn title="Procédures / documents" onClick={open('documents')} className="text-blue-300"><BookMarked size={18} /></TbBtn>
        )}
        {show('quality') && (
          <TbBtn title="Non-conformités qualité" onClick={open('quality')} className="text-rose-400"><ShieldAlert size={18} /></TbBtn>
        )}
        {show('lot_alerts') && (
          <TbBtn title="Alertes retrait de lot" onClick={open('lot_alerts')} className="text-red-400"><AlertOctagon size={18} /></TbBtn>
        )}

        {(show('perimes') || show('perimes_vitrine') || show('stock') || show('disputes')) && <SectionSep label="Stock" />}
        {show('perimes') && (
          <TbBtn title="Gestion des périmés" onClick={open('perimes')} className="text-orange-400"><Package size={18} /></TbBtn>
        )}
        {show('perimes_vitrine') && (
          <TbBtn title="Mises en avant / promo / challenges du jour" onClick={open('perimes_vitrine')} className="text-amber-300"><Sparkles size={18} /></TbBtn>
        )}
        {show('stock') && (
          <TbBtn title="Déclarer une erreur de stock" onClick={open('stock')} className="text-violet-400"><PackageX size={18} /></TbBtn>
        )}
        {show('disputes') && (
          <TbBtn title="Litiges fournisseurs" onClick={open('disputes')} className="text-amber-300"><Scale size={18} /></TbBtn>
        )}

        {(show('psl') || show('stupefiants')) && (
          <>
            <SectionSep label="Métier" />
            {show('psl') && (
              <>
                <TbBtn title="MDS — réception" onClick={open('psl_reception', 'psl')} className="text-rose-300">
                  <span className="relative inline-flex w-[18px] h-[18px] items-center justify-center">
                    <ArrowDownToLine size={18} strokeWidth={2.25} />
                    <Droplets size={9} className="absolute -bottom-0.5 -right-0.5 text-rose-200" strokeWidth={2.5} />
                  </span>
                </TbBtn>
                <TbBtn title="MDS — délivrance" onClick={open('psl_delivrance', 'psl')} className="text-rose-300">
                  <span className="relative inline-flex">
                    <Droplets size={18} />
                    <Plus size={10} className="absolute -top-1 -right-1.5" strokeWidth={3} />
                  </span>
                </TbBtn>
              </>
            )}
            {show('stupefiants') && (
              <TbBtn title="Réception stupéfiants" onClick={open('stupefiants')} className="text-rose-400"><Lock size={18} /></TbBtn>
            )}
          </>
        )}

        {show('magistral') && (
          <>
            <SectionSep label="Prépa." />
            <TbBtn title="Magistrale — commander / nouvelle demande" onClick={open('magistral_creation', 'magistral')} className="text-fuchsia-300">
              <span className="relative inline-flex"><FlaskConical size={16} /><Plus size={10} className="absolute -top-1 -right-1" strokeWidth={3} /></span>
            </TbBtn>
            <TbBtn title="Magistrale — devis ST puis accord patient" onClick={open('magistral_devis', 'magistral')} className="text-fuchsia-300">
              <ClipboardCheck size={18} />
            </TbBtn>
            <TbBtn title="Magistrale — réception / rappel patient" onClick={open('magistral_rappel', 'magistral')} className="text-fuchsia-300">
              <Phone size={18} />
            </TbBtn>
            <TbBtn title="Magistrale — dispenser" onClick={open('magistral_dispenser', 'magistral')} className="text-fuchsia-300">
              <Pill size={18} />
            </TbBtn>
            <TbBtn title="Magistrale — renouvellement" onClick={open('magistral_renouvellement', 'magistral')} className="text-fuchsia-300">
              <RefreshCw size={18} />
            </TbBtn>
          </>
        )}

        {show('location') && (
          <>
            <SectionSep label="Loc." />
            <TbBtn title="Location — nouvelle" onClick={open('location_creation', 'location')} className="text-cyan-300">
              <span className="relative inline-flex"><BedDouble size={16} /><Plus size={10} className="absolute -top-1 -right-1" strokeWidth={3} /></span>
            </TbBtn>
            <TbBtn title="Location — prolongation" onClick={open('location_prolongation', 'location')} className="text-cyan-300 font-black text-xs !px-2">P</TbBtn>
            <TbBtn title="Location — clôture" onClick={open('location_cloture', 'location')} className="text-cyan-300">
              <X size={18} strokeWidth={2.5} />
            </TbBtn>
            <TbBtn title="Location — contact" onClick={open('location_contact', 'location')} className="text-cyan-300"><Phone size={18} /></TbBtn>
          </>
        )}

        {(show('hr') || show('cash')) && <SectionSep label="RH / Compta" />}
        {show('hr') && (
          <TbBtn title="RH — planning, retards, absences" onClick={open('hr')} className="text-indigo-300"><Users size={18} /></TbBtn>
        )}
        {show('cash') && (
          <TbBtn title="Clôture de caisse" onClick={open('cash')} className="text-emerald-300"><Wallet size={18} /></TbBtn>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0 pl-2">
        <ConseilPanel />
        <TbBtn
          title="Signaler un bug au développeur"
          onClick={() => openBugWindow()}
          className="text-rose-300"
        >
          <Bug size={18} />
        </TbBtn>
        {canDashboard && (
          <TbBtn
            title="Ouvrir le Dashboard"
            onClick={() => openDashboardWindow()}
            className="text-sky-300"
          >
            <LayoutDashboard size={18} />
          </TbBtn>
        )}
        <TbBtn
          title="Mon compte (e-mail / mot de passe)"
          onClick={() => openModuleWindow('compte')}
          className="text-slate-300"
        >
          <UserCog size={18} />
        </TbBtn>
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
