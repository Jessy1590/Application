(function (global) {
  const U = global.V3UI;
  const C = global.V3Champs;
  const h = U.h;
  const D = global.V3Data;

  let uidN = 0;

  const COLORS = [
    '#0f6b5c', '#c45c26', '#2f5aa8', '#8a3a7a', '#3d7a2a',
    '#a67c00', '#1a6f8a', '#9b2d3a', '#5b4bb0', '#2a7a6a',
  ];

  function uid(prefix) {
    uidN += 1;
    return (prefix || 'x') + '-' + Date.now().toString(36) + '-' + uidN;
  }

  function norm(s) {
    return D && D.norm ? D.norm(s) : String(s || '').trim().toLowerCase();
  }

  function trim(s) {
    return String(s || '').trim();
  }

  function copySel(sel) {
    const s = sel || global.V3Selection.empty();
    const f = s.filtres || {};
    return {
      module_ids: (s.module_ids || []).slice(),
      bloc_ids: (s.bloc_ids || []).slice(),
      matrice_ids: (s.matrice_ids || []).slice(),
      filtres: {
        secteur: (f.secteur || []).slice(),
        classe_ther: (f.classe_ther || []).slice(),
        classe_pharma: (f.classe_pharma || []).slice(),
      },
    };
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

  function side(prefix, raw) {
    return {
      id: (raw && raw.id) || uid(prefix),
      label: (raw && raw.label) || '',
      matrice_id: (raw && raw.matrice_id) || null,
    };
  }

  function ensureCfg(cfg) {
    cfg = cfg || {};
    if (cfg.consigne == null) cfg.consigne = '';
    if (!Array.isArray(cfg.lignes)) cfg.lignes = [];
    return cfg;
  }

  function newLigne() {
    return { id: uid('p'), g: side('g'), d: side('d') };
  }

  function ensureMinLignes(cfg, n) {
    while (cfg.lignes.length < n) cfg.lignes.push(newLigne());
  }

  function compileArrays(cfg) {
    const gauche = [];
    const droite = [];
    const paires = [];
    (cfg.lignes || []).forEach(function (ln) {
      if (!ln || !ln.g || !ln.d) return;
      gauche.push({
        id: ln.g.id,
        label: trim(ln.g.label),
        matrice_id: ln.g.matrice_id || undefined,
      });
      droite.push({
        id: ln.d.id,
        label: trim(ln.d.label),
        matrice_id: ln.d.matrice_id || undefined,
      });
      if (ln.g.id && ln.d.id) {
        paires.push({ gauche_id: ln.g.id, droite_id: ln.d.id });
      }
    });
    return { consigne: trim(cfg.consigne), gauche: gauche, droite: droite, paires: paires };
  }

  function fromArrays(raw) {
    const gauche = Array.isArray(raw.gauche) ? raw.gauche : [];
    const droite = Array.isArray(raw.droite) ? raw.droite : [];
    const paires = Array.isArray(raw.paires) ? raw.paires : [];
    const gBy = {};
    gauche.forEach(function (g) { if (g && g.id) gBy[g.id] = g; });
    const dBy = {};
    droite.forEach(function (d) { if (d && d.id) dBy[d.id] = d; });
    const lignes = [];
    if (paires.length) {
      paires.forEach(function (p) {
        if (!p || !p.gauche_id || !p.droite_id) return;
        lignes.push({
          id: uid('p'),
          g: side('g', gBy[p.gauche_id] || { id: p.gauche_id, label: '' }),
          d: side('d', dBy[p.droite_id] || { id: p.droite_id, label: '' }),
        });
      });
    } else {
      const n = Math.max(gauche.length, droite.length);
      for (let i = 0; i < n; i += 1) {
        lignes.push({
          id: uid('p'),
          g: side('g', gauche[i]),
          d: side('d', droite[i]),
        });
      }
    }
    return lignes;
  }

  function defaults() {
    return ensureCfg({
      consigne: '',
      lignes: [newLigne(), newLigne()],
    });
  }

  function fromConfig(raw) {
    raw = raw || {};
    return ensureCfg({
      consigne: raw.consigne || '',
      lignes: fromArrays(raw),
    });
  }

  function validate(ctx) {
    const cfg = ensureCfg(ctx.cfg);
    const msgs = [];
    if (!trim(cfg.consigne)) msgs.push('Consigne vide');
    const complete = (cfg.lignes || []).filter(function (ln) {
      return ln && trim(ln.g && ln.g.label) && trim(ln.d && ln.d.label);
    });
    if (complete.length < 2) msgs.push('Moins de 2 paires');
    (cfg.lignes || []).forEach(function (ln, i) {
      const gl = trim(ln.g && ln.g.label);
      const dl = trim(ln.d && ln.d.label);
      if ((gl && !dl) || (!gl && dl)) msgs.push('Paire ' + (i + 1) + ' incomplète');
    });
    function dupSide(sideKey) {
      const seen = {};
      (cfg.lignes || []).forEach(function (ln) {
        const lab = trim(ln[sideKey] && ln[sideKey].label);
        if (!lab) return;
        const k = norm(lab);
        if (seen[k]) seen[k] += 1;
        else seen[k] = 1;
      });
      Object.keys(seen).forEach(function (k) {
        if (seen[k] > 1) {
          const sample = (cfg.lignes || []).find(function (ln) {
            return norm(trim(ln[sideKey] && ln[sideKey].label)) === k;
          });
          msgs.push('Doublon : ' + trim(sample && sample[sideKey] && sample[sideKey].label));
        }
      });
    }
    dupSide('g');
    dupSide('d');
    return msgs;
  }

  function payload(ctx) {
    const compiled = compileArrays(ensureCfg(ctx.cfg));
    return { appariement: compiled };
  }

  function params(el, ctx) {
    const cfg = ensureCfg(ctx.cfg);
    const input = h('input', {
      class: 'v3-ctrl',
      value: cfg.consigne,
      placeholder: 'Relier chaque molécule à sa classe',
      'aria-label': 'Consigne',
    });
    input.addEventListener('input', function () {
      cfg.consigne = input.value;
      ctx.changed();
    });
    el.replaceChildren(
      U.field('Consigne', input, {
        tip: 'Affichée en tête de partie.',
      })
    );
  }

  function molBySide(ctx, ln) {
    const cached = ctx._appMols;
    if (ln.g && ln.g.matrice_id && cached) {
      const hit = cached.find(function (m) { return String(m.id) === String(ln.g.matrice_id); });
      if (hit) return hit;
    }
    const lab = norm(trim(ln.g && ln.g.label));
    if (!lab || !cached) return null;
    return cached.find(function (m) { return norm(m.dci) === lab; }) || null;
  }

  function openProposeModal(ctx, onDone) {
    const cfg = ensureCfg(ctx.cfg);
    const host = h('div', { class: 'v3-app-modal-root' });
    const sel = h('select', { class: 'v3-ctrl', 'aria-label': 'Champ' });
    C.list.filter(function (c) { return !c.identite; }).forEach(function (c) {
      sel.appendChild(h('option', { value: c.code }, c.label));
    });
    const listEl = h('div', { class: 'v3-app-propose-list' });
    const errEl = h('p', { class: 'v3-hint', style: { color: 'var(--jp-danger)' } });
    let proposals = [];

    function buildList() {
      const code = sel.value;
      listEl.replaceChildren();
      proposals = [];
      const usedRight = {};
      (cfg.lignes || []).forEach(function (ln) {
        const mol = molBySide(ctx, ln);
        if (!mol) {
          proposals.push({ ln: ln, skip: true, reason: 'Gauche sans molécule reconnue' });
          return;
        }
        const vals = C.valeurs(mol, code);
        if (!vals.length) {
          proposals.push({ ln: ln, skip: true, reason: 'Aucune valeur pour ce champ' });
          return;
        }
        const val = vals[0];
        const key = norm(val);
        const conflict = !!usedRight[key];
        if (!conflict) usedRight[key] = true;
        proposals.push({
          ln: ln,
          val: val,
          checked: !conflict,
          conflict: conflict,
        });
      });
      proposals.forEach(function (p, i) {
        if (p.skip) {
          listEl.appendChild(h('div', { class: 'v3-app-propose-row is-skip' },
            h('span', { class: 'v3-muted' }, (p.ln.g && p.ln.g.label) || '—'),
            h('span', { class: 'v3-muted' }, p.reason)
          ));
          return;
        }
        const box = h('input', { type: 'checkbox', checked: p.checked, disabled: p.conflict });
        box.addEventListener('change', function () { p.checked = box.checked; });
        listEl.appendChild(h('label', { class: 'v3-app-propose-row' + (p.conflict ? ' is-conflict' : '') },
          box,
          h('span', null, (p.ln.g && p.ln.g.label) || '—'),
          h('span', { class: 'v3-muted' }, '→'),
          h('span', null, p.val),
          p.conflict ? h('span', { class: 'v3-app-conflict' }, 'Conflit 1–1') : null
        ));
      });
    }

    sel.addEventListener('change', buildList);

    function close() {
      host.remove();
    }

    host.appendChild(h('div', {
      class: 'v3-modal',
      onClick: function (ev) { if (ev.target === host.firstChild) close(); },
    },
      h('div', { class: 'v3-dialog', role: 'dialog', 'aria-modal': 'true' },
        h('h3', { style: { margin: '0 0 12px', fontSize: '1rem' } }, 'Proposer associations'),
        U.field('Champ', sel, { tip: 'Valeur publiée pour chaque DCI à gauche.' }),
        listEl,
        errEl,
        h('div', { class: 'v3-actions' },
          U.button('Annuler', { variant: 'ghost', onClick: close }),
          U.button('Appliquer', {
            variant: 'primary',
            onClick: function () {
              let n = 0;
              proposals.forEach(function (p) {
                if (p.skip || !p.checked || p.conflict) return;
                p.ln.d.label = p.val;
                n += 1;
              });
              if (!n) {
                errEl.textContent = 'Aucune proposition applicable';
                return;
              }
              ctx.changed();
              close();
              if (onDone) onDone();
            },
          })
        )
      )
    ));
    document.body.appendChild(host);
    buildList();
  }

  function perso(el, ctx) {
    const cfg = ensureCfg(ctx.cfg);
    ensureMinLignes(cfg, 2);

    const countEl = h('p', { class: 'v3-muted v3-app-count' });
    const tbody = h('tbody');
    const importHost = h('div', { class: 'v3-app-import', hidden: true });
    let importSide = null;
    let selApi = null;

    function completeCount() {
      return (cfg.lignes || []).filter(function (ln) {
        return trim(ln.g && ln.g.label) && trim(ln.d && ln.d.label);
      }).length;
    }

    function refreshCount() {
      countEl.textContent = completeCount() + ' paire' + (completeCount() > 1 ? 's' : '');
    }

    function paintRows(focus) {
      tbody.replaceChildren();
      (cfg.lignes || []).forEach(function (ln, i) {
        const gIn = h('input', {
          class: 'v3-ctrl',
          value: ln.g.label,
          'aria-label': 'Gauche ligne ' + (i + 1),
        });
        const dIn = h('input', {
          class: 'v3-ctrl',
          value: ln.d.label,
          'aria-label': 'Droite ligne ' + (i + 1),
        });
        gIn.addEventListener('input', function () {
          ln.g.label = gIn.value;
          refreshCount();
          ctx.changed();
        });
        dIn.addEventListener('input', function () {
          ln.d.label = dIn.value;
          refreshCount();
          ctx.changed();
        });
        dIn.addEventListener('keydown', function (ev) {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          if (i === cfg.lignes.length - 1) {
            cfg.lignes.push(newLigne());
            paintRows('g-' + (cfg.lignes.length - 1));
          } else {
            paintRows('g-' + (i + 1));
          }
          ctx.changed();
        });

        const acts = h('div', { class: 'v3-row-act' },
          U.button('↑', {
            variant: 'ghost',
            disabled: i === 0,
            onClick: function () {
              if (i === 0) return;
              const t = cfg.lignes[i - 1];
              cfg.lignes[i - 1] = cfg.lignes[i];
              cfg.lignes[i] = t;
              paintRows();
              ctx.changed();
            },
          }),
          U.button('↓', {
            variant: 'ghost',
            disabled: i >= cfg.lignes.length - 1,
            onClick: function () {
              if (i >= cfg.lignes.length - 1) return;
              const t = cfg.lignes[i + 1];
              cfg.lignes[i + 1] = cfg.lignes[i];
              cfg.lignes[i] = t;
              paintRows();
              ctx.changed();
            },
          }),
          U.button('×', {
            variant: 'ghost',
            onClick: function () {
              cfg.lignes.splice(i, 1);
              if (cfg.lignes.length < 1) cfg.lignes.push(newLigne());
              paintRows();
              refreshCount();
              ctx.changed();
            },
          })
        );

        const tr = h('tr', { dataset: { idx: String(i) } },
          h('td', null, gIn),
          h('td', null, dIn),
          h('td', null, acts)
        );
        tbody.appendChild(tr);
      });
      refreshCount();
      if (focus && typeof focus === 'string') {
        const idx = focus.startsWith('g-') ? Number(focus.slice(2)) : -1;
        if (idx >= 0) {
          const row = tbody.querySelector('[data-idx="' + idx + '"]');
          const inp = row && row.querySelector('td input');
          if (inp) inp.focus();
        }
      }
    }

    function closeImport() {
      importHost.hidden = true;
      importHost.replaceChildren();
      if (selApi) { selApi.destroy(); selApi = null; }
      importSide = null;
    }

    function openImport(side) {
      closeImport();
      importSide = side;
      importHost.hidden = false;
      const pre = global.V3Selection.isEmpty(ctx.meta.selection)
        ? global.V3Selection.empty()
        : copySel(ctx.meta.selection);
      const mount = h('div');
      importHost.appendChild(h('p', { class: 'v3-muted' },
        side === 'g' ? 'Import colonne gauche (DCI)' : 'Import colonne droite (DCI)'
      ));
      importHost.appendChild(mount);
      importHost.appendChild(h('div', { class: 'v3-actions' },
        U.button('Fermer', { variant: 'ghost', onClick: closeImport }),
        U.button('Ajouter', {
          variant: 'primary',
          onClick: function () {
            const sel = selApi ? selApi.get() : pre;
            void global.V3Selection.resolve(sel).then(function (mols) {
              if (!mols.length) {
                U.toast('Aucune molécule', 'err');
                return;
              }
              const sideKey = importSide === 'g' ? 'g' : 'd';
              mols.forEach(function (m) {
                const lab = m.dci || '—';
                let slot = (cfg.lignes || []).find(function (ln) {
                  return !trim(ln[sideKey] && ln[sideKey].label);
                });
                if (!slot) {
                  slot = newLigne();
                  cfg.lignes.push(slot);
                }
                slot[sideKey].label = lab;
                slot[sideKey].matrice_id = m.id;
              });
              paintRows();
              ctx.changed();
              closeImport();
            }).catch(function (e) {
              U.toast(e.message || 'Erreur', 'err');
            });
          },
        })
      ));
      selApi = global.V3Selection.mount(mount, {
        value: pre,
        onChange: function () {},
        compact: true,
      });
    }

    void ctx.mols().then(function (mols) {
      ctx._appMols = mols;
    });

    const table = h('div', { class: 'v3-table-wrap' },
      h('table', { class: 'v3-table v3-app-table' },
        h('thead', null,
          h('tr', null,
            h('th', null,
              h('div', { class: 'v3-app-col-head' },
                h('span', null, 'Gauche'),
                U.button('Importer', { variant: 'ghost', onClick: function () { openImport('g'); } })
              )
            ),
            h('th', null,
              h('div', { class: 'v3-app-col-head' },
                h('span', null, 'Droite'),
                U.button('Importer', { variant: 'ghost', onClick: function () { openImport('d'); } })
              )
            ),
            h('th', { class: 'v3-app-act-col' }, ' ')
          )
        ),
        tbody
      )
    );

    el.replaceChildren(
      h('div', { class: 'v3-stack v3-app-perso' },
        h('div', { class: 'v3-app-toolbar' },
          countEl,
          h('div', { class: 'v3-app-toolbar-act' },
            U.button('+ Paire', {
              variant: 'ghost',
              onClick: function () {
                cfg.lignes.push(newLigne());
                paintRows('g-' + (cfg.lignes.length - 1));
                ctx.changed();
              },
            }),
            U.button('Proposer associations', {
              variant: 'ghost',
              onClick: function () {
                void ctx.mols().then(function (mols) {
                  ctx._appMols = mols;
                  openProposeModal(ctx, function () { paintRows(); });
                });
              },
            })
          )
        ),
        importHost,
        table
      )
    );
    paintRows();
  }

  function correctMap(paires) {
    const m = {};
    (paires || []).forEach(function (p) {
      if (p && p.gauche_id && p.droite_id) m[p.gauche_id] = p.droite_id;
    });
    return m;
  }

  function play(el, ctx, session) {
    el.replaceChildren(U.empty('Chargement…'));

    function run(data) {
      const consigne = data.consigne || 'Reliez chaque élément de gauche à celui de droite';
      const gauche = (data.gauche || []).filter(function (g) { return g && trim(g.label); });
      const droite = (data.droite || []).filter(function (d) { return d && trim(d.label); });
      const correct = correctMap(data.paires);
      if (gauche.length < 2 || droite.length < 2) {
        el.replaceChildren(U.empty('Configuration incomplète'));
        return;
      }

      const links = {};
      let selectedG = null;
      let phase = 'play';
      let reviewDetails = null;
      const orderG = shuffle(gauche);
      const orderD = shuffle(droite);
      const pairColorIndex = {};
      let nextColor = 0;

      let boardEl = null;
      let svgEl = null;
      let resizeObs = null;
      let onWinResize = null;
      let onWinScroll = null;

      function colorFor(gid) {
        if (pairColorIndex[gid] == null) {
          pairColorIndex[gid] = nextColor % COLORS.length;
          nextColor += 1;
        }
        return COLORS[pairColorIndex[gid]];
      }

      function detachDraw() {
        if (resizeObs) { resizeObs.disconnect(); resizeObs = null; }
        if (onWinResize) { window.removeEventListener('resize', onWinResize); onWinResize = null; }
        if (onWinScroll) { window.removeEventListener('scroll', onWinScroll, true); onWinScroll = null; }
      }

      function drawLinks(review) {
        if (!boardEl || !svgEl) return;
        const rect = boardEl.getBoundingClientRect();
        const w = Math.max(1, Math.round(rect.width));
        const ht = Math.max(1, Math.round(rect.height));
        svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + ht);
        svgEl.setAttribute('width', String(w));
        svgEl.setAttribute('height', String(ht));
        const ns = 'http://www.w3.org/2000/svg';
        svgEl.replaceChildren();
        Object.keys(links).forEach(function (gid) {
          const did = links[gid];
          const gHandle = boardEl.querySelector('[data-g-handle="' + gid + '"]');
          const dHandle = boardEl.querySelector('[data-d-handle="' + did + '"]');
          if (!gHandle || !dHandle) return;
          const gr = gHandle.getBoundingClientRect();
          const dr = dHandle.getBoundingClientRect();
          const x1 = gr.left + gr.width / 2 - rect.left;
          const y1 = gr.top + gr.height / 2 - rect.top;
          const x2 = dr.left + dr.width / 2 - rect.left;
          const y2 = dr.top + dr.height / 2 - rect.top;
          const dx = Math.abs(x2 - x1);
          const cx1 = x1 + Math.max(24, dx * 0.35);
          const cx2 = x2 - Math.max(24, dx * 0.35);
          let stroke = colorFor(gid);
          if (review) {
            stroke = correct[gid] === did ? 'var(--jp-ok)' : 'var(--jp-danger)';
          }
          const path = document.createElementNS(ns, 'path');
          path.setAttribute('d', 'M ' + x1.toFixed(1) + ' ' + y1.toFixed(1)
            + ' C ' + cx1.toFixed(1) + ' ' + y1.toFixed(1)
            + ', ' + cx2.toFixed(1) + ' ' + y2.toFixed(1)
            + ', ' + x2.toFixed(1) + ' ' + y2.toFixed(1));
          path.setAttribute('fill', 'none');
          path.setAttribute('stroke', stroke);
          path.setAttribute('stroke-width', '2.5');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('opacity', '0.9');
          svgEl.appendChild(path);
        });
      }

      function attachDraw() {
        detachDraw();
        if (!boardEl) return;
        onWinResize = function () { drawLinks(phase === 'review'); };
        onWinScroll = onWinResize;
        window.addEventListener('resize', onWinResize);
        window.addEventListener('scroll', onWinScroll, true);
        if (typeof ResizeObserver !== 'undefined') {
          resizeObs = new ResizeObserver(onWinResize);
          resizeObs.observe(boardEl);
        }
        requestAnimationFrame(onWinResize);
      }

      function labelD(id) {
        const d = droite.find(function (x) { return x.id === id; });
        return d ? d.label : '—';
      }

      function allLinked() {
        return orderG.every(function (g) { return !!links[g.id]; });
      }

      function paint() {
        detachDraw();
        const host = h('div', { class: 'v3-play v3-app-play' });
        host.appendChild(h('p', { class: 'v3-muted v3-app-consigne' }, consigne));

        if (phase === 'review' && reviewDetails) {
          host.appendChild(h('ul', { class: 'v3-app-recap' },
            reviewDetails.map(function (d) {
              return h('li', { class: d.ok ? 'is-ok' : 'is-bad' },
                h('strong', null, d.label),
                h('span', { class: 'v3-muted' }, ' · ' + d.choix),
                d.ok ? null : h('small', { class: 'v3-app-expect' }, 'Correct : ' + d.expect)
              );
            })
          ));
        }

        const usedRight = {};
        Object.keys(links).forEach(function (gid) { usedRight[links[gid]] = true; });

        boardEl = h('div', { class: 'v3-app-board', id: 'v3AppBoard' });
        svgEl = h('svg', { class: 'v3-app-svg', 'aria-hidden': 'true' });
        const colG = h('div', { class: 'v3-app-col v3-app-col-g', role: 'group', 'aria-label': 'Gauche' });
        const colD = h('div', { class: 'v3-app-col v3-app-col-d', role: 'group', 'aria-label': 'Droite' });

        orderG.forEach(function (g) {
          const linked = links[g.id];
          const cls = ['v3-app-card', 'v3-app-card-g'];
          if (selectedG === g.id) cls.push('is-selected');
          if (linked) cls.push('is-linked');
          if (phase === 'review' && linked) {
            cls.push(correct[g.id] === linked ? 'is-ok' : 'is-bad');
          }
          const btn = h('button', {
            type: 'button',
            class: cls.join(' '),
            dataset: { g: g.id },
            style: linked && phase !== 'review' ? { '--v3-app-pair': colorFor(g.id) } : null,
            disabled: phase === 'review',
            onClick: function () {
              if (phase === 'review') return;
              if (links[g.id]) {
                delete links[g.id];
                selectedG = null;
                paint();
                return;
              }
              selectedG = selectedG === g.id ? null : g.id;
              paint();
            },
            onKeydown: function (ev) {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                btn.click();
              }
            },
          },
            h('span', { class: 'v3-app-card-body' }, h('strong', null, g.label)),
            h('span', { class: 'v3-app-handle', dataset: { gHandle: g.id }, ariaHidden: 'true' })
          );
          colG.appendChild(btn);
        });

        orderD.forEach(function (d) {
          const used = !!usedRight[d.id];
          const gidFor = Object.keys(links).find(function (g) { return links[g] === d.id; });
          const cls = ['v3-app-card', 'v3-app-card-d'];
          if (used) cls.push('is-used', 'is-linked');
          if (phase === 'review' && gidFor) {
            cls.push(correct[gidFor] === d.id ? 'is-ok' : 'is-bad');
          }
          const btn = h('button', {
            type: 'button',
            class: cls.join(' '),
            dataset: { d: d.id },
            style: gidFor && phase !== 'review' ? { '--v3-app-pair': colorFor(gidFor) } : null,
            disabled: phase === 'review',
            onClick: function () {
              if (phase === 'review') return;
              if (!selectedG) {
                U.toast('Choisissez d’abord à gauche', 'err');
                return;
              }
              Object.keys(links).forEach(function (g) {
                if (links[g] === d.id) delete links[g];
              });
              links[selectedG] = d.id;
              selectedG = null;
              paint();
            },
            onKeydown: function (ev) {
              if (ev.key === 'Enter' || ev.key === ' ') {
                ev.preventDefault();
                btn.click();
              }
            },
          },
            h('span', { class: 'v3-app-handle', dataset: { dHandle: d.id }, ariaHidden: 'true' }),
            h('span', { class: 'v3-app-card-body' }, d.label),
            phase === 'review' && gidFor && correct[gidFor] !== d.id
              ? h('small', { class: 'v3-app-expect' }, labelD(correct[gidFor]))
              : null
          );
          colD.appendChild(btn);
        });

        boardEl.append(svgEl, colG, colD);
        host.appendChild(boardEl);

        const actions = h('div', { class: 'v3-actions' });
        if (phase === 'play') {
          actions.appendChild(U.button('Réinitialiser', {
            variant: 'ghost',
            onClick: function () {
              Object.keys(links).forEach(function (k) { delete links[k]; });
              selectedG = null;
              paint();
            },
          }));
          actions.appendChild(U.button('Valider', {
            variant: 'primary',
            disabled: !allLinked(),
            onClick: function () {
              if (!allLinked()) return;
              void submit();
            },
          }));
        }
        host.appendChild(actions);
        el.replaceChildren(host);
        attachDraw();
      }

      async function submit() {
        const pPaires = {};
        Object.keys(links).forEach(function (gid) { pPaires[gid] = links[gid]; });
        if (!session.reel) {
          let obtenu = 0;
          reviewDetails = orderG.map(function (g) {
            const good = links[g.id] === correct[g.id];
            if (good) obtenu += 1;
            return {
              label: g.label,
              ok: good,
              choix: labelD(links[g.id]),
              expect: labelD(correct[g.id]),
            };
          });
          phase = 'review';
          paint();
          session.fin({ obtenu: obtenu, max: orderG.length, details: reviewDetails });
          return;
        }
        try {
          const res = await session.rpc('jeu_soumettre_appariement', {
            p_tentative_id: data.tentativeId,
            p_paires: pPaires,
          });
          reviewDetails = orderG.map(function (g) {
            const good = links[g.id] === correct[g.id];
            return {
              label: g.label,
              ok: good,
              choix: labelD(links[g.id]),
              expect: labelD(correct[g.id]),
            };
          });
          phase = 'review';
          paint();
          session.fin({
            obtenu: Number(res.score_obtenu),
            max: Number(res.score_max),
            details: res.details || reviewDetails,
          });
        } catch (e) {
          U.toast(e.message || 'Erreur', 'err');
        }
      }

      paint();
    }

    if (!session.reel) {
      const compiled = compileArrays(ensureCfg(ctx.cfg));
      run({
        consigne: compiled.consigne,
        gauche: compiled.gauche,
        droite: compiled.droite,
        paires: compiled.paires,
        tentativeId: null,
      });
      return;
    }

    session.rpc('jeu_demarrer_appariement', {
      p_jeu_id: session.jeu.id,
      p_contexte: 'classique',
    }).then(function (start) {
      const snap = start.snapshot || {};
      run({
        consigne: snap.consigne,
        gauche: snap.gauche || [],
        droite: snap.droite || [],
        paires: snap.paires || [],
        tentativeId: start.tentative_id,
      });
    }).catch(function (e) {
      el.replaceChildren(U.empty(e.message || 'Erreur'));
    });
  }

  global.V3Games.register('appariement', {
    label: 'Appariement',
    tip: 'Paires 1–1. 1 paire = 1 point.',
    pool: false,
    defaults: defaults,
    fromConfig: fromConfig,
    params: params,
    perso: perso,
    play: play,
    validate: validate,
    payload: payload,
  });
})(window);
