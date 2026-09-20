import React from 'react';
import { useAuth } from '../../../core/AuthContext.jsx';
import MagistralCreate from './MagistralCreate.jsx';
import MagistralDevis from './MagistralDevis.jsx';
import MagistralRappel from './MagistralRappel.jsx';
import MagistralDispenser from './MagistralDispenser.jsx';
import MagistralRenouvellement from './MagistralRenouvellement.jsx';

/**
 * Point d’entrée fenêtre module / dashboard — hash / view.
 * Accès : matrice PharmaOS (taskbar/dashboard × magistral). Pas d’onglets internes.
 */
function normalizeView(view) {
  const v = String(view || '').replace(/^magistral_?/, '') || 'creation';
  if (['creation', 'devis', 'rappel', 'dispenser', 'renouvellement'].includes(v)) return v;
  if (v === 'magistral' || v === '') return 'creation';
  return 'creation';
}

function Denied() {
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <h1 className="text-xl font-semibold text-slate-800 mb-2">Accès refusé</h1>
      <p className="text-sm text-slate-500 max-w-md">
        Les préparations magistrales ne sont pas ouvertes pour votre compte. Un administrateur peut
        les activer dans Accès &amp; rôles.
      </p>
    </div>
  );
}

export default function Magistral({ view: viewProp, onNavigate: _onNavigate = null }) {
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

  if (!canAccess('taskbar', 'magistral') && !canAccess('dashboard', 'magistral')) {
    return <Denied />;
  }

  switch (view) {
    case 'devis':
      return <MagistralDevis />;
    case 'rappel':
      return <MagistralRappel />;
    case 'dispenser':
      return <MagistralDispenser />;
    case 'renouvellement':
      return <MagistralRenouvellement />;
    case 'creation':
    default:
      return <MagistralCreate />;
  }
}
