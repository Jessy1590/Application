(function (global) {
  const U = global.V3UI;
  const Z = global.V3Zones;
  const S = global.V3ZonesShared;
  const h = U.h;
  const txt = U.txt;

  const APPARIE_COLORS = [
    '#0f6b5c', '#c45c26', '#2f5aa8', '#8a3a7a', '#3d7a2a',
    '#a67c00', '#1a6f8a', '#9b2d3a', '#5b4bb0', '#2a7a6a',
  ];

  function trim(s) {
    return txt(s).trim();
  }

  function ensureCfg(cfg) {
    cfg = cfg || {};
    if (cfg.consigne == null) cfg.consigne = '';
    if (!Array.isArray(cfg.zones) || cfg.zones.length !== 2) {
      const parsed = Z.fromAppariement({});
      cfg.zones = parsed.zones;
    }
    cfg.zones.forEach(function (z) {
      if (!z.id) z.id = Z.uid('z');
      if (z.label == null) z.label = '';
      if (!Array.isArray(z.items)) z.items = [];
      z.items.forEach(function (it) {
        if (!it.id) it.id = Z.uid('i');
        if (it.label == null) it.label = '';
      });
    });
    Z.syncAppariementRows(cfg.zones);
    return cfg;
  }

  function defaults() {
    return ensureCfg({ consigne: '', zones: Z.fromAppariement({}).zones });
  }

  function fromConfig(raw) {
    const parsed = Z.fromAppariement(raw || {});
    return ensureCfg({ consigne: parsed.consigne, zones: parsed.zones });
  }

  function validate(ctx) {
    const cfg = ensureCfg(ctx.cfg);
    const msgs = [];
    if (!trim(cfg.consigne)) msgs.push('Consigne vide');
    if ((cfg.zones || []).length !== 2) msgs.push('2 colonnes requises');
    const n0 = (cfg.zones[0] && cfg.zones[0].items || []).filter(function (it) { return trim(it.label); }).length;
    const n1 = (cfg.zones[1] && cfg.zones[1].items || []).filter(function (it) { return trim(it.label); }).length;
    if (n0 < 1 || n1 < 1) msgs.push('Minimum 1 item par zone');
    if (n0 !== n1) msgs.push('Même nombre d’items dans les 2 zones');
    const n = Z.rowCount(cfg.zones);
    let complete = 0;
    for (let i = 0; i < n; i += 1) {
      const gl = trim(cfg.zones[0].items[i] && cfg.zones[0].items[i].label);
      const dl = trim(cfg.zones[1].items[i] && cfg.zones[1].items[i].label);
      if (gl && dl) complete += 1;
      else if (gl || dl) msgs.push('Ligne ' + (i + 1) + ' incomplète');
    }
    if (complete < 2) msgs.push('Moins de 2 paires');
    function dupSide(zi) {
      const seen = {};
      (cfg.zones[zi].items || []).forEach(function (it) {
        const lab = trim(it.label);
        if (!lab) return;
        const k = lab.toLowerCase();
        if (seen[k]) seen[k] += 1;
        else seen[k] = 1;
      });
      Object.keys(seen).forEach(function (k) {
        if (seen[k] > 1) msgs.push('Doublon : ' + k);
      });
    }
    dupSide(0);
    dupSide(1);
    return msgs;
  }

  function payload(ctx) {
    const cfg = ensureCfg(ctx.cfg);
    return { appariement: Z.toAppariement(cfg.consigne, cfg.zones) };
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
      U.card('Paramètres',
        U.field('Consigne', input, { tip: 'Affichée en tête de partie.' })
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
      mode: 'appariement',
      zones: cfg.zones,
      ctx: ctx,
      onChange: function (zones) {
        cfg.zones = zones;
        ctx.changed();
      },
    });
  }

  function correctMap(paires) {
    const m = {};
    (paires || []).forEach(function (p) {
      if (p && p.gauche_id && p.droite_id) m[p.gauche_id] = p.droite_id;
    });
    return m;
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

  function play(el, ctx, session) {
    el.replaceChildren(U.empty('Chargement…'));

    function run(data) {
      const consigne = trim(data.consigne) || 'Reliez chaque élément de gauche à celui de droite';
      const gauche = (data.gauche || []).filter(function (g) { return g && trim(g.label); }).map(function (g) {
        return { id: g.id, label: trim(g.label) };
      });
      const droite = (data.droite || []).filter(function (d) { return d && trim(d.label); }).map(function (d) {
        return { id: d.id, label: trim(d.label) };
      });
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
          pairColorIndex[gid] = nextColor % APPARIE_COLORS.length;
          nextColor += 1;
        }
        return APPARIE_COLORS[pairColorIndex[gid]];
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
            stroke = correct[gid] === did ? 'var(--jp-ok, #0f6b5c)' : 'var(--jp-danger, #9b2d3a)';
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
        const host = h('div', { class: 'v3-play' });
        host.appendChild(h('p', { class: 'jp-muted' }, consigne));

        if (phase === 'review' && reviewDetails) {
          host.appendChild(h('ul', { class: 'jp-v2-quiz-recap' },
            reviewDetails.map(function (d) {
              return h('li', { class: d.ok ? 'is-ok' : 'is-ko' },
                h('strong', null, d.label),
                h('span', { class: 'jp-muted' }, ' · ' + d.choix),
                d.ok ? null : h('small', null, ' Correct : ' + d.expect)
              );
            })
          ));
        }

        const usedRight = {};
        Object.keys(links).forEach(function (gid) { usedRight[links[gid]] = true; });

        boardEl = h('div', { class: 'jp-appariement', id: 'jpApparieBoard' });
        svgEl = h('svg', { class: 'jp-appariement-svg', 'aria-hidden': 'true' });
        const colG = h('div', { class: 'jp-appariement-col jp-appariement-col--g', role: 'group', 'aria-label': 'Gauche' });
        const colD = h('div', { class: 'jp-appariement-col jp-appariement-col--d', role: 'group', 'aria-label': 'Droite' });

        orderG.forEach(function (g) {
          const linked = links[g.id];
          const cls = ['jp-appariement-card', 'jp-appariement-card--g'];
          if (selectedG === g.id) cls.push('is-selected');
          if (linked) cls.push('is-linked');
          const btn = h('button', {
            type: 'button',
            class: cls.join(' '),
            dataset: { g: g.id },
            style: linked && phase !== 'review' ? { '--jp-pair': colorFor(g.id) } : null,
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
          },
            h('span', { class: 'jp-appariement-card-body' }, h('strong', null, g.label)),
            h('span', { class: 'jp-appariement-handle', dataset: { gHandle: g.id }, ariaHidden: 'true' })
          );
          colG.appendChild(btn);
        });

        orderD.forEach(function (d) {
          const used = !!usedRight[d.id];
          const gidFor = Object.keys(links).find(function (g) { return links[g] === d.id; });
          const cls = ['jp-appariement-card', 'jp-appariement-card--d'];
          if (used) cls.push('is-used', 'is-linked');
          const btn = h('button', {
            type: 'button',
            class: cls.join(' '),
            dataset: { d: d.id },
            style: gidFor && phase !== 'review' ? { '--jp-pair': colorFor(gidFor) } : null,
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
          },
            h('span', { class: 'jp-appariement-handle', dataset: { dHandle: d.id }, ariaHidden: 'true' }),
            h('span', { class: 'jp-appariement-card-body' }, d.label),
            phase === 'review' && gidFor && correct[gidFor] !== d.id
              ? h('small', { class: 'jp-muted' }, labelD(correct[gidFor]))
              : null
          );
          colD.appendChild(btn);
        });

        boardEl.append(svgEl, colG, colD);
        host.appendChild(boardEl);

        const actions = h('div', { class: 'jp-v2-actions' });
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
      const compiled = Z.toAppariement(ensureCfg(ctx.cfg).consigne, ensureCfg(ctx.cfg).zones);
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
