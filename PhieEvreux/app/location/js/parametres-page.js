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

    if (!snap?.isAdmin) {
      root.innerHTML = '<p class="loc-msg loc-msg-err">Réservé aux administrateurs. <a href="index.html">Retour</a></p>';
      return;
    }

    await LocationAdmin.mount(root, {
      userId: snap.userId || null,
      isAdmin: true,
      isGestionnaire: !!snap.isGestionnaire,
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
