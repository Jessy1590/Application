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

  return <Dashboard onNavigate={navigate} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}