/**
 * Admin Référentiel — vue plein page Comparaison (scope parcours/chapitre/leçon).
 * Ajouter (cellule cible) / Modifier / fusion / suppression + filtres + valeurs ★.
 * Cible Ajouter = cellule cliquée (matrice_id × champ_code).
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

  /** Colonnes tableau (inclut noms commerciaux pour Modifier / Fusionner / Supprimer). */
  function colonnesComparaison() {
    return champsActifs();
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
    fichesAll: [],
    fiches: [],
    selected: new Map(), // key `${code}:${id}` -> { code, table, id, valeur }
    activeCol: null,
    /** Cible unique Ajouter : { matriceId, champCode } — clic cellule td. */
    addTarget: null,
    molFilters: { secteur: [], classeTh: [], classePh: [] },
    filterCtrls: null,
    filtSilent: false,
    valeursMode: false,
    valeursNiveau: 2,
    valeursLeconId: null,
    valeursData: null,
    valeursLocal: {}, // matriceId -> Set(cid)
    cidByEntite: {}, // `${mid}|${entiteId}` -> connaissance_id
  };

  const FILTER_CHAMPS = [
    { key: 'secteur', code: 'secteur_therapeutique', hostId: 'cmpFiltSecteur', placeholder: 'Secteur…', short: 'Secteur' },
    { key: 'classeTh', code: 'classe_therapeutique', hostId: 'cmpFiltClasseTh', placeholder: 'Classe thérapeutique…', short: 'Classe théra' },
    { key: 'classePh', code: 'classe_pharmacologique', hostId: 'cmpFiltClassePh', placeholder: 'Classe pharma…', short: 'Classe pharma' },
  ];

  const HELP_LINES = [
    'Cliquez une cellule (y compris vide) pour cibler Ajouter (molécule × champ).',
    'Cliquez une valeur (chip) pour la sélectionner — Modifier ou Supprimer.',
    'Sélectionnez 2+ valeurs de la même colonne pour Fusionner.',
    'Ajouter : lie une entité existante (typeahead) ou un nouveau libellé à la cellule cible.',
    'Modifier : renomme l’entité (et fusionne les autres si plusieurs).',
    'Voir les valeurs : afficher / retirer les connaissances publiées par niveau ★.',
    'Filtre (icône) : restreindre les molécules par secteur ou classes.',
  ];

  const FILTER_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>';

  function selKey(code, id) {
    return code + ':' + id;
  }

  function clearSelection() {
    state.selected.clear();
    state.activeCol = null;
    paintSelectionUi();
  }

  function clearAddTarget() {
    state.addTarget = null;
    paintAddTargetUi();
    paintSelectionUi();
  }

  function setAddTarget(matriceId, champCode) {
    if (!matriceId || !champCode || !champByCode(champCode)) {
      clearAddTarget();
      return;
    }
    state.addTarget = { matriceId: String(matriceId), champCode: String(champCode) };
    paintAddTargetUi();
    paintSelectionUi();
  }

  function paintAddTargetUi() {
    if (!state.host) return;
    state.host.querySelectorAll('td.jp-cmp-cell.is-add-target').forEach((td) => {
      td.classList.remove('is-add-target');
    });
    const t = state.addTarget;
    if (!t) return;
    const td = state.host.querySelector(
      'tr[data-mid="' + t.matriceId + '"] td[data-col="' + t.champCode + '"]'
    );
    if (td) td.classList.add('is-add-target');
  }

  function paintSelectionUi() {
    if (!state.host) return;
    if (state.valeursMode) {
      paintValeursUi();
      return;
    }
    state.host.querySelectorAll('.jp-cmp-chip[data-eid]').forEach((el) => {
      const code = el.getAttribute('data-code');
      const id = el.getAttribute('data-eid');
      el.classList.toggle('is-selected', !!(id && state.selected.has(selKey(code, id))));
      el.classList.remove('is-val-on');
    });
    const n = state.selected.size;
    const colOk = state.activeCol && n >= 2;
    const oneOk = n >= 1;
    const btnMerge = state.host.querySelector('#cmpMerge');
    const btnEdit = state.host.querySelector('#cmpEdit');
    const btnDel = state.host.querySelector('#cmpDelete');
    const btnAdd = state.host.querySelector('#cmpAdd');
    if (btnMerge) btnMerge.disabled = !colOk;
    if (btnEdit) btnEdit.disabled = !oneOk;
    if (btnDel) btnDel.disabled = !oneOk;
    if (btnAdd) btnAdd.disabled = !state.addTarget;
    const clearBtn = state.host.querySelector('#cmpClearSel');
    if (clearBtn) clearBtn.hidden = n === 0 && !state.addTarget;
    paintAddTargetUi();
    paintSelInfo();
  }

  function activeFilterLabels() {
    const parts = [];
    FILTER_CHAMPS.forEach(({ key, code, short }) => {
      const ids = state.molFilters[key] || [];
      if (!ids.length) return;
      const opts = entityOptionsFromFiches(code);
      const names = ids.map((eid) => {
        const it = opts.find((o) => String(o.id) === String(eid));
        return it?.label || String(eid);
      });
      parts.push(short + ' : ' + names.join(', '));
    });
    return parts;
  }

  function molFilterCount() {
    return FILTER_CHAMPS.reduce((acc, { key }) => acc + (state.molFilters[key]?.length || 0), 0);
  }

  function syncFilterBtn() {
    const btn = state.host?.querySelector('#cmpFiltBtn');
    if (!btn) return;
    const n = molFilterCount();
    btn.classList.toggle('is-active', n > 0);
    btn.title = n ? ('Filtres actifs (' + n + ')') : 'Filtrer les molécules';
    const badge = btn.querySelector('.jp-cmp-filt-badge');
    if (badge) {
      badge.hidden = n === 0;
      badge.textContent = String(n);
    }
  }

  function paintSelInfo() {
    const info = state.host?.querySelector('#cmpSelInfo');
    if (!info) return;
    if (state.valeursMode) {
      let onCount = 0;
      Object.keys(state.valeursLocal).forEach((mid) => {
        onCount += state.valeursLocal[mid]?.size || 0;
      });
      const nivLabel = state.valeursNiveau ? ('★' + state.valeursNiveau) : 'Base';
      info.textContent = 'Mode valeurs (' + nivLabel + ') — cliquez pour afficher / retirer · '
        + onCount + ' sélectionnée(s)';
      return;
    }
    const filt = activeFilterLabels();
    const n = state.selected.size;
    const selBit = n
      ? (n + ' sélectionnée(s)'
        + (state.activeCol ? ' · ' + (champByCode(state.activeCol)?.libelle || state.activeCol) : ''))
      : '';
    let addBit = '';
    if (state.addTarget) {
      const row = (state.fichesAll || []).find((r) => String(r.id) === state.addTarget.matriceId);
      const { dci } = dciLabel(row || {});
      const champ = champByCode(state.addTarget.champCode);
      addBit = 'Ajouter → ' + (dci || 'molécule') + ' × ' + (champ?.libelle || state.addTarget.champCode);
    }
    const bits = [filt.join(' · '), selBit, addBit].filter(Boolean);
    info.textContent = bits.join(' · ');
  }

  function paintValeursUi() {
    state.host.querySelectorAll('.jp-cmp-chip[data-cid]').forEach((el) => {
      const mid = el.getAttribute('data-mid');
      const cid = el.getAttribute('data-cid');
      const on = !!(mid && cid && state.valeursLocal[mid]?.has(String(cid)));
      el.classList.toggle('is-val-on', on);
      el.classList.remove('is-selected');
    });
    paintSelInfo();
    const btnSave = state.host.querySelector('#cmpValSave');
    if (btnSave) btnSave.disabled = !state.valeursData?.bloc_id;
  }

  function syncToolbarMode() {
    if (!state.host) return;
    const bar = state.host.querySelector('#cmpValeursBar');
    if (bar) bar.hidden = !state.valeursMode;
    ['#cmpAdd', '#cmpEdit', '#cmpMerge', '#cmpDelete', '#cmpClearSel', '#cmpValeurs'].forEach((sel) => {
      const el = state.host.querySelector(sel);
      if (el) el.hidden = state.valeursMode;
    });
    state.host.classList.toggle('is-valeurs-mode', !!state.valeursMode);
  }

  function toggleEntity(code, table, id, valeur) {
    if (state.valeursMode) return;
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

  async function loadScope(kind, id, opts) {
    const keepFilters = !!(opts && opts.keepFilters);
    const savedFilt = keepFilters
      ? {
        secteur: [...(state.molFilters.secteur || [])],
        classeTh: [...(state.molFilters.classeTh || [])],
        classePh: [...(state.molFilters.classePh || [])],
      }
      : { secteur: [], classeTh: [], classePh: [] };

    state.scope = await rpc('v2_comparaison_scope', { p_kind: kind, p_id: id });
    const mids = (state.scope?.matrice_ids || []).map(String);
    state.molFilters = { secteur: [], classeTh: [], classePh: [] };
    state.filterCtrls = null;
    if (!mids.length) {
      state.fichesAll = [];
      state.fiches = [];
      syncFilterBtn();
      paintSelInfo();
      return;
    }
    const data = await rpc('v2_comparaison_fiches', { p_matrice_ids: mids });
    state.fichesAll = Array.isArray(data) ? data : [];
    if (keepFilters) state.molFilters = savedFilt;
    applyMolFilters();
    syncFilterBtn();
    paintSelInfo();
  }

  function entityOptionsFromFiches(code) {
    const champ = champByCode(code);
    const map = new Map();
    (state.fichesAll || []).forEach((row) => {
      entitiesOfRow(row, champ).forEach((e) => {
        if (e.id && e.valeur) map.set(String(e.id), { id: e.id, label: e.valeur });
      });
    });
    return [...map.values()].sort((a, b) =>
      String(a.label).localeCompare(String(b.label), 'fr', { sensitivity: 'base' }));
  }

  function ficheMatchesFilters(row) {
    return FILTER_CHAMPS.every(({ key, code }) => {
      const ids = state.molFilters[key] || [];
      if (!ids.length) return true;
      const set = new Set(ids.map(String));
      return entitiesOfRow(row, champByCode(code)).some((e) => e.id && set.has(String(e.id)));
    });
  }

  function applyMolFilters() {
    state.fiches = (state.fichesAll || []).filter(ficheMatchesFilters);
  }

  function openFilterModal() {
    if (!state.scope) {
      global.JpToast?.warn?.('Choisissez d’abord un scope');
      return;
    }
    if (!state.fichesAll.length) {
      global.JpToast?.warn?.('Aucune molécule à filtrer dans ce scope');
      return;
    }
    const TA = global.JpTypeahead;
    if (!TA) {
      global.JpToast?.warn?.('Typeahead indisponible');
      return;
    }

    const draft = {
      secteur: [...(state.molFilters.secteur || [])],
      classeTh: [...(state.molFilters.classeTh || [])],
      classePh: [...(state.molFilters.classePh || [])],
    };

    const wrap = document.createElement('div');
    wrap.className = 'jp-comparaison-filters-modal';
    wrap.innerHTML = '<p class="jp-muted">Restreindre les molécules affichées par catégorie.</p>'
      + FILTER_CHAMPS.map(({ hostId, short }) => (
        '<label class="jp-cmp-filt-field"><span>' + esc(short) + '</span>'
        + '<div id="' + hostId + '" class="jp-comparaison-filter"></div></label>'
      )).join('')
      + '<button type="button" class="jp-btn jp-btn-ghost jp-btn-sm" id="cmpFiltClear">Effacer filtres</button>';

    const ctrls = {};
    FILTER_CHAMPS.forEach(({ key, code, hostId, placeholder }) => {
      const hostEl = wrap.querySelector('#' + hostId);
      if (!hostEl) return;
      const items = entityOptionsFromFiches(code);
      ctrls[key] = TA.chips(hostEl, {
        search: TA.localSource(items, { limit: 20 }),
        placeholder,
        ariaLabel: placeholder,
        minChars: 0,
        onChange: (sel) => {
          draft[key] = (sel || []).map((it) => it.id);
        },
      });
      const ids = draft[key] || [];
      ids.forEach((eid) => {
        const it = items.find((o) => String(o.id) === String(eid));
        if (it) ctrls[key].add(it);
      });
    });

    wrap.querySelector('#cmpFiltClear')?.addEventListener('click', () => {
      draft.secteur = [];
      draft.classeTh = [];
      draft.classePh = [];
      Object.values(ctrls).forEach((c) => c?.clear?.());
    });

    global.JpModal.open({
      title: 'Filtrer les molécules',
      body: wrap,
      confirmLabel: 'Appliquer',
      cancelLabel: 'Fermer',
      panelClass: 'jp-modal-wide',
      onConfirm: () => {
        state.molFilters = {
          secteur: [...draft.secteur],
          classeTh: [...draft.classeTh],
          classePh: [...draft.classePh],
        };
        applyMolFilters();
        syncFilterBtn();
        paintSelInfo();
        renderTable();
      },
    });
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
      + '<div class="jp-comparaison-head-actions">'
      + '<button type="button" class="jp-icon-btn jp-cmp-filt-btn" id="cmpFiltBtn" '
      + 'title="Filtrer les molécules" aria-label="Filtrer les molécules">'
      + FILTER_ICON_SVG
      + '<span class="jp-cmp-filt-badge" hidden>0</span>'
      + '</button>'
      + '<span id="cmpHelpHost"></span>'
      + '</div>'
      + '<span class="jp-muted" id="cmpCount"></span>'
      + '</header>'
      + '<div class="jp-comparaison-toolbar">'
      + '<span class="jp-muted" id="cmpSelInfo"></span>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="cmpAdd" disabled title="Cliquez d’abord une cellule">Ajouter</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="cmpEdit" disabled>Modifier</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="cmpMerge" disabled>Fusionner</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="cmpDelete" disabled>Supprimer l’entité</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="cmpValeurs">Voir les valeurs</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="cmpClearSel" hidden>Effacer sélection</button>'
      + '</div>'
      + '<div class="jp-comparaison-valeurs-bar" id="cmpValeursBar" hidden>'
      + '<span class="jp-comparaison-filters-label">Valeurs leçon</span>'
      + '<label class="jp-cmp-val-inline">Leçon'
      + '<select id="cmpValLecon"></select></label>'
      + '<label class="jp-cmp-val-inline">Niveau'
      + '<select id="cmpValNiveau">'
      + '<option value="0">Base</option>'
      + '<option value="1">★1</option><option value="2" selected>★2</option>'
      + '<option value="3">★3</option><option value="4">★4</option><option value="5">★5</option>'
      + '</select></label>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="cmpValSave" disabled>Enregistrer</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="cmpValQuit">Quitter</button>'
      + '</div>'
      + '<div class="jp-comparaison-body" id="cmpBody">'
      + '<p class="jp-muted">Choisissez un parcours, un chapitre ou une leçon.</p>'
      + '</div>'
      + '</div>';
  }

  function fichesForTable() {
    let rows = state.fiches;
    if (state.valeursMode && state.valeursData?.matrice_ids) {
      const allow = new Set((state.valeursData.matrice_ids || []).map(String));
      if (allow.size) rows = rows.filter((r) => allow.has(String(r.id)));
    }
    return rows;
  }

  /** Conserve scroll du tableau lors d’un re-paint (Ajouter / Modifier / Fusion / Supprimer). */
  function captureTableScroll() {
    const wrap = state.host?.querySelector('.jp-comparaison-table-wrap');
    if (!wrap) return null;
    return { top: wrap.scrollTop, left: wrap.scrollLeft };
  }

  function restoreTableScroll(saved) {
    if (!saved) return;
    const apply = () => {
      const wrap = state.host?.querySelector('.jp-comparaison-table-wrap');
      if (!wrap) return;
      wrap.scrollTop = saved.top;
      wrap.scrollLeft = saved.left;
    };
    requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
  }

  function renderTable() {
    const scroll = captureTableScroll();
    const body = state.host.querySelector('#cmpBody');
    const count = state.host.querySelector('#cmpCount');
    if (!state.scope) {
      body.innerHTML = '<p class="jp-muted">Choisissez un parcours, un chapitre ou une leçon.</p>';
      if (count) count.textContent = '';
      syncFilterBtn();
      paintSelInfo();
      return;
    }
    const cols = colonnesComparaison();
    const rows = fichesForTable();
    const nAll = state.fichesAll.length;
    const nFilt = state.fiches.length;
    const n = rows.length;
    if (count) {
      let label = (nFilt !== nAll ? nFilt + ' / ' + nAll : String(nFilt)) + ' molécule(s)';
      if (state.valeursMode) label += ' · valeurs ' + (state.valeursNiveau ? '★' + state.valeursNiveau : 'base');
      label += ' · ' + (state.scope.label || '');
      count.textContent = label;
    }
    if (!nAll) {
      body.innerHTML = '<p class="jp-muted">Aucune molécule dans ce scope (pubs ou blocs molécule).</p>';
      return;
    }
    if (!nFilt) {
      body.innerHTML = '<p class="jp-muted">Aucune molécule ne correspond aux filtres catégorie.</p>';
      return;
    }
    if (state.valeursMode && !n) {
      body.innerHTML = '<p class="jp-muted">Aucune molécule du bloc pour ce niveau. '
        + 'Ajoutez des molécules dans Modif parcours (Base / ★).</p>';
      return;
    }

    let html = '<div class="jp-comparaison-table-wrap"><table class="jp-comparaison-table">'
      + '<thead><tr><th class="jp-cmp-sticky">Molécule</th>';
    cols.forEach((c) => {
      html += '<th data-col="' + esc(c.code) + '">' + esc(c.libelle) + '</th>';
    });
    html += '</tr></thead><tbody>';

    rows.forEach((row) => {
      const mid = String(row.id);
      const { dci, noms } = dciLabel(row);
      html += '<tr data-mid="' + esc(mid) + '">'
        + '<th class="jp-cmp-sticky" scope="row">'
        + '<strong>' + esc(dci) + '</strong>'
        + (noms ? '<span class="jp-muted">' + esc(noms) + '</span>' : '')
        + '</th>';
      cols.forEach((c) => {
        const ents = entitiesOfRow(row, c);
        html += '<td class="jp-cmp-cell" data-col="' + esc(c.code) + '" data-mid="' + esc(mid)
          + '" title="Clic : cibler pour Ajouter">';
        if (!ents.length) {
          html += '<span class="jp-cmp-empty">—</span>';
        } else {
          ents.forEach((e) => {
            if (!e.id) {
              html += '<span class="jp-cmp-chip jp-cmp-chip-static">' + esc(e.valeur) + '</span>';
              return;
            }
            const cid = state.valeursMode
              ? state.cidByEntite[mid + '|' + e.id]
              : null;
            html += '<button type="button" class="jp-cmp-chip" data-code="' + esc(c.code)
              + '" data-table="' + esc(c.table) + '" data-eid="' + esc(e.id)
              + '" data-mid="' + esc(mid) + '"'
              + (cid ? ' data-cid="' + esc(cid) + '"' : '')
              + ' title="' + (state.valeursMode ? 'Afficher / retirer' : 'Sélectionner') + '">'
              + esc(e.valeur) + '</button>';
          });
        }
        html += '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    body.innerHTML = html;

    if (state.valeursMode) {
      body.querySelectorAll('.jp-cmp-chip[data-cid]').forEach((btn) => {
        btn.addEventListener('click', () => {
          toggleValeurChip(btn.getAttribute('data-mid'), btn.getAttribute('data-cid'));
        });
      });
      body.querySelectorAll('.jp-cmp-chip[data-eid]:not([data-cid])').forEach((btn) => {
        btn.classList.add('jp-cmp-chip-disabled');
        btn.title = 'Pas de connaissance liée';
        btn.addEventListener('click', () => {
          global.JpToast?.warn?.('Impossible de lier cette valeur (pas de connaissance)');
        });
      });
    } else {
      body.querySelectorAll('.jp-cmp-chip[data-eid]').forEach((btn) => {
        btn.addEventListener('click', () => {
          toggleEntity(
            btn.getAttribute('data-code'),
            btn.getAttribute('data-table'),
            btn.getAttribute('data-eid'),
            btn.textContent
          );
        });
      });
      // Cible Ajouter = cellule cliquée (molécule × champ), y compris vide
      body.querySelectorAll('td.jp-cmp-cell').forEach((td) => {
        td.addEventListener('click', () => {
          setAddTarget(td.getAttribute('data-mid'), td.getAttribute('data-col'));
        });
      });
    }
    paintSelectionUi();
    restoreTableScroll(scroll);
  }

  function toggleValeurChip(mid, cid) {
    if (!mid || !cid) return;
    const set = state.valeursLocal[mid] || (state.valeursLocal[mid] = new Set());
    const key = String(cid);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    paintValeursUi();
  }

  /* ——— Ajouter liaison (cellule cible) ——— */
  async function refreshFicheLocal(matriceId) {
    const mid = String(matriceId);
    const data = await rpc('v2_comparaison_fiches', { p_matrice_ids: [mid] });
    const row = Array.isArray(data) ? data[0] : null;
    if (!row) return;
    const replaceIn = (arr) => {
      const i = arr.findIndex((r) => String(r.id) === mid);
      if (i >= 0) arr[i] = row;
      else arr.push(row);
    };
    replaceIn(state.fichesAll);
    applyMolFilters();
  }

  function doAdd() {
    if (state.valeursMode) return;
    const target = state.addTarget;
    if (!target) {
      global.JpToast?.warn?.('Cliquez d’abord une cellule (molécule × champ)');
      return;
    }
    const champ = champByCode(target.champCode);
    if (!champ) return;
    const row = (state.fichesAll || []).find((r) => String(r.id) === target.matriceId);
    const { dci } = dciLabel(row || {});
    const existing = entitiesOfRow(row, champ);
    const isSingular = champ.card === 1;
    const TA = global.JpTypeahead;
    if (!TA?.entiteSource) {
      global.JpToast?.warn?.('Typeahead indisponible');
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'jp-cmp-edit';
    let hint = 'Choisir une valeur existante ou saisir un nouveau libellé.';
    if (isSingular && existing.length) {
      hint = 'Champ singulier déjà renseigné (« ' + esc(existing[0].valeur)
        + ' ») — la nouvelle valeur le remplacera.';
    }
    wrap.innerHTML = '<p class="jp-muted">' + esc(dci || 'Molécule') + ' · '
      + esc(champ.libelle || champ.code) + '</p>'
      + '<p>' + hint + '</p>'
      + '<label class="jp-cmp-edit-field">Entité'
      + '<div id="cmpAddTa" class="jp-cmp-add-ta"></div></label>'
      + '<p class="jp-muted jp-cmp-add-hint">Suggestion = entité en base ; texte libre = création si besoin.</p>';

    let taCtrl = null;
    const hostTa = wrap.querySelector('#cmpAddTa');
    taCtrl = TA.combo(hostTa, {
      search: TA.entiteSource(champ.table, { limit: 14 }),
      placeholder: 'Rechercher ou saisir…',
      ariaLabel: champ.libelle || 'Entité',
      minChars: 0,
    });

    global.JpModal.open({
      title: 'Ajouter — ' + (champ.libelle || champ.code),
      body: wrap,
      confirmLabel: isSingular && existing.length ? 'Remplacer' : 'Ajouter',
      panelClass: 'jp-modal-wide',
      onConfirm: async () => {
        const picked = taCtrl?.getItem?.();
        const typed = String(taCtrl?.input?.value || '').trim();
        const entiteId = picked?.id || null;
        const valeur = picked?.label || typed;
        if (!entiteId && !valeur) {
          global.JpToast?.warn?.('Choisissez ou saisissez une valeur');
          return false;
        }
        try {
          const res = await rpc('v2_comparaison_ajouter_liaison', {
            p_matrice_id: target.matriceId,
            p_champ_code: champ.code,
            p_entite_id: entiteId || null,
            p_valeur: entiteId ? null : valeur,
          });
          if (res?.already) {
            global.JpToast?.warn?.('Déjà liée à cette fiche');
          } else {
            global.JpToast?.ok?.(
              res?.created
                ? 'Entité créée et liée'
                : (isSingular && existing.length ? 'Valeur remplacée' : 'Liaison ajoutée')
            );
          }
          void global.JpLogs?.action?.('comparaison_ajouter', {
            matrice_id: target.matriceId,
            champ: champ.code,
            entite_id: res?.entite_id || entiteId,
            created: !!res?.created,
          });
          await refreshFicheLocal(target.matriceId);
          renderTable();
        } catch (e) {
          global.JpToast?.fromError?.(e);
          return false;
        }
        return undefined;
      },
    });
    setTimeout(() => taCtrl?.focus?.(), 50);
  }

  /* ——— Modifier / Fusion / suppression ——— */
  async function doEdit() {
    if (!state.selected.size) return;
    const items = [...state.selected.values()];
    if (items.some((x) => x.code !== items[0].code)) {
      global.JpToast?.warn?.('Sélectionnez des valeurs d’une seule colonne');
      return;
    }
    const champ = champByCode(items[0].code);
    if (!champ) return;
    const multi = items.length > 1;
    const wrap = document.createElement('div');
    wrap.className = 'jp-cmp-edit';
    let html = '';
    if (multi) {
      html += '<p>Entités sélectionnées — choisissez celle à conserver ; les autres seront fusionnées. '
        + 'Le texte saisi devient la valeur finale.</p>'
        + '<div class="jp-cmp-keep-list" role="radiogroup">'
        + items.map((it, i) => (
          '<label class="jp-cmp-keep-opt">'
          + '<input type="radio" name="cmpEditKeep" value="' + esc(it.id) + '"'
          + (i === 0 ? ' checked' : '') + '>'
          + '<span>' + esc(it.valeur) + '</span></label>'
        )).join('')
        + '</div>';
    } else {
      html += '<p>Modifier le libellé de « ' + esc(items[0].valeur) + ' ».</p>';
    }
    html += '<label class="jp-cmp-edit-field">Valeur finale'
      + '<input type="text" id="cmpEditVal" class="jp-cmp-edit-input" autocomplete="off" '
      + 'value="' + esc(items[0].valeur) + '"></label>';
    wrap.innerHTML = html;

    const syncValFromKeep = () => {
      const keepId = wrap.querySelector('input[name=cmpEditKeep]:checked')?.value;
      const it = items.find((x) => x.id === keepId) || items[0];
      const input = wrap.querySelector('#cmpEditVal');
      if (input && document.activeElement !== input) input.value = it.valeur;
    };
    wrap.querySelectorAll('input[name=cmpEditKeep]').forEach((r) => {
      r.addEventListener('change', syncValFromKeep);
    });

    global.JpModal.open({
      title: (multi ? 'Modifier et fusionner — ' : 'Modifier — ') + (champ.libelle || champ.code),
      body: wrap,
      confirmLabel: multi ? 'Modifier et fusionner' : 'Enregistrer',
      onConfirm: async () => {
        const keep = multi
          ? (wrap.querySelector('input[name=cmpEditKeep]:checked')?.value || items[0].id)
          : items[0].id;
        const nouvelle = String(wrap.querySelector('#cmpEditVal')?.value || '').trim();
        if (!nouvelle) {
          global.JpToast?.warn?.('Saisissez une valeur');
          return false;
        }
        const drops = items.map((x) => x.id).filter((id) => id !== keep);
        const unchanged = !drops.length && nouvelle === items.find((x) => x.id === keep)?.valeur;
        if (unchanged) {
          global.JpToast?.warn?.('Aucune modification');
          return false;
        }
        try {
          await rpc('v2_modifier_entites', {
            p_table_name: champ.table,
            p_id_keep: keep,
            p_id_drops: drops,
            p_nouvelle_valeur: nouvelle,
          });
          global.JpToast?.ok?.(
            drops.length
              ? 'Modifié et fusionné (' + drops.length + ')'
              : 'Libellé mis à jour'
          );
          void global.JpLogs?.action?.('comparaison_modifier', {
            table: champ.table, keep, drops, valeur: nouvelle,
          });
          clearSelection();
          if (state.scope) await loadScope(state.scope.kind, state.scope.id, { keepFilters: true });
          renderTable();
        } catch (e) {
          global.JpToast?.fromError?.(e);
          return false;
        }
        return undefined;
      },
    });
    setTimeout(() => wrap.querySelector('#cmpEditVal')?.focus(), 50);
  }

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
          if (state.scope) await loadScope(state.scope.kind, state.scope.id, { keepFilters: true });
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
          if (state.scope) await loadScope(state.scope.kind, state.scope.id, { keepFilters: true });
          renderTable();
        } catch (e) {
          global.JpToast?.fromError?.(e);
          return false;
        }
        return undefined;
      },
    });
  }

  /* ——— Valeurs ★ (sélection directe dans le tableau) ——— */
  function resolveValeursLeconId() {
    if (state.scope?.kind === 'lecon') return state.scope.id;
    return state.valeursLeconId;
  }

  function fillValeursBar() {
    const bar = state.host.querySelector('#cmpValeursBar');
    if (!bar) return;
    const leconSel = bar.querySelector('#cmpValLecon');
    const nivSel = bar.querySelector('#cmpValNiveau');
    const lecons = state.scope?.lecons || [];
    const needLecon = state.scope?.kind !== 'lecon';
    const leconWrap = leconSel?.closest('label');
    if (leconWrap) leconWrap.hidden = !needLecon;
    if (leconSel) {
      const cur = resolveValeursLeconId();
      leconSel.innerHTML = lecons.map((l) => (
        '<option value="' + esc(l.id) + '"'
        + (String(l.id) === String(cur) ? ' selected' : '') + '>'
        + esc(l.titre) + '</option>'
      )).join('');
    }
    if (nivSel) nivSel.value = String(state.valeursNiveau || 0);
  }

  function openValeursMode() {
    if (!state.scope) {
      global.JpToast?.warn?.('Choisissez d’abord un scope');
      return;
    }
    clearSelection();
    clearAddTarget();
    if (state.scope.kind === 'lecon') {
      state.valeursLeconId = state.scope.id;
    } else if (!state.valeursLeconId) {
      const first = (state.scope.lecons || [])[0];
      state.valeursLeconId = first?.id || null;
    }
    if (!resolveValeursLeconId()) {
      global.JpToast?.warn?.('Aucune leçon cible dans ce scope');
      return;
    }
    state.valeursMode = true;
    fillValeursBar();
    syncToolbarMode();
    void loadValeursIntoTable();
  }

  function closeValeursMode() {
    state.valeursMode = false;
    state.valeursData = null;
    state.valeursLocal = {};
    state.cidByEntite = {};
    syncToolbarMode();
    renderTable();
  }

  async function loadValeursIntoTable() {
    const leconId = resolveValeursLeconId();
    const body = state.host.querySelector('#cmpBody');
    if (!leconId) {
      global.JpToast?.warn?.('Choisissez une leçon cible');
      return;
    }
    body.innerHTML = '<p class="jp-muted">Chargement des valeurs…</p>';
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
        const btnSave = state.host.querySelector('#cmpValSave');
        if (btnSave) btnSave.disabled = true;
        return;
      }

      state.valeursLocal = {};
      const sel = data.selected || {};
      Object.keys(sel).forEach((mid) => {
        const arr = Array.isArray(sel[mid]) ? sel[mid] : [];
        state.valeursLocal[String(mid)] = new Set(arr.map(String));
      });

      const mids = (data.matrice_ids || []).map(String);
      let available = Array.isArray(data.available) ? data.available.slice() : [];
      available.forEach((r) => {
        if (!r.matrice_id && r.matriceId) r.matrice_id = r.matriceId;
      });
      if (!available.length && mids.length) {
        for (const mid of mids) {
          const rows = await rpc('v2_lister_connaissances_matrice', {
            p_matrice_id: mid,
            p_module_id: leconId,
          });
          (Array.isArray(rows) ? rows : []).forEach((r) => {
            available.push(Object.assign({ matrice_id: mid }, r));
          });
        }
      }

      state.cidByEntite = {};
      available.forEach((r) => {
        const mid = String(r.matrice_id || '');
        const eid = r.entite_id ? String(r.entite_id) : '';
        const cid = r.connaissance_id ? String(r.connaissance_id) : '';
        if (!mid || !eid || !cid) return;
        // DCI déjà en colonne identité sticky ; noms commerciaux restent sélectionnables ★
        if (r.champ_code === 'dci') return;
        state.cidByEntite[mid + '|' + eid] = cid;
      });

      renderTable();
    } catch (e) {
      body.innerHTML = '<p class="jp-muted">Erreur de chargement</p>';
      global.JpToast?.fromError?.(e);
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
      await loadValeursIntoTable();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  function wireValeursBar() {
    const bar = state.host.querySelector('#cmpValeursBar');
    if (!bar || bar.dataset.wired === '1') return;
    bar.dataset.wired = '1';
    bar.querySelector('#cmpValNiveau')?.addEventListener('change', (e) => {
      state.valeursNiveau = Number(e.target.value) || 0;
      if (state.valeursMode) void loadValeursIntoTable();
    });
    bar.querySelector('#cmpValLecon')?.addEventListener('change', (e) => {
      state.valeursLeconId = e.target.value || null;
      if (state.valeursMode) void loadValeursIntoTable();
    });
    bar.querySelector('#cmpValSave')?.addEventListener('click', () => void saveValeurs());
    bar.querySelector('#cmpValQuit')?.addEventListener('click', closeValeursMode);
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
            clearAddTarget();
            if (state.valeursMode) closeValeursMode();
            await loadScope(it.data.kind, it.data.id);
            renderTable();
          } catch (e) {
            global.JpToast?.fromError?.(e);
          }
        })();
      },
    });
  }

  function closeSiblingSurfaces() {
    try { global.JpReferentielEntites?.close?.(); } catch (_) { /* ignore */ }
    try { global.JpReferentielGroupe?.close?.(); } catch (_) { /* ignore */ }
  }

  async function open() {
    closeSiblingSurfaces();
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
    host.querySelector('#cmpFiltBtn')?.addEventListener('click', openFilterModal);
    const helpHost = host.querySelector('#cmpHelpHost');
    if (helpHost && global.JpModal?.helpButton) {
      helpHost.appendChild(global.JpModal.helpButton('Comparaison', HELP_LINES));
    }
    host.querySelector('#cmpAdd').addEventListener('click', () => void doAdd());
    host.querySelector('#cmpEdit').addEventListener('click', () => void doEdit());
    host.querySelector('#cmpMerge').addEventListener('click', () => void doMerge());
    host.querySelector('#cmpDelete').addEventListener('click', () => void doDelete());
    host.querySelector('#cmpValeurs').addEventListener('click', openValeursMode);
    host.querySelector('#cmpClearSel').addEventListener('click', () => {
      clearSelection();
      clearAddTarget();
    });
    wireValeursBar();
    syncToolbarMode();
    syncFilterBtn();

    try {
      await loadParcoursTree();
      mountScopeCombo();
    } catch (e) {
      global.JpToast?.fromError?.(e);
    }
  }

  function close() {
    if (!state.open) return;
    if (state.valeursMode) closeValeursMode();
    clearSelection();
    clearAddTarget();
    if (state.host) {
      state.host.hidden = true;
      state.host.innerHTML = '';
    }
    if (state.mainEl) state.mainEl.hidden = false;
    state.open = false;
    state.scope = null;
    state.fichesAll = [];
    state.fiches = [];
    state.molFilters = { secteur: [], classeTh: [], classePh: [] };
    state.filterCtrls = null;
    document.body.classList.remove('jp-comparaison-open');
    if (location.hash === '#comparaison') {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function onKeydown(e) {
    if (!state.open) return;
    if (e.key !== 'Escape') return;
    // Laisser JpModal gérer Escape si une modale est ouverte
    if (document.getElementById('jp-modal-root')?.querySelector('.jp-modal-backdrop')) return;
    if (state.valeursMode) closeValeursMode();
    else close();
  }

  function bootFromHash() {
    document.addEventListener('keydown', onKeydown);
    if (location.hash === '#comparaison') void open();
  }

  global.JpReferentielComparaison = { open, close, bootFromHash };
})(window);
