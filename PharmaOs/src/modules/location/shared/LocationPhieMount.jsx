import React, { useEffect, useRef, useState } from 'react';
import { BedDouble } from 'lucide-react';
import { useAuth } from '../../../core/AuthContext.jsx';
import { openModuleWindow, openDashboardWindow } from '../../../shared/windowService.js';
import { resolveRoleFromPortail } from '../services/locationAccess.js';
import { ensureLocationGlobals } from '../services/locationGlobals.js';
import { MODULE_TITLES, mountLocationModule } from '../phie/bootstrap.js';

import '../css/location-pharmaos.css';
import '../css/transcription.css';

function normalizeModule(view) {
  const v = String(view || '').replace(/^location_/, '');
  if (MODULE_TITLES[v]) return v;
  return 'suivi';
}

function prefillKey(prefill) {
  if (!prefill || typeof prefill !== 'object') return '';
  try {
    return JSON.stringify(prefill);
  } catch {
    return '';
  }
}

/**
 * Pont React → logique Location (DOM mount) dans un chrome PharmaOS.
 * Remount uniquement si le module / dossier / surface change — pas à chaque render parent.
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
  const { user, role, canAccess, hasCasquette, isLoading } = useAuth();
  const rootRef = useRef(null);
  const [err, setErr] = useState('');
  const [ready, setReady] = useState(false);
  const name = normalizeModule(moduleProp);

  const onNavigateRef = useRef(onNavigate);
  const canAccessRef = useRef(canAccess);
  const hasCasquetteRef = useRef(hasCasquette);
  const roleRef = useRef(role);
  const userIdRef = useRef(user?.id || null);
  const surfaceRef = useRef(surface);
  const prefillRef = useRef(creationPrefill);
  const dossierRef = useRef(initialDossierId);
  const clotureRef = useRef(initialCloture);

  onNavigateRef.current = onNavigate;
  canAccessRef.current = canAccess;
  hasCasquetteRef.current = hasCasquette;
  roleRef.current = role;
  userIdRef.current = user?.id || null;
  surfaceRef.current = surface;
  prefillRef.current = creationPrefill;
  dossierRef.current = initialDossierId;
  clotureRef.current = initialCloture;

  const mountKey = [
    name,
    surface,
    initialDossierId || '',
    initialCloture ? '1' : '0',
    prefillKey(creationPrefill),
  ].join('|');

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

      const surfaceKey = surfaceRef.current === 'module' ? 'taskbar' : 'dashboard';
      const shellOk = canAccessRef.current(surfaceKey, 'location');
      if (!shellOk) {
        root.innerHTML =
          '<p class="loc-msg loc-msg-err">Accès refusé — Location non autorisé pour votre rôle (Accès &amp; rôles).</p>';
        setReady(true);
        return;
      }

      if (cancelled) return;

      const locRole = resolveRoleFromPortail(roleRef.current, {
        hasLocationCasquette: !!hasCasquetteRef.current?.('location'),
      });

      const navigate = (pageId, data) => {
        const nav = onNavigateRef.current;
        if (typeof nav === 'function') {
          nav(pageId, data || null);
          return;
        }
        if (surfaceRef.current === 'module') {
          openModuleWindow(pageId, data || null);
          return;
        }
        openDashboardWindow({ page: pageId, ...(data || {}) });
      };

      const ctx = {
        userId: userIdRef.current,
        isAdmin: locRole === 'administrateur',
        isGestionnaire: locRole === 'gestionnaire',
        role: locRole,
        matrix: null,
        can() {
          return true;
        },
        initialDossierId: dossierRef.current || null,
        initialCloture: !!clotureRef.current,
        creationPrefill: prefillRef.current || null,
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
    // Remount seulement si le module / contexte métier change — pas canAccess/onNavigate.
  }, [isLoading, mountKey, name]);

  if (isLoading) {
    return (
      <div className={`loc-shell max-w-5xl${surface === 'module' ? ' loc-surface-module' : ''}`}>
        <p className="text-sm text-slate-500">Chargement…</p>
      </div>
    );
  }

  const title = MODULE_TITLES[name] || name;
  const mainClass =
    name === 'parametres'
      ? 'loc-params-page-main'
      : name === 'transcription'
        ? 'loc-module-page-main loc-transcription-main'
        : 'loc-module-page-main';

  const surfaceClass = surface === 'module' ? ' loc-surface-module' : '';

  return (
    <div
      className={`loc-shell${name === 'transcription' ? ' loc-transcription-page' : ''}${name === 'parametres' ? ' loc-params-page' : ' loc-module-page'}${surfaceClass}`}
      data-module={name}
      data-surface={surface}
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
      {/* Cible DOM vide : mount Phie via innerHTML — pas d’enfants React sur le ref. */}
      <main className={mainClass}>
        {!ready && !err ? <p className="text-sm text-slate-500">Chargement…</p> : null}
        <div id="locModuleRoot" ref={rootRef} />
      </main>
    </div>
  );
}
