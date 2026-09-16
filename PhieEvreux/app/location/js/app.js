/**
 * Hub Location — tuiles vers pages modules + thème.
 */
(function () {
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

    const tileParams = document.getElementById('locTileParametres');
    if (snap?.isAdmin && tileParams) tileParams.hidden = false;

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
