/* Hub Jeu Pharma — tuiles + admin conditionnel */
(function () {
  async function boot() {
    await JpUi.bootPage({ module: 'hub', homeHref: JpFab.PORTAIL_URL });

    const adminTile = document.getElementById('hubTileAdmin');
    try {
      const admin = await JpApp.isAdmin();
      if (adminTile) adminTile.hidden = !admin;
    } catch (err) {
      JpToast.fromError(err);
      if (adminTile) adminTile.hidden = true;
    }

    document.querySelectorAll('.jp-tile[href]').forEach((tile) => {
      tile.addEventListener('click', () => {
        const href = tile.getAttribute('href') || '';
        void JpLogs?.navigate?.(href, { from: 'hub' });
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
