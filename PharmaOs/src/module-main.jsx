import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './core/AuthContext.jsx';
import { bindModuleBeforeCloseBridge } from './shared/windowService.js';
import './index.css';

import Directory from './modules/directory/comptoir/Directory.jsx';
import Calls from './modules/calls/comptoir/Calls.jsx';
import Ip from './modules/ip/comptoir/IP.jsx';
import Tasks from './modules/tasks/comptoir/Tasks.jsx';
import QuickAction from './modules/tasks/comptoir/QuickAction.jsx';
import Rental from './modules/rental/comptoir/Rental.jsx';
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
  rental: 'Location',
  disputes: 'Litiges',
  lot_alerts: 'Alertes lot',
  magistral: 'Magistrales',
  psl: 'MDS',
  cash: 'Clôture de caisse',
};

function renderModuleView(view, moduleData) {
  switch (view) {
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
    case 'rental':
      return <Rental />;
    case 'magistral':
      return <Magistral />;
    case 'psl':
      return <Psl />;
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
    default:
      return <PlaceholderModule title={VIEW_TITLES[view] || `Module : ${view || 'inconnu'}`} />;
  }
}

function ModuleApp() {
  const [currentView, setCurrentView] = useState(
    () => window.location.hash.replace('#', '') || 'directory'
  );
  const [moduleData, setModuleData] = useState(null);

  useEffect(() => {
    if (window.electronAPI?.onModuleChangeView) {
      window.electronAPI.onModuleChangeView((view, data) => {
        setCurrentView(view);
        setModuleData(data ?? null);
      });
    }
    return bindModuleBeforeCloseBridge();
  }, []);

  return (
    <div className="w-screen h-screen overflow-hidden bg-white flex flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto">
        {renderModuleView(currentView, moduleData)}
      </div>
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
