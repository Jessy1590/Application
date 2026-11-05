(function (global) {
  const U = global.V3UI;
  const Z = global.V3Zones;
  const S = global.V3ZonesShared;
  const h = U.h;
  const txt = U.txt;

  function trim(s) {
    return txt(s).trim();
  }

  function ensureCfg(cfg) {
    cfg = cfg || {};
    if (cfg.consigne == null) cfg.consigne = '';
    if (!Array.isArray(cfg.zones)) cfg.zones = [];
    cfg.zones.forEach(function (z, i) {
      if (!z.id) z.id = Z.uid('z');
      if (!trim(z.label)) z.label = 'Zone ' + (i + 1);
      if (!Array.isArray(z.items)) z.items = [];
      z.items.forEach(function (it) {
        if (!it.id) it.id = Z.uid('i');
        if (it.label == null) it.label = '';
      });
    });
    if (cfg.zones.length < 2) {
      while (cfg.zones.length < 2) {
        cfg.zones.push({
          id: Z.uid('z'),
          label: 'Zone ' + (cfg.zones.length + 1),
          items: [{ id: Z.uid('i'), label: '', matrice_id: null }],
        });
      }
    }
    return cfg;
  }

  function defaults() {
    return ensureCfg({
      consigne: '',
      zones: [
        { id: Z.uid('z'), label: 'Zone 1', items: [{ id: Z.uid('i'), label: '', matrice_id: null }] },
        { id: Z.uid('z'), label: 'Zone 2', items: [{ id: Z.uid('i'), label: '', matrice_id: null }] },
      ],
    });
  }

  function fromConfig(raw) {
    const parsed = Z.fromClassement(raw || {});
    return ensureCfg({
      consigne: parsed.consigne,
      zones: parsed.zones.length ? parsed.zones : defaults().zones,
    });
  }

  function snapToPlay(snap) {
    const itemsById = {};
    (snap.items || []).forEach(function (it) {
      itemsById[it.id] = { id: it.id, label: trim(it.label) };
    });
    const correct = {};
    const zones = (snap.zones || []).map(function (z) {
      const ids = z.item_ids || [];
      ids.forEach(function (id) { correct[id] = z.id; });
      return { id: z.id, label: trim(z.label), item_ids: ids.slice() };
    });
    const items = (snap.items || []).map(function (it) {
      return itemsById[it.id] || { id: it.id, label: trim(it.label) };
    });
    return { consigne: trim(snap.consigne), items: items, zones: zones, correct: correct };
  }

  function validate(ctx) {
    const cfg = ensureCfg(ctx.cfg || {});
    const msgs = [];
    const compiled = Z.toClassement(cfg.consigne, cfg.zones);
    const zones = compiled.zones || [];
    const items = compiled.items || [];
    if (zones.length < 2) msgs.push('Moins de 2 zones');
    if (!items.length) msgs.push('Aucun item');
    if (!trim(cfg.consigne)) msgs.push('Consigne vide');
    cfg.zones.forEach(function (z) {
      const has = (z.items || []).some(function (it) { return trim(it.label); });
      if (!has) msgs.push('Zone vide : ' + (trim(z.label) || '—'));
    });
    return msgs;
  }

  function payload(ctx) {
    const cfg = ensureCfg(ctx.cfg || {});
    return { classement: Z.toClassement(cfg.consigne, cfg.zones) };
  }

  function params(el, ctx) {
    const cfg = ensureCfg(ctx.cfg);
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
      U.card('Paramètres',
        U.field('Consigne', input, { tip: 'Affichée au joueur.' })
      )
    );
  }

  let editorApi = null;

  function perso(el, ctx) {
    const cfg = ensureCfg(ctx.cfg);
    if (editorApi) editorApi.destroy();
    const host = h('div');
    el.replaceChildren(U.card('Personnalisation', host));
    editorApi = S.editor(host, {
      mode: 'classement',
      zones: cfg.zones,
      ctx: ctx,
      onChange: function (zones) {
        cfg.zones = zones;
        ctx.changed();
      },
    });
  }

  function mountPlay(host, data, session) {
    const items = data.items.slice();
    const zones = data.zones.slice();
    const correct = data.correct;
    const placement = {};
    items.forEach(function (it) { placement[it.id] = null; });
    let pileOrder = items.map(function (it) { return it.id; });
    for (let i = pileOrder.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = pileOrder[i];
      pileOrder[i] = pileOrder[j];
      pileOrder[j] = t;
    }
    let selectedId = null;
    let done = false;
    let tentativeId = data.tentativeId || null;
    let skipClick = false;
    let drag = null;
    let ghost = null;
    let dropTarget = null;
    let raf = 0;

    const consigneEl = h('p', { class: 'jp-muted' }, data.consigne || 'Classez chaque item dans la bonne catégorie');
    const banner = h('div', { class: 'jp-classement-banner', 'aria-label': 'Items à classer' });
    const emptyBanner = h('p', { class: 'jp-muted' }, 'Tous placés');
    const zonesWrap = h('div', { class: 'jp-classement-zones' });
    const root = h('div', { class: 'jp-classement jp-classement--row' }, banner, zonesWrap);
    const boardHost = h('div', { class: 'v3-cls-board' }, root);
    const actHost = h('div', { class: 'jp-v2-actions' });
    const validBtn = U.button('Valider', {
      variant: 'primary',
      disabled: true,
      onClick: function () {
        if (!allPlaced()) return;
        void submit();
      },
    });
    actHost.appendChild(validBtn);
    host.replaceChildren(consigneEl, boardHost, actHost);

    const itemEls = {};
    items.forEach(function (it) {
      itemEls[it.id] = h('button', {
        type: 'button',
        class: 'jp-classement-item',
        dataset: { item: it.id },
      }, trim(it.label) || '—');
    });

    const zoneEls = {};
    const dropEls = {};
    const hintEls = {};
    zones.forEach(function (z) {
      const drop = h('div', { class: 'jp-classement-drop' });
      const hint = h('span', { class: 'jp-muted jp-classement-hint' }, 'Déposer ici');
      drop.appendChild(hint);
      const zoneEl = h('div', { class: 'jp-classement-zone', dataset: { zone: z.id } },
        h('p', { class: 'jp-classement-col-title' }, trim(z.label) || '—'),
        drop
      );
      zoneEls[z.id] = zoneEl;
      dropEls[z.id] = drop;
      hintEls[z.id] = hint;
      zonesWrap.appendChild(zoneEl);
    });

    function allPlaced() {
      return items.every(function (it) { return !!placement[it.id]; });
    }

    function sync() {
      if (done) return;
      let unplaced = 0;
      pileOrder.forEach(function (id) {
        if (!placement[id]) {
          banner.appendChild(itemEls[id]);
          unplaced += 1;
        }
      });
      if (unplaced) {
        if (emptyBanner.parentNode) emptyBanner.remove();
      } else {
        banner.appendChild(emptyBanner);
      }
      zones.forEach(function (z) {
        const drop = dropEls[z.id];
        const hint = hintEls[z.id];
        let n = 0;
        items.forEach(function (it) {
          if (placement[it.id] !== z.id) return;
          drop.appendChild(itemEls[it.id]);
          n += 1;
        });
        hint.hidden = n > 0;
        if (n === 0) drop.appendChild(hint);
      });
      items.forEach(function (it) {
        const el = itemEls[it.id];
        el.classList.toggle('is-selected', selectedId === it.id);
        el.classList.toggle('is-placed', !!placement[it.id]);
      });
      validBtn.disabled = !allPlaced();
    }

    function place(itemId, zoneId) {
      placement[itemId] = zoneId || null;
      selectedId = null;
      sync();
    }

    function clearDropTarget() {
      if (dropTarget) {
        dropTarget.classList.remove('is-drop-target');
        dropTarget = null;
      }
    }

    function cleanupDrag() {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);
      ghost = null;
      if (drag && drag.el) drag.el.classList.remove('is-dragging');
      drag = null;
      clearDropTarget();
      document.body.classList.remove('v3-cls-dragging');
    }

    boardHost.addEventListener('click', function (ev) {
      if (done || skipClick) return;
      const itemEl = ev.target.closest('.jp-classement-item');
      if (itemEl) {
        const id = itemEl.getAttribute('data-item');
        if (placement[id]) {
          place(id, null);
        } else if (selectedId === id) {
          selectedId = null;
          sync();
        } else {
          selectedId = id;
          sync();
        }
        return;
      }
      const zoneEl = ev.target.closest('.jp-classement-zone');
      if (zoneEl && selectedId) {
        place(selectedId, zoneEl.getAttribute('data-zone'));
        return;
      }
      if (ev.target.closest('.jp-classement-banner') && selectedId && placement[selectedId]) {
        place(selectedId, null);
      }
    });

    function onDragMove(ev) {
      if (!drag) return;
      const dx = ev.clientX - drag.x;
      const dy = ev.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 6) return;
      drag.moved = true;
      if (!ghost) {
        ghost = drag.el.cloneNode(true);
        ghost.classList.add('v3-cls-ghost');
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
        document.body.appendChild(ghost);
        document.body.classList.add('v3-cls-dragging');
        drag.el.classList.add('is-dragging');
      }
      const gx = ev.clientX;
      const gy = ev.clientY;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(function () {
        raf = 0;
        if (!ghost) return;
        ghost.style.left = gx + 'px';
        ghost.style.top = gy + 'px';
      });
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      const zone = over && over.closest ? over.closest('.jp-classement-zone') : null;
      if (zone !== dropTarget) {
        clearDropTarget();
        if (zone) {
          zone.classList.add('is-drop-target');
          dropTarget = zone;
        }
      }
    }

    function finishDrag(ev) {
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', finishDrag);
      document.removeEventListener('pointercancel', finishDrag);
      if (!drag) return;
      const moved = drag.moved;
      const id = drag.id;
      const over = document.elementFromPoint(ev.clientX, ev.clientY);
      const zone = over && over.closest ? over.closest('.jp-classement-zone') : null;
      cleanupDrag();
      if (moved) {
        skipClick = true;
        setTimeout(function () { skipClick = false; }, 0);
        if (zone) place(id, zone.getAttribute('data-zone'));
      }
    }

    boardHost.addEventListener('pointerdown', function (ev) {
      if (done) return;
      if (ev.button !== 0 && ev.pointerType === 'mouse') return;
      const itemEl = ev.target.closest('.jp-classement-item');
      if (!itemEl) return;
      drag = {
        id: itemEl.getAttribute('data-item'),
        el: itemEl,
        x: ev.clientX,
        y: ev.clientY,
        moved: false,
      };
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', finishDrag);
      document.addEventListener('pointercancel', finishDrag);
    });

    function paintResult(details, obtenu, max) {
      done = true;
      cleanupDrag();
      const detailByItem = {};
      (details || []).forEach(function (d) {
        detailByItem[d.item_id || d.id] = d;
      });
      items.forEach(function (it) {
        const el = itemEls[it.id];
        el.disabled = true;
        el.classList.remove('is-selected', 'is-dragging');
        const det = detailByItem[it.id];
        const ok = det ? !!det.ok : (correct[it.id] === placement[it.id]);
        el.classList.toggle('is-ok', ok);
        el.classList.toggle('is-ko', !ok);
      });
      actHost.replaceChildren(h('p', { class: 'v3-fin-score' }, obtenu + ' / ' + max));
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
        items.forEach(function (it) { placement[it.id] = null; });
        pileOrder = items.map(function (it) { return it.id; });
        for (let i = pileOrder.length - 1; i > 0; i -= 1) {
          const j = Math.floor(Math.random() * (i + 1));
          const t = pileOrder[i];
          pileOrder[i] = pileOrder[j];
          pileOrder[j] = t;
        }
        host.replaceChildren();
        mountPlay(host, Object.assign(parsed, { tentativeId: start.tentative_id }), session);
      }).catch(function (e) {
        host.replaceChildren(U.empty(e.message || 'Erreur'));
      });
    } else {
      sync();
    }
  }

  function play(el, ctx, session) {
    const cfg = ensureCfg(ctx.cfg || {});
    const snap = Z.toClassement(cfg.consigne, cfg.zones);
    const data = snapToPlay(snap);
    if (data.items.length < 1 || data.zones.length < 2) {
      el.replaceChildren(U.empty('Configuration incomplète'));
      return;
    }
    el.replaceChildren();
    mountPlay(el, data, session);
  }

  global.V3Games.register('classement', {
    label: 'Classement',
    tip: 'Items à placer dans des zones. 1 item = 1 point.',
    pool: true,
    defaults: defaults,
    fromConfig: fromConfig,
    params: params,
    perso: perso,
    play: play,
    validate: validate,
    payload: payload,
  });
})(window);
