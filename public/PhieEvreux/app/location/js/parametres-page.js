/**
 * Page dédiée Paramètres Location.
 */
(function () {
  async function boot() {
    PhieTheme.init();
    PhieFab.mount({
      app: 'location',
      homeHref: '../../index.html',
    });

    document.getElementById('locThemeBtn')?.addEventListener('click', () => {
      PhieTheme.toggle();
    });

    const root = document.getElementById('locParamsRoot');
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
    if (!LocationAccess.can(role, 'parametres_location', matrix)) {
      root.innerHTML =
        '<p class="loc-msg loc-msg-err">Réservé aux administrateurs. <a href="index.html">Retour</a></p>';
      return;
    }

    await LocationAdmin.mount(root, {
      userId: snap?.userId || null,
      isAdmin: !!snap?.isAdmin,
      isGestionnaire: !!snap?.isGestionnaire,
      canAccessParams: true,
      role,
      matrix,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
