/**
 * Boot commun des pages modules Location (création, suivi, contact, facture).
 * body[data-module="…"] + #locModuleRoot
 */
(function () {
  const TITLES = {
    creation: 'Création',
    suivi: 'Suivi',
    contact: 'Contact',
    facture: 'Facture',
  };

  function queryId() {
    try {
      return new URLSearchParams(window.location.search).get('id') || null;
    } catch (_) {
      return null;
    }
  }

  function ctxFromSnap(snap) {
    return {
      userId: snap?.userId || null,
      isAdmin: !!snap?.isAdmin,
      isGestionnaire: !!snap?.isGestionnaire,
      initialDossierId: null,
      openSuivi(dossierId) {
        const q = dossierId ? `?id=${encodeURIComponent(dossierId)}` : '';
        window.location.href = `suivi.html${q}`;
      },
    };
  }

  async function mountModule(name, root, ctx) {
    if (name === 'creation') await LocationCreation.mount(root, ctx);
    else if (name === 'suivi') await LocationSuivi.mount(root, ctx);
    else if (name === 'contact') await LocationContact.mount(root, ctx);
    else if (name === 'facture') await LocationFacture.mount(root, ctx);
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

    const ctx = ctxFromSnap(snap);
    if (name === 'suivi') ctx.initialDossierId = queryId();

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
