/**
 * Admin Référentiel — Vérifier les éléments (CRUD + fusion d’entités).
 * Réutilise JpEntites + RPC v2_modifier_entites / v2_fusionner_entites / v2_supprimer_entite.
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

  function tablesActives() {
    return (global.JpConstants?.ENTITY_TABLES || []).filter((t) => t.actif !== false);
  }

  function champOfTable(table) {
    return (global.JpConstants?.CHAMP_CODES || []).find((c) => c.table === table);
  }

  const state = {
    open: false,
    host: null,
    mainEl: null,
    table: '',
    q: '',
    showInactive: false,
    rows: [],
    selected: new Set(),
    loading: false,
  };

  const HELP_LINES = [
    'Choisissez une table d’entités (indications, DCI, classes…).',
    'Recherche : filtre sur libellé / valeur normalisée.',
    'Renommer : modifie le libellé pour toutes les fiches liées.',
    'Fusionner : sélectionnez 2+ lignes, choisissez celle à garder ; les autres sont réassignées puis désactivées.',
    'Supprimer : retire les liaisons matrice et désactive l’entité (soft-delete).',
    'Attention DCI : fusionner deux DCI peut entrer en conflit si chaque DCI a déjà une fiche active.',
  ];

  function ensureHost() {
    if (state.host) return state.host;
    state.mainEl = document.querySelector('main.jp-page');
    const host = document.createElement('div');
    host.id = 'refEntitesView';
    host.className = 'jp-comparaison jp-ref-entites';
    host.hidden = true;
    (state.mainEl?.parentNode || document.body).appendChild(host);
    state.host = host;
    return host;
  }

  function shellHtml() {
    const opts = tablesActives().map((t) => (
      '<option value="' + esc(t.table) + '"'
      + (t.table === state.table ? ' selected' : '') + '>'
      + esc(t.libelle) + '</option>'
    )).join('');
    return '<div class="jp-comparaison-inner">'
      + '<header class="jp-comparaison-head">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entBack">← Retour référentiel</button>'
      + '<h1 class="jp-title">Vérifier les éléments</h1>'
      + '<label class="jp-ref-entites-table">Table'
      + '<select id="entTable" aria-label="Table d’entités">' + opts + '</select></label>'
      + '<div class="jp-comparaison-head-actions"><span id="entHelpHost"></span></div>'
      + '</header>'
      + '<div class="jp-comparaison-toolbar">'
      + '<input type="search" id="entQ" class="jp-ref-entites-search" placeholder="Filtrer…" '
      + 'aria-label="Filtrer les entités" autocomplete="off" value="' + esc(state.q) + '">'
      + '<label class="jp-ref-entites-check"><input type="checkbox" id="entInactive"'
      + (state.showInactive ? ' checked' : '') + '> Inclure inactifs</label>'
      + '<span class="jp-muted" id="entSelInfo"></span>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entCreate">Créer</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="entRename" disabled>Renommer</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entMerge" disabled>Fusionner</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entDelete" disabled>Supprimer</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entClearSel" hidden>Effacer sélection</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entRefresh">Actualiser</button>'
      + '</div>'
      + '<div class="jp-comparaison-body" id="entBody"><p class="jp-muted">Chargement…</p></div>'
      + '</div>';
  }

  function paintSelInfo() {
    const n = state.selected.size;
    const info = state.host?.querySelector('#entSelInfo');
    if (info) {
      info.textContent = n
        ? (n + ' sélectionnée(s)')
        : (state.rows.length + ' élément(s)');
    }
    const btnRename = state.host?.querySelector('#entRename');
    const btnMerge = state.host?.querySelector('#entMerge');
    const btnDel = state.host?.querySelector('#entDelete');
    const btnClear = state.host?.querySelector('#entClearSel');
    if (btnRename) btnRename.disabled = n !== 1;
    if (btnMerge) btnMerge.disabled = n < 2;
    if (btnDel) btnDel.disabled = n < 1;
    if (btnClear) btnClear.hidden = n === 0;
  }

  function clearSelection() {
    state.selected.clear();
    state.host?.querySelectorAll('input[data-ent-id]').forEach((inp) => {
      inp.checked = false;
    });
    paintSelInfo();
  }

  function selectedItems() {
    return state.rows.filter((r) => state.selected.has(String(r.id)));
  }

  async function loadRows() {
    if (!state.table) return;
    state.loading = true;
    const body = state.host?.querySelector('#entBody');
    if (body) body.innerHTML = '<p class="jp-muted">Chargement…</p>';
    try {
      const opts = {
        q: state.q || undefined,
        limit: 800,
      };
      if (!state.showInactive) opts.actif = true;
      const rows = await global.JpEntites.list(state.table, opts);
      state.rows = rows || [];
      // Nettoyer sélection orpheline
      const ids = new Set(state.rows.map((r) => String(r.id)));
      [...state.selected].forEach((id) => {
        if (!ids.has(id)) state.selected.delete(id);
      });
      renderList();
    } catch (e) {
      if (body) body.innerHTML = '<p class="jp-muted">Erreur de chargement</p>';
      global.JpToast?.fromError?.(e);
    } finally {
      state.loading = false;
    }
  }

  function renderList() {
    const body = state.host?.querySelector('#entBody');
    if (!body) return;
    if (!state.rows.length) {
      body.innerHTML = '<p class="jp-muted">Aucun élément'
        + (state.q ? ' pour « ' + esc(state.q) + ' »' : '') + '.</p>';
      paintSelInfo();
      return;
    }
    let html = '<div class="jp-comparaison-table-wrap"><table class="jp-comparaison-table jp-ref-entites-table-list">'
      + '<thead><tr>'
      + '<th class="jp-ref-entites-checkcol"><span class="jp-sr-only">Sélection</span></th>'
      + '<th>Libellé</th>'
      + '<th>Norme</th>'
      + '<th>Statut</th>'
      + '<th></th>'
      + '</tr></thead><tbody>';
    state.rows.forEach((r) => {
      const id = String(r.id);
      const on = state.selected.has(id);
      html += '<tr data-id="' + esc(id) + '"' + (r.actif ? '' : ' class="is-inactive"') + '>'
        + '<td class="jp-ref-entites-checkcol">'
        + '<input type="checkbox" data-ent-id="' + esc(id) + '"' + (on ? ' checked' : '')
        + ' aria-label="Sélectionner ' + esc(r.valeur) + '"></td>'
        + '<td><strong>' + esc(r.valeur || '—') + '</strong></td>'
        + '<td class="jp-muted">' + esc(r.valeur_norm || '') + '</td>'
        + '<td>' + (r.actif
          ? '<span class="jp-ref-entites-badge">actif</span>'
          : '<span class="jp-ref-entites-badge is-off">inactif</span>') + '</td>'
        + '<td class="jp-ref-entites-row-actions">'
        + '<button type="button" class="jp-link-btn" data-ent-rename="' + esc(id) + '">Renommer</button>'
        + (r.actif
          ? ' · <button type="button" class="jp-link-btn" data-ent-del="' + esc(id) + '">Supprimer</button>'
          : '')
        + '</td></tr>';
    });
    html += '</tbody></table></div>';
    body.innerHTML = html;

    body.querySelectorAll('input[data-ent-id]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const id = inp.getAttribute('data-ent-id');
        if (inp.checked) state.selected.add(id);
        else state.selected.delete(id);
        paintSelInfo();
      });
    });
    body.querySelectorAll('[data-ent-rename]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-ent-rename');
        state.selected.clear();
        state.selected.add(id);
        body.querySelectorAll('input[data-ent-id]').forEach((inp) => {
          inp.checked = inp.getAttribute('data-ent-id') === id;
        });
        paintSelInfo();
        void doRename();
      });
    });
    body.querySelectorAll('[data-ent-del]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-ent-del');
        state.selected.clear();
        state.selected.add(id);
        body.querySelectorAll('input[data-ent-id]').forEach((inp) => {
          inp.checked = inp.getAttribute('data-ent-id') === id;
        });
        paintSelInfo();
        void doDelete();
      });
    });
    paintSelInfo();
  }

  async function doCreate() {
    if (!state.table) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = '<label class="jp-cmp-edit-field">Nouveau libellé'
      + '<input type="text" id="entNewVal" class="jp-cmp-edit-input" autocomplete="off"></label>';
    global.JpModal.open({
      title: 'Créer — ' + (champOfTable(state.table)?.libelle || state.table),
      body: wrap,
      confirmLabel: 'Créer',
      onConfirm: async () => {
        const val = String(wrap.querySelector('#entNewVal')?.value || '').trim();
        if (!val) {
          global.JpToast?.warn?.('Saisissez un libellé');
          return false;
        }
        try {
          const existing = await global.JpEntites.findActiveByValeur(state.table, val);
          if (existing) {
            global.JpToast?.warn?.('Existe déjà : « ' + existing.valeur + ' »');
            return false;
          }
          await global.JpEntites.create(state.table, { valeur: val });
          global.JpToast?.ok?.('Élément créé');
          void global.JpLogs?.action?.('ref_entites_create', { table: state.table, valeur: val });
          await loadRows();
        } catch (e) {
          global.JpToast?.fromError?.(e);
          return false;
        }
        return undefined;
      },
    });
    setTimeout(() => wrap.querySelector('#entNewVal')?.focus(), 50);
  }

  async function doRename() {
    const items = selectedItems();
    if (items.length !== 1) {
      global.JpToast?.warn?.('Sélectionnez exactement un élément');
      return;
    }
    const it = items[0];
    const wrap = document.createElement('div');
    wrap.className = 'jp-cmp-edit';
    wrap.innerHTML = '<p>Modifier le libellé de « ' + esc(it.valeur) + ' ». '
      + 'Toutes les fiches liées verront le nouveau texte.</p>'
      + '<label class="jp-cmp-edit-field">Valeur'
      + '<input type="text" id="entRenameVal" class="jp-cmp-edit-input" autocomplete="off" '
      + 'value="' + esc(it.valeur) + '"></label>';
    global.JpModal.open({
      title: 'Renommer — ' + (champOfTable(state.table)?.libelle || state.table),
      body: wrap,
      confirmLabel: 'Enregistrer',
      onConfirm: async () => {
        const nouvelle = String(wrap.querySelector('#entRenameVal')?.value || '').trim();
        if (!nouvelle) {
          global.JpToast?.warn?.('Saisissez une valeur');
          return false;
        }
        if (nouvelle === it.valeur) {
          global.JpToast?.warn?.('Aucune modification');
          return false;
        }
        try {
          await rpc('v2_modifier_entites', {
            p_table_name: state.table,
            p_id_keep: it.id,
            p_id_drops: [],
            p_nouvelle_valeur: nouvelle,
          });
          global.JpToast?.ok?.('Libellé mis à jour');
          void global.JpLogs?.action?.('ref_entites_rename', {
            table: state.table, id: it.id, valeur: nouvelle,
          });
          clearSelection();
          await loadRows();
        } catch (e) {
          global.JpToast?.fromError?.(e);
          return false;
        }
        return undefined;
      },
    });
    setTimeout(() => wrap.querySelector('#entRenameVal')?.focus(), 50);
  }

  async function doMerge() {
    const items = selectedItems().filter((r) => r.actif !== false);
    if (items.length < 2) {
      global.JpToast?.warn?.('Sélectionnez au moins 2 éléments actifs');
      return;
    }
    const isDci = state.table === 'dcis';
    const wrap = document.createElement('div');
    wrap.innerHTML = '<p>Quelle valeur conserver ? Les autres seront fusionnées '
      + '(liaisons réassignées, entités désactivées).</p>'
      + (isDci
        ? '<p class="jp-ref-entites-warn">DCI : si chaque DCI a déjà une fiche matrice, '
          + 'la fusion peut échouer (contrainte 1 fiche = 1 DCI). Préférez fusionner via l’éditeur de fiche.</p>'
        : '')
      + '<div class="jp-cmp-keep-list" role="radiogroup">'
      + items.map((it, i) => (
        '<label class="jp-cmp-keep-opt">'
        + '<input type="radio" name="entKeep" value="' + esc(it.id) + '"'
        + (i === 0 ? ' checked' : '') + '>'
        + '<span>' + esc(it.valeur) + '</span></label>'
      )).join('')
      + '</div>';

    global.JpModal.open({
      title: 'Fusionner — ' + (champOfTable(state.table)?.libelle || state.table),
      body: wrap,
      confirmLabel: 'Fusionner',
      onConfirm: async () => {
        const keep = wrap.querySelector('input[name=entKeep]:checked')?.value;
        if (!keep) {
          global.JpToast?.warn?.('Choisissez la valeur à garder');
          return false;
        }
        const drops = items.map((x) => x.id).filter((id) => String(id) !== String(keep));
        try {
          await rpc('v2_fusionner_entites', {
            p_table_name: state.table,
            p_id_keep: keep,
            p_id_drops: drops,
          });
          global.JpToast?.ok?.('Fusion effectuée (' + drops.length + ')');
          void global.JpLogs?.action?.('ref_entites_fusion', {
            table: state.table, keep, drops,
          });
          clearSelection();
          await loadRows();
        } catch (e) {
          global.JpToast?.fromError?.(e);
          return false;
        }
        return undefined;
      },
    });
  }

  async function doDelete() {
    const items = selectedItems().filter((r) => r.actif !== false);
    if (!items.length) {
      global.JpToast?.warn?.('Sélectionnez au moins un élément actif');
      return;
    }
    const labels = items.map((x) => x.valeur).join(' · ');
    const isDci = state.table === 'dcis';
    const wrap = document.createElement('div');
    wrap.innerHTML = '<p>Retirer « ' + esc(labels) + ' » des fiches (liaisons) et désactiver '
      + (items.length > 1 ? 'ces entités' : 'cette entité') + ' ?</p>'
      + (isDci
        ? '<p class="jp-ref-entites-warn">Une DCI encore liée à une fiche active ne peut pas être '
          + 'supprimée — fusionnez d’abord ou archivez la fiche.</p>'
        : '');
    global.JpModal.open({
      title: items.length > 1 ? 'Supprimer les entités ?' : 'Supprimer l’entité ?',
      body: wrap,
      confirmLabel: 'Supprimer',
      onConfirm: async () => {
        try {
          for (const it of items) {
            await rpc('v2_supprimer_entite', {
              p_table_name: state.table,
              p_id: it.id,
            });
          }
          global.JpToast?.ok?.(items.length > 1 ? 'Entités supprimées' : 'Entité supprimée');
          void global.JpLogs?.action?.('ref_entites_supprimer', {
            table: state.table,
            ids: items.map((x) => x.id),
          });
          clearSelection();
          await loadRows();
        } catch (e) {
          global.JpToast?.fromError?.(e);
          return false;
        }
        return undefined;
      },
    });
  }

  function closeSiblingSurfaces() {
    try { global.JpReferentielComparaison?.close?.(); } catch (_) { /* ignore */ }
    try { global.JpReferentielGroupe?.close?.(); } catch (_) { /* ignore */ }
  }

  async function open() {
    closeSiblingSurfaces();
    const host = ensureHost();
    if (!state.table) {
      state.table = tablesActives()[0]?.table || '';
    }
    if (state.mainEl) state.mainEl.hidden = true;
    host.hidden = false;
    host.innerHTML = shellHtml();
    state.open = true;
    document.body.classList.add('jp-comparaison-open');
    if (location.hash !== '#entites') {
      history.replaceState(null, '', '#entites');
    }

    host.querySelector('#entBack').addEventListener('click', close);
    const helpHost = host.querySelector('#entHelpHost');
    if (helpHost && global.JpModal?.helpButton) {
      helpHost.appendChild(global.JpModal.helpButton('Vérifier les éléments', HELP_LINES));
    }
    host.querySelector('#entTable').addEventListener('change', (e) => {
      state.table = e.target.value;
      clearSelection();
      void loadRows();
    });
    let qTimer = null;
    host.querySelector('#entQ').addEventListener('input', (e) => {
      state.q = e.target.value || '';
      clearTimeout(qTimer);
      qTimer = setTimeout(() => void loadRows(), 220);
    });
    host.querySelector('#entInactive').addEventListener('change', (e) => {
      state.showInactive = !!e.target.checked;
      void loadRows();
    });
    host.querySelector('#entCreate').addEventListener('click', () => void doCreate());
    host.querySelector('#entRename').addEventListener('click', () => void doRename());
    host.querySelector('#entMerge').addEventListener('click', () => void doMerge());
    host.querySelector('#entDelete').addEventListener('click', () => void doDelete());
    host.querySelector('#entClearSel').addEventListener('click', clearSelection);
    host.querySelector('#entRefresh').addEventListener('click', () => void loadRows());

    await loadRows();
  }

  function close() {
    if (!state.open) return;
    clearSelection();
    if (state.host) {
      state.host.hidden = true;
      state.host.innerHTML = '';
    }
    if (state.mainEl) state.mainEl.hidden = false;
    state.open = false;
    state.rows = [];
    document.body.classList.remove('jp-comparaison-open');
    if (location.hash === '#entites') {
      history.replaceState(null, '', location.pathname + location.search);
    }
  }

  function onKeydown(e) {
    if (!state.open) return;
    if (e.key !== 'Escape') return;
    if (document.getElementById('jp-modal-root')?.querySelector('.jp-modal-backdrop')) return;
    close();
  }

  function bootFromHash() {
    document.addEventListener('keydown', onKeydown);
    if (location.hash === '#entites') void open();
  }

  global.JpReferentielEntites = { open, close, bootFromHash };
})(window);
