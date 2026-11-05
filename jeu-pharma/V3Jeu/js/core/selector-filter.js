/* V3SelFilter — pastilles du pool étape 1 (leçons, chapitres, blocs molécule). */
(function (global) {
  const U = global.V3UI;
  const D = global.V3Data;
  const h = U.h;
  const txt = U.txt;

  function asSel(pool) {
    if (typeof pool === 'function') pool = pool();
    return global.V3Selection.copy(pool);
  }

  function visibleIds(bloc) {
    const hide = {};
    (bloc.masqueIds || []).forEach(function (id) { hide[String(id)] = true; });
    return (bloc.matriceIds || []).filter(function (id) { return !hide[String(id)]; }).map(String);
  }

  function uniqIds(list) {
    const seen = {};
    const out = [];
    (list || []).forEach(function (id) {
      const k = String(id);
      if (!k || seen[k]) return;
      seen[k] = true;
      out.push(k);
    });
    return out;
  }

  async function labelsOf(ids) {
    const uniq = uniqIds(ids);
    if (!uniq.length) return [];
    const rows = await D.fiches(uniq);
    const by = {};
    (rows || []).forEach(function (r) {
      by[String(r.id)] = txt(r.dci) || txt(r.nom_commercial) || String(r.id);
    });
    return uniq.map(function (id) {
      return { id: id, label: by[id] || id };
    });
  }

  async function itemsFromPool(pool) {
    const s = asSel(pool);
    const chapIds = (s.chapitre_ids || []).map(String);
    const lecIds = (s.module_ids || []).map(String);
    const blocIds = (s.bloc_ids || []).map(String);
    const molIds = (s.matrice_ids || []).map(String);
    if (!chapIds.length && !lecIds.length && !blocIds.length && !molIds.length) return [];

    const [lessons, chapters, blocks] = await Promise.all([D.lessons(), D.chapters(), D.blocks()]);
    const lecBy = {};
    (lessons || []).forEach(function (l) { lecBy[String(l.id)] = l; });
    const chapBy = {};
    (chapters || []).forEach(function (c) { chapBy[String(c.id)] = c; });
    const blocBy = {};
    (blocks || []).forEach(function (b) { blocBy[String(b.id)] = b; });

    const coveredLessons = {};
    chapIds.forEach(function (cid) {
      const ch = chapBy[cid];
      (ch && ch.lessonIds || []).forEach(function (id) { coveredLessons[String(id)] = true; });
    });

    const groupBlocs = [];
    function blocsOfModules(moduleIds) {
      const set = {};
      (moduleIds || []).forEach(function (id) { set[String(id)] = true; });
      return (blocks || []).filter(function (b) { return set[String(b.moduleId)]; });
    }

    const items = [];

    for (let i = 0; i < chapIds.length; i += 1) {
      const cid = chapIds[i];
      const ch = chapBy[cid];
      const lessonIds = (ch && ch.lessonIds) || [];
      const blocs = blocsOfModules(lessonIds);
      groupBlocs.push.apply(groupBlocs, blocs);
      items.push({
        kind: 'chapitre',
        id: cid,
        label: txt(ch && ch.label) || 'Chapitre',
        lessonIds: lessonIds.slice(),
        blocIds: blocs.map(function (b) { return b.id; }),
        molecules: await labelsOf(blocs.reduce(function (acc, b) {
          return acc.concat(visibleIds(b));
        }, [])),
      });
    }

    for (let i = 0; i < lecIds.length; i += 1) {
      const lid = lecIds[i];
      if (coveredLessons[lid]) continue;
      const lec = lecBy[lid];
      const blocs = blocsOfModules([lid]);
      groupBlocs.push.apply(groupBlocs, blocs);
      items.push({
        kind: 'lecon',
        id: lid,
        label: txt(lec && lec.label) || 'Leçon',
        lessonIds: [lid],
        blocIds: blocs.map(function (b) { return b.id; }),
        molecules: await labelsOf(blocs.reduce(function (acc, b) {
          return acc.concat(visibleIds(b));
        }, [])),
      });
    }

    const shownBlocs = {};
    if (chapIds.length || lecIds.length) {
      groupBlocs.forEach(function (b) {
        const bid = String(b.id);
        if (shownBlocs[bid]) return;
        shownBlocs[bid] = true;
        items.push({
          kind: 'bloc',
          id: bid,
          label: txt(b.label) || 'Bloc',
          lessonIds: b.moduleId ? [String(b.moduleId)] : [],
          blocIds: [bid],
          molecules: null,
          _molIds: visibleIds(b),
        });
      });
    }

    blocIds.forEach(function (bid) {
      if (shownBlocs[bid]) return;
      const b = blocBy[bid];
      shownBlocs[bid] = true;
      items.push({
        kind: 'bloc',
        id: bid,
        label: txt(b && b.label) || 'Bloc',
        lessonIds: b && b.moduleId ? [String(b.moduleId)] : [],
        blocIds: [bid],
        molecules: null,
        _molIds: b ? visibleIds(b) : [],
      });
    });

    const pending = items.filter(function (it) { return it.molecules == null; });
    const allMolIds = pending.reduce(function (acc, it) {
      return acc.concat(it._molIds || []);
    }, molIds.slice());
    const molLabs = await labelsOf(allMolIds);
    const molBy = {};
    molLabs.forEach(function (m) { molBy[m.id] = m; });

    pending.forEach(function (it) {
      it.molecules = uniqIds(it._molIds).map(function (id) {
        return molBy[id] || { id: id, label: id };
      });
      delete it._molIds;
    });

    const seenMol = {};
    items.forEach(function (it) {
      (it.molecules || []).forEach(function (m) { seenMol[String(m.id)] = true; });
    });
    molIds.forEach(function (id) {
      if (seenMol[id]) return;
      seenMol[id] = true;
      items.push({
        kind: 'molecule',
        id: id,
        label: (molBy[id] && molBy[id].label) || id,
        lessonIds: [],
        blocIds: [],
        molecules: [molBy[id] || { id: id, label: id }],
      });
    });

    return items;
  }

  function mount(container, opts) {
    opts = opts || {};
    const chips = h('div', { class: 'v3-sel-filter-chips v3-chips' });
    const root = h('div', { class: 'v3-sel-filter' },
      h('div', { class: 'v3-sel-filter-lab' }, txt(opts.title) || 'Filtre du sélecteur'),
      chips
    );
    container.replaceChildren(root);
    let destroyed = false;
    let seq = 0;

    function paint(items) {
      chips.replaceChildren();
      if (!items || !items.length) {
        chips.appendChild(h('p', { class: 'v3-hint' }, opts.empty || 'Aucun élément dans le sélecteur'));
        return;
      }
      items.forEach(function (it) {
        chips.appendChild(h('button', {
          type: 'button',
          class: 'v3-chip v3-chip-' + (it.kind === 'bloc' ? 'bloc' : (it.kind || 'molecule')) + ' v3-sel-filter-chip',
          onClick: function () {
            if (opts.onPick) opts.onPick(it);
          },
        }, h('span', null, it.label || '—')));
      });
    }

    async function refresh(nextPool) {
      if (nextPool != null) opts.pool = nextPool;
      const token = ++seq;
      paint(null);
      chips.replaceChildren(h('p', { class: 'v3-hint' }, '…'));
      try {
        const items = await itemsFromPool(opts.pool);
        if (destroyed || token !== seq) return items;
        paint(items);
        return items;
      } catch (e) {
        if (destroyed || token !== seq) return [];
        chips.replaceChildren(h('p', { class: 'v3-hint' }, (e && e.message) || 'Erreur'));
        return [];
      }
    }

    void refresh();
    return {
      refresh: refresh,
      destroy: function () {
        destroyed = true;
        container.replaceChildren();
      },
    };
  }

  global.V3SelFilter = {
    mount: mount,
    itemsFromPool: itemsFromPool,
  };
})(window);
