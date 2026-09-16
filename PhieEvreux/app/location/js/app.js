/**
 * Hub Location — tuiles vers pages modules + thème.
 */
(function () {
  const HREF_FEATURE = {
    'creation.html': 'module_creation',
    'suivi.html': 'module_suivi',
    'contact.html': 'module_contact',
    'facture.html': 'module_facture',
    'parametres.html': 'parametres_location',
  };

  async function boot() {
    PhieTheme.init();
    PhieFab.mount({
      app: 'location',
      homeHref: '../../index.html',
    });

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
    const role = LocationAccess.resolveRole(snap);

    document.querySelectorAll('.loc-tiles .loc-tile[href]').forEach((tile) => {
      const href = tile.getAttribute('href') || '';
      const file = href.split('?')[0].split('/').pop();
      const feature = HREF_FEATURE[file];
      if (!feature) return;
      const allowed = LocationAccess.can(role, feature, matrix);
      if (file === 'parametres.html') {
        tile.hidden = !allowed;
      } else if (!allowed) {
        tile.hidden = true;
      }
    });

    document.getElementById('locThemeBtn')?.addEventListener('click', () => {
      PhieTheme.toggle();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
