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
    return (mols || []).filter(function (m) { return C.valeurs(m, code).length > 0; }).length;
  }

  function ensureChampsPool(cfg, mols, C) {
    if (cfg._champsFromDb) return;
    const pres = C.presents(mols);
    pres.forEach(function (code) {
      if (code === 'dci' || code === 'nom_commercial') return;
      if (!cfg.champs[code] || cfg.champs[code] === 'off') cfg.champs[code] = 'restituer';
    });
  }

  function molLabel(m) {
    if (!m) return '—';
    const noms = (m.noms && m.noms.length) ? m.noms.join(', ') : '';
    return m.dci + (noms ? ' · ' + noms : '');
  }

  function molTypeahead(mols, value, onPick) {
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
      const hits = (mols || []).filter(function (m) {
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
      const m = (mols || []).find(function (x) { return String(x.id) === String(curId); });
      if (m) input.value = m.dci || '';
    }
    return wrap;
  }

  function buildCard(mol, cfg, C, revealed) {
    const roles = champsActifs(cfg, C);
    const head = h('header', { class: 'v3-fiche-head' });
    if (roles.visibles.indexOf('dci') >= 0) {
      head.appendChild(h('h3', { class: 'v3-fiche-dci' }, mol.dci || '—'));
    }
    if (roles.visibles.indexOf('nom_commercial') >= 0) {
      const noms = C.valeurs(mol, 'nom_commercial');
      if (!noms.length && mol.noms && mol.noms.length) noms.push.apply(noms, mol.noms);
      head.appendChild(h('p', { class: 'v3-fiche-noms' }, noms.join(', ') || '—'));
    }

    const body = h('div', { class: 'v3-fiche-body' });
    roles.visibles.forEach(function (code) {
      if (code === 'dci' || code === 'nom_commercial') return;
      const vals = C.valeurs(mol, code);
      if (!vals.length) return;
      body.appendChild(h('section', { class: 'v3-fiche-block is-visible' },
        h('h4', null, C.label(code)),
        h('ul', { class: 'v3-fiche-vals' }, vals.map(function (v) { return h('li', null, v); }))
      ));
    });

    roles.restituer.forEach(function (code) {
      const vals = C.valeurs(mol, code);
      if (!vals.length) return;
      if (!revealed) {
        body.appendChild(h('section', { class: 'v3-fiche-block is-masked' },
          h('h4', null, C.label(code)),
          h('p', { class: 'v3-fiche-mask' }, '…')
        ));
      } else {
        body.appendChild(h('section', { class: 'v3-fiche-block is-revealed' },
          h('h4', null, C.label(code)),
          h('ul', { class: 'v3-fiche-vals' }, vals.map(function (v) { return h('li', null, v); }))
        ));
      }
    });

    return h('article', { class: 'v3-fiche-card' }, head, body);
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
    (mols || []).forEach(function (m) { map[String(m.id)] = 0; });
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
    return (mols || []).filter(function (m) {
      return (counts[String(m.id)] || 0) < nbNotes;
    });
  }

  function resolveManuelEmplacement(emp, mols, byId) {
    if (emp.mode === 'fixe' && emp.matrice_id && byId[String(emp.matrice_id)]) {
      return byId[String(emp.matrice_id)];
    }
    return pickRandom(mols);
  }

  function buildPartieList(cfg, mols, opts) {
    opts = opts || {};
    const byId = Object.create(null);
    mols.forEach(function (m) { byId[String(m.id)] = m; });
    const pool = opts.eligible && opts.eligible.length ? opts.eligible : mols;

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
    ensureChampsPool(cfg, mols, C);
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
        const n = countMolField(mols, c.code, C);
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
      U.section('Champs',
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
      )
    );
    paintRows();
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
      const manBox = h('div', { class: 'v3-fiche-man', hidden: true });
      const champsHost = h('div');
      const empList = h('div', { class: 'v3-fiche-emps' });

      let molsCache = [];
      let nbWrap = null;
      let nbCtrl = null;

      function syncComp() {
        const isAuto = cfg.composition !== 'manuel';
        autoBox.hidden = !isAuto;
        manBox.hidden = isAuto;
        ctx.changed();
      }

      function paintEmps() {
        empList.replaceChildren();
        const emps = cfg.emplacements || [];
        if (!emps.length) {
          empList.appendChild(U.empty('Aucun emplacement'));
          return;
        }
        emps.forEach(function (emp, idx) {
          const fixeHost = h('div', { class: 'v3-fiche-emp-fixe' });
          function paintFixe() {
            fixeHost.replaceChildren();
            if (emp.mode !== 'fixe') {
              fixeHost.hidden = true;
              return;
            }
            fixeHost.hidden = false;
            fixeHost.appendChild(molTypeahead(molsCache, emp.matrice_id, function (id) {
              emp.matrice_id = id;
              ctx.changed();
            }));
          }
          const row = h('div', { class: 'v3-fiche-emp-row' },
            h('span', { class: 'v3-fiche-emp-n' }, String(idx + 1)),
            U.segmented([
              { value: 'aleatoire', label: 'Aléatoire' },
              { value: 'fixe', label: 'Fixe' },
            ], emp.mode, function (v) {
              emp.mode = v;
              if (v !== 'fixe') emp.matrice_id = null;
              paintFixe();
              ctx.changed();
            }),
            fixeHost,
            h('div', { class: 'v3-fiche-emp-act' },
              U.button('↑', {
                variant: 'ghost',
                disabled: idx === 0,
                onClick: function () {
                  const t = emps[idx - 1];
                  emps[idx - 1] = emps[idx];
                  emps[idx] = t;
                  emps.forEach(function (e, i) { e.ordre = i + 1; });
                  paintEmps();
                  ctx.changed();
                },
              }),
              U.button('↓', {
                variant: 'ghost',
                disabled: idx >= emps.length - 1,
                onClick: function () {
                  const t = emps[idx + 1];
                  emps[idx + 1] = emps[idx];
                  emps[idx] = t;
                  emps.forEach(function (e, i) { e.ordre = i + 1; });
                  paintEmps();
                  ctx.changed();
                },
              }),
              U.button('×', {
                variant: 'ghost',
                onClick: function () {
                  emps.splice(idx, 1);
                  emps.forEach(function (e, i) { e.ordre = i + 1; });
                  paintEmps();
                  ctx.changed();
                },
              })
            )
          );
          paintFixe();
          empList.appendChild(row);
        });
      }

      function paintAutoOpts() {
        autoBox.replaceChildren();
        const modeSeg = U.segmented([
          { value: 'aleatoire', label: 'Aléatoire', tip: 'Tirage de N fiches.' },
          { value: 'groupe', label: 'Groupe', tip: '1 fiche par molécule du pool.' },
        ], cfg.fiches_mode, function (v) {
          cfg.fiches_mode = v;
          paintAutoOpts();
          ctx.changed();
        });
        nbWrap = h('div', { class: 'v3-fiche-nb-wrap' });
        if (cfg.fiches_mode === 'aleatoire') {
          nbCtrl = U.number(cfg.nb_fiches, {
            min: 1, max: 30, step: 1,
            onChange: function (v) { cfg.nb_fiches = v; ctx.changed(); },
          });
          nbWrap.appendChild(U.field('Fiches', nbCtrl, { tip: '1–30.' }));
        }
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
          U.tip('Molécules retirées du tirage après assez de bonnes notes (partie réelle).')
        );
        autoBox.append(
          U.field('Fiches', modeSeg),
          nbWrap,
          exLine
        );
      }

      el.replaceChildren(
        champsHost,
        U.section('Composition',
          U.field('Mode', U.segmented([
            { value: 'auto', label: 'Auto', tip: 'Test, tirage aléatoire ou groupe.' },
            { value: 'manuel', label: 'Manuel', tip: 'Apprentissage, emplacements fixés.' },
          ], cfg.composition === 'manuel' ? 'manuel' : 'auto', function (v) {
            cfg.composition = v;
            syncComp();
          }), { tip: 'Auto = tirage · Manuel = liste d’emplacements.' }),
          autoBox,
          manBox
        )
      );

      manBox.append(
        empList,
        U.button('+ Fiche', {
          variant: 'ghost',
          onClick: function () {
            if (!cfg.emplacements) cfg.emplacements = [];
            cfg.emplacements.push({
              ordre: cfg.emplacements.length + 1,
              mode: 'aleatoire',
              matrice_id: null,
            });
            paintEmps();
            ctx.changed();
          },
        })
      );

      paintAutoOpts();
      syncComp();
      paintEmps();

      void ctx.mols().then(function (mols) {
        molsCache = mols || [];
        paintParamsChamps(champsHost, cfg, ctx, molsCache);
        paintEmps();
      });
    },

    perso: function (el, ctx) {
      const cfg = ctx.cfg;
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

      el.replaceChildren(
        U.section('Aperçu', nav, cardHost)
      );
      regen();
    },

    play: function (el, ctx, session) {
      const cfg = ctx.cfg;
      const C = ctx.champs;
      const N = ctx.notation;
      const modeHost = h('div');
      const main = h('div');
      el.replaceChildren(modeHost, main);

      void (async function () {
        let mols = await ctx.mols();
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

        function showFin() {
          let sum = 0;
          results.forEach(function (r) { sum += r.note; });
          const avg = results.length ? Math.round((sum / results.length) * 10) / 10 : 0;
          const list = h('ul', { class: 'v3-fiche-fin-list' });
          results.forEach(function (r) {
            list.appendChild(h('li', null, molLabel(r.mol) + ' — ' + r.note + '/10'));
          });
          const actions = h('div', { class: 'v3-actions' },
            U.button('Terminer', {
              variant: 'primary',
              onClick: function () {
                submitFin._relecture = false;
                void submitFin(avg);
              },
            })
          );
          if (playMode === 'detaille') {
            actions.appendChild(U.button('Valider + relecture admin', {
              variant: 'ghost',
              onClick: function () {
                submitFin._relecture = true;
                void submitFin(avg);
              },
            }));
          }
          main.replaceChildren(
            h('div', { class: 'v3-fin' },
              N.resultat(avg, 10),
              h('p', { class: 'v3-muted' }, 'Moyenne des fiches'),
              list,
              actions
            )
          );
        }

        async function submitFin(avg) {
          const details = results.map(function (r) {
            return { matrice_id: r.mol.id, note: r.note };
          });
          if (session.reel && tentativeId) {
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
                p_demander_relecture: !!submitFin._relecture,
              });
            } catch (e) {
              U.toast(e.message || 'Erreur', 'err');
              return;
            }
          }
          session.fin({
            obtenu: avg,
            max: 10,
            details: details,
          });
        }
        submitFin._relecture = false;

        let fi = 0;
        let revealed = false;
        const prog = h('p', { class: 'v3-play-progress' });
        const cardSlot = h('div');
        const act = h('div', { class: 'v3-actions' });
        const noteSlot = h('div');

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
          act.appendChild(U.button('Révéler', {
            variant: 'primary',
            onClick: function () {
              revealed = true;
              cardSlot.replaceChildren(buildCard(mol, cfg, C, true));
              act.replaceChildren();
              if (playMode === 'rapide') {
                noteSlot.replaceChildren(h('p', { class: 'v3-muted' }, 'Note /10'));
                N.rapide(noteSlot, {
                  onScore: function (score) {
                    act.replaceChildren(U.button('Fiche suivante', {
                      variant: 'primary',
                      onClick: function () {
                        results.push({ mol: mol, note: score });
                        paintFiche(fi + 1);
                      },
                    }));
                  },
                });
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
                let lastNote = 0;
                N.detaille(noteSlot, items, {
                  onChange: function (st) {
                    lastNote = st.max ? Math.round((st.obtenu / st.max) * 100) / 10 : 0;
                  },
                });
                act.appendChild(U.button('Fiche suivante', {
                  variant: 'primary',
                  onClick: function () {
                    results.push({ mol: mol, note: lastNote });
                    paintFiche(fi + 1);
                  },
                }));
              }
            },
          }));
        }

        N.choixMode(modeHost, {
          onPick: function (m) {
            playMode = m;
            modeHost.hidden = true;
            startPartie();
          },
        });

        main.replaceChildren(prog, cardSlot, act, noteSlot);
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
      }
      return { fiche: fiche };
    },
  });
})(window);
