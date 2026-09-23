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
import InboxManager, { InboxSaisiesManager } from '../modules/inbox/dashboard/InboxManager.jsx';
import AccountPage from '../modules/account/dashboard/AccountPage.jsx';

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
    case 'inbox_saisies':
      return <InboxSaisiesManager onNavigate={onNavigate} />;
    case 'account':
      return <AccountPage />;
    case 'dashboard':
      return <HomeDashboard onNavigate={onNavigate} />;
    case 'logs':
      return <LogsManager />;
    case 'bugs':
      return <BugsManager />;
    case 'access':
      return <AccessManager />;
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
    isLoading, signOut, role, preferences,
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
      <div className="min-h-screen flex items-center justify-center bg-[var(--surface)] text-[var(--muted)]">
        Chargement…
      </div>
    );
  }

  if (!canDashboard) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--surface)] gap-3 p-6">
        <h1 className="text-xl font-semibold text-[var(--fg)]">Accès refusé</h1>
        <p className="text-sm text-[var(--muted)] text-center max-w-md">
          Le Dashboard n’est pas ouvert au rôle <code className="text-xs bg-[var(--input-bg)] px-1 rounded">{labelRole(role)}</code>.
        </p>
        <button
          type="button"
          onClick={signOut}
          className="mt-2 px-3 py-1.5 rounded bg-[var(--fg)] text-[var(--surface)] text-sm"
        >
          Fermer la session
        </button>
      </div>
    );
  }

  const activeLabel = findNavItem(currentPage)?.label || currentPage;

  return (
    <div className="dashboard-shell flex min-h-screen bg-[var(--surface)]">
      <aside className="w-56 xl:w-64 shrink-0 bg-[var(--sidebar-bg)] text-[var(--sidebar-fg)] flex flex-col h-screen sticky top-0 border-r border-[var(--sidebar-border)]">
        <div className="p-4 border-b border-[var(--sidebar-border)]">
          <p className="font-semibold text-sm text-[var(--sidebar-fg)]">PharmaOS Dashboard</p>
          <p className="text-xs text-[var(--sidebar-muted)] truncate mt-1">
            {profile?.display_name || user?.email}
          </p>
          <p className="text-[10px] text-[var(--sidebar-muted)] mt-0.5">{labelRole(role)}</p>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-5">
          {visibleSections.map((section, sectionIdx) => (
            <div key={section.title}>
              <p className="text-[10px] uppercase tracking-wider text-[var(--sidebar-muted)] font-bold px-2 mb-2">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item, itemIdx) => {
                  const Icon = item.icon;
                  const active = resolveNavPageId(currentPage) === item.id;
                  const colorIndex = visibleSections
                    .slice(0, sectionIdx)
                    .reduce((n, s) => n + s.items.length, 0) + itemIdx;
                  const isColore = (preferences?.theme || 'clair') === 'colore';
                  const rainbowStyle = isColore
                    ? {
                      background: active
                        ? `linear-gradient(90deg, color-mix(in srgb, var(--mod-${colorIndex % 12}) 55%, white), color-mix(in srgb, var(--mod-${(colorIndex + 1) % 12}) 35%, white))`
                        : `linear-gradient(90deg, color-mix(in srgb, var(--mod-${colorIndex % 12}) 22%, white), color-mix(in srgb, var(--mod-${(colorIndex + 1) % 12}) 12%, white))`,
                    }
                    : undefined;
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        title={item.label}
                        aria-label={item.label}
                        onClick={() => goTo(item.id)}
                        style={rainbowStyle}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                          active
                            ? isColore
                              ? 'font-medium text-[var(--sidebar-fg)]'
                              : 'bg-[var(--sidebar-active)] text-[var(--sidebar-fg)] font-medium'
                            : isColore
                              ? 'text-[var(--sidebar-fg)] hover:opacity-90'
                              : 'text-[var(--sidebar-fg)] opacity-80 hover:bg-[var(--sidebar-hover)] hover:opacity-100'
                        }`}
                      >
                        <Icon
                          size={16}
                          className={active ? 'opacity-100' : 'opacity-70'}
                          style={isColore ? { color: `var(--mod-${colorIndex % 12})` } : undefined}
                        />
                        {item.label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-[var(--sidebar-border)]">
          <button
            type="button"
            onClick={signOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-[var(--sidebar-fg)] opacity-70 hover:bg-[var(--sidebar-hover)] hover:opacity-100"
          >
            <LogOut size={16} /> Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto text-[var(--fg)]">
        <div className="p-6 xl:p-8 max-w-[1600px]">
          {renderDashboardPage(currentPage, activeLabel, goTo, pageData)}
        </div>
      </main>
    </div>
  );
}
