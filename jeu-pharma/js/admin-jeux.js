/**
 * Admin Création jeu — historique + quiz + tableau à trous.
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
    if (t === 'historique' || t === 'histo' || t === 'parties') return 'historique';
    if (t === 'trous' || t === 'tableau' || t === 'tableau-trous') return 'trous';
    return 'quiz';
  }

  function setType(type) {
    const tab = type === 'historique' || type === 'trous' ? type : 'quiz';
    document.querySelectorAll('[data-jeu-type]').forEach(function (btn) {
      const active = btn.getAttribute('data-jeu-type') === tab;
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
      btn.classList.toggle('is-active', active);
    });
    $('panelHistorique').hidden = tab !== 'historique';
    $('panelQuiz').hidden = tab !== 'quiz';
    $('panelTrous').hidden = tab !== 'trous';
    $('createActions').hidden = tab === 'historique';
    if (tab !== 'quiz' && tab !== 'trous') {
      $('resultBox').hidden = true;
    }
    const url = new URL(location.href);
    url.searchParams.set('type', tab);
    history.replaceState(null, '', url.pathname + url.search);
  }

  function currentType() {
    if (!$('panelHistorique').hidden) return 'historique';
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
  function createTrousState() {
    return {
      etape: 1,
      niveau: '',
      filtres: { secteurs: [], classesTher: [], classesPharma: [], texte: '' },
      parNom: false,
      /** @type {Record<string, Set<string>>} noms cochés par fiche (retouche) */
      nomsRetenus: {},
      lignesCochees: new Set(),
      lignesTirees: null,
      maxLignes: 10,
      colonnes: (global.JpTrous.COLONNES_DEFAUT || []).slice(),
      identiteVisible: global.JpTrous.IDENTITE_VISIBLE_DEFAUT || 'au_moins_un',
      trous: new Set(),
      densite: 0.4,
      previewVisible: true,
      allMeds: [],
      lastSnapshot: null,
    };
  }

  function medNoms(med) {
    return Array.isArray(med?.noms_commerciaux) ? med.noms_commerciaux.filter(function (n) { return n && n.id; }) : [];
  }

  function getNomsRetenus(t, matriceId) {
    return t.nomsRetenus[matriceId] || null;
  }

  function ensureNomsRetenus(t, med) {
    const noms = medNoms(med);
    if (!t.nomsRetenus[med.id]) {
      t.nomsRetenus[med.id] = new Set(noms.map(function (n) { return String(n.id); }));
    }
    return t.nomsRetenus[med.id];
  }

  /**
   * Lignes candidates pour une fiche (interrupteur + retouche noms).
   */
  function lignesFromMed(t, med) {
    const noms = medNoms(med);
    const retenus = getNomsRetenus(t, med.id);
    const dci = med.dci || '';

    function lineForNom(nom) {
      return {
        ligne_id: global.JpTrous.makeLigneId(med.id, nom.id),
        matrice_id: med.id,
        nom_commercial_id: nom.id,
        label: nom.valeur || dci || med.id,
        med: med,
      };
    }

    if (t.parNom) {
      if (!noms.length) {
        return [{
          ligne_id: global.JpTrous.makeLigneId(med.id, null),
          matrice_id: med.id,
          nom_commercial_id: null,
          label: global.JpMedicaments.formatNoms(med) || dci || med.id,
          med: med,
        }];
      }
      const set = retenus || new Set(noms.map(function (n) { return String(n.id); }));
      return noms.filter(function (n) { return set.has(String(n.id)); }).map(lineForNom);
    }

    // Une ligne par fiche, sauf retouche partielle → lignes par nom retenus
    if (noms.length > 1 && retenus) {
      const allIds = noms.map(function (n) { return String(n.id); });
      const allChecked = allIds.every(function (id) { return retenus.has(id); });
      const noneChecked = allIds.every(function (id) { return !retenus.has(id); });
      if (!allChecked && !noneChecked) {
        return noms.filter(function (n) { return retenus.has(String(n.id)); }).map(lineForNom);
      }
      if (noneChecked) return [];
    }

    return [{
      ligne_id: global.JpTrous.makeLigneId(med.id, null),
      matrice_id: med.id,
      nom_commercial_id: null,
      label: global.JpMedicaments.formatNoms(med) || dci || med.id,
      med: med,
    }];
  }

  function medMatchesFiltres(med, filtres) {
    if (filtres.secteurs.length) {
      if (!med.secteur_therapeutique_id || filtres.secteurs.indexOf(med.secteur_therapeutique_id) < 0) {
        return false;
      }
    }
    if (filtres.classesTher.length) {
      if (!med.classe_therapeutique_id || filtres.classesTher.indexOf(med.classe_therapeutique_id) < 0) {
        return false;
      }
    }
    if (filtres.classesPharma.length) {
      if (!med.classe_pharmacologique_id || filtres.classesPharma.indexOf(med.classe_pharmacologique_id) < 0) {
        return false;
      }
    }
    const q = (filtres.texte || '').trim().toLowerCase();
    if (q) {
      const nom = String(global.JpMedicaments.formatNoms(med) || '').toLowerCase();
      const dci = String(med.dci || '').toLowerCase();
      if (nom.indexOf(q) < 0 && dci.indexOf(q) < 0) return false;
    }
    return true;
  }

  function candidateLignes(t) {
    const out = [];
    (t.allMeds || []).forEach(function (med) {
      if (!medMatchesFiltres(med, t.filtres)) return;
      lignesFromMed(t, med).forEach(function (l) { out.push(l); });
    });
    return out;
  }

  function readMaxLignes() {
    const n = Number($('trousMaxLignes').value);
    if (!Number.isFinite(n) || n < 1) throw new Error('Nombre max de lignes invalide (min. 1)');
    return Math.min(Math.floor(n), 100);
  }

  function syncMaxLignes(t) {
    try {
      t.maxLignes = readMaxLignes();
    } catch (_) {
      t.maxLignes = 10;
    }
  }

  function selectedColonnesFromDom() {
    return Array.from(document.querySelectorAll('input[name="trousCol"]:checked')).map(function (el) {
      return el.value;
    });
  }

  function syncColonnes(t) {
    t.colonnes = selectedColonnesFromDom();
  }

  function selectedIdentiteFromDom() {
    const el = document.querySelector('input[name="trousIdentite"]:checked');
    return global.JpTrous.normaliserIdentiteVisible(el ? el.value : null);
  }

  function syncIdentite(t) {
    t.identiteVisible = selectedIdentiteFromDom();
  }

  /** Retire les trous incompatibles avec le mode d’identité. */
  function enforceIdentiteTrous(t) {
    syncIdentite(t);
    const mode = t.identiteVisible;
    const next = new Set();
    t.trous.forEach(function (k) {
      const sep = k.indexOf('|');
      if (sep < 0) return;
      const lid = k.slice(0, sep);
      const champ = k.slice(sep + 1);
      if (!global.JpTrous.peutPoserTrou({
        identite_visible: mode,
        ligne_id: lid,
        champ: champ,
        trous: next,
      })) {
        return;
      }
      next.add(k);
    });
    t.trous = next;
  }

  function assertIdentiteColonnes(t) {
    syncIdentite(t);
    syncColonnes(t);
    const mode = t.identiteVisible;
    const cols = t.colonnes || [];
    const hasNoms = cols.indexOf('nom_commercial') >= 0;
    const hasDci = cols.indexOf('dci') >= 0;
    if (mode === 'dci' && !hasDci) {
      throw new Error('Ajoutez la colonne DCI (identité toujours visible)');
    }
    if (mode === 'noms' && !hasNoms) {
      throw new Error('Ajoutez la colonne Noms commerciaux (identité toujours visible)');
    }
    if (mode === 'les_deux' && (!hasNoms || !hasDci)) {
      throw new Error('Ajoutez les colonnes Noms commerciaux et DCI (identité toujours visible)');
    }
    if (mode === 'au_moins_un' && !hasNoms && !hasDci) {
      throw new Error('Ajoutez au moins Noms commerciaux ou DCI pour l’identité des lignes');
    }
  }

  function lignesCocheesList(t) {
    return candidateLignes(t).filter(function (l) { return t.lignesCochees.has(l.ligne_id); });
  }

  /** Lignes réellement affichées dans la grille (après plafond / tirage figé). */
  function lignesPourGrille(t) {
    const cochees = lignesCocheesList(t);
    syncMaxLignes(t);
    if (cochees.length <= t.maxLignes) {
      return { lignes: cochees, needDraw: false, overMax: false };
    }
    if (t.lignesTirees && t.lignesTirees.length) {
      const set = new Set(t.lignesTirees);
      const frozen = cochees.filter(function (l) { return set.has(l.ligne_id); });
      if (frozen.length) {
        return { lignes: frozen, needDraw: false, overMax: true };
      }
    }
    return { lignes: [], needDraw: true, overMax: true };
  }

  function pruneTrous(t) {
    const { lignes } = lignesPourGrille(t);
    const cols = t.colonnes || [];
    const valid = new Set();
    lignes.forEach(function (l) {
      cols.forEach(function (champ) {
        const cv = global.JpTrous.cellValeurFromMed(l.med, champ, l.nom_commercial_id);
        if (cv.valeur) valid.add(l.ligne_id + '|' + champ);
      });
    });
    const next = new Set();
    t.trous.forEach(function (k) {
      if (valid.has(k)) next.add(k);
    });
    t.trous = next;
    enforceIdentiteTrous(t);
  }

  function countFillable(t) {
    const { lignes } = lignesPourGrille(t);
    const cols = t.colonnes || [];
    let n = 0;
    lignes.forEach(function (l) {
      cols.forEach(function (champ) {
        const cv = global.JpTrous.cellValeurFromMed(l.med, champ, l.nom_commercial_id);
        if (cv.valeur) n += 1;
      });
    });
    return n;
  }

  function buildSnapshotFromState(t) {
    syncColonnes(t);
    syncIdentite(t);
    syncMaxLignes(t);
    const pack = lignesPourGrille(t);
    if (pack.needDraw) {
      throw new Error('Trop de lignes cochées : tirez les lignes au hasard (plafond ' + t.maxLignes + ')');
    }
    if (!pack.lignes.length) throw new Error('Cochez au moins une ligne');
    if (!t.colonnes.length) throw new Error('Sélectionnez au moins une colonne');
    assertIdentiteColonnes(t);
    pruneTrous(t);
    const snap = global.JpTrous.buildSnapshot({
      lignes: pack.lignes,
      colonnes: t.colonnes,
      trous: t.trous,
      identite_visible: t.identiteVisible,
    });
    t.lastSnapshot = snap;
    return snap;
  }

  function syncPreviewToggleUi(t) {
    const body = $('trousPreviewBody');
    const btn = $('trousBtnTogglePreview');
    if (!body || !btn) return;
    const visible = t.previewVisible !== false;
    body.hidden = !visible;
    btn.setAttribute('aria-expanded', visible ? 'true' : 'false');
    btn.textContent = visible ? 'Masquer l’aperçu' : 'Afficher l’aperçu';
  }

  function renderGrille(t) {
    const wrap = $('trousPreviewGrid');
    const hint = $('trousPreviewHint');
    const countEl = $('trousTrousCount');
    syncColonnes(t);
    syncIdentite(t);
    syncMaxLignes(t);
    pruneTrous(t);
    syncPreviewToggleUi(t);

    const pack = lignesPourGrille(t);
    const cols = t.colonnes || [];
    const fillable = countFillable(t);
    const nTrous = t.trous.size;
    if (countEl) countEl.textContent = nTrous + ' trou' + (nTrous > 1 ? 's' : '') + ' sur ' + fillable + ' case' + (fillable > 1 ? 's' : '');

    if (!cols.length) {
      hint.textContent = 'Choisissez au moins une colonne (étape 2).';
      wrap.innerHTML = '';
      updateRecap(t);
      return;
    }
    if (!pack.lignes.length) {
      hint.textContent = pack.needDraw
        ? 'Plus de ' + t.maxLignes + ' lignes cochées — cliquez « Tirer les lignes au hasard ».'
        : 'Cochez des lignes (étape 1) pour remplir l’aperçu.';
      wrap.innerHTML = '';
      updateRecap(t);
      return;
    }

    const nCochees = lignesCocheesList(t).length;
    hint.textContent = pack.overMax
      ? pack.lignes.length + ' ligne(s) tirée(s) / ' + nCochees + ' cochée(s) · clic case = trou'
      : pack.lignes.length + ' ligne(s) · clic case = trou';

    let html = '<table class="jp-table jp-trous-table jp-trous-preview-table"><thead><tr>';
    cols.forEach(function (c) {
      html += '<th>' + global.JpUi.escapeHtml(global.JpTrous.champLibelle(c)) + '</th>';
    });
    html += '</tr></thead><tbody>';

    pack.lignes.forEach(function (ligne) {
      html += '<tr>';
      cols.forEach(function (champ) {
        const cv = global.JpTrous.cellValeurFromMed(ligne.med, champ, ligne.nom_commercial_id);
        const key = ligne.ligne_id + '|' + champ;
        const hasVal = !!cv.valeur;
        const isTrou = hasVal && t.trous.has(key);
        const raw = hasVal
          ? (Array.isArray(cv.valeurs) && cv.valeurs.length ? cv.valeurs.join('; ') : cv.valeur)
          : '';
        const val = raw ? global.JpUi.escapeHtml(raw) : '—';
        const locked = hasVal && !isTrou && !global.JpTrous.peutPoserTrou({
          identite_visible: t.identiteVisible,
          ligne_id: ligne.ligne_id,
          champ: champ,
          trous: t.trous,
        });
        let cls = 'jp-trous-cell';
        if (!hasVal) cls += ' jp-trous-cell-empty';
        else if (isTrou) cls += ' jp-trou jp-trous-cell-clickable';
        else if (locked) cls += ' jp-trous-cell-locked';
        else cls += ' jp-trous-cell-clickable';
        html += '<td class="' + cls + '"'
          + (hasVal ? ' data-key="' + global.JpUi.escapeHtml(key) + '"'
            + ' title="' + (locked ? 'Identité toujours visible' : 'Cliquer pour basculer') + '"'
            : '')
          + '>' + (isTrou ? '<em>trou</em> · ' + val : val) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;

    wrap.querySelectorAll('td[data-key]').forEach(function (td) {
      td.addEventListener('click', function () {
        const key = td.getAttribute('data-key');
        if (!key) return;
        if (t.trous.has(key)) {
          t.trous.delete(key);
        } else {
          const sep = key.indexOf('|');
          const lid = key.slice(0, sep);
          const champ = key.slice(sep + 1);
          if (!global.JpTrous.peutPoserTrou({
            identite_visible: t.identiteVisible,
            ligne_id: lid,
            champ: champ,
            trous: t.trous,
          })) {
            global.JpToast.warn('Case bloquée : ' + global.JpTrous.identiteVisibleLibelle(t.identiteVisible));
            return;
          }
          t.trous.add(key);
        }
        renderGrille(t);
      });
    });

    try {
      t.lastSnapshot = buildSnapshotFromState(t);
    } catch (_) {
      t.lastSnapshot = null;
    }
    updateRecap(t);
  }

  function updateRecap(t) {
    const el = $('trousRecap');
    if (!el) return;
    syncIdentite(t);
    const pack = lignesPourGrille(t);
    const niv = $('trousNiveau').value || '—';
    const cols = (t.colonnes || []).map(function (c) { return global.JpTrous.champLibelle(c); }).join(', ') || '—';
    const idLib = global.JpTrous.identiteVisibleLibelle(t.identiteVisible);
    el.innerHTML = '<p><strong>Récapitulatif</strong></p>'
      + '<ul class="jp-trous-recap-list">'
      + '<li>Niveau : ' + global.JpUi.escapeHtml(niv) + '</li>'
      + '<li>Lignes : ' + pack.lignes.length + (pack.needDraw ? ' (tirage requis)' : '') + '</li>'
      + '<li>Colonnes : ' + global.JpUi.escapeHtml(cols) + '</li>'
      + '<li>Identité : ' + global.JpUi.escapeHtml(idLib) + '</li>'
      + '<li>Trous : ' + t.trous.size + '</li>'
      + '</ul>';
  }

  function updateMedsCount(t) {
    const n = lignesCocheesList(t).length;
    $('trousMedsCount').textContent = n ? n + ' ligne' + (n > 1 ? 's' : '') + ' sélectionnée' + (n > 1 ? 's' : '') : '';
  }

  function invalidateLignesTirees(t) {
    if (!t.lignesTirees) return;
    const cochees = new Set(lignesCocheesList(t).map(function (l) { return l.ligne_id; }));
    t.lignesTirees = t.lignesTirees.filter(function (id) { return cochees.has(id); });
    if (!t.lignesTirees.length) t.lignesTirees = null;
  }

  function renderMedsList(t) {
    const wrap = $('trousMedsList');
    const meds = (t.allMeds || []).filter(function (m) { return medMatchesFiltres(m, t.filtres); });
    if (!meds.length) {
      wrap.innerHTML = '<p class="jp-muted">Aucune fiche publiée correspondante.</p>';
      updateMedsCount(t);
      return;
    }

    wrap.innerHTML = meds.map(function (med) {
      const noms = medNoms(med);
      const ficheLabel = (global.JpMedicaments.formatNoms(med) || med.dci || med.id)
        + (med.dci && global.JpMedicaments.formatNoms(med) ? ' · ' + med.dci : '');
      const lines = lignesFromMed(t, med);
      const allLineIds = lines.map(function (l) { return l.ligne_id; });
      const allChecked = allLineIds.length && allLineIds.every(function (id) { return t.lignesCochees.has(id); });
      const someChecked = allLineIds.some(function (id) { return t.lignesCochees.has(id); });

      let html = '<div class="jp-trous-admin-fiche" data-matrice="' + global.JpUi.escapeHtml(med.id) + '">';
      html += '<label class="jp-trous-admin-med">'
        + '<input type="checkbox" name="trousFiche" value="' + global.JpUi.escapeHtml(med.id) + '"'
        + (allChecked ? ' checked' : '')
        + (someChecked && !allChecked ? ' data-indeterminate="1"' : '')
        + '>'
        + '<span>' + global.JpUi.escapeHtml(ficheLabel) + '</span></label>';

      if (noms.length > 1 || t.parNom) {
        const retenus = ensureNomsRetenus(t, med);
        html += '<div class="jp-trous-admin-noms">';
        noms.forEach(function (nom) {
          const lid = global.JpTrous.makeLigneId(med.id, nom.id);
          const nomOn = retenus.has(String(nom.id));
          const lineOn = t.parNom ? t.lignesCochees.has(lid) : nomOn;
          html += '<label class="jp-trous-admin-nom">'
            + '<input type="checkbox" name="trousNom" data-matrice="' + global.JpUi.escapeHtml(med.id) + '"'
            + ' data-nom="' + global.JpUi.escapeHtml(nom.id) + '"'
            + ' value="' + global.JpUi.escapeHtml(lid) + '"'
            + (lineOn ? ' checked' : '') + '>'
            + '<span>' + global.JpUi.escapeHtml(nom.valeur || '') + '</span></label>';
        });
        html += '</div>';
      }
      html += '</div>';
      return html;
    }).join('');

    wrap.querySelectorAll('input[data-indeterminate="1"]').forEach(function (el) {
      el.indeterminate = true;
    });

    wrap.querySelectorAll('input[name="trousFiche"]').forEach(function (el) {
      el.addEventListener('change', function () {
        const med = t.allMeds.find(function (m) { return m.id === el.value; });
        if (!med) return;
        if (el.checked) {
          if (t.parNom || medNoms(med).length > 1) ensureNomsRetenus(t, med);
          lignesFromMed(t, med).forEach(function (l) { t.lignesCochees.add(l.ligne_id); });
        } else {
          // retirer toutes les lignes possibles de cette fiche
          const noms = medNoms(med);
          t.lignesCochees.delete(global.JpTrous.makeLigneId(med.id, null));
          noms.forEach(function (n) {
            t.lignesCochees.delete(global.JpTrous.makeLigneId(med.id, n.id));
          });
        }
        invalidateLignesTirees(t);
        renderMedsList(t);
        renderGrille(t);
      });
    });

    wrap.querySelectorAll('input[name="trousNom"]').forEach(function (el) {
      el.addEventListener('change', function () {
        const matriceId = el.getAttribute('data-matrice');
        const nomId = el.getAttribute('data-nom');
        const med = t.allMeds.find(function (m) { return m.id === matriceId; });
        if (!med || !nomId) return;
        const retenus = ensureNomsRetenus(t, med);
        const noms = medNoms(med);
        const wasSelected = t.lignesCochees.has(global.JpTrous.makeLigneId(matriceId, null))
          || noms.some(function (n) {
            return t.lignesCochees.has(global.JpTrous.makeLigneId(matriceId, n.id));
          });

        if (el.checked) retenus.add(String(nomId));
        else retenus.delete(String(nomId));

        t.lignesCochees.delete(global.JpTrous.makeLigneId(matriceId, null));
        noms.forEach(function (n) {
          t.lignesCochees.delete(global.JpTrous.makeLigneId(matriceId, n.id));
        });

        if (t.parNom || wasSelected) {
          lignesFromMed(t, med).forEach(function (l) { t.lignesCochees.add(l.ligne_id); });
        }

        invalidateLignesTirees(t);
        renderMedsList(t);
        renderGrille(t);
      });
    });

    updateMedsCount(t);
  }

  function setTrousEtape(t, n) {
    const step = Number(n) || 1;
    t.etape = step;
    document.querySelectorAll('[data-trous-etape]').forEach(function (btn) {
      const active = Number(btn.getAttribute('data-trous-etape')) === step;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-trous-panel]').forEach(function (panel) {
      panel.hidden = Number(panel.getAttribute('data-trous-panel')) !== step;
    });
    if (step === 4) updateRecap(t);
  }

  function fillFiltreCheckboxes(containerId, items, name, selectedIds) {
    const wrap = $(containerId);
    if (!wrap) return;
    if (!items.length) {
      wrap.innerHTML = '<p class="jp-muted">Aucune valeur.</p>';
      return;
    }
    wrap.innerHTML = items.map(function (it) {
      return '<label class="jp-trous-filtre-item">'
        + '<input type="checkbox" name="' + name + '" value="' + global.JpUi.escapeHtml(it.id) + '"'
        + (selectedIds.indexOf(it.id) >= 0 ? ' checked' : '') + '>'
        + '<span>' + global.JpUi.escapeHtml(it.valeur) + '</span></label>';
    }).join('');
  }

  function readFiltreIds(name) {
    return Array.from(document.querySelectorAll('input[name="' + name + '"]:checked')).map(function (el) {
      return el.value;
    });
  }

  function syncFiltresFromDom(t) {
    t.filtres.secteurs = readFiltreIds('trousFiltreSecteur');
    t.filtres.classesTher = readFiltreIds('trousFiltreClasseTher');
    t.filtres.classesPharma = readFiltreIds('trousFiltreClassePharma');
    t.filtres.texte = ($('trousFiltreTexte').value || '');
  }

  function onFiltresChange(t) {
    syncFiltresFromDom(t);
    invalidateLignesTirees(t);
    renderMedsList(t);
    renderGrille(t);
  }

  function tirerLignes(t) {
    syncMaxLignes(t);
    const cochees = lignesCocheesList(t);
    if (!cochees.length) {
      global.JpToast.warn('Cochez au moins une ligne');
      return;
    }
    if (cochees.length <= t.maxLignes) {
      t.lignesTirees = null;
      global.JpToast.ok(cochees.length + ' ligne(s) — toutes retenues (sous le plafond)');
    } else {
      const picked = global.JpTrous.shuffle(cochees).slice(0, t.maxLignes);
      t.lignesTirees = picked.map(function (l) { return l.ligne_id; });
      global.JpToast.ok(t.maxLignes + ' ligne(s) tirée(s) parmi ' + cochees.length);
    }
    renderGrille(t);
  }

  function tirerTrous(t) {
    const densite = Number($('trousDensite').value) / 100;
    t.densite = densite;
    syncIdentite(t);
    const pack = lignesPourGrille(t);
    if (pack.needDraw || !pack.lignes.length) {
      global.JpToast.warn('Aucune ligne dans la grille');
      return;
    }
    if (!(t.colonnes || []).length) {
      global.JpToast.warn('Choisissez des colonnes');
      return;
    }
    const next = new Set();
    let fillable = 0;
    pack.lignes.forEach(function (l) {
      (t.colonnes || []).forEach(function (champ) {
        const cv = global.JpTrous.cellValeurFromMed(l.med, champ, l.nom_commercial_id);
        if (!cv.valeur) return;
        fillable += 1;
        if (Math.random() >= densite) return;
        if (!global.JpTrous.peutPoserTrou({
          identite_visible: t.identiteVisible,
          ligne_id: l.ligne_id,
          champ: champ,
          trous: next,
        })) return;
        next.add(l.ligne_id + '|' + champ);
      });
    });
    if (fillable && !next.size) {
      // au moins un trou (respect identité)
      const keys = [];
      pack.lignes.forEach(function (l) {
        (t.colonnes || []).forEach(function (champ) {
          const cv = global.JpTrous.cellValeurFromMed(l.med, champ, l.nom_commercial_id);
          if (!cv.valeur) return;
          if (!global.JpTrous.peutPoserTrou({
            identite_visible: t.identiteVisible,
            ligne_id: l.ligne_id,
            champ: champ,
            trous: next,
          })) return;
          keys.push(l.ligne_id + '|' + champ);
        });
      });
      if (keys.length) next.add(keys[Math.floor(Math.random() * keys.length)]);
    }
    t.trous = next;
    renderGrille(t);
  }

  function effacerTrous(t) {
    t.trous = new Set();
    renderGrille(t);
  }

  async function refreshTrousMeds(t) {
    const niveau = $('trousNiveau').value || null;
    t.niveau = niveau;
    syncFiltresFromDom(t);
    // Toutes les fiches du niveau ; filtres multi appliqués côté client (OR intra / AND inter).
    t.allMeds = await global.JpTrous.fetchMedicaments({ niveau: niveau });
    const allowedMeds = new Set(t.allMeds.map(function (m) { return m.id; }));
    const nextCochees = new Set();
    t.lignesCochees.forEach(function (lid) {
      const parsed = global.JpTrous.parseLigneId(lid);
      if (allowedMeds.has(parsed.matriceId)) nextCochees.add(lid);
    });
    t.lignesCochees = nextCochees;
    Object.keys(t.nomsRetenus).forEach(function (mid) {
      if (!allowedMeds.has(mid)) delete t.nomsRetenus[mid];
    });
    invalidateLignesTirees(t);
    renderMedsList(t);
    renderGrille(t);
  }

  function initTrousForm(state) {
    const t = state.trous;
    const colonnesList = $('trousColonnesList');
    const defaults = global.JpTrous.COLONNES_DEFAUT;
    (global.JpConstants.CHAMP_CODES || []).forEach(function (c) {
      const label = document.createElement('label');
      label.className = 'jp-quiz-admin-champ';
      label.innerHTML = '<input type="checkbox" name="trousCol" value="' + global.JpUi.escapeHtml(c.code) + '"'
        + (defaults.indexOf(c.code) >= 0 ? ' checked' : '') + '> '
        + '<span>' + global.JpUi.escapeHtml(c.libelle) + '</span>';
      colonnesList.appendChild(label);
    });
    t.colonnes = defaults.slice();

    function onColsChange() {
      syncColonnes(t);
      pruneTrous(t);
      renderGrille(t);
    }
    function onIdentiteChange() {
      syncIdentite(t);
      enforceIdentiteTrous(t);
      renderGrille(t);
    }
    $('trousBtnColsAll').addEventListener('click', function () {
      colonnesList.querySelectorAll('input[name="trousCol"]').forEach(function (el) { el.checked = true; });
      onColsChange();
    });
    $('trousBtnColsNone').addEventListener('click', function () {
      colonnesList.querySelectorAll('input[name="trousCol"]').forEach(function (el) { el.checked = false; });
      onColsChange();
    });
    colonnesList.addEventListener('change', onColsChange);
    document.querySelectorAll('input[name="trousIdentite"]').forEach(function (el) {
      el.addEventListener('change', onIdentiteChange);
    });
    syncIdentite(t);

    const btnPreview = $('trousBtnTogglePreview');
    if (btnPreview) {
      btnPreview.addEventListener('click', function () {
        t.previewVisible = t.previewVisible === false;
        syncPreviewToggleUi(t);
      });
    }
    syncPreviewToggleUi(t);

    document.querySelectorAll('[data-trous-etape]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setTrousEtape(t, btn.getAttribute('data-trous-etape'));
      });
    });
    setTrousEtape(t, 1);

    $('trousDensite').addEventListener('input', function () {
      $('trousDensiteLabel').textContent = this.value + ' %';
      t.densite = Number(this.value) / 100;
    });

    $('trousParNom').addEventListener('change', function () {
      t.parNom = !!this.checked;
      // reconstruire les coches : fiches déjà sélectionnées → nouvelles lignes
      const prevMedIds = new Set();
      t.lignesCochees.forEach(function (lid) {
        prevMedIds.add(global.JpTrous.parseLigneId(lid).matriceId);
      });
      t.lignesCochees = new Set();
      t.allMeds.forEach(function (med) {
        if (!prevMedIds.has(med.id)) return;
        if (t.parNom) ensureNomsRetenus(t, med);
        lignesFromMed(t, med).forEach(function (l) { t.lignesCochees.add(l.ligne_id); });
      });
      t.lignesTirees = null;
      renderMedsList(t);
      renderGrille(t);
    });

    $('trousFiltreTexte').addEventListener('input', function () { onFiltresChange(t); });
    $('trousFiltreSecteurs').addEventListener('change', function () { onFiltresChange(t); });
    $('trousFiltreClassesTher').addEventListener('change', function () { onFiltresChange(t); });
    $('trousFiltreClassesPharma').addEventListener('change', function () { onFiltresChange(t); });

    $('trousBtnMedsAllVisible').addEventListener('click', function () {
      const meds = (t.allMeds || []).filter(function (m) { return medMatchesFiltres(m, t.filtres); });
      meds.forEach(function (med) {
        if (t.parNom || medNoms(med).length > 1) ensureNomsRetenus(t, med);
        lignesFromMed(t, med).forEach(function (l) { t.lignesCochees.add(l.ligne_id); });
      });
      invalidateLignesTirees(t);
      renderMedsList(t);
      renderGrille(t);
    });
    $('trousBtnMedsNone').addEventListener('click', function () {
      t.lignesCochees.clear();
      t.lignesTirees = null;
      renderMedsList(t);
      renderGrille(t);
    });

    $('trousMaxLignes').addEventListener('change', function () {
      syncMaxLignes(t);
      const cochees = lignesCocheesList(t);
      if (cochees.length <= t.maxLignes) t.lignesTirees = null;
      else if (t.lignesTirees && t.lignesTirees.length > t.maxLignes) {
        t.lignesTirees = t.lignesTirees.slice(0, t.maxLignes);
      }
      renderGrille(t);
    });

    $('trousBtnTirerLignes').addEventListener('click', function () { tirerLignes(t); });
    $('trousBtnTirerTrous').addEventListener('click', function () { tirerTrous(t); });
    $('trousBtnEffacerTrous').addEventListener('click', function () { effacerTrous(t); });

    $('trousNiveau').addEventListener('change', async function () {
      try {
        await refreshTrousMeds(t);
      } catch (e) {
        global.JpToast.fromError(e);
      }
    });

    $('trousMode').addEventListener('change', function () { updateRecap(t); });
  }

  async function submitTrous(state) {
    const t = state.trous;
    syncColonnes(t);
    syncMaxLignes(t);
    syncFiltresFromDom(t);
    const snap = buildSnapshotFromState(t);
    const created = await global.JpTrous.createPartie({
      titre: $('trousTitre').value,
      niveau_cible: $('trousNiveau').value,
      mode: $('trousMode').value,
      secteur_therapeutique_id: t.filtres.secteurs.length === 1 ? t.filtres.secteurs[0] : null,
      configuration_json: {
        colonnes: t.colonnes,
        densite: t.densite,
        max_lignes: t.maxLignes,
        par_nom: t.parNom,
        identite_visible: t.identiteVisible,
        filtres: {
          secteurs: t.filtres.secteurs.slice(),
          classes_ther: t.filtres.classesTher.slice(),
          classes_pharma: t.filtres.classesPharma.slice(),
          texte: t.filtres.texte || '',
        },
      },
      snapshot_grille: snap,
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

  /* —— Historique —— */
  function statusOf(row) {
    if (!row.actif) return 'archives';
    if (row.nbScores > 0) return 'termines';
    return 'en_cours';
  }

  function statusLibelle(status) {
    if (status === 'archives') return 'Archivé';
    if (status === 'termines') return 'Terminé';
    return 'En cours';
  }

  function statusBadgeClass(status) {
    if (status === 'archives') return 'jp-badge jp-badge-archive';
    if (status === 'termines') return 'jp-badge jp-jeux-badge-termine';
    return 'jp-badge jp-jeux-badge-encours';
  }

  async function loadResponseCounts() {
    const sb = global.JpApp.sbJeu();
    const [quizRes, trousRes] = await Promise.all([
      sb.from('quizz_reponses_utilisateur').select('quizz_id'),
      sb.from('parties_reponses_utilisateur').select('partie_id'),
    ]);
    if (quizRes.error) throw quizRes.error;
    if (trousRes.error) throw trousRes.error;
    const quizCounts = {};
    const trousCounts = {};
    (quizRes.data || []).forEach(function (r) {
      if (!r.quizz_id) return;
      quizCounts[r.quizz_id] = (quizCounts[r.quizz_id] || 0) + 1;
    });
    (trousRes.data || []).forEach(function (r) {
      if (!r.partie_id) return;
      trousCounts[r.partie_id] = (trousCounts[r.partie_id] || 0) + 1;
    });
    return { quizCounts: quizCounts, trousCounts: trousCounts };
  }

  function bindListActions(wrap, state) {
    wrap.querySelectorAll('[data-archive]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        const kind = btn.getAttribute('data-kind');
        const label = kind === 'quiz' ? 'ce quiz' : 'cette partie';
        if (!confirm('Archiver ' + label + ' ? Elle ne sera plus jouable via son code.')) return;
        try {
          if (kind === 'quiz') await global.JpQuizz.archive(btn.getAttribute('data-archive'));
          else await global.JpTrous.archive(btn.getAttribute('data-archive'));
          global.JpToast.ok(kind === 'quiz' ? 'Quiz archivé' : 'Partie archivée');
          await refreshList(state);
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
          await refreshList(state);
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
  }

  function renderRowsTable(rows) {
    return '<table class="jp-table"><thead><tr>'
      + '<th>Statut</th><th>Type</th><th>Code</th><th>Titre</th><th>Mode</th><th>Niveau</th><th>Créé</th><th>Réponses</th><th></th>'
      + '</tr></thead><tbody>'
      + rows.map(function (r) {
        const status = statusOf(r);
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
            + ' · '
          : '';
        const scoreBtn = '<button type="button" class="jp-link-btn" data-scores="' + global.JpUi.escapeHtml(r.id)
          + '" data-kind="' + r.kind + '" data-code="' + global.JpUi.escapeHtml(r.code) + '">Score</button>';
        return '<tr>'
          + '<td><span class="' + statusBadgeClass(status) + '">' + statusLibelle(status) + '</span></td>'
          + '<td>' + typeLabel + '</td>'
          + '<td><code>' + global.JpUi.escapeHtml(r.code) + '</code></td>'
          + '<td>' + global.JpUi.escapeHtml(r.titre) + '</td>'
          + '<td>' + global.JpUi.escapeHtml(
            r.kind === 'quiz' ? global.JpQuizz.modeLibelle(r.mode) : global.JpTrous.modeLibelle(r.mode)
          ) + '</td>'
          + '<td>' + global.JpUi.escapeHtml(r.niveau || '—') + '</td>'
          + '<td>' + global.JpUi.escapeHtml(formatDate(r.created_at)) + '</td>'
          + '<td>' + (r.nbScores || 0) + '</td>'
          + '<td class="jp-jeux-histo-actions">' + playLinks + scoreBtn + ' · ' + archiveBtn + '</td>'
          + '</tr>';
      }).join('')
      + '</tbody></table>';
  }

  async function refreshList(state) {
    const wrap = $('listWrap');
    if (!wrap) return;
    const filter = state.histoFilter || 'tous';
    const kindFilter = state.histoKind || 'tous';
    try {
      const [quizzes, parties, counts] = await Promise.all([
        global.JpQuizz.listQuiz({ actifsOnly: false }),
        global.JpTrous.listParties({ actifsOnly: false }),
        loadResponseCounts(),
      ]);
      let rows = quizzes.map(function (r) {
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
          nbScores: counts.quizCounts[r.id] || 0,
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
          nbScores: counts.trousCounts[r.id] || 0,
        };
      }));
      rows.sort(function (a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });

      if (kindFilter !== 'tous') {
        rows = rows.filter(function (r) { return r.kind === kindFilter; });
      }
      if (filter !== 'tous') {
        rows = rows.filter(function (r) { return statusOf(r) === filter; });
      }

      if (!rows.length) {
        const emptyText = filter === 'tous' && kindFilter === 'tous'
          ? 'Créez un quiz ou un tableau à trous.'
          : 'Aucune partie pour ce filtre.';
        global.JpUi.emptyState(wrap, {
          title: 'Aucune partie',
          text: emptyText,
        });
        return;
      }

      if (filter === 'tous') {
        const sections = [
          { key: 'en_cours', title: 'En cours' },
          { key: 'termines', title: 'Terminés' },
          { key: 'archives', title: 'Archivés' },
        ];
        let html = '';
        sections.forEach(function (sec) {
          const secRows = rows.filter(function (r) { return statusOf(r) === sec.key; });
          if (!secRows.length) return;
          html += '<section class="jp-jeux-histo-section" aria-label="' + sec.title + '">'
            + '<h3 class="jp-jeux-histo-section-title">' + sec.title
            + ' <span class="jp-muted">(' + secRows.length + ')</span></h3>'
            + renderRowsTable(secRows)
            + '</section>';
        });
        wrap.innerHTML = html || '<p class="jp-muted">Aucune partie.</p>';
      } else {
        wrap.innerHTML = renderRowsTable(rows);
      }

      bindListActions(wrap, state);
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
      trous: createTrousState(),
      histoFilter: 'tous',
      histoKind: 'tous',
    };

    setType(parseTypeFromUrl());
    document.querySelectorAll('[data-jeu-type]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const tab = btn.getAttribute('data-jeu-type');
        setType(tab);
        if (tab === 'historique') void refreshList(state);
      });
    });

    document.querySelectorAll('[data-histo-filter]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.histoFilter = btn.getAttribute('data-histo-filter') || 'tous';
        document.querySelectorAll('[data-histo-filter]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        void refreshList(state);
      });
    });
    document.querySelectorAll('[data-histo-kind]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.histoKind = btn.getAttribute('data-histo-kind') || 'tous';
        document.querySelectorAll('[data-histo-kind]').forEach(function (b) {
          b.classList.toggle('is-active', b === btn);
        });
        void refreshList(state);
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
    } catch (e) {
      global.JpToast.fromError(e);
    }

    try {
      const [secteurs, classesTher, classesPharma] = await Promise.all([
        global.JpTrous.listSecteurs(),
        global.JpEntites.list('classes_therapeutiques', { actif: true }),
        global.JpEntites.list('classes_pharmacologiques', { actif: true }),
      ]);
      fillFiltreCheckboxes('trousFiltreSecteurs', secteurs, 'trousFiltreSecteur', []);
      fillFiltreCheckboxes('trousFiltreClassesTher', classesTher, 'trousFiltreClasseTher', []);
      fillFiltreCheckboxes('trousFiltreClassesPharma', classesPharma, 'trousFiltreClassePharma', []);
    } catch (e) {
      global.JpToast.fromError(e);
    }

    try {
      await refreshTrousMeds(state.trous);
    } catch (e) {
      global.JpToast.fromError(e);
      $('trousMedsList').innerHTML = '<p class="jp-muted">Impossible de charger les médicaments.</p>';
    }

    $('btnCreateJeu').addEventListener('click', async function () {
      const btn = $('btnCreateJeu');
      const tab = currentType();
      if (tab === 'historique') return;
      if (tab === 'quiz') {
        if (!$('quizForm').reportValidity()) return;
      } else {
        setTrousEtape(state.trous, 4);
        if (!$('trousForm').reportValidity()) return;
      }
      btn.disabled = true;
      try {
        if (tab === 'quiz') await submitQuiz();
        else await submitTrous(state);
      } catch (e) {
        global.JpToast.fromError(e);
        void global.JpLogs.error(
          tab === 'quiz' ? 'quiz_create_fail' : 'trous_create_fail',
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

    $('scoresModalClose').addEventListener('click', closeScoresModal);
    $('scoresModal').addEventListener('click', function (ev) {
      if (ev.target === $('scoresModal')) closeScoresModal();
    });
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !$('scoresModal').hidden) closeScoresModal();
    });

    if (currentType() === 'historique') await refreshList(state);
  }

  global.JpAdminJeux = { boot: boot };
})(window);
