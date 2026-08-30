import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './core/AuthContext.jsx';
import Login from './modules/Auth/Login.jsx';
import Taskbar from './modules/Taskbar/Taskbar.jsx';
import { loginWindow, expandWindow } from './services/windowService.js';

// App.jsx ne sert que de routeur / gestionnaire d'etat global (regle CLAUDE.md 3).
// L'etat d'auth (user/session) vit dans core/AuthContext.jsx (Context global).
// La taille/position de la fenetre Electron suit cet etat : centree (login)
// tant que non authentifie, barre du haut (expanded) une fois connecte.
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

  if (isLoading) return null; // evite un flash Login -> Taskbar au demarrage

  return isAuthenticated ? <Taskbar /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
