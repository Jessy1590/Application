import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider, useAuth } from './core/AuthContext.jsx';
import { bindModuleBeforeCloseBridge, onModuleChangeView } from './shared/windowService.js';
import { MODULE_VIEW_FEATURE } from './core/access.js';
import { logEvent, setLogSurface } from './shared/logService.js';
import './index.css';

import Directory from './modules/directory/comptoir/Directory.jsx';
import Calls from './modules/calls/comptoir/Calls.jsx';
import Ip from './modules/ip/comptoir/IP.jsx';
import Tasks from './modules/tasks/comptoir/Tasks.jsx';
import QuickAction from './modules/tasks/comptoir/QuickAction.jsx';
import Location from './modules/location/comptoir/Location.jsx';
import Magistral from './modules/magistral/comptoir/Magistral.jsx';
import Psl from './modules/psl/comptoir/Psl.jsx';
import CashClosure from './modules/cash/comptoir/CashClosure.jsx';
import Disputes from './modules/disputes/comptoir/Disputes.jsx';
import Quality from './modules/quality/comptoir/Quality.jsx';
import Documents from './modules/documents/comptoir/Documents.jsx';
import Perimes from './modules/perimes/comptoir/Perimes.jsx';
import PerimesVitrine from './modules/perimes/comptoir/PerimesVitrine.jsx';
import StockError from './modules/stock/comptoir/StockError.jsx';
import LotAlerts from './modules/lot-alerts/comptoir/LotAlerts.jsx';
import StupefiantReception from './modules/stupefiants/comptoir/StupefiantReception.jsx';
import Hr from './modules/hr/comptoir/Hr.jsx';
import Inbox from './modules/inbox/comptoir/Inbox.jsx';
import AccountManager from './modules/admin/dashboard/AccountManager.jsx';
import { ForcePasswordChangeGate } from './modules/admin/shared/AccountForms.jsx';

/** Placeholder jusqu'à migration des modules restants. */
function PlaceholderModule({ title }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-800 p-6">
      <h1 className="text-2xl font-bold mb-2">{title}</h1>
      <p className="text-slate-500 text-sm">Module en cours de migration depuis PharmaOs-legacy.</p>
    </div>
  );
}

const VIEW_TITLES = {
  inbox: 'À traiter',
  directory: 'Annuaire',
  call: 'Appels',
  ip: 'Act-IP',
  tasks: 'Tâches',
  order: 'Commande médicament',
  billing: 'Facturation',
  quality: 'Qualité',
  documents: 'Documents',
  perimes: 'Périmés',
  perimes_vitrine: 'MEA / Promo / Challenge',
  stock: 'Erreur de stock',
  location_creation: 'Location — Création',
  location_prolongation: 'Location — Prolongation',
  location_cloture: 'Location — Clôture',
  location_contact: 'Location — Contact',
  location: 'Location',
  disputes: 'Litiges',
  lot_alerts: 'Alertes lot',
  magistral_creation: 'Magistrales — Commander',
  magistral_devis: 'Magistrales — Devis ST / patient',
  magistral_rappel: 'Magistrales — Rappel patient',
  magistral_dispenser: 'Magistrales — Dispenser',
  magistral_renouvellement: 'Magistrales — Renouvellement',
  magistral: 'Magistrales',
  psl: 'MDS',
  psl_reception: 'MDS — Réception',
  psl_delivrance: 'MDS — Délivrance',
  stupefiants: 'Stupéfiants — réception',
  cash: 'Clôture de caisse',
  hr: 'RH',
  compte: 'Mon compte',
};

function renderModuleView(view, moduleData) {
  switch (view) {
    case 'inbox':
      return <Inbox initialTab={moduleData?.tab || 'inbox'} />;
    case 'directory':
      return <Directory />;
    case 'call':
      return <Calls data={moduleData} />;
    case 'ip':
      return <Ip data={moduleData} />;
    case 'tasks':
      return <Tasks />;
    case 'order':
      return <QuickAction type="order" />;
    case 'billing':
      return <QuickAction type="billing" />;
    case 'location_creation':
    case 'location_prolongation':
    case 'location_cloture':
    case 'location_contact':
    case 'location':
      return <Location view={view} data={moduleData} />;
    case 'magistral_creation':
    case 'magistral_devis':
    case 'magistral_rappel':
    case 'magistral_dispenser':
    case 'magistral_renouvellement':
    case 'magistral':
      return <Magistral view={view} />;
    case 'psl':
      return <Psl view="delivrance" />;
    case 'psl_reception':
      return <Psl view="reception" />;
    case 'psl_delivrance':
      return <Psl view="delivrance" />;
    case 'stupefiants':
      return <StupefiantReception />;
    case 'cash':
      return <CashClosure />;
    case 'disputes':
      return <Disputes data={moduleData} />;
    case 'quality':
      return <Quality data={moduleData} />;
    case 'documents':
      return <Documents />;
    case 'perimes':
      return <Perimes />;
    case 'perimes_vitrine':
      return <PerimesVitrine />;
    case 'stock':
      return <StockError />;
    case 'lot_alerts':
      return <LotAlerts />;
    case 'hr':
      return <Hr />;
    case 'compte':
      return <AccountManager compact />;
    default:
      return <PlaceholderModule title={VIEW_TITLES[view] || `Module : ${view || 'inconnu'}`} />;
  }
}

function ModuleDenied({ title }) {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-800 p-6 text-center">
      <h1 className="text-xl font-semibold mb-2">Accès refusé</h1>
      <p className="text-sm text-slate-500 max-w-md">
        La mission <strong>{title}</strong> n’est pas visible pour votre rôle.
      </p>
    </div>
  );
}

function ModuleApp() {
  const { canAccess, isLoading, mustChangePassword, reloadProfile } = useAuth();
  const [currentView, setCurrentView] = useState(
    () => window.location.hash.replace('#', '') || 'directory'
  );
  const [moduleData, setModuleData] = useState(null);

  useEffect(() => {
    setLogSurface('module');
  }, []);

  useEffect(() => {
    const unsubView = onModuleChangeView((view, data) => {
      setCurrentView(view);
      setModuleData(data ?? null);
      logEvent({
        category: 'ui',
        action: 'module_view',
        entity: view,
        message: `Module → ${view}`,
      });
    });
    const unsubClose = bindModuleBeforeCloseBridge();
    return () => {
      unsubView?.();
      unsubClose?.();
    };
  }, []);

  const featureId = MODULE_VIEW_FEATURE[currentView] || currentView;
  const title = VIEW_TITLES[currentView] || currentView;

  if (isLoading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center text-slate-500 text-sm">
        Chargement…
      </div>
    );
  }

  return (
    <div className="w-screen h-screen overflow-hidden bg-white flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {currentView === 'compte' || canAccess('taskbar', featureId)
          ? renderModuleView(currentView, moduleData)
          : <ModuleDenied title={title} />}
      </div>
      {mustChangePassword && (
        <ForcePasswordChangeGate onDone={() => reloadProfile?.()} />
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <ModuleApp />
    </AuthProvider>
  </React.StrictMode>
);
