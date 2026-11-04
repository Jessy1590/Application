/**
 * Jeux V3 — play layer (table `jeux` + RPC jeu_*).
 * Délégation depuis JpJeuxPlay.boot quand jeu_charger réussit.
 */
(function (global) {
  function sb() {
    return global.JpApp.sbJeu();
  }

  function esc(s) {
    return global.JpUi.escapeHtml(String(s ?? ''));
  }

  function champLibelle(code) {
    const c = (global.JpConstants?.CHAMP_CODES || []).find((x) => x.code === code);
    return c?.libelle || code;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function pick(arr) {
    if (!arr || !arr.length) return null;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function uid() {
    return 'q' + Math.random().toString(36).slice(2, 10);
  }

  function contexteOf(opts) {
    return opts && opts.passageId ? 'examen' : 'classique';
  }

  function valeursChamp(fiche, code) {
    return ((fiche?.champs || {})[code] || [])
      .map((it) => it.valeur)
      .filter(Boolean);
  }

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args || {});
    if (error) throw error;
    return data;
  }

  async function loadJeu(code) {
    const data = await rpc('jeu_charger', { p_code: String(code || '').trim() });
    if (!data || !data.id) throw new Error('Jeu introuvable');
    return data;
  }

  async function typeConfig(jeuId) {
    return rpc('jeu_type_config', { p_jeu_id: jeuId });
  }

  /* ——— Anti-similarité (adapté V2, plafond par difficulté) ——— */
  const QUIZ_ALIASES = {
    hta: 'hypertension arterielle',
    hypertension: 'hypertension arterielle',
    'hypertension arterielle': 'hypertension arterielle',
    'pression arterielle': 'hypertension arterielle',
    avc: 'accident vasculaire cerebral',
    idm: 'infarctus du myocarde',
    infarctus: 'infarctus du myocarde',
    fa: 'fibrillation auriculaire',
    'fibrillation atriale': 'fibrillation auriculaire',
  };

  function normQuizText(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function canonQuizText(s) {
    const n = normQuizText(s);
    return QUIZ_ALIASES[n] || n;
  }

  function tokenSet(s) {
    return new Set(canonQuizText(s).split(' ').filter(Boolean));
  }

  function jaccardTokens(a, b) {
    const A = tokenSet(a);
    const B = tokenSet(b);
    if (!A.size || !B.size) return 0;
    let inter = 0;
    A.forEach((t) => { if (B.has(t)) inter += 1; });
    return inter / (A.size + B.size - inter);
  }

  function maxSimForDifficulte(d) {
    const n = Math.max(1, Math.min(3, Number(d) || 1));
    if (n === 1) return 0.2;
    if (n === 2) return 0.5;
    return 0.8;
  }

  function quizTooClose(a, b, maxSim) {
    const ca = canonQuizText(a);
    const cb = canonQuizText(b);
    if (!ca || !cb) return false;
    if (ca === cb) return true;
    if (jaccardTokens(a, b) >= maxSim) return true;
    return false;
  }

  function pickDistinctDistractor(candidates, correct, already, maxSim) {
    const pool = shuffle(candidates.filter(Boolean));
    for (let i = 0; i < pool.length; i++) {
      const v = pool[i];
      if (quizTooClose(v, correct, maxSim)) continue;
      if (already.some((x) => quizTooClose(x, v, maxSim))) continue;
      return v;
    }
    return null;
  }

  /* ——— Pool ——— */
  function collectMatriceIdsFromPayload(payload) {
    const ids = new Set();
    function fromLayer(src) {
      if (!src || typeof src !== 'object') return;
      if (Array.isArray(src.matrice_ids)) {
        src.matrice_ids.forEach((id) => { if (id) ids.add(String(id)); });
      } else if (src.matrice_id) {
        ids.add(String(src.matrice_id));
      }
    }
    const p = payload && typeof payload === 'object' ? payload : {};
    fromLayer(p);
    const draft = p._brouillon && p._brouillon.payload;
    if (draft) fromLayer(draft);
    const variantes = p.variantes && typeof p.variantes === 'object' ? p.variantes : {};
    Object.keys(variantes).forEach((k) => fromLayer(variantes[k]));
    return Array.from(ids);
  }

  /** Parcours réel des modules (pas le lab du jeu) — pubs DEUST OK. */
  async function modulesParcoursMap(moduleIds) {
    const mids = Array.from(new Set((moduleIds || []).filter(Boolean).map(String)));
    const map = {};
    if (!mids.length) return map;
    const { data, error } = await sb()
      .from('modules_cours')
      .select('id, parcours_id')
      .in('id', mids);
    if (error) throw error;
    (data || []).forEach((m) => { map[String(m.id)] = m.parcours_id || null; });
    return map;
  }

  async function listerMedicamentsParScope(moduleIds) {
    const mids = Array.from(new Set((moduleIds || []).filter(Boolean).map(String)));
    if (!mids.length) return [];
    const pmap = await modulesParcoursMap(mids);
    const byParcours = {};
    mids.forEach((id) => {
      const pid = pmap[id] || '_null';
      if (!byParcours[pid]) byParcours[pid] = [];
      byParcours[pid].push(id);
    });
    const out = new Map();
    for (const pid of Object.keys(byParcours)) {
      const rows = await global.JpV2Resolver.listerMedicaments({
        parcoursId: pid === '_null' ? null : pid,
        moduleIds: byParcours[pid],
      });
      (rows || []).forEach((r) => {
        if (r && r.id) out.set(String(r.id), r);
      });
    }
    return Array.from(out.values());
  }

  const ENTITE_PLAY = {
    secteurs_therapeutiques: { liaison: 'matrice_secteurs_therapeutiques', fk: 'secteur_therapeutique_id' },
    classes_therapeutiques: { liaison: 'matrice_classes_therapeutiques', fk: 'classe_therapeutique_id' },
    classes_pharmacologiques: { liaison: 'matrice_classes_pharmacologiques', fk: 'classe_pharmacologique_id' },
  };
  const ENTITE_BY_MODE = {
    secteur: 'secteurs_therapeutiques',
    classe_thera: 'classes_therapeutiques',
    classe_pharma: 'classes_pharmacologiques',
  };

  async function matriceIdsForEntite(table, entityIds) {
    const meta = ENTITE_PLAY[table];
    const uniq = Array.from(new Set((entityIds || []).filter(Boolean).map(String)));
    if (!meta || !uniq.length) return [];
    const { data, error } = await sb()
      .from(meta.liaison)
      .select('matrice_id, ' + meta.fk)
      .in(meta.fk, uniq);
    if (error) throw error;
    const ids = [];
    (data || []).forEach((row) => {
      const mid = row.matrice_id != null ? String(row.matrice_id) : '';
      if (mid && ids.indexOf(mid) < 0) ids.push(mid);
    });
    return ids;
  }

  async function resolvePoolMatriceIds(jeu, filtreOverride) {
    const pool = filtreOverride || jeu.pool || {};
    const mode = String(pool.mode || 'lecons');
    const moduleIds = Array.isArray(pool.module_ids) ? pool.module_ids.filter(Boolean).map(String) : [];
    const blocIds = Array.isArray(pool.bloc_ids) ? pool.bloc_ids.filter(Boolean).map(String) : [];
    const matriceIds = Array.isArray(pool.matrice_ids) ? pool.matrice_ids.filter(Boolean).map(String) : [];
    const entiteIds = Array.isArray(pool.entite_ids) ? pool.entite_ids.filter(Boolean).map(String) : [];

    if (mode === 'molecules') return matriceIds;

    if (mode === 'blocs') {
      const ids = new Set();
      if (!blocIds.length) return [];
      const { data, error } = await sb()
        .from('module_blocs')
        .select('id, payload_json, type_bloc')
        .in('id', blocIds);
      if (error) throw error;
      (data || []).forEach((b) => {
        if (b.type_bloc === 'molecule') {
          collectMatriceIdsFromPayload(b.payload_json).forEach((id) => ids.add(id));
        }
      });
      return Array.from(ids);
    }

    if (mode === 'secteur' || mode === 'classe_thera' || mode === 'classe_pharma' || mode === 'entite') {
      const table = pool.entite || ENTITE_BY_MODE[mode] || '';
      return matriceIdsForEntite(table, entiteIds);
    }

    // lecons — scope = parcours des modules choisis (pas jeu.parcours_id lab)
    const mids = moduleIds.length
      ? moduleIds
      : (filtreOverride ? [] : (Array.isArray(jeu.module_ids) ? jeu.module_ids.filter(Boolean).map(String) : []));
    if (!mids.length) return [];
    const rows = await listerMedicamentsParScope(mids);
    return (rows || []).map((r) => String(r.id)).filter(Boolean);
  }

  async function resolveFichesScope(jeu) {
    const pool = jeu.pool || {};
    const mode = String(pool.mode || 'lecons');
    let moduleIds = Array.isArray(pool.module_ids) ? pool.module_ids.filter(Boolean).map(String) : [];
    if (mode === 'blocs' && Array.isArray(pool.bloc_ids) && pool.bloc_ids.length) {
      const { data } = await sb()
        .from('module_blocs')
        .select('module_id')
        .in('id', pool.bloc_ids);
      moduleIds = Array.from(new Set((data || []).map((b) => b.module_id).filter(Boolean).map(String)));
    }
    if (!moduleIds.length && Array.isArray(jeu.module_ids)) {
      moduleIds = jeu.module_ids.filter(Boolean).map(String);
    }
    if (!moduleIds.length) {
      return { parcoursId: null, moduleIds: null };
    }
    const pmap = await modulesParcoursMap(moduleIds);
    const parcoursIds = Array.from(new Set(Object.values(pmap).filter(Boolean)));
    // Un seul parcours → le passer ; sinon null pour ne pas forcer le lab
    return {
      parcoursId: parcoursIds.length === 1 ? parcoursIds[0] : null,
      moduleIds: moduleIds,
    };
  }

  async function loadPoolFiches(jeu, matriceIds) {
    const ids = Array.from(new Set((matriceIds || []).filter(Boolean)));
    if (!ids.length) return [];
    const scope = await resolveFichesScope(jeu);
    const map = await global.JpV2Resolver.fichesResolues(ids, {
      parcoursId: scope.parcoursId,
      moduleIds: scope.moduleIds,
    });
    return ids.map((id) => {
      const f = map[id] || map[String(id)];
      if (!f) return null;
      return {
        id: String(f.id || id),
        dci: f.dci || '',
        noms: (f.noms_commerciaux || []).map((n) => n.valeur).filter(Boolean).join(', '),
        fiche: f,
        composants: Array.isArray(f.composants) ? f.composants : [],
      };
    }).filter(Boolean);
  }

  /* ——— Score card ——— */
  async function showScore(root, jeu, obtenu, max, opts) {
    const host = document.createElement('div');
    host.id = 'jpScoreHost';
    root.innerHTML = '';
    root.appendChild(host);
    const stub = {
      id: jeu.id,
      code_unique: jeu.code_unique,
      parcours_id: jeu.parcours_id,
      type_jeu: jeu.type_jeu,
      _playOpts: opts || {},
    };
    if (global.JpJeuxPlay?.mountScoreCard) {
      await global.JpJeuxPlay.mountScoreCard(host, stub, obtenu, max, {
        embed: !!(opts && opts.embed),
        moduleId: opts && opts.moduleId,
        parcoursId: opts && opts.parcoursId,
        onReplay: opts && opts.onReplay,
        onFinished: opts && opts.onFinished,
        singleAttempt: !!(opts && opts.singleAttempt),
        saved: Promise.resolve(),
      });
      return;
    }
    host.innerHTML = '<section class="jp-score-card"><p class="jp-score-value">'
      + esc(String(obtenu)) + ' <small>/ ' + esc(String(max)) + '</small></p></section>';
    if (typeof opts?.onFinished === 'function') opts.onFinished({ obtenu: obtenu, max: max });
  }

  /* ——— Quiz ——— */
  function buildManualQuestions(cfg) {
    const raw = Array.isArray(cfg.questions) ? cfg.questions : [];
    return raw.map(function (q) {
      const props = (Array.isArray(q.propositions) ? q.propositions : [])
        .map(function (p) {
          if (p && typeof p === 'object') {
            return { texte: String(p.texte || '').trim(), est_correcte: !!p.est_correcte };
          }
          return null;
        })
        .filter((p) => p && p.texte);
      const correct = (props.find((p) => p.est_correcte) || {}).texte || '';
      const enonce = String(q.enonce || '').trim();
      if (!enonce || props.length < 2 || !correct) return null;
      return {
        id: String(q.id || uid()),
        enonce: enonce,
        champ: null,
        propositions: shuffle(props.slice()),
        correct: correct,
      };
    }).filter(Boolean);
  }

  async function buildAutoQuestions(jeu, pool, cfg, limit) {
    const champs = Array.isArray(cfg.champs) ? cfg.champs.filter(Boolean) : [];
    if (!pool.length || !champs.length) return [];
    const target = Math.max(1, Number(limit) || Number(cfg.nb_auto) || 5);
    const nbProp = Math.max(2, Math.min(6, Number(cfg.nb_propositions) || 3));
    const maxSim = maxSimForDifficulte(cfg.difficulte);
    const sens = String(cfg.sens_auto || 'mol_vers_valeur');
    const questions = [];
    const used = new Set();
    let guard = 0;

    while (questions.length < target && guard < target * 14) {
      guard += 1;
      const med = pick(pool);
      if (!med || !med.fiche) break;
      const champ = pick(champs);
      const key = med.id + ':' + champ;
      if (used.has(key)) continue;
      const corrects = valeursChamp(med.fiche, champ);
      if (!corrects.length) continue;
      const correctVal = pick(corrects);
      used.add(key);

      const distractors = [];
      const others = shuffle(pool.filter((p) => p.id !== med.id));
      for (const o of others) {
        if (distractors.length >= nbProp - 1) break;
        const vals = valeursChamp(o.fiche, champ).filter((v) => v && v !== correctVal);
        const d = pickDistinctDistractor(vals, correctVal, distractors, maxSim);
        if (d) distractors.push(d);
      }
      if (distractors.length < 1) continue;

      let enonce;
      let correct;
      let propTexts;
      const useMolVers = sens === 'mol_vers_valeur' || (sens === 'les_deux' && Math.random() < 0.5);
      if (useMolVers) {
        enonce = 'Pour « ' + (med.dci || 'molécule') + ' », quelle est une valeur correcte pour « '
          + champLibelle(champ) + ' » ?';
        correct = correctVal;
        propTexts = shuffle([correctVal].concat(distractors).slice(0, nbProp));
      } else {
        enonce = 'Quelle molécule correspond à « ' + correctVal + ' » (' + champLibelle(champ) + ') ?';
        correct = med.dci || med.noms || med.id;
        const wrongMols = shuffle(others).slice(0, nbProp - 1).map((o) => o.dci || o.noms).filter(Boolean);
        if (wrongMols.length < 1) continue;
        propTexts = shuffle([correct].concat(wrongMols).slice(0, nbProp));
      }

      const unique = [];
      propTexts.forEach((p) => {
        if (!unique.some((u) => quizTooClose(u, p, maxSim))) unique.push(p);
      });
      if (unique.length < 2 || unique.indexOf(correct) < 0) continue;

      questions.push({
        id: uid(),
        enonce: enonce,
        champ: champ,
        propositions: unique.map((t) => ({ texte: t, est_correcte: t === correct })),
        correct: correct,
      });
    }
    return questions;
  }

  async function buildQuizSnapshot(jeu, cfg) {
    const style = String(cfg.style || 'manuel');
    const nbWanted = Math.max(1, Number(cfg.nb_questions) || 10);
    const manuelles = buildManualQuestions(cfg);
    let auto = [];
    if (style === 'auto' || style === 'mixte') {
      const ids = await resolvePoolMatriceIds(jeu);
      const pool = await loadPoolFiches(jeu, ids);
      const autoCap = style === 'mixte'
        ? Math.max(0, Number(cfg.nb_auto) || Math.max(0, nbWanted - manuelles.length))
        : Math.max(1, Number(cfg.nb_auto) || nbWanted);
      auto = await buildAutoQuestions(jeu, pool, cfg, autoCap);
    }
    let bank;
    if (style === 'manuel') bank = shuffle(manuelles);
    else if (style === 'auto') bank = shuffle(auto);
    else {
      const nMan = Math.min(manuelles.length, Math.max(0, Number(cfg.nb_manuelles) || manuelles.length));
      bank = shuffle(shuffle(manuelles).slice(0, nMan).concat(auto));
    }
    const questions = bank.slice(0, Math.min(nbWanted, bank.length));
    if (!questions.length) throw new Error('Aucune question générée');
    return { questions: questions };
  }

  function renderQuizPlay(root, jeu, session, opts) {
    const contexte = session.contexte || 'classique';
    const questions = (session.snapshot && session.snapshot.questions) || [];
    const answers = {};
    let idx = 0;

    function paint() {
      if (idx >= questions.length) {
        void finish();
        return;
      }
      const q = questions[idx];
      const props = Array.isArray(q.propositions) ? q.propositions : [];
      root.innerHTML = '<p class="jp-muted">Question ' + (idx + 1) + ' / ' + questions.length + '</p>'
        + (q.champ ? '<p class="jp-badge">' + esc(champLibelle(q.champ)) + '</p>' : '')
        + '<h2 class="jp-title" style="font-size:1.25rem">' + esc(q.enonce) + '</h2>'
        + '<div class="jp-v2-props" id="props">'
        + props.map(function (p, i) {
          const texte = typeof p === 'object' ? (p.texte || '') : String(p || '');
          return '<button type="button" class="jp-btn jp-btn-ghost jp-v2-prop" data-i="' + i + '">'
            + esc(texte) + '</button>';
        }).join('') + '</div>';

      root.querySelectorAll('.jp-v2-prop').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const i = Number(btn.getAttribute('data-i'));
          const p = props[i];
          const texte = typeof p === 'object' ? (p.texte || '') : String(p || '');
          const estOk = typeof p === 'object' ? !!p.est_correcte : (texte === q.correct);
          answers[q.id] = texte;
          if (contexte === 'classique') {
            root.querySelectorAll('.jp-v2-prop').forEach(function (b) {
              b.disabled = true;
              const pi = props[Number(b.getAttribute('data-i'))];
              const t = typeof pi === 'object' ? pi.texte : String(pi || '');
              const ok = typeof pi === 'object' ? !!pi.est_correcte : (t === q.correct);
              if (ok) b.classList.add('is-ok');
              if (Number(b.getAttribute('data-i')) === i && !estOk) b.classList.add('is-ko');
            });
            setTimeout(function () { idx += 1; paint(); }, 550);
          } else {
            idx += 1;
            paint();
          }
        });
      });
    }

    async function finish() {
      root.innerHTML = '<p class="jp-muted">Correction…</p>';
      try {
        const res = await rpc('jeu_soumettre_quiz', {
          p_tentative_id: session.tentative_id,
          p_reponses: answers,
        });
        const obtenu = Number(res.score_obtenu) || 0;
        const max = Number(res.score_max) || questions.length;
        await showScore(root, jeu, obtenu, max, opts);
      } catch (e) {
        global.JpToast?.fromError?.(e);
        root.innerHTML = '<p class="jp-muted">' + esc(e.message || String(e)) + '</p>';
      }
    }

    paint();
  }

  async function runQuiz(root, jeu, cfg, opts) {
    root.innerHTML = '<p class="jp-muted">Préparation du quiz…</p>';
    const snapshot = await buildQuizSnapshot(jeu, cfg || {});
    const session = await rpc('jeu_demarrer_quiz', {
      p_jeu_id: jeu.id,
      p_snapshot: snapshot,
      p_contexte: contexteOf(opts),
      p_passage_id: opts && opts.passageId ? opts.passageId : null,
    });
    renderQuizPlay(root, jeu, session, opts);
  }

  /* ——— Classement ——— */
  function runClassement(root, jeu, cfg, opts) {
    const items = Array.isArray(cfg?.items) ? cfg.items.slice() : [];
    const zones = Array.isArray(cfg?.zones) ? cfg.zones.map(function (z) {
      return { id: z.id, label: z.label, item_ids: Array.isArray(z.item_ids) ? z.item_ids.slice() : [] };
    }) : [];
    if (items.length < 2 || zones.length < 2) throw new Error('Configuration classement incomplète');

    const placement = {};
    items.forEach((it) => { placement[it.id] = null; });
    let selectedId = null;
    const pile = shuffle(items);
    const embed = !!(opts && opts.embed);
    let tentativeId = null;

    async function start() {
      root.innerHTML = '<p class="jp-muted">Démarrage…</p>';
      const session = await rpc('jeu_demarrer_classement', {
        p_jeu_id: jeu.id,
        p_contexte: contexteOf(opts),
        p_passage_id: opts && opts.passageId ? opts.passageId : null,
      });
      tentativeId = session.tentative_id;
      paint(false);
    }

    function paint(done) {
      if (done) return;
      const unplaced = pile.filter((it) => !placement[it.id]);
      let html = '';
      if (cfg.consigne) html += '<p class="jp-muted">' + esc(cfg.consigne) + '</p>';
      if (embed) {
        html += '<div class="jp-classement jp-classement--embed">'
          + '<div class="jp-classement-banner" aria-label="Items">'
          + (unplaced.length
            ? unplaced.map((it) => '<button type="button" class="jp-classement-item'
              + (selectedId === it.id ? ' is-selected' : '') + '" draggable="true" data-item="'
              + esc(it.id) + '">' + esc(it.label) + '</button>').join('')
            : '<span class="jp-muted">Tous placés</span>')
          + '</div><div class="jp-classement-zones">';
      } else {
        html += '<div class="jp-classement">'
          + '<div class="jp-classement-pile" aria-label="Items">'
          + '<p class="jp-classement-col-title">À classer</p>'
          + (unplaced.length
            ? unplaced.map((it) => '<button type="button" class="jp-classement-item'
              + (selectedId === it.id ? ' is-selected' : '') + '" draggable="true" data-item="'
              + esc(it.id) + '">' + esc(it.label) + '</button>').join('')
            : '<p class="jp-muted">Tous placés</p>')
          + '</div><div class="jp-classement-zones">';
      }
      zones.forEach(function (z) {
        const inZone = items.filter((it) => placement[it.id] === z.id);
        html += '<div class="jp-classement-zone" data-zone="' + esc(z.id) + '">'
          + '<p class="jp-classement-col-title">' + esc(z.label) + '</p>'
          + '<div class="jp-classement-drop">'
          + (inZone.length
            ? inZone.map((it) => '<button type="button" class="jp-classement-item is-placed" draggable="true" data-item="'
              + esc(it.id) + '">' + esc(it.label) + '</button>').join('')
            : '<span class="jp-muted jp-classement-hint">Déposer ici</span>')
          + '</div></div>';
      });
      html += '</div></div><div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnVerify"'
        + (unplaced.length ? ' disabled' : '') + '>Valider</button></div>';
      root.innerHTML = html;

      function place(itemId, zoneId) {
        if (!itemId) return;
        placement[itemId] = zoneId || null;
        selectedId = null;
        paint(false);
      }

      root.querySelectorAll('.jp-classement-item').forEach(function (btn) {
        const id = btn.getAttribute('data-item');
        btn.addEventListener('click', function () {
          if (selectedId === id) { selectedId = null; paint(false); return; }
          selectedId = id;
          paint(false);
        });
        btn.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', id);
          e.dataTransfer.effectAllowed = 'move';
        });
      });
      root.querySelectorAll('.jp-classement-zone').forEach(function (zoneEl) {
        const zid = zoneEl.getAttribute('data-zone');
        zoneEl.addEventListener('dragover', function (e) { e.preventDefault(); });
        zoneEl.addEventListener('drop', function (e) {
          e.preventDefault();
          place(e.dataTransfer.getData('text/plain') || selectedId, zid);
        });
        zoneEl.addEventListener('click', function (e) {
          if (e.target.closest('.jp-classement-item')) return;
          if (selectedId) place(selectedId, zid);
        });
      });
      document.getElementById('btnVerify')?.addEventListener('click', async function () {
        try {
          const res = await rpc('jeu_soumettre_classement', {
            p_tentative_id: tentativeId,
            p_placements: placement,
          });
          await showScore(root, jeu, Number(res.score_obtenu) || 0, Number(res.score_max) || items.length, opts);
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
    }

    void start();
  }

  /* ——— Appariement ——— */
  function runAppariement(root, jeu, cfg, opts) {
    const gauche = Array.isArray(cfg?.gauche) ? cfg.gauche.slice() : [];
    const droite = Array.isArray(cfg?.droite) ? cfg.droite.slice() : [];
    if (gauche.length < 2 || droite.length < 2) throw new Error('Configuration appariement incomplète');
    const links = {};
    let selectedG = null;
    const orderG = shuffle(gauche);
    const orderD = shuffle(droite);
    let tentativeId = null;

    async function start() {
      root.innerHTML = '<p class="jp-muted">Démarrage…</p>';
      const session = await rpc('jeu_demarrer_appariement', {
        p_jeu_id: jeu.id,
        p_contexte: contexteOf(opts),
        p_passage_id: opts && opts.passageId ? opts.passageId : null,
      });
      tentativeId = session.tentative_id;
      paint();
    }

    function paint() {
      let html = '';
      if (cfg.consigne) html += '<p class="jp-muted">' + esc(cfg.consigne) + '</p>';
      html += '<div class="jp-appariement" id="jpApparieBoard">'
        + '<div class="jp-appariement-col jp-appariement-col--g">';
      orderG.forEach(function (g) {
        html += '<button type="button" class="jp-appariement-card jp-appariement-card--g'
          + (selectedG === g.id ? ' is-selected' : '')
          + (links[g.id] ? ' is-linked' : '') + '" data-g="' + esc(g.id) + '">'
          + '<strong>' + esc(g.label) + '</strong></button>';
      });
      html += '</div><div class="jp-appariement-col jp-appariement-col--d">';
      const usedRight = new Set(Object.keys(links).map((g) => links[g]));
      orderD.forEach(function (d) {
        html += '<button type="button" class="jp-appariement-card jp-appariement-card--d'
          + (usedRight.has(d.id) ? ' is-used is-linked' : '') + '" data-d="' + esc(d.id) + '">'
          + esc(d.label) + '</button>';
      });
      html += '</div></div><div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="btnReset">Réinitialiser</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnVerify"'
        + (Object.keys(links).length < orderG.length ? ' disabled' : '') + '>Valider</button></div>';
      root.innerHTML = html;

      root.querySelectorAll('[data-g]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const gid = btn.getAttribute('data-g');
          if (links[gid]) { delete links[gid]; selectedG = null; paint(); return; }
          selectedG = selectedG === gid ? null : gid;
          paint();
        });
      });
      root.querySelectorAll('[data-d]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const did = btn.getAttribute('data-d');
          if (!selectedG) return global.JpToast?.warn?.('Choisissez d’abord à gauche');
          Object.keys(links).forEach(function (g) { if (links[g] === did) delete links[g]; });
          links[selectedG] = did;
          selectedG = null;
          paint();
        });
      });
      document.getElementById('btnReset')?.addEventListener('click', function () {
        Object.keys(links).forEach((k) => { delete links[k]; });
        selectedG = null;
        paint();
      });
      document.getElementById('btnVerify')?.addEventListener('click', async function () {
        try {
          const res = await rpc('jeu_soumettre_appariement', {
            p_tentative_id: tentativeId,
            p_paires: links,
          });
          await showScore(root, jeu, Number(res.score_obtenu) || 0, Number(res.score_max) || orderG.length, opts);
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
    }

    void start();
  }

  /* ——— Notation déclarée (trous / fiche / ordonnance) ——— */
  function scoreButtonsHtml(key, value) {
    return '<span class="jp-declare-grade" data-grade-key="' + esc(key) + '">'
      + [0, 0.5, 1].map(function (v) {
        return '<button type="button" class="jp-btn jp-btn-ghost jp-grade-btn" data-v="' + v + '"'
          + (Number(value) === v ? ' aria-pressed="true"' : '') + '>' + v + '</button>';
      }).join('')
      + '</span>';
  }

  function wireGradeButtons(root, grades) {
    root.querySelectorAll('[data-grade-key]').forEach(function (wrap) {
      const key = wrap.getAttribute('data-grade-key');
      wrap.querySelectorAll('.jp-grade-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          grades[key] = Number(btn.getAttribute('data-v'));
          wrap.querySelectorAll('.jp-grade-btn').forEach((b) => b.removeAttribute('aria-pressed'));
          btn.setAttribute('aria-pressed', 'true');
        });
      });
    });
  }

  function sumGrades(grades) {
    let o = 0;
    let m = 0;
    Object.keys(grades).forEach(function (k) {
      m += 1;
      o += Number(grades[k]) || 0;
    });
    return { obtenu: o, max: m };
  }

  async function chooseNotationMode(root, opts) {
    if (contexteOf(opts) === 'examen') return 'detaille';
    return new Promise(function (resolve) {
      root.innerHTML = '<p class="jp-muted">Mode de notation</p><div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnRapide" title="Note globale après révélation">Rapide</button>'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="btnDetail" title="Note 0 / 0,5 / 1 par valeur">Détaillé</button>'
        + '</div>';
      document.getElementById('btnRapide')?.addEventListener('click', function () { resolve('rapide'); });
      document.getElementById('btnDetail')?.addEventListener('click', function () { resolve('detaille'); });
    });
  }

  async function soumettreDeclare(tentativeId, reponses, obtenu, max, details, opts) {
    return rpc('jeu_soumettre_declare', {
      p_tentative_id: tentativeId,
      p_reponses: reponses || {},
      p_score_provisoire: obtenu,
      p_score_max: max,
      p_details: details || [],
      p_demander_relecture: contexteOf(opts) === 'examen',
    });
  }

  async function runTrous(root, jeu, cfg, opts) {
    const mode = await chooseNotationMode(root, opts);
    const colonnes = (Array.isArray(cfg?.colonnes) ? cfg.colonnes : [])
      .slice()
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    const identity = new Set(['dci', 'nom_commercial']);
    const trouables = colonnes.filter((c) => c.role === 'trouable').map((c) => c.champ_code);
    const cols = colonnes.map((c) => c.champ_code).filter((c) => c && !identity.has(c));
    const holeColSet = new Set(trouables.filter((c) => cols.indexOf(c) >= 0));
    const composition = String(cfg?.composition || 'auto');
    const lignesMode = String(cfg?.lignes_mode || 'aleatoire');
    const nbLignes = Math.max(1, Number(cfg?.nb_lignes) || 5);
    const taux = Math.max(0, Math.min(100, Number(cfg?.taux_trous) || 40));
    const grille = (cfg?.grille_json && typeof cfg.grille_json === 'object') ? cfg.grille_json : {};

    const ids = await resolvePoolMatriceIds(jeu);
    let pool = await loadPoolFiches(jeu, ids);
    if (!pool.length && composition === 'grille' && Array.isArray(grille.lignes) && grille.lignes.length) {
      pool = await loadPoolFiches(jeu, grille.lignes.map(String));
    }
    if (!pool.length) throw new Error('Aucune molécule dans le pool');

    let rows;
    if (composition === 'grille' || lignesMode === 'manuel') {
      const order = Array.isArray(grille.lignes) && grille.lignes.length
        ? grille.lignes.map(String)
        : pool.map((p) => p.id);
      const byId = {};
      pool.forEach((p) => { byId[p.id] = p; });
      // charger manquants de la grille
      const missing = order.filter((id) => !byId[id]);
      if (missing.length) {
        (await loadPoolFiches(jeu, missing)).forEach((p) => { byId[p.id] = p; });
      }
      rows = order.map((id) => byId[id]).filter(Boolean);
      if (lignesMode === 'aleatoire' && composition !== 'grille') {
        rows = shuffle(rows).slice(0, nbLignes);
      }
    } else if (lignesMode === 'groupe') {
      rows = shuffle(pool);
    } else {
      rows = shuffle(pool).slice(0, Math.min(nbLignes, pool.length));
    }
    if (!rows.length) throw new Error('Aucune ligne à afficher');

    const holes = new Set();
    if (composition === 'grille' || (lignesMode === 'manuel' && grille.trous)) {
      const trousMap = (grille.trous && typeof grille.trous === 'object') ? grille.trous : {};
      rows.forEach(function (r) {
        const list = Array.isArray(trousMap[r.id]) ? trousMap[r.id] : [];
        list.forEach(function (code) {
          if (holeColSet.has(code)) holes.add(r.id + ':' + code);
        });
      });
    } else {
      const holeKeys = [];
      rows.forEach(function (r) {
        cols.forEach(function (code) {
          if (!holeColSet.has(code)) return;
          if (!valeursChamp(r.fiche, code).length) return;
          holeKeys.push(r.id + ':' + code);
        });
      });
      const nHoles = Math.round(holeKeys.length * (taux / 100));
      shuffle(holeKeys).slice(0, nHoles).forEach((k) => holes.add(k));
    }

    const snapRows = rows.map(function (r) {
      const cells = {};
      cols.forEach(function (c) { cells[c] = valeursChamp(r.fiche, c); });
      return { id: r.id, dci: r.dci, noms: r.noms, cells: cells };
    });
    const session = await rpc('jeu_demarrer_declare', {
      p_jeu_id: jeu.id,
      p_snapshot: { type: 'trous', rows: snapRows, holes: Array.from(holes), colonnes: cols },
      p_contexte: contexteOf(opts),
      p_passage_id: opts && opts.passageId ? opts.passageId : null,
    });

    const answers = {};
    const grades = {};

    function paintPlay() {
      let html = '<div class="jp-table-wrap"><table class="jp-table jp-trous-grid"><thead><tr><th>Molécule</th>'
        + cols.map((c) => '<th>' + esc(champLibelle(c)) + '</th>').join('')
        + '</tr></thead><tbody>';
      rows.forEach(function (r) {
        html += '<tr><th scope="row"><strong>' + esc(r.dci) + '</strong>'
          + (r.noms ? '<br><span class="jp-muted">' + esc(r.noms) + '</span>' : '') + '</th>';
        cols.forEach(function (c) {
          const key = r.id + ':' + c;
          const list = valeursChamp(r.fiche, c);
          if (holes.has(key)) {
            if (mode === 'detaille') {
              html += '<td class="jp-trou"><input class="jp-input" data-hole="' + esc(key)
                + '" title="' + esc(list.join(' · ')) + '" placeholder="…"></td>';
            } else {
              html += '<td class="jp-trou"><em>???</em></td>';
            }
          } else if (!list.length) {
            html += '<td><span class="jp-muted">—</span></td>';
          } else {
            html += '<td>' + esc(list.join(' · ')) + '</td>';
          }
        });
        html += '</tr>';
      });
      html += '</tbody></table></div><div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnValider">Valider</button></div>';
      root.innerHTML = html;
      document.getElementById('btnValider')?.addEventListener('click', function () {
        if (mode === 'detaille') {
          root.querySelectorAll('[data-hole]').forEach(function (inp) {
            answers[inp.getAttribute('data-hole')] = inp.value;
          });
        }
        paintGrade();
      });
    }

    function paintGrade() {
      let html = '<p class="jp-muted">Notation</p><ul class="jp-v2-quiz-recap">';
      Array.from(holes).forEach(function (key) {
        const parts = key.split(':');
        const mid = parts[0];
        const code = parts.slice(1).join(':');
        const row = rows.find((r) => r.id === mid);
        const expect = row ? valeursChamp(row.fiche, code).join(' · ') : '—';
        grades[key] = grades[key] != null ? grades[key] : 0;
        html += '<li><strong>' + esc(row?.dci || '') + ' · ' + esc(champLibelle(code)) + '</strong>'
          + '<br><span class="jp-muted">Attendu : ' + esc(expect)
          + (mode === 'detaille' ? ' · Votre réponse : ' + esc(answers[key] || '—') : '')
          + '</span><br>' + scoreButtonsHtml(key, grades[key]) + '</li>';
      });
      if (mode === 'rapide' && !holes.size) {
        grades._global = 0;
        html += '<li>Note globale<br>' + scoreButtonsHtml('_global', 0) + '</li>';
      }
      html += '</ul><div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="btnRelire" title="Demander une relecture admin">+ Relecture</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnScore">Enregistrer</button></div>';
      root.innerHTML = html;
      wireGradeButtons(root, grades);
      let askRelire = contexteOf(opts) === 'examen';
      document.getElementById('btnRelire')?.addEventListener('click', function () {
        askRelire = true;
        global.JpToast?.ok?.('Relecture demandée');
      });
      document.getElementById('btnScore')?.addEventListener('click', async function () {
        try {
          const s = sumGrades(grades);
          const res = await rpc('jeu_soumettre_declare', {
            p_tentative_id: session.tentative_id,
            p_reponses: answers,
            p_score_provisoire: s.obtenu,
            p_score_max: s.max || 1,
            p_details: [],
            p_demander_relecture: askRelire,
          });
          await showScore(root, jeu, Number(res.score_obtenu) || s.obtenu, Number(res.score_max) || s.max || 1, opts);
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
    }

    paintPlay();
  }

  async function loadFicheExclusionCounts(jeuId, matriceIds, seuil) {
    const ids = Array.from(new Set((matriceIds || []).filter(Boolean).map(String)));
    const counts = {};
    ids.forEach((id) => { counts[id] = 0; });
    if (!ids.length || !jeuId) return counts;
    const { data: sess } = await global.JpApp.sbPortail().auth.getUser();
    const uid = sess?.user?.id;
    if (!uid) return counts;
    const { data, error } = await sb()
      .from('jeux_tentatives')
      .select('snapshot_json, score_obtenu, score_max, score_officiel, details_json')
      .eq('jeu_id', jeuId)
      .eq('utilisateur_id', uid)
      .not('termine_at', 'is', null)
      .limit(200);
    if (error) throw error;
    (data || []).forEach((t) => {
      const max = Number(t.score_max) || 0;
      const obtenu = Number(t.score_officiel != null ? t.score_officiel : t.score_obtenu) || 0;
      const note10 = max > 0 ? (obtenu / max) * 10 : obtenu;
      if (note10 < seuil) return;
      const fiches = (t.snapshot_json && t.snapshot_json.fiches) || [];
      const details = Array.isArray(t.details_json) ? t.details_json : [];
      if (details.length && details.some((d) => d && d.matrice_id != null && d.note_10 != null)) {
        details.forEach((d) => {
          if (!d || d.matrice_id == null) return;
          if (Number(d.note_10) >= seuil) {
            const k = String(d.matrice_id);
            if (counts[k] != null) counts[k] += 1;
          }
        });
        return;
      }
      fiches.forEach((f) => {
        const k = String(f.id || f.matrice_id || '');
        if (k && counts[k] != null) counts[k] += 1;
      });
    });
    return counts;
  }

  async function runFiche(root, jeu, cfg, opts) {
    const mode = await chooseNotationMode(root, opts);
    const nb = Math.max(1, Number(cfg?.nb_fiches) || 5);
    const composition = String(cfg?.composition || 'auto');
    const fichesMode = String(cfg?.fiches_mode || 'aleatoire');
    const seuil = Math.max(0, Number(cfg?.seuil_exclusion) || 8);
    const nbNotes = Math.max(1, Number(cfg?.nb_notes_exclusion) || 3);
    const champsCfg = Array.isArray(cfg?.champs) ? cfg.champs : [];
    const restituer = champsCfg.filter((c) => c.role === 'restituer').map((c) => c.champ_code);
    const visibles = champsCfg.filter((c) => c.role === 'visible').map((c) => c.champ_code);

    const poolIds = await resolvePoolMatriceIds(jeu);
    const fullById = {};
    (await loadPoolFiches(jeu, poolIds)).forEach((p) => { fullById[p.id] = p; });
    const empl = Array.isArray(cfg?.emplacements) ? cfg.emplacements.slice()
      .sort((a, b) => (a.ordre || 0) - (b.ordre || 0)) : [];

    let pool = [];
    if (composition === 'manuel' && empl.length) {
      const aleaPool = shuffle(Object.values(fullById));
      let ai = 0;
      for (const e of empl) {
        if (e.mode === 'fixe' && e.matrice_id) {
          const mid = String(e.matrice_id);
          let med = fullById[mid];
          if (!med) {
            const loaded = await loadPoolFiches(jeu, [mid]);
            med = loaded[0] || null;
          }
          if (med) pool.push(med);
        } else {
          const next = aleaPool[ai++];
          if (next) pool.push(next);
        }
      }
    } else {
      let candidates = Object.values(fullById);
      if (composition === 'auto' && fichesMode !== 'groupe') {
        const counts = await loadFicheExclusionCounts(jeu.id, candidates.map((c) => c.id), seuil);
        const eligible = candidates.filter((c) => (counts[c.id] || 0) < nbNotes);
        if (eligible.length) candidates = eligible;
        else {
          // toutes maîtrisées → on garde le pool (rejouer possible)
          global.JpToast?.ok?.('Pool maîtrisé — tirage sans exclusion');
        }
      }
      candidates = shuffle(candidates);
      pool = fichesMode === 'groupe' ? candidates : candidates.slice(0, Math.min(nb, candidates.length));
    }
    if (!pool.length) throw new Error('Aucune fiche dans le pool');

    const session = await rpc('jeu_demarrer_declare', {
      p_jeu_id: jeu.id,
      p_snapshot: {
        type: 'fiche_aleatoire',
        fiches: pool.map((p) => ({ id: p.id, dci: p.dci })),
        champs: restituer.length ? restituer : null,
      },
      p_contexte: contexteOf(opts),
      p_passage_id: opts && opts.passageId ? opts.passageId : null,
    });

    let idx = 0;
    const allGrades = {};
    const allAnswers = {};

    function codesOf(fiche) {
      if (restituer.length) return restituer;
      return Object.keys(fiche.champs || {}).filter((c) => c !== 'nom_commercial' && c !== 'dci');
    }

    function paint() {
      if (idx >= pool.length) {
        void finish();
        return;
      }
      const med = pool[idx];
      const codes = codesOf(med.fiche);
      const showAlways = (visibles.length ? visibles : []).filter((c) => c !== 'dci' && c !== 'nom_commercial');
      let html = '<p class="jp-muted">Fiche ' + (idx + 1) + ' / ' + pool.length + '</p>'
        + '<article class="jp-v2-mol-card"><h3>' + esc(med.dci) + '</h3>'
        + '<p class="jp-muted">' + esc(med.noms) + '</p>';
      showAlways.forEach(function (c) {
        html += '<p><strong>' + esc(champLibelle(c)) + '</strong> : '
          + esc(valeursChamp(med.fiche, c).join(' · ') || '—') + '</p>';
      });
      if (mode === 'detaille') {
        codes.forEach(function (c) {
          if (showAlways.indexOf(c) >= 0) return;
          const key = med.id + ':' + c;
          html += '<div class="jp-field"><label>' + esc(champLibelle(c)) + '</label>'
            + '<input class="jp-input" data-ans="' + esc(key) + '" placeholder="…"></div>';
        });
        html += '</article><div class="jp-v2-actions">'
          + '<button type="button" class="jp-btn jp-btn-primary" id="btnNext">Valider</button></div>';
      } else {
        html += '<ul class="jp-muted" id="jpFicheHidden">' + codes.filter((c) => showAlways.indexOf(c) < 0).map(function (c) {
          return '<li data-code="' + esc(c) + '">' + esc(champLibelle(c)) + ' : ???</li>';
        }).join('') + '</ul></article><div class="jp-v2-actions">'
          + '<button type="button" class="jp-btn jp-btn-primary" id="btnReveal">Révéler</button></div>';
      }
      root.innerHTML = html;

      if (mode === 'detaille') {
        document.getElementById('btnNext')?.addEventListener('click', function () {
          root.querySelectorAll('[data-ans]').forEach(function (inp) {
            allAnswers[inp.getAttribute('data-ans')] = inp.value;
          });
          paintGradeOne(med, codes.filter((c) => showAlways.indexOf(c) < 0));
        });
      } else {
        document.getElementById('btnReveal')?.addEventListener('click', function () {
          paintGradeOne(med, codes.filter((c) => showAlways.indexOf(c) < 0));
        });
      }
    }

    function paintGradeOne(med, codes) {
      let html = '<p class="jp-muted">Notation — ' + esc(med.dci) + '</p><ul class="jp-v2-quiz-recap">';
      codes.forEach(function (c) {
        const key = med.id + ':' + c;
        const expect = valeursChamp(med.fiche, c).join(' · ') || '—';
        allGrades[key] = allGrades[key] != null ? allGrades[key] : 0;
        html += '<li><strong>' + esc(champLibelle(c)) + '</strong>'
          + '<br><span class="jp-muted">Attendu : ' + esc(expect)
          + (mode === 'detaille' ? ' · Réponse : ' + esc(allAnswers[key] || '—') : '')
          + '</span><br>' + scoreButtonsHtml(key, allGrades[key]) + '</li>';
      });
      html += '</ul><div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnNextF">'
        + (idx >= pool.length - 1 ? 'Terminer' : 'Fiche suivante') + '</button></div>';
      root.innerHTML = html;
      wireGradeButtons(root, allGrades);
      document.getElementById('btnNextF')?.addEventListener('click', function () {
        idx += 1;
        paint();
      });
    }

    async function finish() {
      try {
        const s = sumGrades(allGrades);
        const perFiche = pool.map(function (med) {
          const keys = Object.keys(allGrades).filter((k) => k.indexOf(med.id + ':') === 0);
          let o = 0;
          let m = keys.length || 1;
          keys.forEach((k) => { o += Number(allGrades[k]) || 0; });
          return { matrice_id: med.id, note_10: (o / m) * 10 };
        });
        const res = await rpc('jeu_soumettre_declare', {
          p_tentative_id: session.tentative_id,
          p_reponses: allAnswers,
          p_score_provisoire: s.obtenu,
          p_score_max: s.max || 1,
          p_details: perFiche,
          p_demander_relecture: contexteOf(opts) === 'examen',
        });
        await showScore(root, jeu, Number(res.score_obtenu) || s.obtenu, Number(res.score_max) || s.max || 1, opts);
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
    }

    paint();
  }

  async function loadAssoComposants(matriceIds) {
    const ids = Array.from(new Set((matriceIds || []).filter(Boolean).map(String)));
    if (!ids.length) return {};
    const { data, error } = await sb()
      .from('matrice_composants')
      .select('matrice_id, composant_matrice_id, ordre')
      .in('matrice_id', ids);
    if (error) throw error;
    const out = {};
    (data || []).forEach((r) => {
      const aid = String(r.matrice_id);
      if (!out[aid]) out[aid] = [];
      out[aid].push(String(r.composant_matrice_id));
    });
    return out;
  }

  async function findAssosCovering(componentIds) {
    const comps = Array.from(new Set((componentIds || []).filter(Boolean).map(String)));
    if (comps.length < 2) return [];
    const { data, error } = await sb()
      .from('matrice_composants')
      .select('matrice_id, composant_matrice_id')
      .in('composant_matrice_id', comps);
    if (error) throw error;
    const byAsso = {};
    (data || []).forEach((r) => {
      const aid = String(r.matrice_id);
      if (!byAsso[aid]) byAsso[aid] = [];
      byAsso[aid].push(String(r.composant_matrice_id));
    });
    const set = new Set(comps);
    return Object.keys(byAsso)
      .map((aid) => {
        const list = Array.from(new Set(byAsso[aid]));
        const covered = list.filter((c) => set.has(c));
        return { id: aid, composants: list, covered };
      })
      .filter((a) => a.covered.length >= 2);
  }

  async function runOrdonnance(root, jeu, cfg, opts) {
    const mode = await chooseNotationMode(root, opts);
    const champs = Array.isArray(cfg?.champs) ? cfg.champs.filter(Boolean) : ['indications', 'contre_indications'];
    const besoins = Array.isArray(cfg?.besoins)
      ? cfg.besoins.slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0))
      : [];
    const assocOk = !!cfg?.associations_possibles;

    const picked = [];
    const used = new Set();

    async function pickFromFiltre(filtre) {
      const ids = await resolvePoolMatriceIds(jeu, filtre || {});
      const avail = shuffle(ids.filter((id) => !used.has(String(id))));
      return avail[0] || null;
    }

    const scopeIds = new Set();
    if (!besoins.length) throw new Error('Aucun besoin');
    for (const b of besoins) {
      const isAsso = !!(b.association_id || (b.filtre_json && b.filtre_json.kind === 'asso'));
      if (b.mode === 'manuel' && (b.matrice_id || b.association_id)) {
        const mid = String(b.association_id || b.matrice_id);
        picked.push({ id: mid, kind: isAsso ? 'asso' : 'mono' });
        used.add(mid);
        scopeIds.add(mid);
      } else {
        const ids = await resolvePoolMatriceIds(jeu, b.filtre_json || {});
        ids.forEach((id) => scopeIds.add(String(id)));
        const mid = await pickFromFiltre(b.filtre_json);
        if (mid) {
          picked.push({ id: String(mid), kind: 'mono' });
          used.add(String(mid));
        }
      }
    }

    const kindById = {};
    picked.forEach((p) => { kindById[p.id] = p.kind; });
    let pool = await loadPoolFiches(jeu, picked.map((p) => p.id));
    pool.forEach((line) => { line.kind = kindById[line.id] || 'mono'; });
    if (!pool.length) throw new Error('Aucune molécule pour l’ordonnance');

    async function attachAssoParts(line) {
      if (line.kind !== 'asso' || (line.composantsPlay && line.composantsPlay.length)) return;
      const map = await loadAssoComposants([line.id]);
      line.composantsPlay = await loadPoolFiches(jeu, map[line.id] || []);
    }
    for (const line of pool) await attachAssoParts(line);

    // Fusion : une asso du sélecteur peut couvrir 2+ lignes. Les autres → vigilance.
    let vigilanceTips = [];
    if (assocOk) {
      const monoIds = pool.filter((p) => p.kind !== 'asso').map((p) => p.id);
      const candidates = (await findAssosCovering(monoIds))
        .filter((a) => scopeIds.has(a.id) && !pool.some((p) => p.id === a.id))
        .sort((a, b) => b.covered.length - a.covered.length);
      if (candidates.length) {
        const chosen = candidates[0];
        const assoFiches = await loadPoolFiches(jeu, [chosen.id]);
        const asso = assoFiches[0];
        if (asso) {
          const cover = new Set(chosen.covered);
          const rest = pool.filter((p) => p.kind === 'asso' || !cover.has(p.id));
          const comps = await loadPoolFiches(jeu, chosen.covered);
          const line = {
            id: asso.id, dci: asso.dci, noms: asso.noms, fiche: asso.fiche,
            kind: 'asso', composantsPlay: comps,
          };
          pool = [line].concat(rest);
          scopeIds.add(asso.id);
        }
        const unused = candidates.slice(assoFiches && assoFiches[0] ? 1 : 0);
        if (unused.length) {
          const fiches = await loadPoolFiches(jeu, unused.slice(0, 3).map((a) => a.id));
          fiches.forEach((f) => {
            vigilanceTips.push('Privilégier la dispensation de : ' + (f.dci || f.noms || f.id));
          });
        }
      }
    }

    // Lignes de restitution : asso → composants (aussi base des interactions)
    const restLines = [];
    pool.forEach(function (line) {
      if (line.kind === 'asso' && Array.isArray(line.composantsPlay) && line.composantsPlay.length) {
        line.composantsPlay.forEach(function (c) {
          restLines.push(Object.assign({}, c, { parentAsso: line.dci }));
        });
      } else {
        restLines.push(line);
      }
    });

    // Interactions publiées entre lignes (composants si association)
    const interactionTips = [];
    for (let i = 0; i < restLines.length; i++) {
      for (let j = i + 1; j < restLines.length; j++) {
        const a = restLines[i];
        const b = restLines[j];
        const ia = valeursChamp(a.fiche, 'interactions');
        const ib = valeursChamp(b.fiche, 'interactions');
        const shared = ia.filter((x) => ib.indexOf(x) >= 0);
        if (shared.length) {
          interactionTips.push(
            (a.dci || a.id) + ' ↔ ' + (b.dci || b.id) + ' : ' + shared.slice(0, 2).join(' · ')
          );
        } else {
          const blobA = ia.join(' ').toLowerCase();
          const blobB = ib.join(' ').toLowerCase();
          const nameA = String(a.dci || '').toLowerCase();
          const nameB = String(b.dci || '').toLowerCase();
          if ((nameB && blobA.indexOf(nameB) >= 0) || (nameA && blobB.indexOf(nameA) >= 0)) {
            const hit = ia.concat(ib).slice(0, 1);
            if (hit.length) interactionTips.push((a.dci || '') + ' / ' + (b.dci || '') + ' : ' + hit[0]);
          }
        }
      }
    }

    const session = await rpc('jeu_demarrer_declare', {
      p_jeu_id: jeu.id,
      p_snapshot: {
        type: 'ordonnance',
        molecules: pool.map((p, i) => ({
          n: i + 1, id: p.id, dci: p.dci, kind: p.kind || 'mono',
        })),
        champs: champs,
        vigilance: vigilanceTips,
        interactions: interactionTips,
      },
      p_contexte: contexteOf(opts),
      p_passage_id: opts && opts.passageId ? opts.passageId : null,
    });

    const answers = {};
    const grades = {};

    function paintPlay() {
      let html = '<ol class="jp-ordo-list">';
      pool.forEach(function (med, i) {
        html += '<li><strong>' + (i + 1) + '. ' + esc(med.dci) + '</strong>'
          + (med.kind === 'asso' ? ' <span class="jp-badge">Association</span>' : '')
          + (med.noms ? ' <span class="jp-muted">(' + esc(med.noms) + ')</span>' : '');
        if (med.kind === 'asso' && med.composantsPlay) {
          html += '<p class="jp-muted">' + med.composantsPlay.map((c) => esc(c.dci)).join(' + ') + '</p>';
        }
        html += '</li>';
      });
      html += '</ol>';
      restLines.forEach(function (med) {
        html += '<div class="jp-ordo-rest"><strong>' + esc(med.dci) + '</strong>'
          + (med.parentAsso ? ' <span class="jp-muted">(' + esc(med.parentAsso) + ')</span>' : '');
        champs.forEach(function (c) {
          const key = med.id + ':' + c;
          if (mode === 'detaille') {
            html += '<div class="jp-field"><label>' + esc(champLibelle(c)) + '</label>'
              + '<input class="jp-input" data-ans="' + esc(key) + '" placeholder="…"></div>';
          } else {
            html += '<p class="jp-muted">' + esc(champLibelle(c)) + ' : ???</p>';
          }
        });
        html += '</div>';
      });
      html += '<div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnValider">Valider</button></div>';
      root.innerHTML = html;
      document.getElementById('btnValider')?.addEventListener('click', function () {
        if (mode === 'detaille') {
          root.querySelectorAll('[data-ans]').forEach(function (inp) {
            answers[inp.getAttribute('data-ans')] = inp.value;
          });
        }
        paintGrade();
      });
    }

    function paintGrade() {
      let html = '';
      if (interactionTips.length || vigilanceTips.length) {
        html += '<aside class="jp-ordo-vigilance" style="margin-bottom:1rem">'
          + '<p class="jp-field-label">Vigilance</p>';
        interactionTips.forEach(function (t) {
          html += '<p class="jp-muted">' + esc(t) + '</p>';
        });
        vigilanceTips.forEach(function (t) {
          html += '<p class="jp-muted">' + esc(t) + '</p>';
        });
        html += '</aside>';
      }
      html += '<p class="jp-muted">Notation</p><ul class="jp-v2-quiz-recap">';
      restLines.forEach(function (med) {
        champs.forEach(function (c) {
          const key = med.id + ':' + c;
          const expect = valeursChamp(med.fiche, c).join(' · ') || '—';
          grades[key] = grades[key] != null ? grades[key] : 0;
          html += '<li><strong>' + esc(med.dci) + ' · ' + esc(champLibelle(c)) + '</strong>'
            + '<br><span class="jp-muted">Attendu : ' + esc(expect)
            + (mode === 'detaille' ? ' · Réponse : ' + esc(answers[key] || '—') : '')
            + '</span><br>' + scoreButtonsHtml(key, grades[key]) + '</li>';
        });
      });
      html += '</ul><div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="btnRelire" title="Demander une relecture admin">+ Relecture</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnScore">Enregistrer</button></div>';
      root.innerHTML = html;
      wireGradeButtons(root, grades);
      let askRelire = contexteOf(opts) === 'examen';
      document.getElementById('btnRelire')?.addEventListener('click', function () {
        askRelire = true;
        global.JpToast?.ok?.('Relecture demandée');
      });
      document.getElementById('btnScore')?.addEventListener('click', async function () {
        try {
          const s = sumGrades(grades);
          const res = await rpc('jeu_soumettre_declare', {
            p_tentative_id: session.tentative_id,
            p_reponses: answers,
            p_score_provisoire: s.obtenu,
            p_score_max: s.max || 1,
            p_details: [],
            p_demander_relecture: askRelire,
          });
          await showScore(root, jeu, Number(res.score_obtenu) || s.obtenu, Number(res.score_max) || s.max || 1, opts);
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
    }

    paintPlay();
  }

  /**
   * @param {HTMLElement} root
   * @param {string} code
   * @param {{ embed?: boolean, moduleId?: string, parcoursId?: string, passageId?: string, onReplay?: Function, onFinished?: Function, singleAttempt?: boolean }} [opts]
   */
  async function boot(root, code, opts) {
    const o = opts || {};
    const jeu = await loadJeu(code);
    const cfg = await typeConfig(jeu.id);
    root.dataset.jpV3 = '1';
    root.dataset.typeJeu = jeu.type_jeu || '';

    if (jeu.type_jeu === 'quiz') {
      await runQuiz(root, jeu, cfg || {}, o);
      return jeu;
    }
    if (jeu.type_jeu === 'classement') {
      runClassement(root, jeu, cfg || {}, o);
      return jeu;
    }
    if (jeu.type_jeu === 'appariement') {
      runAppariement(root, jeu, cfg || {}, o);
      return jeu;
    }
    if (jeu.type_jeu === 'trous') {
      await runTrous(root, jeu, cfg || {}, o);
      return jeu;
    }
    if (jeu.type_jeu === 'fiche_aleatoire') {
      await runFiche(root, jeu, cfg || {}, o);
      return jeu;
    }
    if (jeu.type_jeu === 'ordonnance') {
      await runOrdonnance(root, jeu, cfg || {}, o);
      return jeu;
    }
    throw new Error('Type de jeu non supporté : ' + jeu.type_jeu);
  }

  /** Aperçu tirage quiz (wizard lab) — sans démarrer de tentative. */
  async function previewQuizTirage(jeuLike, cfg) {
    return buildQuizSnapshot(jeuLike || {}, cfg || {});
  }

  global.JpJeuxPlayV3 = {
    boot,
    loadJeu,
    previewQuizTirage,
    resolvePoolMatriceIds,
  };
})(window);
