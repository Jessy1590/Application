/* Boot, auth, routes. */
(function (global) {
  const U = global.V3UI;
  const D = global.V3Data;
  const h = U.h;

  let currentUser = null;
  let admin = false;

  function bar() {
    const el = document.getElementById('bar');
    const kids = [
      h('a', { class: 'v3-brand', href: '#/' }, 'Jeu Pharma · V3'),
    ];
    if (currentUser) {
      kids.push(h('span', { class: 'v3-who' }, currentUser.email || ''));
      kids.push(U.button('Sortir', {
        variant: 'ghost',
        onClick: function () { void D.signOut(); },
      }));
    }
    el.replaceChildren.apply(el, kids);
  }

  function login() {
    const err = h('p', { class: 'v3-hint', style: { color: 'var(--jp-danger)' } });
    const email = h('input', { type: 'email', autocomplete: 'username', required: true });
    const pass = h('input', { type: 'password', autocomplete: 'current-password', required: true });
    const form = h('form', { class: 'v3-auth', onSubmit: function (ev) {
      ev.preventDefault();
      err.textContent = '';
      D.signIn(email.value.trim(), pass.value).catch(function (e) {
        err.textContent = global.V3Store.human(e);
      });
    } },
      h('h1', null, 'Connexion'),
      U.field('Email', email, { col: true }),
      U.field('Mot de passe', pass, { col: true }),
      err,
      h('button', { type: 'submit', class: 'v3-btn v3-btn-primary' }, 'Entrer')
    );
    document.getElementById('app').replaceChildren(form);
  }

  function gate() {
    document.getElementById('app').replaceChildren(
      h('div', { class: 'v3-gate' },
        h('h1', null, 'Réservé admin')
      )
    );
  }

  function parts() {
    const raw = (location.hash || '#/').replace(/^#/, '');
    return raw.split('/').filter(Boolean);
  }

  function ecranFin(host, r, replay, back) {
    host.replaceChildren(
      h('div', { class: 'v3-fin' },
        global.V3Notation.resultat(r.obtenu, r.max),
        h('div', { class: 'v3-actions' },
          U.button('Rejouer', { variant: 'primary', onClick: replay }),
          U.button('Retour', { variant: 'ghost', onClick: back })
        )
      )
    );
  }

  async function jouer(code) {
    const app = document.getElementById('app');
    app.replaceChildren(U.empty('Chargement…'));
    try {
      const jeu = await global.V3Store.charger(code);
      const raw = await global.V3Store.config(jeu.id);
      const def = global.V3Games.get(jeu.type_jeu);
      if (!def) { app.replaceChildren(U.empty('Type inconnu')); return; }
      const meta = {
        titre: jeu.titre,
        module_ids: jeu.module_ids || [],
        niveau_min: jeu.niveau_min || 1,
        niveau_max: jeu.niveau_max || 5,
        selection: (jeu.pool && {
          module_ids: jeu.pool.module_ids || [],
          bloc_ids: jeu.pool.bloc_ids || [],
          matrice_ids: jeu.pool.matrice_ids || [],
          filtres: jeu.pool.filtres || { secteur: [], classe_ther: [], classe_pharma: [] },
        }) || global.V3Selection.empty(),
      };
      const ctx = global.V3Wizard.makeCtx(meta, {});
      ctx.cfg = def.fromConfig(raw) || def.defaults(ctx) || {};
      const playHost = h('div', { class: 'v3-play' });
      const finHost = h('div');
      const shell = h('div', null,
        h('header', { class: 'v3-wiz-head' },
          h('h1', null, jeu.code_unique + ' · ' + (jeu.titre || def.label)),
          U.button('Retour', { variant: 'ghost', onClick: function () { location.hash = '#/'; } })
        ),
        playHost,
        finHost
      );
      app.replaceChildren(shell);

      function lancer() {
        playHost.replaceChildren();
        finHost.replaceChildren();
        def.play(playHost, ctx, {
          reel: true,
          jeu: jeu,
          rpc: function (name, args) { return D.rpc(name, args); },
          fin: function (r) {
            ecranFin(finHost, r, lancer, function () { location.hash = '#/'; });
            finHost.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          },
        });
      }
      lancer();
    } catch (e) {
      U.toast(e.message || 'Erreur', 'err');
      app.replaceChildren(U.empty(e.message || 'Erreur'));
    }
  }

  function route() {
    const app = document.getElementById('app');
    if (global.V3Wizard && global.V3Wizard.destroy) global.V3Wizard.destroy();
    if (!currentUser) { login(); return; }
    if (!admin) { gate(); return; }
    const p = parts();
    if (!p.length) { global.V3List.mount(app); return; }
    if (p[0] === 'nouveau') { void global.V3Wizard.open({}); return; }
    if (p[0] === 'edit' && p[1]) { void global.V3Wizard.open({ code: p.slice(1).join('/') }); return; }
    if (p[0] === 'jouer' && p[1]) { void jouer(p.slice(1).join('/')); return; }
    location.hash = '#/';
  }

  let bootDone = false;
  let lastUserId = null;

  async function applySession(session) {
    currentUser = session && session.user ? session.user : null;
    admin = false;
    if (currentUser) {
      try { admin = await D.isAdmin(); } catch (_) { admin = false; }
    }
    bar();
    const uid = currentUser && currentUser.id;
    if (!bootDone || uid !== lastUserId) {
      bootDone = true;
      lastUserId = uid;
      route();
    }
  }

  async function boot() {
    bar();
    D.onAuth(function (s) { void applySession(s); });
    try {
      const s = await D.session();
      await applySession(s);
    } catch (e) {
      document.getElementById('app').replaceChildren(U.empty(global.V3Store.human(e)));
    }
    window.addEventListener('hashchange', route);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window);
