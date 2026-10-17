/**
 * Écrans de jeu joueur — quiz, trous, fiche, classement, appariement (contenu = résolveur + config).
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

  function valeursChamp(fiche, code) {
    return ((fiche?.champs || {})[code] || [])
      .map((it) => it.valeur)
      .filter(Boolean);
  }

  async function loadModele(code) {
    const { data, error } = await sb()
      .from('modeles_jeu')
      .select('id, code_unique, type_jeu, titre, mode, parcours_id, module_ids, configuration_json, en_pause, actif')
      .eq('code_unique', String(code || '').trim().toUpperCase())
      .eq('actif', true)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Jeu introuvable');
    if (data.en_pause) throw new Error('Ce jeu est en pause');
    return data;
  }

  function ficheOpts(modele, moduleIdsOverride) {
    const mids = moduleIdsOverride != null
      ? moduleIdsOverride
      : ((modele.module_ids && modele.module_ids.length) ? modele.module_ids : null);
    return {
      parcoursId: modele.parcours_id || null,
      moduleIds: mids,
    };
  }

  /** Mode répertoire : selection | lecon | chapitre | parcours (+ compat legacy). */
  function repertoireMode(cfg) {
    const raw = String((cfg && cfg.repertoire) || '').trim().toLowerCase();
    if (raw === 'selection' || raw === 'lecon' || raw === 'chapitre' || raw === 'parcours') {
      return raw;
    }
    const fixed = Array.isArray(cfg && cfg.matrice_ids) ? cfg.matrice_ids.filter(Boolean) : [];
    return fixed.length ? 'selection' : 'lecon';
  }

  /** Étend module_ids au chapitre parent (toutes les leçons feuilles). */
  async function resolveChapitreModuleIds(moduleIds) {
    const seeds = (moduleIds || []).filter(Boolean);
    if (!seeds.length) return seeds;
    const { data, error } = await sb()
      .from('modules_cours')
      .select('id, parent_id, est_groupe, publie')
      .eq('publie', true);
    if (error) throw error;
    const all = data || [];
    const byId = {};
    all.forEach((m) => { byId[m.id] = m; });
    const chapterIds = new Set();
    seeds.forEach((id) => {
      const m = byId[id];
      if (!m) return;
      chapterIds.add(m.parent_id || m.id);
    });
    const leaves = [];
    function walk(id) {
      const kids = all.filter((c) => c.parent_id === id);
      if (!kids.length) {
        const node = byId[id];
        if (node && !node.est_groupe) leaves.push(id);
        return;
      }
      kids.forEach((k) => {
        if (k.est_groupe) walk(k.id);
        else leaves.push(k.id);
      });
    }
    chapterIds.forEach((cid) => walk(cid));
    return leaves.length ? Array.from(new Set(leaves)) : seeds;
  }

  async function resolvePoolModuleIds(modele) {
    const cfg = modele.configuration_json || {};
    const mode = repertoireMode(cfg);
    const base = (modele.module_ids && modele.module_ids.length) ? modele.module_ids.slice() : [];
    if (mode === 'parcours') return null;
    if (mode === 'chapitre') return resolveChapitreModuleIds(base);
    return base.length ? base : null;
  }

  /** Précharge un lot de fiches (1 RPC) dans le cache du modèle. */
  async function preloadFiches(modele, matriceIds) {
    const ids = Array.from(new Set((matriceIds || []).filter(Boolean)));
    if (!ids.length) return modele._fichesCache || {};
    const map = await global.JpV2Resolver.fichesResolues(ids, ficheOpts(modele, modele._poolModuleIds));
    modele._fichesCache = modele._fichesCache || Object.create(null);
    ids.forEach((id) => {
      if (Object.prototype.hasOwnProperty.call(map, id)) modele._fichesCache[id] = map[id];
    });
    return modele._fichesCache;
  }

  async function poolMedicaments(modele) {
    const cfg = modele.configuration_json || {};
    const mode = repertoireMode(cfg);
    const fixed = Array.isArray(cfg.matrice_ids) ? cfg.matrice_ids.filter(Boolean).map(String) : [];
    const scopeIds = await resolvePoolModuleIds(modele);
    modele._poolModuleIds = scopeIds;
    modele._repertoire = mode;

    if (mode === 'selection') {
      if (!fixed.length) return [];
      let rows = await global.JpV2Resolver.listerMedicaments(ficheOpts(modele, null));
      const allow = new Set(fixed);
      let filtered = (rows || []).filter((r) => allow.has(String(r.id)));
      if (!filtered.length) {
        const cache = await preloadFiches(modele, fixed);
        filtered = fixed.map((id) => {
          const f = cache[id];
          if (!f) return null;
          return {
            id: f.id || id,
            dci: f.dci,
            noms: (f.noms_commerciaux || []).map((n) => n.valeur).join(', '),
            nb_connaissances: Object.keys(f.champs || {}).length,
          };
        }).filter(Boolean);
      }
      return filtered;
    }

    let rows = await global.JpV2Resolver.listerMedicaments(ficheOpts(modele, scopeIds));
    return rows || [];
  }

  async function fiche(modele, matriceId) {
    if (!matriceId) return null;
    const cache = modele._fichesCache;
    if (cache && Object.prototype.hasOwnProperty.call(cache, matriceId)) {
      return cache[matriceId] || null;
    }
    const f = await global.JpV2Resolver.ficheResolue(matriceId, ficheOpts(modele, modele._poolModuleIds));
    modele._fichesCache = modele._fichesCache || Object.create(null);
    modele._fichesCache[matriceId] = f;
    return f;
  }

  /** Contexte d’exécution (page pleine ou embed leçon). */
  function playCtx(modele) {
    return modele._playOpts || {};
  }

  async function saveTentative(modele, snapshot, reponses, scoreObtenu, scoreMax) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non connecté');
    const { data, error } = await sb()
      .from('tentatives_jeu')
      .insert({
        modele_id: modele.id,
        utilisateur_id: user.id,
        mode: modele.mode || 'entrainement',
        snapshot_json: snapshot || {},
        reponses_json: reponses || {},
        score_obtenu: scoreObtenu,
        score_max: scoreMax,
        termine_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    return data;
  }

  /** ——— Carte de score (partagée quiz / trous / ordonnances) ——— */
  function pctOf(o, m) {
    return m > 0 ? Math.max(0, Math.min(100, (Number(o) / Number(m)) * 100)) : 0;
  }

  function levelMsg(p) {
    if (p >= 90) return 'Excellent, vous maîtrisez !';
    if (p >= 75) return 'Très bien, presque parfait.';
    if (p >= 50) return 'Bien, continuez à vous entraîner.';
    return 'À retravailler : relisez la leçon puis réessayez.';
  }

  /** Contexte de navigation : leçon / parcours d’où vient le joueur (paramètres d’URL ?module=&parcours=). */
  function scoreCtx(modele) {
    const q = new URLSearchParams(location.search);
    return { moduleId: q.get('module') || '', parcoursId: q.get('parcours') || modele.parcours_id || '' };
  }

  /** Critère de validation lié à ce jeu (RPC légère — pas l’arbre progression). */
  async function findRequirement(modele, ctx) {
    if (!global.JpV2Resolver?.critereJeu) return null;
    try {
      const row = await global.JpV2Resolver.critereJeu(modele.id, {
        moduleId: ctx.moduleId || null,
        parcoursId: ctx.parcoursId || modele.parcours_id || null,
      });
      if (!row) return null;
      return {
        ok: !!row.ok,
        min: row.score_min_pct,
        moduleId: row.module_id,
        groupe: !!row.est_groupe,
        titre: row.titre,
        valide: !!row.valide,
        parcoursId: row.parcours_id || ctx.parcoursId,
      };
    } catch (_) {
      return null;
    }
  }

  function scoreCardHtml(obtenu, max) {
    const p = pctOf(obtenu, max);
    const PU = global.JpParcoursUi;
    const tone = p >= 75 ? 'is-good' : (p >= 50 ? 'is-mid' : 'is-low');
    return '<section class="jp-score-card ' + tone + '" id="jpScore" aria-live="polite">'
      + (PU ? PU.ring(p, { size: 96, label: Math.round(p) + ' %' }) : '')
      + '<div class="jp-score-body"><p class="jp-score-label">Votre score</p>'
      + '<p class="jp-score-value">' + esc(String(obtenu)) + ' <small>/ ' + esc(String(max)) + '</small></p>'
      + '<p class="jp-score-msg">' + esc(levelMsg(p)) + '</p></div>'
      + '<p class="jp-score-req" id="jpScoreReq" hidden></p>'
      + '<div class="jp-score-actions" id="jpScoreActions"></div></section>';
  }

  function scoreActions(ctx, req, opts) {
    const o = opts || {};
    const embed = !!o.embed;
    const lessonId = (req && !req.groupe && req.moduleId) || ctx.moduleId;
    const pid = (req && req.parcoursId) || ctx.parcoursId;
    let html = '<button type="button" class="jp-btn jp-btn-primary" id="btnReplay">'
      + (embed ? 'Nouvelle tentative' : 'Rejouer') + '</button>';
    if (!embed && lessonId) {
      html += '<a class="jp-btn jp-btn-ghost" href="../lecon.html?module=' + encodeURIComponent(lessonId) + '">← Retour à la leçon</a>';
    }
    if (!embed) {
      html += '<a class="jp-btn jp-btn-ghost" href="../espace.html' + (pid ? '?parcours=' + encodeURIComponent(pid) : '') + '">Mon parcours</a>';
      html += '<a class="jp-btn jp-btn-ghost" href="' + esc(o.listHref || 'index.html') + '">Liste des jeux</a>';
    }
    return html;
  }

  /**
   * Affiche la carte de score dans `host` ; une fois le score enregistré (`opts.saved`),
   * indique si le score minimum exigé par la leçon est atteint.
   * opts.embed + opts.onReplay / opts.onFinished pour montage inline leçon.
   */
  async function mountScoreCard(host, modele, obtenu, max, opts) {
    const o = opts || {};
    const pOpts = playCtx(modele);
    const embed = !!(o.embed || pOpts.embed);
    const ctx = {
      moduleId: o.moduleId || pOpts.moduleId || scoreCtx(modele).moduleId,
      parcoursId: o.parcoursId || pOpts.parcoursId || scoreCtx(modele).parcoursId,
    };
    host.innerHTML = scoreCardHtml(obtenu, max);
    const actions = host.querySelector('#jpScoreActions');
    function wire() {
      actions.querySelector('#btnReplay')?.addEventListener('click', function () {
        if (typeof o.onReplay === 'function') o.onReplay();
        else if (typeof pOpts.onReplay === 'function') pOpts.onReplay();
        else location.reload();
      });
    }
    actions.innerHTML = scoreActions(ctx, null, Object.assign({}, o, { embed: embed }));
    wire();
    if (o.saved) { try { await o.saved; } catch (_) { return; } }
    const req = await findRequirement(modele, ctx);
    const okCritere = req ? !!req.ok : null;
    if (typeof o.onFinished === 'function') {
      o.onFinished({ obtenu: obtenu, max: max, okCritere: okCritere, req: req });
    } else if (typeof pOpts.onFinished === 'function') {
      pOpts.onFinished({ obtenu: obtenu, max: max, okCritere: okCritere, req: req });
    }
    if (!req) return;
    const PU = global.JpParcoursUi;
    const reqEl = host.querySelector('#jpScoreReq');
    const cible = req.groupe ? 'le chapitre « ' + req.titre + ' »' : 'la leçon « ' + req.titre + ' »';
    if (req.ok) {
      reqEl.className = 'jp-score-req is-ok';
      reqEl.textContent = '✓ Score minimum atteint (' + PU.sur10(req.min) + ') : ce jeu est validé pour ' + cible + '.';
    } else {
      reqEl.className = 'jp-score-req is-todo';
      reqEl.textContent = 'Score minimum requis : ' + PU.sur10(req.min) + ' pour valider ' + cible + '. Rejouez pour progresser.';
    }
    reqEl.hidden = false;
    actions.innerHTML = scoreActions(ctx, req, Object.assign({}, o, { embed: embed }));
    wire();
  }

  /* ——— Anti-similarité distracteurs quiz ——— */
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

  function levenshteinRatio(a, b) {
    const s = canonQuizText(a);
    const t = canonQuizText(b);
    if (!s || !t) return 0;
    if (s === t) return 1;
    const m = s.length;
    const n = t.length;
    const row = new Array(n + 1);
    for (let j = 0; j <= n; j++) row[j] = j;
    for (let i = 1; i <= m; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= n; j++) {
        const tmp = row[j];
        const cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
        prev = tmp;
      }
    }
    return 1 - (row[n] / Math.max(m, n));
  }

  /** True si deux libellés sont trop proches pour coexister dans un QCM. */
  function quizTextsTooClose(a, b) {
    const ca = canonQuizText(a);
    const cb = canonQuizText(b);
    if (!ca || !cb) return false;
    if (ca === cb) return true;
    if (ca.length >= 3 && cb.length >= 3 && (ca.indexOf(cb) >= 0 || cb.indexOf(ca) >= 0)) {
      const shorter = Math.min(ca.length, cb.length);
      const longer = Math.max(ca.length, cb.length);
      if (shorter / longer >= 0.55) return true;
    }
    if (jaccardTokens(a, b) >= 0.6) return true;
    if (levenshteinRatio(a, b) >= 0.72) return true;
    return false;
  }

  function pickDistinctDistractor(candidates, correct, already) {
    const pool = shuffle(candidates.filter(Boolean));
    for (let i = 0; i < pool.length; i++) {
      const v = pool[i];
      if (quizTextsTooClose(v, correct)) continue;
      if (already.some((x) => quizTextsTooClose(x, v))) continue;
      return v;
    }
    return null;
  }

  /** ——— Quiz QCM (auto molécules + manuelles, tirage à chaque partie) ——— */
  async function buildAutoQuizQuestions(modele, pool, limit) {
    const cfg = modele.configuration_json || {};
    const champs = cfg.champs_interroges || cfg.champs || ['indications'];
    if (!pool.length || !champs.length) return [];
    const target = Math.max(1, Number(limit) || (Number(cfg.nb_questions) || 8) * 3);
    const nbProp = Math.max(2, Math.min(6, Number(cfg.nb_propositions) || 3));
    const questions = [];
    const used = new Set();
    let guard = 0;

    await preloadFiches(modele, pool.map((p) => p.id));

    while (questions.length < target && guard < target * 12) {
      guard += 1;
      const med = pick(pool);
      if (!med) break;
      const champ = pick(champs);
      const key = med.id + ':' + champ;
      if (used.has(key)) continue;
      const f = await fiche(modele, med.id);
      if (!f) continue;
      const corrects = valeursChamp(f, champ);
      if (!corrects.length) continue;
      const correct = pick(corrects);
      used.add(key);

      const distractors = [];
      const others = shuffle(pool.filter((p) => p.id !== med.id));
      for (const o of others) {
        if (distractors.length >= nbProp - 1) break;
        const fo = await fiche(modele, o.id);
        if (!fo) continue;
        const vals = valeursChamp(fo, champ).filter((v) => v && v !== correct);
        const d = pickDistinctDistractor(vals, correct, distractors);
        if (d) distractors.push(d);
      }
      if (distractors.length < 1) continue;

      const props = shuffle([correct].concat(distractors).slice(0, nbProp));
      // Filet de sécurité : pas de quasi-doublons dans les propositions
      const unique = [];
      props.forEach((p) => {
        if (!unique.some((u) => quizTextsTooClose(u, p))) unique.push(p);
      });
      if (unique.length < 2 || unique.indexOf(correct) < 0) continue;
      questions.push({
        source: 'auto',
        matrice_id: med.id,
        dci: f.dci || med.dci,
        noms: med.noms || '',
        champ_code: champ,
        question: 'Pour « ' + (f.dci || med.dci) + ' », quelle est une valeur correcte pour « '
          + champLibelle(champ) + ' » ?',
        propositions: unique.slice(0, nbProp),
        correct,
      });
    }
    return questions;
  }

  function buildManualQuizQuestions(cfg) {
    const raw = Array.isArray(cfg.questions_manuelles) ? cfg.questions_manuelles : [];
    return raw.map(function (q) {
      const props = (Array.isArray(q.propositions) ? q.propositions : [])
        .map(function (p) { return String(p || '').trim(); })
        .filter(Boolean);
      const correct = String(q.correct || '').trim();
      const question = String(q.question || '').trim();
      if (!question || props.length < 2 || !correct || props.indexOf(correct) < 0) return null;
      return {
        source: 'manuel',
        id: q.id || null,
        matrice_id: null,
        dci: '',
        noms: '',
        champ_code: null,
        question,
        propositions: shuffle(props.slice()),
        correct,
      };
    }).filter(Boolean);
  }

  async function buildQuizQuestions(modele, pool) {
    const cfg = modele.configuration_json || {};
    const nbWanted = Math.max(1, Number(cfg.nb_questions) || 8);
    const manuelles = buildManualQuizQuestions(cfg);
    let autoCap = pool.length * Math.max(1, (cfg.champs_interroges || cfg.champs || []).length);
    if (cfg.nb_auto_max != null && cfg.nb_auto_max !== '') {
      autoCap = Math.min(autoCap, Math.max(0, Number(cfg.nb_auto_max)));
    }
    const auto = autoCap > 0 ? await buildAutoQuizQuestions(modele, pool, autoCap) : [];
    const bank = shuffle(manuelles.concat(auto));
    return bank.slice(0, Math.min(nbWanted, bank.length));
  }

  function renderQuiz(root, modele, questions) {
    let idx = 0;
    const answers = [];

    function paint() {
      if (idx >= questions.length) {
        const ok = answers.filter((a) => a.ok).length;
        root.innerHTML = '<div id="jpScoreHost"></div>'
          + '<h3 class="jp-v2-recap-title">Détail des réponses</h3>'
          + '<ol class="jp-v2-quiz-recap">' + answers.map(function (a, i) {
            return '<li class="' + (a.ok ? 'is-ok' : 'is-ko') + '">'
              + esc(questions[i].question) + '<br><span class="jp-muted">Votre réponse : '
              + esc(a.choice) + (a.ok ? '' : ' · Correct : ' + esc(questions[i].correct))
              + '</span></li>';
          }).join('') + '</ol>';
        const saved = saveTentative(modele, { type: 'quiz', questions: questions.length }, { answers }, ok, questions.length)
          .then(function () { global.JpToast?.ok?.('Score enregistré'); });
        saved.catch(function () { /* ignore */ });
        const pOpts = playCtx(modele);
        void mountScoreCard(document.getElementById('jpScoreHost'), modele, ok, questions.length, {
          saved: saved,
          listHref: 'index.html?type=quiz',
          embed: !!pOpts.embed,
          onReplay: pOpts.onReplay,
          onFinished: pOpts.onFinished,
        });
        return;
      }

      const q = questions[idx];
      root.innerHTML = '<p class="jp-muted">Question ' + (idx + 1) + ' / ' + questions.length + '</p>'
        + '<h2 class="jp-title" style="font-size:1.25rem">' + esc(q.question) + '</h2>'
        + '<p class="jp-muted">' + esc(q.noms) + '</p>'
        + '<div class="jp-v2-props" id="props">'
        + q.propositions.map(function (p, i) {
          return '<button type="button" class="jp-btn jp-btn-ghost jp-v2-prop" data-i="' + i + '">'
            + esc(p) + '</button>';
        }).join('') + '</div>';

      root.querySelectorAll('.jp-v2-prop').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const choice = q.propositions[Number(btn.getAttribute('data-i'))];
          const ok = choice === q.correct;
          answers.push({
            choice, ok, champ: q.champ_code, matrice_id: q.matrice_id, source: q.source || 'auto',
          });
          idx += 1;
          paint();
        });
      });
    }
    paint();
  }

  /** ——— Classement (DnD + fallback clic) ——— */
  function runClassement(root, modele) {
    const cfg = modele.configuration_json || {};
    const items = Array.isArray(cfg.items) ? cfg.items.slice() : [];
    const zones = Array.isArray(cfg.zones) ? cfg.zones.map(function (z) {
      return { id: z.id, label: z.label, item_ids: Array.isArray(z.item_ids) ? z.item_ids.slice() : [] };
    }) : [];
    if (items.length < 2 || zones.length < 2) {
      throw new Error('Configuration classement incomplète');
    }
    const correctZones = {};
    zones.forEach(function (z) {
      (z.item_ids || []).forEach(function (id) {
        if (!correctZones[id]) correctZones[id] = [];
        if (correctZones[id].indexOf(z.id) < 0) correctZones[id].push(z.id);
      });
    });
    const placement = {}; // itemId -> zoneId | null
    items.forEach(function (it) { placement[it.id] = null; });
    let selectedId = null;
    const pile = shuffle(items);

    function paint(done) {
      if (done) {
        let ok = 0;
        const details = items.map(function (it) {
          const allowed = correctZones[it.id] || [];
          const good = allowed.indexOf(placement[it.id]) >= 0;
          if (good) ok += 1;
          const zoneLab = (zones.find(function (z) { return z.id === placement[it.id]; }) || {}).label || '—';
          const expect = allowed.map(function (zid) {
            return (zones.find(function (z) { return z.id === zid; }) || {}).label || '—';
          }).join(' / ') || '—';
          return { id: it.id, label: it.label, ok: good, zone: zoneLab, expect: expect };
        });
        root.innerHTML = '<div id="jpScoreHost"></div>'
          + '<h3 class="jp-v2-recap-title">Détail</h3>'
          + '<ul class="jp-v2-quiz-recap">' + details.map(function (d) {
            return '<li class="' + (d.ok ? 'is-ok' : 'is-ko') + '">' + esc(d.label)
              + '<br><span class="jp-muted">Votre zone : ' + esc(d.zone)
              + (d.ok ? '' : ' · Correct : ' + esc(d.expect)) + '</span></li>';
          }).join('') + '</ul>';
        const saved = saveTentative(modele, { type: 'classement', n: items.length }, { placement, details }, ok, items.length)
          .then(function () { global.JpToast?.ok?.('Score enregistré'); });
        saved.catch(function () { /* ignore */ });
        const pOpts = playCtx(modele);
        void mountScoreCard(document.getElementById('jpScoreHost'), modele, ok, items.length, {
          saved: saved,
          listHref: 'index.html?type=classement',
          embed: !!pOpts.embed,
          onReplay: pOpts.onReplay,
          onFinished: pOpts.onFinished,
        });
        return;
      }

      const unplaced = pile.filter(function (it) { return !placement[it.id]; });
      let html = '<p class="jp-muted">' + esc(cfg.consigne || 'Classez chaque item dans la bonne catégorie') + '</p>'
        + '<div class="jp-classement">'
        + '<div class="jp-classement-pile" aria-label="Items à classer">'
        + '<p class="jp-classement-col-title">À classer</p>'
        + (unplaced.length
          ? unplaced.map(function (it) {
            return '<button type="button" class="jp-classement-item' + (selectedId === it.id ? ' is-selected' : '')
              + '" draggable="true" data-item="' + esc(it.id) + '">' + esc(it.label) + '</button>';
          }).join('')
          : '<p class="jp-muted">Tous placés</p>')
        + '</div><div class="jp-classement-zones">';
      zones.forEach(function (z) {
        const inZone = items.filter(function (it) { return placement[it.id] === z.id; });
        html += '<div class="jp-classement-zone" data-zone="' + esc(z.id) + '">'
          + '<p class="jp-classement-col-title">' + esc(z.label) + '</p>'
          + '<div class="jp-classement-drop">'
          + (inZone.length
            ? inZone.map(function (it) {
              return '<button type="button" class="jp-classement-item is-placed" draggable="true" data-item="'
                + esc(it.id) + '">' + esc(it.label) + '</button>';
            }).join('')
            : '<span class="jp-muted jp-classement-hint">Déposer ici</span>')
          + '</div></div>';
      });
      html += '</div></div><div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnVerify"'
        + (unplaced.length ? ' disabled' : '') + '>Vérifier</button></div>';
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
          if (selectedId === id) {
            selectedId = null;
            paint(false);
            return;
          }
          selectedId = id;
          paint(false);
        });
        btn.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', id);
          e.dataTransfer.effectAllowed = 'move';
          btn.classList.add('is-dragging');
        });
        btn.addEventListener('dragend', function () { btn.classList.remove('is-dragging'); });
      });

      root.querySelectorAll('.jp-classement-zone').forEach(function (zoneEl) {
        const zid = zoneEl.getAttribute('data-zone');
        zoneEl.addEventListener('dragover', function (e) {
          e.preventDefault();
          zoneEl.classList.add('is-drop-target');
        });
        zoneEl.addEventListener('dragleave', function () { zoneEl.classList.remove('is-drop-target'); });
        zoneEl.addEventListener('drop', function (e) {
          e.preventDefault();
          zoneEl.classList.remove('is-drop-target');
          const id = e.dataTransfer.getData('text/plain') || selectedId;
          place(id, zid);
        });
        zoneEl.addEventListener('click', function (e) {
          if (e.target.closest('.jp-classement-item')) return;
          if (selectedId) place(selectedId, zid);
        });
      });

      root.querySelector('.jp-classement-pile')?.addEventListener('click', function (e) {
        if (e.target.closest('.jp-classement-item')) return;
        if (selectedId && placement[selectedId]) place(selectedId, null);
      });

      document.getElementById('btnVerify')?.addEventListener('click', function () {
        if (Object.keys(placement).some(function (id) { return !placement[id]; })) {
          return global.JpToast?.warn?.('Placez tous les items');
        }
        paint(true);
      });
    }
    paint(false);
  }

  /** Palette fixe pour traits d’appariement (une couleur par paire). */
  const APPARIE_COLORS = [
    '#0f6b5c', '#c45c26', '#2f5aa8', '#8a3a7a', '#3d7a2a',
    '#a67c00', '#1a6f8a', '#9b2d3a', '#5b4bb0', '#2a7a6a',
  ];

  /** ——— Appariement (clic gauche puis droite + traits colorés) ——— */
  function runAppariement(root, modele) {
    const cfg = modele.configuration_json || {};
    const gauche = Array.isArray(cfg.gauche) ? cfg.gauche.slice() : [];
    const droite = Array.isArray(cfg.droite) ? cfg.droite.slice() : [];
    const paires = Array.isArray(cfg.paires) ? cfg.paires : [];
    if (gauche.length < 2 || droite.length < 2 || !paires.length) {
      throw new Error('Configuration appariement incomplète');
    }
    const correct = {};
    paires.forEach(function (p) {
      if (p && p.gauche_id && p.droite_id) correct[p.gauche_id] = p.droite_id;
    });
    const links = {}; // gauche_id -> droite_id
    let selectedG = null;
    const orderG = shuffle(gauche);
    const orderD = shuffle(droite);
    const pairColorIndex = {}; // gauche_id -> index palette stable pour la session
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

    function detachDrawListeners() {
      if (resizeObs) {
        resizeObs.disconnect();
        resizeObs = null;
      }
      if (onWinResize) {
        window.removeEventListener('resize', onWinResize);
        onWinResize = null;
      }
      if (onWinScroll) {
        window.removeEventListener('scroll', onWinScroll, true);
        onWinScroll = null;
      }
    }

    function drawLinks() {
      if (!boardEl || !svgEl) return;
      const rect = boardEl.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      svgEl.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svgEl.setAttribute('width', String(w));
      svgEl.setAttribute('height', String(h));
      const parts = [];
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
        const color = colorFor(gid);
        parts.push(
          '<path d="M ' + x1.toFixed(1) + ' ' + y1.toFixed(1)
            + ' C ' + cx1.toFixed(1) + ' ' + y1.toFixed(1)
            + ', ' + cx2.toFixed(1) + ' ' + y2.toFixed(1)
            + ', ' + x2.toFixed(1) + ' ' + y2.toFixed(1) + '"'
            + ' fill="none" stroke="' + color + '" stroke-width="2.5"'
            + ' stroke-linecap="round" opacity="0.9"/>'
        );
      });
      svgEl.innerHTML = parts.join('');
    }

    function attachDrawListeners() {
      detachDrawListeners();
      if (!boardEl) return;
      onWinResize = function () { drawLinks(); };
      onWinScroll = function () { drawLinks(); };
      window.addEventListener('resize', onWinResize);
      window.addEventListener('scroll', onWinScroll, true);
      if (typeof ResizeObserver !== 'undefined') {
        resizeObs = new ResizeObserver(function () { drawLinks(); });
        resizeObs.observe(boardEl);
      }
      requestAnimationFrame(function () { drawLinks(); });
    }

    function paint(done) {
      detachDrawListeners();
      if (done) {
        let ok = 0;
        const details = orderG.map(function (g) {
          const good = links[g.id] === correct[g.id];
          if (good) ok += 1;
          const dLab = (droite.find(function (d) { return d.id === links[g.id]; }) || {}).label || '—';
          const eLab = (droite.find(function (d) { return d.id === correct[g.id]; }) || {}).label || '—';
          return { label: g.label, ok: good, choix: dLab, expect: eLab };
        });
        root.innerHTML = '<div id="jpScoreHost"></div>'
          + '<h3 class="jp-v2-recap-title">Détail</h3>'
          + '<ul class="jp-v2-quiz-recap">' + details.map(function (d) {
            return '<li class="' + (d.ok ? 'is-ok' : 'is-ko') + '">' + esc(d.label)
              + '<br><span class="jp-muted">Votre lien : ' + esc(d.choix)
              + (d.ok ? '' : ' · Correct : ' + esc(d.expect)) + '</span></li>';
          }).join('') + '</ul>';
        const saved = saveTentative(modele, { type: 'appariement', n: orderG.length }, { links, details }, ok, orderG.length)
          .then(function () { global.JpToast?.ok?.('Score enregistré'); });
        saved.catch(function () { /* ignore */ });
        const pOpts = playCtx(modele);
        void mountScoreCard(document.getElementById('jpScoreHost'), modele, ok, orderG.length, {
          saved: saved,
          listHref: 'index.html?type=appariement',
          embed: !!pOpts.embed,
          onReplay: pOpts.onReplay,
          onFinished: pOpts.onFinished,
        });
        return;
      }

      const usedRight = new Set(Object.keys(links).map(function (g) { return links[g]; }));
      const gToColor = {};
      Object.keys(links).forEach(function (gid) { gToColor[gid] = colorFor(gid); });
      const dToColor = {};
      Object.keys(links).forEach(function (gid) { dToColor[links[gid]] = gToColor[gid]; });

      let html = '<p class="jp-muted">' + esc(cfg.consigne || 'Reliez chaque élément de gauche à celui de droite') + '</p>'
        + '<p class="jp-field-hint">Cliquez un élément à gauche, puis sa correspondance à droite. Recliquez une paire pour annuler.</p>'
        + '<div class="jp-appariement" id="jpApparieBoard">'
        + '<svg class="jp-appariement-svg" aria-hidden="true"></svg>'
        + '<div class="jp-appariement-col jp-appariement-col--g" aria-label="Gauche">';
      orderG.forEach(function (g) {
        const linked = links[g.id];
        const col = linked ? gToColor[g.id] : '';
        html += '<button type="button" class="jp-appariement-card jp-appariement-card--g'
          + (selectedG === g.id ? ' is-selected' : '')
          + (linked ? ' is-linked' : '') + '" data-g="' + esc(g.id) + '"'
          + (col ? ' style="--jp-pair:' + col + '"' : '') + '>'
          + '<span class="jp-appariement-card-body"><strong>' + esc(g.label) + '</strong></span>'
          + '<span class="jp-appariement-handle" data-g-handle="' + esc(g.id) + '" aria-hidden="true"></span>'
          + '</button>';
      });
      html += '</div><div class="jp-appariement-col jp-appariement-col--d" aria-label="Droite">';
      orderD.forEach(function (d) {
        const col = dToColor[d.id] || '';
        html += '<button type="button" class="jp-appariement-card jp-appariement-card--d'
          + (usedRight.has(d.id) ? ' is-used is-linked' : '')
          + '" data-d="' + esc(d.id) + '"'
          + (col ? ' style="--jp-pair:' + col + '"' : '') + '>'
          + '<span class="jp-appariement-handle" data-d-handle="' + esc(d.id) + '" aria-hidden="true"></span>'
          + '<span class="jp-appariement-card-body">' + esc(d.label) + '</span>'
          + '</button>';
      });
      html += '</div></div><div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-ghost" id="btnResetLinks">Réinitialiser</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnVerify"'
        + (Object.keys(links).length < orderG.length ? ' disabled' : '') + '>Vérifier</button></div>';
      root.innerHTML = html;
      boardEl = root.querySelector('#jpApparieBoard');
      svgEl = root.querySelector('.jp-appariement-svg');
      attachDrawListeners();

      root.querySelectorAll('[data-g]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const gid = btn.getAttribute('data-g');
          if (links[gid]) {
            delete links[gid];
            selectedG = null;
            paint(false);
            return;
          }
          selectedG = selectedG === gid ? null : gid;
          paint(false);
        });
      });
      root.querySelectorAll('[data-d]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          const did = btn.getAttribute('data-d');
          if (!selectedG) {
            return global.JpToast?.warn?.('Sélectionnez d’abord un élément à gauche');
          }
          Object.keys(links).forEach(function (g) {
            if (links[g] === did) delete links[g];
          });
          links[selectedG] = did;
          selectedG = null;
          paint(false);
        });
      });
      document.getElementById('btnResetLinks')?.addEventListener('click', function () {
        Object.keys(links).forEach(function (k) { delete links[k]; });
        selectedG = null;
        paint(false);
      });
      document.getElementById('btnVerify')?.addEventListener('click', function () {
        if (Object.keys(links).length < orderG.length) {
          return global.JpToast?.warn?.('Reliez tous les éléments');
        }
        paint(true);
      });
    }
    paint(false);
  }

  /** Notes ≥ seuil par matrice (scores_fiche_aleatoire). */
  async function loadFicheExclusionCounts(matriceIds, seuil) {
    const ids = (matriceIds || []).filter(Boolean);
    const map = Object.create(null);
    ids.forEach((id) => { map[String(id)] = 0; });
    if (!ids.length) return map;
    const user = await global.JpApp.getUser();
    if (!user) return map;
    const { data, error } = await sb()
      .from('scores_fiche_aleatoire')
      .select('matrice_id, score_obtenu')
      .eq('utilisateur_id', user.id)
      .in('matrice_id', ids)
      .gte('score_obtenu', seuil);
    if (error) throw error;
    (data || []).forEach((r) => {
      const k = String(r.matrice_id);
      map[k] = (map[k] || 0) + 1;
    });
    return map;
  }

  /** ——— Fiche aléatoire ——— */
  async function runFicheAleatoire(root, modele) {
    const cfg = modele.configuration_json || {};
    const fullPool = await poolMedicaments(modele);
    if (!fullPool.length) throw new Error('Aucune molécule dans votre parcours pour ce jeu');

    const seuil = Math.max(0, Number(cfg.seuil_exclusion) || 8);
    const nbNotes = Math.max(1, Number(cfg.nb_notes_exclusion) || 3);
    const counts = await loadFicheExclusionCounts(fullPool.map((p) => p.id), seuil);

    function eligibleFrom(source) {
      return source.filter((p) => (counts[String(p.id)] || 0) < nbNotes);
    }

    let pool = eligibleFrom(fullPool);
    let ignoreExclusion = false;
    let current = null;
    let revealed = false;

    await preloadFiches(modele, fullPool.map((p) => p.id));

    function paintEmptyMastered() {
      root.innerHTML = '<div class="jp-v2-empty jp-fiche-mastered">'
        + '<p class="jp-title" style="font-size:1.15rem">Toutes les molécules du répertoire sont maîtrisées</p>'
        + '<p class="jp-muted">Vous avez obtenu au moins ' + esc(String(nbNotes)) + ' note(s) ≥ '
        + esc(String(seuil)) + '/10 sur chaque molécule.</p>'
        + '<div class="jp-v2-actions">'
        + '<button type="button" class="jp-btn jp-btn-primary" id="btnReplayAll">Rejouer quand même</button>'
        + '</div></div>';
      document.getElementById('btnReplayAll')?.addEventListener('click', function () {
        ignoreExclusion = true;
        pool = fullPool.slice();
        void next();
      });
      const pOpts = playCtx(modele);
      if (typeof pOpts.onFinished === 'function') {
        pOpts.onFinished({ obtenu: 0, max: 10, okCritere: true, mastered: true });
      }
    }

    async function next() {
      revealed = false;
      if (!ignoreExclusion) pool = eligibleFrom(fullPool);
      if (!pool.length) {
        paintEmptyMastered();
        return;
      }
      const med = pick(pool);
      current = await fiche(modele, med.id);
      if (!current) throw new Error('Fiche inaccessible');
      paint();
    }

    function paint() {
      const champs = current.champs || {};
      const codes = Object.keys(champs).filter(function (c) {
        return c !== 'nom_commercial' && c !== 'dci';
      });
      let html = '<article class="jp-v2-mol-card">'
        + '<h3>' + esc(current.dci) + '</h3>'
        + '<p class="jp-muted">' + esc((current.noms_commerciaux || []).map(function (n) {
          return n.valeur;
        }).join(', ')) + '</p>';

      if (!revealed) {
        html += '<p class="jp-v2-banner">Restituez mentalement les informations du programme, puis révélez.</p>'
          + '<ul class="jp-muted">' + codes.map(function (c) {
            return '<li>' + esc(champLibelle(c)) + ' : ???</li>';
          }).join('') + '</ul>';
      } else {
        html += '<dl class="jp-v2-champs-revealed">';
        codes.forEach(function (c) {
          html += '<dt>' + esc(champLibelle(c)) + '</dt><dd>'
            + esc(valeursChamp(current, c).join(' · ') || '—') + '</dd>';
        });
        html += '</dl>';
      }
      html += '</article><div class="jp-v2-actions">';
      if (!revealed) {
        html += '<button type="button" class="jp-btn jp-btn-primary" id="btnReveal">Voir les réponses</button>';
      } else {
        html += '<div class="jp-field"><label for="score">Note /10</label>'
          + '<input id="score" type="number" min="0" max="10" value="8"></div>'
          + '<button type="button" class="jp-btn jp-btn-primary" id="btnScore">Enregistrer</button>';
      }
      html += '<button type="button" class="jp-btn jp-btn-ghost" id="btnPass">Passer</button></div>';
      root.innerHTML = html;

      document.getElementById('btnReveal')?.addEventListener('click', function () {
        revealed = true;
        paint();
      });
      document.getElementById('btnPass')?.addEventListener('click', function () { void next(); });
      document.getElementById('btnScore')?.addEventListener('click', async function () {
        const s = Number(document.getElementById('score').value);
        if (Number.isNaN(s) || s < 0 || s > 10) {
          return global.JpToast?.warn?.('Note entre 0 et 10');
        }
        try {
          await saveTentative(modele, { type: 'fiche_aleatoire', matrice_id: current.id }, { score: s }, s, 10);
          const user = await global.JpApp.getUser();
          if (user) {
            await sb().from('scores_fiche_aleatoire').insert({
              utilisateur_id: user.id,
              matrice_id: current.id,
              score_obtenu: Math.round(s),
              score_max: 10,
            });
          }
          if (s >= seuil) {
            const mid = String(current.id);
            counts[mid] = (counts[mid] || 0) + 1;
          }
          global.JpToast?.ok?.('Note enregistrée');
          await next();
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
    }

    await next();
  }

  /** Params trous (compat densite_trous / nb_fiches / champs). */
  function trousParams(cfg) {
    const colonnes = Array.isArray(cfg.colonnes) && cfg.colonnes.length
      ? cfg.colonnes.filter(Boolean)
      : (cfg.champs_interroges || cfg.champs || [
        'indications', 'contre_indications', 'effets_indesirables', 'surveillances',
      ]);
    const toujours = Array.isArray(cfg.toujours_visibles)
      ? cfg.toujours_visibles.filter(Boolean)
      : ['dci', 'nom_commercial'];
    let taux = cfg.taux_trous != null && cfg.taux_trous !== ''
      ? Number(cfg.taux_trous)
      : null;
    if (taux == null || Number.isNaN(taux)) {
      const densite = Math.max(1, Math.min(5, Number(cfg.densite_trous) || 3));
      taux = densite * 20;
    }
    taux = Math.max(0, Math.min(100, taux));
    const nbLignes = Math.max(1, Number(cfg.nb_lignes) || Number(cfg.nb_fiches) || 5);
    return { colonnes: colonnes, toujours: toujours, taux: taux, nbLignes: nbLignes };
  }

  /** ——— Tableau à trous (lignes = molécules, colonnes = champs) ——— */
  async function runTrous(root, modele) {
    const cfg = modele.configuration_json || {};
    const pool = await poolMedicaments(modele);
    const tp = trousParams(cfg);
    const nb = Math.min(tp.nbLignes, pool.length);
    if (!nb) throw new Error('Aucune molécule pour ce tableau à trous');
    if (!tp.colonnes.length) throw new Error('Aucune colonne configurée');

    const selected = shuffle(pool).slice(0, nb);
    await preloadFiches(modele, selected.map((m) => m.id));
    const rows = [];
    const holeKeys = []; // { row, col } éligibles

    for (const med of selected) {
      const f = await fiche(modele, med.id);
      if (!f) continue;
      const cells = {};
      tp.colonnes.forEach(function (code) {
        const vals = valeursChamp(f, code);
        cells[code] = vals.length ? vals.join(' · ') : '';
      });
      const row = { fiche: f, med: med, cells: cells };
      rows.push(row);
      tp.colonnes.forEach(function (code) {
        if (tp.toujours.indexOf(code) >= 0) return;
        if (!cells[code]) return;
        holeKeys.push({ row: row, col: code });
      });
    }

    const nHoles = Math.round(holeKeys.length * (tp.taux / 100));
    const holes = new Set(
      shuffle(holeKeys).slice(0, nHoles).map(function (h) {
        return String(h.row.fiche.id) + ':' + h.col;
      })
    );

    let revealed = false;
    function paint() {
      let html = '<p class="jp-muted">Complétez mentalement les cases « ??? » ('
        + esc(String(tp.taux)) + ' % de trous). '
        + 'Seules les infos du parcours sont présentes.</p>';
      html += '<div class="jp-table-wrap"><table class="jp-table jp-trous-grid"><thead><tr>'
        + '<th>Molécule</th>'
        + tp.colonnes.map(function (c) {
          return '<th>' + esc(champLibelle(c)) + '</th>';
        }).join('')
        + '</tr></thead><tbody>';
      rows.forEach(function (r) {
        const label = r.fiche.dci || r.med.dci || '—';
        const noms = r.med.noms || (r.fiche.noms_commerciaux || []).map(function (n) {
          return n.valeur;
        }).join(', ');
        html += '<tr><th scope="row"><strong>' + esc(label) + '</strong>'
          + (noms ? '<br><span class="jp-muted">' + esc(noms) + '</span>' : '')
          + '</th>';
        tp.colonnes.forEach(function (c) {
          const key = String(r.fiche.id) + ':' + c;
          const isHole = holes.has(key);
          const val = r.cells[c] || '—';
          html += '<td class="' + (isHole ? 'jp-trou' : '') + '">'
            + (revealed || !isHole ? esc(val) : '<em>???</em>')
            + '</td>';
        });
        html += '</tr>';
      });
      html += '</tbody></table></div><div class="jp-v2-actions">';
      if (!revealed) {
        html += '<button type="button" class="jp-btn jp-btn-primary" id="btnReveal">Voir les réponses</button>';
      } else {
        html += '<div class="jp-field"><label for="score">Score obtenu</label>'
          + '<input id="score" type="number" min="0" value="' + rows.length + '"></div>'
          + '<div class="jp-field"><label for="scoreMax">Score max</label>'
          + '<input id="scoreMax" type="number" min="1" value="' + rows.length + '"></div>'
          + '<button type="button" class="jp-btn jp-btn-primary" id="btnScore">Enregistrer</button>';
      }
      html += '</div>';
      root.innerHTML = html;
      document.getElementById('btnReveal')?.addEventListener('click', function () {
        revealed = true;
        paint();
      });
      document.getElementById('btnScore')?.addEventListener('click', async function () {
        const o = Number(document.getElementById('score').value);
        const m = Number(document.getElementById('scoreMax').value) || rows.length;
        try {
          const saved = saveTentative(modele, { type: 'trous', n: rows.length, trous: holes.size }, { score: o }, o, m);
          await saved;
          global.JpToast?.ok?.('Score enregistré');
          const pOpts = playCtx(modele);
          void mountScoreCard(root, modele, o, m, {
            saved: Promise.resolve(),
            listHref: 'index.html?type=trous',
            embed: !!pOpts.embed,
            onReplay: pOpts.onReplay,
            onFinished: pOpts.onFinished,
          });
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
    }
    paint();
  }

  /** Ordonnance inline (embed leçon) — même flux que ordonnances/jouer.html. */
  async function runOrdonnanceEmbed(root, modele) {
    const Ordo = global.JpV2Ordonnances;
    if (!Ordo) throw new Error('Module ordonnances non chargé');
    const session = await Ordo.demarrer(modele.code_unique);
    let revele = false;
    const pOpts = playCtx(modele);

    function paint() {
      let html = '<div id="mols">'
        + (revele
          ? Ordo.renderMoleculesRevelees(session._fullMolecules || session.molecules, session.champs)
          : Ordo.renderMoleculesMasquees(session.molecules, session.champs))
        + '</div>';
      html += '<div class="jp-v2-actions" style="margin-top:1rem">';
      if (!revele) {
        html += '<button type="button" class="jp-btn jp-btn-primary" id="btnReveal">Voir les réponses</button>';
      } else {
        html += '<div class="jp-field"><label for="scoreObtenu">Score obtenu</label>'
          + '<input id="scoreObtenu" type="number" min="0" step="1" value="0"></div>'
          + '<div class="jp-field"><label for="scoreMax">Score max</label>'
          + '<input id="scoreMax" type="number" min="1" step="1" value="10"></div>'
          + '<button type="button" class="jp-btn jp-btn-primary" id="btnScore">Enregistrer le score</button>';
      }
      html += '</div><div id="jpScoreHost"></div>';
      root.innerHTML = html;

      document.getElementById('btnReveal')?.addEventListener('click', async function () {
        try {
          const full = await Ordo.reveler(session.tentative_id);
          session._fullMolecules = full.molecules;
          session.champs = full.champs || session.champs;
          revele = true;
          paint();
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
      document.getElementById('btnScore')?.addEventListener('click', async function () {
        try {
          const obt = Number(document.getElementById('scoreObtenu').value);
          const max = Number(document.getElementById('scoreMax').value);
          const res = await Ordo.noter(session.tentative_id, obt, max, [{ mode: 'general' }]);
          global.JpToast?.ok?.('Score enregistré');
          void mountScoreCard(document.getElementById('jpScoreHost'), modele, res.score_obtenu, res.score_max, {
            saved: Promise.resolve(),
            embed: true,
            onReplay: pOpts.onReplay,
            onFinished: pOpts.onFinished,
          });
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
    }
    paint();
  }

  /**
   * @param {HTMLElement} root
   * @param {string} code
   * @param {{ embed?: boolean, moduleId?: string, parcoursId?: string, onReplay?: Function, onFinished?: Function }} [opts]
   */
  async function boot(root, code, opts) {
    const modele = await loadModele(code);
    modele._playOpts = opts || {};

    if (modele.type_jeu === 'ordonnance') {
      if (modele._playOpts.embed) {
        await runOrdonnanceEmbed(root, modele);
        return modele;
      }
      location.replace('../ordonnances/jouer.html' + (location.search || '?code=' + encodeURIComponent(modele.code_unique)));
      return modele;
    }

    try {
      const [profil, insc] = await Promise.all([
        global.JpV2Resolver.getProfilV2(),
        global.JpV2Resolver.mesInscriptions(),
      ]);
      if (modele.parcours_id && profil?.parcours_id !== modele.parcours_id) {
        await global.JpV2Resolver.setParcoursActif(modele.parcours_id, { inscriptions: insc });
      }
    } catch (_) { /* ignore */ }

    if (modele.type_jeu === 'quiz') {
      root.innerHTML = '<p class="jp-muted">Préparation du quiz…</p>';
      const cfg = modele.configuration_json || {};
      const hasManuelles = Array.isArray(cfg.questions_manuelles) && cfg.questions_manuelles.length;
      const pool = await poolMedicaments(modele);
      if (!pool.length && !hasManuelles) {
        throw new Error('Aucune molécule publiée dans les modules de ce quiz, et aucune question manuelle.');
      }
      const questions = await buildQuizQuestions(modele, pool);
      if (!questions.length) {
        throw new Error('Impossible de générer des questions (champs vides ou banque trop petite).');
      }
      renderQuiz(root, modele, questions);
      return modele;
    }

    if (modele.type_jeu === 'fiche_aleatoire') {
      await runFicheAleatoire(root, modele);
      return modele;
    }

    if (modele.type_jeu === 'trous') {
      await runTrous(root, modele);
      return modele;
    }

    if (modele.type_jeu === 'classement') {
      runClassement(root, modele);
      return modele;
    }

    if (modele.type_jeu === 'appariement') {
      runAppariement(root, modele);
      return modele;
    }

    throw new Error('Type de jeu non supporté : ' + modele.type_jeu);
  }

  global.JpJeuxPlay = {
    boot,
    loadModele,
    champLibelle,
    mountScoreCard,
    repertoireMode,
    poolMedicaments,
  };
})(window);
