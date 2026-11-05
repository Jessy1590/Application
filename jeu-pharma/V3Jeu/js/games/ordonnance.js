(function (global) {
  const U = global.V3UI;
  const h = U.h;
  const DEFAULT_CHAMPS = ['indications', 'contre_indications', 'effets_indesirables'];

  function emptySel() {
    return global.V3Selection.empty();
  }

  function copySel(sel) {
    const s = sel || emptySel();
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

  function selVide(ctx, sel) {
    if (ctx && ctx.selection && typeof ctx.selection.isEmpty === 'function') {
      return ctx.selection.isEmpty(sel);
    }
    const s = sel || {};
    const f = s.filtres || {};
    return !(s.module_ids || []).length
      && !(s.bloc_ids || []).length
      && !(s.matrice_ids || []).length
      && !(f.secteur || []).length
      && !(f.classe_ther || []).length
      && !(f.classe_pharma || []).length;
  }

  function reindex(cfg) {
    (cfg.besoins || []).forEach(function (b, i) { b.ordre = i + 1; });
  }

  function emptyBesoin(ordre, sel) {
    return {
      ordre: ordre,
      mode: 'aleatoire',
      matrice_id: null,
      association_id: null,
      filtre_json: copySel(sel),
      cible_label: '',
    };
  }

  function normBesoin(b, i) {
    b = b || {};
    return {
      ordre: Number(b.ordre) || (i + 1),
      mode: b.mode === 'manuel' ? 'manuel' : 'aleatoire',
      matrice_id: b.matrice_id || null,
      association_id: b.association_id || null,
      filtre_json: copySel(b.filtre_json),
      cible_label: b.cible_label || '',
    };
  }

  function champOpts() {
    return global.V3Champs.list.filter(function (c) { return !c.identite; }).map(function (c) {
      return { value: c.code, label: c.label };
    });
  }

  function cfgInit(cfg) {
    cfg = cfg || {};
    if (!Array.isArray(cfg.champs)) cfg.champs = DEFAULT_CHAMPS.slice();
    if (!Array.isArray(cfg.besoins)) cfg.besoins = [];
    cfg.besoins = cfg.besoins.map(normBesoin);
    reindex(cfg);
    cfg.associations_possibles = !!cfg.associations_possibles;
    return cfg;
  }

  function defaults(ctx) {
    const sel = ctx && ctx.meta ? ctx.meta.selection : emptySel();
    const has = ctx && ctx.selection && !ctx.selection.isEmpty(sel);
    return cfgInit({
      associations_possibles: false,
      champs: DEFAULT_CHAMPS.slice(),
      besoins: [emptyBesoin(1, has ? sel : emptySel())],
    });
  }

  function fromConfig(raw) {
    raw = raw || {};
    const champs = Array.isArray(raw.champs)
      ? raw.champs.filter(Boolean)
      : DEFAULT_CHAMPS.slice();
    return cfgInit({
      associations_possibles: !!raw.associations_possibles,
      champs: champs.length ? champs : DEFAULT_CHAMPS.slice(),
      besoins: Array.isArray(raw.besoins) ? raw.besoins.map(normBesoin) : [],
    });
  }

  function validate(ctx) {
    const cfg = cfgInit(ctx.cfg || {});
    const msgs = [];
    if (!cfg.besoins.length) msgs.push('Aucun besoin');
    cfg.besoins.forEach(function (b, i) {
      const n = i + 1;
      if (b.mode === 'aleatoire') {
        if (selVide(ctx, b.filtre_json)) msgs.push('Besoin ' + n + ' : filtre vide');
      } else if (!b.matrice_id && !b.association_id) {
        msgs.push('Besoin ' + n + ' : molécule manquante');
      }
    });
    if (!(cfg.champs || []).length) msgs.push('Aucun champ');
    return msgs;
  }

  function payload(ctx) {
    const cfg = cfgInit(ctx.cfg || {});
    return {
      ordonnance: {
        associations_possibles: !!cfg.associations_possibles,
        champs: (cfg.champs || []).filter(Boolean).slice(),
        besoins: cfg.besoins.map(function (b, i) {
          const manuel = b.mode === 'manuel';
          return {
            ordre: i + 1,
            mode: manuel ? 'manuel' : 'aleatoire',
            matrice_id: manuel && !b.association_id ? (b.matrice_id || null) : null,
            association_id: manuel ? (b.association_id || null) : null,
            filtre_json: copySel(b.filtre_json),
          };
        }),
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

  function nomsOf(mol) {
    if (!mol) return '';
    return (mol.noms || []).filter(Boolean).join(', ');
  }

  function dciOf(mol) {
    return (mol && mol.dci) || '—';
  }

  function byId(list) {
    const m = {};
    (list || []).forEach(function (x) { if (x && x.id) m[String(x.id)] = x; });
    return m;
  }

  function selForIds(ids) {
    return {
      module_ids: [],
      bloc_ids: [],
      matrice_ids: (ids || []).filter(Boolean).map(String),
      filtres: { secteur: [], classe_ther: [], classe_pharma: [] },
    };
  }

  async function resolveIds(ctx, ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean).map(String)));
    if (!uniq.length) return [];
    const mols = await ctx.selection.resolve(selForIds(uniq));
    const idx = byId(mols);
    return uniq.map(function (id) { return idx[id]; }).filter(Boolean);
  }

  async function prepare(ctx) {
    const cfg = cfgInit(ctx.cfg);
    const pool = await ctx.mols();
    const index = byId(pool);
    const packs = [];
    for (let i = 0; i < cfg.besoins.length; i += 1) {
      const b = cfg.besoins[i];
      if (b.mode === 'manuel') {
        const id = b.association_id || b.matrice_id;
        let mol = id ? index[String(id)] : null;
        if (!mol && id) {
          const found = await resolveIds(ctx, [id]);
          mol = found[0] || null;
          if (mol) index[String(mol.id)] = mol;
        }
        let comps = [];
        if (mol && mol.est_association && (mol.composants || []).length) {
          const missing = mol.composants.filter(function (cid) { return !index[String(cid)]; });
          if (missing.length) {
            (await resolveIds(ctx, missing)).forEach(function (m) { index[String(m.id)] = m; });
          }
          comps = mol.composants.map(function (cid) { return index[String(cid)]; }).filter(Boolean);
        }
        packs.push({
          besoin: b,
          index: i,
          mode: 'manuel',
          mol: mol,
          comps: comps,
          candidats: mol ? [mol] : [],
        });
      } else {
        const candidats = await ctx.selection.resolve(b.filtre_json);
        (candidats || []).forEach(function (m) { index[String(m.id)] = m; });
        packs.push({
          besoin: b,
          index: i,
          mode: 'aleatoire',
          mol: null,
          comps: [],
          candidats: candidats || [],
        });
      }
    }
    return { packs: packs, index: index, pool: pool || [] };
  }

  function scoringMols(ligne) {
    if (ligne.kind === 'association' && ligne.molecules && ligne.molecules.length >= 2) {
      return ligne.molecules;
    }
    return ligne.molecules && ligne.molecules.length ? ligne.molecules : (ligne.mol ? [ligne.mol] : []);
  }

  function makeLigne(pack, mol, kind, molecules, cover) {
    return {
      besoin_ordres: (cover || [pack.besoin.ordre]).slice(),
      kind: kind,
      matrice_id: mol ? mol.id : null,
      association_id: kind === 'association' ? (mol && mol.id) : null,
      dci: dciOf(mol),
      noms: (mol && mol.noms) || [],
      mol: mol,
      molecules: molecules || (mol ? [mol] : []),
    };
  }

  function tryMergeAsso(drawn, prep, cfg) {
    if (!cfg.associations_possibles) return drawn;
    const assos = [];
    const seen = {};
    prep.packs.forEach(function (p) {
      (p.candidats || []).forEach(function (m) {
        if (!m.est_association || (m.composants || []).length < 2) return;
        const k = String(m.id);
        if (seen[k]) return;
        seen[k] = true;
        assos.push(m);
      });
    });
    if (!assos.length) return drawn;

    function coverOf(asso) {
      const comps = new Set((asso.composants || []).map(String));
      const idxs = [];
      prep.packs.forEach(function (p, i) {
        if (p.mode !== 'aleatoire') return;
        const hit = (p.candidats || []).some(function (m) { return comps.has(String(m.id)); });
        if (hit) idxs.push(i);
      });
      return idxs;
    }

    const drawnAt = {};
    drawn.forEach(function (d) { drawnAt[d.packIndex] = true; });
    const eligible = shuffle(assos).filter(function (a) {
      return coverOf(a).filter(function (i) { return drawnAt[i]; }).length >= 2;
    });
    if (!eligible.length || Math.random() >= 0.5) return drawn;
    const asso = eligible[0];
    const coverIdx = coverOf(asso).filter(function (i) { return drawnAt[i]; });
    const compMols = (asso.composants || []).map(function (id) { return prep.index[String(id)]; }).filter(Boolean);
    if (coverIdx.length < 2 || compMols.length < 2) return drawn;

    const coverOrdres = coverIdx.map(function (i) { return prep.packs[i].besoin.ordre; });
    const drop = {};
    coverIdx.forEach(function (i) { drop[i] = true; });
    const out = [];
    let inserted = false;
    drawn.forEach(function (d) {
      if (drop[d.packIndex]) {
        if (!inserted) {
          out.push(Object.assign(makeLigne(prep.packs[coverIdx[0]], asso, 'association', compMols, coverOrdres), {
            packIndex: coverIdx[0],
          }));
          inserted = true;
        }
        return;
      }
      out.push(d);
    });
    if (!inserted) {
      out.push(Object.assign(makeLigne(prep.packs[coverIdx[0]], asso, 'association', compMols, coverOrdres), {
        packIndex: coverIdx[0],
      }));
    }
    return out;
  }

  async function tirer(ctx) {
    const cfg = cfgInit(ctx.cfg);
    const prep = await prepare(ctx);
    const used = new Set();
    const drawn = [];

    function mark(mol) {
      if (!mol) return;
      used.add(String(mol.id));
      (mol.composants || []).forEach(function (id) { used.add(String(id)); });
    }

    prep.packs.forEach(function (p) {
      if (p.mode !== 'manuel') return;
      if (!p.mol) return;
      const kind = p.mol.est_association ? 'association' : 'molecule';
      const molecules = kind === 'association' && p.comps.length >= 2 ? p.comps : [p.mol];
      drawn.push(Object.assign(makeLigne(p, p.mol, kind, molecules), { packIndex: p.index }));
      mark(p.mol);
    });

    prep.packs.forEach(function (p) {
      if (p.mode !== 'aleatoire') return;
      const pool = (p.candidats || []).filter(function (m) { return !m.est_association && !used.has(String(m.id)); });
      const fallback = (p.candidats || []).filter(function (m) { return !used.has(String(m.id)); });
      const pickFrom = pool.length ? pool : fallback;
      if (!pickFrom.length) return;
      const mol = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      const kind = mol.est_association ? 'association' : 'molecule';
      let molecules = [mol];
      if (kind === 'association') {
        molecules = (mol.composants || []).map(function (id) { return prep.index[String(id)]; }).filter(Boolean);
        if (molecules.length < 2) molecules = [mol];
      }
      drawn.push(Object.assign(makeLigne(p, mol, kind, molecules), { packIndex: p.index }));
      used.add(String(mol.id));
    });

    drawn.sort(function (a, b) { return a.packIndex - b.packIndex; });
    const merged = tryMergeAsso(drawn, prep, cfg);
    return {
      lignes: merged,
      champs: (cfg.champs || []).slice(),
      associations_possibles: !!cfg.associations_possibles,
      counts: prep.packs.map(function (p) {
        return {
          ordre: p.besoin.ordre,
          mode: p.mode,
          n: p.mode === 'manuel' ? (p.mol ? 1 : 0) : p.candidats.length,
        };
      }),
      pool: prep.pool,
      index: prep.index,
    };
  }

  function snapshotOf(tirage) {
    return {
      champs: (tirage.champs || []).slice(),
      associations_possibles: !!tirage.associations_possibles,
      lignes: (tirage.lignes || []).map(function (l) {
        return {
          besoin_ordres: (l.besoin_ordres || []).slice(),
          kind: l.kind,
          matrice_id: l.matrice_id,
          association_id: l.association_id || null,
          dci: l.dci,
          noms: (l.noms || []).slice(),
          molecules: scoringMols(l).map(function (m) {
            return {
              id: m.id,
              dci: m.dci,
              noms: (m.noms || []).slice(),
              valeurs: m.valeurs || {},
            };
          }),
        };
      }),
    };
  }

  function lineTitle(ligne) {
    if (ligne.kind === 'association') {
      const parts = scoringMols(ligne).map(dciOf);
      if (parts.length >= 2) return parts.join(' + ');
    }
    return ligne.dci || dciOf(ligne.mol);
  }

  function valsOf(mol, code) {
    return global.V3Champs.valeurs(mol, code);
  }

  function renderVals(vals) {
    if (!vals || !vals.length) return h('span', { class: 'v3-muted' }, '—');
    if (vals.length === 1) return h('span', null, vals[0]);
    return h('ul', { class: 'v3-ordo-vals' }, vals.map(function (v) { return h('li', null, v); }));
  }

  function renderSheet(tirage, opts) {
    opts = opts || {};
    const champs = tirage.champs || [];
    const lignes = tirage.lignes || [];
    const head = h('header', { class: 'v3-ordo-head' },
      h('p', { class: 'v3-ordo-brand' }, 'Ordonnance')
    );
    const list = lignes.map(function (ligne, i) {
      const n = i + 1;
      const title = lineTitle(ligne);
      const noms = nomsOf(ligne.mol) || (ligne.noms || []).join(', ');
      const mols = scoringMols(ligne);
      const idLine = h('div', { class: 'v3-ordo-id' },
        h('span', { class: 'v3-ordo-num' }, String(n) + '.'),
        h('div', { class: 'v3-ordo-id-txt' },
          h('strong', { class: 'v3-ordo-dci' }, title),
          noms ? h('span', { class: 'v3-ordo-noms' }, noms) : null
        )
      );

      let body = null;
      if (opts.play && !opts.revealed && opts.mode === 'detaille') {
        body = h('div', { class: 'v3-ordo-saisies' }, champs.map(function (code) {
          const ta = h('textarea', {
            class: 'v3-ordo-ta',
            rows: 2,
            'aria-label': global.V3Champs.label(code) + ' · ' + title,
          });
          const key = i + ':' + code;
          if (opts.saisies && opts.saisies[key]) ta.value = opts.saisies[key];
          ta.addEventListener('input', function () {
            if (opts.onInput) opts.onInput(key, ta.value);
          });
          return h('label', { class: 'v3-ordo-saie' },
            h('span', null, global.V3Champs.label(code)),
            ta
          );
        }));
      } else if (opts.play && !opts.revealed) {
        body = h('p', { class: 'v3-ordo-rest' },
          champs.map(function (c) { return global.V3Champs.label(c); }).join(' · ')
        );
      } else if (opts.revealed || opts.preview) {
        const blocks = mols.map(function (m) {
          const showDci = ligne.kind === 'association' && mols.length > 1;
          return h('div', { class: 'v3-ordo-mol' },
            showDci ? h('h4', null, dciOf(m)) : null,
            h('dl', { class: 'v3-ordo-dl' }, champs.map(function (code) {
              return [
                h('dt', null, global.V3Champs.label(code)),
                h('dd', null, renderVals(valsOf(m, code))),
              ];
            }))
          );
        });
        body = h('div', { class: 'v3-ordo-champs' }, blocks);
      }

      return h('article', {
        class: 'v3-ordo-line' + (ligne.kind === 'association' ? ' is-asso' : ''),
      }, idLine, body);
    });

    return h('div', { class: 'v3-ordo-sheet' }, head, list.length ? list : U.empty('Tirage impossible'));
  }

  function classesOf(mol) {
    return global.V3Champs.valeurs(mol, 'classe_therapeutique')
      .concat(global.V3Champs.valeurs(mol, 'classe_pharmacologique'));
  }

  function mentions(txt, other) {
    const n = global.V3Data.norm(txt);
    if (!n) return false;
    if (other.dci && n.indexOf(global.V3Data.norm(other.dci)) >= 0) return true;
    const cls = classesOf(other);
    for (let i = 0; i < cls.length; i += 1) {
      const cn = global.V3Data.norm(cls[i]);
      if (cn.length >= 3 && n.indexOf(cn) >= 0) return true;
    }
    return false;
  }

  function vigilance(tirage) {
    const items = [];
    const lignes = tirage.lignes || [];
    const mols = [];
    lignes.forEach(function (l, li) {
      scoringMols(l).forEach(function (m) {
        mols.push({ mol: m, line: li });
      });
    });
    mols.forEach(function (a) {
      valsOf(a.mol, 'interactions').forEach(function (txt) {
        const hit = mols.some(function (b) {
          if (String(a.mol.id) === String(b.mol.id)) return false;
          return mentions(txt, b.mol);
        });
        if (hit) items.push({ kind: 'inter', text: dciOf(a.mol) + ' — ' + txt });
      });
    });

    if (tirage.associations_possibles) {
      const lineIds = lignes.map(function (l) {
        if (l.kind === 'association') return [];
        return scoringMols(l).map(function (m) { return String(m.id); });
      });
      const assos = [];
      const seenAsso = {};
      function addAsso(m) {
        if (!m || !m.est_association || (m.composants || []).length < 2) return;
        const k = String(m.id);
        if (seenAsso[k]) return;
        seenAsso[k] = true;
        assos.push(m);
      }
      (tirage.pool || []).forEach(addAsso);
      Object.keys(tirage.index || {}).forEach(function (k) { addAsso(tirage.index[k]); });
      const seen = {};
      assos.forEach(function (asso) {
        const comps = (asso.composants || []).map(String);
        const hitLines = [];
        lineIds.forEach(function (ids, li) {
          if (ids.some(function (id) { return comps.indexOf(id) >= 0; })) hitLines.push(li);
        });
        const uniq = Array.from(new Set(hitLines));
        if (uniq.length < 2) return;
        const k = String(asso.id);
        if (seen[k]) return;
        seen[k] = true;
        const lab = nomsOf(asso) || dciOf(asso);
        items.push({ kind: 'obs', text: 'Observance : privilégier ' + lab });
      });
    }

    const dedup = [];
    const tset = {};
    items.forEach(function (it) {
      if (tset[it.text]) return;
      tset[it.text] = true;
      dedup.push(it);
    });
    return dedup;
  }

  function renderVigil(items) {
    if (!items || !items.length) return null;
    return h('aside', { class: 'v3-ordo-vigil', 'aria-label': 'Vigilance' },
      h('h3', null, 'Vigilance'),
      h('ul', null, items.map(function (it) {
        return h('li', { class: it.kind === 'obs' ? 'is-obs' : '' }, it.text);
      }))
    );
  }

  function notationItems(tirage, saisies) {
    const items = [];
    (tirage.lignes || []).forEach(function (ligne, i) {
      scoringMols(ligne).forEach(function (m) {
        (tirage.champs || []).forEach(function (code) {
          const saisie = (saisies && saisies[i + ':' + code]) || '';
          valsOf(m, code).forEach(function (att) {
            items.push({
              groupe: dciOf(m),
              contexte: global.V3Champs.label(code),
              saisie: saisie,
              attendu: att,
            });
          });
        });
      });
    });
    return items;
  }

  function molTypeahead(ctx, besoin, onPick) {
    const input = h('input', {
      type: 'search',
      placeholder: 'Molécule',
      autocomplete: 'off',
      'aria-label': 'Molécule',
    });
    const drop = h('div', { class: 'v3-sel-drop', hidden: true });
    const wrap = h('div', { class: 'v3-sel v3-ordo-tahead' },
      h('div', { class: 'v3-sel-bar' }, input),
      drop
    );
    let items = [];
    let active = -1;
    let seq = 0;
    let timer = 0;

    function close() {
      drop.hidden = true;
      active = -1;
    }
    function paint() {
      drop.replaceChildren();
      items.forEach(function (it, i) {
        drop.appendChild(h('button', {
          type: 'button',
          class: 'v3-sel-opt',
          dataset: { i: String(i) },
          onMousedown: function (ev) { ev.preventDefault(); },
          onClick: function () { pick(i); },
        }, it.label, it.sub ? h('small', null, it.sub) : null));
      });
      if (!items.length) drop.appendChild(h('div', { class: 'v3-sel-msg' }, '—'));
      drop.hidden = false;
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
      try {
        const hits = await ctx.data.searchMolecules(input.value.trim());
        if (token !== seq) return;
        items = hits || [];
        active = items.length ? 0 : -1;
        paint();
      } catch (e) {
        if (token !== seq) return;
        drop.replaceChildren(h('div', { class: 'v3-sel-msg' }, e.message || 'Erreur'));
        drop.hidden = false;
      }
    }
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { void run(); }, 180);
    });
    input.addEventListener('focus', function () { void run(); });
    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') { close(); return; }
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        active = Math.min(items.length - 1, active + 1);
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        active = Math.max(0, active - 1);
      } else if (ev.key === 'Enter' && !drop.hidden && active >= 0) {
        ev.preventDefault();
        pick(active);
        return;
      } else {
        return;
      }
      Array.prototype.forEach.call(drop.querySelectorAll('.v3-sel-opt'), function (el, i) {
        el.classList.toggle('is-on', i === active);
      });
    });
    document.addEventListener('mousedown', function onDoc(ev) {
      if (!wrap.isConnected) {
        document.removeEventListener('mousedown', onDoc);
        return;
      }
      if (!wrap.contains(ev.target)) close();
    });
    if (besoin.cible_label || besoin.matrice_id || besoin.association_id) {
      /* chip painted by caller */
    }
    return wrap;
  }

  function params(el, ctx) {
    const cfg = cfgInit(ctx.cfg);
    ctx.cfg = cfg;
    let mounts = [];
    const listEl = h('div', { class: 'v3-ordo-besoins' });
    const from1BtnHost = h('div', { class: 'v3-ordo-from1' });

    function destroyMounts() {
      mounts.forEach(function (m) { if (m && m.destroy) m.destroy(); });
      mounts = [];
    }

    function paintFrom1() {
      const sel = ctx.meta && ctx.meta.selection;
      const show = sel && !selVide(ctx, sel);
      from1BtnHost.replaceChildren(show
        ? U.button('+ Besoin depuis l\'étape 1', {
          variant: 'ghost',
          onClick: function () {
            cfg.besoins.push(emptyBesoin(cfg.besoins.length + 1, sel));
            reindex(cfg);
            paintList();
            ctx.changed();
          },
        })
        : null);
    }

    function paintMeta(host, besoin) {
      if (besoin.mode !== 'aleatoire') {
        host.replaceChildren();
        return;
      }
      const lab = ctx.selection.label(besoin.filtre_json);
      host.replaceChildren(h('span', null, lab), h('span', { class: 'v3-ordo-count' }, '…'));
      if (selVide(ctx, besoin.filtre_json)) {
        host.replaceChildren(h('span', { class: 'v3-muted' }, 'Filtre vide'));
        return;
      }
      void ctx.selection.resolve(besoin.filtre_json).then(function (mols) {
        if (!host.isConnected) return;
        host.replaceChildren(
          h('span', null, lab),
          h('span', { class: 'v3-ordo-count' }, (mols || []).length + ' molécule' + ((mols || []).length > 1 ? 's' : ''))
        );
      }).catch(function () {
        if (!host.isConnected) return;
        host.replaceChildren(h('span', null, lab));
      });
    }

    function paintBody(body, meta, besoin) {
      if (body._v3Mount) {
        const old = body._v3Mount;
        body._v3Mount = null;
        mounts = mounts.filter(function (m) { return m !== old; });
        old.destroy();
      }
      body.replaceChildren();
      if (besoin.mode === 'aleatoire') {
        const mountEl = h('div', { class: 'v3-ordo-sel' });
        body.appendChild(mountEl);
        const api = ctx.selection.mount(mountEl, {
          value: besoin.filtre_json,
          compact: true,
          onChange: function (sel) {
            besoin.filtre_json = copySel(sel);
            paintMeta(meta, besoin);
            ctx.changed();
          },
        });
        mounts.push(api);
        body._v3Mount = api;
        paintMeta(meta, besoin);
      } else {
        const chipHost = h('div', { class: 'v3-chips v3-ordo-cible' });
        function paintCible() {
          const id = besoin.association_id || besoin.matrice_id;
          if (!id) {
            chipHost.replaceChildren();
            return;
          }
          chipHost.replaceChildren(U.chip(besoin.cible_label || id.slice(0, 8), {
            kind: 'molecule',
            onRemove: function () {
              besoin.matrice_id = null;
              besoin.association_id = null;
              besoin.cible_label = '';
              paintCible();
              ctx.changed();
            },
          }));
        }
        paintCible();
        if ((besoin.matrice_id || besoin.association_id) && !besoin.cible_label) {
          const id = besoin.association_id || besoin.matrice_id;
          void ctx.data.fiches([id]).then(function (rows) {
            const r = rows && rows[0];
            if (!r || !chipHost.isConnected) return;
            besoin.cible_label = r.dci || r.nom_commercial || id;
            paintCible();
          });
        }
        body.append(
          molTypeahead(ctx, besoin, function (it) {
            void ctx.data.composants([it.id]).then(function (links) {
              const asso = (links || []).length >= 2;
              besoin.association_id = asso ? it.id : null;
              besoin.matrice_id = asso ? null : it.id;
              besoin.cible_label = it.label || it.id;
              paintCible();
              ctx.changed();
            }).catch(function () {
              besoin.matrice_id = it.id;
              besoin.association_id = null;
              besoin.cible_label = it.label || it.id;
              paintCible();
              ctx.changed();
            });
          }),
          chipHost
        );
        meta.replaceChildren();
      }
    }

    function paintList() {
      destroyMounts();
      listEl.replaceChildren();
      cfg.besoins.forEach(function (besoin, i) {
        const meta = h('div', { class: 'v3-ordo-besoin-meta' });
        const body = h('div', { class: 'v3-ordo-besoin-body' });
        const num = h('span', { class: 'v3-ordo-besoin-n' }, String(i + 1));
        const seg = U.segmented(
          [
            { value: 'aleatoire', label: 'Aléatoire' },
            { value: 'manuel', label: 'Fixe' },
          ],
          besoin.mode,
          function (v) {
            besoin.mode = v;
            paintBody(body, meta, besoin);
            ctx.changed();
          }
        );
        const row = h('div', { class: 'v3-ordo-besoin' },
          h('div', { class: 'v3-ordo-besoin-head' },
            num,
            seg,
            h('div', { class: 'v3-ordo-besoin-act' },
              U.button('↑', {
                variant: 'ghost',
                disabled: i === 0,
                onClick: function () {
                  const a = cfg.besoins[i - 1];
                  cfg.besoins[i - 1] = besoin;
                  cfg.besoins[i] = a;
                  reindex(cfg);
                  paintList();
                  ctx.changed();
                },
              }),
              U.button('↓', {
                variant: 'ghost',
                disabled: i === cfg.besoins.length - 1,
                onClick: function () {
                  const a = cfg.besoins[i + 1];
                  cfg.besoins[i + 1] = besoin;
                  cfg.besoins[i] = a;
                  reindex(cfg);
                  paintList();
                  ctx.changed();
                },
              }),
              U.button('×', {
                variant: 'ghost',
                onClick: function () {
                  cfg.besoins.splice(i, 1);
                  reindex(cfg);
                  paintList();
                  ctx.changed();
                },
              })
            )
          ),
          body,
          meta
        );
        listEl.appendChild(row);
        paintBody(body, meta, besoin);
      });
      paintFrom1();
    }

    const toggle = U.toggle('Associations possibles', cfg.associations_possibles, function (on) {
      cfg.associations_possibles = on;
      ctx.changed();
    });

    const champs = U.checks(champOpts(), cfg.champs, function (vals) {
      cfg.champs = vals;
      ctx.changed();
    });

    paintList();
    el.replaceChildren(
      U.field('Besoins', h('div', { class: 'v3-ordo-besoins-wrap' },
        listEl,
        h('div', { class: 'v3-row' },
          U.button('+ Besoin', {
            onClick: function () {
              cfg.besoins.push(emptyBesoin(cfg.besoins.length + 1, emptySel()));
              reindex(cfg);
              paintList();
              ctx.changed();
            },
          }),
          from1BtnHost
        )
      ), { col: true, tip: 'Lignes tirées ensemble. Aléatoire = filtre propre, Fixe = molécule ou association.' }),
      h('div', { class: 'v3-row' }, toggle, U.tip('Une association publiée peut couvrir 2 besoins sur une ligne ; jamais forcé.')),
      U.field('Champs', champs, { col: true, tip: 'DCI et nom restent visibles. ≥ 1.' })
    );
  }

  function perso(el, ctx) {
    const countsEl = h('ul', { class: 'v3-ordo-counts' });
    const sheetEl = h('div');
    const act = h('div', { class: 'v3-actions' });
    el.replaceChildren(sheetEl, countsEl, act);

    async function run() {
      sheetEl.replaceChildren(U.empty('…'));
      countsEl.replaceChildren();
      try {
        const t = await tirer(ctx);
        countsEl.replaceChildren.apply(countsEl, t.counts.map(function (c) {
          return h('li', null,
            'Besoin ' + c.ordre + ' · ' + (c.mode === 'manuel' ? 'fixe' : (c.n + ' molécule' + (c.n > 1 ? 's' : '')))
          );
        }));
        sheetEl.replaceChildren(renderSheet(t, { preview: true }));
      } catch (e) {
        sheetEl.replaceChildren(U.empty(e.message || 'Tirage impossible'));
      }
    }

    act.appendChild(U.button('Nouveau tirage', { variant: 'primary', onClick: function () { void run(); } }));
    void run();
  }

  async function submitDeclare(session, tirage, mode, score, saisies, demanderRelecture) {
    const fin = score.fin;
    if (!session.reel) {
      if (demanderRelecture) U.toast('Relecture demandée (essai)');
      session.fin(fin);
      return;
    }
    try {
      const start = await session.rpc('jeu_demarrer_declare', {
        p_jeu_id: session.jeu.id,
        p_snapshot: snapshotOf(tirage),
        p_contexte: 'classique',
      });
      await session.rpc('jeu_soumettre_declare', {
        p_tentative_id: start.tentative_id,
        p_reponses: { mode: mode, saisies: saisies || {} },
        p_score_provisoire: score.rpc.obtenu,
        p_score_max: score.rpc.max,
        p_details: score.rpc.details || [],
        p_demander_relecture: !!demanderRelecture,
      });
      session.fin(fin);
    } catch (e) {
      U.toast(e.message || 'Erreur', 'err');
    }
  }

  function play(el, ctx, session) {
    const modeHost = h('div');
    const main = h('div', { class: 'v3-ordo-play' });
    el.replaceChildren(modeHost, main);

    global.V3Notation.choixMode(modeHost, {
      onPick: function (mode) {
        modeHost.hidden = true;
        void (async function () {
          let tirage;
          try {
            tirage = await tirer(ctx);
          } catch (e) {
            main.replaceChildren(U.empty(e.message || 'Tirage impossible'));
            return;
          }
          if (!tirage.lignes.length) {
            main.replaceChildren(U.empty('Tirage impossible'));
            return;
          }
          let revealed = false;
          const saisies = {};
          const sheetHost = h('div');
          const vigilHost = h('div');
          const noteHost = h('div');
          const actHost = h('div', { class: 'v3-actions' });
          main.replaceChildren(sheetHost, vigilHost, noteHost, actHost);

          function paint() {
            sheetHost.replaceChildren(renderSheet(tirage, {
              play: true,
              mode: mode,
              revealed: revealed,
              saisies: saisies,
              onInput: function (key, val) { saisies[key] = val; },
            }));
            vigilHost.replaceChildren();
            noteHost.replaceChildren();
            actHost.replaceChildren();
            if (!revealed) {
              actHost.appendChild(U.button('Révéler', {
                variant: 'primary',
                onClick: function () {
                  revealed = true;
                  sheetHost.replaceChildren(renderSheet(tirage, {
                    play: true,
                    mode: mode,
                    revealed: true,
                    saisies: saisies,
                  }));
                  const vig = renderVigil(vigilance(tirage));
                  if (vig) vigilHost.replaceChildren(vig);
                  if (mode === 'rapide') {
                    global.V3Notation.rapide(noteHost, {
                      onScore: function (score) {
                        actHost.replaceChildren();
                        void submitDeclare(session, tirage, 'rapide', {
                          fin: { obtenu: score, max: 10, details: [] },
                          rpc: { obtenu: score, max: 10, details: [] },
                        }, saisies);
                      },
                    });
                  } else {
                    const items = notationItems(tirage, saisies);
                    let last = null;
                    global.V3Notation.detaille(noteHost, items, {
                      onChange: function (r) { last = r; },
                    });
                    function finDetail(relecture) {
                      if (!items.length) {
                        void submitDeclare(session, tirage, 'detaille', {
                          fin: { obtenu: 0, max: 0, details: [] },
                          rpc: { obtenu: 0, max: 0, details: [] },
                        }, saisies, relecture);
                        return;
                      }
                      if (!last || last.remplis < items.length) {
                        U.toast('Noter chaque valeur', 'err');
                        return;
                      }
                      void submitDeclare(session, tirage, 'detaille', {
                        fin: { obtenu: last.obtenu, max: last.max, details: last.notes },
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
                },
              }));
            }
          }
          paint();
        })();
      },
    });
  }

  global.V3Games.register('ordonnance', {
    label: 'Ordonnance',
    tip: 'Liste de besoins, champs à restituer.',
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
