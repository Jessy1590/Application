import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './core/AuthContext.jsx';
import Login from './shell/Login.jsx';
import Taskbar from './shell/Taskbar.jsx';
import { loginWindow, expandWindow } from './shared/windowService.js';

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      expandWindow();
    } else {
      loginWindow();
    }
  }, [isAuthenticated, isLoading]);

  if (isLoading) return null;

  return isAuthenticated ? <Taskbar /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
