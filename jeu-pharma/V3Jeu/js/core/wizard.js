/* V3Wizard — 5 étapes dans la zone principale. */
(function (global) {
  const U = global.V3UI;
  const D = global.V3Data;
  const h = U.h;
  const STEPS = ['Molécules', 'Jeu', 'Paramètres', 'Personnalisation', 'Essai'];
  const ICO = {
    quiz: 'Q',
    trous: 'T',
    fiche_aleatoire: 'F',
    ordonnance: 'O',
    classement: 'C',
    appariement: 'A',
  };

  let host = null;
  let selApi = null;

  function makeCtx(meta, cfg) {
    let molsP = null;
    const ctx = {
      cfg: cfg,
      meta: meta,
      mols: function () {
        if (!molsP) {
          molsP = global.V3Selection.resolve(meta.selection, {
            niveau_min: meta.niveau_min,
            niveau_max: meta.niveau_max,
          });
        }
        return molsP;
      },
      /** Sélection brute (pool étape 1) — phase 2 : pré-remplir classement / appariement. */
      poolSel: function () { return global.V3Selection.copy ? global.V3Selection.copy(meta.selection) : meta.selection; },
      pool: function () { return ctx.mols(); },
      changed: function () {},
      ui: U,
      data: D,
      champs: global.V3Champs,
      selection: global.V3Selection,
      notation: global.V3Notation,
    };
    ctx.invalidateMols = function () { molsP = null; };
    return ctx;
  }

  function poolOf(jeu) {
    const p = (jeu && jeu.pool) || {};
    const f = p.filtres || {};
    const chap = p.chapitre_ids || f.__chapitre_ids || [];
    return {
      module_ids: p.module_ids || [],
      bloc_ids: p.bloc_ids || [],
      matrice_ids: p.matrice_ids || [],
      chapitre_ids: Array.isArray(chap) ? chap.slice() : [],
      filtres: {
        secteur: f.secteur || [],
        classe_ther: f.classe_ther || [],
        classe_pharma: f.classe_pharma || [],
      },
    };
  }

  function lessonPicker(ids, onChange) {
    const selected = (ids || []).slice();
    const labels = {};
    const chipsEl = h('div', { class: 'v3-chips' });
    const input = h('input', {
      type: 'search',
      class: 'v3-ctrl',
      placeholder: 'Leçon',
      autocomplete: 'off',
      'aria-label': 'Leçon liée',
    });
    const drop = h('div', { class: 'v3-sel-drop', hidden: true });
    const wrap = h('div', { class: 'v3-sel', style: { position: 'relative' } },
      h('div', { class: 'v3-sel-bar' }, input),
      drop,
      chipsEl
    );

    function paint() {
      chipsEl.replaceChildren.apply(chipsEl, selected.map(function (id) {
        return U.chip(labels[id] || id.slice(0, 8), {
          kind: 'lecon',
          onRemove: function () {
            const i = selected.indexOf(id);
            if (i >= 0) selected.splice(i, 1);
            paint();
            onChange(selected.slice());
          },
        });
      }));
    }

    let items = [];
    let active = -1;
    let timer = 0;
    async function run() {
      const n = D.norm(input.value);
      const list = await D.lessons();
      items = list.filter(function (l) {
        if (selected.indexOf(l.id) >= 0) return false;
        return !n || D.norm(l.label + ' ' + l.sub).indexOf(n) >= 0;
      }).slice(0, 12);
      drop.replaceChildren();
      items.forEach(function (it, i) {
        drop.appendChild(h('button', {
          type: 'button',
          class: 'v3-sel-opt',
          onMousedown: function (ev) { ev.preventDefault(); },
          onClick: function () {
            selected.push(it.id);
            labels[it.id] = it.label;
            input.value = '';
            drop.hidden = true;
            paint();
            onChange(selected.slice());
          },
        }, it.label, it.sub ? h('small', null, it.sub) : null));
        if (i === 0) active = 0;
      });
      if (!items.length) drop.appendChild(h('div', { class: 'v3-sel-msg' }, '—'));
      drop.hidden = false;
    }
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { void run(); }, 180);
    });
    input.addEventListener('focus', function () { void run(); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') drop.hidden = true;
      if (ev.key === 'Enter' && items[active]) {
        ev.preventDefault();
        items[active] && drop.querySelector('.v3-sel-opt') && drop.querySelector('.v3-sel-opt').click();
      }
    });
    document.addEventListener('mousedown', function onDoc(ev) {
      if (!wrap.isConnected) {
        document.removeEventListener('mousedown', onDoc);
        return;
      }
      if (!wrap.contains(ev.target)) drop.hidden = true;
    });

    void D.lessons().then(function (list) {
      list.forEach(function (l) { labels[l.id] = l.label; });
      paint();
    });
    paint();
    return wrap;
  }

  function actions(state, where) {
    const prev = state.step > 1
      ? U.button('Retour', { onClick: function () { go(state, state.step - 1); } })
      : null;
    const next = state.step < 5
      ? U.button('Suivant', { variant: 'primary', onClick: function () { go(state, state.step + 1); } })
      : U.button('Enregistrer', { variant: 'primary', onClick: function () { void save(state); } });
    const recap = where === 'bot' ? state.validEl : null;
    return h('div', { class: 'v3-actions v3-actions-' + where }, recap, prev, next);
  }

  function paintStepper(state) {
    state.stepper.replaceChildren();
    STEPS.forEach(function (lab, i) {
      const n = i + 1;
      const btn = h('button', {
        type: 'button',
        class: n === state.step ? 'is-on' : '',
        disabled: n > state.maxStep,
        onClick: function () { if (n <= state.maxStep) go(state, n); },
      }, h('span', { class: 'n' }, String(n)), lab);
      state.stepper.appendChild(h('li', null, btn));
    });
  }

  function refreshValid(state) {
    const def = global.V3Games.get(state.type);
    const msgs = def && def.validate ? def.validate(state.ctx) : [];
    state.validEl.replaceChildren();
    if (state.step === 5 && msgs && msgs.length) {
      msgs.forEach(function (m) {
        state.validEl.appendChild(h('p', { class: 'v3-valid' }, m));
      });
    }
    state.validEl.hidden = state.step !== 5 || !msgs || !msgs.length;
  }

  function paneKey(state, step) {
    if (step <= 2) return String(step);
    return state.type + '|' + JSON.stringify(state.meta.selection);
  }

  function buildStep(state, step) {
    const pane = h('div', { class: 'v3-pane' });
    if (step === 1) {
      const mount = h('div');
      pane.append(
        U.card('Pool de molécules', mount)
      );
      selApi = global.V3Selection.mount(mount, {
        value: state.meta.selection,
        onChange: function (sel) {
          state.meta.selection = sel;
          state.pool = sel;
          state.ctx.invalidateMols();
          state.dirty345 = true;
        },
      });
    } else if (step === 2) {
      pane.appendChild(stepJeu(state));
    } else {
      const def = global.V3Games.get(state.type);
      if (!def) {
        pane.appendChild(U.empty('Choisir un type'));
      } else if (step === 3) {
        def.params(pane, state.ctx);
      } else if (step === 4) {
        def.perso(pane, state.ctx);
      } else {
        const essaiTools = h('div', { class: 'v3-essai-tools' });
        const playPanel = U.essaiPanel({ title: 'Essai' });
        const playHost = h('div', { class: 'v3-play' });
        const finHost = h('div');
        playPanel.body.append(playHost, finHost);
        function lancerEssai() {
          playPanel.open();
          finHost.replaceChildren();
          playHost.replaceChildren();
          def.play(playHost, state.ctx, {
            reel: false,
            jeu: state.jeu,
            rpc: function () { return Promise.reject(new Error('Essai')); },
            fin: function (r) {
              const o = Number(r && r.obtenu);
              const m = Number(r && r.max);
              finHost.replaceChildren(
                global.V3Notation.resultat(Number.isFinite(o) ? o : 0, Number.isFinite(m) ? m : 0),
                h('div', { class: 'v3-actions' },
                  U.button('Rejouer', { variant: 'primary', onClick: lancerEssai })
                )
              );
            },
          });
        }
        essaiTools.appendChild(U.button('Tester', {
          variant: 'primary',
          onClick: lancerEssai,
        }));
        pane.append(essaiTools, playPanel.el);
        if (def.essai) def.essai(essaiTools, state.ctx);
      }
    }
    return pane;
  }

  function stepJeu(state) {
    const types = global.V3Games.list();
    const tiles = h('div', { class: 'v3-tiles' });
    const titre = h('input', {
      class: 'v3-ctrl',
      value: state.meta.titre,
      maxlength: 80,
      'aria-label': 'Titre',
    });
    titre.addEventListener('input', function () {
      state.meta.titre = titre.value;
      state.nomTouched = true;
    });

    function pick(type) {
      if (type === state.type && state.ctx.cfg && Object.keys(state.ctx.cfg).length) return;
      state.type = type;
      const def = global.V3Games.get(type);
      if (def && (!state.nomTouched || types.some(function (t) { return t.label === state.meta.titre; }))) {
        state.meta.titre = def.label;
        titre.value = def.label;
        state.nomTouched = false;
      }
      state.ctx.cfg = (def && def.defaults(state.ctx)) || {};
      state.dirty345 = true;
      Array.prototype.forEach.call(tiles.children, function (t) {
        t.classList.toggle('is-on', t.getAttribute('data-type') === type);
      });
    }

    types.forEach(function (t) {
      tiles.appendChild(h('button', {
        type: 'button',
        class: 'v3-tile' + (t.type === state.type ? ' is-on' : ''),
        dataset: { type: t.type },
        onClick: function () { pick(t.type); },
      },
        h('span', { class: 'v3-tile-ico' }, ICO[t.type] || '?'),
        h('span', { class: 'v3-tile-lab' }, t.label, U.tip(t.tip))
      ));
    });

    const lecons = lessonPicker(state.meta.module_ids, function (ids) {
      state.meta.module_ids = ids;
    });
    const vis = U.stars(state.meta.niveau_min, state.meta.niveau_max, function (a, b) {
      state.meta.niveau_min = a;
      state.meta.niveau_max = b;
      state.ctx.invalidateMols();
      state.dirty345 = true;
    });

    return h('div', { class: 'v3-stack' },
      U.card('Jeu',
        U.field('Type', tiles, { col: true }),
        U.grid(2,
          U.field('Titre', titre),
          U.field('Visibilité', vis, { tip: '★ min–max du jeu.' })
        ),
        U.field('Leçon(s)', lecons, { tip: 'Liaison parcours, hors pool.' })
      )
    );
  }

  function showPane(state, step) {
    if (state.dirty345 && step >= 3) {
      state.panes[3] = state.panes[4] = state.panes[5] = null;
      state.keys[3] = state.keys[4] = state.keys[5] = '';
      state.dirty345 = false;
    }
    const k = paneKey(state, step);
    if (step >= 4 || !state.panes[step] || state.keys[step] !== k) {
      if (step === 1 && selApi) {
        selApi.destroy();
        selApi = null;
      }
      state.panes[step] = buildStep(state, step);
      state.keys[step] = k;
    }
    state.body.replaceChildren(state.panes[step]);
  }

  function go(state, step) {
    state.step = step;
    state.maxStep = Math.max(state.maxStep, step);
    paintStepper(state);
    showPane(state, step);
    const top = actions(state, 'top');
    const bot = actions(state, 'bot');
    state.topAct.replaceWith(top);
    state.botAct.replaceWith(bot);
    state.topAct = top;
    state.botAct = bot;
    refreshValid(state);
  }

  async function save(state) {
    const def = global.V3Games.get(state.type);
    if (!def) { U.toast('Choisir un type', 'err'); return; }
    const payload = Object.assign({
      type_jeu: state.type,
      titre: state.meta.titre || def.label,
      module_ids: state.meta.module_ids || [],
      niveau_min: state.meta.niveau_min,
      niveau_max: state.meta.niveau_max,
      pool: (function () {
        const p = global.V3Selection.copy(state.meta.selection);
        if ((p.chapitre_ids || []).length) {
          p.filtres = p.filtres || {};
          p.filtres.__chapitre_ids = p.chapitre_ids.slice();
        }
        return p;
      })(),
    }, def.payload(state.ctx));
    try {
      if (state.jeuId) await global.V3Store.maj(state.jeuId, payload);
      else await global.V3Store.creer(payload);
      U.toast('Enregistré', 'ok');
      location.hash = '#/';
    } catch (e) {
      U.toast(e.message || 'Erreur', 'err');
    }
  }

  function destroy() {
    if (selApi) { selApi.destroy(); selApi = null; }
    host = null;
  }

  function close() {
    destroy();
    location.hash = '#/';
  }

  async function open(opts) {
    opts = opts || {};
    destroy();
    const app = document.getElementById('app');
    const moduleId = opts.moduleId || opts.lecon || opts.module || '';
    const meta = {
      titre: 'Quiz',
      module_ids: moduleId ? [moduleId] : [],
      niveau_min: 1,
      niveau_max: 5,
      selection: global.V3Selection.empty(),
    };
    const state = {
      step: 1,
      maxStep: 1,
      type: 'quiz',
      meta: meta,
      pool: meta.selection,
      jeuId: null,
      jeu: null,
      nomTouched: false,
      dirty345: false,
      panes: [null, null, null, null, null, null],
      keys: ['', '', '', '', '', ''],
      stepper: h('ol', { class: 'v3-stepper' }),
      body: h('div', { id: 'v3-wiz-body' }),
      validEl: h('div', { class: 'v3-valid', hidden: true }),
      ctx: null,
    };
    state.ctx = makeCtx(meta, {});
    const def0 = global.V3Games.get(state.type);
    state.ctx.cfg = (def0 && def0.defaults(state.ctx)) || {};
    state.ctx.changed = function () { refreshValid(state); };

    if (opts.code) {
      try {
        const jeu = await global.V3Store.charger(opts.code);
        const raw = await global.V3Store.config(jeu.id);
        state.jeu = jeu;
        state.jeuId = jeu.id;
        state.type = jeu.type_jeu;
        state.maxStep = 5;
        meta.titre = jeu.titre || '';
        meta.module_ids = (jeu.module_ids || []).slice();
        meta.niveau_min = jeu.niveau_min || 1;
        meta.niveau_max = jeu.niveau_max || 5;
        meta.selection = poolOf(jeu);
        state.pool = meta.selection;
        const def = global.V3Games.get(state.type);
        state.ctx = makeCtx(meta, {});
        state.ctx.cfg = (def && def.fromConfig(raw)) || (def && def.defaults(state.ctx)) || {};
        state.ctx.changed = function () { refreshValid(state); };
        state.nomTouched = true;
      } catch (e) {
        U.toast(e.message || 'Introuvable', 'err');
        location.hash = '#/';
        return;
      }
    }

    state.topAct = actions(state, 'top');
    state.botAct = actions(state, 'bot');
    const title = opts.code || 'Nouveau jeu';
    const shell = h('div', null,
      h('header', { class: 'v3-wiz-head' },
        h('h1', null, title),
        U.button('Fermer', { variant: 'ghost', onClick: close })
      ),
      state.stepper,
      state.topAct,
      state.body,
      state.botAct
    );
    app.replaceChildren(shell);
    host = state;
    paintStepper(state);
    showPane(state, 1);
    refreshValid(state);

    if (moduleId && !opts.code) {
      try {
        const sel = await global.V3Selection.selectionFromLesson(moduleId);
        meta.selection = sel;
        state.pool = sel;
        state.ctx.invalidateMols();
        if (selApi && selApi.set) selApi.set(sel);
      } catch (e) {
        U.toast(e.message || 'Import leçon impossible', 'err');
      }
    }
  }

  global.V3Wizard = {
    open: open,
    makeCtx: makeCtx,
    destroy: destroy,
    pool: function () { return host && host.pool; },
  };
})(window);
