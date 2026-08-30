import React, { useState } from 'react';
import { AuthProvider, useAuth } from './core/AuthContext.jsx';
import Login from './pages/Login.jsx';
import AccessDenied from './pages/AccessDenied.jsx';
import Dashboard from './pages/Dashboard.jsx';
import DirectoryManager from './pages/DirectoryManager.jsx';
import CallTracking from './pages/CallTracking.jsx';
import TasksManager from './pages/TasksManager.jsx';
import AgendaManager from './pages/AgendaManager.jsx'; 
import IpManagement from './pages/IpManagement.jsx';
import QualityManager from './pages/QualityManager.jsx';
import ControlsManager from './pages/ControlsManager.jsx';
import DocumentManager from './pages/DocumentManager.jsx';
import RetraitLotManager from './pages/RetraitLotManager.jsx';
import PerimesManager from './pages/PerimesManager.jsx';
import StockErrorManager from './pages/StockErrorManager.jsx';
import RentalManager from './pages/RentalManager.jsx';
import DisputesManager from './pages/DisputesManager.jsx';
import MagistralManager from './pages/MagistralManager.jsx';
import PslManager from './pages/PslManager.jsx';
import CashManager from './pages/CashManager.jsx';
import HrManager from './pages/HrManager.jsx';

function Router() {
  const { isLoading, isAuthenticated, isAuthorized } = useAuth();
  
  // L'état stocke désormais la page ET les paramètres de filtres
  const [route, setRoute] = useState({ page: 'dashboard', params: {} });

  // La fonction navigate doit être déclarée ICI, dans le composant Router
  const navigate = (page, params = {}) => {
    setRoute({ page, params });
  };

  if (isLoading) return null; // évite un flash au chargement initial

  if (!isAuthenticated) return <Login />;
  if (!isAuthorized) return <AccessDenied />;
  
  if (route.page === 'directory') {
    return <DirectoryManager onNavigate={navigate} />;
  }
  
  if (route.page === 'calls') {
    return <CallTracking onNavigate={navigate} initialFilter={route.params?.status} />;
  }

  if (route.page === 'tasks') return <TasksManager onNavigate={navigate} />;
  if (route.page === 'agenda') return <AgendaManager onNavigate={navigate} />;
  if (route.page === 'ip') return <IpManagement onNavigate={navigate} />;
  if (route.page === 'quality') return <QualityManager onNavigate={navigate} />;
  if (route.page === 'controls') return <ControlsManager onNavigate={navigate} />;
  if (route.page === 'documents') return <DocumentManager onNavigate={navigate} />;
  if (route.page === 'retrait_lot') return <RetraitLotManager onNavigate={navigate} />;
  if (route.page === 'perimes') return <PerimesManager onNavigate={navigate} />;
  if (route.page === 'stock') return <StockErrorManager onNavigate={navigate} />;
  if (route.page === 'rental') return <RentalManager onNavigate={navigate} />;
  if (route.page === 'disputes') return <DisputesManager onNavigate={navigate} />;
  if (route.page === 'magistral') return <MagistralManager onNavigate={navigate} />;
  if (route.page === 'psl') return <PslManager onNavigate={navigate} />;
  if (route.page === 'cash') return <CashManager onNavigate={navigate} />;
  if (route.page === 'hr') return <HrManager onNavigate={navigate} />;

  return <Dashboard onNavigate={navigate} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}