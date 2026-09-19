import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './core/AuthContext.jsx';
import BugReport from './shell/BugReport.jsx';
import { setLogSurface } from './shared/logService.js';
import './index.css';

function BugApp() {
  useEffect(() => { setLogSurface('bug'); }, []);
  return <BugReport />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BugApp />
    </AuthProvider>
  </React.StrictMode>,
);
