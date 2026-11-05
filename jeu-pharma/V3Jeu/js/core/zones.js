/* V3Zones — éditeur zones × items (classement & appariement). */
(function (global) {
  const U = global.V3UI;
  const C = global.V3Champs;
  const h = U.h;
  const D = global.V3Data;

  let idSeq = 0;
  function uid(prefix) {
    idSeq += 1;
    return (prefix || 'z') + '-' + Date.now().toString(36) + '-' + idSeq;
  }

  function trim(s) {
    return String(s || '').trim();
  }

  function norm(s) {
    return D && D.norm ? D.norm(s) : trim(s).toLowerCase();
  }

  function copyZones(zones) {
    return (zones || []).map(function (z) {
      return {
        id: z.id,
        label: z.label || '',
        items: (z.items || []).map(function (it) {
          return {
            id: it.id,
            label: it.label || '',
            matrice_id: it.matrice_id || null,
          };
        }),
      };
    });
  }

  function ensureZone(z, labelDefault) {
    if (!z.id) z.id = uid('z');
    if (z.label == null) z.label = labelDefault || '';
    if (!Array.isArray(z.items)) z.items = [];
    z.items.forEach(function (it) {
      if (!it.id) it.id = uid('i');
      if (it.label == null) it.label = '';
    });
    return z;
  }

  function rowCount(zones) {
    let n = 0;
    (zones || []).forEach(function (z) {
      n = Math.max(n, (z.items || []).length);
    });
    return n;
  }

  function syncAppariementRows(zones) {
    if ((zones || []).length !== 2) return zones;
    const n = rowCount(zones);
    zones.forEach(function (z) {
      while (z.items.length < n) {
        z.items.push({ id: uid('i'), label: '', matrice_id: null });
      }
    });
    return zones;
  }

  function addAppariementRow(zones) {
    if ((zones || []).length !== 2) return;
    zones[0].items.push({ id: uid('i'), label: '', matrice_id: null });
    zones[1].items.push({ id: uid('i'), label: '', matrice_id: null });
  }

  function removeAppariementRow(zones, rowIdx) {
    if ((zones || []).length !== 2) return;
    zones.forEach(function (z) {
      if (rowIdx >= 0 && rowIdx < z.items.length) z.items.splice(rowIdx, 1);
    });
  }

  function fromClassement(raw) {
    raw = raw || {};
    const itemsById = {};
    (raw.items || []).forEach(function (it) {
      if (it && it.id) {
        itemsById[it.id] = {
          id: it.id,
          label: it.label || '',
          matrice_id: it.matrice_id || null,
        };
      }
    });
    const zones = (raw.zones || []).map(function (z, i) {
      const items = (z.item_ids || []).map(function (id) {
        return itemsById[id]
          ? Object.assign({}, itemsById[id])
          : { id: id, label: id, matrice_id: null };
      });
      return ensureZone({ id: z.id, label: z.label || '', items: items }, 'Zone ' + (i + 1));
    });
    return { consigne: raw.consigne || '', zones: zones };
  }

  function toClassement(consigne, zones) {
    const zCopy = copyZones(zones);
    const items = [];
    const seen = {};
    zCopy.forEach(function (z) {
      (z.items || []).forEach(function (it) {
        if (!trim(it.label)) return;
        if (!seen[it.id]) {
          seen[it.id] = true;
          items.push({ id: it.id, label: trim(it.label), matrice_id: it.matrice_id || undefined });
        }
      });
    });
    const outZones = zCopy.map(function (z) {
      return {
        id: z.id,
        label: trim(z.label),
        item_ids: (z.items || []).filter(function (it) { return trim(it.label); }).map(function (it) { return it.id; }),
      };
    });
    return {
      consigne: trim(consigne),
      items: items,
      zones: outZones,
    };
  }

  function fromAppariement(raw) {
    raw = raw || {};
    const gauche = Array.isArray(raw.gauche) ? raw.gauche : [];
    const droite = Array.isArray(raw.droite) ? raw.droite : [];
    const paires = Array.isArray(raw.paires) ? raw.paires : [];
    const gBy = {};
    gauche.forEach(function (g) { if (g && g.id) gBy[g.id] = g; });
    const dBy = {};
    droite.forEach(function (d) { if (d && d.id) dBy[d.id] = d; });
    const gItems = [];
    const dItems = [];
    if (paires.length) {
      paires.forEach(function (p) {
        if (!p || !p.gauche_id || !p.droite_id) return;
        const g = gBy[p.gauche_id] || { id: p.gauche_id, label: '' };
        const d = dBy[p.droite_id] || { id: p.droite_id, label: '' };
        gItems.push({
          id: g.id,
          label: g.label || '',
          matrice_id: g.matrice_id || null,
        });
        dItems.push({
          id: d.id,
          label: d.label || '',
          matrice_id: d.matrice_id || null,
        });
      });
    } else {
      const n = Math.max(gauche.length, droite.length);
      for (let i = 0; i < n; i += 1) {
        const g = gauche[i] || {};
        const d = droite[i] || {};
        gItems.push({
          id: g.id || uid('g'),
          label: g.label || '',
          matrice_id: g.matrice_id || null,
        });
        dItems.push({
          id: d.id || uid('d'),
          label: d.label || '',
          matrice_id: d.matrice_id || null,
        });
      }
    }
    if (!gItems.length) gItems.push({ id: uid('g'), label: '', matrice_id: null });
    if (!dItems.length) dItems.push({ id: uid('d'), label: '', matrice_id: null });
    return {
      consigne: raw.consigne || '',
      zones: [
        ensureZone({ id: uid('z'), label: 'Gauche', items: gItems }),
        ensureZone({ id: uid('z'), label: 'Droite', items: dItems }),
      ],
    };
  }

  function toAppariement(consigne, zones) {
    const z = syncAppariementRows(copyZones(zones));
    if (z.length !== 2) {
      return { consigne: trim(consigne), gauche: [], droite: [], paires: [] };
    }
    const gauche = [];
    const droite = [];
    const paires = [];
    const n = rowCount(z);
    for (let i = 0; i < n; i += 1) {
      const g = z[0].items[i] || { id: uid('g'), label: '' };
      const d = z[1].items[i] || { id: uid('d'), label: '' };
      if (!g.id) g.id = uid('g');
      if (!d.id) d.id = uid('d');
      if (!trim(g.label) && !trim(d.label)) continue;
      gauche.push({
        id: g.id,
        label: trim(g.label),
        matrice_id: g.matrice_id || undefined,
      });
      droite.push({
        id: d.id,
        label: trim(d.label),
        matrice_id: d.matrice_id || undefined,
      });
      if (g.id && d.id && trim(g.label) && trim(d.label)) {
        paires.push({ gauche_id: g.id, droite_id: d.id });
      }
    }
    return {
      consigne: trim(consigne),
      gauche: gauche,
      droite: droite,
      paires: paires,
    };
  }

  function copySel(meta) {
    const s = (meta && meta.selection) || global.V3Selection.empty();
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

  async function molsForCtx(ctx) {
    const list = await ctx.mols();
    return list.filter(function (m) { return !m.vide; });
  }

  function editor(el, opts) {
    opts = opts || {};
    const mode = opts.mode === 'appariement' ? 'appariement' : 'classement';
    let zones = copyZones(opts.zones || []);
    if (mode === 'appariement') {
      if (zones.length !== 2) {
        zones = [
          ensureZone({ id: uid('z'), label: 'Gauche', items: [] }),
          ensureZone({ id: uid('z'), label: 'Droite', items: [] }),
        ];
        addAppariementRow(zones);
        addAppariementRow(zones);
      }
      syncAppariementRows(zones);
    } else {
      zones.forEach(function (z, i) { ensureZone(z, 'Zone ' + (i + 1)); });
    }

    const ctx = opts.ctx;
    const gridHost = h('div', { class: 'v3-zones-grid-host' });
    const countEl = h('p', { class: 'v3-zones-count v3-muted' });

    function emit() {
      if (opts.onChange) opts.onChange(copyZones(zones));
    }

    function paintGrid() {
      gridHost.replaceChildren();
      if (mode === 'appariement') {
        syncAppariementRows(zones);
        const head = h('div', { class: 'v3-zones-app-head' });
        zones.forEach(function (z, zi) {
          const title = h('input', {
            class: 'v3-ctrl v3-zones-zone-title',
            value: z.label || '',
            'aria-label': zi === 0 ? 'Colonne gauche' : 'Colonne droite',
          });
          title.addEventListener('input', function () {
            z.label = title.value;
            emit();
            paintCount();
          });
          head.appendChild(h('div', { class: 'v3-zones-col-head' }, title));
        });
        const body = h('div', { class: 'v3-zones-app-rows' });
        const n = rowCount(zones);
        for (let ri = 0; ri < n; ri += 1) {
          const row = h('div', { class: 'v3-zones-app-row', dataset: { row: String(ri) } });
          zones.forEach(function (z, zi) {
            const it = z.items[ri] || { id: uid(zi === 0 ? 'g' : 'd'), label: '', matrice_id: null };
            if (!z.items[ri]) z.items[ri] = it;
            const inp = h('input', {
              class: 'v3-ctrl',
              value: it.label || '',
              'aria-label': (zi === 0 ? 'Gauche' : 'Droite') + ' ligne ' + (ri + 1),
            });
            inp.addEventListener('input', function () {
              it.label = inp.value;
              if (zi === 0 && !it.matrice_id) it.matrice_id = null;
              emit();
            });
            row.appendChild(inp);
          });
          const acts = h('div', { class: 'v3-zones-row-act' },
            U.button('×', {
              variant: 'ghost',
              disabled: n <= 1,
              onClick: function () {
                removeAppariementRow(zones, ri);
                if (!rowCount(zones)) addAppariementRow(zones);
                paintGrid();
                emit();
                paintCount();
              },
            })
          );
          row.appendChild(acts);
          body.appendChild(row);
        }
        gridHost.append(
          head,
          body,
          h('div', { class: 'v3-actions' },
            U.button('+ Ligne', {
              variant: 'ghost',
              onClick: function () {
                addAppariementRow(zones);
                paintGrid();
                emit();
                paintCount();
              },
            })
          )
        );
      } else {
        const grid = h('div', { class: 'v3-zones-cls-grid' });
        zones.forEach(function (z) {
          const title = h('input', {
            class: 'v3-ctrl v3-zones-zone-title',
            value: z.label || '',
            'aria-label': 'Libellé zone',
          });
          title.addEventListener('input', function () {
            z.label = title.value;
            emit();
            paintCount();
          });
          const list = h('div', { class: 'v3-zones-items' });
          (z.items || []).forEach(function (it, ii) {
            const inp = h('input', {
              class: 'v3-ctrl',
              value: it.label || '',
              'aria-label': 'Item',
            });
            inp.addEventListener('input', function () {
              it.label = inp.value;
              emit();
            });
            list.appendChild(h('div', { class: 'v3-zones-item-row' },
              inp,
              U.button('×', {
                variant: 'ghost',
                onClick: function () {
                  z.items.splice(ii, 1);
                  if (!z.items.length) {
                    z.items.push({ id: uid('i'), label: '', matrice_id: null });
                  }
                  paintGrid();
                  emit();
                  paintCount();
                },
              })
            ));
          });
          const addIn = h('input', {
            class: 'v3-ctrl v3-zones-add-inline',
            placeholder: '+ item',
            'aria-label': 'Nouvel item',
          });
          addIn.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            const lab = trim(addIn.value);
            if (!lab) return;
            z.items.push({ id: uid('i'), label: lab, matrice_id: null });
            addIn.value = '';
            paintGrid();
            emit();
            paintCount();
          });
          grid.appendChild(h('div', { class: 'v3-zones-col' },
            h('div', { class: 'v3-zones-col-head' },
              title,
              U.button('×', {
                variant: 'ghost',
                onClick: function () {
                  if (zones.length <= 2) {
                    U.toast('Minimum 2 zones', 'err');
                    return;
                  }
                  if ((z.items || []).some(function (it) { return trim(it.label); })) {
                    U.toast('Videz la zone d’abord', 'err');
                    return;
                  }
                  zones = zones.filter(function (x) { return x.id !== z.id; });
                  paintGrid();
                  emit();
                  paintCount();
                },
              })
            ),
            list,
            addIn
          ));
        });
        gridHost.append(
          grid,
          h('div', { class: 'v3-actions' },
            U.button('+ Zone', {
              variant: 'ghost',
              onClick: function () {
                zones.push(ensureZone({ id: uid('z'), label: 'Zone ' + (zones.length + 1), items: [] }));
                zones[zones.length - 1].items.push({ id: uid('i'), label: '', matrice_id: null });
                paintGrid();
                emit();
                paintCount();
              },
            })
          )
        );
      }
      paintCount();
    }

    function paintCount() {
      if (mode === 'appariement') {
        const complete = rowCount(zones);
        let ok = 0;
        for (let i = 0; i < complete; i += 1) {
          const gl = trim(zones[0].items[i] && zones[0].items[i].label);
          const dl = trim(zones[1].items[i] && zones[1].items[i].label);
          if (gl && dl) ok += 1;
        }
        countEl.textContent = ok + ' paire' + (ok > 1 ? 's' : '') + ' · ' + complete + ' ligne' + (complete > 1 ? 's' : '');
      } else {
        let n = 0;
        zones.forEach(function (z) {
          (z.items || []).forEach(function (it) { if (trim(it.label)) n += 1; });
        });
        countEl.textContent = n + ' item' + (n > 1 ? 's' : '') + ' · ' + zones.length + ' zone' + (zones.length > 1 ? 's' : '');
      }
    }

    let selApi = null;
    let importKind = mode === 'appariement' ? 'mol_g' : 'mol_items';
    let targetZoneId = zones[0] && zones[0].id;
    let champCode = 'classe_therapeutique';
    let freeText = '';

    const ad = U.adder({
      title: 'Importer',
      propose: true,
      items: function () { return []; },
      empty: '',
      draft: function (host, api) {
        const selMount = h('div');
        const kindOpts = mode === 'appariement'
          ? [
            { value: 'mol_g', label: 'Molécules (gauche)', tip: 'DCI publiée → colonne gauche.' },
            { value: 'mol_d', label: 'Molécules (droite)', tip: 'DCI publiée → colonne droite.' },
            { value: 'propose', label: 'Proposer associations', tip: 'Gauche reconnue → valeur de champ à droite.' },
            { value: 'field_d', label: 'Valeurs (droite)', tip: 'Une valeur par molécule, colonne droite.' },
            { value: 'free', label: 'Texte libre', tip: 'Une ligne saisie manuellement.' },
          ]
          : [
            { value: 'mol_items', label: 'Molécules → items', tip: 'DCI dans la zone choisie.' },
            { value: 'field_items', label: 'Valeurs → items', tip: 'Texte publié du champ, zone choisie.' },
            { value: 'zones_field', label: 'Zones par valeur', tip: 'Une zone par valeur distincte, DCI en items.' },
            { value: 'free', label: 'Texte libre', tip: 'Un item dans la zone choisie.' },
          ];
        const kindSeg = U.segmented(kindOpts, importKind, function (v) {
          importKind = v;
          api.clearProps();
          api.setDraftReady(importKind === 'free' && !!trim(freeText));
        });
        const zonePick = h('select', { class: 'v3-ctrl', 'aria-label': 'Zone cible' });
        function fillZones() {
          zonePick.replaceChildren();
          zones.forEach(function (z) {
            zonePick.appendChild(h('option', { value: z.id }, z.label || 'Zone'));
          });
          if (!targetZoneId && zones[0]) targetZoneId = zones[0].id;
          zonePick.value = targetZoneId || '';
        }
        zonePick.addEventListener('change', function () { targetZoneId = zonePick.value; });
        const champPick = h('select', { class: 'v3-ctrl', 'aria-label': 'Champ' });
        C.list.filter(function (c) { return !c.identite; }).forEach(function (c) {
          champPick.appendChild(h('option', { value: c.code }, c.court || c.label));
        });
        champPick.value = champCode;
        champPick.addEventListener('change', function () { champCode = champPick.value; });
        const freeIn = h('input', {
          class: 'v3-ctrl',
          placeholder: 'Libellé',
          'aria-label': 'Libellé libre',
        });
        freeIn.addEventListener('input', function () {
          freeText = freeIn.value;
          api.setDraftReady(importKind === 'free' && !!trim(freeText));
        });
        const proposeBtn = U.button('Proposer', {
          variant: 'ghost',
          onClick: function () {
            void runPropose(api);
          },
        });
        host.replaceChildren.apply(host, [
          selMount,
          kindSeg,
          mode === 'classement' && importKind !== 'zones_field'
            ? U.field('Zone', zonePick, { tip: 'Destination des items importés.' })
            : null,
          importKind !== 'free' && importKind !== 'mol_g' && importKind !== 'mol_d' && importKind !== 'mol_items'
            ? U.field('Champ', champPick, { tip: 'Valeurs visibles joueur (publications).' })
            : null,
          importKind === 'free' ? U.field('Libellé', freeIn) : null,
          importKind !== 'free' ? h('div', { class: 'v3-actions' }, proposeBtn) : null,
        ].filter(Boolean));
        fillZones();
        if (!selApi) {
          selApi = global.V3Selection.mount(selMount, {
            value: copySel(ctx && ctx.meta),
            compact: true,
            onChange: function () { api.clearProps(); },
          });
        }
        host._fillZones = fillZones;
      },
      renderItem: function () { return null; },
      onAdd: function (picked) {
        if (importKind === 'free') {
          applyFree(trim(freeText));
          freeText = '';
        } else {
          applyPicked(picked || []);
        }
        if (ad.refresh) ad.refresh();
        paintGrid();
        emit();
      },
      onChange: function () {},
    });

    function applyFree(lab) {
      if (!lab) return;
      if (mode === 'appariement') {
        addAppariementRow(zones);
        const i = rowCount(zones) - 1;
        zones[0].items[i].label = lab;
      } else {
        const z = zones.find(function (x) { return x.id === targetZoneId; }) || zones[0];
        if (!z) return;
        z.items.push({ id: uid('i'), label: lab, matrice_id: null });
      }
    }

    function applyPicked(list) {
      list.forEach(function (p) {
        if (!p || !p.kind) return;
        if (p.kind === 'mol_item') {
          const z = zones.find(function (x) { return x.id === p.zoneId; }) || zones[0];
          if (!z) return;
          z.items.push({ id: uid('i'), label: p.label, matrice_id: p.matrice_id || null });
        } else if (p.kind === 'zone_bundle') {
          let z = zones.find(function (x) { return norm(x.label) === norm(p.zoneLabel); });
          if (!z) {
            z = ensureZone({ id: uid('z'), label: p.zoneLabel, items: [] });
            zones.push(z);
          }
          (p.items || []).forEach(function (it) {
            z.items.push({ id: uid('i'), label: it.label, matrice_id: it.matrice_id || null });
          });
        } else if (p.kind === 'app_row') {
          syncAppariementRows(zones);
          let i = p.rowIndex != null ? p.rowIndex : rowCount(zones) - 1;
          if (i < 0) i = 0;
          while (i >= rowCount(zones)) addAppariementRow(zones);
          if (p.gLabel != null) zones[0].items[i].label = p.gLabel;
          if (p.matrice_id) zones[0].items[i].matrice_id = p.matrice_id;
          zones[1].items[i].label = p.dLabel || '';
        } else if (p.kind === 'side_item') {
          const zi = p.side === 'd' ? 1 : 0;
          syncAppariementRows(zones);
          let slot = -1;
          for (let i = 0; i < rowCount(zones); i += 1) {
            if (!trim(zones[zi].items[i].label)) { slot = i; break; }
          }
          if (slot < 0) {
            addAppariementRow(zones);
            slot = rowCount(zones) - 1;
          }
          zones[zi].items[slot].label = p.label;
          zones[zi].items[slot].matrice_id = p.matrice_id || null;
        }
      });
    }

    async function runPropose(api) {
      if (!ctx) return;
      const sel = selApi ? selApi.get() : copySel(ctx.meta);
      let mols;
      try {
        mols = await global.V3Selection.resolve(sel, {
          niveau_min: ctx.meta.niveau_min,
          niveau_max: ctx.meta.niveau_max,
        });
      } catch (e) {
        U.toast(e.message || 'Erreur', 'err');
        return;
      }
      mols = mols.filter(function (m) { return !m.vide; });
      if (!mols.length) {
        U.toast('Aucune molécule', 'err');
        return;
      }
      const props = [];
      if (mode === 'classement') {
        if (importKind === 'mol_items') {
          mols.forEach(function (m) {
            props.push({
              kind: 'mol_item',
              zoneId: targetZoneId,
              label: m.dci || m.noms[0] || '—',
              matrice_id: m.id,
              checked: true,
              display: (m.dci || '—') + ' → ' + ((zones.find(function (z) { return z.id === targetZoneId; }) || {}).label || 'zone'),
            });
          });
        } else if (importKind === 'field_items') {
          mols.forEach(function (m) {
            const vals = C.valeurs(m, champCode);
            if (!vals.length) return;
            vals.forEach(function (v, vi) {
              props.push({
                kind: 'mol_item',
                zoneId: targetZoneId,
                label: String(v).trim(),
                matrice_id: null,
                checked: vi === 0,
                display: (m.dci || '—') + ' · ' + v,
              });
            });
          });
        } else if (importKind === 'zones_field') {
          const bundles = {};
          mols.forEach(function (m) {
            const vals = C.valeurs(m, champCode);
            const val = vals.length ? String(vals[0]).trim() : 'Autre';
            const key = norm(val);
            bundles[key] = bundles[key] || { zoneLabel: val, items: [] };
            bundles[key].items.push({ label: m.dci || '—', matrice_id: m.id });
          });
          Object.keys(bundles).forEach(function (k) {
            const b = bundles[k];
            props.push({
              kind: 'zone_bundle',
              zoneLabel: b.zoneLabel,
              items: b.items,
              checked: true,
              display: b.zoneLabel + ' (' + b.items.length + ' mol.)',
            });
          });
        }
      } else if (importKind === 'mol_g' || importKind === 'mol_d') {
        const side = importKind === 'mol_d' ? 'd' : 'g';
        mols.forEach(function (m) {
          props.push({
            kind: 'side_item',
            side: side,
            label: m.dci || '—',
            matrice_id: m.id,
            checked: true,
            display: m.dci || '—',
          });
        });
      } else if (importKind === 'field_d') {
        mols.forEach(function (m) {
          const vals = C.valeurs(m, champCode);
          if (!vals.length) return;
          props.push({
            kind: 'side_item',
            side: 'd',
            label: String(vals[0]).trim(),
            matrice_id: null,
            checked: true,
            display: (m.dci || '—') + ' → ' + vals[0],
          });
        });
      } else if (importKind === 'propose') {
        const usedRight = {};
        syncAppariementRows(zones);
        for (let i = 0; i < rowCount(zones); i += 1) {
          const gl = trim(zones[0].items[i] && zones[0].items[i].label);
          const dl = trim(zones[1].items[i] && zones[1].items[i].label);
          if (dl) usedRight[norm(dl)] = true;
          if (!gl) continue;
          const mol = mols.find(function (m) { return norm(m.dci) === norm(gl); })
            || mols.find(function (m) { return (m.noms || []).some(function (n) { return norm(n) === norm(gl); }); });
          if (!mol) {
            props.push({
              skip: true,
              display: gl + ' — gauche non reconnue',
              checked: false,
            });
            continue;
          }
          const vals = C.valeurs(mol, champCode);
          if (!vals.length) {
            props.push({
              skip: true,
              display: gl + ' — pas de valeur',
              checked: false,
            });
            continue;
          }
          const val = String(vals[0]).trim();
          const conflict = !!usedRight[norm(val)];
          if (!conflict) usedRight[norm(val)] = true;
          props.push({
            kind: 'app_row',
            rowIndex: i,
            gLabel: gl,
            dLabel: val,
            matrice_id: mol.id,
            checked: !conflict && !dl,
            conflict: conflict,
            display: gl + ' ↔ ' + val + (conflict ? ' (conflit)' : ''),
          });
        }
      }
      if (!props.length) {
        U.toast('Rien à proposer', 'err');
        return;
      }
      api.propose(props.map(function (p) {
        if (p.skip) {
          return { label: p.display, value: p, checked: false };
        }
        return {
          label: p.display || p.label || '—',
          value: p,
          checked: p.checked !== false && !p.conflict,
        };
      }));
    }

    const shell = h('div', { class: 'v3-zones-shell' }, ad.el, countEl, gridHost);
    el.replaceChildren(shell);
    paintGrid();

    return {
      getZones: function () { return copyZones(zones); },
      setZones: function (z) {
        zones = copyZones(z);
        if (mode === 'appariement') syncAppariementRows(zones);
        if (ad.el.querySelector('.v3-adder-draft') && ad.el.querySelector('.v3-adder-draft')._fillZones) {
          ad.el.querySelector('.v3-adder-draft')._fillZones();
        }
        paintGrid();
      },
      refresh: paintGrid,
      destroy: function () {
        if (selApi) { selApi.destroy(); selApi = null; }
        el.replaceChildren();
      },
    };
  }

  global.V3Zones = {
    uid: uid,
    copyZones: copyZones,
    fromClassement: fromClassement,
    toClassement: toClassement,
    fromAppariement: fromAppariement,
    toAppariement: toAppariement,
    editor: editor,
    molsForCtx: molsForCtx,
    syncAppariementRows: syncAppariementRows,
    rowCount: rowCount,
  };
})(window);
