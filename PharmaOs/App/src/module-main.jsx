import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './core/AuthContext.jsx';
import './index.css'; // Assure-toi que c'est bien le nom de ton fichier contenant Tailwind

// Import du module existant
import Directory from './modules/Directory/Directory.jsx';
import Calls from './modules/Calls/Calls.jsx';
import Ip from './modules/Ip/Ip.jsx';
import Tasks from './modules/Tasks/Tasks.jsx';
import QuickAction from './modules/Tasks/QuickAction.jsx';
import Quality from './modules/Quality/Quality.jsx';
import Controls from './modules/Controls/Controls.jsx';
import Documents from './modules/Documents/Documents.jsx';
import Perimes from './modules/Perimes/Perimes.jsx';
import StockError from './modules/Stock/StockError.jsx';
import Rental from './modules/Rental/Rental.jsx';
import Disputes from './modules/Disputes/Disputes.jsx';
import LotAlerts from './modules/LotAlerts/LotAlerts.jsx';
import Magistral from './modules/Magistral/Magistral.jsx';
import Psl from './modules/Psl/Psl.jsx';
import CashClosure from './modules/Cash/CashClosure.jsx';

// Composant temporaire pour les modules non terminés
const PlaceholderModule = ({ title, data }) => (
  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-800 p-6">
    <h1 className="text-2xl font-bold mb-4">{title}</h1>
    <p className="text-slate-500 mb-4">Ce module est en cours de développement (Phase 2).</p>
    {data && (
      <div className="bg-slate-200 p-4 rounded text-sm">
        <p className="font-bold">Données reçues :</p>
        <pre className="mt-2">{JSON.stringify(data, null, 2)}</pre>
      </div>
    )}
  </div>
);

function ModuleApp() {
  // Initialisation de la vue depuis l'URL (ex: file://.../module.html#directory -> 'directory')
  const [currentView, setCurrentView] = useState(() => {
    return window.location.hash.replace('#', '') || 'directory';
  });
  
  const [moduleData, setModuleData] = useState(null);

  useEffect(() => {
    // Si la fenêtre était déjà ouverte et qu'on clique sur un autre bouton de la barre,
    // le Main Process envoie un événement pour changer la vue à la volée.
    if (window.electronAPI && window.electronAPI.onModuleChangeView) {
      window.electronAPI.onModuleChangeView((view, data) => {
        setCurrentView(view);
        setModuleData(data);
      });
    }
  }, []);

  // Mini-routeur pour la fenêtre des modules
  const renderModule = () => {
    switch (currentView) {
      case 'directory':
        return <Directory />;
      case 'call':
        return <Calls data={moduleData} />;
      case 'ip':
        return <Ip />;
      case 'tasks':
        return <Tasks />;
      case 'order':
        return <QuickAction type="order" />;
      case 'billing':
        return <QuickAction type="billing" />;
      case 'quality':
        return <Quality />;
      case 'controls':
        return <Controls />;
      case 'documents':
        return <Documents />;
      case 'perimes':
        return <Perimes />;
      case 'stock':
        return <StockError />;
      case 'rental':
        return <Rental />;
      case 'disputes':
        return <Disputes />;
      case 'lot_alerts':
        return <LotAlerts />;
      case 'magistral':
        return <Magistral />;
      case 'psl':
        return <Psl />;
      case 'cash':
        return <CashClosure />;
      default:
        return <PlaceholderModule title="Module Introuvable" />;
    }
  };

  return (
    <div className="w-screen h-screen overflow-hidden bg-white flex flex-col">
      {renderModule()}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {/* On enveloppe dans AuthProvider pour que Supabase Auth soit dispo dans les modules */}
    <AuthProvider>
      <ModuleApp />
    </AuthProvider>
  </React.StrictMode>
);