(function (global) {
  const U = global.V3UI;
  const C = global.V3Champs;
  const h = U.h;

  function cfgInit(cfg) {
    if (!cfg.grille_json || typeof cfg.grille_json !== 'object') {
      cfg.grille_json = { lignes: [], trous: [] };
    }
    if (!Array.isArray(cfg.grille_json.lignes)) cfg.grille_json.lignes = [];
    if (!Array.isArray(cfg.grille_json.trous)) cfg.grille_json.trous = [];
    if (!Array.isArray(cfg.lignes_manuelles)) cfg.lignes_manuelles = [];
    if (!cfg.composition) cfg.composition = 'auto';
    if (!cfg.lignes_mode) cfg.lignes_mode = 'aleatoire';
    if (cfg.nb_lignes == null) cfg.nb_lignes = 5;
    if (cfg.taux_trous == null) cfg.taux_trous = 40;
    return cfg;
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

  /** Molécules avec au moins une publication visible (hors `vide`). */
  function molsJoueur(mols) {
    return (mols || []).filter(function (m) { return !m.vide; });
  }

  function includedCols(cfg) {
    return (cfg.colonnes || [])
      .filter(function (c) { return c.included; })
      .sort(function (a, b) { return (a.ordre || 0) - (b.ordre || 0); });
  }

  function trouableCols(cfg) {
    return includedCols(cfg).filter(function (c) { return c.role === 'trouable'; });
  }

  function bootstrapColonnes(cfg, mols) {
    const present = C.presents(mols || []);
    const extras = present.filter(function (code) {
      const meta = C.list.find(function (x) { return x.code === code; });
      return meta && !meta.identite;
    }).slice(0, 4);
    const codes = ['dci', 'nom_commercial'].concat(extras);
    const seen = {};
    const cols = [];
    codes.forEach(function (code, i) {
      if (seen[code]) return;
      seen[code] = true;
      const meta = C.list.find(function (x) { return x.code === code; });
      cols.push({
        champ_code: code,
        included: true,
        role: meta && meta.identite ? 'visible' : 'trouable',
        ordre: i,
      });
    });
    C.list.forEach(function (meta, i) {
      if (seen[meta.code]) return;
      cols.push({
        champ_code: meta.code,
        included: false,
        role: meta.identite ? 'visible' : 'trouable',
        ordre: cols.length + i,
      });
    });
    cfg.colonnes = cols.map(function (c, i) {
      return Object.assign({}, c, { ordre: i });
    });
  }

  function ensureColonnes(cfg, mols) {
    if (!cfg.colonnes || !cfg.colonnes.length) bootstrapColonnes(cfg, mols);
    else {
      const have = {};
      cfg.colonnes.forEach(function (c) { have[c.champ_code] = true; });
      C.list.forEach(function (meta) {
        if (!have[meta.code]) {
          cfg.colonnes.push({
            champ_code: meta.code,
            included: false,
            role: meta.identite ? 'visible' : 'trouable',
            ordre: cfg.colonnes.length,
          });
        }
      });
    }
  }

  function reindexColonnes(cfg) {
    cfg.colonnes.forEach(function (c, i) { c.ordre = i; });
  }

  function cellKey(molId, code) {
    return String(molId) + ':' + code;
  }

  function valsMol(mol, code) {
    if (code === 'dci') return mol.dci ? [mol.dci] : [];
    if (code === 'nom_commercial') return (mol.noms || []).slice();
    return C.valeurs(mol, code);
  }

  function rowEligible(mol, cols) {
    return cols.some(function (col) {
      if (col.role !== 'trouable') return false;
      return valsMol(mol, col.champ_code).length > 0;
    });
  }

  function pickLignes(cfg, mols) {
    const pool = molsJoueur(mols);
    const cols = includedCols(cfg);
    const trouCols = trouableCols(cfg);
    if (cfg.lignes_mode === 'groupe') {
      return pool.filter(function (m) { return rowEligible(m, trouCols.length ? trouCols : cols); });
    }
    if (cfg.lignes_mode === 'manuel') {
      const ids = cfg.lignes_manuelles || [];
      return ids.map(function (id) {
        return pool.find(function (m) { return m.id === id; });
      }).filter(Boolean);
    }
    const n = Math.max(1, Math.min(50, Number(cfg.nb_lignes) || 5));
    const sh = shuffle(pool);
    const out = [];
    for (let i = 0; i < sh.length && out.length < n; i += 1) {
      if (rowEligible(sh[i], trouCols.length ? trouCols : cols)) out.push(sh[i]);
    }
    return out;
  }

  function isTrouGrille(cfg, molId, code) {
    const g = cfg.grille_json;
    return (g.trous || []).some(function (p) {
      return String(p[0]) === String(molId) && p[1] === code;
    });
  }

  function setTrouGrille(cfg, molId, code, hole) {
    const g = cfg.grille_json;
    const rest = (g.trous || []).filter(function (p) {
      return !(String(p[0]) === String(molId) && p[1] === code);
    });
    if (hole) rest.push([molId, code]);
    g.trous = rest;
  }

  function autoTrous(cfg, lignes) {
    const cols = trouableCols(cfg);
    const candidates = [];
    lignes.forEach(function (mol) {
      cols.forEach(function (col) {
        const vs = valsMol(mol, col.champ_code);
        if (vs.length) candidates.push({ mol: mol, code: col.champ_code, vals: vs });
      });
    });
    const taux = Math.max(0, Math.min(100, Number(cfg.taux_trous) || 40));
    const n = Math.round(candidates.length * (taux / 100));
    return shuffle(candidates).slice(0, n);
  }

  function buildTirage(cfg, mols) {
    const composition = cfg.composition || 'auto';
    let lignes;
    if (composition === 'grille' && (cfg.grille_json.lignes || []).length) {
      const ids = cfg.grille_json.lignes;
      lignes = ids.map(function (id) {
        return mols.find(function (m) { return m.id === id; });
      }).filter(Boolean);
    } else {
      lignes = pickLignes(cfg, mols);
    }
    const cols = includedCols(cfg);
    let trous = [];
    if (composition === 'grille') {
      (cfg.grille_json.trous || []).forEach(function (p) {
        const mol = lignes.find(function (m) { return String(m.id) === String(p[0]); });
        if (!mol) return;
        const vs = valsMol(mol, p[1]);
        if (!vs.length) return;
        trous.push({ mol: mol, code: p[1], vals: vs });
      });
    } else {
      trous = autoTrous(cfg, lignes);
    }
    return {
      composition: composition,
      lignes: lignes,
      colonnes: cols.map(function (c) {
        return { champ_code: c.champ_code, role: c.role };
      }),
      trous: trous,
      lignes_ids: lignes.map(function (m) { return m.id; }),
      trous_pairs: trous.map(function (t) { return [t.mol.id, t.code]; }),
    };
  }

  function countTrouUnits(tirage) {
    let n = 0;
    (tirage.trous || []).forEach(function (t) { n += (t.vals || []).length; });
    return n;
  }

  function syncGrilleLignes(cfg, mols) {
    const lignes = pickLignes(cfg, mols);
    cfg.grille_json.lignes = lignes.map(function (m) { return m.id; });
    const ok = {};
    lignes.forEach(function (m) { ok[m.id] = true; });
    cfg.grille_json.trous = (cfg.grille_json.trous || []).filter(function (p) {
      return ok[p[0]];
    });
  }

  function molLabel(mol) {
    const t = global.V3UI && global.V3UI.txt;
    return (t ? t(mol && mol.dci) : (mol && mol.dci)) || '—';
  }

  function renderCellValues(vals, className) {
    if (!vals || !vals.length) return h('span', { class: 'v3-muted' }, '—');
    if (vals.length === 1) return h('span', { class: className || '' }, vals[0]);
    return h('ul', { class: 'v3-trous-vals' + (className ? ' ' + className : '') },
      vals.map(function (v) { return h('li', null, v); })
    );
  }

  function renderTable(opts) {
    opts = opts || {};
    const tirage = opts.tirage;
    const cols = tirage.colonnes || [];
    const lignes = tirage.lignes || [];
    const holeSet = {};
    (tirage.trous || []).forEach(function (t) {
      holeSet[cellKey(t.mol.id, t.code)] = true;
    });

    const thead = h('tr', null,
      h('th', { class: 'v3-trous-sticky-col' }, 'Molécule'),
      cols.map(function (col) {
        const meta = C.list.find(function (x) { return x.code === col.champ_code; });
        const headKids = [h('span', null, meta ? (meta.court || meta.label) : col.champ_code)];
        if (opts.colActions && col.role === 'trouable') {
          headKids.push(h('div', { class: 'v3-trous-col-act' },
            U.button('Tout trouer', {
              variant: 'ghost',
              onClick: function () { opts.colActions.all(col.champ_code); },
            }),
            U.button('Vider', {
              variant: 'ghost',
              onClick: function () { opts.colActions.clear(col.champ_code); },
            })
          ));
        }
        return h('th', { class: 'v3-trous-sticky-head' }, headKids);
      })
    );

    const tbody = lignes.map(function (mol) {
      const noms = (mol.noms || []).join(', ');
      return h('tr', null,
        h('th', { class: 'v3-trous-sticky-col', scope: 'row' },
          h('strong', null, molLabel(mol)),
          noms ? h('span', { class: 'v3-muted v3-trous-noms' }, noms) : null
        ),
        cols.map(function (col) {
          const vs = valsMol(mol, col.champ_code);
          const key = cellKey(mol.id, col.champ_code);
          const isHole = !!holeSet[key];
          const editable = opts.onCellClick && col.role === 'trouable' && vs.length;
          const playHole = opts.play && isHole && !opts.revealed && opts.mode !== 'detaille';
          const playInput = opts.play && isHole && !opts.revealed && opts.mode === 'detaille';

          if (playInput) {
            const ta = h('textarea', {
              class: 'v3-trous-input v3-ctrl',
              rows: 2,
              'aria-label': (C.label(col.champ_code) || col.champ_code) + ' · ' + molLabel(mol),
            });
            if (opts.onInput) {
              ta.addEventListener('input', function () {
                opts.onInput(key, ta.value);
              });
            }
            return h('td', { class: 'v3-trous-cell is-hole' }, ta);
          }

          let inner;
          let cls = 'v3-trous-cell';
          if (playHole) {
            inner = h('span', { class: 'v3-trous-hole-mark' }, '…');
            cls += ' is-hole is-masked';
          } else if (opts.persoGrille && col.role === 'trouable' && vs.length) {
            if (isHole) {
              cls += ' is-hole is-picked';
              inner = [renderCellValues(vs, 'v3-trous-picked-val'), h('span', { class: 'v3-trous-hole-ico', 'aria-hidden': 'true' }, '▢')];
            } else {
              inner = renderCellValues(vs);
            }
          } else if (opts.revealed && isHole) {
            cls += ' is-hole is-revealed';
            inner = renderCellValues(vs, 'v3-trous-revealed-val');
          } else {
            inner = renderCellValues(vs);
          }

          const td = h('td', {
            class: cls,
            tabIndex: editable ? 0 : null,
            role: editable ? 'button' : null,
            onClick: editable ? function () { opts.onCellClick(mol.id, col.champ_code); } : null,
            onKeydown: editable ? function (ev) {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                opts.onCellClick(mol.id, col.champ_code);
              }
            } : null,
          }, inner);
          return td;
        })
      );
    });

    return h('div', { class: 'v3-table-wrap v3-trous-scroll' },
      h('table', { class: 'v3-table v3-trous-table' },
        h('thead', { class: 'v3-trous-sticky-head-row' }, thead),
        h('tbody', null, tbody)
      )
    );
  }

  /** Markup joueur V2 (`jp-trous-grid`). */
  function renderJpPlayTable(tirage, opts) {
    opts = opts || {};
    const cols = tirage.colonnes || [];
    const lignes = tirage.lignes || [];
    const holeSet = {};
    (tirage.trous || []).forEach(function (t) {
      holeSet[cellKey(t.mol.id, t.code)] = true;
    });
    const saisies = opts.saisies || {};
    const intro = h('p', { class: 'jp-muted' },
      opts.mode === 'detaille'
        ? 'Complétez les cases vides, puis révélez les réponses.'
        : 'Complétez mentalement les cases « ??? ». Seules les infos du parcours sont présentes.'
    );
    const thead = h('tr', null,
      h('th', null, 'Molécule'),
      cols.map(function (col) {
        const meta = C.list.find(function (x) { return x.code === col.champ_code; });
        return h('th', null, meta ? (meta.court || meta.label) : col.champ_code);
      })
    );
    const tbody = lignes.map(function (mol) {
      const noms = (mol.noms || []).join(', ');
      return h('tr', null,
        h('th', { scope: 'row' },
          h('strong', null, molLabel(mol)),
          noms ? h('br', null) : null,
          noms ? h('span', { class: 'jp-muted' }, noms) : null
        ),
        cols.map(function (col) {
          const vs = valsMol(mol, col.champ_code);
          const key = cellKey(mol.id, col.champ_code);
          const isHole = !!holeSet[key];
          let inner;
          if (!vs.length) {
            inner = h('span', { class: 'jp-muted' }, '—');
          } else if (isHole && !opts.revealed && opts.mode === 'detaille') {
            const ta = h('textarea', {
              class: 'jp-trous-saisie',
              rows: 2,
              'aria-label': (C.label(col.champ_code) || col.champ_code) + ' · ' + molLabel(mol),
            });
            if (saisies[key]) ta.value = saisies[key];
            ta.addEventListener('input', function () {
              if (opts.onInput) opts.onInput(key, ta.value);
            });
            inner = ta;
          } else if (isHole && !opts.revealed) {
            inner = h('em', null, '???');
          } else if (vs.length === 1) {
            inner = h('span', null, vs[0]);
          } else {
            inner = h('ul', { class: 'jp-trous-vals' }, vs.map(function (v) { return h('li', null, v); }));
          }
          return h('td', { class: isHole ? 'jp-trou' : '' }, inner);
        })
      );
    });
    return h('div', null, intro,
      h('div', { class: 'jp-table-wrap' },
        h('table', { class: 'jp-table jp-trous-grid' },
          h('thead', null, thead),
          h('tbody', null, tbody)
        )
      )
    );
  }

  function paintColonnesEditor(cfg, mols, ctx, host) {
    ensureColonnes(cfg, mols);
    if (!includedCols(cfg).length) bootstrapColonnes(cfg, mols);
    host.replaceChildren();
    const sorted = cfg.colonnes.slice().sort(function (a, b) { return a.ordre - b.ordre; });
    sorted.forEach(function (col) {
      const meta = C.list.find(function (x) { return x.code === col.champ_code; });
      if (!meta) return;
      const cb = h('input', { type: 'checkbox', checked: !!col.included });
      cb.addEventListener('change', function () {
        col.included = cb.checked;
        ctx.changed();
        paintColonnesEditor(cfg, mols, ctx, host);
      });
      const roleHost = h('div', { class: 'v3-trous-role', hidden: !col.included || meta.identite });
      if (col.included && !meta.identite) {
        roleHost.hidden = false;
        roleHost.replaceChildren(U.segmented([
          { value: 'visible', label: 'Visible', tip: 'Affichée telle quelle.' },
          { value: 'trouable', label: 'Trouable', tip: 'Peut être masquée.' },
        ], col.role, function (v) {
          col.role = v;
          ctx.changed();
        }));
      }
      const idx = sorted.indexOf(col);
      function moveCol(dir) {
        const j = idx + dir;
        if (j < 0 || j >= sorted.length) return;
        const tmp = sorted[idx].ordre;
        sorted[idx].ordre = sorted[j].ordre;
        sorted[j].ordre = tmp;
        reindexColonnes(cfg);
        paintColonnesEditor(cfg, mols, ctx, host);
      }
      host.appendChild(h('div', { class: 'v3-trous-col-row' },
        cb,
        h('span', { class: 'v3-trous-col-lab' }, meta.label),
        h('div', { class: 'v3-trous-col-ord' },
          U.button('↑', { variant: 'ghost', disabled: idx <= 0, onClick: function () { moveCol(-1); } }),
          U.button('↓', { variant: 'ghost', disabled: idx >= sorted.length - 1, onClick: function () { moveCol(1); } })
        ),
        roleHost
      ));
    });
  }

  function mountLignesManuelAdder(mols, cfg, ctx, host) {
    if (!Array.isArray(cfg.lignes_manuelles)) cfg.lignes_manuelles = [];
    let draftId = '';
    const ad = U.adder({
      title: 'Ligne',
      propose: false,
      items: function () { return cfg.lignes_manuelles.slice(); },
      empty: 'Aucune ligne',
      draft: function (draftHost, api) {
        const input = h('input', {
          type: 'search',
          class: 'v3-ctrl',
          placeholder: 'DCI',
          autocomplete: 'off',
          'aria-label': 'Molécule',
        });
        const drop = h('div', { class: 'v3-sel-drop', hidden: true });
        const wrap = h('div', { class: 'v3-sel', style: { position: 'relative' } }, input, drop);
        draftHost.appendChild(wrap);
        function paintDrop(q) {
          const n = global.V3Data.norm(q || '');
          const used = {};
          cfg.lignes_manuelles.forEach(function (id) { used[id] = true; });
          const hits = mols.filter(function (m) {
            if (used[m.id]) return false;
            const hay = global.V3Data.norm(m.dci + ' ' + (m.noms || []).join(' '));
            return !n || hay.indexOf(n) >= 0;
          }).slice(0, 12);
          drop.replaceChildren();
          hits.forEach(function (m) {
            drop.appendChild(h('button', {
              type: 'button',
              class: 'v3-sel-opt' + (String(m.id) === String(draftId) ? ' is-on' : ''),
              onMousedown: function (ev) { ev.preventDefault(); },
              onClick: function () {
                draftId = m.id;
                input.value = molLabel(m);
                drop.hidden = true;
                api.setDraftReady(true);
              },
            }, molLabel(m)));
          });
          if (!hits.length) drop.appendChild(h('div', { class: 'v3-sel-msg' }, '—'));
          drop.hidden = false;
        }
        input.addEventListener('input', function () {
          draftId = '';
          api.setDraftReady(false);
          paintDrop(input.value);
        });
        input.addEventListener('focus', function () { paintDrop(input.value); });
        document.addEventListener('mousedown', function onDoc(ev) {
          if (!wrap.isConnected) {
            document.removeEventListener('mousedown', onDoc);
            return;
          }
          if (!wrap.contains(ev.target)) drop.hidden = true;
        });
      },
      onAdd: function () {
        if (!draftId) return;
        if (cfg.lignes_manuelles.indexOf(draftId) >= 0) return;
        cfg.lignes_manuelles.push(draftId);
        draftId = '';
      },
      renderItem: function (id, i, api) {
        const mol = mols.find(function (m) { return String(m.id) === String(id); });
        return h('div', { class: 'v3-trous-ligne-row' },
          h('span', null, mol ? molLabel(mol) : String(id).slice(0, 8)),
          h('div', { class: 'v3-trous-ligne-act' },
            U.button('↑', { variant: 'ghost', disabled: i <= 0, onClick: function () { api.move(i, -1); } }),
            U.button('↓', { variant: 'ghost', disabled: i >= cfg.lignes_manuelles.length - 1, onClick: function () { api.move(i, 1); } }),
            U.button('Retirer', { variant: 'ghost', onClick: function () { api.remove(i); } })
          )
        );
      },
      onChange: function () { ctx.changed(); },
    });
    host.appendChild(ad.el);
    ad.refresh();
    return ad;
  }

  function defaults() {
    return cfgInit({
      composition: 'auto',
      nb_lignes: 5,
      lignes_mode: 'aleatoire',
      taux_trous: 40,
      grille_json: { lignes: [], trous: [] },
      colonnes: [],
      lignes_manuelles: [],
    });
  }

  function fromConfig(raw) {
    raw = raw || {};
    const cfg = cfgInit({
      composition: raw.composition || 'auto',
      nb_lignes: raw.nb_lignes != null ? raw.nb_lignes : 5,
      lignes_mode: raw.lignes_mode || 'aleatoire',
      taux_trous: raw.taux_trous != null ? raw.taux_trous : 40,
      grille_json: raw.grille_json || { lignes: [], trous: [] },
      lignes_manuelles: [],
      colonnes: [],
    });
    const fromDb = (raw.colonnes || []).slice().sort(function (a, b) {
      return (a.ordre || 0) - (b.ordre || 0);
    });
    const inc = {};
    fromDb.forEach(function (c) {
      inc[c.champ_code] = { included: true, role: c.role || 'trouable', ordre: c.ordre };
    });
    cfg.colonnes = C.list.map(function (meta, i) {
      if (inc[meta.code]) {
        return {
          champ_code: meta.code,
          included: true,
          role: inc[meta.code].role,
          ordre: inc[meta.code].ordre != null ? inc[meta.code].ordre : i,
        };
      }
      return {
        champ_code: meta.code,
        included: false,
        role: meta.identite ? 'visible' : 'trouable',
        ordre: 100 + i,
      };
    }).sort(function (a, b) { return a.ordre - b.ordre; });
    reindexColonnes(cfg);
    if ((cfg.grille_json.lignes || []).length && cfg.lignes_mode === 'manuel') {
      cfg.lignes_manuelles = cfg.grille_json.lignes.slice();
    }
    return cfg;
  }

  function payloadCols(cfg) {
    return includedCols(cfg).map(function (c, i) {
      return { champ_code: c.champ_code, role: c.role, ordre: i };
    });
  }

  function rememberMols(ctx, mols) {
    ctx._trousMols = mols;
    ctx.changed();
  }

  function validate(ctx) {
    const cfg = cfgInit(ctx.cfg || {});
    const msgs = [];
    const p = ctx.mols();
    if (ctx._trousMolsP !== p) {
      ctx._trousMolsP = p;
      ctx._trousMols = null;
      void p.then(function (m) {
        if (ctx._trousMolsP === p) rememberMols(ctx, molsJoueur(m));
      });
    }
    const mols = ctx._trousMols;
    if (mols && !mols.length) msgs.push('Pool vide');
    if (!includedCols(cfg).length) msgs.push('Aucune colonne');
    if (!trouableCols(cfg).length) msgs.push('Aucune colonne trouable');
    if (cfg.lignes_mode === 'manuel' && !(cfg.lignes_manuelles || []).length) {
      msgs.push('Aucune molécule choisie');
    }
    if (cfg.composition === 'grille' && !(cfg.grille_json.trous || []).length) {
      msgs.push('Grille : aucun trou');
    }
    if (mols && mols.length) {
      ensureColonnes(cfg, mols);
      const lignes = pickLignes(cfg, mols);
      if (!lignes.length) msgs.push('Aucune ligne éligible');
      else if (cfg.composition !== 'grille') {
        const t = buildTirage(cfg, mols);
        if (!countTrouUnits(t)) msgs.push('Aucun trou sur ce tirage');
      }
    }
    return msgs;
  }

  function payload(ctx) {
    const cfg = cfgInit(ctx.cfg || {});
    const gj = cfg.grille_json || { lignes: [], trous: [] };
    return {
      trous: {
        composition: cfg.composition,
        nb_lignes: Number(cfg.nb_lignes) || 5,
        lignes_mode: cfg.lignes_mode,
        taux_trous: Number(cfg.taux_trous) || 40,
        grille_json: {
          lignes: (gj.lignes || []).slice(),
          trous: (gj.trous || []).slice(),
        },
        colonnes: payloadCols(cfg),
      },
    };
  }

  function params(el, ctx) {
    if (el.dataset.v3TrousParams) return;
    el.dataset.v3TrousParams = '1';
    const cfg = cfgInit(ctx.cfg);
    const root = h('div', { class: 'v3-stack v3-trous-params' });
    el.replaceChildren(root);

    void ctx.mols().then(function (raw) {
      const mols = molsJoueur(raw);
      rememberMols(ctx, mols);
      if (!mols.length) {
        root.replaceChildren(U.empty('Pool vide'));
        return;
      }

      const lignesExtra = h('div', { class: 'v3-trous-lignes-extra' });
      const manuelHost = h('div');
      const tauxWrap = h('div', { class: 'v3-trous-taux', hidden: cfg.composition !== 'auto' });
      const tauxVal = h('span', { class: 'v3-trous-taux-val' }, String(cfg.taux_trous) + ' %');
      const tauxRange = h('input', {
        type: 'range',
        class: 'v3-trous-range',
        min: 10,
        max: 100,
        step: 10,
        value: cfg.taux_trous,
        'aria-label': 'Part de cases vides',
      });
      tauxRange.addEventListener('input', function () {
        cfg.taux_trous = Number(tauxRange.value);
        tauxVal.textContent = String(cfg.taux_trous) + ' %';
        ctx.changed();
      });
      tauxWrap.append(tauxVal, tauxRange);

      function paintLignesExtra() {
        lignesExtra.replaceChildren();
        manuelHost.replaceChildren();
        if (cfg.lignes_mode === 'aleatoire') {
          lignesExtra.appendChild(U.field('Nb lignes', U.number(cfg.nb_lignes, {
            min: 1, max: 50, step: 1,
            onChange: function (v) { cfg.nb_lignes = v; ctx.changed(); },
          })));
        } else if (cfg.lignes_mode === 'manuel') {
          mountLignesManuelAdder(mols, cfg, ctx, manuelHost);
          lignesExtra.appendChild(manuelHost);
        }
      }

      const compSeg = U.segmented([
        { value: 'auto', label: 'Pool automatique', tip: 'Trous tirés à chaque partie.' },
        { value: 'grille', label: 'Grille', tip: 'Vous choisissez chaque case.' },
      ], cfg.composition, function (v) {
        cfg.composition = v;
        tauxWrap.hidden = v !== 'auto';
        ctx.changed();
      });

      const lignesSeg = U.segmented([
        { value: 'aleatoire', label: 'Aléatoire', tip: 'N lignes tirées dans le pool.' },
        { value: 'groupe', label: 'Pool complet', tip: 'Toutes les lignes éligibles.' },
        { value: 'manuel', label: 'Pool personnalisé', tip: 'Liste fixe de molécules.' },
      ], cfg.lignes_mode, function (v) {
        cfg.lignes_mode = v;
        paintLignesExtra();
        ctx.changed();
      });

      root.replaceChildren(
        U.card('Paramètres',
          U.grid(2,
            U.field('Composition', compSeg),
            U.field('Lignes', lignesSeg)
          ),
          lignesExtra,
          U.field('Cases vides', tauxWrap, { tip: 'Pool automatique uniquement.', col: true })
        )
      );
      paintLignesExtra();
    });
  }

  function perso(el, ctx) {
    const cfg = cfgInit(ctx.cfg);
    el.replaceChildren(U.empty('Chargement…'));
    void ctx.mols().then(function (raw) {
      const mols = molsJoueur(raw);
      rememberMols(ctx, mols);
      if (!mols.length) {
        el.replaceChildren(U.empty('Pool vide'));
        return;
      }
      if (cfg.composition === 'grille') syncGrilleLignes(cfg, mols);

      const colsHost = h('div', { class: 'v3-trous-cols' });
      paintColonnesEditor(cfg, mols, ctx, colsHost);

      let tirage = buildTirage(cfg, mols);
      const countEl = h('p', { class: 'v3-trous-count' });
      const tableHost = h('div');
      const gridBlock = h('div', { class: 'v3-stack', hidden: cfg.composition !== 'grille' });

      function refreshCount() {
        countEl.textContent = countTrouUnits(tirage) + ' valeurs à trouver';
      }

      function paintGrille() {
        tableHost.replaceChildren();
        if (cfg.composition !== 'grille') return;
        tableHost.appendChild(renderTable({
          tirage: tirage,
          persoGrille: true,
          onCellClick: function (molId, code) {
            const hole = !isTrouGrille(cfg, molId, code);
            setTrouGrille(cfg, molId, code, hole);
            tirage = buildTirage(cfg, mols);
            refreshCount();
            paintGrille();
            ctx.changed();
          },
          colActions: {
            all: function (code) {
              tirage.lignes.forEach(function (mol) {
                if (valsMol(mol, code).length) setTrouGrille(cfg, mol.id, code, true);
              });
              tirage = buildTirage(cfg, mols);
              refreshCount();
              paintGrille();
              ctx.changed();
            },
            clear: function (code) {
              tirage.lignes.forEach(function (mol) {
                setTrouGrille(cfg, mol.id, code, false);
              });
              tirage = buildTirage(cfg, mols);
              refreshCount();
              paintGrille();
              ctx.changed();
            },
          },
        }));
        refreshCount();
      }

      gridBlock.append(
        U.field('Grille', tableHost, { col: true, tip: 'Cliquer une case trouable pour la masquer.' }),
        countEl
      );
      refreshCount();
      paintGrille();

      el.replaceChildren(
        h('div', { class: 'v3-stack v3-trous-perso' },
          U.card('Colonnes',
            U.field('', colsHost, { col: true, tip: 'Ordre d’affichage et rôle visible / trouable.' })
          ),
          gridBlock
        )
      );
    });
  }

  function essai(el, ctx) {
    const cfg = cfgInit(ctx.cfg);
    const panel = U.essaiPanel({ title: 'Tirage' });
    el.append(
      U.button('Tester un tirage', {
        variant: 'ghost',
        onClick: function () { void run(); },
      }),
      panel.el
    );
    const countEl = h('p', { class: 'v3-trous-count' });
    const tableHost = h('div');

    async function run() {
      panel.open();
      panel.body.replaceChildren(U.empty('…'));
      try {
        const raw = await ctx.mols();
        const mols = molsJoueur(raw);
        if (!mols.length) {
          panel.body.replaceChildren(U.empty('Pool vide'));
          return;
        }
        ensureColonnes(cfg, mols);
        const tirage = buildTirage(cfg, mols);
        countEl.textContent = countTrouUnits(tirage) + ' valeurs à trouver';
        tableHost.replaceChildren(renderTable({ tirage: tirage }));
        panel.body.replaceChildren(countEl, tableHost);
      } catch (e) {
        panel.body.replaceChildren(U.empty(e.message || 'Erreur'));
      }
    }
  }

  function notationItems(tirage, saisies) {
    const items = [];
    (tirage.trous || []).forEach(function (t) {
      const saisie = (saisies && saisies[cellKey(t.mol.id, t.code)]) || '';
      (t.vals || []).forEach(function (att) {
        items.push({
          groupe: molLabel(t.mol),
          contexte: C.label(t.code),
          saisie: saisie,
          attendu: att,
        });
      });
    });
    return items;
  }

  function snapshotTirage(tirage) {
    return {
      composition: tirage.composition,
      lignes: tirage.lignes_ids,
      colonnes: tirage.colonnes,
      trous: tirage.trous_pairs,
    };
  }

  async function submitDeclare(session, tentativeId, mode, scoreData, saisies, demanderRelecture) {
    if (!session.reel) {
      if (demanderRelecture) U.toast('Relecture demandée (essai)');
      session.fin(scoreData.fin);
      return;
    }
    try {
      await session.rpc('jeu_soumettre_declare', {
        p_tentative_id: tentativeId,
        p_reponses: { mode: mode, saisies: saisies || {} },
        p_score_provisoire: scoreData.rpc.obtenu,
        p_score_max: scoreData.rpc.max,
        p_details: scoreData.rpc.details || [],
        p_demander_relecture: !!demanderRelecture,
      });
      session.fin(scoreData.fin);
    } catch (e) {
      U.toast(e.message || 'Erreur', 'err');
    }
  }

  function play(el, ctx, session) {
    const cfg = cfgInit(ctx.cfg);
    const modeHost = h('div');
    const main = h('div');
    el.replaceChildren(modeHost, main);

    void ctx.mols().then(function (raw) {
      const mols = molsJoueur(raw);
      rememberMols(ctx, mols);
      if (!mols.length) {
        el.replaceChildren(U.empty('Pool vide'));
        return;
      }
      ensureColonnes(cfg, mols);
      if (!includedCols(cfg).length) bootstrapColonnes(cfg, mols);

      global.V3Notation.choixMode(modeHost, {
        onPick: function (mode) {
          modeHost.hidden = true;
          let tirage = buildTirage(cfg, mols);
          if (!tirage.lignes.length || !countTrouUnits(tirage)) {
            main.replaceChildren(U.empty('Tirage impossible'));
            return;
          }

          let tentativeId = null;
          let revealed = false;
          const saisies = {};
          const gridHost = h('div');
          const noteHost = h('div');
          const actHost = h('div', { class: 'jp-v2-actions' });
          main.replaceChildren(gridHost, noteHost, actHost);

          function paintAfterReveal() {
            noteHost.replaceChildren();
            actHost.replaceChildren();
            if (mode === 'rapide') {
              global.V3Notation.rapide(noteHost, {
                onScore: function (score) {
                  actHost.replaceChildren();
                  void submitDeclare(session, tentativeId, 'rapide', {
                    fin: { obtenu: score, max: 10, details: [] },
                    rpc: { obtenu: score, max: 10, details: [] },
                  }, saisies, false);
                },
              });
              return;
            }
            const items = notationItems(tirage, saisies);
            if (!items.length) {
              noteHost.replaceChildren(U.empty('Aucune valeur à noter'));
              return;
            }
            let last = null;
            global.V3Notation.detaille(noteHost, items, {
              onChange: function (r) { last = r; },
            });
            function finDetail(relecture) {
              if (!last || last.remplis < items.length) {
                U.toast('Noter chaque valeur', 'err');
                return;
              }
              const sur10 = last.max ? Math.round((last.obtenu / last.max) * 100) / 10 : 0;
              void submitDeclare(session, tentativeId, 'detaille', {
                fin: { obtenu: sur10, max: 10, details: last.notes },
                rpc: { obtenu: last.obtenu, max: last.max, details: last.notes },
              }, saisies, relecture);
            }
            actHost.replaceChildren(
              U.button('Valider', {
                variant: 'primary',
                onClick: function () { finDetail(false); },
              }),
              U.button('Valider + relecture admin', {
                variant: 'ghost',
                onClick: function () { finDetail(true); },
              })
            );
          }

          function paint() {
            gridHost.replaceChildren(renderJpPlayTable(tirage, {
              mode: mode,
              revealed: revealed,
              saisies: saisies,
              onInput: function (key, val) { saisies[key] = val; },
            }));
            if (!revealed) {
              noteHost.replaceChildren();
              actHost.replaceChildren(
                U.button('Révéler', {
                  variant: 'primary',
                  onClick: function () {
                    revealed = true;
                    paint();
                    paintAfterReveal();
                  },
                })
              );
            }
          }

          if (session.reel) {
            session.rpc('jeu_demarrer_declare', {
              p_jeu_id: session.jeu.id,
              p_snapshot: snapshotTirage(tirage),
              p_contexte: 'classique',
            }).then(function (r) {
              tentativeId = r && r.tentative_id;
              paint();
            }).catch(function (e) {
              main.replaceChildren(U.empty(e.message || 'Erreur'));
            });
          } else {
            paint();
          }
        },
      });
    });
  }

  global.V3Games.register('trous', {
    label: 'Tableau à trous',
    tip: 'Tableau à compléter, note Rapide ou Détaillé.',
    pool: true,
    defaults: defaults,
    fromConfig: fromConfig,
    params: params,
    perso: perso,
    essai: essai,
    play: play,
    validate: validate,
    payload: payload,
  });
})(window);

