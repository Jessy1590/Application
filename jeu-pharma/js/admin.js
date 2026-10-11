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

  async function publierMatrices(moduleId, matriceIds, champCodes) {
    const { data, error } = await sb().rpc('v2_publier_module_matrices', {
      p_module_id: moduleId,
      p_matrice_ids: matriceIds,
      p_champ_codes: champCodes && champCodes.length ? champCodes : null,
    });
    if (error) throw error;
    return data;
  }

  async function creerParcours(payload) {
    const { data, error } = await sb().rpc('v2_creer_parcours', { p_payload: payload });
    if (error) throw error;
    return data;
  }

  async function creerModule(payload) {
    const { data, error } = await sb().rpc('v2_creer_module', { p_payload: payload });
    if (error) throw error;
    return data;
  }

  async function searchMatrices(q, limit) {
    let query = sb()
      .from('v_medicaments_complet')
      .select('id, dci, nom_commercial, noms_commerciaux, statut')
      .eq('statut', 'publie')
      .order('dci')
      .limit(limit || 40);
    const term = String(q || '').trim();
    if (term) {
      query = query.or('dci.ilike.%' + term + '%,nom_commercial.ilike.%' + term + '%');
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
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
    let selectedParcoursId = null;
    let selectedModuleId = null;

    async function refreshList() {
      const parcours = await listParcoursAdmin();
      wrap.innerHTML = parcours.map((p) => (
        '<button type="button" class="jp-tile jp-v2-parcours-btn'
        + (p.id === selectedParcoursId ? ' is-selected' : '') + '" data-parcours="' + p.id + '">'
        + '<h2>' + global.JpUi.escapeHtml(p.libelle) + '</h2>'
        + '<p>' + global.JpUi.escapeHtml(p.description || 'Sans description') + '</p>'
        + '<p class="jp-muted"><code>' + global.JpUi.escapeHtml(p.code) + '</code> · '
        + (p.mode_contenu === 'referentiel_valide' ? 'Tout le référentiel' : 'Contenu publié seulement')
        + '</p></button>'
      )).join('');
      wrap.querySelectorAll('[data-parcours]').forEach((btn) => {
        btn.addEventListener('click', function () {
          selectedParcoursId = btn.getAttribute('data-parcours');
          selectedModuleId = null;
          void openParcours(selectedParcoursId);
          void refreshList();
        });
      });
      return parcours;
    }

    function champsCheckboxes(name) {
      return (global.JpConstants.champsActifs() || [])
        .filter((c) => c.code !== 'nom_commercial' && c.code !== 'dci')
        .map((c) => (
          '<label class="jp-quiz-admin-champ"><input type="checkbox" name="' + name + '" value="'
          + c.code + '" checked> <span>' + global.JpUi.escapeHtml(c.libelle) + '</span></label>'
        )).join('');
    }

    async function openParcours(id) {
      const mods = await listModules(id);
      const published = mods.filter((m) => m.publie);
      const byId = Object.fromEntries(mods.map((m) => [m.id, m]));
      const groupes = published.filter((m) => m.est_groupe && !m.parent_id);
      const racinesFeuilles = published.filter((m) => !m.est_groupe && !m.parent_id);

      let html = '<div class="jp-scope-note">Pour un parcours type DEUST / Introduction : '
        + 'publiez <strong>seulement</strong> les molécules et champs du programme. '
        + 'Le reste du catalogue reste masqué pour l’apprenant (anti-surapprentissage).</div>';

      html += '<div class="jp-admin-simple-card"><h3>Ajouter un thème ou un sous-parcours</h3>'
        + '<div class="jp-split jp-split-2">'
        + '<div class="jp-field"><label for="modTitre">Titre</label><input id="modTitre" placeholder="Ex. Anémie"></div>'
        + '<div class="jp-field"><label for="modParent">Sous…</label><select id="modParent">'
        + '<option value="">— Thème racine —</option>'
        + groupes.map((g) => '<option value="' + g.id + '">' + global.JpUi.escapeHtml(g.titre) + '</option>').join('')
        + '</select></div></div>'
        + '<div class="jp-field"><label for="modResume">Résumé (optionnel)</label>'
        + '<input id="modResume" placeholder="Ce que l’apprenant va apprendre"></div>'
        + '<label class="jp-quiz-admin-champ"><input type="checkbox" id="modGroupe"> '
        + '<span>C’est un thème (conteneur, pas une leçon jouable)</span></label>'
        + '<div class="jp-v2-actions"><button type="button" class="jp-btn jp-btn-primary" id="btnAddMod">Ajouter</button></div>'
        + '</div>';

      html += '<h2 class="jp-title">Contenu du parcours</h2><div id="modTree">';
      function renderLeaf(m, depth) {
        const nPromise = countPublications(m.id);
        return nPromise.then((n) => (
          '<button type="button" class="jp-admin-simple-card" data-mod="' + m.id + '" style="margin-left:'
          + (depth * 1) + 'rem;width:calc(100% - ' + (depth) + 'rem);text-align:left">'
          + '<h3>' + global.JpUi.escapeHtml(m.titre)
          + (m.est_groupe ? ' <span class="jp-v2-badge">Thème</span>' : '')
          + '</h3>'
          + '<p class="jp-muted">' + global.JpUi.escapeHtml(m.resume || '') + '</p>'
          + '<p><strong>' + n + '</strong> connaissance(s) publiée(s)</p></button>'
        ));
      }

      const blocks = [];
      for (const g of groupes.sort((a, b) => a.ordre - b.ordre)) {
        blocks.push(await renderLeaf(g, 0));
        const kids = published.filter((m) => m.parent_id === g.id).sort((a, b) => a.ordre - b.ordre);
        for (const k of kids) blocks.push(await renderLeaf(k, 1));
      }
      for (const f of racinesFeuilles.sort((a, b) => a.ordre - b.ordre)) {
        blocks.push(await renderLeaf(f, 0));
      }
      html += blocks.join('') || '<p class="jp-muted">Aucun module. Ajoutez un thème puis un sous-parcours.</p>';
      html += '</div><div id="modEditor"></div>';
      detail.innerHTML = html;

      $('btnAddMod')?.addEventListener('click', async function () {
        try {
          const titre = ($('modTitre').value || '').trim();
          if (!titre) throw new Error('Titre requis');
          await creerModule({
            parcours_id: id,
            parent_id: $('modParent').value || null,
            titre,
            resume: $('modResume').value || '',
            est_groupe: !!$('modGroupe').checked,
            publie: true,
            ordre: (mods.reduce((m, x) => Math.max(m, x.ordre || 0), 0) || 0) + 10,
          });
          global.JpToast.ok('Ajouté');
          await openParcours(id);
        } catch (e) {
          global.JpToast.fromError(e);
        }
      });

      detail.querySelectorAll('[data-mod]').forEach((btn) => {
        btn.addEventListener('click', function () {
          selectedModuleId = btn.getAttribute('data-mod');
          void openModuleEditor(id, selectedModuleId, byId);
        });
      });
    }

    async function openModuleEditor(parcoursId, moduleId, byId) {
      const m = byId[moduleId] || (await listModules(parcoursId)).find((x) => x.id === moduleId);
      const editor = $('modEditor');
      if (!m || m.est_groupe) {
        editor.innerHTML = m?.est_groupe
          ? '<div class="jp-scope-note">Thème sélectionné : ajoutez des sous-parcours dessous, puis publiez le contenu sur les sous-parcours.</div>'
          : '';
        return;
      }
      const n = await countPublications(m.id);
      const sectors = await listSecteurs();
      editor.innerHTML = '<div class="jp-admin-simple-card">'
        + '<h3>Publier du contenu — ' + global.JpUi.escapeHtml(m.titre) + '</h3>'
        + '<p class="jp-muted">Actuellement : <strong>' + n + '</strong> connaissance(s). '
        + 'Tout ce qui n’est pas publié ici sera masqué pour l’apprenant.</p>'
        + '<div class="jp-admin-steps">'
        + '<div class="jp-admin-step"><div><strong>Champs du programme</strong>'
        + '<div class="jp-quiz-admin-champs-grid" id="pubChamps">' + champsCheckboxes('pubChamp') + '</div></div></div>'
        + '<div class="jp-admin-step"><div><strong>Molécules à inclure</strong>'
        + '<div class="jp-field"><label for="molSearch">Recherche</label>'
        + '<input id="molSearch" placeholder="DCI ou nom commercial"></div>'
        + '<div id="molPick" class="jp-mol-pick"><p class="jp-muted">Tapez pour chercher…</p></div></div></div>'
        + '<div class="jp-admin-step"><div><strong>Ou raccourci par secteur ATC</strong>'
        + '<div class="jp-toolbar"><select id="pubSecteur">'
        + sectors.map((s) => '<option value="' + global.JpUi.escapeHtml(s.valeur_norm) + '">'
          + global.JpUi.escapeHtml(s.valeur) + '</option>').join('')
        + '</select> <button type="button" class="jp-btn jp-btn-ghost" id="btnPubSecteur">Publier le secteur</button></div>'
        + '<p class="jp-muted">Attention : un secteur entier peut être large. Préférez la sélection molécule par molécule pour Introduction / DEUST.</p>'
        + '</div></div></div>'
        + '<div class="jp-v2-actions"><button type="button" class="jp-btn jp-btn-primary" id="btnPubMol">Publier la sélection</button></div>'
        + '</div>';

      async function fillMols() {
        const rows = await searchMatrices($('molSearch').value, 50);
        $('molPick').innerHTML = rows.length
          ? rows.map((r) => (
            '<label class="jp-quiz-admin-champ"><input type="checkbox" name="pubMol" value="'
            + r.id + '"> <span>' + global.JpUi.escapeHtml(r.dci || '')
            + (r.nom_commercial ? ' · ' + global.JpUi.escapeHtml(r.nom_commercial) : '')
            + '</span></label>'
          )).join('')
          : '<p class="jp-muted">Aucun résultat.</p>';
      }
      let t = null;
      $('molSearch').addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () { void fillMols(); }, 220);
      });
      await fillMols();

      $('btnPubMol')?.addEventListener('click', async function () {
        try {
          const ids = Array.from(document.querySelectorAll('input[name="pubMol"]:checked')).map((el) => el.value);
          const champs = Array.from(document.querySelectorAll('input[name="pubChamp"]:checked')).map((el) => el.value);
          if (!ids.length) throw new Error('Cochez au moins une molécule');
          if (!champs.length) throw new Error('Cochez au moins un champ');
          // Toujours publier identité (noms/DCI) + champs cochés
          const champsFull = Array.from(new Set(champs.concat(['nom_commercial', 'dci'])));
          const res = await publierMatrices(m.id, ids, champsFull);
          global.JpToast.ok('Publié : +' + (res?.inserted || 0) + ' connaissance(s)');
          await openParcours(parcoursId);
          await openModuleEditor(parcoursId, moduleId, Object.fromEntries((await listModules(parcoursId)).map((x) => [x.id, x])));
        } catch (e) {
          global.JpToast.fromError(e);
        }
      });

      $('btnPubSecteur')?.addEventListener('click', async function () {
        try {
          const res = await publierParSecteur(m.id, $('pubSecteur').value);
          global.JpToast.ok('Secteur publié : +' + (res?.inserted || 0));
          await openParcours(parcoursId);
        } catch (e) {
          global.JpToast.fromError(e);
        }
      });
    }

    $('btnCreateParcours')?.addEventListener('click', async function () {
      try {
        const libelle = ($('newParcoursLibelle').value || '').trim();
        if (!libelle) throw new Error('Donnez un nom au parcours');
        const created = await creerParcours({
          libelle,
          description: $('newParcoursDesc').value || '',
          niveau_lie: $('newParcoursNiveau').value || null,
          mode_contenu: $('newParcoursMode').value || 'publications',
          ordre: 40,
        });
        global.JpToast.ok('Parcours créé');
        selectedParcoursId = created.id;
        $('newParcoursLibelle').value = '';
        $('newParcoursDesc').value = '';
        await refreshList();
        await openParcours(created.id);
      } catch (e) {
        global.JpToast.fromError(e);
      }
    });

    try {
      const parcours = await refreshList();
      const intro = parcours.find((p) => p.code === 'introduction') || parcours[0];
      if (intro) {
        selectedParcoursId = intro.id;
        await refreshList();
        await openParcours(intro.id);
      }
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

  async function bootCatalogue() {
    global.JpUi.bootPage({ module: 'admin-catalogue', homeHref: 'index.html' });
    const list = $('list');
    const q = $('q');

    async function refresh() {
      try {
        const rows = await searchMatrices(q?.value || '', 80);
        list.innerHTML = rows.length
          ? '<table class="jp-table"><thead><tr><th>DCI</th><th>Nom</th><th></th></tr></thead><tbody>'
            + rows.map((r) => '<tr><td>' + global.JpUi.escapeHtml(r.dci || '')
              + '</td><td>' + global.JpUi.escapeHtml(r.nom_commercial || '')
              + '</td><td><a class="jp-link-btn" href="../legacy-v1/admin/catalogue.html?focus='
              + encodeURIComponent(r.id) + '">Éditer la fiche</a></td></tr>').join('')
            + '</tbody></table>'
          : '<p class="jp-muted">Aucune fiche.</p>';
      } catch (e) {
        global.JpToast.fromError(e);
      }
    }

    let t = null;
    q?.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(function () { void refresh(); }, 200);
    });
    await refresh();
  }

  global.JpV2Admin = {
    bootSources,
    bootReferentiel,
    bootParcours,
    bootJeux,
    bootCatalogue,
    listSources,
    listConnaissances,
    listParcoursAdmin,
    listModules,
    creerModeleJeu,
    setPause,
    creerParcours,
    creerModule,
    publierMatrices,
  };
})(window);
