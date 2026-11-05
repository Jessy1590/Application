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

  function poolKey(sel) {
    return JSON.stringify(copySel(sel));
  }

  function selOf(ctx) {
    if (ctx && typeof ctx.poolSel === 'function') return copySel(ctx.poolSel());
    return copySel(ctx && ctx.meta && ctx.meta.selection);
  }

  function hasFiltres(f) {
    f = f || {};
    return (f.secteur || []).length + (f.classe_ther || []).length + (f.classe_pharma || []).length > 0;
  }

  function besoinsFromSel(sel) {
    const s = copySel(sel);
    const f = s.filtres || {};
    const out = [];
    function aleat(partial) {
      out.push(emptyBesoin(out.length + 1, {
        module_ids: partial.module_ids || [],
        bloc_ids: partial.bloc_ids || [],
        matrice_ids: [],
        chapitre_ids: partial.chapitre_ids || [],
        filtres: {
          secteur: (f.secteur || []).slice(),
          classe_ther: (f.classe_ther || []).slice(),
          classe_pharma: (f.classe_pharma || []).slice(),
        },
      }));
    }
    (s.chapitre_ids || []).forEach(function (id) {
      aleat({ chapitre_ids: [id] });
    });
    (s.module_ids || []).forEach(function (id) {
      aleat({ module_ids: [id] });
    });
    (s.bloc_ids || []).forEach(function (id) {
      aleat({ bloc_ids: [id] });
    });
    (s.matrice_ids || []).forEach(function (id) {
      const b = emptyBesoin(out.length + 1, emptySel());
      b.mode = 'manuel';
      b.matrice_id = id;
      b.association_id = null;
      b.cible_label = '';
      out.push(b);
    });
    if (!out.length && hasFiltres(f)) aleat({});
    return out;
  }

  function ensureBesoinsFromPool(ctx) {
    let cfg = ctx.cfg || {};
    if (!cfg._ordoInit) {
      cfg = cfgInit(cfg);
      cfg._ordoInit = true;
      ctx.cfg = cfg;
    }
    if (!Array.isArray(cfg.besoins)) cfg.besoins = [];
    const sel = selOf(ctx);
    const key = poolKey(sel);
    if (cfg._poolKey == null) cfg._poolKey = key;
    return cfg;
  }

  /** Aligné sur jeu__sel_taille (106). */
  function selTaille(sel) {
    const s = sel || emptySel();
    const f = s.filtres || {};
    return (s.module_ids || []).length
      + (s.bloc_ids || []).length
      + (s.matrice_ids || []).length
      + (s.chapitre_ids || []).length
      + (f.secteur || []).length
      + (f.classe_ther || []).length
      + (f.classe_pharma || []).length;
  }

  function selVide(_ctx, sel) {
    return selTaille(sel) === 0;
  }

  function starOpts(ctx) {
    const m = (ctx && ctx.meta) || {};
    return {
      niveau_min: m.niveau_min,
      niveau_max: m.niveau_max,
    };
  }

  function resolveSel(ctx, sel) {
    return ctx.selection.resolve(sel, starOpts(ctx));
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
    const fj = b.filtre_json;
    return {
      ordre: Number(b.ordre) || (i + 1),
      mode: b.mode === 'manuel' ? 'manuel' : 'aleatoire',
      matrice_id: b.matrice_id || null,
      association_id: b.association_id || null,
      filtre_json: fj && typeof fj === 'object' ? copySel(fj) : emptySel(),
      cible_label: b.cible_label || '',
    };
  }

  function besoinEmpty(b) {
    if (!b) return true;
    if (b.mode === 'manuel') return !b.matrice_id && !b.association_id;
    return selVide(null, b.filtre_json);
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
    cfg.libelle_nom_commercial = !!cfg.libelle_nom_commercial;
    return cfg;
  }

  function defaults(ctx) {
    const sel = selOf(ctx);
    const cfg = cfgInit({
      associations_possibles: false,
      libelle_nom_commercial: false,
      champs: DEFAULT_CHAMPS.slice(),
      besoins: [],
    });
    cfg._poolKey = poolKey(sel);
    return cfg;
  }

  function fromConfig(raw) {
    raw = raw || {};
    const champs = Array.isArray(raw.champs)
      ? raw.champs.filter(Boolean)
      : DEFAULT_CHAMPS.slice();
    const cfg = cfgInit({
      associations_possibles: !!raw.associations_possibles,
      libelle_nom_commercial: !!raw.libelle_nom_commercial,
      champs: champs.length ? champs : DEFAULT_CHAMPS.slice(),
      besoins: Array.isArray(raw.besoins) ? raw.besoins.map(normBesoin) : [],
    });
    cfg._fromDb = true;
    return cfg;
  }

  function validate(ctx) {
    const cfg = ensureBesoinsFromPool(ctx);
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
    const cfg = ensureBesoinsFromPool(ctx);
    return {
      ordonnance: {
        associations_possibles: !!cfg.associations_possibles,
        libelle_nom_commercial: !!cfg.libelle_nom_commercial,
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
    const fromMol = (mol.noms || []).map(function (n) { return U.txt(n); }).filter(Boolean).join(', ');
    if (fromMol) return fromMol;
    return U.txt(mol.nom_commercial);
  }

  function dciOf(mol) {
    return U.txt(mol && mol.dci) || '—';
  }

  function playable(m) {
    return m && !m.vide;
  }

  function filterPlayable(mols) {
    return (mols || []).filter(playable);
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
      chapitre_ids: [],
      filtres: { secteur: [], classe_ther: [], classe_pharma: [] },
    };
  }

  async function resolveIds(ctx, ids) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean).map(String)));
    if (!uniq.length) return [];
    const mols = filterPlayable(await resolveSel(ctx, selForIds(uniq)));
    const idx = byId(mols);
    return uniq.map(function (id) { return idx[id]; }).filter(Boolean);
  }

  async function prepare(ctx) {
    const cfg = ensureBesoinsFromPool(ctx);
    const pool = filterPlayable(await ctx.mols());
    const index = byId(pool);
    const packs = [];
    for (let i = 0; i < cfg.besoins.length; i += 1) {
      const b = cfg.besoins[i];
      if (b.mode === 'manuel') {
        const id = b.association_id || b.matrice_id;
        let mol = null;
        if (id) {
          mol = index[String(id)] || null;
          if (!mol) {
            const found = await resolveIds(ctx, [id]);
            mol = found[0] || null;
            if (mol) index[String(mol.id)] = mol;
          }
        }
        let comps = [];
        if (mol && mol.est_association && (mol.composants || []).length) {
          const missing = mol.composants.filter(function (cid) { return !index[String(cid)]; });
          if (missing.length) {
            (await resolveIds(ctx, missing)).forEach(function (m) { index[String(m.id)] = m; });
          }
          comps = mol.composants.map(function (cid) { return index[String(cid)]; }).filter(playable);
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
        const candidats = filterPlayable(await resolveSel(ctx, b.filtre_json));
        candidats.forEach(function (m) { index[String(m.id)] = m; });
        packs.push({
          besoin: b,
          index: i,
          mode: 'aleatoire',
          mol: null,
          comps: [],
          candidats: candidats,
        });
      }
    }
    return { packs: packs, index: index, pool: pool, cfg: cfg };
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
      prep.packs.forEach(function (p, pi) {
        if (p.mode !== 'aleatoire') return;
        const hit = (p.candidats || []).some(function (m) {
          if (comps.has(String(m.id))) return true;
          return (m.composants || []).some(function (cid) { return comps.has(String(cid)); });
        });
        if (hit) idxs.push(pi);
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
    const compMols = (asso.composants || []).map(function (id) { return prep.index[String(id)]; }).filter(playable);
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

  function markUsed(used, mol) {
    if (!mol) return;
    used.add(String(mol.id));
    (mol.composants || []).forEach(function (id) { used.add(String(id)); });
  }

  function molAvailable(m, used, allowAsso) {
    if (!playable(m) || used.has(String(m.id))) return false;
    if (!allowAsso && m.est_association) return false;
    return true;
  }

  async function tirer(ctx) {
    const prep = await prepare(ctx);
    const cfg = prep.cfg;
    const used = new Set();
    const drawn = [];

    prep.packs.forEach(function (p) {
      if (p.mode !== 'manuel') return;
      if (!p.mol || !playable(p.mol)) return;
      const kind = p.mol.est_association ? 'association' : 'molecule';
      const molecules = kind === 'association' && p.comps.length >= 2 ? p.comps : [p.mol];
      drawn.push(Object.assign(makeLigne(p, p.mol, kind, molecules), { packIndex: p.index }));
      markUsed(used, p.mol);
      molecules.forEach(function (m) { markUsed(used, m); });
    });

    prep.packs.forEach(function (p) {
      if (p.mode !== 'aleatoire') return;
      const pool = (p.candidats || []).filter(function (m) { return molAvailable(m, used, false); });
      const fallback = (p.candidats || []).filter(function (m) { return molAvailable(m, used, true); });
      const pickFrom = pool.length ? pool : fallback;
      if (!pickFrom.length) return;
      const mol = pickFrom[Math.floor(Math.random() * pickFrom.length)];
      const kind = mol.est_association ? 'association' : 'molecule';
      let molecules = [mol];
      if (kind === 'association') {
        molecules = (mol.composants || []).map(function (id) { return prep.index[String(id)]; }).filter(playable);
        if (molecules.length < 2) molecules = [mol];
      }
      drawn.push(Object.assign(makeLigne(p, mol, kind, molecules), { packIndex: p.index }));
      markUsed(used, mol);
      molecules.forEach(function (m) { markUsed(used, m); });
    });

    drawn.sort(function (a, b) { return a.packIndex - b.packIndex; });
    const merged = tryMergeAsso(drawn, prep, cfg);
    return {
      lignes: merged,
      champs: (cfg.champs || []).slice(),
      associations_possibles: !!cfg.associations_possibles,
      libelle_nom_commercial: !!cfg.libelle_nom_commercial,
      counts: prep.packs.map(function (p) {
        return {
          ordre: p.besoin.ordre,
          mode: p.mode,
          n: p.mode === 'manuel' ? (p.mol ? 1 : 0) : (p.candidats || []).length,
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

  function molHeadline(mol, ligne, cfg) {
    if (ligne && ligne.kind === 'association' && cfg && cfg.libelle_nom_commercial) {
      const n = U.txt((ligne.noms && ligne.noms[0]) || (mol && mol.noms && mol.noms[0]));
      if (n) return n;
    }
    if (ligne && ligne.kind === 'association' && scoringMols(ligne).length >= 2) {
      return scoringMols(ligne).map(dciOf).filter(function (x) { return x && x !== '—'; }).join(' + ') || dciOf(mol);
    }
    return dciOf(mol);
  }

  function valsOf(mol, code) {
    return global.V3Champs.valeurs(mol, code);
  }

  function champLibelle(code) {
    return global.V3Champs.label(code);
  }

  function renderValsHtml(vals) {
    const list = (vals || []).map(function (v) { return U.txt(v); }).filter(Boolean);
    if (!list.length) return '—';
    return list.join(' · ');
  }

  /** Markup joueur aligné V2 (jp-v2-mol-card). */
  function renderSheet(tirage, opts) {
    opts = opts || {};
    const cfg = { libelle_nom_commercial: !!tirage.libelle_nom_commercial };
    const champs = tirage.champs || [];
    const lignes = tirage.lignes || [];
    const restLabel = champs.map(champLibelle).join(', ');
    const cards = [];

    lignes.forEach(function (ligne, li) {
      scoringMols(ligne).forEach(function (mol, mi) {
        const title = molHeadline(mol, ligne, cfg);
        const noms = nomsOf(mol) || (ligne.noms || []).map(function (n) { return U.txt(n); }).filter(Boolean).join(', ');
        const cardKey = li + ':' + mi;

        if (opts.play && !opts.revealed && opts.mode === 'detaille') {
          const fields = champs.map(function (code) {
            const ta = h('textarea', {
              class: 'v3-ordo-ta jp-field',
              rows: 2,
              'aria-label': champLibelle(code) + ' · ' + title,
            });
            const key = li + ':' + code;
            if (opts.saisies && opts.saisies[key]) ta.value = opts.saisies[key];
            ta.addEventListener('input', function () {
              if (opts.onInput) opts.onInput(key, ta.value);
            });
            return h('label', { class: 'v3-ordo-saie jp-field' },
              h('span', null, champLibelle(code)),
              ta
            );
          });
          cards.push(h('article', { class: 'jp-v2-mol-card', dataset: { line: String(cardKey) } },
            h('h3', null, title),
            noms ? h('p', { class: 'jp-muted' }, noms) : null,
            h('div', { class: 'v3-ordo-saisies v3-ordo-saisies-jp' }, fields)
          ));
        } else if (opts.play && !opts.revealed) {
          cards.push(h('article', { class: 'jp-v2-mol-card', dataset: { line: String(cardKey) } },
            h('h3', null, title),
            h('p', { class: 'jp-muted' }, noms || '—'),
            h('p', { class: 'jp-muted' }, 'À restituer : ' + restLabel)
          ));
        } else {
          let dlKids = [];
          champs.forEach(function (code) {
            dlKids.push(h('dt', null, champLibelle(code)));
            dlKids.push(h('dd', null, renderValsHtml(valsOf(mol, code))));
          });
          const showSub = ligne.kind === 'association' && scoringMols(ligne).length > 1;
          cards.push(h('article', { class: 'jp-v2-mol-card' },
            h('h3', null, showSub ? dciOf(mol) : title),
            h('p', { class: 'jp-muted' }, noms || '—'),
            h('dl', { class: 'jp-v2-champs-revealed' }, dlKids)
          ));
        }
      });
    });

    return h('div', { id: 'mols', class: 'v3-ordo-mols' }, cards.length ? cards : U.empty('Tirage impossible'));
  }

  function classesOf(mol) {
    return global.V3Champs.valeurs(mol, 'classe_therapeutique')
      .concat(global.V3Champs.valeurs(mol, 'classe_pharmacologique'));
  }

  function mentions(txt, other) {
    const n = global.V3Data.norm(txt);
    if (!n) return false;
    if (other.dci && n.indexOf(global.V3Data.norm(other.dci)) >= 0) return true;
    for (let ni = 0; ni < (other.noms || []).length; ni += 1) {
      const nn = global.V3Data.norm(other.noms[ni]);
      if (nn.length >= 3 && n.indexOf(nn) >= 0) return true;
    }
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
              contexte: champLibelle(code),
              saisie: saisie,
              attendu: att,
            });
          });
        });
      });
    });
    return items;
  }

  function firstCommercial(sub) {
    const s = U.txt(sub);
    if (!s) return '';
    return s.split(',')[0].trim();
  }

  function nomsFromHit(raw) {
    const n = raw && (raw.sub != null ? raw.sub : raw.noms);
    if (Array.isArray(n)) {
      return n.map(function (x) { return U.txt(typeof x === 'string' ? x : (x && (x.valeur || x.label))); }).filter(Boolean).join(', ');
    }
    return U.txt(n);
  }

  function formatSearchHit(it, isAsso) {
    const label = U.txt(it.label);
    const sub = nomsFromHit(it);
    const nc = firstCommercial(sub);
    if (isAsso && nc) {
      return { label: nc, sub: [label, sub].filter(Boolean).join(' · ') };
    }
    if (nc && label && global.V3Data.norm(sub).indexOf(global.V3Data.norm(label)) < 0) {
      return { label: label, sub: sub || nc };
    }
    return { label: label || nc, sub: sub };
  }

  function molTypeahead(ctx, onPick) {
    const input = h('input', {
      type: 'search',
      class: 'v3-ctrl',
      placeholder: 'DCI ou nom commercial',
      autocomplete: 'off',
      'aria-label': 'Molécule ou association',
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
        const ids = (hits || []).map(function (x) { return x.id; });
        const links = ids.length ? await ctx.data.composants(ids) : [];
        const compCount = {};
        (links || []).forEach(function (l) {
          compCount[l.matrice_id] = (compCount[l.matrice_id] || 0) + 1;
        });
        items = (hits || []).map(function (raw) {
          const isAsso = (compCount[raw.id] || 0) >= 2;
          const fmt = formatSearchHit(raw, isAsso);
          return {
            id: raw.id,
            label: fmt.label,
            sub: fmt.sub,
            est_association: isAsso,
          };
        });
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
    return wrap;
  }

  function ncOfFiche(r) {
    if (!r) return '';
    const noms = r.noms_commerciaux;
    if (Array.isArray(noms) && noms.length) {
      const x = noms[0];
      return U.txt(typeof x === 'string' ? x : (x && (x.valeur || x.label || x.texte)));
    }
    if (typeof noms === 'string' && noms) return U.txt(noms);
    return U.txt(r.nom_commercial);
  }

  function ficheLabel(row, isAsso) {
    const nc = ncOfFiche(row);
    const dci = U.txt(row && row.dci);
    if (isAsso && nc) return nc;
    return dci || nc || '';
  }

  function besoinSummary(ctx, b) {
    const cached = U.txt(b && b.cible_label);
    if (b && b.mode === 'manuel') return cached || 'Molécule à choisir';
    if (cached) return cached;
    const lab = U.txt(ctx.selection.label(b && b.filtre_json));
    if (!lab || lab === '—') return 'Filtre vide';
    return lab;
  }

  async function hydrateBesoinLabels(ctx, besoins) {
    const molIds = [];
    const wantBlocs = {};
    const wantLecs = {};
    const wantChaps = {};
    (besoins || []).forEach(function (b) {
      if (b.mode === 'manuel') {
        const id = b.association_id || b.matrice_id;
        if (id) molIds.push(String(id));
        return;
      }
      const fj = b.filtre_json || emptySel();
      (fj.bloc_ids || []).forEach(function (id) { wantBlocs[id] = true; });
      (fj.module_ids || []).forEach(function (id) { wantLecs[id] = true; });
      (fj.chapitre_ids || []).forEach(function (id) { wantChaps[id] = true; });
    });
    const [blocs, lessons, fiches, links, chaps] = await Promise.all([
      Object.keys(wantBlocs).length ? ctx.data.blocks() : [],
      Object.keys(wantLecs).length ? ctx.data.lessons() : [],
      molIds.length ? ctx.data.fiches(molIds) : [],
      molIds.length ? ctx.data.composants(molIds) : [],
      Object.keys(wantChaps).length ? ctx.data.chapters() : [],
    ]);
    const blocBy = {};
    (blocs || []).forEach(function (b) { blocBy[String(b.id)] = b; });
    const lecBy = {};
    (lessons || []).forEach(function (l) { lecBy[String(l.id)] = l; });
    const chapBy = {};
    (chaps || []).forEach(function (c) { chapBy[String(c.id)] = c; });
    const ficheBy = {};
    (fiches || []).forEach(function (r) { ficheBy[String(r.id)] = r; });
    const compCount = {};
    (links || []).forEach(function (l) {
      const k = String(l.matrice_id);
      compCount[k] = (compCount[k] || 0) + 1;
    });
    (besoins || []).forEach(function (b) {
      if (b.mode === 'manuel') {
        const id = String(b.association_id || b.matrice_id || '');
        const row = ficheBy[id];
        const isAsso = (compCount[id] || 0) >= 2;
        if (isAsso && b.matrice_id && !b.association_id) {
          b.association_id = b.matrice_id;
          b.matrice_id = null;
        }
        const lab = ficheLabel(row, isAsso);
        if (lab) b.cible_label = lab;
        return;
      }
      const fj = b.filtre_json || emptySel();
      const names = [];
      (fj.chapitre_ids || []).forEach(function (id) {
        const lab = U.txt(chapBy[String(id)] && chapBy[String(id)].label);
        if (lab) names.push(lab);
      });
      (fj.module_ids || []).forEach(function (id) {
        const lab = U.txt(lecBy[String(id)] && lecBy[String(id)].label);
        if (lab) names.push(lab);
      });
      (fj.bloc_ids || []).forEach(function (id) {
        const lab = U.txt(blocBy[String(id)] && blocBy[String(id)].label);
        if (lab) names.push(lab);
      });
      b.cible_label = names.length ? names.join(' · ') : U.txt(ctx.selection.label(fj));
    });
  }

  function mountBesoinEditor(body, meta, besoin, ctx, mounts, onDirty) {
    if (body._v3Mount) {
      const old = body._v3Mount;
      body._v3Mount = null;
      const idx = mounts.indexOf(old);
      if (idx >= 0) mounts.splice(idx, 1);
      old.destroy();
    }
    body.replaceChildren();
    meta.replaceChildren();

    if (besoin.mode === 'aleatoire') {
      const mountEl = h('div', { class: 'v3-ordo-sel' });
      const preview = h('div', { class: 'v3-ordo-candidats' });
      body.append(
        U.field('Filtre', mountEl, { col: true, tip: 'Leçon, bloc ou molécules de cette ligne.' }),
        preview
      );

      function paintPreview(mols) {
        const list = filterPlayable(mols || []);
        if (!list.length) {
          preview.replaceChildren(U.empty('Aucune molécule candidate'));
          return;
        }
        const shown = list.slice(0, 12);
        preview.replaceChildren(
          h('p', { class: 'v3-hint' }, list.length + ' candidate' + (list.length > 1 ? 's' : '')),
          U.list(shown, function (m) {
            const nc = U.txt(m.noms && m.noms[0]);
            return [
              h('span', { class: 'v3-ordo-item-lab' }, dciOf(m)),
              nc ? U.badge(nc) : null,
            ];
          }),
          list.length > 12 ? h('p', { class: 'v3-hint' }, '…') : null
        );
      }

      function paintMeta(mols) {
        const n = filterPlayable(mols || []).length;
        const lab = U.txt(ctx.selection.label(besoin.filtre_json));
        meta.replaceChildren(
          h('span', null, lab || 'Filtre vide'),
          U.badge(n + ' mol.')
        );
      }

      const api = ctx.selection.mount(mountEl, {
        value: besoin.filtre_json,
        compact: true,
        onChange: function (sel) {
          besoin.filtre_json = copySel(sel);
          besoin.cible_label = U.txt(ctx.selection.label(besoin.filtre_json));
          meta.replaceChildren(h('span', null, besoin.cible_label || 'Filtre vide'), U.badge('…'));
          void resolveSel(ctx, besoin.filtre_json).then(function (mols) {
            if (!body.isConnected) return;
            paintMeta(mols);
            paintPreview(mols);
          });
          if (onDirty) onDirty();
        },
      });
      mounts.push(api);
      body._v3Mount = api;
      if (selVide(ctx, besoin.filtre_json)) {
        meta.replaceChildren(h('span', { class: 'v3-muted' }, 'Filtre vide'));
        preview.replaceChildren();
      } else {
        void resolveSel(ctx, besoin.filtre_json).then(function (mols) {
          if (!body.isConnected) return;
          paintMeta(mols);
          paintPreview(mols);
        });
      }
    } else {
      const chipHost = h('div', { class: 'v3-chips v3-ordo-cible' });
      function paintCible() {
        const id = besoin.association_id || besoin.matrice_id;
        const lab = U.txt(besoin.cible_label);
        if (!id || !lab) {
          chipHost.replaceChildren();
          return;
        }
        chipHost.replaceChildren(U.chip(lab, {
          kind: 'molecule',
          onRemove: function () {
            besoin.matrice_id = null;
            besoin.association_id = null;
            besoin.cible_label = '';
            paintCible();
            if (onDirty) onDirty();
          },
        }));
      }
      paintCible();
      if ((besoin.matrice_id || besoin.association_id) && !U.txt(besoin.cible_label)) {
        const id = besoin.association_id || besoin.matrice_id;
        void Promise.all([ctx.data.fiches([id]), ctx.data.composants([id])]).then(function (pair) {
          const rows = pair[0];
          const links = pair[1];
          const r = rows && rows[0];
          if (!r || !chipHost.isConnected) return;
          const isAsso = (links || []).length >= 2;
          if (isAsso && besoin.matrice_id && !besoin.association_id) {
            besoin.association_id = besoin.matrice_id;
            besoin.matrice_id = null;
          }
          besoin.cible_label = ficheLabel(r, isAsso) || U.txt(r.dci) || '';
          paintCible();
          if (onDirty) onDirty();
        });
      }
      body.append(
        U.field('Molécule', molTypeahead(ctx, function (it) {
          if (it.est_association) {
            besoin.association_id = it.id;
            besoin.matrice_id = null;
          } else {
            besoin.matrice_id = it.id;
            besoin.association_id = null;
          }
          besoin.cible_label = U.txt(it.label) || U.txt(it.sub) || '';
          paintCible();
          if (onDirty) onDirty();
        }), { col: true, tip: 'DCI ou nom commercial, y compris les associations.' }),
        chipHost
      );
    }
  }

  async function applyFilterItem(item, draft) {
    Object.assign(draft, emptyBesoin(0, emptySel()));
    if (!item) return draft;
    if (item.kind === 'molecule') {
      draft.mode = 'manuel';
      draft.matrice_id = item.id;
      draft.cible_label = U.txt(item.label);
      return draft;
    }
    draft.mode = 'aleatoire';
    const fj = emptySel();
    if (item.kind === 'chapitre') {
      fj.chapitre_ids = [item.id];
      if (global.V3Selection.lessonIdsOfChapters) {
        fj.module_ids = await global.V3Selection.lessonIdsOfChapters([item.id]);
      } else {
        fj.module_ids = (item.lessonIds || []).slice();
      }
    } else if (item.kind === 'lecon') {
      fj.module_ids = [item.id];
    } else if (item.kind === 'bloc') {
      fj.bloc_ids = [item.id];
    }
    draft.filtre_json = copySel(fj);
    draft.cible_label = U.txt(item.label);
    return draft;
  }

  function createBesoinsAdder(ctx, cfg, mounts) {
    const draft = emptyBesoin(0, emptySel());
    let draftMount = null;
    const filterHost = h('div', { class: 'v3-ordo-sel-filter' });
    const draftBody = h('div', { class: 'v3-ordo-draft-body' });
    const draftMeta = h('div', { class: 'v3-ordo-besoin-meta' });
    const previewHost = h('div', { class: 'v3-sel-filter-preview', hidden: true });

    function resetDraft() {
      Object.assign(draft, emptyBesoin(0, emptySel()));
      previewHost.hidden = true;
      previewHost.replaceChildren();
      paintDraft();
    }

    function paintDraft() {
      if (draftMount) {
        draftMount.destroy();
        draftMount = null;
      }
      draftBody.replaceChildren();
      draftMeta.replaceChildren();
      const seg = U.segmented([
        { value: 'aleatoire', label: 'Aléatoire' },
        { value: 'manuel', label: 'Fixe' },
      ], draft.mode, function (v) {
        draft.mode = v;
        if (v === 'manuel') {
          draft.filtre_json = emptySel();
        } else {
          draft.matrice_id = null;
          draft.association_id = null;
          draft.cible_label = '';
        }
        paintDraft();
        syncDraftReady();
      });
      const inner = h('div', { class: 'v3-ordo-besoin-body' });
      draftBody.append(
        U.field('Tirage', seg, { tip: 'Aléatoire : une molécule du filtre. Fixe : molécule ou association choisie.' }),
        inner,
        draftMeta
      );
      const localMounts = [];
      mountBesoinEditor(inner, draftMeta, draft, ctx, localMounts, syncDraftReady);
      draftMount = {
        destroy: function () {
          localMounts.forEach(function (m) { if (m.destroy) m.destroy(); });
        },
      };
      syncDraftReady();
    }

    function syncDraftReady() {
      if (!adderApi) return;
      if (draft.mode === 'manuel') {
        adderApi.setDraftReady(!!(draft.matrice_id || draft.association_id));
        return;
      }
      if (selVide(ctx, draft.filtre_json)) {
        adderApi.setDraftReady(false);
        return;
      }
      void resolveSel(ctx, draft.filtre_json).then(function (mols) {
        if (!adderApi) return;
        adderApi.setDraftReady(filterPlayable(mols).length > 0);
      }).catch(function () {
        if (adderApi) adderApi.setDraftReady(false);
      });
    }

    let adderApi = null;
    const ad = U.adder({
      title: 'Ajouter un besoin',
      propose: false,
      items: function () { return cfg.besoins; },
      empty: 'Aucun besoin',
      draft: function (host, api) {
        adderApi = api;
        host.append(filterHost, previewHost, draftBody);
        if (global.V3SelFilter) {
          global.V3SelFilter.mount(filterHost, {
            pool: function () { return selOf(ctx); },
            onPick: function (item) {
              void applyFilterItem(item, draft).then(function () {
                paintDraft();
                const nMol = (item.molecules || []).length;
                previewHost.hidden = false;
                previewHost.replaceChildren(
                  h('p', { class: 'v3-hint' },
                    (U.txt(item.label) || 'Élément')
                    + (nMol ? ' · ' + nMol + ' molécule' + (nMol > 1 ? 's' : '') : '')
                    + ' — Ajouter pour l’inclure.'
                  )
                );
                syncDraftReady();
              });
            },
          });
        }
        paintDraft();
      },
      onAdd: function () {
        const b = normBesoin({
          mode: draft.mode,
          matrice_id: draft.matrice_id,
          association_id: draft.association_id,
          filtre_json: copySel(draft.filtre_json),
          cible_label: U.txt(draft.cible_label),
        }, cfg.besoins.length);
        cfg.besoins.push(b);
        reindex(cfg);
        previewHost.hidden = true;
        previewHost.replaceChildren();
        resetDraft();
      },
      onChange: function () { ctx.changed(); },
      renderItem: function (besoin, i, api) {
        const body = h('div', { class: 'v3-ordo-besoin-body' });
        const meta = h('div', { class: 'v3-ordo-besoin-meta' });
        const main = h('div', { class: 'v3-ordo-item-main' },
          h('div', { class: 'v3-ordo-item-head' },
            U.badge(besoin.mode === 'manuel' ? 'Fixe' : 'Aléatoire'),
            h('span', { class: 'v3-ordo-item-lab' }, besoinSummary(ctx, besoin))
          ),
          h('details', { class: 'v3-ordo-besoin-edit' },
            h('summary', null, 'Modifier'),
            body,
            meta
          )
        );
        const details = main.querySelector('details');
        details.addEventListener('toggle', function () {
          if (details.open) mountBesoinEditor(body, meta, besoin, ctx, mounts, function () { ctx.changed(); api.refresh(); });
          else if (body._v3Mount) {
            body._v3Mount.destroy();
            body._v3Mount = null;
          }
        });
        return [
          U.badge(String(i + 1)),
          main,
          h('div', { class: 'v3-ordo-besoin-act' },
            U.button('↑', {
              variant: 'ghost',
              disabled: i === 0,
              onClick: function () { api.move(i, -1); reindex(cfg); },
            }),
            U.button('↓', {
              variant: 'ghost',
              disabled: i >= cfg.besoins.length - 1,
              onClick: function () { api.move(i, 1); reindex(cfg); },
            }),
            U.button('×', {
              variant: 'ghost',
              onClick: function () { api.remove(i); reindex(cfg); },
            })
          ),
        ];
      },
    });
    return { ad: ad };
  }

  function params(el, ctx) {
    const cfg = ensureBesoinsFromPool(ctx);

    const nbCtrl = U.number(cfg.besoins.length, {
      min: 0,
      max: 15,
      step: 1,
      onChange: function (n) {
        n = Math.max(0, Math.min(15, n));
        while (cfg.besoins.length < n) {
          cfg.besoins.push(emptyBesoin(cfg.besoins.length + 1, emptySel()));
        }
        while (cfg.besoins.length > n) {
          const last = cfg.besoins[cfg.besoins.length - 1];
          if (!besoinEmpty(last)) {
            U.toast('Retirez ou videz le dernier besoin avant de réduire', 'err');
            nbCtrl.setValue(cfg.besoins.length);
            return;
          }
          cfg.besoins.pop();
        }
        reindex(cfg);
        ctx.changed();
      },
    });

    const champs = U.checks(champOpts(), cfg.champs, function (vals) {
      cfg.champs = vals;
      ctx.changed();
    });

    el.replaceChildren(
      h('div', { class: 'v3-stack v3-ordo-params' },
        U.card('Composition',
          U.grid(2,
            U.field('Besoins', nbCtrl, {
              tip: 'Nombre de lignes. Le détail se règle à l’étape Personnalisation.',
            }),
            U.field('Associations', U.switch('Autoriser', cfg.associations_possibles, function (on) {
              cfg.associations_possibles = on;
              ctx.changed();
            }), { tip: 'Deux besoins aléatoires peuvent fusionner sur une association publiée.' })
          ),
          U.field('Libellé associations', U.switch('Nom commercial', cfg.libelle_nom_commercial, function (on) {
            cfg.libelle_nom_commercial = on;
            ctx.changed();
          }), { tip: 'Ligne joueur : titre = 1er nom commercial si association.' })
        ),
        U.card('Restitution',
          U.field('Champs à restituer', champs, {
            col: true,
            tip: 'DCI et noms restent visibles. Au moins un champ pédagogique.',
          })
        )
      )
    );
  }

  function perso(el, ctx) {
    const cfg = ensureBesoinsFromPool(ctx);
    const mounts = [];
    const adder = createBesoinsAdder(ctx, cfg, mounts);
    el.replaceChildren(
      h('div', { class: 'v3-stack v3-ordo-perso' }, adder.ad.el)
    );
    adder.ad.refresh();
    void hydrateBesoinLabels(ctx, cfg.besoins).then(function () {
      adder.ad.refresh();
    }).catch(function () {
      adder.ad.refresh();
    });
  }

  function essai(el, ctx) {
    ensureBesoinsFromPool(ctx);
    const panel = U.essaiPanel({ title: 'Tirage' });
    el.append(
      U.button('Tester un tirage', {
        variant: 'ghost',
        onClick: function () { void run(); },
      }),
      panel.el
    );

    async function run() {
      panel.open();
      panel.body.replaceChildren(U.empty('…'));
      try {
        const t = await tirer(ctx);
        const countsEl = U.list(t.counts || [], function (c) {
          const mode = c.mode === 'manuel' ? 'Fixe' : 'Aléatoire';
          const extra = c.mode === 'manuel' ? '' : ((c.n || 0) + ' mol.');
          return [
            U.badge(String(c.ordre)),
            U.badge(mode),
            extra ? h('span', { class: 'v3-ordo-item-lab' }, extra) : h('span', { class: 'v3-ordo-item-lab' }, 'Ligne ' + c.ordre),
          ];
        });
        const sheetEl = h('div');
        sheetEl.appendChild(renderSheet(t, { preview: true, revealed: true }));
        panel.body.replaceChildren(countsEl, sheetEl);
      } catch (e) {
        panel.body.replaceChildren(U.empty(e.message || 'Tirage impossible'));
      }
    }
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
    const modeHost = h('div', { class: 'v3-ordo-mode' });
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
          const actHost = h('div', { class: 'jp-v2-actions v3-ordo-actions' });
          main.replaceChildren(sheetHost, vigilHost, noteHost, actHost);

          function paintSheet() {
            sheetHost.replaceChildren(renderSheet(tirage, {
              play: true,
              mode: mode,
              revealed: revealed,
              saisies: saisies,
              onInput: function (key, val) { saisies[key] = val; },
            }));
          }

          function afterReveal() {
            const vig = renderVigil(vigilance(tirage));
            if (vig) vigilHost.replaceChildren(vig);
            if (mode === 'rapide') {
              global.V3Notation.rapide(noteHost, {
                onScore: function (score) {
                  actHost.replaceChildren();
                  void submitDeclare(session, tirage, 'rapide', {
                    fin: { obtenu: score, max: 10, details: [] },
                    rpc: { obtenu: score, max: 10, details: [] },
                  }, saisies, false);
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
              const actKids = [
                U.button('Valider', {
                  variant: 'primary',
                  onClick: function () { finDetail(false); },
                }),
              ];
              if (session.reel) {
                actKids.push(U.button('Valider + relecture admin', {
                  variant: 'ghost',
                  onClick: function () { finDetail(true); },
                }));
              }
              actHost.replaceChildren.apply(actHost, actKids);
            }
          }

          paintSheet();
          actHost.appendChild(h('button', {
            type: 'button',
            class: 'jp-btn jp-btn-primary',
            id: 'btnReveal',
            onClick: function () {
              revealed = true;
              paintSheet();
              actHost.replaceChildren();
              afterReveal();
            },
          }, 'Voir les réponses'));
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
    essai: essai,
    play: play,
    validate: validate,
    payload: payload,
  });
})(window);
