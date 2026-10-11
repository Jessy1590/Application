/**
 * Écrans de jeu joueur — quiz, trous, fiche aléatoire (contenu = résolveur parcours).
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

  async function poolMedicaments(modele) {
    return global.JpV2Resolver.listerMedicaments({
      parcoursId: modele.parcours_id || null,
      moduleIds: (modele.module_ids && modele.module_ids.length) ? modele.module_ids : null,
    });
  }

  async function fiche(modele, matriceId) {
    return global.JpV2Resolver.ficheResolue(matriceId, {
      parcoursId: modele.parcours_id || null,
      moduleIds: (modele.module_ids && modele.module_ids.length) ? modele.module_ids : null,
    });
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

  /** ——— Quiz QCM ——— */
  async function buildQuizQuestions(modele, pool) {
    const cfg = modele.configuration_json || {};
    const champs = cfg.champs_interroges || cfg.champs || ['indications'];
    const nb = Math.min(Number(cfg.nb_questions) || 8, pool.length * Math.max(1, champs.length));
    const nbProp = Math.max(2, Math.min(6, Number(cfg.nb_propositions) || 3));
    const questions = [];
    const used = new Set();
    let guard = 0;

    while (questions.length < nb && guard < nb * 12) {
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
        const vals = valeursChamp(fo, champ).filter((v) => v !== correct && !distractors.includes(v));
        if (vals.length) distractors.push(pick(vals));
      }
      if (distractors.length < 1) continue;

      const props = shuffle([correct].concat(distractors).slice(0, nbProp));
      questions.push({
        matrice_id: med.id,
        dci: f.dci || med.dci,
        noms: med.noms || '',
        champ_code: champ,
        question: 'Pour « ' + (f.dci || med.dci) + ' », quelle est une valeur correcte pour « '
          + champLibelle(champ) + ' » ?',
        propositions: props,
        correct,
      });
    }
    return questions;
  }

  function renderQuiz(root, modele, questions) {
    let idx = 0;
    const answers = [];

    function paint() {
      if (idx >= questions.length) {
        const ok = answers.filter((a) => a.ok).length;
        root.innerHTML = '<div class="jp-v2-banner"><strong>Score : ' + ok + ' / '
          + questions.length + '</strong></div>'
          + '<ol class="jp-v2-quiz-recap">' + answers.map(function (a, i) {
            return '<li class="' + (a.ok ? 'is-ok' : 'is-ko') + '">'
              + esc(questions[i].question) + '<br><span class="jp-muted">Votre réponse : '
              + esc(a.choice) + (a.ok ? '' : ' · Correct : ' + esc(questions[i].correct))
              + '</span></li>';
          }).join('') + '</ol>'
          + '<div class="jp-v2-actions"><button type="button" class="jp-btn jp-btn-primary" id="btnReplay">Rejouer</button>'
          + '<a class="jp-btn jp-btn-ghost" href="index.html?type=quiz">Liste des quiz</a></div>';
        document.getElementById('btnReplay')?.addEventListener('click', function () {
          location.reload();
        });
        void saveTentative(modele, { type: 'quiz', questions: questions.length }, { answers }, ok, questions.length)
          .then(function () { global.JpToast?.ok?.('Score enregistré'); })
          .catch(function () { /* ignore */ });
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
          answers.push({ choice, ok, champ: q.champ_code, matrice_id: q.matrice_id });
          idx += 1;
          paint();
        });
      });
    }
    paint();
  }

  /** ——— Fiche aléatoire ——— */
  async function runFicheAleatoire(root, modele) {
    const cfg = modele.configuration_json || {};
    const pool = await poolMedicaments(modele);
    if (!pool.length) throw new Error('Aucune molécule dans votre parcours pour ce jeu');

    let current = null;
    let revealed = false;

    async function next() {
      revealed = false;
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
          // Compat table legacy scores
          const user = await global.JpApp.getUser();
          if (user) {
            await sb().from('scores_fiche_aleatoire').insert({
              utilisateur_id: user.id,
              matrice_id: current.id,
              score_obtenu: Math.round(s),
              score_max: 10,
            });
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

  /** ——— Tableau à trous (version simplifiée par fiche) ——— */
  async function runTrous(root, modele) {
    const cfg = modele.configuration_json || {};
    const pool = await poolMedicaments(modele);
    const nb = Math.min(Number(cfg.nb_fiches) || 4, pool.length);
    const densite = Math.max(1, Math.min(5, Number(cfg.densite_trous) || 3));
    const champPrefs = cfg.champs_interroges || cfg.champs || [
      'indications', 'contre_indications', 'effets_indesirables', 'surveillances',
    ];
    if (!nb) throw new Error('Aucune molécule pour ce tableau à trous');

    const selected = shuffle(pool).slice(0, nb);
    const rows = [];
    for (const med of selected) {
      const f = await fiche(modele, med.id);
      if (!f) continue;
      const available = champPrefs.filter(function (c) { return valeursChamp(f, c).length; });
      const nTrous = Math.min(densite, available.length);
      const trous = shuffle(available).slice(0, nTrous);
      rows.push({ fiche: f, trous, med });
    }

    let revealed = false;
    function paint() {
      let html = '<p class="jp-muted">Complétez mentalement les cases « ??? ». '
        + 'Seules les infos du parcours sont présentes — le reste est masqué.</p>';
      html += '<div class="jp-table-wrap"><table class="jp-table"><thead><tr><th>DCI</th><th>Champs</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        html += '<tr><td><strong>' + esc(r.fiche.dci) + '</strong><br><span class="jp-muted">'
          + esc(r.med.noms || '') + '</span></td><td><dl class="jp-v2-champs-revealed">';
        const codes = Object.keys(r.fiche.champs || {});
        codes.forEach(function (c) {
          if (c === 'nom_commercial' || c === 'dci') return;
          const isHole = r.trous.indexOf(c) >= 0;
          const val = valeursChamp(r.fiche, c).join(' · ') || '—';
          html += '<dt>' + esc(champLibelle(c)) + '</dt><dd>'
            + (revealed || !isHole ? esc(val) : '<em>???</em>') + '</dd>';
        });
        html += '</dl></td></tr>';
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
          await saveTentative(modele, { type: 'trous', n: rows.length }, { score: o }, o, m);
          global.JpToast?.ok?.('Score enregistré');
        } catch (e) {
          global.JpToast?.fromError?.(e);
        }
      });
    }
    paint();
  }

  async function boot(root, code) {
    const modele = await loadModele(code);
    if (modele.type_jeu === 'ordonnance') {
      location.replace('../ordonnances/jouer.html?code=' + encodeURIComponent(modele.code_unique));
      return modele;
    }

    // Aligner le parcours actif sur celui du jeu si besoin
    try {
      const profil = await global.JpV2Resolver.getProfilV2();
      if (modele.parcours_id && profil?.parcours_id !== modele.parcours_id) {
        await global.JpV2Resolver.setParcoursActif(modele.parcours_id);
      }
    } catch (_) { /* ignore */ }

    if (modele.type_jeu === 'quiz') {
      root.innerHTML = '<p class="jp-muted">Préparation du quiz…</p>';
      const pool = await poolMedicaments(modele);
      if (!pool.length) {
        throw new Error('Aucune molécule publiée dans les modules de ce quiz. Vérifiez le parcours Introduction.');
      }
      const questions = await buildQuizQuestions(modele, pool);
      if (!questions.length) {
        throw new Error('Impossible de générer des questions (champs vides sur les fiches publiées).');
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

    throw new Error('Type de jeu non supporté : ' + modele.type_jeu);
  }

  global.JpJeuxPlay = { boot, loadModele, champLibelle };
})(window);
