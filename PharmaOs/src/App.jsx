import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './core/AuthContext.jsx';
import Login from './shell/Login.jsx';
import Taskbar from './shell/Taskbar.jsx';
import { ForcePasswordChangeGate } from './modules/admin/shared/AccountForms.jsx';
import { loginWindow, expandWindow } from './shared/windowService.js';

function Router() {
  const { isAuthenticated, isLoading, mustChangePassword, reloadProfile } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      expandWindow();
    } else {
      loginWindow();
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) return null;

  if (!isAuthenticated) return <Login />;

  return (
    <>
      <Taskbar />
      {mustChangePassword && (
        <ForcePasswordChangeGate onDone={() => reloadProfile?.()} />
      )}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
