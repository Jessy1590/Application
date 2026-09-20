import React from 'react';
import LocationPhieMount from '../shared/LocationPhieMount.jsx';

/**
 * Vues dashboard Location — un onglet = un module PhieEvreux.
 * @param {{ view?: 'suivi'|'parc'|'facture'|'contact'|'parametres', onNavigate?: Function, pageData?: object }} props
 */
export default function LocationManager({ view = 'suivi', onNavigate = null, pageData = null }) {
  const tab = ['suivi', 'parc', 'facture', 'contact', 'parametres'].includes(view)
    ? view
    : 'suivi';

  return (
    <div className="min-h-[70vh] -m-1">
      <LocationPhieMount
        module={tab}
        surface="dashboard"
        initialDossierId={pageData?.id || pageData?.dossierId || null}
        initialCloture={!!pageData?.cloture}
        onNavigate={onNavigate}
        showChrome
      />
    </div>
  );
}
