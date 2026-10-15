/**
 * Admin Référentiel — vue plein page Comparaison (scope parcours/chapitre/leçon).
 * Fusion / suppression d’entités + édition des valeurs ★ d’une leçon.
 * Dépend : JpApp, JpConstants, JpUi, JpToast, JpModal, JpTypeahead, JpMedicaments.
 */
(function (global) {
  const esc = (s) => global.JpUi.escapeHtml(String(s ?? ''));

  function sb() {
    return global.JpApp.sbJeu();
  }

  async function rpc(name, args) {
    const { data, error } = await sb().rpc(name, args);
    if (error) throw error;
    return data;
  }

  function champsActifs() {
    if (typeof global.JpConstants?.champsActifs === 'function') {
      return global.JpConstants.champsActifs();
    }
    return (global.JpConstants?.CHAMP_CODES || []).filter((c) => c.actif !== false);
  }

  /** Colonnes tableau (hors identité déjà en 1re colonne). */
  function colonnesComparaison() {
    return champsActifs().filter((c) => c.code !== 'nom_commercial');
  }

  function champByCode(code) {
    return champsActifs().find((c) => c.code === code);
  }

  function entitiesOfRow(row, champ) {
    if (!row || !champ) return [];
    if (champ.card === 1) {
      const id = row[champ.fk];
      let val = row[champ.code];
      if (val && typeof val === 'object' && !Array.isArray(val)) val = val.valeur;
      if (!id && !val) return [];
      return [{ id: id || null, valeur: val || '—' }];
    }
    const arr = champ.code === 'nom_commercial'
      ? (row.noms_commerciaux || [])
      : (Array.isArray(row[champ.code]) ? row[champ.code] : []);
    return (arr || [])
      .map((x) => ({
        id: x?.id || null,
        valeur: global.JpMedicaments?.labelFrom?.(x) || x?.valeur || String(x || ''),
      }))
      .filter((x) => x.valeur);
  }

  function dciLabel(row) {
    const dci = row?.dci || '—';
    const noms = global.JpMedicaments?.formatNoms?.(row) || '';
    return { dci, noms };
  }

  /* ——— State ——— */
  const state = {
    open: false,
    host: null,
    mainEl: null,
    parcoursList: [],
    modules: [],
    scopeItems: [],
    scope: null,
    fiches: [],
    selected: new Map(), // key `${code}:${id}` -> { code, table, id, valeur }
    activeCol: null,
    valeursMode: false,
    valeursNiveau: 2,
    valeursLeconId: null,
    valeursData: null,
    valeursLocal: {}, // matriceId -> Set(cid)
  };

  function selKey(code, id) {
    return code + ':' + id;
  }

  function clearSelection() {
    state.selected.clear();
    state.activeCol = null;
    paintSelectionUi();
  }

  function paintSelectionUi() {
    if (!state.host) return;
    state.host.querySelectorAll('.jp-cmp-chip').forEach((el) => {
      const code = el.getAttribute('data-code');
      const id = el.getAttribute('data-eid');
      el.classList.toggle('is-selected', !!(id && state.selected.has(selKey(code, id))));
    });
    const n = state.selected.size;
    const colOk = state.activeCol && n >= 2;
    const oneOk = n >= 1;
    const btnMerge = state.host.querySelector('#cmpMerge');
    const btnDel = state.host.querySelector('#cmpDelete');
    if (btnMerge) btnMerge.disabled = !colOk;
    if (btnDel) btnDel.disabled = !oneOk;
    const info = state.host.querySelector('#cmpSelInfo');
    if (info) {
      info.textContent = n
        ? (n + ' sélectionnée(s)' + (state.activeCol ? ' · ' + (champByCode(state.activeCol)?.libelle || state.activeCol) : ''))
        : 'Sélectionnez 2+ valeurs d’une même colonne pour fusionner';
    }
  }

  function toggleEntity(code, table, id, valeur) {
    if (!id) return;
    if (state.activeCol && state.activeCol !== code) clearSelection();
    state.activeCol = code;
    const k = selKey(code, id);
    if (state.selected.has(k)) state.selected.delete(k);
    else state.selected.set(k, { code, table, id, valeur });
    if (!state.selected.size) state.activeCol = null;
    paintSelectionUi();
  }

  /* ——— Data loaders ——— */
  async function loadParcoursTree() {
    const [{ data: parcours, error: e1 }, { data: modules, error: e2 }] = await Promise.all([
      sb().from('parcours_apprentissage').select('id, code, libelle, actif').eq('actif', true).order('libelle'),
      sb().from('modules_cours')
        .select('id, parcours_id, parent_id, titre, code, est_groupe, ordre')
        .order('ordre'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    state.parcoursList = parcours || [];
    state.modules = modules || [];

    const byParcours = {};
    state.modules.forEach((m) => {
      (byParcours[m.parcours_id] = byParcours[m.parcours_id] || []).push(m);
    });

    const items = [];
    state.parcoursList.forEach((p) => {
      items.push({
        id: p.id,
        kind: 'parcours',
        label: p.libelle,
        sub: 'Parcours · ' + (p.code || ''),
      });
      const mods = byParcours[p.id] || [];
      const byParent = {};
      mods.forEach((m) => {
        const k = m.parent_id || '__root__';
        (byParent[k] = byParent[k] || []).push(m);
      });
      function walk(parentKey, depth) {
        (byParent[parentKey] || []).forEach((m) => {
          const kind = m.est_groupe ? 'chapitre' : 'lecon';
          const prefix = depth ? ('— '.repeat(Math.min(depth, 3))) : '';
          items.push({
            id: m.id,
            kind,
            label: prefix + m.titre,
            sub: (kind === 'chapitre' ? 'Chapitre' : 'Leçon') + ' · ' + p.libelle,
            parcours_id: p.id,
            titre: m.titre,
          });
          if (m.est_groupe) walk(m.id, depth + 1);
        });
      }
      walk('__root__', 0);
    });
    state.scopeItems = items;
  }

  async function loadScope(kind, id) {
    state.scope = await rpc('v2_comparaison_scope', { p_kind: kind, p_id: id });
    const mids = (state.scope?.matrice_ids || []).map(String);
    if (!mids.length) {
      state.fiches = [];
      return;
    }
    const data = await rpc('v2_comparaison_fiches', { p_matrice_ids: mids });
    state.fiches = Array.isArray(data) ? data : [];
  }

  /* ——— Render ——— */
  function ensureHost() {
    if (state.host) return state.host;
    state.mainEl = document.querySelector('main.jp-page');
    const host = document.createElement('div');
    host.id = 'comparaisonView';
    host.className = 'jp-comparaison';
    host.hidden = true;
    (state.mainEl?.parentNode || document.body).appendChild(host);
    state.host = host;
    return host;
  }

  function shellHtml() {
    return '<div class="jp-comparaison-inner">'
      + '<header class="jp-comparaison-head">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="cmpBack">← Retour référentiel</button>'
      + '<h1 class="jp-title">Comparaison</h1>'
      + '<div id="cmpScopeCombo" class="jp-comparaison-scope"></div>'
      + '<span class="jp-muted" id="cmpCount"></span>'
      + '</header>'
      + '<div class="jp-comparaison-toolbar">'
      + '<span class="jp-muted" id="cmpSelInfo">Sélectionnez 2+ valeurs d’une même colonne pour fusionner</span>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="cmpMerge" disabled>Fusionner</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="cmpDelete" disabled>Supprimer l’entité</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="cmpValeurs">Voir les valeurs</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="cmpClearSel" hidden>Effacer sélection</button>'
      + '</div>'
      + '<div class="jp-comparaison-body" id="cmpBody">'
      + '<p class="jp-muted">Choisissez un parcours, un chapitre ou une leçon.</p>'
      + '</div>'
      + '<aside class="jp-comparaison-valeurs" id="cmpValeursPane" hidden></aside>'
      + '</div>';
  }

  function renderTable() {
    const body = state.host.querySelector('#cmpBody');
    const count = state.host.querySelector('#cmpCount');
    if (!state.scope) {
      body.innerHTML = '<p class="jp-muted">Choisissez un parcours, un chapitre ou une leçon.</p>';
      if (count) count.textContent = '';
      return;
    }
    const cols = colonnesComparaison();
    const n = state.fiches.length;
    if (count) {
      count.textContent = n + ' molécule(s) · ' + (state.scope.label || '');
    }
    if (!n) {
      body.innerHTML = '<p class="jp-muted">Aucune molécule dans ce scope (pubs ou blocs molécule).</p>';
      return;
    }

    let html = '<div class="jp-comparaison-table-wrap"><table class="jp-comparaison-table">'
      + '<thead><tr><th class="jp-cmp-sticky">Molécule</th>';
    cols.forEach((c) => {
      html += '<th data-col="' + esc(c.code) + '">' + esc(c.libelle) + '</th>';
    });
    html += '</tr></thead><tbody>';

    state.fiches.forEach((row) => {
      const { dci, noms } = dciLabel(row);
      html += '<tr data-mid="' + esc(row.id) + '">'
        + '<th class="jp-cmp-sticky" scope="row">'
        + '<strong>' + esc(dci) + '</strong>'
        + (noms ? '<span class="jp-muted">' + esc(noms) + '</span>' : '')
        + '</th>';
      cols.forEach((c) => {
        const ents = entitiesOfRow(row, c);
        html += '<td data-col="' + esc(c.code) + '">';
        if (!ents.length) {
          html += '<span class="jp-cmp-empty">—</span>';
        } else {
          ents.forEach((e) => {
            if (!e.id) {
              html += '<span class="jp-cmp-chip jp-cmp-chip-static">' + esc(e.valeur) + '</span>';
              return;
            }
            html += '<button type="button" class="jp-cmp-chip" data-code="' + esc(c.code)
              + '" data-table="' + esc(c.table) + '" data-eid="' + esc(e.id)
              + '" title="Sélectionner">' + esc(e.valeur) + '</button>';
          });
        }
        html += '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    body.innerHTML = html;

    body.querySelectorAll('.jp-cmp-chip[data-eid]').forEach((btn) => {
      btn.addEventListener('click', () => {
        toggleEntity(
          btn.getAttribute('data-code'),
          btn.getAttribute('data-table'),
          btn.getAttribute('data-eid'),
          btn.textContent
        );
        state.host.querySelector('#cmpClearSel').hidden = state.selected.size === 0;
      });
    });
    paintSelectionUi();
  }

  /* ——— Fusion / suppression ——— */
  async function doMerge() {
    if (!state.activeCol || state.selected.size < 2) return;
    const champ = champByCode(state.activeCol);
    if (!champ) return;
    const items = [...state.selected.values()];
    const wrap = document.createElement('div');
    wrap.innerHTML = '<p>Quelle valeur conserver ? Les autres seront fusionnées dessus (liaisons réassignées, entités désactivées).</p>'
      + '<div class="jp-cmp-keep-list" role="radiogroup">'
      + items.map((it, i) => (
        '<label class="jp-cmp-keep-opt">'
        + '<input type="radio" name="cmpKeep" value="' + esc(it.id) + '"' + (i === 0 ? ' checked' : '') + '>'
        + '<span>' + esc(it.valeur) + '</span></label>'
      )).join('')
      + '</div>';

    global.JpModal.open({
      title: 'Fusionner — ' + (champ.libelle || champ.code),
      body: wrap,
      confirmLabel: 'Fusionner',
      onConfirm: async () => {
        const keep = wrap.querySelector('input[name=cmpKeep]:checked')?.value;
        if (!keep) {
          global.JpToast?.warn?.('Choisissez la valeur à garder');
          return false;
        }
        const drops = items.map((x) => x.id).filter((id) => id !== keep);
        try {
          await rpc('v2_fusionner_entites', {
            p_table_name: champ.table,
            p_id_keep: keep,
            p_id_drops: drops,
          });
          global.JpToast?.ok?.('Fusion effectuée (' + drops.length + ')');
          void global.JpLogs?.action?.('comparaison_fusion', {
            table: champ.table, keep, drops,
          });
          clearSelection();
          if (state.scope) await loadScope(state.scope.kind, state.scope.id);
          renderTable();
        } catch (e) {
          global.JpToast?.fromError?.(e);
          return false;
        }
        return undefined;
      },
    });
  }

  async function doDelete() {
    if (!state.selected.size) return;
    const items = [...state.selected.values()];
    const champ = champByCode(items[0].code);
    if (!champ) return;
    // Une seule table à la fois
    if (items.some((x) => x.code !== items[0].code)) {
      global.JpToast?.warn?.('Sélectionnez des valeurs d’une seule colonne');
      return;
    }
    const labels = items.map((x) => x.valeur).join(' · ');
    global.JpModal.open({
      title: 'Supprimer l’entité ?',
      body: 'Retirer « ' + labels + ' » des fiches (liaisons) et désactiver '
        + (items.length > 1 ? 'ces entités' : 'cette entité') + ' ?',
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        try {
          for (const it of items) {
            await rpc('v2_supprimer_entite', {
              p_table_name: champ.table,
              p_id: it.id,
            });
          }
          global.JpToast?.ok?.(items.length > 1 ? 'Entités supprimées' : 'Entité supprimée');
          void global.JpLogs?.action?.('comparaison_supprimer', {
            table: champ.table,
            ids: items.map((x) => x.id),
          });
          clearSelection();
          if (state.scope) await loadScope(state.scope.kind, state.scope.id);
          renderTable();
        } catch (e) {
          global.JpToast?.fromError?.(e);
          return false;
        }
        return undefined;
      },
    });
  }

  /* ——— Valeurs ★ ——— */
  function resolveValeursLeconId() {
    if (state.scope?.kind === 'lecon') return state.scope.id;
    return state.valeursLeconId;
  }

  function openValeursPane() {
    if (!state.scope) {
      global.JpToast?.warn?.('Choisissez d’abord un scope');
      return;
    }
    state.valeursMode = true;
    if (state.scope.kind === 'lecon') {
      state.valeursLeconId = state.scope.id;
    } else if (!state.valeursLeconId) {
      const first = (state.scope.lecons || [])[0];
      state.valeursLeconId = first?.id || null;
    }
    void refreshValeursPane();
  }

  function closeValeursPane() {
    state.valeursMode = false;
    state.valeursData = null;
    const pane = state.host?.querySelector('#cmpValeursPane');
    if (pane) {
      pane.hidden = true;
      pane.innerHTML = '';
    }
    state.host?.classList.remove('has-valeurs');
  }

  async function refreshValeursPane() {
    const pane = state.host.querySelector('#cmpValeursPane');
    state.host.classList.add('has-valeurs');
    pane.hidden = false;

    const lecons = state.scope.lecons || [];
    const needLeconPick = state.scope.kind !== 'lecon';
    const leconId = resolveValeursLeconId();

    let html = '<header class="jp-cmp-val-head">'
      + '<h2>Valeurs affichées</h2>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="cmpValClose">Fermer</button>'
      + '</header>';

    if (needLeconPick) {
      html += '<label class="jp-cmp-val-field">Leçon cible'
        + '<select id="cmpValLecon">'
        + lecons.map((l) => (
          '<option value="' + esc(l.id) + '"'
          + (l.id === leconId ? ' selected' : '') + '>' + esc(l.titre) + '</option>'
        )).join('')
        + '</select></label>';
    }

    html += '<label class="jp-cmp-val-field">Niveau'
      + '<select id="cmpValNiveau">'
      + '<option value="0"' + (state.valeursNiveau === 0 ? ' selected' : '') + '>Base</option>'
      + [1, 2, 3, 4, 5].map((n) => (
        '<option value="' + n + '"' + (state.valeursNiveau === n ? ' selected' : '') + '>★' + n + '</option>'
      )).join('')
      + '</select></label>';

    html += '<div id="cmpValBody"><p class="jp-muted">Chargement…</p></div>'
      + '<footer class="jp-cmp-val-foot">'
      + '<button type="button" class="jp-btn jp-btn-primary" id="cmpValSave" disabled>Enregistrer</button>'
      + '</footer>';

    pane.innerHTML = html;
    pane.querySelector('#cmpValClose').addEventListener('click', closeValeursPane);
    pane.querySelector('#cmpValNiveau').addEventListener('change', (e) => {
      state.valeursNiveau = Number(e.target.value) || 0;
      void loadAndPaintValeurs();
    });
    pane.querySelector('#cmpValLecon')?.addEventListener('change', (e) => {
      state.valeursLeconId = e.target.value || null;
      void loadAndPaintValeurs();
    });
    pane.querySelector('#cmpValSave').addEventListener('click', () => void saveValeurs());

    await loadAndPaintValeurs();
  }

  async function loadAndPaintValeurs() {
    const body = state.host.querySelector('#cmpValBody');
    const btnSave = state.host.querySelector('#cmpValSave');
    const leconId = resolveValeursLeconId();
    if (!leconId) {
      body.innerHTML = '<p class="jp-muted">Choisissez une leçon cible pour enregistrer les valeurs.</p>';
      if (btnSave) btnSave.disabled = true;
      return;
    }
    body.innerHTML = '<p class="jp-muted">Chargement…</p>';
    try {
      const data = await rpc('v2_comparaison_valeurs_lecon', {
        p_module_id: leconId,
        p_niveau: state.valeursNiveau,
        p_bloc_id: null,
      });
      state.valeursData = data;
      if (!data?.ok) {
        body.innerHTML = '<p class="jp-muted">Aucun bloc molécule sur cette leçon. '
          + 'Ajoutez-en un dans Modif parcours.</p>';
        if (btnSave) btnSave.disabled = true;
        return;
      }

      state.valeursLocal = {};
      const sel = data.selected || {};
      Object.keys(sel).forEach((mid) => {
        const arr = Array.isArray(sel[mid]) ? sel[mid] : [];
        state.valeursLocal[mid] = new Set(arr.map(String));
      });

      const mids = (data.matrice_ids || []).map(String);
      let available = Array.isArray(data.available) ? data.available.slice() : [];
      if (available.length && !available[0].matrice_id && !available[0].matriceId) {
        available = [];
        for (const mid of mids) {
          const rows = await rpc('v2_lister_connaissances_matrice', {
            p_matrice_id: mid,
            p_module_id: leconId,
          });
          (Array.isArray(rows) ? rows : []).forEach((r) => {
            available.push(Object.assign({ matrice_id: mid }, r));
          });
        }
      } else {
        available.forEach((r) => {
          if (!r.matrice_id && r.matriceId) r.matrice_id = r.matriceId;
        });
      }

      const ficheById = {};
      state.fiches.forEach((f) => { ficheById[f.id] = f; });

      const grouped = {};
      available.forEach((r) => {
        const mid = String(r.matrice_id || '');
        if (!mid) return;
        if (r.champ_code === 'dci' || r.champ_code === 'nom_commercial') return;
        (grouped[mid] = grouped[mid] || []).push(r);
      });

      let html = '';
      mids.forEach((mid) => {
        const f = ficheById[mid];
        const title = f ? (f.dci || mid.slice(0, 8)) : mid.slice(0, 8);
        const rows = grouped[mid] || [];
        const set = state.valeursLocal[mid] || (state.valeursLocal[mid] = new Set());
        html += '<section class="jp-cmp-val-mol" data-mid="' + esc(mid) + '">'
          + '<h3>' + esc(title) + '</h3>';
        if (!rows.length) {
          html += '<p class="jp-muted">Aucune valeur référentiel</p></section>';
          return;
        }
        const byChamp = {};
        rows.forEach((r) => {
          (byChamp[r.champ_code] = byChamp[r.champ_code] || []).push(r);
        });
        Object.keys(byChamp).sort().forEach((code) => {
          const lib = champByCode(code)?.libelle || code;
          html += '<div class="jp-cmp-val-champ"><header>' + esc(lib) + '</header>';
          byChamp[code].forEach((r) => {
            const cid = String(r.connaissance_id);
            const on = set.has(cid);
            html += '<button type="button" class="jp-cmp-val-chip' + (on ? ' is-on' : '')
              + '" data-mid="' + esc(mid) + '" data-cid="' + esc(cid) + '">'
              + esc(r.texte || '—') + '</button>';
          });
          html += '</div>';
        });
        html += '</section>';
      });

      if (!mids.length) {
        html = '<p class="jp-muted">Aucune molécule dans le bloc pour ce niveau. '
          + 'Ajoutez des molécules dans Modif parcours (onglet Base / ★).</p>';
        if (btnSave) btnSave.disabled = true;
      } else if (btnSave) {
        btnSave.disabled = false;
      }

      body.innerHTML = html || '<p class="jp-muted">Rien à afficher</p>';
      body.querySelectorAll('.jp-cmp-val-chip').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mid = btn.getAttribute('data-mid');
          const cid = btn.getAttribute('data-cid');
          const set = state.valeursLocal[mid] || (state.valeursLocal[mid] = new Set());
          if (set.has(cid)) set.delete(cid);
          else set.add(cid);
          btn.classList.toggle('is-on', set.has(cid));
        });
      });
    } catch (e) {
      body.innerHTML = '<p class="jp-muted">Erreur de chargement</p>';
      global.JpToast?.fromError?.(e);
      if (btnSave) btnSave.disabled = true;
    }
  }

  async function saveValeurs() {
    const leconId = resolveValeursLeconId();
    if (!leconId || !state.valeursData?.bloc_id) return;
    const valeurs = {};
    Object.keys(state.valeursLocal).forEach((mid) => {
      const arr = [...state.valeursLocal[mid]];
      if (arr.length) valeurs[mid] = arr;
    });
    try {
      await rpc('v2_comparaison_enregistrer_valeurs', {
        p_module_id: leconId,
        p_niveau: state.valeursNiveau,
        p_valeurs: valeurs,
        p_bloc_id: state.valeursData.bloc_id,
      });
      global.JpToast?.ok?.('Valeurs enregistrées'
        + (state.valeursNiveau ? ' (★' + state.valeursNiveau + ')' : ' (base)'));
      void global.JpLogs?.action?.('comparaison_valeurs', {
        module_id: leconId,
        niveau: state.valeursNiveau,
      });
      await loadAndPaintValeurs();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  /* ——— Open / close ——— */
  function mountScopeCombo() {
    const host = state.host.querySelector('#cmpScopeCombo');
    host.innerHTML = '';
    const TA = global.JpTypeahead;
    if (!TA) {
      host.innerHTML = '<p class="jp-muted">Typeahead indisponible</p>';
      return;
    }
    TA.combo(host, {
      search: TA.localSource(state.scopeItems.map((it) => ({
        id: it.kind + ':' + it.id,
        label: it.label,
        sub: it.sub,
        data: it,
      })), { limit: 20 }),
      placeholder: 'Parcours, chapitre ou leçon…',
      ariaLabel: 'Scope comparaison',
      minChars: 0,
      onChange: (it) => {
        if (!it?.data) return;
        void (async () => {
          try {
            state.host.querySelector('#cmpBody').innerHTML = '<p class="jp-muted">Chargement…</p>';
            clearSelection();
            closeValeursPane();
            await loadScope(it.data.kind, it.data.id);
            renderTable();
          } catch (e) {
            global.JpToast?.fromError?.(e);
          }
        })();
      },
    });
  }

  async function open() {
    const host = ensureHost();
    if (state.mainEl) state.mainEl.hidden = true;
    host.hidden = false;
    host.innerHTML = shellHtml();
    state.open = true;
    document.body.classList.add('jp-comparaison-open');
    if (location.hash !== '#comparaison') {
      history.replaceState(null, '', '#comparaison');
    }

    host.querySelector('#cmpBack').addEventListener('click', close);
    host.querySelector('#cmpMerge').addEventListener('click', () => void doMerge());
    host.querySelector('#cmpDelete').addEventListener('click', () => void doDelete());
    host.querySelector('#cmpValeurs').addEventListener('click', openValeursPane);
    host.querySelector('#cmpClearSel').addEventListener('click', () => {
      clearSelection();
      host.querySelector('#cmpClearSel').hidden = true;
    });

    try {
      await loadParcoursTree();
      mountScopeCombo();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  function close() {
    if (!state.open) return;
    closeValeursPane();
    clearSelection();
    if (state.host) {
      state.host.hidden = true;
      state.host.innerHTML = '';
    }
    if (state.mainEl) state.mainEl.hidden = false;
    state.open = false;
    state.scope = null;
    state.fiches = [];
    document.body.classList.remove('jp-comparaison-open');
    if (location.hash === '#comparaison') {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function onKeydown(e) {
    if (!state.open) return;
    if (e.key === 'Escape') {
      if (state.valeursMode) closeValeursPane();
      else close();
    }
  }

  function bootFromHash() {
    document.addEventListener('keydown', onKeydown);
    if (location.hash === '#comparaison') void open();
  }

  global.JpReferentielComparaison = { open, close, bootFromHash };
})(window);
