import React, { useEffect, useRef, useState } from 'react';
import { BedDouble } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { openModuleWindow, openDashboardWindow } from '../../../shared/windowService.js';
import {
  loadMatrix,
  cloneDefaults,
  featureForModule,
  can as locationCan,
  resolveRoleFromPortail,
} from '../services/locationAccess.js';
import { ensureLocationGlobals } from '../services/locationGlobals.js';
import { MODULE_TITLES, mountLocationModule } from '../phie/bootstrap.js';

import '../css/location-pharmaos.css';
import '../css/transcription.css';

function normalizeModule(view) {
  const v = String(view || '').replace(/^location_/, '');
  if (MODULE_TITLES[v]) return v;
  return 'suivi';
}

/**
 * Pont React → logique Location (DOM mount) dans un chrome PharmaOS.
 */
export default function LocationPhieMount({
  module: moduleProp,
  surface = 'dashboard',
  initialDossierId = null,
  initialCloture = false,
  creationPrefill = null,
  onNavigate = null,
  showChrome = true,
}) {
  const { user, role, canAccess, accessOverrides, isLoading } = useAuth();
  const rootRef = useRef(null);
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);
  const name = normalizeModule(moduleProp);

  useEffect(() => {
    ensureLocationGlobals();
  }, []);

  useEffect(() => {
    if (isLoading) return undefined;
    let cancelled = false;

    async function boot() {
      setErr('');
      setReady(false);
      const root = rootRef.current;
      if (!root) return;

      const surfaceKey = surface === 'module' ? 'taskbar' : 'dashboard';
      const shellOk = canAccess(surfaceKey, 'location');
      if (!shellOk) {
        root.innerHTML =
          '<p class="loc-msg loc-msg-err">Accès refusé — Location non autorisé pour votre rôle (Accès &amp; rôles).</p>';
        setReady(true);
        return;
      }

      let matrix = null;
      try {
        matrix = await loadMatrix(true);
      } catch {
        matrix = cloneDefaults();
      }
      if (cancelled) return;

      const locRole = resolveRoleFromPortail(role);
      const moduleFeature = name === 'parametres'
        ? 'parametres_location'
        : featureForModule(name);

      if (moduleFeature && !locationCan(locRole, moduleFeature, matrix)) {
        root.innerHTML =
          '<p class="loc-msg loc-msg-err">Accès refusé pour votre rôle sur ce sous-module Location.</p>';
        setReady(true);
        return;
      }

      const navigate = (pageId, data) => {
        if (typeof onNavigate === 'function') {
          onNavigate(pageId, data || null);
          return;
        }
        if (surface === 'module') {
          openModuleWindow(pageId, data || null);
          return;
        }
        openDashboardWindow({ page: pageId, ...(data || {}) });
      };

      const ctx = {
        userId: user?.id || null,
        isAdmin: locRole === 'administrateur',
        isGestionnaire: locRole === 'gestionnaire',
        role: locRole,
        matrix,
        can(feature) {
          return locationCan(locRole, feature, matrix);
        },
        initialDossierId: initialDossierId || null,
        initialCloture: !!initialCloture,
        creationPrefill: creationPrefill || null,
        openSuivi(dossierId, opts) {
          navigate('location_suivi', {
            id: dossierId || null,
            cloture: !!(opts && opts.cloture),
          });
        },
        openCloture(dossierId) {
          navigate('location_cloture', { id: dossierId || null });
        },
        openProlongation(dossierId) {
          navigate('location_prolongation', { id: dossierId || null });
        },
        openCreation(fields) {
          navigate('location_creation', fields && typeof fields === 'object' ? fields : null);
        },
      };

      root.innerHTML = '<p class="loc-muted">Chargement…</p>';
      try {
        await mountLocationModule(name, root, ctx);
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          root.innerHTML = `<p class="loc-msg loc-msg-err">${String(e.message || e)}</p>`;
          setErr(String(e.message || e));
          setReady(true);
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
      if (rootRef.current) rootRef.current.innerHTML = '';
    };
  }, [
    isLoading,
    canAccess,
    accessOverrides,
    role,
    user?.id,
    name,
    surface,
    initialDossierId,
    initialCloture,
    creationPrefill,
    onNavigate,
  ]);

  if (isLoading) {
    return (
      <div className="loc-shell max-w-5xl">
        <p className="text-sm text-slate-500">Chargement…</p>
      </div>
    );
  }

  const title = MODULE_TITLES[name] || name;

  return (
    <div
      className={`loc-shell${name === 'transcription' ? ' loc-transcription-page' : ''}${name === 'parametres' ? ' loc-params-page' : ' loc-module-page'}`}
      data-module={name}
    >
      {showChrome && (
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
              <BedDouble className="text-cyan-600" size={26} />
              {title}
            </h1>
            <p className="text-sm text-slate-500 mt-1">Location</p>
          </div>
        </header>
      )}
      <main
        className={
          name === 'parametres'
            ? 'loc-params-page-main'
            : name === 'transcription'
              ? 'loc-module-page-main loc-transcription-main'
              : 'loc-module-page-main'
        }
        id="locModuleRoot"
        ref={rootRef}
      >
        {!ready && !err ? <p className="text-sm text-slate-500">Chargement…</p> : null}
      </main>
    </div>
  );
}
