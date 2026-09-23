import React, { useState, useEffect, useRef } from 'react';
import {
  Phone, BookOpen, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, ShoppingBag, FileText,
  ShieldAlert, BookMarked, Package, PackageX, BedDouble, Scale,
  AlertOctagon, FlaskConical, Droplets, Wallet, LayoutDashboard, Sparkles, Bug,
  Users, Plus, X, Pill, ClipboardCheck, RefreshCw, Lock, ArrowDownToLine, Inbox,
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

function isVertical(placement) {
  return placement === 'gauche' || placement === 'droite';
}

function isCorner(placement) {
  return placement === 'bas_gauche' || placement === 'bas_droite';
}

/** Legacy densités → nouvelles. */
function normalizeDensity(density) {
  if (density === 'auto') return 'normal';
  if (density === 'stack') return 'empilee';
  return density || 'normal';
}

const TONE_CLS = {
  default: 'text-[var(--tb-fg)]',
  accent: 'text-[var(--accent)]',
  success: 'text-[var(--success)]',
  warning: 'text-[var(--warning)]',
  danger: 'text-[var(--danger)]',
  muted: 'text-[var(--tb-muted)]',
};

function SectionSep({ label, title, showLabel, vertical, corner }) {
  const tip = title || label;
  const labelStyle = { fontSize: 'var(--font-tb-label)' };
  if (corner) {
    return (
      <span
        className="shrink-0 w-10 uppercase tracking-wide text-[var(--tb-muted)] truncate self-center"
        style={labelStyle}
        title={tip}
      >
        {label}
      </span>
    );
  }
  if (vertical) {
    return (
      <div className="flex flex-col items-center gap-0.5 my-0.5 w-full px-1" title={tip}>
        <div className="w-full h-px bg-[var(--tb-sep)]" />
        {showLabel && (
          <span className="uppercase tracking-wide text-[var(--tb-muted)] truncate max-w-full" style={labelStyle}>
            {label}
          </span>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 mx-0.5 shrink-0" title={tip}>
      <div className="h-4 w-px bg-[var(--tb-sep)]" />
      {showLabel && (
        <span className="uppercase tracking-wide text-[var(--tb-muted)]" style={labelStyle}>{label}</span>
      )}
    </div>
  );
}

function collapseExpandIcons(placement) {
  if (placement === 'bas') {
    return { CollapseIcon: ChevronDown, ExpandIcon: ChevronUp };
  }
  /* Coins = mêmes flèches que les côtés gauche / droite */
  if (placement === 'gauche' || placement === 'bas_gauche') {
    return { CollapseIcon: ChevronLeft, ExpandIcon: ChevronRight };
  }
  if (placement === 'droite' || placement === 'bas_droite') {
    return { CollapseIcon: ChevronRight, ExpandIcon: ChevronLeft };
  }
  return { CollapseIcon: ChevronUp, ExpandIcon: ChevronDown };
}

function TbBtn({
  title, onClick, className = '', showLabel = false, label, tone = 'default',
  children, vertical = false,
}) {
  const toneCls = TONE_CLS[tone] || TONE_CLS.default;
  const base = `rounded hover:bg-[var(--tb-hover)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] ${toneCls}`;

  if (showLabel && label) {
    return (
      <button
        type="button"
        title={title}
        aria-label={title}
        onClick={onClick}
        className={`flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 ${vertical ? 'w-full min-w-0' : 'min-w-[2.5rem]'} ${base} ${className}`}
      >
        {children}
        <span
          className={`leading-none text-[var(--tb-muted)] truncate ${vertical ? 'max-w-full px-0.5' : 'max-w-[3.25rem]'}`}
          style={{ fontSize: 'var(--font-tb-label)' }}
        >
          {label}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`p-1.5 ${base} ${className}`}
    >
      {children}
    </button>
  );
}

export default function Taskbar() {
  const { user, profile, signOut, canAccess, canDashboard, preferences } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const initLogged = useRef(false);

  const placement = preferences?.taskbar_placement || 'haut';
  const density = normalizeDensity(preferences?.taskbar_density);
  const compact = density === 'compact';
  const detaillee = density === 'detaillee';
  const empilee = density === 'empilee';
  /* Labels sous-groupes : tout sauf compact */
  const showGroupLabel = !compact;
  /* Noms modules condensés : détaillee uniquement */
  const showModuleLabel = detaillee;
  const vertical = isVertical(placement);
  const corner = isCorner(placement);
  const showInbox = canAccess('taskbar', 'inbox') || canAccess('taskbar', 'tasks');
  const { CollapseIcon, ExpandIcon } = collapseExpandIcons(placement);
  const edgeIsLeft = placement === 'gauche' || placement === 'bas_gauche';

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
    if (!user?.id) return undefined;

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

  const lbl = (full, abbr) => (compact ? abbr : full);

  const btnProps = {
    showLabel: showModuleLabel && !corner,
    vertical: vertical && showModuleLabel,
  };

  const sections = [];

  const tasksItems = [];
  if (showInbox) {
    tasksItems.push({
      key: 'inbox',
      title: 'À traiter — file d’attente et tâches du jour',
      onClick: () => openModuleWindow('inbox'),
      tone: 'warning',
      label: 'Inbox',
      node: (
        <span className="relative inline-flex">
          <Inbox size={18} />
          {pendingCount > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 bg-[var(--badge-bg)] text-[var(--badge-fg)] font-bold min-w-[1rem] h-4 px-0.5 rounded-full flex items-center justify-center"
              style={{ fontSize: 'var(--font-tb-badge)' }}
            >
              {pendingCount > 9 ? '9+' : pendingCount}
            </span>
          )}
        </span>
      ),
    });
  }
  if (show('order')) {
    tasksItems.push({
      key: 'order', title: 'Commander un médicament', onClick: open('order'),
      tone: 'success', label: 'Cmd', node: <ShoppingBag size={18} />,
    });
  }
  if (show('billing')) {
    tasksItems.push({
      key: 'billing', title: 'Facturation à effectuer', onClick: open('billing'),
      tone: 'accent', label: 'Fact.', node: <FileText size={18} />,
    });
  }
  if (tasksItems.length) {
    sections.push({
      id: 'tasks', label: lbl('Tâches', 'Tâch.'), title: 'Tâches', items: tasksItems,
    });
  }

  const comItems = [];
  if (show('directory')) {
    comItems.push({
      key: 'directory', title: 'Annuaire des contacts', onClick: open('directory'),
      tone: 'accent', label: 'Ann.', node: <BookOpen size={18} />,
    });
  }
  if (show('call')) {
    comItems.push({
      key: 'call', title: 'Tracer un appel téléphonique', onClick: open('call'),
      tone: 'default', label: 'Appel', node: <Phone size={18} />,
    });
  }
  if (show('ip')) {
    comItems.push({
      key: 'ip',
      title: 'Interventions pharmaceutiques (Act-IP)',
      onClick: open('ip'),
      tone: 'accent',
      label: 'IP',
      className: '!px-1.5 !py-0.5 bg-[var(--accent)]/20 font-black text-xs',
      node: 'IP',
    });
  }
  if (comItems.length) {
    sections.push({
      id: 'com', label: lbl('Communication', 'Com'), title: 'Communication', items: comItems,
    });
  }

  const qualItems = [];
  if (show('documents')) {
    qualItems.push({
      key: 'documents', title: 'Procédures et documents (GED)', onClick: open('documents'),
      tone: 'accent', label: 'GED', node: <BookMarked size={18} />,
    });
  }
  if (show('quality')) {
    qualItems.push({
      key: 'quality', title: 'Non-conformités qualité', onClick: open('quality'),
      tone: 'danger', label: 'Qual.', node: <ShieldAlert size={18} />,
    });
  }
  if (show('lot_alerts')) {
    qualItems.push({
      key: 'lot_alerts', title: 'Alertes retrait de lot', onClick: open('lot_alerts'),
      tone: 'danger', label: 'Lot', node: <AlertOctagon size={18} />,
    });
  }
  if (qualItems.length) {
    sections.push({
      id: 'qual', label: lbl('Qualité', 'Qual.'), title: 'Qualité', items: qualItems,
    });
  }

  const stockItems = [];
  if (show('perimes')) {
    stockItems.push({
      key: 'perimes', title: 'Gestion des périmés', onClick: open('perimes'),
      tone: 'warning', label: 'Pér.', node: <Package size={18} />,
    });
  }
  if (show('perimes_vitrine')) {
    stockItems.push({
      key: 'perimes_vitrine', title: 'Mises en avant / promo / challenges du jour', onClick: open('perimes_vitrine'),
      tone: 'warning', label: 'MEA', node: <Sparkles size={18} />,
    });
  }
  if (show('stock')) {
    stockItems.push({
      key: 'stock', title: 'Déclarer une erreur de stock', onClick: open('stock'),
      tone: 'accent', label: 'Stock', node: <PackageX size={18} />,
    });
  }
  if (show('disputes')) {
    stockItems.push({
      key: 'disputes', title: 'Litiges fournisseurs', onClick: open('disputes'),
      tone: 'warning', label: 'Lit.', node: <Scale size={18} />,
    });
  }
  if (stockItems.length) {
    sections.push({ id: 'stock', label: 'Stock', title: 'Stock', items: stockItems });
  }

  const metierItems = [];
  if (show('psl')) {
    metierItems.push({
      key: 'psl_reception',
      title: 'Médicaments de statut particulier (MDS) — réception',
      onClick: open('psl_reception', 'psl'),
      tone: 'danger',
      label: 'MDS↓',
      node: (
        <span className="relative inline-flex w-[18px] h-[18px] items-center justify-center">
          <ArrowDownToLine size={18} strokeWidth={2.25} />
          <Droplets size={9} className="absolute -bottom-0.5 -right-0.5 opacity-80" strokeWidth={2.5} />
        </span>
      ),
    });
    metierItems.push({
      key: 'psl_delivrance',
      title: 'Médicaments de statut particulier (MDS) — délivrance',
      onClick: open('psl_delivrance', 'psl'),
      tone: 'danger',
      label: 'MDS+',
      node: (
        <span className="relative inline-flex">
          <Droplets size={18} />
          <Plus size={10} className="absolute -top-1 -right-1.5" strokeWidth={3} />
        </span>
      ),
    });
  }
  if (show('stupefiants')) {
    metierItems.push({
      key: 'stupefiants', title: 'Réception des stupéfiants', onClick: open('stupefiants'),
      tone: 'danger', label: 'Stup', node: <Lock size={18} />,
    });
  }
  if (metierItems.length) {
    sections.push({
      id: 'metier', label: lbl('Métier', 'Mét.'), title: 'Métier', items: metierItems,
    });
  }

  if (show('magistral')) {
    sections.push({
      id: 'magistral',
      label: lbl('Préparations', 'Prépa'),
      title: 'Préparations magistrales',
      items: [
        {
          key: 'mag_creation',
          title: 'Préparation magistrale — commander / nouvelle demande',
          onClick: open('magistral_creation', 'magistral'),
          tone: 'accent',
          label: 'Créer',
          node: (
            <span className="relative inline-flex">
              <FlaskConical size={16} />
              <Plus size={10} className="absolute -top-1 -right-1" strokeWidth={3} />
            </span>
          ),
        },
        {
          key: 'mag_devis', title: 'Préparation magistrale — devis ST puis accord patient',
          onClick: open('magistral_devis', 'magistral'), tone: 'accent', label: 'Devis',
          node: <ClipboardCheck size={18} />,
        },
        {
          key: 'mag_rappel', title: 'Préparation magistrale — réception / rappel patient',
          onClick: open('magistral_rappel', 'magistral'), tone: 'accent', label: 'Rappel',
          node: <Phone size={18} />,
        },
        {
          key: 'mag_disp', title: 'Préparation magistrale — dispenser',
          onClick: open('magistral_dispenser', 'magistral'), tone: 'accent', label: 'Disp.',
          node: <Pill size={18} />,
        },
        {
          key: 'mag_renouv', title: 'Préparation magistrale — renouvellement',
          onClick: open('magistral_renouvellement', 'magistral'), tone: 'accent', label: 'Renouv.',
          node: <RefreshCw size={18} />,
        },
      ],
    });
  }

  if (show('location')) {
    sections.push({
      id: 'location',
      label: lbl('Location', 'Loc.'),
      title: 'Location de matériel',
      items: [
        {
          key: 'loc_creation',
          title: 'Location de matériel — nouvelle location',
          onClick: open('location_creation', 'location'),
          tone: 'accent',
          label: 'Loc+',
          node: (
            <span className="relative inline-flex">
              <BedDouble size={16} />
              <Plus size={10} className="absolute -top-1 -right-1" strokeWidth={3} />
            </span>
          ),
        },
        {
          key: 'loc_prol', title: 'Location de matériel — prolongation',
          onClick: open('location_prolongation', 'location'), tone: 'accent', label: 'Prol.',
          className: 'font-black text-xs !px-2', node: 'P',
        },
        {
          key: 'loc_clot', title: 'Location de matériel — clôture',
          onClick: open('location_cloture', 'location'), tone: 'accent', label: 'Clôt.',
          node: <X size={18} strokeWidth={2.5} />,
        },
        {
          key: 'loc_contact', title: 'Location de matériel — contact patient',
          onClick: open('location_contact', 'location'), tone: 'accent', label: 'Contact',
          node: <Phone size={18} />,
        },
      ],
    });
  }

  const rhItems = [];
  if (show('hr')) {
    rhItems.push({
      key: 'hr', title: 'Ressources humaines — planning, retards, absences', onClick: open('hr'),
      tone: 'accent', label: 'RH', node: <Users size={18} />,
    });
  }
  if (show('cash')) {
    rhItems.push({
      key: 'cash', title: 'Clôture de caisse', onClick: open('cash'),
      tone: 'success', label: 'Caisse', node: <Wallet size={18} />,
    });
  }
  if (rhItems.length) {
    sections.push({
      id: 'rh', label: lbl('RH / Compta', 'RH'), title: 'RH / Comptabilité', items: rhItems,
    });
  }

  const renderItem = (item) => (
    <TbBtn
      key={item.key}
      title={item.title}
      onClick={item.onClick}
      tone={item.tone}
      label={item.label}
      className={item.className || ''}
      {...btnProps}
    >
      {item.node}
    </TbBtn>
  );

  /** Empilée : label sous-groupe au-dessus, logos en rangée dessous. */
  const renderSectionsEmpilee = (vert = false) => sections.map((sec) => (
    <div
      key={sec.id}
      className={
        vert
          ? 'flex flex-col items-center gap-0.5 w-full px-0.5 py-0.5 border-b border-[var(--tb-border)] last:border-b-0'
          : 'flex flex-col items-center gap-0.5 px-1 shrink-0 border-r border-[var(--tb-border)] last:border-r-0'
      }
    >
      {showGroupLabel && (
        <span
          className="uppercase tracking-wide text-[var(--tb-muted)] truncate max-w-full px-0.5"
          style={{ fontSize: 'var(--font-tb-label)' }}
          title={sec.title || sec.label}
        >
          {sec.label}
        </span>
      )}
      <div className={`flex items-center gap-0.5 ${vert ? 'flex-wrap justify-center' : ''}`}>
        {sec.items.map(renderItem)}
      </div>
    </div>
  ));

  const renderSectionsInline = () => sections.map((sec) => (
    <React.Fragment key={sec.id}>
      <SectionSep label={sec.label} title={sec.title} showLabel={showGroupLabel} vertical={vertical} />
      {sec.items.map(renderItem)}
    </React.Fragment>
  ));

  const renderSectionsCorner = () => sections.map((sec) => (
    <div
      key={sec.id}
      className="flex items-center gap-0.5 min-h-[1.75rem] w-full border-b border-[var(--tb-border)] last:border-b-0 py-0.5"
    >
      <SectionSep label={sec.label} title={sec.title} showLabel={showGroupLabel} corner />
      <div className="flex items-center gap-0.5 flex-wrap min-w-0 flex-1">
        {sec.items.map((item) => (
          <TbBtn
            key={item.key}
            title={item.title}
            onClick={item.onClick}
            tone={item.tone}
            label={item.label}
            showLabel={showModuleLabel}
            className={item.className || ''}
          >
            {item.node}
          </TbBtn>
        ))}
      </div>
    </div>
  ));

  const actionsCore = (
    <>
      <ConseilPanel layout={vertical ? 'vertical' : corner ? 'corner' : 'horizontal'} />
      <TbBtn title="Signaler un bug au développeur" onClick={() => openBugWindow()} tone="danger" label="Bug" {...btnProps}>
        <Bug size={18} />
      </TbBtn>
      {canDashboard && (
        <TbBtn title="Ouvrir le tableau de bord PharmaOS" onClick={() => openDashboardWindow()} tone="accent" label="Dash" {...btnProps}>
          <LayoutDashboard size={18} />
        </TbBtn>
      )}
      <button
        type="button"
        title={`Se déconnecter (${profile?.display_name || 'utilisateur'})`}
        aria-label="Se déconnecter"
        onClick={signOut}
        className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-xs font-bold text-[var(--accent-fg)] hover:bg-[var(--danger)] transition-colors shrink-0"
      >
        {getInitials(profile?.display_name)}
      </button>
    </>
  );

  const collapseBtn = (
    <button
      type="button"
      title="Réduire la barre"
      aria-label="Réduire la barre"
      onClick={handleCollapse}
      className="p-1.5 rounded text-[var(--tb-fg)] hover:bg-[var(--tb-hover)] transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]"
    >
      <CollapseIcon size={16} />
    </button>
  );

  /** Chevron collé au bord intérieur — gauche/droite et coins bas. */
  const edgeCollapseStrip = (
    <button
      type="button"
      title="Réduire la barre"
      aria-label="Réduire la barre"
      onClick={handleCollapse}
      className={`shrink-0 self-stretch w-5 flex items-center justify-center text-[var(--tb-fg)] hover:bg-[var(--tb-hover)] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] ${
        edgeIsLeft ? 'border-l border-[var(--tb-border)]' : 'border-r border-[var(--tb-border)]'
      }`}
    >
      <CollapseIcon size={14} />
    </button>
  );

  if (isCollapsed) {
    const pillRound =
      placement === 'bas_gauche' || placement === 'gauche' ? 'rounded-r-md'
        : placement === 'bas_droite' || placement === 'droite' ? 'rounded-l-md'
          : 'rounded-lg';
    const edgeCollapsed = vertical || corner;
    return (
      <div
        className={`w-full h-full flex ${
          edgeCollapsed
            ? (edgeIsLeft ? 'justify-start' : 'justify-end')
            : 'items-center justify-center'
        }`}
        style={{ background: 'transparent' }}
      >
        <button
          type="button"
          title="Afficher la barre d'outils PharmaOS"
          aria-label="Afficher la barre d'outils"
          onClick={handleExpand}
          className={`${edgeCollapsed ? 'h-full w-full' : 'h-full w-full'} flex items-center justify-center ${pillRound} bg-[var(--tb-reduced-bg)] text-[var(--tb-fg)] border border-[var(--tb-border)] hover:bg-[var(--tb-hover)] transition-colors`}
        >
          <ExpandIcon size={14} />
        </button>
      </div>
    );
  }

  const shellCls = 'taskbar-shell w-full h-full bg-[var(--tb-bg)] text-[var(--tb-fg)] border-[var(--tb-border)]';

  if (vertical) {
    const body = (
      <div className="flex flex-col items-stretch flex-1 min-w-0 min-h-0 overflow-hidden">
        <div className="flex flex-col items-stretch gap-0.5 flex-1 min-h-0 overflow-y-auto w-full px-0.5 py-1.5">
          {empilee ? renderSectionsEmpilee(true) : renderSectionsInline()}
        </div>
        <div className="flex flex-col items-center gap-1 shrink-0 py-1 border-t border-[var(--tb-border)] w-full px-0.5">
          {actionsCore}
        </div>
      </div>
    );
    return (
      <div
        className={`${shellCls} flex items-stretch overflow-hidden border-y-0 ${
          edgeIsLeft ? 'border-r flex-row' : 'border-l flex-row-reverse'
        }`}
      >
        {body}
        {edgeCollapseStrip}
      </div>
    );
  }

  if (corner) {
    const round =
      placement === 'bas_gauche' ? 'rounded-tr-xl' : 'rounded-tl-xl';
    const body = (
      <div className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col p-1.5 gap-1">
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
            {empilee ? renderSectionsEmpilee(true) : renderSectionsCorner()}
          </div>
          <div className="flex items-center justify-end gap-1 shrink-0 border-t border-[var(--tb-border)] pt-1 flex-wrap">
            {actionsCore}
          </div>
        </div>
      </div>
    );
    return (
      <div
        className={`${shellCls} flex items-stretch overflow-hidden border ${round} ${
          edgeIsLeft ? 'flex-row' : 'flex-row-reverse'
        }`}
      >
        {body}
        {edgeCollapseStrip}
      </div>
    );
  }

  return (
    <div className={`${shellCls} flex items-center justify-between px-2 ${placement === 'bas' ? 'border-t' : 'border-b'}`}>
      <div className={`flex items-center gap-0.5 min-w-0 overflow-x-auto ${empilee || detaillee ? 'py-0.5' : ''}`}>
        {empilee ? renderSectionsEmpilee(false) : renderSectionsInline()}
      </div>
      <div className="flex items-center gap-1.5 shrink-0 pl-2">
        {actionsCore}
        {collapseBtn}
      </div>
    </div>
  );
}
