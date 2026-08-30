import React, { useState, useEffect, useRef } from 'react';
import { Phone, BookOpen, ChevronUp, ChevronDown, CheckSquare, ShoppingBag, FileText, ShieldAlert, ClipboardCheck, BookMarked, Package, PackageX, BedDouble, Scale, AlertOctagon, FlaskConical, Droplets, Wallet } from 'lucide-react';
import { useAuth } from '../../core/AuthContext.jsx';
import { supabase } from '../../services/supabaseClient';
import { expandWindow, reduceWindow, openModuleWindow } from '../../services/windowService.js';
import { logTaskbarToggle } from '../../services/dbServices.js';

export default function Taskbar() {
  const { user, profile, signOut } = useAuth();
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

  // Écoute en temps réel pour le badge des tâches
  useEffect(() => {
    if (!user?.id) return;

    const fetchPendingTasksCount = async () => {
    // On enlève le "count: 'exact'" car on doit compter localement après filtrage
    const { data, error } = await supabase
      .schema('PharmaOs')
      .from('task_assignments')
      .select('id, tasks(description)')
      .eq('user_id', user.id)
      .eq('statut', 'en_cours');

    if (!error && data) {
      // Date du jour au format YYYY-MM-DD
      const today = new Date().toISOString().split('T')[0];
      
      const count = data.filter(assignment => {
        let taskDate = null;
        try {
          // On tente de lire la date dans le JSON
          const parsed = JSON.parse(assignment.tasks?.description);
          taskDate = parsed.date;
        } catch (e) {
          // Si ce n'est pas un JSON, c'est une tâche simple sans date
        }
        
        // On garde si : Pas de date OU Date <= Aujourd'hui (dépassée ou du jour)
        if (!taskDate) return true;
        return taskDate <= today;
      }).length;

      setPendingCount(count);
    }
  };
  
    fetchPendingTasksCount();

    const subscription = supabase
      .channel('task_assignments_changes')
      .on('postgres_changes', { event: '*', schema: 'PharmaOs', table: 'task_assignments', filter: `user_id=eq.${user.id}` }, () => {
        fetchPendingTasksCount();
      })
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
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const handleOpenDirectory = async () => openModuleWindow('directory');
  const handleOpenCalls = async () => openModuleWindow('call');
  const handleOpenIP = async () => openModuleWindow('ip');
  const handleOpenTasks = async () => openModuleWindow('tasks');
  const handleOpenOrder = async () => openModuleWindow('order');
  const handleOpenBilling = async () => openModuleWindow('billing');
  const handleOpenQuality = async () => openModuleWindow('quality');
  const handleOpenControls = async () => openModuleWindow('controls');
  const handleOpenDocuments = async () => openModuleWindow('documents');
  const handleOpenPerimes = async () => openModuleWindow('perimes');
  const handleOpenStock = async () => openModuleWindow('stock');
  const handleOpenRental = async () => openModuleWindow('rental');
  const handleOpenDisputes = async () => openModuleWindow('disputes');
  const handleOpenLotAlerts = async () => openModuleWindow('lot_alerts');
  const handleOpenMagistral = async () => openModuleWindow('magistral');
  const handleOpenPsl = async () => openModuleWindow('psl');
  const handleOpenCash = async () => openModuleWindow('cash');

  if (isCollapsed) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-900/90">
        <button
          onClick={handleExpand}
          aria-label="Afficher la barre"
          className="w-full h-full flex items-center justify-center text-slate-300 hover:text-white transition-colors"
        >
          <ChevronDown size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-between px-3 bg-slate-900/90 text-white">
      <div className="flex items-center gap-3">
        {/* Nouveaux boutons Tâches & Actions */}
        <button onClick={handleOpenTasks} title="Mes Tâches" className="relative p-1.5 rounded hover:bg-slate-700/70 transition-colors text-amber-300">
          <CheckSquare size={18} />
          {pendingCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow">
              {pendingCount}
            </span>
          )}
        </button>

        <button onClick={handleOpenOrder} title="Commander un médicament" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-emerald-400">
          <ShoppingBag size={18} />
        </button>

        <button onClick={handleOpenBilling} title="Facturation à effectuer" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-sky-300">
          <FileText size={18} />
        </button>

        <div className="h-4 w-px bg-slate-700 mx-1" />

        {/* Boutons d'origine */}
        <button onClick={handleOpenCalls} title="Appels" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors">
          <Phone size={18} />
        </button>
        
        <button onClick={handleOpenDirectory} title="Annuaire" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-sky-400">
          <BookOpen size={18} />
        </button>

        <button onClick={handleOpenIP} title="Interventions Pharmaceutiques" className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 font-black text-xs hover:bg-indigo-200 transition-colors">
          IP
        </button>

        <div className="h-4 w-px bg-slate-700 mx-1" />

        <button onClick={handleOpenQuality} title="Non-conformités" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-rose-400">
          <ShieldAlert size={18} />
        </button>
        <button onClick={handleOpenControls} title="Contrôles qualité" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-teal-400">
          <ClipboardCheck size={18} />
        </button>
        <button onClick={handleOpenDocuments} title="Procédures" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-blue-300">
          <BookMarked size={18} />
        </button>
        <button onClick={handleOpenPerimes} title="Périmés" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-orange-400">
          <Package size={18} />
        </button>
        <button onClick={handleOpenStock} title="Erreur de stock" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-violet-400">
          <PackageX size={18} />
        </button>

        <div className="h-4 w-px bg-slate-700 mx-1" />

        <button onClick={handleOpenRental} title="Location matériel" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-cyan-300">
          <BedDouble size={18} />
        </button>
        <button onClick={handleOpenMagistral} title="Préparations magistrales" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-fuchsia-300">
          <FlaskConical size={18} />
        </button>
        <button onClick={handleOpenPsl} title="Traçabilité PSL" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-rose-300">
          <Droplets size={18} />
        </button>
        <button onClick={handleOpenCash} title="Clôture de caisse" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-emerald-300">
          <Wallet size={18} />
        </button>
        <button onClick={handleOpenDisputes} title="Litiges fournisseurs" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-amber-300">
          <Scale size={18} />
        </button>
        <button onClick={handleOpenLotAlerts} title="Alertes retrait de lot" className="p-1.5 rounded hover:bg-slate-700/70 transition-colors text-red-400">
          <AlertOctagon size={18} />
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-300 truncate max-w-[240px]">
          Conseil : Pensez a proposer un produit associe.
        </span>
        
        <button onClick={signOut} title="Se déconnecter" className="w-7 h-7 rounded-full bg-sky-600 flex items-center justify-center text-xs font-bold hover:bg-red-500 transition-colors">
          {getInitials(profile?.display_name)}
        </button>

        <button onClick={handleCollapse} className="p-1.5 rounded hover:bg-slate-700/70 transition-colors">
          <ChevronUp size={16} />
        </button>
      </div>
    </div>
  );
}