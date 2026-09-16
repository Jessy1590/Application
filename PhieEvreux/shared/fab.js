/**
 * FABs Accueil + Bug (partagés hub / apps).
 */
(function (global) {
  const PORTAIL_URL = 'https://jessy1590.github.io/Application';

  /**
   * @param {{
   *   homeHref?: string | null,
   *   app?: string,
   *   showHome?: boolean,
   * }} [opts]
   * homeHref : lien Accueil (hub). Si null et showHome false → pas de bouton Accueil.
   * Sur le hub, Accueil pointe vers le portail si homeHref non fourni.
   */
  function mount(opts = {}) {
    const app = opts.app || 'hub';
    const showHome = opts.showHome !== false;
    let homeHref = opts.homeHref;
    if (homeHref === undefined) {
      homeHref = app === 'hub' ? PORTAIL_URL : null;
    }

    let root = document.getElementById('phieSharedFabs');
    if (!root) {
      root = document.createElement('div');
      root.id = 'phieSharedFabs';
      root.className = 'phie-fabs';
      document.body.appendChild(root);
    }
    root.innerHTML = '';

    if (showHome && homeHref) {
      const home = document.createElement(homeHref.startsWith('http') ? 'a' : 'a');
      home.href = homeHref;
      home.className = 'phie-fab phie-fab-home';
      home.title = 'Accueil';
      home.setAttribute('aria-label', 'Accueil');
      home.textContent = 'PE';
      root.appendChild(home);
    }

    const bug = document.createElement('button');
    bug.type = 'button';
    bug.className = 'phie-fab phie-fab-bug';
    bug.title = 'Signaler un bug';
    bug.setAttribute('aria-label', 'Signaler un bug');
    bug.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 2l1.88 1.88"/><path d="M14.12 3.88L16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a6 6 0 0 1 12 0v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M20.97 5c0 2.1-1.6 3.8-3.53 4"/><path d="M6 13H2"/><path d="M22 13h-4"/><path d="M6 17H2"/><path d="M22 17h-4"/></svg>';
    bug.addEventListener('click', () => {
      if (global.PhieBugs?.open) global.PhieBugs.open({ app });
    });
    root.appendChild(bug);

    return root;
  }

  global.PhieFab = { mount, PORTAIL_URL };
})(window);
