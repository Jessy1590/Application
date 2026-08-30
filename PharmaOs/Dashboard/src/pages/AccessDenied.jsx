import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../core/AuthContext.jsx';

export default function AccessDenied() {
  const { signOut, user } = useAuth();

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col items-center gap-3 text-center">
        <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
          <ShieldAlert size={20} className="text-red-600" />
        </div>
        <h1 className="text-slate-900 text-lg font-semibold">Accès refusé</h1>
        <p className="text-slate-500 text-sm">
          Le compte {user?.email} est connecté mais n'a pas le rôle Admin requis
          (portail.profiles.role) pour consulter ce dashboard.
        </p>
        <button
          onClick={signOut}
          className="mt-2 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors"
        >
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
