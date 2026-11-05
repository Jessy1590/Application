/* Éditeur partagé classement / appariement (wizard étapes 3–4). */
(function (global) {
  const U = global.V3UI;
  const Z = global.V3Zones;
  const C = global.V3Champs;
  const h = U.h;
  const txt = U.txt;

  function trim(s) {
    return txt(s).trim();
  }

  function lab(v, fallback) {
    const s = trim(v);
    return s || fallback || '';
  }

  function molLabel(m) {
    if (!m) return '';
    return lab(m.dci) || lab((m.noms && m.noms[0]) || '') || '';
  }

  function playable(mols) {
    return (mols || []).filter(function (m) { return m && !m.vide; });
  }

  function valuesOf(mol, code) {
    const fromChamp = (C.valeurs(mol, code) || []).map(txt).map(function (s) { return s.trim(); }).filter(Boolean);
    if (fromChamp.length) return fromChamp;
    if (code === 'dci') {
      const d = lab(mol.dci);
      return d ? [d] : [];
    }
    if (code === 'nom_commercial') {
      return (mol.noms || []).map(txt).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return [];
  }

  function champOptions(mols) {
    const list = C.list || [];
    const by = {};
    list.forEach(function (c) { by[c.code] = c; });
    const codes = C.presents(mols) || [];
    if (codes.indexOf('dci') < 0 && (mols || []).some(function (m) { return lab(m.dci); })) {
      codes.unshift('dci');
    }
    if (codes.indexOf('nom_commercial') < 0 && (mols || []).some(function (m) { return (m.noms || []).length; })) {
      const i = codes.indexOf('dci') >= 0 ? codes.indexOf('dci') + 1 : 0;
      codes.splice(i, 0, 'nom_commercial');
    }
    const fallback = ['dci', 'nom_commercial', 'secteur_therapeutique', 'classe_therapeutique', 'classe_pharmacologique', 'indications', 'contre_indications', 'effets_indesirables', 'precautions_emploi', 'interactions', 'surveillances', 'conditions_prescription_delivrance', 'conseils_delivrance'];
    fallback.forEach(function (code) {
      if (codes.indexOf(code) < 0 && by[code]) codes.push(code);
    });
    const seen = {};
    return codes.map(function (code) {
      if (seen[code]) return null;
      seen[code] = true;
      return by[code] || { code: code, label: code, court: code };
    }).filter(Boolean);
  }

  function emptyItem() {
    return { id: Z.uid('i'), label: '', matrice_id: null };
  }

  function emptyZone(n) {
    return { id: Z.uid('z'), label: 'Zone ' + n, items: [emptyItem()] };
  }

  function filledCount(z) {
    return (z.items || []).filter(function (it) { return trim(it.label); }).length;
  }

  function totalFilled(zones) {
    let n = 0;
    (zones || []).forEach(function (z) { n += filledCount(z); });
    return n;
  }

  function compactItems(z) {
    const kept = (z.items || []).filter(function (it) { return trim(it.label); });
    z.items = kept.length ? kept : [emptyItem()];
  }

  function resizeZones(zones, n) {
    n = Math.max(2, Math.min(12, Number(n) || 2));
    while (zones.length < n) zones.push(emptyZone(zones.length + 1));
    while (zones.length > n) {
      const z = zones[zones.length - 1];
      if (filledCount(z)) break;
      zones.pop();
    }
    return zones.length;
  }

  function ensureAppariement(zones) {
    if (!Array.isArray(zones) || zones.length !== 2) {
      return [
        { id: Z.uid('z'), label: 'Gauche', items: [emptyItem()] },
        { id: Z.uid('z'), label: 'Droite', items: [emptyItem()] },
      ];
    }
    Z.syncAppariementRows(zones);
    zones.forEach(function (z) {
      if (!(z.items || []).length) z.items = [emptyItem()];
    });
    return zones;
  }

  function itemKey(it) {
    return (it.matrice_id ? String(it.matrice_id) : '') + '|' + (global.V3Data.norm ? global.V3Data.norm(it.label) : trim(it.label).toLowerCase());
  }

  function usedKeys(zones) {
    const set = {};
    (zones || []).forEach(function (z) {
      (z.items || []).forEach(function (it) {
        if (!trim(it.label)) return;
        set[itemKey(it)] = true;
      });
    });
    return set;
  }

  function shuffle(arr) {
    const a = (arr || []).slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function editor(el, opts) {
    opts = opts || {};
    const mode = opts.mode === 'appariement' ? 'appariement' : 'classement';
    let zones = Z.copyZones(opts.zones || []);
    if (mode === 'appariement') zones = ensureAppariement(zones);
    else {
      if (zones.length < 2) {
        while (zones.length < 2) zones.push(emptyZone(zones.length + 1));
      }
      zones.forEach(function (z, i) {
        if (!z.id) z.id = Z.uid('z');
        if (!z.label) z.label = 'Zone ' + (i + 1);
        if (!Array.isArray(z.items) || !z.items.length) z.items = [emptyItem()];
      });
    }

    const ctx = opts.ctx;
    let view = totalFilled(zones) > 0 ? 'assoc' : 'import';
    let champCode = 'classe_therapeutique';
    let targetZoneId = zones[0] && zones[0].id;
    let targetSide = 'g';
    let pickMode = 'tirage';
    let tirageN = 4;
    let pending = null;
    let chosen = {};
    let freeText = '';
    let assocVal = '';
    let assocElem = '';
    let molsCache = [];
    let champs = [];
    let molById = {};
    let draftApi = null;
    let draftHost = null;
    let filterApi = null;
    let extraHost = null;
    let champHost = null;
    let filterHost = null;
    let freeInp = null;
    let assocInp = null;
    let assocElemInp = null;
    let draftBuilt = false;
    let destroyed = false;
    let poolLoading = true;

    const importPanel = h('div', { class: 'v3-zshare-import' });
    const assocTools = h('div', { class: 'v3-zshare-assoc-tools v3-row' });
    const gridHost = h('div', { class: 'v3-zshare-grid' });
    const countEl = h('p', { class: 'v3-zshare-count v3-muted' });
    const poolHint = h('p', { class: 'v3-hint' });

    function emit() {
      if (opts.onChange) opts.onChange(Z.copyZones(zones));
    }

    function paintCount() {
      if (mode === 'appariement') {
        Z.syncAppariementRows(zones);
        const n = Z.rowCount(zones);
        let ok = 0;
        for (let i = 0; i < n; i += 1) {
          if (trim(zones[0].items[i] && zones[0].items[i].label) && trim(zones[1].items[i] && zones[1].items[i].label)) ok += 1;
        }
        countEl.textContent = ok + ' paire' + (ok !== 1 ? 's' : '') + ' · ' + n + ' ligne' + (n !== 1 ? 's' : '');
      } else {
        countEl.textContent = totalFilled(zones) + ' item' + (totalFilled(zones) !== 1 ? 's' : '') + ' · ' + zones.length + ' zone' + (zones.length !== 1 ? 's' : '');
      }
    }

    function paintGrid() {
      gridHost.replaceChildren();
      if (mode === 'appariement') {
        Z.syncAppariementRows(zones);
        const head = h('div', { class: 'v3-zshare-app-head' });
        zones.forEach(function (z, zi) {
          const title = h('input', {
            class: 'v3-ctrl v3-zshare-title',
            value: lab(z.label),
            'aria-label': zi === 0 ? 'Zone gauche' : 'Zone droite',
          });
          title.addEventListener('input', function () {
            z.label = title.value;
            emit();
            paintCount();
          });
          head.appendChild(h('div', { class: 'v3-zshare-col-head' }, title));
        });
        const body = h('div', { class: 'v3-zshare-app-rows' });
        const n = Z.rowCount(zones);
        for (let ri = 0; ri < n; ri += 1) {
          const row = h('div', { class: 'v3-zshare-app-row' });
          zones.forEach(function (z, zi) {
            const it = z.items[ri] || emptyItem();
            if (!z.items[ri]) z.items[ri] = it;
            const inp = h('input', {
              class: 'v3-ctrl',
              value: lab(it.label),
              'aria-label': (zi === 0 ? 'Gauche' : 'Droite') + ' ligne ' + (ri + 1),
            });
            inp.addEventListener('input', function () {
              it.label = inp.value;
              emit();
            });
            row.appendChild(inp);
          });
          row.appendChild(h('div', { class: 'v3-zshare-row-act' },
            U.button('×', {
              variant: 'ghost',
              disabled: n <= 1,
              onClick: function () {
                Z.syncAppariementRows(zones);
                zones.forEach(function (z) {
                  if (ri >= 0 && ri < z.items.length) z.items.splice(ri, 1);
                });
                if (!Z.rowCount(zones)) {
                  zones[0].items.push(emptyItem());
                  zones[1].items.push(emptyItem());
                }
                paintGrid();
                emit();
              },
            })
          ));
          body.appendChild(row);
        }
        gridHost.append(
          head,
          body,
          h('div', { class: 'v3-actions' },
            U.button('+ Ligne', {
              variant: 'ghost',
              onClick: function () {
                zones[0].items.push(emptyItem());
                zones[1].items.push(emptyItem());
                paintGrid();
                emit();
              },
            })
          )
        );
      } else {
        const cols = h('div', { class: 'v3-zshare-cols' });
        zones.forEach(function (z, zi) {
          const title = h('input', {
            class: 'v3-ctrl v3-zshare-title',
            value: lab(z.label),
            'aria-label': 'Libellé zone ' + (zi + 1),
          });
          title.addEventListener('input', function () {
            z.label = title.value;
            emit();
            paintCount();
          });
          const list = h('div', { class: 'v3-zshare-items' });
          (z.items || []).forEach(function (it, ii) {
            const inp = h('input', {
              class: 'v3-ctrl',
              value: lab(it.label),
              'aria-label': 'Item',
            });
            inp.addEventListener('input', function () {
              it.label = inp.value;
              emit();
            });
            list.appendChild(h('div', { class: 'v3-zshare-item' },
              inp,
              U.button('×', {
                variant: 'ghost',
                onClick: function () {
                  z.items.splice(ii, 1);
                  if (!z.items.length) z.items.push(emptyItem());
                  paintGrid();
                  emit();
                },
              })
            ));
          });
          const addIn = h('input', {
            class: 'v3-ctrl v3-zshare-add',
            placeholder: '+ item',
            'aria-label': 'Nouvel item',
          });
          addIn.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter') return;
            ev.preventDefault();
            const v = trim(addIn.value);
            if (!v) return;
            z.items.push({ id: Z.uid('i'), label: v, matrice_id: null });
            addIn.value = '';
            paintGrid();
            emit();
          });
          cols.appendChild(h('div', { class: 'v3-zshare-col' },
            h('div', { class: 'v3-zshare-col-head' },
              title,
              U.button('×', {
                variant: 'ghost',
                disabled: zones.length <= 2,
                onClick: function () {
                  if (zones.length <= 2) { U.toast('Minimum 2 zones', 'err'); return; }
                  if (filledCount(z)) { U.toast('Videz la zone d’abord', 'err'); return; }
                  zones = zones.filter(function (x) { return x.id !== z.id; });
                  if (targetZoneId === z.id) targetZoneId = zones[0] && zones[0].id;
                  paintDraft();
                  paintGrid();
                  emit();
                },
              })
            ),
            list,
            addIn
          ));
        });
        gridHost.append(cols);
      }
      paintCount();
    }

    function zoneForValue(value) {
      const n = global.V3Data.norm(value);
      let z = zones.find(function (x) { return global.V3Data.norm(x.label) === n; });
      if (z) return z;
      z = zones.find(function (x) { return !filledCount(x); });
      if (z) {
        z.label = value;
        compactItems(z);
        return z;
      }
      if (zones.length >= 12) return zones[zones.length - 1];
      z = { id: Z.uid('z'), label: value, items: [] };
      zones.push(z);
      return z;
    }

    function pushItem(z, label, matriceId) {
      if (!z || !trim(label)) return;
      const empty = (z.items || []).find(function (it) { return !trim(it.label); });
      if (empty) {
        empty.label = label;
        empty.matrice_id = matriceId || null;
        return;
      }
      z.items.push({ id: Z.uid('i'), label: label, matrice_id: matriceId || null });
    }

    function applyPicked(list) {
      (list || []).forEach(function (p) {
        if (!p || p.skip) return;
        if (p.kind === 'mol_item') {
          const z = zones.find(function (x) { return x.id === p.zoneId; }) || zones[0];
          pushItem(z, lab(p.label), p.matrice_id);
        } else if (p.kind === 'assoc_cls') {
          const z = zoneForValue(lab(p.valueLabel));
          pushItem(z, lab(p.molLabel), p.matrice_id);
        } else if (p.kind === 'app_row') {
          Z.syncAppariementRows(zones);
          let slot = -1;
          for (let i = 0; i < Z.rowCount(zones); i += 1) {
            if (!trim(zones[0].items[i].label) && !trim(zones[1].items[i].label)) { slot = i; break; }
          }
          if (slot < 0) {
            zones[0].items.push(emptyItem());
            zones[1].items.push(emptyItem());
            slot = Z.rowCount(zones) - 1;
          }
          zones[0].items[slot].label = lab(p.gLabel);
          zones[0].items[slot].matrice_id = p.matrice_id || null;
          zones[1].items[slot].label = lab(p.dLabel);
        } else if (p.kind === 'side_item') {
          const zi = p.side === 'd' ? 1 : 0;
          Z.syncAppariementRows(zones);
          let slot = -1;
          for (let i = 0; i < Z.rowCount(zones); i += 1) {
            if (!trim(zones[zi].items[i].label)) { slot = i; break; }
          }
          if (slot < 0) {
            zones[0].items.push(emptyItem());
            zones[1].items.push(emptyItem());
            slot = Z.rowCount(zones) - 1;
          }
          zones[zi].items[slot].label = lab(p.label);
          zones[zi].items[slot].matrice_id = p.matrice_id || null;
        }
      });
      if (mode === 'appariement') Z.syncAppariementRows(zones);
    }

    function molsOfPending() {
      if (!pending) return [];
      if (pending.molecules && pending.molecules.length) {
        return pending.molecules.map(function (m) {
          return molById[String(m.id)] || { id: m.id, dci: m.label, noms: [], vide: false };
        }).filter(function (m) { return m && !m.vide; });
      }
      return [];
    }

    function selectedMols() {
      const list = molsOfPending();
      if (pending && pending.kind === 'molecule') return list.slice(0, 1);
      if (pickMode === 'choix') {
        return list.filter(function (m) { return chosen[String(m.id)]; });
      }
      const n = Math.max(1, Math.min(list.length, Number(tirageN) || list.length));
      return shuffle(list).slice(0, n);
    }

    function champSelect() {
      const sel = h('select', { class: 'v3-ctrl', 'aria-label': 'Type d’import' });
      const opts = champs.length ? champs : champOptions([]);
      if (!opts.length) {
        sel.appendChild(h('option', { value: '' }, 'Aucune valeur'));
        sel.disabled = true;
        return sel;
      }
      opts.forEach(function (c) {
        sel.appendChild(h('option', { value: c.code }, lab(c.label) || lab(c.court) || c.code));
      });
      if (!opts.some(function (c) { return c.code === champCode; })) champCode = opts[0].code;
      sel.value = champCode;
      sel.addEventListener('change', function () { champCode = sel.value; });
      return sel;
    }

    function zoneSelect() {
      const sel = h('select', { class: 'v3-ctrl', 'aria-label': 'Zone cible' });
      zones.forEach(function (z) {
        sel.appendChild(h('option', { value: z.id }, lab(z.label) || 'Zone'));
      });
      if (!zones.some(function (z) { return z.id === targetZoneId; })) targetZoneId = zones[0] && zones[0].id;
      sel.value = targetZoneId || '';
      sel.addEventListener('change', function () { targetZoneId = sel.value; });
      return sel;
    }

    function syncDraftReady() {
      if (!draftApi) return;
      if (trim(freeText)) {
        draftApi.setDraftReady(true);
        return;
      }
      if (!pending) {
        draftApi.setDraftReady(false);
        return;
      }
      draftApi.setDraftReady(selectedMols().length > 0);
    }

    function paintPhase1Extra(host) {
      if (!host) return;
      if (!pending) {
        host.replaceChildren();
        return;
      }
      const kids = [];
      if (mode === 'classement') {
        kids.push(U.field('Zone', zoneSelect(), { tip: 'Destination des molécules.' }));
      } else {
        kids.push(U.field('Colonne', U.segmented([
          { value: 'g', label: lab(zones[0] && zones[0].label) || 'Gauche' },
          { value: 'd', label: lab(zones[1] && zones[1].label) || 'Droite' },
        ], targetSide, function (v) { targetSide = v; }), { tip: 'Côté d’import.' }));
      }
      const mols = molsOfPending();
      if (pending.kind === 'lecon' || pending.kind === 'chapitre' || pending.kind === 'bloc') {
        kids.push(U.field('Ajout', U.segmented([
          { value: 'tirage', label: 'Tirage', tip: 'Nombre de molécules tirées au hasard.' },
          { value: 'choix', label: 'Choisir', tip: 'Sélection une par une.' },
        ], pickMode, function (v) {
          pickMode = v;
          paintPhase1Extra(extraHost);
          syncDraftReady();
        }), { tip: 'Tirage ou sélection manuelle.' }));
        if (pickMode === 'tirage') {
          kids.push(U.field('Nombre', U.number(Math.min(tirageN, Math.max(1, mols.length)), {
            min: 1,
            max: Math.max(1, mols.length),
            label: 'Nombre',
            onChange: function (v) { tirageN = v; syncDraftReady(); },
          }), { tip: 'Molécules affichées dans la zone.' }));
        } else {
          const wrap = h('div', { class: 'v3-checks' });
          mols.forEach(function (m) {
            const id = String(m.id);
            const box = h('input', { type: 'checkbox', checked: !!chosen[id] });
            box.addEventListener('change', function () {
              chosen[id] = box.checked;
              syncDraftReady();
            });
            wrap.appendChild(h('label', { class: 'v3-check' }, box, molLabel(m) || id));
          });
          kids.push(U.field('Molécules', wrap, { col: true }));
        }
      }
      kids.push(h('p', { class: 'v3-hint' },
        (lab(pending.label) || 'Élément') + ' · ' + mols.length + ' molécule' + (mols.length > 1 ? 's' : '')
      ));
      host.replaceChildren.apply(host, kids);
    }

    function onPickFilter(item) {
      pending = item;
      chosen = {};
      pickMode = 'tirage';
      tirageN = Math.min(4, Math.max(1, (item.molecules || []).length || 1));
      (item.molecules || []).forEach(function (m) { chosen[String(m.id)] = true; });
      paintPhase1Extra(extraHost);
      syncDraftReady();
    }

    function paintDraft() {
      if (!draftHost || !draftApi) return;
      if (!draftBuilt) {
        champHost = h('div');
        filterHost = h('div');
        extraHost = h('div', { class: 'v3-zshare-phase1' });
        freeInp = h('input', {
          class: 'v3-ctrl',
          value: freeText,
          placeholder: 'Autre libellé / texte libre',
          'aria-label': 'Texte libre',
        });
        freeInp.addEventListener('input', function () {
          freeText = freeInp.value;
          syncDraftReady();
        });
        assocInp = h('input', {
          class: 'v3-ctrl',
          value: assocVal,
          placeholder: 'Valeur ou texte libre',
          'aria-label': 'Association',
        });
        assocInp.addEventListener('input', function () { assocVal = assocInp.value; });
        assocElemInp = h('input', {
          class: 'v3-ctrl',
          value: assocElem,
          placeholder: 'Molécule ou texte libre',
          'aria-label': 'Élément associé',
        });
        assocElemInp.addEventListener('input', function () { assocElem = assocElemInp.value; });
        const phase2 = h('div', { class: 'v3-zshare-phase2 v3-card-body' },
          h('h3', { class: 'v3-card-title' }, 'Association'),
          U.field('Association', assocInp, { tip: 'Valeur associée (classe, indication…) ou saisie libre.' }),
          U.field('Élément associé', assocElemInp, { tip: 'Élément relié à l’association, ou texte libre.' }),
          U.button('Importer', {
            variant: 'primary',
            onClick: function () { doImport(); },
          })
        );
        draftHost.replaceChildren(
          poolHint,
          U.field('Type d’import', champHost, {
            tip: 'Type de valeur : DCI, nom commercial, secteur, classes, indications, CI, EI…',
          }),
          filterHost,
          extraHost,
          U.field('Autre', freeInp, { tip: 'Ajouter un libellé hors pool.' }),
          phase2
        );
        if (global.V3SelFilter && ctx) {
          filterApi = global.V3SelFilter.mount(filterHost, {
            pool: function () { return ctx.poolSel ? ctx.poolSel() : (ctx.meta && ctx.meta.selection); },
            onPick: onPickFilter,
          });
        }
        draftBuilt = true;
      }
      if (champHost) champHost.replaceChildren(champSelect());
      paintPhase1Extra(extraHost);
      if (freeInp) freeInp.value = freeText;
      if (assocInp) assocInp.value = assocVal;
      if (assocElemInp) assocElemInp.value = assocElem;
      syncDraftReady();
    }

    function applyPendingToZones() {
      const mols = selectedMols();
      if (!mols.length && !trim(freeText)) return false;
      if (trim(freeText) && !mols.length) {
        if (mode === 'appariement') {
          applyPicked([{ kind: 'side_item', side: targetSide, label: trim(freeText), matrice_id: null }]);
        } else {
          applyPicked([{ kind: 'mol_item', zoneId: targetZoneId, label: trim(freeText), matrice_id: null }]);
        }
        freeText = '';
        return true;
      }
      mols.forEach(function (m) {
        const label = molLabel(m) || lab(m.id);
        if (!label) return;
        if (mode === 'appariement') {
          applyPicked([{ kind: 'side_item', side: targetSide, label: label, matrice_id: m.id }]);
        } else {
          applyPicked([{ kind: 'mol_item', zoneId: targetZoneId, label: label, matrice_id: m.id }]);
        }
      });
      return true;
    }

    function doImport() {
      const a = trim(assocVal);
      const e = trim(assocElem);
      if (a && e) {
        if (mode === 'appariement') {
          applyPicked([{ kind: 'app_row', gLabel: e, dLabel: a, matrice_id: null }]);
        } else {
          applyPicked([{ kind: 'assoc_cls', molLabel: e, valueLabel: a, matrice_id: null }]);
        }
      } else if (pending) {
        applyPendingToZones();
      } else if (trim(freeText)) {
        applyPendingToZones();
      } else if (!totalFilled(zones)) {
        U.toast('Rien à importer', 'err');
        return;
      }
      pending = null;
      freeText = '';
      assocVal = '';
      assocElem = '';
      view = 'assoc';
      paintView();
      paintGrid();
      emit();
    }

    function proposerAssociations() {
      const used = usedKeys(zones);
      let n = 0;
      molsCache.forEach(function (m) {
        const molLab = molLabel(m);
        if (!molLab) return;
        const vals = valuesOf(m, champCode);
        if (!vals.length) return;
        if (used[itemKey({ label: molLab, matrice_id: m.id })]) return;
        const val = vals[0];
        if (mode === 'appariement') {
          applyPicked([{ kind: 'app_row', gLabel: molLab, dLabel: val, matrice_id: m.id }]);
        } else {
          applyPicked([{ kind: 'assoc_cls', molLabel: molLab, valueLabel: val, matrice_id: m.id }]);
        }
        n += 1;
      });
      if (!n) U.toast('Aucune association à proposer', 'err');
      paintGrid();
      emit();
    }

    function clearAssociations() {
      zones.forEach(function (z) { z.items = [emptyItem()]; });
      if (mode === 'appariement') Z.syncAppariementRows(zones);
      paintGrid();
      emit();
    }

    function paintView() {
      importPanel.hidden = view !== 'import';
      assocTools.hidden = view !== 'assoc';
      listWrap.hidden = false;
    }

    const ad = U.adder({
      title: 'Importer',
      propose: false,
      items: function () { return []; },
      empty: '',
      draft: function (host, api) {
        draftHost = host;
        draftApi = api;
        paintDraft();
        api.setDraftReady(false);
      },
      renderItem: function () { return null; },
      onAdd: function () {
        if (!applyPendingToZones()) {
          U.toast('Choisir un élément du sélecteur ou un texte', 'err');
          return;
        }
        pending = null;
        freeText = '';
        if (freeInp) freeInp.value = '';
        if (nbWidget) {
          const input = nbWidget.querySelector('input');
          if (input && Number(input.value) !== zones.length) nbWidget.setValue(zones.length);
        }
        paintPhase1Extra(extraHost);
        syncDraftReady();
        paintGrid();
        emit();
      },
    });
    const listEl = ad.el.querySelector('.v3-adder-list');
    if (listEl) listEl.hidden = true;

    function setPoolHint(n, loading) {
      if (loading) {
        poolHint.textContent = '…';
        return;
      }
      if (!n) {
        poolHint.textContent = 'Choisir des molécules à l’étape 1.';
        return;
      }
      poolHint.textContent = n + ' molécule' + (n > 1 ? 's' : '') + ' du pool.';
    }

    function loadPool() {
      poolLoading = true;
      setPoolHint(0, true);
      if (!ctx || !ctx.mols) {
        poolLoading = false;
        setPoolHint(0, false);
        paintDraft();
        return;
      }
      ctx.mols().then(function (raw) {
        if (destroyed) return;
        molsCache = playable(raw);
        molById = {};
        molsCache.forEach(function (m) { molById[String(m.id)] = m; });
        champs = champOptions(molsCache);
        if (!champs.some(function (c) { return c.code === champCode; })) {
          const prefer = champs.filter(function (c) { return c.code === 'classe_therapeutique'; })[0]
            || champs.filter(function (c) { return !c.identite; })[0]
            || champs[0];
          champCode = prefer ? prefer.code : champCode;
        }
        poolLoading = false;
        setPoolHint(molsCache.length, false);
        paintDraft();
      }).catch(function (e) {
        if (destroyed) return;
        poolLoading = false;
        setPoolHint(0, false);
        U.toast((e && e.message) || 'Pool indisponible', 'err');
        paintDraft();
      });
    }

    assocTools.append(
      U.button('Enlever toutes les associations', {
        variant: 'ghost',
        onClick: function () { clearAssociations(); },
      }),
      U.button('Revenir à l’import', {
        variant: 'ghost',
        onClick: function () {
          view = 'import';
          paintView();
          paintDraft();
        },
      }),
      U.button('Proposer les associations', {
        variant: 'ghost',
        onClick: function () { proposerAssociations(); },
      })
    );

    const nbHost = h('div');
    let nbWidget = null;
    if (mode === 'classement') {
      const nb = U.number(zones.length, {
        min: 2,
        max: 12,
        label: 'Nombre de zones',
        onChange: function (v) {
          const before = zones.length;
          resizeZones(zones, v);
          if (zones.length === before && v < before) {
            U.toast('Videz une zone avant de la retirer', 'err');
            nb.setValue(zones.length);
            return;
          }
          if (!zones.some(function (z) { return z.id === targetZoneId; })) {
            targetZoneId = zones[0] && zones[0].id;
          }
          paintDraft();
          paintGrid();
          emit();
        },
      });
      nbWidget = nb;
      nbHost.appendChild(U.field('Zones', nb, { tip: 'Colonnes du plateau (≥ 2).' }));
    }

    const listWrap = h('div', { class: 'v3-zshare-validated' },
      h('h3', { class: 'v3-card-title' }, mode === 'appariement' ? 'Paires' : 'Zones'),
      countEl,
      gridHost
    );
    importPanel.appendChild(ad.el);
    const shell = h('div', { class: 'v3-zshare' }, nbHost, importPanel, assocTools, listWrap);
    el.replaceChildren(shell);
    paintGrid();
    paintView();
    loadPool();

    return {
      getZones: function () { return Z.copyZones(zones); },
      setZoneCount: function (n) {
        resizeZones(zones, n);
        paintDraft();
        paintGrid();
        emit();
      },
      refresh: function () {
        paintGrid();
        loadPool();
      },
      destroy: function () {
        destroyed = true;
        if (filterApi) filterApi.destroy();
        el.replaceChildren();
      },
    };
  }

  global.V3ZonesShared = {
    editor: editor,
    resizeZones: resizeZones,
    molLabel: molLabel,
    playable: playable,
    valuesOf: valuesOf,
    champOptions: champOptions,
    lab: lab,
  };
})(window);
