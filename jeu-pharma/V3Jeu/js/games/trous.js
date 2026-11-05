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
    const pool = mols.slice();
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
    return mol.dci || '—';
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
          const playHole = opts.play && isHole && !opts.revealed;
          const playInput = opts.play && isHole && opts.revealed === false && opts.mode === 'detaille';

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
      void p.then(function (m) { if (ctx._trousMolsP === p) rememberMols(ctx, m); });
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

    void ctx.mols().then(function (mols) {
      rememberMols(ctx, mols);
      if (!mols.length) {
        root.replaceChildren(U.empty('Pool vide'));
        return;
      }
      ensureColonnes(cfg, mols);
      if (!includedCols(cfg).length) bootstrapColonnes(cfg, mols);

      const colsHost = h('div', { class: 'v3-trous-cols' });
      const lignesExtra = h('div', { class: 'v3-trous-lignes-extra' });
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

      function paintCols() {
        colsHost.replaceChildren();
        const sorted = cfg.colonnes.slice().sort(function (a, b) { return a.ordre - b.ordre; });
        sorted.forEach(function (col) {
          const meta = C.list.find(function (x) { return x.code === col.champ_code; });
          if (!meta) return;
          const cb = h('input', { type: 'checkbox', checked: !!col.included });
          cb.addEventListener('change', function () {
            col.included = cb.checked;
            ctx.changed();
            paintCols();
            paintLignesExtra();
          });
          const roleHost = h('div', { class: 'v3-trous-role', hidden: !col.included || cfg.composition !== 'auto' || meta.identite });
          if (col.included && cfg.composition === 'auto' && !meta.identite) {
            roleHost.hidden = false;
            roleHost.replaceChildren(U.segmented([
              { value: 'visible', label: 'Visible' },
              { value: 'trouable', label: 'Trouable' },
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
            paintCols();
            ctx.changed();
          }
          colsHost.appendChild(h('div', { class: 'v3-trous-col-row' },
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

      function paintLignesExtra() {
        lignesExtra.replaceChildren();
        if (cfg.lignes_mode === 'aleatoire') {
          lignesExtra.appendChild(U.field('Nb lignes', U.number(cfg.nb_lignes, {
            min: 1, max: 50, step: 1,
            onChange: function (v) { cfg.nb_lignes = v; ctx.changed(); },
          })));
        } else if (cfg.lignes_mode === 'manuel') {
          const sel = {};
          (cfg.lignes_manuelles || []).forEach(function (id) { sel[id] = true; });
          const chips = h('div', { class: 'v3-trous-mol-pick' });
          mols.forEach(function (mol) {
            const on = !!sel[mol.id];
            chips.appendChild(h('button', {
              type: 'button',
              class: 'v3-chip v3-chip-molecule' + (on ? ' is-on' : ''),
              'aria-pressed': on ? 'true' : 'false',
              onClick: function () {
                if (sel[mol.id]) {
                  delete sel[mol.id];
                  cfg.lignes_manuelles = cfg.lignes_manuelles.filter(function (x) { return x !== mol.id; });
                } else {
                  sel[mol.id] = true;
                  cfg.lignes_manuelles.push(mol.id);
                }
                ctx.changed();
                paintLignesExtra();
              },
            }, molLabel(mol)));
          });
          lignesExtra.appendChild(U.field('Molécules', chips, { col: true }));
        }
      }

      const compSeg = U.segmented([
        { value: 'auto', label: 'Auto', tip: 'Trous tirés à chaque partie.' },
        { value: 'grille', label: 'Grille', tip: 'Vous choisissez chaque case.' },
      ], cfg.composition, function (v) {
        cfg.composition = v;
        tauxWrap.hidden = v !== 'auto';
        paintCols();
        ctx.changed();
      });

      const lignesSeg = U.segmented([
        { value: 'aleatoire', label: 'Aléatoire' },
        { value: 'groupe', label: 'Groupe' },
        { value: 'manuel', label: 'Manuel' },
      ], cfg.lignes_mode, function (v) {
        cfg.lignes_mode = v;
        if (v === 'manuel' && !(cfg.lignes_manuelles || []).length) {
          cfg.lignes_manuelles = mols.slice(0, Math.min(5, mols.length)).map(function (m) { return m.id; });
        }
        paintLignesExtra();
        ctx.changed();
      });

      root.replaceChildren(
        U.section('Paramètres',
          U.field('Composition', compSeg, { col: true }),
          U.field('Colonnes', colsHost, { col: true, tip: 'Ordre d’affichage du tableau.' }),
          U.field('Lignes', lignesSeg, { col: true }),
          lignesExtra,
          U.field('Cases vides', tauxWrap, { tip: 'Auto uniquement.', col: true })
        )
      );
      paintCols();
      paintLignesExtra();
    });
  }

  function perso(el, ctx) {
    const cfg = cfgInit(ctx.cfg);
    el.replaceChildren(U.empty('Chargement…'));
    void ctx.mols().then(function (mols) {
      rememberMols(ctx, mols);
      if (!mols.length) {
        el.replaceChildren(U.empty('Pool vide'));
        return;
      }
      ensureColonnes(cfg, mols);
      if (cfg.composition === 'grille') syncGrilleLignes(cfg, mols);

      let tirage = buildTirage(cfg, mols);
      const countEl = h('p', { class: 'v3-trous-count' });
      const tableHost = h('div');
      const actions = h('div', { class: 'v3-actions' });

      function refreshCount() {
        countEl.textContent = countTrouUnits(tirage) + ' valeurs à trouver';
      }

      function paint() {
        tableHost.replaceChildren();
        if (cfg.composition === 'grille') {
          tableHost.appendChild(renderTable({
            tirage: tirage,
            persoGrille: true,
            onCellClick: function (molId, code) {
              const hole = !isTrouGrille(cfg, molId, code);
              setTrouGrille(cfg, molId, code, hole);
              tirage = buildTirage(cfg, mols);
              refreshCount();
              paint();
              ctx.changed();
            },
            colActions: {
              all: function (code) {
                tirage.lignes.forEach(function (mol) {
                  if (valsMol(mol, code).length) setTrouGrille(cfg, mol.id, code, true);
                });
                tirage = buildTirage(cfg, mols);
                refreshCount();
                paint();
                ctx.changed();
              },
              clear: function (code) {
                tirage.lignes.forEach(function (mol) {
                  setTrouGrille(cfg, mol.id, code, false);
                });
                tirage = buildTirage(cfg, mols);
                refreshCount();
                paint();
                ctx.changed();
              },
            },
          }));
        } else {
          tirage = buildTirage(cfg, mols);
          tableHost.appendChild(renderTable({ tirage: tirage }));
          refreshCount();
        }
      }

      if (cfg.composition === 'auto') {
        actions.appendChild(U.button('Nouveau tirage', {
          variant: 'ghost',
          onClick: function () {
            tirage = buildTirage(cfg, mols);
            refreshCount();
            paint();
          },
        }));
      }

      refreshCount();
      paint();
      el.replaceChildren(
        h('div', { class: 'v3-stack v3-trous-perso' },
          countEl,
          tableHost,
          actions
        )
      );
    });
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
      session.fin(scoreData.fin);
      return;
    }
    await session.rpc('jeu_soumettre_declare', {
      p_tentative_id: tentativeId,
      p_reponses: { mode: mode, saisies: saisies || {} },
      p_score_provisoire: scoreData.rpc.obtenu,
      p_score_max: scoreData.rpc.max,
      p_details: scoreData.rpc.details || [],
      p_demander_relecture: !!demanderRelecture,
    });
    session.fin(scoreData.fin);
  }

  function demarrerPartie(session, tirage) {
    if (!session.reel) return Promise.resolve(null);
    return session.rpc('jeu_demarrer_declare', {
      p_jeu_id: session.jeu.id,
      p_snapshot: snapshotTirage(tirage),
      p_contexte: 'classique',
    }).then(function (r) { return r.tentative_id; });
  }

  function play(el, ctx, session) {
    const cfg = cfgInit(ctx.cfg);
    el.replaceChildren();
    const modeHost = h('div');
    const main = h('div');
    el.append(modeHost, main);

    void ctx.mols().then(function (mols) {
      rememberMols(ctx, mols);
      if (!mols.length) {
        el.replaceChildren(U.empty('Pool vide'));
        return;
      }
      ensureColonnes(cfg, mols);

      global.V3Notation.choixMode(modeHost, {
        forceDetaille: false,
        onPick: function (mode) {
          modeHost.hidden = true;
          let tirage = buildTirage(cfg, mols);
          if (!tirage.lignes.length || !countTrouUnits(tirage)) {
            main.replaceChildren(U.empty('Tirage impossible'));
            return;
          }

          main.replaceChildren(U.empty('Chargement…'));
          void demarrerPartie(session, tirage).then(function (tentativeId) {
            let revealed = false;
            const saisies = {};
            let noteDetail = null;
            const noteHost = h('div');
            const actHost = h('div', { class: 'v3-actions' });
            main.replaceChildren(noteHost, actHost);

            function paintPlay() {
              noteHost.replaceChildren(renderTable({
                tirage: tirage,
                play: true,
                mode: mode,
                revealed: revealed,
                onInput: function (key, val) { saisies[key] = val; },
              }));
              actHost.replaceChildren();
              if (mode === 'rapide') {
                if (!revealed) {
                  actHost.appendChild(U.button('Révéler', {
                    variant: 'primary',
                    onClick: function () {
                      revealed = true;
                      paintPlay();
                      global.V3Notation.rapide(actHost, {
                        onScore: function (score) {
                          actHost.replaceChildren();
                          const fin = { obtenu: score, max: 10, details: [] };
                          void submitDeclare(session, tentativeId, 'rapide', {
                            fin: fin,
                            rpc: { obtenu: score, max: 10, details: [] },
                          }, saisies, false);
                        },
                      });
                    },
                  }));
                }
              } else if (!noteDetail) {
                actHost.appendChild(U.button('Valider', {
                  variant: 'primary',
                  onClick: function () {
                    const items = notationItems(tirage, saisies);
                    if (!items.length) return;
                    noteDetail = h('div', { class: 'v3-trous-note-panel' });
                    noteHost.appendChild(noteDetail);
                    global.V3Notation.detaille(noteDetail, items, {
                      onChange: function (r) { noteDetail._last = r; },
                    });
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
                  },
                }));
              }
            }

            function finDetail(relecture) {
              const last = noteDetail && noteDetail._last;
              const items = notationItems(tirage, saisies);
              if (!last || last.remplis < items.length) {
                U.toast('Noter chaque valeur', 'err');
                return;
              }
              const sum = last.obtenu;
              const nb = last.max;
              const sur10 = nb ? Math.round((sum / nb) * 100) / 10 : 0;
              void submitDeclare(session, tentativeId, 'detaille', {
                fin: { obtenu: sur10, max: 10, details: last.notes },
                rpc: { obtenu: sum, max: nb, details: last.notes },
              }, saisies, relecture);
            }

            paintPlay();
          }).catch(function (e) {
            U.toast(e.message || 'Erreur', 'err');
            main.replaceChildren(U.empty(e.message || 'Erreur'));
          });
        },
      });
    });
  }

  global.V3Games.register('trous', {
    label: 'Trous',
    tip: 'Tableau à trous, note Rapide ou Détaillé.',
    pool: true,
    defaults: defaults,
    fromConfig: fromConfig,
    params: params,
    perso: perso,
    play: play,
    validate: validate,
    payload: payload,
  });
})();

