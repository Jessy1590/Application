import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './core/AuthContext.jsx';
import DashboardShell from './shell/DashboardShell.jsx';
import './index.css';

document.documentElement.classList.add('dashboard-app');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <DashboardShell />
    </AuthProvider>
  </React.StrictMode>
);
