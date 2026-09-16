/**
 * Shell Location — navigation modules + thème + admin.
 */
(function () {
  const TITLES = {
    creation: 'Création',
    suivi: 'Suivi',
    contact: 'Contact',
    facture: 'Facture',
  };

  let snap = null;
  let currentView = null;
  let pendingSuiviId = null;

  function ctx() {
    return {
      userId: snap?.userId || null,
      isAdmin: !!snap?.isAdmin,
      isGestionnaire: !!snap?.isGestionnaire,
      openSuivi(dossierId) {
        pendingSuiviId = dossierId || null;
        showView('suivi');
      },
    };
  }

  function showHome() {
    currentView = null;
    document.getElementById('locHome').hidden = false;
    document.getElementById('locPanel').hidden = true;
    document.getElementById('locViewContent').innerHTML = '';
  }

  async function showView(view) {
    currentView = view;
    document.getElementById('locHome').hidden = true;
    const panel = document.getElementById('locPanel');
    panel.hidden = false;
    document.getElementById('locPanelTitle').textContent = TITLES[view] || view;
    const content = document.getElementById('locViewContent');
    content.innerHTML = '<p class="loc-muted">Chargement…</p>';
    const c = ctx();
    try {
      if (view === 'creation') await LocationCreation.mount(content, c);
      else if (view === 'suivi') {
        c.initialDossierId = pendingSuiviId;
        pendingSuiviId = null;
        await LocationSuivi.mount(content, c);
      } else if (view === 'contact') await LocationContact.mount(content, c);
      else if (view === 'facture') await LocationFacture.mount(content, c);
    } catch (e) {
      content.innerHTML = `<p class="loc-msg loc-msg-err">${String(e.message || e)}</p>`;
    }
  }

  async function boot() {
    PhieTheme.init();
    PhieFab.mount({
      app: 'location',
      homeHref: '../../index.html',
    });

    try {
      snap = await PhieEquipe.load();
    } catch (_) {
      snap = null;
    }

    const gear = document.getElementById('locGearBtn');
    if (snap?.isAdmin) gear.hidden = false;
    gear.addEventListener('click', () => {
      LocationAdmin.open(ctx());
    });

    document.getElementById('locThemeBtn').addEventListener('click', () => {
      PhieTheme.toggle();
    });

    document.getElementById('locHome').querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => showView(btn.dataset.view));
    });

    document.getElementById('locBackBtn').addEventListener('click', showHome);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
