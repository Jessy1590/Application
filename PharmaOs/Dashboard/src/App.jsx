import React, { useState } from 'react';
import { AuthProvider, useAuth } from './core/AuthContext.jsx';
import Login from './pages/Login.jsx';
import AccessDenied from './pages/AccessDenied.jsx';
import AppLayout from './components/AppLayout.jsx';
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

const PAGES = {
  dashboard: Dashboard,
  directory: DirectoryManager,
  calls: CallTracking,
  tasks: TasksManager,
  agenda: AgendaManager,
  ip: IpManagement,
  quality: QualityManager,
  controls: ControlsManager,
  documents: DocumentManager,
  retrait_lot: RetraitLotManager,
  perimes: PerimesManager,
  stock: StockErrorManager,
  rental: RentalManager,
  disputes: DisputesManager,
  magistral: MagistralManager,
  psl: PslManager,
  cash: CashManager,
  hr: HrManager,
};

function Router() {
  const { isLoading, isAuthenticated, isAuthorized } = useAuth();
  const [route, setRoute] = useState({ page: 'dashboard', params: {} });

  const navigate = (page, params = {}) => setRoute({ page, params });

  if (isLoading) return null;
  if (!isAuthenticated) return <Login />;
  if (!isAuthorized) return <AccessDenied />;

  const Page = PAGES[route.page] || Dashboard;
  const pageProps = route.page === 'calls' ? { initialFilter: route.params?.status } : {};

  return (
    <AppLayout currentPage={route.page} onNavigate={navigate}>
      <Page onNavigate={navigate} {...pageProps} />
    </AppLayout>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
