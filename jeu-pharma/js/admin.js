/**
 * Admin V2 — sources, référentiel, parcours, publications, jeux.
 */
(function (global) {
  function sb() {
    return global.JpApp.sbJeu();
  }

  function $(id) {
    return document.getElementById(id);
  }

  async function listSources() {
    const { data, error } = await sb()
      .from('sources_contenu')
      .select('id, code, libelle, type_source, description, actif, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  }

  async function createSource(input) {
    const user = await global.JpApp.getUser();
    const { data, error } = await sb()
      .from('sources_contenu')
      .insert({
        code: String(input.code || '').trim(),
        libelle: String(input.libelle || '').trim(),
        type_source: input.type_source || 'cours',
        description: input.description || '',
        created_by: user?.id || null,
      })
      .select('*')
      .single();
    if (error) throw error;
    void global.JpLogs?.action?.('v2_source_create', { code: data.code });
    return data;
  }

  async function listConnaissances(opts = {}) {
    let q = sb()
      .from('connaissances')
      .select('id, matrice_id, champ_code, entite_id, texte, statut, ordre, created_at')
      .order('updated_at', { ascending: false })
      .limit(opts.limit || 100);
    if (opts.statut) q = q.eq('statut', opts.statut);
    if (opts.matriceId) q = q.eq('matrice_id', opts.matriceId);
    if (opts.champ) q = q.eq('champ_code', opts.champ);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function setConnaissanceStatut(id, statut) {
    const user = await global.JpApp.getUser();
    const patch = { statut, updated_at: new Date().toISOString() };
    if (statut === 'valide') {
      patch.validated_by = user?.id || null;
      patch.validated_at = new Date().toISOString();
    }
    const { data, error } = await sb()
      .from('connaissances')
      .update(patch)
      .eq('id', id)
      .select('id, statut')
      .single();
    if (error) throw error;
    void global.JpLogs?.action?.('v2_connaissance_statut', { id, statut });
    return data;
  }

  async function listParcoursAdmin() {
    const { data, error } = await sb()
      .from('parcours_apprentissage')
      .select('id, code, libelle, description, niveau_lie, mode_contenu, actif, ordre')
      .order('ordre');
    if (error) throw error;
    return data || [];
  }

  async function listModules(parcoursId) {
    let q = sb()
      .from('modules_cours')
      .select('id, parcours_id, code, titre, resume, objectifs, ordre, publie, version_publication, prerequis_module_id, parent_id, est_groupe')
      .order('ordre');
    if (parcoursId) q = q.eq('parcours_id', parcoursId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function countPublications(moduleId) {
    const { count, error } = await sb()
      .from('publications_connaissances')
      .select('id', { count: 'exact', head: true })
      .eq('module_id', moduleId)
      .eq('actif', true);
    if (error) throw error;
    return count || 0;
  }

  async function publierParSecteur(moduleId, secteurNorm) {
    const { data, error } = await sb().rpc('v2_publier_module_par_secteur', {
      p_module_id: moduleId,
      p_secteur_valeur_norm: secteurNorm,
    });
    if (error) throw error;
    return data;
  }

  async function backfillFromV1() {
    const { data, error } = await sb().rpc('v2_backfill_connaissances_from_v1');
    if (error) throw error;
    return data;
  }

  async function listModelesJeu(opts = {}) {
    let q = sb()
      .from('modeles_jeu')
      .select('id, code_unique, type_jeu, titre, parcours_id, module_ids, mode, en_pause, actif, created_at, configuration_json')
      .order('created_at', { ascending: false });
    if (opts.type) q = q.eq('type_jeu', opts.type);
    if (opts.actifsOnly !== false) q = q.eq('actif', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function creerModeleJeu(payload) {
    const { data, error } = await sb().rpc('v2_creer_modele_jeu', { p_payload: payload });
    if (error) throw error;
    void global.JpLogs?.action?.('v2_jeu_create', { type: payload.type_jeu, code: data?.code_unique });
    return data;
  }

  async function setPause(modeleId, pause) {
    const { data, error } = await sb().rpc('v2_set_pause_jeu', {
      p_modele_id: modeleId,
      p_pause: !!pause,
    });
    if (error) throw error;
    return data;
  }

  async function listSecteurs() {
    const { data, error } = await sb()
      .from('secteurs_therapeutiques')
      .select('id, valeur, valeur_norm')
      .eq('actif', true)
      .order('valeur');
    if (error) throw error;
    return data || [];
  }

  async function listClasses(kind) {
    const table = kind === 'therapeutique'
      ? 'classes_therapeutiques'
      : 'classes_pharmacologiques';
    const { data, error } = await sb()
      .from(table)
      .select('id, valeur')
      .eq('actif', true)
      .order('valeur')
      .limit(500);
    if (error) throw error;
    return data || [];
  }

  async function compareRcpVsModule(moduleId) {
    const { data: pubs, error: e1 } = await sb()
      .from('publications_connaissances')
      .select('connaissance_id')
      .eq('module_id', moduleId)
      .eq('actif', true);
    if (e1) throw e1;
    const pubSet = new Set((pubs || []).map((p) => p.connaissance_id));

    const { count: totalValide, error: e2 } = await sb()
      .from('connaissances')
      .select('id', { count: 'exact', head: true })
      .eq('statut', 'valide');
    if (e2) throw e2;

    return {
      publiees: pubSet.size,
      referentiel_valide: totalValide || 0,
      non_publiees_estime: Math.max(0, (totalValide || 0) - pubSet.size),
    };
  }

  /** Boot pages admin individuelles */
  async function bootSources() {
    global.JpUi.bootPage({ module: 'v2-admin-sources', homeHref: 'index.html' });
    const wrap = $('list');
    async function refresh() {
      try {
        const rows = await listSources();
        if (!rows.length) {
          wrap.innerHTML = '<p class="jp-muted">Aucune source.</p>';
          return;
        }
        wrap.innerHTML = '<table class="jp-table"><thead><tr><th>Code</th><th>Libellé</th><th>Type</th><th>Actif</th></tr></thead><tbody>'
          + rows.map((r) => '<tr><td><code>' + global.JpUi.escapeHtml(r.code) + '</code></td><td>'
            + global.JpUi.escapeHtml(r.libelle) + '</td><td>' + global.JpUi.escapeHtml(r.type_source)
            + '</td><td>' + (r.actif ? 'oui' : 'non') + '</td></tr>').join('')
          + '</tbody></table>';
      } catch (e) {
        global.JpToast.fromError(e);
      }
    }
    $('btnCreate')?.addEventListener('click', async function () {
      try {
        await createSource({
          code: $('srcCode').value,
          libelle: $('srcLibelle').value,
          type_source: $('srcType').value,
          description: $('srcDesc').value,
        });
        global.JpToast.ok('Source créée');
        await refresh();
      } catch (e) {
        global.JpToast.fromError(e);
      }
    });
    $('btnBackfill')?.addEventListener('click', async function () {
      try {
        const res = await backfillFromV1();
        global.JpToast.ok('Backfill : ' + (res?.total_connaissances || '?') + ' connaissances');
      } catch (e) {
        global.JpToast.fromError(e);
      }
    });
    await refresh();
  }

  async function bootReferentiel() {
    global.JpUi.bootPage({ module: 'v2-admin-referentiel', homeHref: 'index.html' });
    const wrap = $('list');
    async function refresh() {
      try {
        const rows = await listConnaissances({
          statut: $('filtreStatut').value || undefined,
          limit: 80,
        });
        wrap.innerHTML = rows.length
          ? '<table class="jp-table"><thead><tr><th>Champ</th><th>Texte</th><th>Statut</th><th></th></tr></thead><tbody>'
            + rows.map((r) => '<tr><td>' + global.JpUi.escapeHtml(r.champ_code)
              + '</td><td>' + global.JpUi.escapeHtml(r.texte)
              + '</td><td>' + global.JpUi.escapeHtml(r.statut)
              + '</td><td><button type="button" class="jp-link-btn" data-valider="'
              + r.id + '">Valider</button> · <button type="button" class="jp-link-btn" data-retire="'
              + r.id + '">Retirer</button></td></tr>').join('')
            + '</tbody></table>'
          : '<p class="jp-muted">Aucune connaissance.</p>';
        wrap.querySelectorAll('[data-valider]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await setConnaissanceStatut(btn.getAttribute('data-valider'), 'valide');
              global.JpToast.ok('Validée');
              await refresh();
            } catch (e) { global.JpToast.fromError(e); }
          });
        });
        wrap.querySelectorAll('[data-retire]').forEach((btn) => {
          btn.addEventListener('click', async () => {
            try {
              await setConnaissanceStatut(btn.getAttribute('data-retire'), 'retire');
              global.JpToast.ok('Retirée');
              await refresh();
            } catch (e) { global.JpToast.fromError(e); }
          });
        });
      } catch (e) {
        global.JpToast.fromError(e);
      }
    }
    $('filtreStatut')?.addEventListener('change', () => void refresh());
    await refresh();
  }

  async function bootParcours() {
    global.JpUi.bootPage({ module: 'admin-parcours', homeHref: 'index.html' });
    const wrap = $('list');
    const detail = $('detail');
    try {
      const parcours = await listParcoursAdmin();
      wrap.innerHTML = parcours.map((p) => (
        '<button type="button" class="jp-tile jp-v2-parcours-btn" data-parcours="' + p.id + '">'
        + '<h2>' + global.JpUi.escapeHtml(p.libelle) + '</h2>'
        + '<p><code>' + global.JpUi.escapeHtml(p.code) + '</code> · '
        + global.JpUi.escapeHtml(p.mode_contenu) + '</p></button>'
      )).join('');

      wrap.querySelectorAll('[data-parcours]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const id = btn.getAttribute('data-parcours');
          const mods = (await listModules(id)).filter((m) => m.publie !== false || m.code === 'cv');
          const sectors = await listSecteurs();
          const byId = Object.fromEntries(mods.map((m) => [m.id, m]));
          let html = '<h2 class="jp-title">Thèmes & sous-parcours</h2>';
          for (const m of mods) {
            if (!m.publie) continue;
            const indent = m.parent_id ? ' style="margin-left:1.25rem"' : '';
            const parentLabel = m.parent_id && byId[m.parent_id]
              ? ' · sous ' + byId[m.parent_id].titre
              : '';
            const n = await countPublications(m.id);
            const cmp = await compareRcpVsModule(m.id);
            html += '<article class="jp-quiz-admin-panel" style="margin-bottom:1rem"' + indent + '>'
              + '<div class="jp-quiz-admin-panel-body">'
              + '<h3>' + global.JpUi.escapeHtml(m.titre)
              + (m.est_groupe ? ' <span class="jp-v2-badge">Thème</span>' : '')
              + ' <code>' + global.JpUi.escapeHtml(m.code) + '</code></h3>'
              + '<p class="jp-muted">' + global.JpUi.escapeHtml(m.resume || '')
              + parentLabel + '</p>'
              + '<p>Publications actives : <strong>' + n + '</strong> · Référentiel valide : '
              + cmp.referentiel_valide + ' · Non publiées (estime) : ' + cmp.non_publiees_estime + '</p>'
              + '<div class="jp-toolbar">'
              + '<select data-secteur-for="' + m.id + '">'
              + sectors.map((s) => '<option value="' + global.JpUi.escapeHtml(s.valeur_norm) + '">'
                + global.JpUi.escapeHtml(s.valeur) + '</option>').join('')
              + '</select>'
              + '<button type="button" class="jp-btn jp-btn-ghost" data-pub="' + m.id + '">Publier par secteur</button>'
              + '</div></div></article>';
          }
          detail.innerHTML = html;
          detail.querySelectorAll('[data-pub]').forEach((b) => {
            b.addEventListener('click', async () => {
              const mid = b.getAttribute('data-pub');
              const sel = detail.querySelector('[data-secteur-for="' + mid + '"]');
              try {
                const res = await publierParSecteur(mid, sel.value);
                global.JpToast.ok('Publié : +' + (res?.inserted || 0));
                btn.click();
              } catch (e) {
                global.JpToast.fromError(e);
              }
            });
          });
        });
      });
    } catch (e) {
      global.JpToast.fromError(e);
    }
  }

  async function bootJeux() {
    global.JpUi.bootPage({ module: 'admin-jeux', homeHref: 'index.html' });
    const parcours = await listParcoursAdmin();
    const selP = $('jeuParcours');
    parcours.forEach((p) => {
      const o = document.createElement('option');
      o.value = p.id;
      o.textContent = p.libelle;
      selP.appendChild(o);
    });

    function syncTypePanels() {
      const t = $('jeuType').value;
      if ($('panelQuiz')) $('panelQuiz').hidden = t !== 'quiz';
      if ($('panelTrous')) $('panelTrous').hidden = t !== 'trous';
      if ($('panelFiche')) $('panelFiche').hidden = t !== 'fiche_aleatoire';
      if ($('panelOrdo')) $('panelOrdo').hidden = t !== 'ordonnance';
      if ($('champsBlock')) $('champsBlock').hidden = t === 'fiche_aleatoire';
    }
    $('jeuType')?.addEventListener('change', syncTypePanels);
    syncTypePanels();

    async function fillModules() {
      const mods = await listModules(selP.value);
      const byId = Object.fromEntries(mods.map((m) => [m.id, m]));
      const leaves = mods.filter((m) => m.publie && !m.est_groupe);
      const wrap = $('jeuModules');
      wrap.innerHTML = leaves.map((m) => {
        const parent = m.parent_id && byId[m.parent_id] ? byId[m.parent_id].titre + ' › ' : '';
        return '<label class="jp-quiz-admin-champ"><input type="checkbox" name="jeuMod" value="'
          + m.id + '"> <span>' + global.JpUi.escapeHtml(parent + m.titre) + '</span></label>';
      }).join('') || '<p class="jp-muted">Aucun sous-parcours publié.</p>';
    }
    selP.addEventListener('change', () => void fillModules());
    await fillModules();

    const classesTher = await listClasses('therapeutique');
    const classesPharma = await listClasses('pharmacologique');
    if ($('regleClasseTher')) {
      $('regleClasseTher').innerHTML = classesTher.map((c) => (
        '<option value="' + c.id + '">' + global.JpUi.escapeHtml(c.valeur) + '</option>'
      )).join('');
    }
    if ($('regleClassePharma')) {
      $('regleClassePharma').innerHTML = classesPharma.map((c) => (
        '<option value="' + c.id + '">' + global.JpUi.escapeHtml(c.valeur) + '</option>'
      )).join('');
    }

    const regles = [];
    $('btnAddRegleClasse')?.addEventListener('click', function () {
      const kind = $('regleKind').value;
      const classeId = kind === 'classe_therapeutique'
        ? $('regleClasseTher').value
        : $('regleClassePharma').value;
      const nombre = Number($('regleNombre').value) || 1;
      regles.push({ type: kind, classe_id: classeId, nombre: nombre });
      renderRegles();
    });
    $('btnAddRegleMatrice')?.addEventListener('click', function () {
      const mid = ($('regleMatriceId').value || '').trim();
      if (!mid) return global.JpToast.warn('UUID matrice requis');
      regles.push({ type: 'matrice', matrice_id: mid });
      renderRegles();
    });
    function renderRegles() {
      if (!$('reglesList')) return;
      $('reglesList').innerHTML = regles.length
        ? '<ul>' + regles.map((r, i) => '<li>' + global.JpUi.escapeHtml(JSON.stringify(r))
          + ' <button type="button" data-del="' + i + '">×</button></li>').join('') + '</ul>'
        : '<p class="jp-muted">Aucune règle.</p>';
      $('reglesList').querySelectorAll('[data-del]').forEach((b) => {
        b.addEventListener('click', () => {
          regles.splice(Number(b.getAttribute('data-del')), 1);
          renderRegles();
        });
      });
    }
    renderRegles();

    async function refreshList() {
      const rows = await listModelesJeu({ actifsOnly: false });
      $('jeuxList').innerHTML = rows.length
        ? '<table class="jp-table"><thead><tr><th>Code</th><th>Type</th><th>Titre</th><th>Pause</th><th></th></tr></thead><tbody>'
          + rows.map((r) => '<tr><td><code>' + global.JpUi.escapeHtml(r.code_unique)
            + '</code></td><td>' + global.JpUi.escapeHtml(r.type_jeu)
            + '</td><td>' + global.JpUi.escapeHtml(r.titre)
            + '</td><td>' + (r.en_pause ? 'oui' : 'non')
            + '</td><td><button type="button" class="jp-link-btn" data-pause="'
            + r.id + '" data-val="' + (r.en_pause ? '0' : '1') + '">'
            + (r.en_pause ? 'Reprendre' : 'Pause') + '</button></td></tr>').join('')
          + '</tbody></table>'
        : '<p class="jp-muted">Aucun jeu.</p>';
      $('jeuxList').querySelectorAll('[data-pause]').forEach((b) => {
        b.addEventListener('click', async () => {
          try {
            await setPause(b.getAttribute('data-pause'), b.getAttribute('data-val') === '1');
            global.JpToast.ok('Mis à jour');
            await refreshList();
          } catch (e) { global.JpToast.fromError(e); }
        });
      });
    }

    $('btnCreateJeu')?.addEventListener('click', async function () {
      try {
        const type = $('jeuType').value;
        const moduleIds = Array.from(document.querySelectorAll('input[name="jeuMod"]:checked'))
          .map((el) => el.value);
        const champs = Array.from(document.querySelectorAll('input[name="jeuChamp"]:checked'))
          .map((el) => el.value);
        if (!$('jeuTitre').value.trim()) throw new Error('Titre requis');
        if (type === 'ordonnance' && !regles.length) {
          throw new Error('Ajoutez au moins une règle');
        }
        if ((type === 'ordonnance' || type === 'quiz' || type === 'trous') && !champs.length) {
          throw new Error('Sélectionnez au moins un champ');
        }
        const configuration_json = {
          champs: champs,
          champs_interroges: champs,
          regles: type === 'ordonnance' ? regles.slice() : [],
          nb_questions: Number($('jeuNbQ')?.value) || 10,
          nb_propositions: Number($('jeuNbProp')?.value) || 3,
          nb_fiches: Number($('jeuNbFiches')?.value) || 5,
          densite_trous: Number($('jeuDensite')?.value) || 3,
          seuil_exclusion: Number($('jeuSeuil')?.value) || 8,
          nb_notes_exclusion: Number($('jeuNbNotes')?.value) || 3,
        };
        const created = await creerModeleJeu({
          type_jeu: type,
          titre: $('jeuTitre').value,
          parcours_id: selP.value,
          module_ids: moduleIds,
          mode: $('jeuMode').value,
          configuration_json,
        });
        $('resultBox').hidden = false;
        $('resultCode').textContent = created.code_unique;
        $('resultMeta').textContent = created.type_jeu + ' · ' + created.titre;
        const play = created.type_jeu === 'ordonnance'
          ? '../ordonnances/jouer.html?code=' + encodeURIComponent(created.code_unique)
          : '../jeux/jouer.html?code=' + encodeURIComponent(created.code_unique);
        $('resultPlay').href = play;
        global.JpToast.ok('Jeu créé : ' + created.code_unique);
        await refreshList();
      } catch (e) {
        global.JpToast.fromError(e);
      }
    });

    await refreshList();
  }

  global.JpV2Admin = {
    bootSources,
    bootReferentiel,
    bootParcours,
    bootJeux,
    listSources,
    listConnaissances,
    listParcoursAdmin,
    listModules,
    creerModeleJeu,
    setPause,
  };
})(window);
