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

  async function resolvePoolMatriceIds(jeu) {
    const pool = jeu.pool || {};
    const mode = String(pool.mode || 'lecons');
    const parcoursId = jeu.parcours_id || null;
    const moduleIds = Array.isArray(pool.module_ids) ? pool.module_ids.filter(Boolean).map(String) : [];
    const blocIds = Array.isArray(pool.bloc_ids) ? pool.bloc_ids.filter(Boolean).map(String) : [];
    const matriceIds = Array.isArray(pool.matrice_ids) ? pool.matrice_ids.filter(Boolean).map(String) : [];

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

    // lecons
    const mids = moduleIds.length
      ? moduleIds
      : (Array.isArray(jeu.module_ids) ? jeu.module_ids.filter(Boolean).map(String) : []);
    const rows = await global.JpV2Resolver.listerMedicaments({
      parcoursId: parcoursId,
      moduleIds: mids.length ? mids : null,
    });
    return (rows || []).map((r) => String(r.id)).filter(Boolean);
  }

  async function loadPoolFiches(jeu, matriceIds) {
    const ids = Array.from(new Set((matriceIds || []).filter(Boolean)));
    if (!ids.length) return [];
    const moduleIds = Array.isArray(jeu.pool?.module_ids)
      ? jeu.pool.module_ids.filter(Boolean).map(String)
      : (Array.isArray(jeu.module_ids) ? jeu.module_ids.filter(Boolean).map(String) : null);
    const map = await global.JpV2Resolver.fichesResolues(ids, {
      parcoursId: jeu.parcours_id || null,
      moduleIds: moduleIds && moduleIds.length ? moduleIds : null,
    });
    return ids.map((id) => {
      const f = map[id];
      if (!f) return null;
      return {
        id: String(f.id || id),
        dci: f.dci || '',
        noms: (f.noms_commerciaux || []).map((n) => n.valeur).filter(Boolean).join(', '),
        fiche: f,
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
    const visibles = colonnes.filter((c) => c.role === 'visible').map((c) => c.champ_code);
    const trouables = colonnes.filter((c) => c.role === 'trouable').map((c) => c.champ_code);
    const cols = trouables.length ? trouables : colonnes.map((c) => c.champ_code).filter(Boolean);
    const alwaysShow = visibles.length ? visibles : ['dci', 'nom_commercial'];
    const nbLignes = Math.max(1, Number(cfg?.nb_lignes) || 5);
    const taux = Math.max(0, Math.min(100, Number(cfg?.taux_trous) || 40));

    const ids = await resolvePoolMatriceIds(jeu);
    const pool = shuffle(await loadPoolFiches(jeu, ids));
    if (!pool.length) throw new Error('Aucune molécule dans le pool');
    const rows = pool.slice(0, nbLignes);

    const holeKeys = [];
    rows.forEach(function (r) {
      cols.forEach(function (code) {
        if (alwaysShow.indexOf(code) >= 0) return;
        if (!valeursChamp(r.fiche, code).length) return;
        holeKeys.push(r.id + ':' + code);
      });
    });
    const nHoles = Math.max(1, Math.round(holeKeys.length * (taux / 100)));
    const holes = new Set(shuffle(holeKeys).slice(0, nHoles));

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
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnScore">Enregistrer</button></div>';
      root.innerHTML = html;
      wireGradeButtons(root, grades);
      document.getElementById('btnScore')?.addEventListener('click', async function () {
        try {
          const s = sumGrades(grades);
          const res = await soumettreDeclare(session.tentative_id, answers, s.obtenu, s.max || 1, [], opts);
          await showScore(root, jeu, Number(res.score_obtenu) || s.obtenu, Number(res.score_max) || s.max || 1, opts);
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
    }

    paintPlay();
  }

  async function runFiche(root, jeu, cfg, opts) {
    const mode = await chooseNotationMode(root, opts);
    const nb = Math.max(1, Number(cfg?.nb_fiches) || 5);
    const champsCfg = Array.isArray(cfg?.champs) ? cfg.champs : [];
    const restituer = champsCfg.filter((c) => c.role === 'restituer').map((c) => c.champ_code);
    const visibles = champsCfg.filter((c) => c.role === 'visible').map((c) => c.champ_code);

    let ids = await resolvePoolMatriceIds(jeu);
    const empl = Array.isArray(cfg?.emplacements) ? cfg.emplacements : [];
    const fixed = empl.filter((e) => e.mode === 'fixe' && e.matrice_id).map((e) => String(e.matrice_id));
    if (fixed.length) ids = fixed.concat(ids.filter((id) => fixed.indexOf(id) < 0));
    const pool = shuffle(await loadPoolFiches(jeu, ids)).slice(0, nb);
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
      const showAlways = visibles.length ? visibles : [];
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
        const res = await soumettreDeclare(session.tentative_id, allAnswers, s.obtenu, s.max || 1, [], opts);
        await showScore(root, jeu, Number(res.score_obtenu) || s.obtenu, Number(res.score_max) || s.max || 1, opts);
      } catch (e) {
        global.JpToast?.fromError?.(e);
      }
    }

    paint();
  }

  async function runOrdonnance(root, jeu, cfg, opts) {
    const mode = await chooseNotationMode(root, opts);
    const champs = Array.isArray(cfg?.champs) ? cfg.champs.filter(Boolean) : ['indications', 'contre_indications'];
    const besoins = Array.isArray(cfg?.besoins) ? cfg.besoins.slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)) : [];

    let ids = await resolvePoolMatriceIds(jeu);
    const fixed = besoins.filter((b) => b.mode === 'manuel' && b.matrice_id).map((b) => String(b.matrice_id));
    const nNeed = besoins.length || Math.min(5, ids.length);
    if (fixed.length) {
      ids = fixed.concat(shuffle(ids.filter((id) => fixed.indexOf(id) < 0)));
    } else {
      ids = shuffle(ids);
    }
    const pool = await loadPoolFiches(jeu, ids.slice(0, nNeed));
    if (!pool.length) throw new Error('Aucune molécule pour l’ordonnance');

    const session = await rpc('jeu_demarrer_declare', {
      p_jeu_id: jeu.id,
      p_snapshot: {
        type: 'ordonnance',
        molecules: pool.map((p, i) => ({ n: i + 1, id: p.id, dci: p.dci })),
        champs: champs,
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
          + (med.noms ? ' <span class="jp-muted">(' + esc(med.noms) + ')</span>' : '');
        champs.forEach(function (c) {
          const key = med.id + ':' + c;
          if (mode === 'detaille') {
            html += '<div class="jp-field"><label>' + esc(champLibelle(c)) + '</label>'
              + '<input class="jp-input" data-ans="' + esc(key) + '" placeholder="…"></div>';
          } else {
            html += '<p class="jp-muted">' + esc(champLibelle(c)) + ' : ???</p>';
          }
        });
        html += '</li>';
      });
      html += '</ol><div class="jp-v2-actions">'
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
      let html = '<p class="jp-muted">Notation</p><ul class="jp-v2-quiz-recap">';
      pool.forEach(function (med) {
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
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnScore">Enregistrer</button></div>';
      root.innerHTML = html;
      wireGradeButtons(root, grades);
      document.getElementById('btnScore')?.addEventListener('click', async function () {
        try {
          const s = sumGrades(grades);
          const res = await soumettreDeclare(session.tentative_id, answers, s.obtenu, s.max || 1, [], opts);
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

  global.JpJeuxPlayV3 = {
    boot,
    loadJeu,
  };
})(window);
