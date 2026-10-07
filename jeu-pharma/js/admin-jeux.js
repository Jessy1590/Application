/**
 * Admin Création jeu — quiz + tableau à trous (une page, deux panneaux).
 */
(function (global) {
  function $(id) {
    return document.getElementById(id);
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  async function resolveDisplayNames(userIds) {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    const map = {};
    if (!ids.length) return map;
    try {
      const { data, error } = await global.JpApp.sbPortail()
        .from('profiles')
        .select('id, display_name')
        .in('id', ids);
      if (error) throw error;
      (data || []).forEach(function (p) {
        map[p.id] = p.display_name || p.id.slice(0, 8);
      });
    } catch (_) {
      ids.forEach(function (id) {
        map[id] = id.slice(0, 8);
      });
    }
    ids.forEach(function (id) {
      if (!map[id]) map[id] = id.slice(0, 8);
    });
    return map;
  }

  function parseTypeFromUrl() {
    const t = new URLSearchParams(location.search).get('type');
    if (t === 'trous' || t === 'tableau' || t === 'tableau-trous') return 'trous';
    return 'quiz';
  }

  function setType(type) {
    const isQuiz = type !== 'trous';
    document.querySelectorAll('[data-jeu-type]').forEach(function (btn) {
      const active = btn.getAttribute('data-jeu-type') === (isQuiz ? 'quiz' : 'trous');
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.classList.toggle('is-active', active);
    });
    $('panelQuiz').hidden = !isQuiz;
    $('panelTrous').hidden = isQuiz;
    const url = new URL(location.href);
    url.searchParams.set('type', isQuiz ? 'quiz' : 'trous');
    history.replaceState(null, '', url.pathname + url.search);
  }

  function currentType() {
    return $('panelQuiz').hidden ? 'trous' : 'quiz';
  }

  async function fillNiveaux(sel) {
    (global.JpConstants.NIVEAUX || []).forEach(function (n) {
      const o = document.createElement('option');
      o.value = n.code;
      o.textContent = n.libelle;
      sel.appendChild(o);
    });
    try {
      const niv = await global.JpProfil.getNiveauCode();
      if (niv) sel.value = niv;
    } catch (_) { /* ignore */ }
  }

  async function fillSecteurs(sel) {
    const secteurs = await global.JpQuizz.listSecteurs();
    secteurs.forEach(function (s) {
      const o = document.createElement('option');
      o.value = s.id;
      o.textContent = s.valeur;
      sel.appendChild(o);
    });
  }

  /* —— Quiz form —— */
  function initQuizForm() {
    const champsList = $('quizChampsList');
    const defaultChamps = ['classe_pharmacologique', 'dci', 'classe_therapeutique'];
    (global.JpConstants.CHAMP_CODES || []).forEach(function (c) {
      const id = 'quiz_ch_' + c.code;
      const label = document.createElement('label');
      label.className = 'jp-quiz-admin-champ';
      label.innerHTML = '<input type="checkbox" name="quizChamp" value="' + global.JpUi.escapeHtml(c.code) + '" id="' + id + '"'
        + (defaultChamps.indexOf(c.code) >= 0 ? ' checked' : '') + '> '
        + '<span>' + global.JpUi.escapeHtml(c.libelle) + '</span>';
      champsList.appendChild(label);
    });
    function setAll(checked) {
      champsList.querySelectorAll('input[name="quizChamp"]').forEach(function (el) {
        el.checked = checked;
      });
    }
    $('quizBtnChampsTous').addEventListener('click', function () { setAll(true); });
    $('quizBtnChampsAucun').addEventListener('click', function () { setAll(false); });
  }

  async function submitQuiz() {
    const champs = Array.from(document.querySelectorAll('input[name="quizChamp"]:checked')).map(function (el) {
      return el.value;
    });
    const created = await global.JpQuizz.createAndGenerate({
      titre: $('quizTitre').value,
      secteur_therapeutique_id: $('quizSecteur').value || null,
      niveau_cible: $('quizNiveau').value,
      mode: $('quizMode').value,
      champs_interroges: champs,
      nb_questions: Number($('quizNbQ').value),
      nb_propositions: Number($('quizNbProp').value),
    });
    const box = $('resultBox');
    box.hidden = false;
    $('resultCode').textContent = created.code_unique;
    $('resultMeta').textContent =
      'Quiz · ' + created.titre + ' · ' + global.JpQuizz.modeLibelle(created.mode) + ' · ' + created.niveau_cible;
    $('resultPlay').href = '../quiz/jouer.html?code=' + encodeURIComponent(created.code_unique);
    $('resultPrint').href = '../quiz/imprimer.html?code=' + encodeURIComponent(created.code_unique);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    global.JpToast.ok('Quiz généré : ' + created.code_unique);
  }

  /* —— Trous form —— */
  function initTrousForm(state) {
    const colonnesList = $('trousColonnesList');
    const defaults = global.JpTrous.COLONNES_DEFAUT;
    (global.JpConstants.CHAMP_CODES || []).forEach(function (c) {
      const label = document.createElement('label');
      label.className = 'jp-trous-admin-col';
      label.innerHTML = '<input type="checkbox" name="trousCol" value="' + global.JpUi.escapeHtml(c.code) + '"'
        + (defaults.indexOf(c.code) >= 0 ? ' checked' : '') + '> '
        + '<span>' + global.JpUi.escapeHtml(c.libelle) + '</span>';
      colonnesList.appendChild(label);
    });
    $('trousBtnColsAll').addEventListener('click', function () {
      colonnesList.querySelectorAll('input[name="trousCol"]').forEach(function (el) { el.checked = true; });
    });
    $('trousBtnColsNone').addEventListener('click', function () {
      colonnesList.querySelectorAll('input[name="trousCol"]').forEach(function (el) { el.checked = false; });
    });

    function updateMedsCount() {
      const n = state.selectedMedIds.size;
      $('trousMedsCount').textContent = n ? n + ' sélectionné(s)' : '';
    }

    function renderMedsList() {
      const q = ($('trousMedsFilter').value || '').trim().toLowerCase();
      const wrap = $('trousMedsList');
      const filtered = state.allPublieMeds.filter(function (m) {
        if (!q) return true;
        const nom = String(global.JpMedicaments.formatNoms(m) || '').toLowerCase();
        const dci = String(m.dci || '').toLowerCase();
        return nom.indexOf(q) >= 0 || dci.indexOf(q) >= 0;
      });
      if (!filtered.length) {
        wrap.innerHTML = '<p class="jp-muted">Aucune fiche publiée correspondante.</p>';
        updateMedsCount();
        return;
      }
      wrap.innerHTML = filtered.map(function (m) {
        const id = m.id;
        const noms = global.JpMedicaments.formatNoms(m);
        const label = (noms || m.dci || id) + (m.dci && noms ? ' · ' + m.dci : '');
        return '<label class="jp-trous-admin-med">'
          + '<input type="checkbox" name="trousMed" value="' + global.JpUi.escapeHtml(id) + '"'
          + (state.selectedMedIds.has(id) ? ' checked' : '') + '>'
          + '<span>' + global.JpUi.escapeHtml(label) + '</span></label>';
      }).join('');
      wrap.querySelectorAll('input[name="trousMed"]').forEach(function (el) {
        el.addEventListener('change', function () {
          if (el.checked) state.selectedMedIds.add(el.value);
          else state.selectedMedIds.delete(el.value);
          updateMedsCount();
        });
      });
      updateMedsCount();
    }

    state.renderMedsList = renderMedsList;

    $('trousMedsFilter').addEventListener('input', renderMedsList);
    $('trousBtnMedsAllVisible').addEventListener('click', function () {
      document.querySelectorAll('#trousMedsList input[name="trousMed"]').forEach(function (el) {
        el.checked = true;
        state.selectedMedIds.add(el.value);
      });
      updateMedsCount();
    });
    $('trousBtnMedsNone').addEventListener('click', function () {
      state.selectedMedIds.clear();
      document.querySelectorAll('#trousMedsList input[name="trousMed"]').forEach(function (el) {
        el.checked = false;
      });
      updateMedsCount();
    });

    $('trousDensite').addEventListener('input', function () {
      $('trousDensiteLabel').textContent = this.value + ' %';
    });

    $('trousModeTrous').addEventListener('change', function () {
      $('trousDensiteField').hidden = this.value === 'MANUEL';
      $('trousPreviewHint').textContent =
        this.value === 'MANUEL' ? 'Cliquez une cellule pour basculer trou / visible.' : '';
    });

    $('trousSourceMeds').addEventListener('change', function () {
      const byIds = this.value === 'ids';
      $('trousSecteurField').hidden = byIds;
      $('trousIdsField').hidden = !byIds;
    });
  }

  function selectedColonnes() {
    return Array.from(document.querySelectorAll('input[name="trousCol"]:checked')).map(function (el) {
      return el.value;
    });
  }

  function readMaxLignes() {
    const n = Number($('trousMaxLignes').value);
    if (!Number.isFinite(n) || n < 1) throw new Error('Nombre max de lignes invalide (min. 1)');
    return Math.min(Math.floor(n), 100);
  }

  async function loadMeds(state) {
    const source = $('trousSourceMeds').value;
    if (source === 'ids') {
      const ids = Array.from(state.selectedMedIds);
      if (!ids.length) throw new Error('Cochez au moins un médicament');
      return global.JpTrous.fetchMedicaments({ matriceIds: ids });
    }
    const secteurId = $('trousSecteur').value;
    if (!secteurId) throw new Error('Choisissez un secteur');
    return global.JpTrous.fetchMedicaments({ secteurId: secteurId });
  }

  function renderPreview(state, snap) {
    const wrap = $('trousPreviewGrid');
    const cols = snap.colonnes || [];
    let html = '<table class="jp-table jp-trous-table"><thead><tr><th>Médicament</th>';
    cols.forEach(function (c) {
      html += '<th>' + global.JpUi.escapeHtml(global.JpTrous.champLibelle(c)) + '</th>';
    });
    html += '</tr></thead><tbody>';
    (snap.lignes || []).forEach(function (ligne) {
      html += '<tr><td>' + global.JpUi.escapeHtml(ligne.label || '') + '</td>';
      (ligne.cells || []).forEach(function (cell) {
        const key = ligne.matrice_id + '|' + cell.champ_code;
        const cls = cell.trou ? 'jp-trou' : '';
        const raw = global.JpTrous.cellDisplay(cell);
        const val = raw ? global.JpUi.escapeHtml(raw) : '—';
        html += '<td class="' + cls + '" data-key="' + global.JpUi.escapeHtml(key) + '" title="Cliquer pour basculer">'
          + (cell.trou ? '<em>trou</em> · ' + val : val) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
    $('trousPreviewWrap').hidden = false;

    if ($('trousModeTrous').value === 'MANUEL') {
      wrap.querySelectorAll('td[data-key]').forEach(function (td) {
        td.style.cursor = 'pointer';
        td.addEventListener('click', function () {
          const key = td.getAttribute('data-key');
          state.trousManuels[key] = !state.trousManuels[key];
          (snap.lignes || []).forEach(function (ligne) {
            (ligne.cells || []).forEach(function (cell) {
              const k = ligne.matrice_id + '|' + cell.champ_code;
              if (k === key && cell.valeur) cell.trou = !!state.trousManuels[key];
            });
          });
          state.lastSnapshot = snap;
          renderPreview(state, snap);
        });
      });
    }
  }

  async function buildCurrentSnapshot(state) {
    const meds = await loadMeds(state);
    const modeTrous = $('trousModeTrous').value;
    if (modeTrous === 'ALEATOIRE') state.trousManuels = {};
    const cols = selectedColonnes();
    if (!cols.length) throw new Error('Sélectionnez au moins une colonne');
    const maxLignes = readMaxLignes();
    const snap = global.JpTrous.buildSnapshot({
      meds: meds,
      colonnes: cols,
      modeTrous: modeTrous,
      trousManuels: state.trousManuels,
      densite: Number($('trousDensite').value) / 100,
      maxLignes: maxLignes,
    });
    if (modeTrous === 'MANUEL' && !Object.keys(state.trousManuels).length) {
      (snap.lignes || []).forEach(function (ligne) {
        (ligne.cells || []).forEach(function (cell) {
          if (cell.trou) state.trousManuels[ligne.matrice_id + '|' + cell.champ_code] = true;
        });
      });
    }
    state.lastSnapshot = snap;
    return snap;
  }

  async function submitTrous(state) {
    const maxLignes = readMaxLignes();
    await buildCurrentSnapshot(state);
    const created = await global.JpTrous.createPartie({
      titre: $('trousTitre').value,
      niveau_cible: $('trousNiveau').value,
      mode: $('trousMode').value,
      secteur_therapeutique_id: $('trousSourceMeds').value === 'secteur'
        ? ($('trousSecteur').value || null)
        : null,
      configuration_json: {
        colonnes: selectedColonnes(),
        mode_trous: $('trousModeTrous').value,
        densite: Number($('trousDensite').value) / 100,
        max_lignes: maxLignes,
      },
      snapshot_grille: state.lastSnapshot,
    });
    const box = $('resultBox');
    box.hidden = false;
    $('resultCode').textContent = created.code_unique;
    $('resultMeta').textContent =
      'Trous · ' + created.titre + ' · ' + global.JpTrous.modeLibelle(created.mode) + ' · ' + created.niveau_cible;
    $('resultPlay').href = '../trous/jouer.html?code=' + encodeURIComponent(created.code_unique);
    $('resultPrint').href = '../trous/imprimer.html?code=' + encodeURIComponent(created.code_unique);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    global.JpToast.ok('Partie créée : ' + created.code_unique);
  }

  /* —— Liste unifiée —— */
  async function refreshList() {
    const wrap = $('listWrap');
    const showArchived = $('showArchived').checked;
    try {
      const [quizzes, parties] = await Promise.all([
        global.JpQuizz.listQuiz({ actifsOnly: !showArchived }),
        global.JpTrous.listParties({ actifsOnly: !showArchived }),
      ]);
      const rows = quizzes.map(function (r) {
        return {
          kind: 'quiz',
          id: r.id,
          code: r.code_unique,
          titre: r.titre,
          mode: r.mode,
          niveau: r.niveau_cible,
          actif: r.actif,
          created_at: r.created_at,
          snapOk: Array.isArray(r.snapshot_questions) && r.snapshot_questions.length,
        };
      }).concat(parties.map(function (r) {
        return {
          kind: 'trous',
          id: r.id,
          code: r.code_unique,
          titre: r.titre,
          mode: r.mode,
          niveau: r.niveau_cible,
          actif: r.actif,
          created_at: r.created_at,
          snapOk: true,
        };
      }));
      rows.sort(function (a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });

      if (!rows.length) {
        global.JpUi.emptyState(wrap, {
          title: showArchived ? 'Aucune partie' : 'Aucune partie active',
          text: showArchived
            ? 'Créez un jeu ci-dessus.'
            : 'Cochez « Afficher les archivés » ou créez un jeu.',
        });
        return;
      }

      wrap.innerHTML = '<table class="jp-table"><thead><tr>'
        + '<th>Type</th><th>Code</th><th>Titre</th><th>Mode</th><th>Niveau</th><th></th>'
        + '</tr></thead><tbody>'
        + rows.map(function (r) {
          const typeLabel = r.kind === 'quiz' ? 'Quiz' : 'Trous';
          const playBase = r.kind === 'quiz' ? '../quiz/' : '../trous/';
          const archiveBtn = r.actif
            ? '<button type="button" class="jp-link-btn" data-archive="' + global.JpUi.escapeHtml(r.id)
              + '" data-kind="' + r.kind + '">Archiver</button>'
            : '<button type="button" class="jp-link-btn" data-desarchiver="' + global.JpUi.escapeHtml(r.id)
              + '" data-kind="' + r.kind + '">Désarchiver</button>';
          const playLinks = r.actif
            ? '<a href="' + playBase + 'jouer.html?code=' + encodeURIComponent(r.code) + '">Jouer</a>'
              + (r.snapOk
                ? ' · <a href="' + playBase + 'imprimer.html?code=' + encodeURIComponent(r.code) + '">Imprimer</a>'
                : '')
              + ' · <button type="button" class="jp-link-btn" data-scores="' + global.JpUi.escapeHtml(r.id)
              + '" data-kind="' + r.kind + '" data-code="' + global.JpUi.escapeHtml(r.code) + '">Score</button> · '
            : '<button type="button" class="jp-link-btn" data-scores="' + global.JpUi.escapeHtml(r.id)
              + '" data-kind="' + r.kind + '" data-code="' + global.JpUi.escapeHtml(r.code) + '">Score</button> · ';
          return '<tr>'
            + '<td>' + typeLabel + '</td>'
            + '<td><code>' + global.JpUi.escapeHtml(r.code) + '</code></td>'
            + '<td>' + global.JpUi.escapeHtml(r.titre)
            + (r.actif ? '' : ' <span class="jp-badge jp-badge-archive">archivé</span>') + '</td>'
            + '<td>' + global.JpUi.escapeHtml(
              r.kind === 'quiz' ? global.JpQuizz.modeLibelle(r.mode) : global.JpTrous.modeLibelle(r.mode)
            ) + '</td>'
            + '<td>' + global.JpUi.escapeHtml(r.niveau || '—') + '</td>'
            + '<td>' + playLinks + archiveBtn + '</td>'
            + '</tr>';
        }).join('')
        + '</tbody></table>';

      wrap.querySelectorAll('[data-archive]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          const kind = btn.getAttribute('data-kind');
          const label = kind === 'quiz' ? 'ce quiz' : 'cette partie';
          if (!confirm('Archiver ' + label + ' ? Elle ne sera plus jouable via son code.')) return;
          try {
            if (kind === 'quiz') await global.JpQuizz.archive(btn.getAttribute('data-archive'));
            else await global.JpTrous.archive(btn.getAttribute('data-archive'));
            global.JpToast.ok(kind === 'quiz' ? 'Quiz archivé' : 'Partie archivée');
            await refreshList();
          } catch (e) {
            global.JpToast.fromError(e);
          }
        });
      });
      wrap.querySelectorAll('[data-desarchiver]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          const kind = btn.getAttribute('data-kind');
          try {
            if (kind === 'quiz') await global.JpQuizz.desarchiver(btn.getAttribute('data-desarchiver'));
            else await global.JpTrous.desarchiver(btn.getAttribute('data-desarchiver'));
            global.JpToast.ok(kind === 'quiz' ? 'Quiz désarchivé' : 'Partie désarchivée');
            await refreshList();
          } catch (e) {
            global.JpToast.fromError(e);
          }
        });
      });
      wrap.querySelectorAll('[data-scores]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          void openScoresModal({
            kind: btn.getAttribute('data-kind'),
            id: btn.getAttribute('data-scores'),
            code: btn.getAttribute('data-code'),
          });
        });
      });
    } catch (e) {
      global.JpToast.fromError(e);
      wrap.innerHTML = '<p class="jp-muted">Impossible de charger la liste.</p>';
    }
  }

  async function openScoresModal(opts) {
    const modal = $('scoresModal');
    const body = $('scoresModalBody');
    const title = $('scoresModalTitle');
    const typeLabel = opts.kind === 'quiz' ? 'Quiz' : 'Trous';
    title.textContent = 'Scores — ' + typeLabel + ' ' + (opts.code || '');
    body.innerHTML = '<p class="jp-muted">Chargement…</p>';
    modal.hidden = false;
    try {
      const rows = opts.kind === 'quiz'
        ? await global.JpQuizz.listScores(opts.id)
        : await global.JpTrous.listScores(opts.id);
      if (!rows.length) {
        body.innerHTML = '<p class="jp-muted">Aucune réponse enregistrée pour ce jeu.</p>';
        return;
      }
      const names = await resolveDisplayNames(rows.map(function (r) { return r.utilisateur_id; }));
      body.innerHTML = '<div class="jp-table-wrap"><table class="jp-table"><thead><tr>'
        + '<th>Joueur</th><th>Mode</th><th>Score</th><th>Date</th>'
        + '</tr></thead><tbody>'
        + rows.map(function (r) {
          const name = names[r.utilisateur_id] || (r.utilisateur_id || '—').slice(0, 8);
          const modeLib = opts.kind === 'quiz'
            ? global.JpQuizz.modeLibelle(r.mode)
            : global.JpTrous.modeLibelle(r.mode);
          const score = (r.score_obtenu != null ? r.score_obtenu : '—')
            + ' / '
            + (r.score_max != null ? r.score_max : '—');
          return '<tr>'
            + '<td>' + global.JpUi.escapeHtml(name) + '</td>'
            + '<td>' + global.JpUi.escapeHtml(modeLib) + '</td>'
            + '<td>' + global.JpUi.escapeHtml(String(score)) + '</td>'
            + '<td>' + global.JpUi.escapeHtml(formatDate(r.created_at)) + '</td>'
            + '</tr>';
        }).join('')
        + '</tbody></table></div>';
    } catch (e) {
      global.JpToast.fromError(e);
      body.innerHTML = '<p class="jp-muted">Impossible de charger les scores.</p>';
    }
  }

  function closeScoresModal() {
    $('scoresModal').hidden = true;
  }

  async function boot() {
    global.JpUi.bootPage({ module: 'admin-jeux', homeHref: global.JpFab.PORTAIL_URL });

    const state = {
      lastSnapshot: null,
      trousManuels: {},
      allPublieMeds: [],
      selectedMedIds: new Set(),
    };

    setType(parseTypeFromUrl());
    document.querySelectorAll('[data-jeu-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setType(btn.getAttribute('data-jeu-type'));
      });
    });

    await Promise.all([
      fillNiveaux($('quizNiveau')),
      fillNiveaux($('trousNiveau')),
    ]);

    initQuizForm();
    initTrousForm(state);

    try {
      await fillSecteurs($('quizSecteur'));
      await fillSecteurs($('trousSecteur'));
    } catch (e) {
      global.JpToast.fromError(e);
    }

    try {
      state.allPublieMeds = await global.JpTrous.fetchMedicaments({});
      state.renderMedsList();
    } catch (e) {
      global.JpToast.fromError(e);
      $('trousMedsList').innerHTML = '<p class="jp-muted">Impossible de charger les médicaments.</p>';
    }

    $('trousBtnPreview').addEventListener('click', async function () {
      try {
        const snap = await buildCurrentSnapshot(state);
        $('trousPreviewHint').textContent =
          $('trousModeTrous').value === 'MANUEL'
            ? 'Cliquez une cellule pour basculer trou / visible.'
            : (snap.lignes.length + ' ligne(s) · trous aléatoires');
        renderPreview(state, snap);
      } catch (e) {
        global.JpToast.fromError(e);
      }
    });

    $('btnCreateJeu').addEventListener('click', async function () {
      const btn = $('btnCreateJeu');
      if (currentType() === 'quiz') {
        if (!$('quizForm').reportValidity()) return;
      } else if (!$('trousForm').reportValidity()) {
        return;
      }
      btn.disabled = true;
      try {
        if (currentType() === 'quiz') await submitQuiz();
        else await submitTrous(state);
        await refreshList();
      } catch (e) {
        global.JpToast.fromError(e);
        void global.JpLogs.error(
          currentType() === 'quiz' ? 'quiz_create_fail' : 'trous_create_fail',
          { message: e.message || String(e) }
        );
      } finally {
        btn.disabled = false;
      }
    });

    $('quizForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      $('btnCreateJeu').click();
    });
    $('trousForm').addEventListener('submit', function (ev) {
      ev.preventDefault();
      $('btnCreateJeu').click();
    });

    $('showArchived').addEventListener('change', function () {
      void refreshList();
    });

    $('scoresModalClose').addEventListener('click', closeScoresModal);
    $('scoresModal').addEventListener('click', function (ev) {
      if (ev.target === $('scoresModal')) closeScoresModal();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !$('scoresModal').hidden) closeScoresModal();
    });

    await refreshList();
  }

  global.JpAdminJeux = { boot: boot };
})(window);
