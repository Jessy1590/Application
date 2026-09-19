import React from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import LocationPhieMount from '../shared/LocationPhieMount.jsx';

/**
 * Point d’entrée fenêtre module — hash / view.
 * Accès : matrice PharmaOS (taskbar/dashboard × location).
 */
function normalizeView(view) {
  const v = String(view || '').replace(/^location_/, '');
  if (['creation', 'prolongation', 'cloture', 'contact', 'suivi'].includes(v)) return v;
  return 'creation';
}

function Denied() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <h1 className="text-xl font-semibold text-slate-800 mb-2">Accès refusé</h1>
      <p className="text-sm text-slate-500 max-w-md">
        Le module Location n’est pas ouvert pour votre compte. Un administrateur peut l’activer
        dans Accès &amp; rôles.
      </p>
    </div>
  );
}

export default function Location({ view: viewProp, data = null, onNavigate = null }) {
  const { canAccess, isLoading } = useAuth();
  const view = normalizeView(
    viewProp || (typeof window !== 'undefined' ? window.location.hash.replace('#', '') : ''),
  );

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
        Chargement…
      </div>
    );
  }

  if (!canAccess('taskbar', 'location') && !canAccess('dashboard', 'location')) {
    return <Denied />;
  }

  const dossierId = data?.id || data?.dossierId || null;
  const creationPrefill = view === 'creation' && data && typeof data === 'object'
    ? {
      source: data.source || null,
      type_appareil: data.type_appareil || null,
      numero_pharmacie: data.numero_pharmacie || null,
      matricule: data.matricule || null,
      step: data.step || null,
    }
    : null;

  return (
    <LocationPhieMount
      module={view}
      surface={onNavigate ? 'dashboard' : 'module'}
      initialDossierId={dossierId}
      initialCloture={!!data?.cloture}
      creationPrefill={creationPrefill}
      onNavigate={onNavigate}
      showChrome
    />
  );
}
