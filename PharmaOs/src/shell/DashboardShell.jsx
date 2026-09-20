import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { LogOut } from 'lucide-react';
import { useAuth } from '../core/AuthContext.jsx';
import { NAV_SECTIONS, findNavItem, resolveNavPageId, settingsTabFromNav } from './navConfig.js';
import { firstAllowedDashboardPage } from '../core/access.js';
import { labelRole } from '../core/roles.js';
import { logEvent, setLogSurface } from '../shared/logService.js';
import { onDashboardNavigate } from '../shared/windowService.js';

import CallTracking from '../modules/calls/dashboard/CallTracking.jsx';
import AgendaManager from '../modules/agenda/dashboard/AgendaManager.jsx';
import TasksManager from '../modules/tasks/dashboard/TasksManager.jsx';
import IpManagement from '../modules/ip/dashboard/IpManagement.jsx';
import DirectoryManager from '../modules/directory/dashboard/DirectoryManager.jsx';
import LocationManager from '../modules/location/dashboard/LocationManager.jsx';
import LocationTranscription from '../modules/location/dashboard/LocationTranscription.jsx';
import Location from '../modules/location/comptoir/Location.jsx';
import MagistralManager from '../modules/magistral/dashboard/MagistralManager.jsx';
import Magistral from '../modules/magistral/comptoir/Magistral.jsx';
import PslManager from '../modules/psl/dashboard/PslManager.jsx';
import CashManager from '../modules/cash/dashboard/CashManager.jsx';
import DisputesManager from '../modules/disputes/dashboard/DisputesManager.jsx';
import QualityManager from '../modules/quality/dashboard/QualityManager.jsx';
import DocumentManager from '../modules/documents/dashboard/DocumentManager.jsx';
import PerimesManager from '../modules/perimes/dashboard/PerimesManager.jsx';
import StockErrorManager from '../modules/stock/dashboard/StockErrorManager.jsx';
import RetraitLotManager from '../modules/lot-alerts/dashboard/RetraitLotManager.jsx';
import HomeDashboard from '../modules/home/dashboard/HomeDashboard.jsx';
import HrManager from '../modules/hr/dashboard/HrManager.jsx';
import BdmExplorer from '../modules/bdm/dashboard/BdmExplorer.jsx';
import ConseilManager from '../modules/conseil/dashboard/ConseilManager.jsx';
import StupefiantsManager from '../modules/stupefiants/dashboard/StupefiantsManager.jsx';
import LogsManager from '../modules/admin/dashboard/LogsManager.jsx';
import BugsManager from '../modules/admin/dashboard/BugsManager.jsx';
import AccessManager from '../modules/admin/dashboard/AccessManager.jsx';
import SettingsManager from '../modules/admin/dashboard/SettingsManager.jsx';
import AccountManager from '../modules/admin/dashboard/AccountManager.jsx';
import InboxManager from '../modules/inbox/dashboard/InboxManager.jsx';
import { ForcePasswordChangeGate } from '../modules/admin/shared/AccountForms.jsx';

function PlaceholderPage({ label }) {
  return (
    <>
      <h1 className="text-2xl font-semibold text-slate-800 mb-2">{label}</h1>
      <p className="text-sm text-slate-500">
        Page placeholder — le contenu sera migré dans les phases modules suivantes.
      </p>
    </>
  );
}

function renderDashboardPage(pageId, activeLabel, onNavigate, pageData) {
  switch (pageId) {
    case 'disputes':
      return <DisputesManager onNavigate={onNavigate} />;
    case 'quality':
      return <QualityManager onNavigate={onNavigate} />;
    case 'documents':
      return <DocumentManager onNavigate={onNavigate} />;
    case 'perimes':
      return <PerimesManager onNavigate={onNavigate} focusPerimeId={pageData?.perimeId || null} />;
    case 'stock':
      return <StockErrorManager onNavigate={onNavigate} />;
    case 'retrait_lot':
      return <RetraitLotManager onNavigate={onNavigate} />;
    case 'hr':
      return <HrManager onNavigate={onNavigate} />;
    case 'bdm':
      return <BdmExplorer />;
    case 'conseil':
      return <ConseilManager />;
    case 'psl':
      return <PslManager />;
    case 'stupefiants':
      return (
        <StupefiantsManager
          onNavigate={onNavigate}
          focusReleveId={pageData?.releveId || null}
          initialTab={pageData?.tab || pageData?.stupefiantsTab || null}
        />
      );
    case 'cash':
      return <CashManager />;
    case 'location':
    case 'location_suivi':
      return <LocationManager view="suivi" onNavigate={onNavigate} pageData={pageData} />;
    case 'location_parc':
      return <LocationManager view="parc" onNavigate={onNavigate} pageData={pageData} />;
    case 'location_facture':
      return <LocationManager view="facture" onNavigate={onNavigate} pageData={pageData} />;
    case 'location_contact':
      return <LocationManager view="contact" onNavigate={onNavigate} pageData={pageData} />;
    case 'location_transcription':
      return <LocationTranscription onNavigate={onNavigate} />;
    case 'location_creation':
    case 'location_prolongation':
    case 'location_cloture':
      return (
        <Location view={pageId} data={pageData} onNavigate={onNavigate} />
      );
    case 'magistral':
    case 'magistral_suivi':
      return <MagistralManager onNavigate={onNavigate} />;
    case 'magistral_creation':
    case 'magistral_devis':
    case 'magistral_rappel':
    case 'magistral_dispenser':
    case 'magistral_renouvellement':
      return <Magistral view={pageId} onNavigate={onNavigate} />;
    case 'directory':
      return <DirectoryManager onNavigate={onNavigate} />;
    case 'agenda':
      return <AgendaManager onNavigate={onNavigate} />;
    case 'tasks':
      return <TasksManager onNavigate={onNavigate} />;
    case 'ip':
      return <IpManagement onNavigate={onNavigate} />;
    case 'calls':
      return <CallTracking onNavigate={onNavigate} />;
    case 'inbox':
      return <InboxManager onNavigate={onNavigate} />;
    case 'dashboard':
      return <HomeDashboard onNavigate={onNavigate} />;
    case 'logs':
      return <LogsManager />;
    case 'bugs':
      return <BugsManager />;
    case 'access':
      return <AccessManager />;
    case 'compte':
      return <AccountManager />;
    case 'parametres':
    case 'location_parametres':
    case 'magistral_parametres':
      return (
        <SettingsManager
          initialTab={settingsTabFromNav(pageId, pageData)}
          onNavigate={onNavigate}
          pageData={pageData}
        />
      );
    default:
      return <PlaceholderPage label={activeLabel} />;
  }
}

export default function DashboardShell() {
  const {
    user, profile, canDashboard, canAccess, accessOverrides, casquetteGrants,
    isLoading, signOut, role, mustChangePassword, reloadProfile,
  } = useAuth();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [pageData, setPageData] = useState(null);

  useEffect(() => {
    setLogSurface('dashboard');
  }, []);

  const visibleSections = useMemo(
    () => NAV_SECTIONS
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => canAccess('dashboard', item.id)),
      }))
      .filter((section) => section.items.length > 0),
    [canAccess, accessOverrides],
  );

  useEffect(() => {
    return onDashboardNavigate((payload) => {
      if (!payload?.page) return;
      const rawPage = payload.page;
      const settingsTab = settingsTabFromNav(rawPage, payload);
      const page = resolveNavPageId(rawPage);
      if (!canAccess('dashboard', page)) return;
      const nextData = { ...payload };
      if (settingsTab && !nextData.tab && !nextData.settingsTab) nextData.tab = settingsTab;
      setCurrentPage(page);
      setPageData(nextData);
      logEvent({
        category: 'ui',
        action: 'navigate',
        entity: page,
        message: `Dashboard → ${page}`,
        details: nextData,
      });
    });
  }, [canAccess]);

  useEffect(() => {
    if (isLoading) return;
    if (!canAccess('dashboard', currentPage)) {
      const fallback = firstAllowedDashboardPage(role, accessOverrides, casquetteGrants) || 'dashboard';
      setCurrentPage(fallback);
      setPageData(null);
    }
  }, [isLoading, currentPage, canAccess, role, accessOverrides, casquetteGrants]);

  const goTo = useCallback((pageId, data = null) => {
    const settingsTab = settingsTabFromNav(pageId, data);
    const page = resolveNavPageId(pageId);
    const nextData = data && typeof data === 'object' ? { ...data } : {};
    if (settingsTab && !nextData.tab && !nextData.settingsTab) nextData.tab = settingsTab;
    setCurrentPage(page);
    setPageData(Object.keys(nextData).length ? nextData : null);
    logEvent({
      category: 'ui',
      action: 'navigate',
      entity: page,
      message: `Dashboard → ${page}`,
      details: Object.keys(nextData).length ? nextData : undefined,
    });
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600">
        Chargement…
      </div>
    );
  }

  if (!canDashboard) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 gap-3 p-6">
        <h1 className="text-xl font-semibold text-slate-800">Accès refusé</h1>
        <p className="text-sm text-slate-500 text-center max-w-md">
          Le Dashboard n’est pas ouvert au rôle <code className="text-xs bg-slate-200 px-1 rounded">{labelRole(role)}</code>.
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-2 px-3 py-1.5 rounded bg-slate-800 text-white text-sm"
        >
          Fermer la session
        </button>
      </div>
    );
  }

  const activeLabel = findNavItem(currentPage)?.label || currentPage;

  return (
    <div className="flex min-h-screen bg-slate-100">
      <aside className="w-56 xl:w-64 shrink-0 bg-slate-900 text-slate-200 flex flex-col h-screen sticky top-0">
        <div className="p-4 border-b border-slate-700">
          <p className="font-semibold text-white text-sm">PharmaOS Dashboard</p>
          <p className="text-xs text-slate-400 truncate mt-1">
            {profile?.display_name || user?.email}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">{labelRole(role)}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {visibleSections.map((section) => (
            <div key={section.title}>
              <p className="text-[10px] uppercase tracking-wider text-slate-500 font-bold px-2 mb-2">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = resolveNavPageId(currentPage) === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => goTo(item.id)}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                          active
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-slate-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <Icon size={16} className={active ? 'text-white' : 'text-slate-400'} />
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700">
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:bg-white/5 hover:text-white"
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="p-6 xl:p-8 max-w-[1600px]">
          {renderDashboardPage(currentPage, activeLabel, goTo, pageData)}
        </div>
      </main>
      {mustChangePassword && (
        <ForcePasswordChangeGate onDone={() => reloadProfile?.()} />
      )}
    </div>
  );
}
