/**
 * Boot commun des pages modules Location (création, suivi, contact, facture, parc).
 * body[data-module="…"] + #locModuleRoot
 */
(function () {
  const TITLES = {
    creation: 'Création',
    suivi: 'Suivi',
    contact: 'Contact',
    facture: 'Facture',
    parc: 'Parc',
  };

  function queryId() {
    try {
      return new URLSearchParams(window.location.search).get('id') || null;
    } catch (_) {
      return null;
    }
  }

  function queryParams() {
    try {
      return new URLSearchParams(window.location.search);
    } catch (_) {
      return new URLSearchParams();
    }
  }

  function ctxFromSnap(snap, matrix) {
    const role = LocationAccess.resolveRole(snap);
    return {
      userId: snap?.userId || null,
      isAdmin: !!snap?.isAdmin,
      isGestionnaire: !!snap?.isGestionnaire,
      role,
      matrix,
      can(feature) {
        return LocationAccess.can(role, feature, matrix);
      },
      initialDossierId: null,
      creationPrefill: null,
      openSuivi(dossierId) {
        const q = dossierId ? `?id=${encodeURIComponent(dossierId)}` : '';
        window.location.href = `suivi.html${q}`;
      },
      openCreation(fields) {
        const params = new URLSearchParams();
        if (fields && typeof fields === 'object') {
          Object.entries(fields).forEach(([k, v]) => {
            if (v != null && String(v) !== '') params.set(k, String(v));
          });
        }
        const q = params.toString();
        window.location.href = `creation.html${q ? `?${q}` : ''}`;
      },
    };
  }

  async function mountModule(name, root, ctx) {
    if (name === 'creation') await LocationCreation.mount(root, ctx);
    else if (name === 'suivi') await LocationSuivi.mount(root, ctx);
    else if (name === 'contact') await LocationContact.mount(root, ctx);
    else if (name === 'facture') await LocationFacture.mount(root, ctx);
    else if (name === 'parc') await LocationParc.mount(root, ctx);
    else root.innerHTML = `<p class="loc-msg loc-msg-err">Module inconnu.</p>`;
  }

  async function boot() {
    PhieTheme.init();
    PhieFab.mount({
      app: 'location',
      homeHref: '../../index.html',
    });

    document.getElementById('locThemeBtn')?.addEventListener('click', () => {
      PhieTheme.toggle();
    });

    const name = document.body.dataset.module || '';
    const titleEl = document.getElementById('locModuleTitle');
    if (titleEl) titleEl.textContent = TITLES[name] || name;

    const root = document.getElementById('locModuleRoot');
    if (!root) return;

    let snap = null;
    try {
      snap = await PhieEquipe.load();
    } catch (_) {
      snap = null;
    }

    let matrix = null;
    try {
      matrix = await LocationAccess.loadMatrix();
    } catch (_) {
      matrix = LocationAccess.cloneDefaults();
    }

    const moduleFeature = LocationAccess.featureForModule(name);
    if (moduleFeature && !LocationAccess.can(LocationAccess.resolveRole(snap), moduleFeature, matrix)) {
      root.innerHTML =
        '<p class="loc-msg loc-msg-err">Accès refusé pour votre rôle. <a href="index.html">Retour</a></p>';
      return;
    }

    const ctx = ctxFromSnap(snap, matrix);
    if (name === 'suivi') ctx.initialDossierId = queryId();
    if (name === 'creation') {
      const qp = queryParams();
      ctx.creationPrefill = {
        source: qp.get('source') || null,
        type_appareil: qp.get('type_appareil') || null,
        numero_pharmacie: qp.get('numero_pharmacie') || null,
        matricule: qp.get('matricule') || null,
        step: qp.get('step') || null,
      };
    }

    root.innerHTML = '<p class="loc-muted">Chargement…</p>';
    try {
      await mountModule(name, root, ctx);
    } catch (e) {
      root.innerHTML = `<p class="loc-msg loc-msg-err">${String(e.message || e)}</p>`;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
