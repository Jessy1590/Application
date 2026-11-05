(function (global) {
  const U = global.V3UI;
  const C = global.V3Champs;
  const h = U.h;

  let idSeq = 0;
  let playSkipClick = false;
  function uid(prefix) {
    idSeq += 1;
    return prefix + '-' + Date.now().toString(36) + '-' + idSeq;
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

  function cfgInit(cfg) {
    cfg = cfg || {};
    if (!Array.isArray(cfg.zones)) cfg.zones = [];
    if (cfg.consigne == null) cfg.consigne = '';
    cfg.zones.forEach(function (z) {
      if (!z.id) z.id = uid('z');
      if (!Array.isArray(z.items)) z.items = [];
      z.items.forEach(function (it) {
        if (!it.id) it.id = uid('i');
        if (it.label == null) it.label = '';
      });
    });
    return cfg;
  }

  function allItems(cfg) {
    const out = [];
    (cfg.zones || []).forEach(function (z) {
      (z.items || []).forEach(function (it) { out.push(it); });
    });
    return out;
  }

  function findItemZone(cfg, itemId) {
    for (let i = 0; i < (cfg.zones || []).length; i += 1) {
      const z = cfg.zones[i];
      if ((z.items || []).some(function (it) { return it.id === itemId; })) return z;
    }
    return null;
  }

  function moveItem(cfg, itemId, toZoneId) {
    let item = null;
    (cfg.zones || []).forEach(function (z) {
      z.items = (z.items || []).filter(function (it) {
        if (it.id === itemId) { item = it; return false; }
        return true;
      });
    });
    if (!item) return;
    const dest = (cfg.zones || []).find(function (z) { return z.id === toZoneId; });
    if (dest) dest.items.push(item);
  }

  function addItem(cfg, zoneId, label) {
    const z = (cfg.zones || []).find(function (x) { return x.id === zoneId; });
    if (!z) return;
    const lab = String(label || '').trim();
    if (!lab) return;
    z.items.push({ id: uid('i'), label: lab });
  }

  function snapFromCfg(cfg) {
    const c = cfgInit(JSON.parse(JSON.stringify(cfg)));
    const items = allItems(c);
    const zones = (c.zones || []).map(function (z) {
      return {
        id: z.id,
        label: z.label || '',
        item_ids: (z.items || []).map(function (it) { return it.id; }),
      };
    });
    return { consigne: c.consigne || '', items: items, zones: zones };
  }

  function snapToPlay(snap) {
    const itemsById = {};
    (snap.items || []).forEach(function (it) {
      itemsById[it.id] = { id: it.id, label: it.label || '' };
    });
    const correct = {};
    const zones = (snap.zones || []).map(function (z) {
      const ids = z.item_ids || [];
      ids.forEach(function (id) { correct[id] = z.id; });
      return {
        id: z.id,
        label: z.label || '',
        item_ids: ids.slice(),
      };
    });
    const items = (snap.items || []).map(function (it) {
      return itemsById[it.id] || { id: it.id, label: it.label || '' };
    });
    return { consigne: snap.consigne || '', items: items, zones: zones, correct: correct };
  }

  function defaults() {
    return cfgInit({
      consigne: '',
      zones: [
        { id: uid('z'), label: 'Zone 1', items: [] },
        { id: uid('z'), label: 'Zone 2', items: [] },
      ],
    });
  }

  function fromConfig(raw) {
    raw = raw || {};
    const itemsById = {};
    (raw.items || []).forEach(function (it) {
      itemsById[it.id] = { id: it.id, label: it.label || '' };
    });
    const zones = (raw.zones || []).map(function (z) {
      const items = (z.item_ids || []).map(function (id) {
        return itemsById[id] ? Object.assign({}, itemsById[id]) : { id: id, label: id };
      });
      return { id: z.id, label: z.label || '', items: items };
    });
    if (!zones.length) {
      return defaults();
    }
    return cfgInit({ consigne: raw.consigne || '', zones: zones });
  }

  function validate(ctx) {
    const cfg = cfgInit(ctx.cfg || {});
    const msgs = [];
    const zones = cfg.zones || [];
    const items = allItems(cfg);
    if (zones.length < 2) msgs.push('Moins de 2 zones');
    if (!items.length) msgs.push('Aucun item');
    if (!(cfg.consigne || '').trim()) msgs.push('Consigne vide');
    zones.forEach(function (z) {
      if (!(z.items || []).length) msgs.push('Zone vide : ' + (z.label || '—'));
    });
    return msgs;
  }

  function payload(ctx) {
    const snap = snapFromCfg(ctx.cfg || {});
    return {
      classement: {
        consigne: snap.consigne,
        items: snap.items.map(function (it) { return { id: it.id, label: it.label }; }),
        zones: snap.zones,
      },
    };
  }

  function attachPointerDnD(itemEl, getItemId, onDropZone) {
    let dragId = null;
    let ghost = null;
    let startX = 0;
    let startY = 0;
    let moved = false;

    function cleanup() {
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      dragId = null;
      moved = false;
      document.body.classList.remove('v3-cls-dragging');
    }

    itemEl.addEventListener('pointerdown', function (ev) {
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      dragId = getItemId();
      startX = ev.clientX;
      startY = ev.clientY;
      moved = false;
      itemEl.setPointerCapture(ev.pointerId);
    });

    itemEl.addEventListener('pointermove', function (ev) {
      if (!dragId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 6) return;
      moved = true;
      if (!ghost) {
        ghost = itemEl.cloneNode(true);
        ghost.classList.add('v3-cls-ghost');
        document.body.appendChild(ghost);
        document.body.classList.add('v3-cls-dragging');
        itemEl.classList.add('is-dragging');
      }
      ghost.style.left = ev.clientX + 'px';
      ghost.style.top = ev.clientY + 'px';
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      document.querySelectorAll('.v3-cls-zone.is-drop-target').forEach(function (n) {
        n.classList.remove('is-drop-target');
      });
      const zone = el && el.closest('.v3-cls-zone');
      if (zone) zone.classList.add('is-drop-target');
    });

    function finish(ev) {
      if (!dragId) return;
      itemEl.releasePointerCapture(ev.pointerId);
      itemEl.classList.remove('is-dragging');
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      document.querySelectorAll('.v3-cls-zone.is-drop-target').forEach(function (n) {
        n.classList.remove('is-drop-target');
      });
      if (moved) {
        playSkipClick = true;
        setTimeout(function () { playSkipClick = false; }, 0);
        const zone = el && el.closest('.v3-cls-zone');
        if (zone) onDropZone(dragId, zone.getAttribute('data-zone-id'));
      }
      cleanup();
    }

    itemEl.addEventListener('pointerup', finish);
    itemEl.addEventListener('pointercancel', finish);
  }

  function params(el, ctx) {
    if (el.dataset.v3ClsParams) return;
    el.dataset.v3ClsParams = '1';
    const cfg = cfgInit(ctx.cfg);
    const input = h('input', {
      class: 'v3-ctrl',
      value: cfg.consigne || '',
      placeholder: 'Classer par classe thérapeutique',
      'aria-label': 'Consigne',
    });
    input.addEventListener('input', function () {
      cfg.consigne = input.value;
      ctx.changed();
    });
    el.replaceChildren(
      U.field('Consigne', input, { tip: 'Affichée au joueur.' })
    );
  }

  function perso(el, ctx) {
    const cfg = cfgInit(ctx.cfg);
    const countEl = h('p', { class: 'v3-cls-count v3-muted' });
    const grid = h('div', { class: 'v3-cls-edit-grid' });
    const toolbar = h('div', { class: 'v3-actions' });
    let importHost = null;
    let selApi = null;

    function paintCount() {
      const n = allItems(cfg).length;
      const m = (cfg.zones || []).length;
      countEl.textContent = n + ' items · ' + m + ' zones';
    }

    function closeImport() {
      if (selApi) { selApi.destroy(); selApi = null; }
      if (importHost) importHost.hidden = true;
    }

    function paintGrid() {
      grid.replaceChildren();
      (cfg.zones || []).forEach(function (z) {
        const title = h('input', {
          class: 'v3-ctrl v3-cls-zone-title',
          value: z.label || '',
          'aria-label': 'Libellé zone',
        });
        title.addEventListener('input', function () {
          z.label = title.value;
          ctx.changed();
          paintCount();
        });

        const list = h('div', { class: 'v3-cls-zone-items' });
        (z.items || []).forEach(function (it) {
          const lab = h('input', {
            class: 'v3-ctrl v3-cls-item-in',
            value: it.label || '',
            'aria-label': 'Item',
          });
          lab.addEventListener('input', function () {
            it.label = lab.value;
            ctx.changed();
          });
          const moveSel = h('select', { class: 'v3-ctrl v3-cls-move', 'aria-label': 'Déplacer' });
          moveSel.appendChild(h('option', { value: '' }, '↔'));
          (cfg.zones || []).forEach(function (z2) {
            if (z2.id === z.id) return;
            moveSel.appendChild(h('option', { value: z2.id }, z2.label || 'Zone'));
          });
          moveSel.addEventListener('change', function () {
            const to = moveSel.value;
            if (!to) return;
            moveItem(cfg, it.id, to);
            moveSel.value = '';
            paintGrid();
            ctx.changed();
            paintCount();
          });
          const row = h('div', { class: 'v3-cls-edit-item', 'data-item-id': it.id },
            lab,
            moveSel,
            U.button('×', {
              variant: 'ghost',
              onClick: function () {
                z.items = z.items.filter(function (x) { return x.id !== it.id; });
                paintGrid();
                ctx.changed();
                paintCount();
              },
            })
          );
          attachPointerDnD(row, function () { return it.id; }, function (itemId, zoneId) {
            if (zoneId && zoneId !== z.id) {
              moveItem(cfg, itemId, zoneId);
              paintGrid();
              ctx.changed();
              paintCount();
            }
          });
          list.appendChild(row);
        });

        const addIn = h('input', {
          class: 'v3-ctrl v3-cls-add-item',
          placeholder: '+ item',
          'aria-label': 'Nouvel item',
        });
        addIn.addEventListener('keydown', function (ev) {
          if (ev.key !== 'Enter') return;
          ev.preventDefault();
          addItem(cfg, z.id, addIn.value);
          addIn.value = '';
          paintGrid();
          ctx.changed();
          paintCount();
        });

        const zoneEl = h('div', {
          class: 'v3-cls-zone v3-cls-zone-edit',
          dataset: { zoneId: z.id },
        },
          h('div', { class: 'v3-cls-zone-head' },
            title,
            U.button('×', {
              variant: 'ghost',
              onClick: function () {
                if ((cfg.zones || []).length <= 2) {
                  U.toast('Minimum 2 zones', 'err');
                  return;
                }
                if ((z.items || []).length) {
                  U.toast('Videz la zone d’abord', 'err');
                  return;
                }
                cfg.zones = cfg.zones.filter(function (x) { return x.id !== z.id; });
                paintGrid();
                ctx.changed();
                paintCount();
              },
            })
          ),
          list,
          addIn
        );
        grid.appendChild(zoneEl);
      });
      paintCount();
    }

    function openImport() {
      if (!importHost) {
        importHost = h('div', { class: 'v3-cls-import' });
        const selMount = h('div');
        const zonePick = h('select', { class: 'v3-ctrl' });
        const champPick = h('select', { class: 'v3-ctrl' });
        C.list.filter(function (c) { return !c.identite; }).forEach(function (c) {
          champPick.appendChild(h('option', { value: c.code }, c.court || c.label));
        });

        function fillZonePick() {
          zonePick.replaceChildren();
          (cfg.zones || []).forEach(function (z) {
            zonePick.appendChild(h('option', { value: z.id }, z.label || 'Zone'));
          });
        }

        importHost.append(
          h('h3', null, 'Importer'),
          selMount,
          h('div', { class: 'v3-cls-import-act' },
            U.field('Items → zone', h('div', { class: 'v3-cls-import-row' },
              zonePick,
              U.button('Items', {
                variant: 'primary',
                onClick: function () {
                  void doImportItems(zonePick.value);
                },
              })
            ), { tip: 'Libellé = DCI.' }),
            U.button('Zones (DCI)', {
              variant: 'ghost',
              onClick: function () { void doImportZones(); },
            }),
            U.field('Auto par champ', h('div', { class: 'v3-cls-import-row' },
              champPick,
              U.button('Remplir', {
                variant: 'ghost',
                onClick: function () { void doAutoFill(champPick.value); },
              })
            ), { tip: 'Une zone par valeur distincte.' })
          ),
          U.button('Fermer', { variant: 'ghost', onClick: closeImport })
        );
        toolbar.parentNode.insertBefore(importHost, toolbar.nextSibling);

        let pre = global.V3Selection.empty();
        if (ctx.meta && ctx.meta.selection && !global.V3Selection.isEmpty(ctx.meta.selection)) {
          const s = ctx.meta.selection;
          const f = s.filtres || {};
          pre = {
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
        selApi = global.V3Selection.mount(selMount, { value: pre, onChange: function () {} });

        fillZonePick();
        importHost._fillZones = fillZonePick;
      }
      importHost.hidden = false;
      if (importHost._fillZones) importHost._fillZones();
    }

    async function resolveImport() {
      const sel = selApi ? selApi.get() : global.V3Selection.empty();
      return global.V3Selection.resolve(sel);
    }

    async function doImportItems(zoneId) {
      const mols = await resolveImport();
      if (!mols.length) { U.toast('Sélection vide', 'err'); return; }
      mols.forEach(function (m) {
        addItem(cfg, zoneId, m.dci || '—');
      });
      paintGrid();
      ctx.changed();
      closeImport();
    }

    async function doImportZones() {
      const mols = await resolveImport();
      if (!mols.length) { U.toast('Sélection vide', 'err'); return; }
      mols.forEach(function (m) {
        cfg.zones.push({ id: uid('z'), label: m.dci || '—', items: [] });
      });
      paintGrid();
      ctx.changed();
      closeImport();
    }

    async function doAutoFill(champCode) {
      const mols = await resolveImport();
      if (!mols.length) { U.toast('Sélection vide', 'err'); return; }
      const zoneByLabel = {};
      (cfg.zones || []).forEach(function (z) {
        zoneByLabel[(z.label || '').trim().toLowerCase()] = z;
      });
      mols.forEach(function (m) {
        const vals = C.valeurs(m, champCode);
        const val = (vals && vals[0]) ? String(vals[0]).trim() : 'Autre';
        const key = val.toLowerCase();
        let z = zoneByLabel[key];
        if (!z) {
          z = { id: uid('z'), label: val, items: [] };
          cfg.zones.push(z);
          zoneByLabel[key] = z;
        }
        addItem(cfg, z.id, m.dci || '—');
      });
      paintGrid();
      ctx.changed();
      closeImport();
    }

    toolbar.append(
      U.button('+ Zone', {
        variant: 'ghost',
        onClick: function () {
          cfg.zones.push({ id: uid('z'), label: 'Zone ' + ((cfg.zones || []).length + 1), items: [] });
          paintGrid();
          ctx.changed();
        },
      }),
      U.button('Importer', {
        variant: 'primary',
        onClick: openImport,
      })
    );

    paintGrid();
    el.replaceChildren(
      h('div', { class: 'v3-stack v3-cls-perso' },
        countEl,
        grid,
        toolbar
      )
    );
  }

  function playItemBtn(it, opts) {
    opts = opts || {};
    const cls = ['v3-cls-item'];
    if (opts.selected) cls.push('is-selected');
    if (opts.placed) cls.push('is-placed');
    if (opts.ok === true) cls.push('is-ok');
    if (opts.ok === false) cls.push('is-bad');
    const btn = h('button', {
      type: 'button',
      class: cls.join(' '),
      dataset: { itemId: it.id },
    }, it.label || '—');
    if (opts.hint) {
      btn.appendChild(h('small', { class: 'v3-cls-item-hint' }, opts.hint));
    }
    return btn;
  }

  function mountPlay(host, data, session, layoutPreview) {
    const items = data.items.slice();
    const zones = data.zones.slice();
    const correct = data.correct;
    const zoneById = {};
    zones.forEach(function (z) { zoneById[z.id] = z; });

    const itemById = {};
    items.forEach(function (it) { itemById[it.id] = it; });
    const placement = {};
    items.forEach(function (it) { placement[it.id] = null; });
    let pileOrder = shuffle(items.map(function (it) { return it.id; }));
    let selectedId = null;
    let done = false;
    let layout = layoutPreview || 'page';
    let tentativeId = null;

    const consigneEl = h('p', { class: 'v3-muted v3-cls-consigne' }, data.consigne || '');
    const layoutHost = h('div');
    const boardHost = h('div');
    const actHost = h('div', { class: 'v3-actions' });
    host.replaceChildren(consigneEl, layoutHost, boardHost, actHost);

    if (session.reel) {
      layout = 'page';
    } else {
      layoutHost.appendChild(U.segmented([
        { value: 'embed', label: 'Leçon' },
        { value: 'page', label: 'Page' },
      ], layout, function (v) {
        layout = v;
        paint();
      }));
    }

    function allPlaced() {
      return items.every(function (it) { return !!placement[it.id]; });
    }

    function paint() {
      if (done) return;
      boardHost.className = 'v3-cls-play v3-cls-play--' + layout;
      boardHost.replaceChildren();

      const unplaced = pileOrder.filter(function (id) { return !placement[id]; }).map(function (id) {
        return itemById[id];
      }).filter(Boolean);

      function wireItem(btn, id) {
        btn.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (playSkipClick) return;
          if (placement[id]) {
            placement[id] = null;
            selectedId = null;
          } else if (selectedId === id) {
            selectedId = null;
          } else {
            selectedId = id;
          }
          paint();
        });
        attachPointerDnD(btn, function () { return id; }, function (itemId, zoneId) {
          placement[itemId] = zoneId || null;
          selectedId = null;
          paint();
        });
      }

      if (layout === 'embed') {
        const banner = h('div', { class: 'v3-cls-banner', 'aria-label': 'Items à classer' });
        if (unplaced.length) {
          unplaced.forEach(function (it) {
            const btn = playItemBtn(it, { selected: selectedId === it.id });
            wireItem(btn, it.id);
            banner.appendChild(btn);
          });
        } else {
          banner.appendChild(h('span', { class: 'v3-muted' }, 'Tous placés'));
        }
        boardHost.appendChild(banner);
      }

      const zonesWrap = h('div', { class: 'v3-cls-zones' });
      if (layout === 'page') {
        const pile = h('div', { class: 'v3-cls-pile' },
          h('p', { class: 'v3-cls-col-title' }, 'À classer'),
          h('div', { class: 'v3-cls-pile-inner' })
        );
        const inner = pile.querySelector('.v3-cls-pile-inner');
        if (unplaced.length) {
          unplaced.forEach(function (it) {
            const btn = playItemBtn(it, { selected: selectedId === it.id });
            wireItem(btn, it.id);
            inner.appendChild(btn);
          });
        } else {
          inner.appendChild(h('p', { class: 'v3-muted' }, 'Tous placés'));
        }
        pile.addEventListener('click', function (ev) {
          if (ev.target.closest('.v3-cls-item')) return;
          if (selectedId && placement[selectedId]) {
            placement[selectedId] = null;
            selectedId = null;
            paint();
          }
        });
        boardHost.appendChild(pile);
      }

      zones.forEach(function (z) {
        const inZone = items.filter(function (it) { return placement[it.id] === z.id; });
        const drop = h('div', { class: 'v3-cls-drop' });
        if (inZone.length) {
          inZone.forEach(function (it) {
            const btn = playItemBtn(it, { placed: true, selected: selectedId === it.id });
            wireItem(btn, it.id);
            drop.appendChild(btn);
          });
        } else if (!done) {
          drop.appendChild(h('span', { class: 'v3-cls-hint' }, 'Déposer ici'));
        }
        const zoneEl = h('div', {
          class: 'v3-cls-zone',
          dataset: { zoneId: z.id },
        },
          h('p', { class: 'v3-cls-col-title' }, z.label || '—'),
          drop
        );
        zoneEl.addEventListener('click', function (ev) {
          if (ev.target.closest('.v3-cls-item')) return;
          if (selectedId) {
            placement[selectedId] = z.id;
            selectedId = null;
            paint();
          }
        });
        zonesWrap.appendChild(zoneEl);
      });
      boardHost.appendChild(zonesWrap);

      actHost.replaceChildren(
        U.button('Valider', {
          variant: 'primary',
          disabled: !allPlaced(),
          onClick: function () {
            if (!allPlaced()) return;
            void submit();
          },
        })
      );
    }

    function paintResult(details, obtenu, max) {
      done = true;
      layoutHost.replaceChildren();
      const detailByItem = {};
      (details || []).forEach(function (d) {
        detailByItem[d.item_id || d.id] = d;
      });
      boardHost.className = 'v3-cls-play v3-cls-play--' + layout;
      boardHost.replaceChildren();
      const zonesWrap = h('div', { class: 'v3-cls-zones v3-cls-zones-result' });
      zones.forEach(function (z) {
        const drop = h('div', { class: 'v3-cls-drop' });
        items.filter(function (it) { return placement[it.id] === z.id; }).forEach(function (it) {
          const det = detailByItem[it.id];
          const ok = det ? !!det.ok : (correct[it.id] === z.id);
          let hint = '';
          if (!ok) {
            const goodId = correct[it.id];
            hint = (zoneById[goodId] && zoneById[goodId].label) || '—';
          }
          drop.appendChild(playItemBtn(it, { placed: true, ok: ok, hint: hint ? ('→ ' + hint) : '' }));
        });
        zonesWrap.appendChild(h('div', { class: 'v3-cls-zone' },
          h('p', { class: 'v3-cls-col-title' }, z.label || '—'),
          drop
        ));
      });
      boardHost.appendChild(zonesWrap);
      actHost.replaceChildren(
        h('p', { class: 'v3-fin-score' }, obtenu + ' / ' + max)
      );
    }

    async function submit() {
      const placements = {};
      items.forEach(function (it) {
        placements[it.id] = placement[it.id];
      });
      if (!session.reel) {
        let obtenu = 0;
        const details = items.map(function (it) {
          const ok = correct[it.id] === placement[it.id];
          if (ok) obtenu += 1;
          return { item_id: it.id, zone_id: placement[it.id], ok: ok };
        });
        paintResult(details, obtenu, items.length);
        session.fin({ obtenu: obtenu, max: items.length, details: details });
        return;
      }
      try {
        if (!tentativeId) {
          const start = await session.rpc('jeu_demarrer_classement', {
            p_jeu_id: session.jeu.id,
            p_contexte: 'classique',
          });
          tentativeId = start.tentative_id;
        }
        const res = await session.rpc('jeu_soumettre_classement', {
          p_tentative_id: tentativeId,
          p_placements: placements,
        });
        paintResult(res.details || [], Number(res.score_obtenu), Number(res.score_max));
        session.fin({
          obtenu: Number(res.score_obtenu),
          max: Number(res.score_max),
          details: res.details || [],
        });
      } catch (e) {
        U.toast(e.message || 'Erreur', 'err');
      }
    }

    if (session.reel) {
      session.rpc('jeu_demarrer_classement', {
        p_jeu_id: session.jeu.id,
        p_contexte: 'classique',
      }).then(function (start) {
        tentativeId = start.tentative_id;
        const parsed = snapToPlay(start.snapshot || {});
        items.length = 0;
        zones.length = 0;
        Object.keys(correct).forEach(function (k) { delete correct[k]; });
        parsed.items.forEach(function (it) { items.push(it); });
        parsed.zones.forEach(function (z) { zones.push(z); });
        Object.assign(correct, parsed.correct);
        parsed.zones.forEach(function (z) { zoneById[z.id] = z; });
        items.forEach(function (it) {
          placement[it.id] = null;
          itemById[it.id] = it;
        });
        pileOrder = shuffle(items.map(function (it) { return it.id; }));
        consigneEl.textContent = parsed.consigne || '';
        paint();
      }).catch(function (e) {
        host.replaceChildren(U.empty(e.message || 'Erreur'));
      });
    } else {
      paint();
    }
  }

  function play(el, ctx, session) {
    const snap = snapFromCfg(ctx.cfg || {});
    const data = snapToPlay(snap);
    if (data.items.length < 1 || data.zones.length < 2) {
      el.replaceChildren(U.empty('Configuration incomplète'));
      return;
    }
    el.replaceChildren();
    mountPlay(el, data, session, 'page');
  }

  global.V3Games.register('classement', {
    label: 'Classement',
    tip: 'Items à placer dans des zones. 1 item = 1 point.',
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
