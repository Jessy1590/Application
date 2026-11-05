/* V3Selection — sélecteur universel + résolution en molécules. */
(function (global) {
  const U = global.V3UI;
  const D = global.V3Data;
  const C = global.V3Champs;
  const h = U.h;
  const txt = U.txt;

  const resolveCache = {};
  const nameCache = {};
  const FILTRE_KEYS = { secteur: 'secteur', classe_ther: 'classe_ther', classe_pharma: 'classe_pharma' };
  const FILTRE_LAB = { secteur: 'Secteur', classe_ther: 'Classe théra.', classe_pharma: 'Classe pharma.' };

  function empty() {
    return {
      module_ids: [],
      bloc_ids: [],
      matrice_ids: [],
      chapitre_ids: [],
      filtres: { secteur: [], classe_ther: [], classe_pharma: [] },
    };
  }

  function copy(sel) {
    const s = sel || empty();
    const f = s.filtres || {};
    const chapFromFiltres = Array.isArray(f.__chapitre_ids) ? f.__chapitre_ids : [];
    return {
      module_ids: (s.module_ids || []).slice(),
      bloc_ids: (s.bloc_ids || []).slice(),
      matrice_ids: (s.matrice_ids || []).slice(),
      chapitre_ids: (Array.isArray(s.chapitre_ids) ? s.chapitre_ids : chapFromFiltres).slice(),
      filtres: {
        secteur: (f.secteur || []).slice(),
        classe_ther: (f.classe_ther || []).slice(),
        classe_pharma: (f.classe_pharma || []).slice(),
      },
    };
  }

  function isEmpty(sel) {
    const s = sel || empty();
    const f = s.filtres || {};
    return !(s.module_ids || []).length
      && !(s.bloc_ids || []).length
      && !(s.matrice_ids || []).length
      && !(s.chapitre_ids || []).length
      && !(f.secteur || []).length
      && !(f.classe_ther || []).length
      && !(f.classe_pharma || []).length;
  }

  function keyOf(sel, opts) {
    opts = opts || {};
    return JSON.stringify(copy(sel)) + '|' + (Number(opts.niveau_min) || 1) + '|' + (Number(opts.niveau_max) || 5);
  }

  function starPair(min, max) {
    let a = Math.min(5, Math.max(1, Number(min) || 1));
    let b = Math.min(5, Math.max(1, Number(max) || 5));
    if (a > b) b = a;
    return [a, b];
  }

  function rangesCross(aMin, aMax, bMin, bMax) {
    const pa = starPair(aMin, aMax);
    const pb = starPair(bMin, bMax);
    return pa[0] <= pb[1] && pb[0] <= pa[1];
  }

  function texts(v) {
    if (v == null || v === '') return [];
    if (typeof v === 'string') {
      const t = txt(v);
      return t ? [t] : [];
    }
    if (Array.isArray(v)) {
      return v.map(function (x) {
        if (typeof x === 'string') return txt(x);
        return txt((x && (x.valeur || x.label || x.texte)) || '');
      }).filter(Boolean);
    }
    return [];
  }

  async function blocsOfLesson(moduleId) {
    if (!moduleId) return [];
    const list = await D.blocks();
    return list.filter(function (b) { return String(b.moduleId) === String(moduleId); });
  }

  async function blocsOfChapter(chapterId) {
    if (!chapterId) return [];
    const chaps = await D.chapters();
    const ch = chaps.filter(function (c) { return String(c.id) === String(chapterId); })[0];
    if (!ch) return [];
    const set = {};
    (ch.lessonIds || []).forEach(function (id) { set[String(id)] = true; });
    const list = await D.blocks();
    return list.filter(function (b) { return set[String(b.moduleId)]; });
  }

  async function selectionFromLesson(moduleId) {
    const sel = empty();
    if (!moduleId) return sel;
    sel.module_ids = [String(moduleId)];
    const blocs = await blocsOfLesson(moduleId);
    sel.bloc_ids = blocs.map(function (b) { return b.id; });
    return sel;
  }

  async function selectionFromChapter(chapterId) {
    const sel = empty();
    if (!chapterId) return sel;
    sel.chapitre_ids = [String(chapterId)];
    return sel;
  }

  async function lessonIdsOfChapters(chapitreIds) {
    const ids = (chapitreIds || []).filter(Boolean).map(String);
    if (!ids.length) return [];
    const chaps = await D.chapters();
    const out = [];
    const seen = {};
    ids.forEach(function (cid) {
      const ch = chaps.filter(function (c) { return String(c.id) === String(cid); })[0];
      (ch && ch.lessonIds || []).forEach(function (id) {
        const k = String(id);
        if (seen[k]) return;
        seen[k] = true;
        out.push(k);
      });
    });
    return out;
  }

  function hasSource(sel) {
    return (sel.module_ids || []).length
      + (sel.bloc_ids || []).length
      + (sel.matrice_ids || []).length
      + (sel.chapitre_ids || []).length > 0;
  }

  function matchFiltres(fiche, filtres) {
    const f = filtres || {};
    function ok(key, col) {
      const want = f[key] || [];
      if (!want.length) return true;
      const have = texts(fiche[col]).map(D.norm);
      return want.some(function (n) { return have.indexOf(D.norm(n)) >= 0; });
    }
    return ok('secteur', 'secteur_therapeutique')
      && ok('classe_ther', 'classe_therapeutique')
      && ok('classe_pharma', 'classe_pharmacologique');
  }

  function visibleIds(bloc) {
    const hide = new Set((bloc.masqueIds || []).map(String));
    return (bloc.matriceIds || []).filter(function (id) { return !hide.has(String(id)); });
  }

  async function resolve(sel, opts) {
    const s = copy(sel);
    opts = opts || {};
    const k = keyOf(s, opts);
    if (resolveCache[k]) return resolveCache[k];
    const p = doResolve(s, opts).catch(function (e) {
      delete resolveCache[k];
      throw e;
    });
    resolveCache[k] = p;
    return p;
  }

  async function doResolve(sel, opts) {
    opts = opts || {};
    const jeuMin = opts.niveau_min;
    const jeuMax = opts.niveau_max;
    const [allLessons, allBlocks] = await Promise.all([D.lessons(), D.blocks()]);
    const lessonBy = {};
    allLessons.forEach(function (l) { lessonBy[l.id] = l; });
    const blocBy = {};
    allBlocks.forEach(function (b) { blocBy[b.id] = b; });

    const molSet = new Set();
    const origine = {};
    const masked = new Set();
    const chapLessons = await lessonIdsOfChapters(sel.chapitre_ids);
    const concerned = new Set((sel.module_ids || []).concat(chapLessons).map(String));

    function addOrig(id, kind, srcId, srcLabel) {
      const k = String(id);
      molSet.add(k);
      (origine[k] = origine[k] || []).push({ kind: kind, id: srcId, label: srcLabel });
    }

    Array.from(concerned).forEach(function (lid) {
      const lecon = lessonBy[lid];
      const fromChap = chapLessons.indexOf(String(lid)) >= 0 && (sel.module_ids || []).indexOf(lid) < 0
        && (sel.module_ids || []).indexOf(String(lid)) < 0;
      const kind = fromChap ? 'chapitre' : 'lecon';
      const srcLabel = (lecon && lecon.label) || (fromChap ? 'Chapitre' : 'Leçon');
      allBlocks.forEach(function (b) {
        if (String(b.moduleId) !== String(lid)) return;
        (b.masqueIds || []).forEach(function (id) { masked.add(String(id)); });
        visibleIds(b).forEach(function (id) {
          addOrig(id, kind, lid, srcLabel);
        });
      });
    });

    (sel.bloc_ids || []).forEach(function (bid) {
      const b = blocBy[bid];
      if (!b) return;
      concerned.add(String(b.moduleId));
      (b.masqueIds || []).forEach(function (id) { masked.add(String(id)); });
      visibleIds(b).forEach(function (id) {
        addOrig(id, 'bloc', bid, b.label);
      });
    });

    (sel.matrice_ids || []).forEach(function (id) {
      addOrig(id, 'molecule', id, '');
    });

    const moduleIds = Array.from(concerned);
    let pubs = moduleIds.length ? await D.publications(moduleIds) : [];

    if (!hasSource(sel)) {
      const siteLessons = allLessons.map(function (l) { return l.id; });
      pubs = siteLessons.length ? await D.publications(siteLessons) : [];
      pubs.forEach(function (p) { molSet.add(String(p.matrice_id)); });
    } else {
      pubs.forEach(function (p) {
        const id = String(p.matrice_id);
        if (!molSet.has(id)) addOrig(id, 'lecon', p.module_id, (lessonBy[p.module_id] && lessonBy[p.module_id].label) || 'Leçon');
      });
    }

    pubs = pubs.filter(function (p) {
      if (!rangesCross(p.niveau_min, p.niveau_max, jeuMin, jeuMax)) return false;
      const lec = lessonBy[p.module_id];
      if (!lec) return true;
      return rangesCross(lec.niveau_min, lec.niveau_max, jeuMin, jeuMax);
    });

    const explicit = new Set((sel.matrice_ids || []).map(String));
    let ids = Array.from(molSet).filter(function (id) {
      return explicit.has(id) || !masked.has(id);
    });
    if (!ids.length) return [];

    const [rows, links] = await Promise.all([D.fiches(ids), D.composants(ids)]);
    const ficheBy = {};
    rows.forEach(function (r) { ficheBy[r.id] = r; });
    const compsBy = {};
    (links || []).forEach(function (l) {
      (compsBy[l.matrice_id] = compsBy[l.matrice_id] || []).push(l.composant_matrice_id);
    });

    const f = sel.filtres || {};
    const hasF = (f.secteur || []).length || (f.classe_ther || []).length || (f.classe_pharma || []).length;
    if (hasF) {
      ids = ids.filter(function (id) {
        const row = ficheBy[id];
        return row && matchFiltres(row, f);
      });
    }

    const pubsByMol = {};
    pubs.forEach(function (p) {
      if (ids.indexOf(String(p.matrice_id)) < 0) return;
      const bag = pubsByMol[p.matrice_id] = pubsByMol[p.matrice_id] || {};
      (bag[p.champ_code] = bag[p.champ_code] || []);
      if (p.texte && bag[p.champ_code].indexOf(p.texte) < 0) bag[p.champ_code].push(p.texte);
    });

    return ids.map(function (id) {
      const row = ficheBy[id] || { id: id };
      const pubVals = pubsByMol[id];
      const fromPub = pubVals && Object.keys(pubVals).length;
      const valeurs = {};
      C.list.forEach(function (c) {
        if (fromPub) {
          valeurs[c.code] = (pubVals && pubVals[c.code]) || [];
        } else if (c.identite || c.code === 'dci' || c.code === 'nom_commercial') {
          valeurs[c.code] = fieldOf(row, c.code);
        } else {
          valeurs[c.code] = [];
        }
      });
      const noms = texts(row.noms_commerciaux);
      if (!noms.length && row.nom_commercial) noms.push(row.nom_commercial);
      const comps = compsBy[id] || [];
      const orig = (origine[id] || []).map(function (o) {
        if (o.kind === 'molecule' && !o.label) o.label = txt(row.dci) || noms[0] || id;
        return o;
      });
      const mol = {
        id: id,
        dci: txt(row.dci),
        noms: noms,
        est_association: comps.length >= 2,
        composants: comps,
        valeurs: valeurs,
        origine: orig,
      };
      if (!fromPub) {
        mol.source = 'complet';
        const hasVal = C.list.some(function (c) {
          if (c.identite || c.code === 'dci' || c.code === 'nom_commercial') return false;
          return (valeurs[c.code] || []).length > 0;
        });
        if (!hasVal) mol.vide = true;
      }
      return mol;
    });
  }

  function fieldOf(row, code) {
    if (code === 'dci') return row.dci ? [row.dci] : [];
    if (code === 'nom_commercial') {
      const many = texts(row.noms_commerciaux);
      if (many.length) return many;
      return row.nom_commercial ? [row.nom_commercial] : [];
    }
    return texts(row[code]);
  }

  function label(sel) {
    const s = sel || empty();
    const bits = [];
    const nL = (s.module_ids || []).length;
    const nC = (s.chapitre_ids || []).length;
    const nB = (s.bloc_ids || []).length;
    const nM = (s.matrice_ids || []).length;
    const f = s.filtres || {};
    const nF = (f.secteur || []).length + (f.classe_ther || []).length + (f.classe_pharma || []).length;
    if (nC === 1) bits.push(nameCache['chapitre:' + s.chapitre_ids[0]] || '1 chapitre');
    else if (nC) bits.push(nC + ' chapitres');
    if (nL === 1) bits.push(nameCache['lecon:' + s.module_ids[0]] || '1 leçon');
    else if (nL) bits.push(nL + ' leçons');
    if (nB) bits.push(nB + ' bloc' + (nB > 1 ? 's' : ''));
    if (nM) bits.push(nM + ' molécule' + (nM > 1 ? 's' : ''));
    if (nF) bits.push(nF + ' filtre' + (nF > 1 ? 's' : ''));
    return bits.join(' · ') || '—';
  }

  function combo(input, drop, source, onPick) {
    let items = [];
    let active = -1;
    let seq = 0;
    let timer = 0;

    function close() {
      drop.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      active = -1;
    }
    function open() {
      drop.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function paintActive() {
      Array.prototype.forEach.call(drop.querySelectorAll('.v3-sel-opt'), function (el) {
        const on = Number(el.getAttribute('data-i')) === active;
        el.classList.toggle('is-on', on);
        el.setAttribute('aria-selected', on ? 'true' : 'false');
        if (on && el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
      });
    }
    function paint(msg) {
      drop.replaceChildren();
      if (msg) {
        drop.appendChild(h('div', { class: 'v3-sel-msg' }, msg));
        open();
        return;
      }
      items.forEach(function (it, i) {
        drop.appendChild(h('button', {
          type: 'button',
          class: 'v3-sel-opt',
          role: 'option',
          id: input.id + '-opt-' + i,
          dataset: { i: String(i) },
          'aria-selected': 'false',
          onMousedown: function (ev) { ev.preventDefault(); },
          onClick: function () { pick(i); },
        }, it.label, it.sub ? h('small', null, it.sub) : null));
      });
      if (!items.length) drop.appendChild(h('div', { class: 'v3-sel-msg' }, '—'));
      open();
      paintActive();
    }
    function pick(i) {
      const it = items[i];
      if (!it) return;
      close();
      input.value = '';
      onPick(it);
    }
    async function run() {
      const token = ++seq;
      const q = input.value.trim();
      try {
        const hits = await source(q);
        if (token !== seq) return;
        items = hits || [];
        active = items.length ? 0 : -1;
        paint();
      } catch (e) {
        if (token !== seq) return;
        paint(global.V3Store ? global.V3Store.human(e) : String(e.message || e));
      }
    }
    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(run, 180);
    }

    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');
    drop.setAttribute('role', 'listbox');

    input.addEventListener('input', schedule);
    input.addEventListener('focus', function () { void run(); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (drop.hidden) { void run(); return; }
        active = Math.min(items.length - 1, active + 1);
        paintActive();
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        active = Math.max(0, active - 1);
        paintActive();
      } else if (ev.key === 'Enter') {
        if (!drop.hidden && active >= 0) { ev.preventDefault(); pick(active); }
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        close();
      }
    });

    return { run: run, close: close, schedule: schedule };
  }

  function mount(el, opts) {
    opts = opts || {};
    const state = {
      mode: 'lecon',
      sel: copy(opts.value),
      labels: {},
      filtOpen: false,
      countTimer: 0,
      destroyed: false,
      _coveredLessons: {},
    };
    const compact = !!opts.compact;
    let uid = 'v3sel-' + Math.random().toString(36).slice(2, 8);

    const input = h('input', {
      id: uid + '-q',
      type: 'search',
      placeholder: 'Chercher',
      autocomplete: 'off',
      'aria-label': 'Chercher',
    });
    const drop = h('div', { class: 'v3-sel-drop', id: uid + '-drop', hidden: true });
    const chipsEl = h('div', { class: 'v3-chips' });
    const countEl = h('div', { class: 'v3-sel-count' });
    const filtWrap = h('div', { class: 'v3-sel-filt', hidden: true });
    const filtBtn = h('button', {
      type: 'button',
      class: 'v3-btn v3-btn-ghost',
      hidden: true,
      onClick: function () {
        state.filtOpen = !state.filtOpen;
        syncFilt();
      },
    }, 'Filtres');

    const seg = U.segmented(
      [
        { value: 'lecon', label: 'Leçon' },
        { value: 'chapitre', label: 'Chapitre' },
        { value: 'bloc', label: 'Bloc' },
        { value: 'molecule', label: 'Molécule' },
      ],
      state.mode,
      function (v) {
        state.mode = v;
        input.value = '';
        drop.hidden = true;
        syncFilt();
        void engine.run();
      }
    );

    const bar = h('div', { class: 'v3-sel-bar' }, seg, input);
    const root = h('div', { class: 'v3-sel' + (compact ? ' is-compact' : '') },
      bar, drop, filtBtn, filtWrap, chipsEl, countEl
    );
    el.replaceChildren(root);

    function emit() {
      if (opts.onChange) opts.onChange(copy(state.sel));
      scheduleCount();
    }

    function addItem(kind, id, lab, sub) {
      const key = kind + ':' + id;
      if (kind === 'lecon') {
        if (state.sel.module_ids.indexOf(id) >= 0) return;
        state.sel.module_ids.push(id);
      } else if (kind === 'chapitre') {
        if (state.sel.chapitre_ids.indexOf(id) >= 0) return;
        state.sel.chapitre_ids.push(id);
      } else if (kind === 'bloc') {
        if (state.sel.bloc_ids.indexOf(id) >= 0) return;
        state.sel.bloc_ids.push(id);
      } else {
        if (state.sel.matrice_ids.indexOf(id) >= 0) return;
        state.sel.matrice_ids.push(id);
      }
      state.labels[key] = lab;
      nameCache[key] = lab;
      paintChips();
      emit();
    }

    function addFiltre(type, normVal, lab) {
      const arr = state.sel.filtres[type] || (state.sel.filtres[type] = []);
      if (arr.indexOf(normVal) >= 0) return;
      arr.push(normVal);
      state.labels['filtre:' + type + ':' + normVal] = lab;
      paintChips();
      emit();
    }

    function remove(kind, id, type, normVal) {
      if (kind === 'lecon') state.sel.module_ids = state.sel.module_ids.filter(function (x) { return x !== id; });
      else if (kind === 'chapitre') state.sel.chapitre_ids = state.sel.chapitre_ids.filter(function (x) { return x !== id; });
      else if (kind === 'bloc') state.sel.bloc_ids = state.sel.bloc_ids.filter(function (x) { return x !== id; });
      else if (kind === 'molecule') state.sel.matrice_ids = state.sel.matrice_ids.filter(function (x) { return x !== id; });
      else if (kind === 'filtre') {
        const arr = state.sel.filtres[type] || [];
        state.sel.filtres[type] = arr.filter(function (x) { return x !== normVal; });
      }
      paintChips();
      emit();
    }

    function paintChips() {
      const nodes = [];
      const covered = state._coveredLessons || {};
      state.sel.chapitre_ids.forEach(function (id) {
        const lab = state.labels['chapitre:' + id] || id.slice(0, 8);
        nodes.push(U.chip(lab, { kind: 'chapitre', onRemove: function () { remove('chapitre', id); } }));
      });
      state.sel.module_ids.forEach(function (id) {
        if (covered[String(id)]) return;
        const lab = state.labels['lecon:' + id] || id.slice(0, 8);
        nodes.push(U.chip(lab, { kind: 'lecon', onRemove: function () { remove('lecon', id); } }));
      });
      state.sel.bloc_ids.forEach(function (id) {
        const lab = state.labels['bloc:' + id] || id.slice(0, 8);
        nodes.push(U.chip(lab, { kind: 'bloc', onRemove: function () { remove('bloc', id); } }));
      });
      state.sel.matrice_ids.forEach(function (id) {
        const lab = state.labels['molecule:' + id] || id.slice(0, 8);
        nodes.push(U.chip(lab, { kind: 'molecule', onRemove: function () { remove('molecule', id); } }));
      });
      Object.keys(FILTRE_KEYS).forEach(function (type) {
        (state.sel.filtres[type] || []).forEach(function (n) {
          const lab = state.labels['filtre:' + type + ':' + n] || n;
          nodes.push(U.chip(lab, { kind: 'filtre', onRemove: function () { remove('filtre', null, type, n); } }));
        });
      });
      chipsEl.replaceChildren.apply(chipsEl, nodes);
    }

    function scheduleCount() {
      clearTimeout(state.countTimer);
      state.countTimer = setTimeout(function () { void updateCount(); }, 280);
    }

    async function updateCount() {
      if (state.destroyed) return;
      if (isEmpty(state.sel)) {
        countEl.replaceChildren();
        return;
      }
      countEl.replaceChildren(h('span', null, '…'));
      try {
        const mols = await resolve(state.sel);
        if (state.destroyed) return;
        const dcis = mols.map(function (m) { return m.dci || m.noms[0] || m.id; });
        const tipTxt = dcis.length ? dcis.slice(0, 40).join(', ') + (dcis.length > 40 ? '…' : '') : 'Aucune';
        countEl.replaceChildren(
          h('span', null, mols.length + ' molécule' + (mols.length > 1 ? 's' : '')),
          U.tip(tipTxt)
        );
      } catch (e) {
        if (state.destroyed) return;
        countEl.replaceChildren(h('span', null, (global.V3Store && global.V3Store.human(e)) || 'Erreur'));
      }
    }

    async function sourceMain(q) {
      const n = D.norm(q);
      if (state.mode === 'lecon') {
        const list = await D.lessons();
        return list.filter(function (l) {
          return !n || D.norm(l.label + ' ' + l.sub).indexOf(n) >= 0;
        }).slice(0, 12);
      }
      if (state.mode === 'chapitre') {
        const list = await D.chapters();
        return list.filter(function (c) {
          if (!(c.lessonIds || []).length) return false;
          return !n || D.norm((c.label || '') + ' ' + (c.sub || '')).indexOf(n) >= 0;
        }).slice(0, 12).map(function (c) {
          const nL = (c.lessonIds || []).length;
          return {
            id: c.id,
            kind: 'chapitre',
            label: txt(c.label) || 'Chapitre',
            sub: (c.sub ? txt(c.sub) + ' · ' : '') + nL + ' leçon' + (nL > 1 ? 's' : ''),
          };
        });
      }
      if (state.mode === 'bloc') {
        const list = await D.blocks();
        return list.filter(function (b) {
          return !n || D.norm(b.label + ' ' + b.sub).indexOf(n) >= 0;
        }).slice(0, 12);
      }
      if (q.length < 2 && isEmptyFiltres()) return [];
      return D.searchMolecules(q, state.sel.filtres);
    }

    function isEmptyFiltres() {
      const f = state.sel.filtres;
      return !(f.secteur || []).length && !(f.classe_ther || []).length && !(f.classe_pharma || []).length;
    }

    const engine = combo(input, drop, sourceMain, function (it) {
      addItem(it.kind, it.id, it.label, it.sub);
    });

    function makeFiltreCombo(type, fetcher) {
      const inp = h('input', {
        id: uid + '-' + type,
        type: 'search',
        placeholder: FILTRE_LAB[type],
        autocomplete: 'off',
        'aria-label': FILTRE_LAB[type],
      });
      const d = h('div', { class: 'v3-sel-drop', hidden: true });
      const box = h('div', { class: 'v3-sel-combo' }, inp, d);
      combo(inp, d, async function (q) {
        if (!q.trim()) return [];
        const rows = await fetcher(q);
        return rows.map(function (r) {
          return { id: r.valeur_norm, kind: 'filtre', label: r.valeur, type: type, sub: '' };
        });
      }, function (it) {
        addFiltre(type, it.id, it.label);
      });
      return box;
    }

    filtWrap.append(
      makeFiltreCombo('secteur', D.secteurs),
      makeFiltreCombo('classe_ther', D.classesTher),
      makeFiltreCombo('classe_pharma', D.classesPharma)
    );

    function syncFilt() {
      const show = state.mode === 'molecule';
      filtBtn.hidden = !show;
      filtWrap.hidden = !(show && state.filtOpen);
    }

    function onDoc(ev) {
      if (!root.contains(ev.target)) {
        engine.close();
        Array.prototype.forEach.call(root.querySelectorAll('.v3-sel-drop'), function (d) {
          d.hidden = true;
        });
      }
    }
    document.addEventListener('mousedown', onDoc);

    async function hydrate() {
      try {
        const [les, blo, chaps] = await Promise.all([D.lessons(), D.blocks(), D.chapters()]);
        les.forEach(function (l) {
          state.labels['lecon:' + l.id] = l.label;
          nameCache['lecon:' + l.id] = l.label;
        });
        blo.forEach(function (b) {
          state.labels['bloc:' + b.id] = b.label;
          nameCache['bloc:' + b.id] = b.label;
        });
        const covered = {};
        (chaps || []).forEach(function (c) {
          state.labels['chapitre:' + c.id] = c.label;
          nameCache['chapitre:' + c.id] = c.label;
        });
        (state.sel.chapitre_ids || []).forEach(function (cid) {
          const ch = (chaps || []).filter(function (c) { return String(c.id) === String(cid); })[0];
          (ch && ch.lessonIds || []).forEach(function (id) { covered[String(id)] = true; });
        });
        state._coveredLessons = covered;
        if (state.sel.matrice_ids.length) {
          const rows = await D.fiches(state.sel.matrice_ids);
          rows.forEach(function (r) { state.labels['molecule:' + r.id] = r.dci || r.nom_commercial || r.id; });
        }
      } catch (_) { /* labels fallback uuid */ }
      paintChips();
      scheduleCount();
    }

    paintChips();
    syncFilt();
    void hydrate();

    function getSel() { return copy(state.sel); }

    return {
      get: getSel,
      getPool: getSel,
      pool: function () { return resolve(state.sel); },
      set: function (sel) {
        state.sel = copy(sel);
        void hydrate();
        if (opts.onChange) opts.onChange(copy(state.sel));
      },
      destroy: function () {
        state.destroyed = true;
        clearTimeout(state.countTimer);
        document.removeEventListener('mousedown', onDoc);
        el.replaceChildren();
      },
    };
  }

  global.V3Selection = {
    mount: mount,
    resolve: resolve,
    pool: resolve,
    empty: empty,
    copy: copy,
    isEmpty: isEmpty,
    label: label,
    blocsOfLesson: blocsOfLesson,
    blocsOfChapter: blocsOfChapter,
    selectionFromLesson: selectionFromLesson,
    selectionFromChapter: selectionFromChapter,
    lessonIdsOfChapters: lessonIdsOfChapters,
  };
})(window);
