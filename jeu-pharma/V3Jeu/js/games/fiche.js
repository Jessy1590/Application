(function (global) {
  const U = global.V3UI;
  const h = U.h;

  function clamp(n, min, max, def) {
    const v = Number(n);
    if (!Number.isFinite(v)) return def;
    return Math.min(max, Math.max(min, v));
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function pickRandom(list) {
    if (!list || !list.length) return null;
    return list[Math.floor(Math.random() * list.length)];
  }

  function molsPool(mols) {
    return (mols || []).filter(function (m) { return !m.vide; });
  }

  function champsRoles(cfg) {
    return (cfg && cfg.champs) || {};
  }

  function champsActifs(cfg, C) {
    const vis = [];
    const rest = [];
    C.list.forEach(function (c) {
      const r = champsRoles(cfg)[c.code];
      if (r === 'visible') vis.push(c.code);
      else if (r === 'restituer') rest.push(c.code);
    });
    return { visibles: vis, restituer: rest };
  }

  function countMolField(mols, code, C) {
    return molsPool(mols).filter(function (m) { return C.valeurs(m, code).length > 0; }).length;
  }

  function ensureChampsPool(cfg, mols, C) {
    if (cfg._champsFromDb) return;
    const pres = C.presents(molsPool(mols));
    pres.forEach(function (code) {
      if (code === 'dci' || code === 'nom_commercial') return;
      if (!cfg.champs[code] || cfg.champs[code] === 'off') cfg.champs[code] = 'restituer';
    });
  }

  function molLabel(m) {
    if (!m) return '—';
    const t = global.V3UI.txt;
    const dci = t ? t(m.dci) : String(m.dci || '');
    const noms = (m.noms && m.noms.length) ? m.noms.filter(Boolean).join(', ') : '';
    if (dci && noms) return dci + ' · ' + noms;
    return dci || noms || '—';
  }

  function nomsText(mol, C) {
    const noms = C.valeurs(mol, 'nom_commercial');
    if (!noms.length && mol.noms && mol.noms.length) return mol.noms.join(', ');
    return noms.join(', ') || '—';
  }

  function choixModeHost(host, onPick) {
    host.replaceChildren(U.field('Notation', U.segmented([
      { value: 'rapide', label: 'Rapide' },
      { value: 'detaille', label: 'Détaillé' },
    ], null, function (v) {
      if (onPick) onPick(v);
    }), {
      tip: 'Rapide : une note /10 · Détaillé : 0 · ½ · 1 par valeur masquée.',
    }));
  }

  function molTypeahead(mols, value, onPick) {
    const pool = molsPool(mols);
    const curId = value || '';
    const input = h('input', {
      type: 'search',
      class: 'v3-ctrl v3-fiche-mol-in',
      placeholder: 'DCI',
      autocomplete: 'off',
      'aria-label': 'Molécule',
    });
    const drop = h('div', { class: 'v3-sel-drop', hidden: true });
    const wrap = h('div', { class: 'v3-sel v3-fiche-mol-ta', style: { position: 'relative' } }, input, drop);
    let timer = 0;

    function paint(q) {
      const n = global.V3Data.norm(q || '');
      const hits = pool.filter(function (m) {
        const hay = global.V3Data.norm(m.dci + ' ' + (m.noms || []).join(' '));
        return !n || hay.indexOf(n) >= 0;
      }).slice(0, 12);
      drop.replaceChildren();
      hits.forEach(function (m) {
        drop.appendChild(h('button', {
          type: 'button',
          class: 'v3-sel-opt' + (String(m.id) === String(curId) ? ' is-on' : ''),
          onMousedown: function (ev) { ev.preventDefault(); },
          onClick: function () {
            input.value = m.dci || '';
            drop.hidden = true;
            onPick(m.id);
          },
        }, m.dci || '—', (m.noms && m.noms[0]) ? h('small', null, m.noms[0]) : null));
      });
      if (!hits.length) drop.appendChild(h('div', { class: 'v3-sel-msg' }, '—'));
      drop.hidden = false;
    }

    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { paint(input.value); }, 120);
    });
    input.addEventListener('focus', function () { paint(input.value); });
    document.addEventListener('mousedown', function onDoc(ev) {
      if (!wrap.isConnected) {
        document.removeEventListener('mousedown', onDoc);
        return;
      }
      if (!wrap.contains(ev.target)) drop.hidden = true;
    });
    if (curId) {
      const m = pool.find(function (x) { return String(x.id) === String(curId); });
      if (m) input.value = m.dci || '';
    }
    return wrap;
  }

  function buildCard(mol, cfg, C, revealed) {
    const roles = champsActifs(cfg, C);
    const parts = [];

    if (roles.visibles.indexOf('dci') >= 0) {
      parts.push(h('h3', null, mol.dci || '—'));
    } else if (!revealed) {
      parts.push(h('h3', null, mol.dci || '—'));
    }
    if (roles.visibles.indexOf('nom_commercial') >= 0) {
      parts.push(h('p', { class: 'jp-muted' }, nomsText(mol, C)));
    }

    if (!revealed) {
      parts.push(h('p', { class: 'jp-v2-banner' },
        'Restituez mentalement les informations du programme, puis révélez.'));
      roles.visibles.forEach(function (code) {
        if (code === 'dci' || code === 'nom_commercial') return;
        const vals = C.valeurs(mol, code);
        if (!vals.length) return;
        parts.push(h('section', { class: 'v3-fiche-block is-visible' },
          h('h4', null, C.label(code)),
          h('ul', { class: 'v3-fiche-vals' }, vals.map(function (v) { return h('li', null, v); }))
        ));
      });
      const maskCodes = roles.restituer.filter(function (code) {
        return C.valeurs(mol, code).length > 0;
      });
      if (maskCodes.length) {
        parts.push(h('ul', { class: 'jp-muted' }, maskCodes.map(function (code) {
          return h('li', null, C.label(code) + ' : ???');
        })));
      }
    } else {
      const dl = h('dl', { class: 'jp-v2-champs-revealed' });
      roles.visibles.forEach(function (code) {
        if (code === 'dci' || code === 'nom_commercial') return;
        const vals = C.valeurs(mol, code);
        if (!vals.length) return;
        dl.appendChild(h('dt', null, C.label(code)));
        dl.appendChild(h('dd', null, vals.join(' · ') || '—'));
      });
      roles.restituer.forEach(function (code) {
        const vals = C.valeurs(mol, code);
        if (!vals.length) return;
        dl.appendChild(h('dt', null, C.label(code)));
        dl.appendChild(h('dd', null, vals.join(' · ') || '—'));
      });
      if (dl.children.length) parts.push(dl);
    }

    return h('article', { class: 'jp-v2-mol-card' }, parts);
  }

  function itemsDetaille(mol, cfg, C) {
    const items = [];
    champsActifs(cfg, C).restituer.forEach(function (code) {
      C.valeurs(mol, code).forEach(function (val) {
        items.push({
          groupe: C.label(code),
          contexte: C.label(code),
          attendu: val,
          saisie: '',
        });
      });
    });
    return items;
  }

  async function loadExclusionCounts(ctx, session, mols, seuil) {
    const map = Object.create(null);
    molsPool(mols).forEach(function (m) { map[String(m.id)] = 0; });
    if (!session.reel) return map;
    const user = await ctx.data.user();
    if (!user || !session.jeu) return map;
    const { data, error } = await ctx.data.jeu()
      .from('jeux_tentatives')
      .select('details_json')
      .eq('jeu_id', session.jeu.id)
      .eq('utilisateur_id', user.id);
    if (error) throw error;
    (data || []).forEach(function (row) {
      const arr = Array.isArray(row.details_json) ? row.details_json : [];
      arr.forEach(function (d) {
        if (!d || d.matrice_id == null || d.note == null) return;
        if (Number(d.note) >= seuil) {
          const k = String(d.matrice_id);
          map[k] = (map[k] || 0) + 1;
        }
      });
    });
    return map;
  }

  function eligibleMols(mols, counts, nbNotes) {
    return molsPool(mols).filter(function (m) {
      return (counts[String(m.id)] || 0) < nbNotes;
    });
  }

  function resolveManuelEmplacement(emp, mols, byId) {
    if (emp.mode === 'fixe' && emp.matrice_id && byId[String(emp.matrice_id)]) {
      return byId[String(emp.matrice_id)];
    }
    return pickRandom(molsPool(mols));
  }

  function buildPartieList(cfg, mols, opts) {
    opts = opts || {};
    const pool = molsPool(opts.eligible && opts.eligible.length ? opts.eligible : mols);
    const byId = Object.create(null);
    pool.forEach(function (m) { byId[String(m.id)] = m; });

    if (cfg.composition === 'manuel') {
      return (cfg.emplacements || []).map(function (emp) {
        return resolveManuelEmplacement(emp, pool, byId);
      }).filter(Boolean);
    }
    if (cfg.fiches_mode === 'groupe') {
      return shuffle(pool.slice());
    }
    const n = clamp(cfg.nb_fiches, 1, 30, 5);
    const out = [];
    const bag = shuffle(pool.slice());
    for (let i = 0; i < n; i += 1) {
      if (!bag.length) bag.push.apply(bag, shuffle(pool.slice()));
      if (bag.length === pool.length && n <= pool.length) {
        out.push(bag[i % bag.length]);
      } else {
        out.push(pickRandom(pool));
      }
    }
    return out;
  }

  function payloadChamps(cfg, C) {
    const arr = [];
    C.list.forEach(function (c) {
      const role = champsRoles(cfg)[c.code];
      if (role === 'visible' || role === 'restituer') {
        arr.push({ champ_code: c.code, role: role });
      }
    });
    return arr;
  }

  function paintParamsChamps(host, cfg, ctx, mols) {
    const C = ctx.champs;
    const pool = molsPool(mols);
    ensureChampsPool(cfg, pool, C);
    const rowsVis = h('div', { class: 'v3-fiche-champs' });
    const rowsRest = h('div', { class: 'v3-fiche-champs' });
    const rowsOff = h('div', { class: 'v3-fiche-champs' });

    function setRole(code, role) {
      cfg.champs[code] = role;
      ctx.changed();
      paintRows();
    }

    function paintRows() {
      rowsVis.replaceChildren();
      rowsRest.replaceChildren();
      rowsOff.replaceChildren();
      C.list.forEach(function (c) {
        const r = champsRoles(cfg)[c.code] || 'off';
        const n = countMolField(pool, c.code, C);
        const seg = U.segmented([
          { value: 'visible', label: 'Visible' },
          { value: 'restituer', label: 'À restituer' },
          { value: 'off', label: 'Off' },
        ], r, function (v) { setRole(c.code, v); });
        const row = h('div', { class: 'v3-fiche-champ-row' },
          h('div', { class: 'v3-fiche-champ-lab' },
            h('span', null, c.court || c.label),
            h('span', { class: 'v3-fiche-champ-n' }, String(n)),
            U.tip(c.label)
          ),
          seg
        );
        if (r === 'visible') rowsVis.appendChild(row);
        else if (r === 'restituer') rowsRest.appendChild(row);
        else rowsOff.appendChild(row);
      });
      if (!rowsVis.children.length) rowsVis.appendChild(U.empty('—'));
      if (!rowsRest.children.length) rowsRest.appendChild(U.empty('—'));
      if (!rowsOff.children.length) rowsOff.appendChild(U.empty('—'));
    }

    host.replaceChildren(
      h('div', { class: 'v3-fiche-champ-groups' },
        h('div', { class: 'v3-fiche-champ-grp' },
          h('h3', null, 'Visibles'),
          rowsVis
        ),
        h('div', { class: 'v3-fiche-champ-grp' },
          h('h3', null, 'À restituer'),
          rowsRest
        )
      ),
      h('div', { class: 'v3-fiche-champ-grp v3-fiche-champ-off' },
        h('h3', null, 'Off'),
        rowsOff
      )
    );
    paintRows();
  }

  function mountEmplacementsAdder(host, cfg, ctx, molsCacheRef) {
    let draftMode = 'aleatoire';
    let draftMolId = null;
    let taWrap = null;

    function syncDraft(api) {
      const ok = draftMode === 'aleatoire' || !!draftMolId;
      api.setDraftReady(ok);
    }

    const ad = U.adder({
      title: 'Emplacement',
      propose: false,
      items: function () { return cfg.emplacements || []; },
      draft: function (draftHost, api) {
        draftMode = 'aleatoire';
        draftMolId = null;
        const fixeSlot = h('div', { class: 'v3-fiche-emp-fixe' });
        function paintFixe() {
          fixeSlot.replaceChildren();
          if (draftMode !== 'fixe') {
            fixeSlot.hidden = true;
            syncDraft(api);
            return;
          }
          fixeSlot.hidden = false;
          taWrap = molTypeahead(molsCacheRef(), draftMolId, function (id) {
            draftMolId = id;
            syncDraft(api);
          });
          fixeSlot.appendChild(taWrap);
          syncDraft(api);
        }
        draftHost.replaceChildren(
          U.field('Mode', U.segmented([
            { value: 'aleatoire', label: 'Aléatoire' },
            { value: 'fixe', label: 'Fixe' },
          ], draftMode, function (v) {
            draftMode = v;
            if (v !== 'fixe') draftMolId = null;
            paintFixe();
          }), { tip: 'Fixe = molécule du pool · Aléatoire = tirage à la partie.' })
        );
        draftHost.appendChild(fixeSlot);
        paintFixe();
      },
      onAdd: function () {
        if (!cfg.emplacements) cfg.emplacements = [];
        cfg.emplacements.push({
          ordre: cfg.emplacements.length + 1,
          mode: draftMode === 'fixe' ? 'fixe' : 'aleatoire',
          matrice_id: draftMode === 'fixe' ? draftMolId : null,
        });
      },
      renderItem: function (emp, i, api) {
        const lab = emp.mode === 'fixe'
          ? molLabel(molsPool(molsCacheRef()).find(function (m) { return String(m.id) === String(emp.matrice_id); }))
          : 'Aléatoire';
        return h('div', { class: 'v3-fiche-emp-item' },
          h('span', { class: 'v3-fiche-emp-n' }, String(i + 1)),
          h('span', null, lab),
          h('div', { class: 'v3-fiche-emp-act' },
            U.button('↑', {
              variant: 'ghost',
              disabled: i === 0,
              onClick: function () { api.move(i, -1); reindexEmps(cfg); },
            }),
            U.button('↓', {
              variant: 'ghost',
              disabled: i >= (cfg.emplacements.length - 1),
              onClick: function () { api.move(i, 1); reindexEmps(cfg); },
            }),
            U.button('×', {
              variant: 'ghost',
              onClick: function () { api.remove(i); reindexEmps(cfg); },
            })
          )
        );
      },
      onChange: function () { ctx.changed(); },
      empty: 'Aucun emplacement',
    });
    host.appendChild(ad.el);
    ad.refresh();
    return ad;
  }

  function reindexEmps(cfg) {
    (cfg.emplacements || []).forEach(function (e, i) { e.ordre = i + 1; });
  }

  function paintApercu(host, cfg, ctx) {
    const C = ctx.champs;
    const cardHost = h('div', { class: 'v3-fiche-preview' });
    const nav = h('div', { class: 'v3-fiche-nav' });
    const idxLab = h('span', { class: 'v3-play-progress' }, '');
    let partie = [];
    let idx = 0;

    function regen() {
      void ctx.mols().then(function (mols) {
        partie = buildPartieList(cfg, mols, {});
        idx = 0;
        paintCard();
      });
    }

    function paintCard() {
      if (!partie.length) {
        cardHost.replaceChildren(U.empty('Pool vide'));
        idxLab.textContent = '';
        return;
      }
      idx = Math.max(0, Math.min(idx, partie.length - 1));
      idxLab.textContent = 'Fiche ' + (idx + 1) + ' / ' + partie.length;
      cardHost.replaceChildren(buildCard(partie[idx], cfg, C, false));
    }

    nav.append(
      U.button('←', { variant: 'ghost', onClick: function () { idx -= 1; paintCard(); } }),
      idxLab,
      U.button('→', { variant: 'ghost', onClick: function () { idx += 1; paintCard(); } })
    );
    if (cfg.composition !== 'manuel') {
      nav.appendChild(U.button('Nouveau tirage', {
        variant: 'ghost',
        onClick: regen,
      }));
    }
    host.replaceChildren(U.section('Aperçu', nav, cardHost));
    regen();
  }

  global.V3Games.register('fiche_aleatoire', {
    label: 'Fiche',
    tip: 'N fiches à restituer. Score = moyenne.',
    pool: true,

    defaults: function () {
      const champs = {};
      global.V3Champs.list.forEach(function (c) { champs[c.code] = 'off'; });
      champs.dci = 'visible';
      champs.nom_commercial = 'visible';
      return {
        composition: 'auto',
        nb_fiches: 5,
        fiches_mode: 'aleatoire',
        seuil_exclusion: 8,
        nb_notes_exclusion: 3,
        champs: champs,
        emplacements: [],
        _champsFromDb: false,
      };
    },

    fromConfig: function (raw) {
      raw = raw || {};
      const champs = {};
      global.V3Champs.list.forEach(function (c) { champs[c.code] = 'off'; });
      (raw.champs || []).forEach(function (c) {
        if (!c || !c.champ_code) return;
        champs[c.champ_code] = c.role === 'visible' ? 'visible' : 'restituer';
      });
      const emplacements = (raw.emplacements || []).map(function (e, i) {
        return {
          ordre: e.ordre != null ? e.ordre : i + 1,
          mode: e.mode === 'fixe' ? 'fixe' : 'aleatoire',
          matrice_id: e.matrice_id || null,
        };
      }).sort(function (a, b) { return a.ordre - b.ordre; });
      return {
        composition: raw.composition === 'manuel' ? 'manuel' : 'auto',
        nb_fiches: clamp(raw.nb_fiches, 1, 30, 5),
        fiches_mode: raw.fiches_mode === 'groupe' ? 'groupe' : 'aleatoire',
        seuil_exclusion: clamp(raw.seuil_exclusion, 0, 10, 8),
        nb_notes_exclusion: clamp(raw.nb_notes_exclusion, 1, 99, 3),
        champs: champs,
        emplacements: emplacements,
        _champsFromDb: true,
      };
    },

    params: function (el, ctx) {
      const cfg = ctx.cfg;
      const autoBox = h('div', { class: 'v3-fiche-auto' });
      let nbWrap = null;

      function syncComp() {
        autoBox.hidden = cfg.composition === 'manuel';
        if (ctx._ficheSyncManuel) ctx._ficheSyncManuel();
        ctx.changed();
      }

      function paintAutoOpts() {
        autoBox.replaceChildren();
        const modeSeg = U.segmented([
          { value: 'aleatoire', label: 'Aléatoire' },
          { value: 'groupe', label: 'Pool complet' },
        ], cfg.fiches_mode, function (v) {
          cfg.fiches_mode = v;
          paintAutoOpts();
          ctx.changed();
        });
        nbWrap = h('div', { class: 'v3-fiche-nb-wrap' });
        if (cfg.fiches_mode === 'aleatoire') {
          nbWrap.appendChild(U.field('Fiches', U.number(cfg.nb_fiches, {
            min: 1, max: 30, step: 1,
            onChange: function (v) { cfg.nb_fiches = v; ctx.changed(); },
          }), { tip: '1–30 fiches par partie.' }));
        }
        autoBox.append(
          U.field('Tirage', modeSeg, {
            tip: 'Aléatoire = N tirages · Pool complet = une fiche par molécule du pool.',
          }),
          nbWrap
        );
      }

      el.replaceChildren(
        U.card('Paramètres',
          U.field('Composition', U.segmented([
            { value: 'auto', label: 'Pool automatique' },
            { value: 'manuel', label: 'Pool personnalisé' },
          ], cfg.composition === 'manuel' ? 'manuel' : 'auto', function (v) {
            cfg.composition = v;
            syncComp();
          }), { tip: 'Pool automatique = tirage · Pool personnalisé = emplacements (étape 4).' }),
          autoBox
        )
      );

      paintAutoOpts();
      syncComp();
    },

    perso: function (el, ctx) {
      const cfg = ctx.cfg;
      const champsHost = h('div');
      const empHost = h('div', { class: 'v3-fiche-emps-wrap' });
      const apercuHost = h('div');
      let molsCache = [];
      let empAdder = null;

      const exLine = h('p', { class: 'v3-fiche-excl' },
        'Exclure après ',
        U.number(cfg.nb_notes_exclusion, {
          min: 1, max: 20, step: 1,
          onChange: function (v) { cfg.nb_notes_exclusion = v; ctx.changed(); },
        }),
        ' notes ≥ ',
        U.number(cfg.seuil_exclusion, {
          min: 0, max: 10, step: 1,
          onChange: function (v) { cfg.seuil_exclusion = v; ctx.changed(); },
        }),
        U.tip('Molécules retirées du tirage auto après assez de bonnes notes (partie réelle).')
      );

      function syncManuel() {
        const man = cfg.composition === 'manuel';
        empHost.hidden = !man;
        if (man && !empAdder) {
          empHost.replaceChildren();
          empAdder = mountEmplacementsAdder(empHost, cfg, ctx, function () { return molsCache; });
        }
      }

      el.replaceChildren(
        U.card('Champs', champsHost),
        U.card('Exclusion', exLine),
        empHost,
        apercuHost
      );

      ctx._ficheSyncManuel = syncManuel;
      if (!ctx._fichePersoHook) {
        ctx._fichePersoHook = true;
        const prevChanged = ctx.changed;
        ctx.changed = function () {
          if (prevChanged) prevChanged();
          if (ctx._ficheSyncManuel) ctx._ficheSyncManuel();
        };
      }

      void ctx.mols().then(function (mols) {
        molsCache = mols || [];
        paintParamsChamps(champsHost, cfg, ctx, molsCache);
        syncManuel();
        paintApercu(apercuHost, cfg, ctx);
      });
    },

    essai: function (el, ctx) {
      const panel = U.essaiPanel({ title: 'Tirage' });
      el.append(
        U.button('Tester un tirage', {
          variant: 'ghost',
          onClick: function () {
            panel.open();
            paintApercu(panel.body, ctx.cfg, ctx);
          },
        }),
        panel.el
      );
    },

    play: function (el, ctx, session) {
      const cfg = ctx.cfg;
      const C = ctx.champs;
      const N = ctx.notation;
      const modeHost = h('div', { class: 'v3-fiche-mode' });
      const main = h('div', { class: 'v3-fiche-play' });
      el.replaceChildren(modeHost, main);

      void (async function () {
        const mols = molsPool(await ctx.mols());
        if (!mols.length) {
          main.replaceChildren(U.empty('Pool vide'));
          return;
        }

        const seuil = clamp(cfg.seuil_exclusion, 0, 10, 8);
        const nbEx = clamp(cfg.nb_notes_exclusion, 1, 99, 3);
        let counts = Object.create(null);
        if (cfg.composition !== 'manuel') {
          counts = await loadExclusionCounts(ctx, session, mols, seuil);
        }
        let eligible = cfg.composition === 'manuel'
          ? mols
          : eligibleMols(mols, counts, nbEx);
        if (!eligible.length && cfg.composition !== 'manuel') {
          eligible = mols.slice();
        }

        let playMode = null;
        let partie = [];
        let tentativeId = null;
        const results = [];

        function snapshotFor(list) {
          return {
            composition: cfg.composition,
            fiches_mode: cfg.fiches_mode,
            nb_fiches: cfg.fiches_mode === 'groupe' ? list.length : cfg.nb_fiches,
            matrice_ids: list.map(function (m) { return m.id; }),
            champs: payloadChamps(cfg, C),
          };
        }

        function noteSur10(last) {
          if (!last || !last.max) return 0;
          return Math.round((last.obtenu / last.max) * 100) / 10;
        }

        async function submitFin(avg, demanderRelecture) {
          const details = results.map(function (r) {
            return { matrice_id: r.mol.id, note: r.note };
          });
          if (!session.reel) {
            if (demanderRelecture) U.toast('Relecture demandée (essai)');
            main.replaceChildren();
            session.fin({ obtenu: avg, max: 10, details: details });
            return;
          }
          if (!tentativeId) return;
          try {
            await session.rpc('jeu_soumettre_declare', {
              p_tentative_id: tentativeId,
              p_reponses: {
                mode: playMode,
                fiches: results.map(function (r) { return { matrice_id: r.mol.id, note: r.note }; }),
              },
              p_score_provisoire: avg,
              p_score_max: 10,
              p_details: details,
              p_demander_relecture: !!demanderRelecture,
            });
          } catch (e) {
            U.toast(e.message || 'Erreur', 'err');
            return;
          }
          session.fin({ obtenu: avg, max: 10, details: details });
        }

        function showFin() {
          let sum = 0;
          results.forEach(function (r) { sum += r.note; });
          const avg = results.length ? Math.round((sum / results.length) * 10) / 10 : 0;
          const list = h('ul', { class: 'v3-fiche-fin-list' });
          results.forEach(function (r) {
            list.appendChild(h('li', null, molLabel(r.mol) + ' — ' + r.note + '/10'));
          });
          const actions = h('div', { class: 'jp-v2-actions v3-actions' },
            U.button('Terminer', {
              variant: 'primary',
              onClick: function () { void submitFin(avg, false); },
            })
          );
          if (playMode === 'detaille') {
            actions.appendChild(U.button('Valider + relecture admin', {
              variant: 'ghost',
              onClick: function () { void submitFin(avg, true); },
            }));
          }
          main.replaceChildren(
            h('div', { class: 'v3-fin' },
              N.resultat(avg, 10),
              h('p', { class: 'jp-muted' }, 'Moyenne des fiches'),
              list,
              actions
            )
          );
        }

        function startPartie() {
          partie = buildPartieList(cfg, mols, { eligible: eligible });
          results.length = 0;
          if (!partie.length) {
            main.replaceChildren(U.empty('Aucune fiche'));
            return;
          }
          if (session.reel && !tentativeId) {
            session.rpc('jeu_demarrer_declare', {
              p_jeu_id: session.jeu.id,
              p_snapshot: snapshotFor(partie),
              p_contexte: 'classique',
              p_passage_id: null,
            }).then(function (res) {
              tentativeId = res && res.tentative_id;
              paintFiche(0);
            }).catch(function (e) {
              main.replaceChildren(U.empty(e.message || 'Erreur'));
            });
          } else {
            paintFiche(0);
          }
        }

        let fi = 0;
        let revealed = false;
        const prog = h('p', { class: 'jp-muted v3-play-progress' });
        const cardSlot = h('div');
        const act = h('div', { class: 'jp-v2-actions v3-fiche-play-act' });
        const noteSlot = h('div', { class: 'v3-fiche-note-slot' });

        function paintFiche(i) {
          fi = i;
          revealed = false;
          noteSlot.replaceChildren();
          act.replaceChildren();
          if (fi >= partie.length) {
            showFin();
            return;
          }
          prog.textContent = 'Fiche ' + (fi + 1) + ' / ' + partie.length;
          const mol = partie[fi];
          cardSlot.replaceChildren(buildCard(mol, cfg, C, false));
          act.appendChild(U.button('Voir les réponses', {
            variant: 'primary',
            onClick: function () {
              revealed = true;
              cardSlot.replaceChildren(buildCard(mol, cfg, C, true));
              act.replaceChildren();
              if (playMode === 'rapide') {
                noteSlot.replaceChildren(h('div', { class: 'jp-field' },
                  h('label', { for: 'v3-fiche-score-' + fi }, 'Note /10'),
                  h('input', {
                    id: 'v3-fiche-score-' + fi,
                    type: 'number',
                    min: '0',
                    max: '10',
                    value: '8',
                    class: 'v3-ctrl',
                  })
                ));
                act.appendChild(U.button('Enregistrer', {
                  variant: 'primary',
                  onClick: function () {
                    const inp = noteSlot.querySelector('input[type="number"]');
                    const s = Number(inp && inp.value);
                    if (Number.isNaN(s) || s < 0 || s > 10) {
                      U.toast('Note entre 0 et 10', 'err');
                      return;
                    }
                    results.push({ mol: mol, note: s });
                    paintFiche(fi + 1);
                  },
                }));
                act.appendChild(U.button('Passer', {
                  variant: 'ghost',
                  onClick: function () { paintFiche(fi + 1); },
                }));
              } else {
                const items = itemsDetaille(mol, cfg, C);
                if (!items.length) {
                  noteSlot.replaceChildren(U.empty('Aucune valeur à noter'));
                  act.appendChild(U.button('Fiche suivante', {
                    variant: 'primary',
                    onClick: function () {
                      results.push({ mol: mol, note: 0 });
                      paintFiche(fi + 1);
                    },
                  }));
                  return;
                }
                let last = null;
                N.detaille(noteSlot, items, {
                  onChange: function (st) { last = st; },
                });
                act.appendChild(U.button('Fiche suivante', {
                  variant: 'primary',
                  onClick: function () {
                    if (!last || last.remplis < items.length) {
                      U.toast('Noter chaque valeur', 'err');
                      return;
                    }
                    results.push({ mol: mol, note: noteSur10(last) });
                    paintFiche(fi + 1);
                  },
                }));
                act.appendChild(U.button('Passer', {
                  variant: 'ghost',
                  onClick: function () {
                    results.push({ mol: mol, note: last ? noteSur10(last) : 0 });
                    paintFiche(fi + 1);
                  },
                }));
              }
            },
          }));
          act.appendChild(U.button('Passer', {
            variant: 'ghost',
            onClick: function () { paintFiche(fi + 1); },
          }));
        }

        choixModeHost(modeHost, function (m) {
          playMode = m;
          modeHost.hidden = true;
          main.replaceChildren(prog, cardSlot, noteSlot, act);
          startPartie();
        });
      })().catch(function (e) {
        main.replaceChildren(U.empty(e.message || 'Erreur'));
      });
    },

    validate: function (ctx) {
      const msgs = [];
      const cfg = ctx.cfg;
      const C = ctx.champs;
      const act = champsActifs(cfg, C);
      if (!act.restituer.length) msgs.push('Au moins un champ à restituer');
      if (cfg.composition === 'manuel') {
        if (!(cfg.emplacements && cfg.emplacements.length)) {
          msgs.push('Au moins un emplacement');
        }
        (cfg.emplacements || []).forEach(function (e, i) {
          if (e.mode === 'fixe' && !e.matrice_id) {
            msgs.push('Emplacement ' + (i + 1) + ' : molécule requise');
          }
        });
      } else if (cfg.fiches_mode === 'aleatoire' && clamp(cfg.nb_fiches, 1, 30, 0) < 1) {
        msgs.push('Nombre de fiches invalide');
      }
      return msgs;
    },

    payload: function (ctx) {
      const cfg = ctx.cfg;
      const C = ctx.champs;
      const fiche = {
        composition: cfg.composition === 'manuel' ? 'manuel' : 'auto',
        nb_fiches: clamp(cfg.nb_fiches, 1, 30, 5),
        fiches_mode: cfg.fiches_mode === 'groupe' ? 'groupe' : 'aleatoire',
        seuil_exclusion: clamp(cfg.seuil_exclusion, 0, 10, 8),
        nb_notes_exclusion: clamp(cfg.nb_notes_exclusion, 1, 99, 3),
        champs: payloadChamps(cfg, C),
        emplacements: [],
      };
      if (cfg.composition === 'manuel') {
        fiche.emplacements = (cfg.emplacements || []).map(function (e, i) {
          return {
            ordre: e.ordre != null ? e.ordre : i + 1,
            mode: e.mode === 'fixe' ? 'fixe' : 'aleatoire',
            matrice_id: e.mode === 'fixe' && e.matrice_id ? e.matrice_id : null,
          };
        });
        fiche.nb_fiches = fiche.emplacements.length || fiche.nb_fiches;
      }
      return { fiche: fiche };
    },
  });
})(window);
