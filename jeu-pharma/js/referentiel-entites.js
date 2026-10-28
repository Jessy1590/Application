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
    'IA : consigne libre → propositions à valider une à une. Cochez un élément, puis « Sélectionner N suivants » : les N lignes après lui (la dernière cochée s’il y en a plusieurs). Délai maximal de la fonction : 150 s.',
  ];

  const ACTION_LABELS = {
    rename: 'Renommer',
    merge: 'Fusionner',
    delete: 'Supprimer',
    keep: 'Garder',
    noop: 'Rien',
  };

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
      + '<span class="jp-ref-entites-lot">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entLot">Sélectionner</button>'
      + '<input type="number" id="entLotN" min="1" step="1" value="300" inputmode="numeric"'
      + ' aria-label="Nombre d’éléments suivants à sélectionner">'
      + '<span>suivants</span>'
      + '</span>'
      + '<span class="jp-muted" id="entSelInfo"></span>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entCreate">Créer</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="entRename" disabled>Renommer</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entMerge" disabled>Fusionner</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entDelete" disabled>Supprimer</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost jp-btn-ia" id="entIA" title="Propositions IA (validation unitaire)">IA</button>'
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

  function syncChecks() {
    state.host?.querySelectorAll('input[data-ent-id]').forEach((inp) => {
      inp.checked = state.selected.has(inp.getAttribute('data-ent-id'));
    });
    paintSelInfo();
  }

  function clearSelection() {
    state.selected.clear();
    syncChecks();
  }

  function lotSize() {
    const raw = Number(state.host?.querySelector('#entLotN')?.value);
    const n = Number.isFinite(raw) ? Math.floor(raw) : 300;
    return n >= 1 ? n : 300;
  }

  function selectFollowingLot() {
    if (!state.rows.length) {
      global.JpToast?.warn?.('Aucun élément à sélectionner');
      return;
    }
    if (!state.selected.size) {
      global.JpToast?.warn?.('Cochez d’abord un élément : les suivants seront pris après lui');
      return;
    }
    let anchor = -1;
    state.rows.forEach((r, i) => {
      if (state.selected.has(String(r.id))) anchor = i;
    });
    const start = anchor + 1;
    if (start >= state.rows.length) {
      global.JpToast?.warn?.('Aucun élément après celui-ci');
      return;
    }
    const n = Math.min(lotSize(), state.rows.length - start);
    state.selected.clear();
    state.rows.slice(start, start + n).forEach((r) => state.selected.add(String(r.id)));
    syncChecks();
    const id = String(state.rows[start].id);
    state.host?.querySelector('#entBody tr[data-id="' + id + '"]')
      ?.scrollIntoView({ block: 'center' });
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
        limit: (global.JpIaGemini && global.JpIaGemini.ENTITES_MAX_ITEMS) || 10000,
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

  function valeurById(id) {
    const row = state.rows.find((r) => String(r.id) === String(id));
    return row ? (row.valeur || '') : '';
  }

  function isActionable(p) {
    const a = String(p?.action || '').toLowerCase();
    return a === 'rename' || a === 'merge' || a === 'delete';
  }

  async function applyProposition(p) {
    const a = String(p.action || '').toLowerCase();
    if (a === 'rename') {
      const nv = String(p.new_valeur || '').trim();
      if (!nv) throw new Error('Proposition rename sans new_valeur');
      await rpc('v2_modifier_entites', {
        p_table_name: state.table,
        p_id_keep: p.id,
        p_id_drops: [],
        p_nouvelle_valeur: nv,
      });
      return;
    }
    if (a === 'merge') {
      const mid = p.merge_into_id;
      if (!mid || String(mid) === String(p.id)) throw new Error('Cible de fusion invalide');
      await rpc('v2_fusionner_entites', {
        p_table_name: state.table,
        p_id_keep: mid,
        p_id_drops: [p.id],
      });
      return;
    }
    if (a === 'delete') {
      await rpc('v2_supprimer_entite', {
        p_table_name: state.table,
        p_id: p.id,
      });
      return;
    }
    throw new Error('Action non applicable');
  }

  function openIaWizard() {
    const G = global.JpIaGemini;
    if (!G || !G.invoke) {
      global.JpToast?.warn?.('Module IA manquant');
      return;
    }
    if (!state.table || !state.rows.length) {
      global.JpToast?.warn?.('Aucun élément à analyser (filtrez ou chargez une table)');
      return;
    }

    const maxItems = G.ENTITES_MAX_ITEMS || 10000;
    const maxInst = G.ENTITES_INSTRUCTION_MAX || 4000;
    const fromSelection = state.selected.size > 0;
    const source = fromSelection ? selectedItems() : state.rows;
    if (fromSelection && !source.length) {
      global.JpToast?.warn?.('La sélection ne correspond à aucun élément affiché');
      return;
    }
    const items = source.slice(0, maxItems).map((r) => ({
      id: r.id,
      valeur: String(r.valeur || '').trim(),
    })).filter((x) => x.id && x.valeur);

    if (!items.length) {
      global.JpToast?.warn?.('Aucun élément valide');
      return;
    }
    if (source.length > maxItems) {
      global.JpToast?.warn?.(
        'Liste tronquée à ' + maxItems + ' pour l’IA (filtrez pour cibler le reste).',
      );
    }
    const scopeLabel = fromSelection ? 'la sélection' : 'la liste affichée';
    const hint = fromSelection
      ? 'Envoi de la sélection en un seul appel. Délai maximal de la fonction : 150 s.'
      : 'Envoi de toute la liste affichée en un seul appel. Pour rester sous le délai de 150 s, cochez un élément puis sélectionnez les suivants.';

    const backdrop = document.createElement('div');
    backdrop.className = 'jp-modal-backdrop jp-ia-backdrop jp-ia-entites-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.innerHTML = ''
      + '<div class="jp-modal jp-ia-modal jp-ia-entites-modal">'
      + '<h2>IA — propositions sur les éléments</h2>'
      + '<p class="jp-ia-lead">Consigne libre + ' + scopeLabel + ' (<strong>' + items.length + '</strong> élément'
      + (items.length > 1 ? 's' : '') + ' de « '
      + esc(champOfTable(state.table)?.libelle || state.table)
      + ' »). Aucune écriture tant que vous n’acceptez pas une proposition.</p>'
      + '<div class="jp-ia-panel" data-panel="prompt">'
      + '<div class="jp-field"><label for="entIaInst">Consigne</label>'
      + '<textarea id="entIaInst" rows="4" maxlength="' + maxInst + '" '
      + 'placeholder="Ex. fusionne les doublons, normalise les libellés, corrige les majuscules…"></textarea></div>'
      + '<p class="jp-field-hint">' + esc(hint) + '</p>'
      + '<div class="jp-ia-status" id="entIaStatus" role="status" aria-live="polite" hidden></div>'
      + '</div>'
      + '<div class="jp-ia-panel" data-panel="review" hidden>'
      + '<div id="entIaMeta" class="jp-ia-entites-meta"></div>'
      + '<div id="entIaQueue" class="jp-ia-entites-queue"></div>'
      + '</div>'
      + '<div class="jp-modal-actions">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entIaCancel">Fermer</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="entIaIgnoreAll" hidden>Tout ignorer</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="entIaAddAll" hidden>Tout ajouter</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="entIaGo">Analyser</button>'
      + '</div></div>';
    document.body.appendChild(backdrop);

    const $ = (id) => backdrop.querySelector('#' + id);
    const statusEl = $('entIaStatus');
    let busy = false;
    let closed = false;
    let timer = null;
    let metaExtraHtml = '';
    /** @type {{ id: string, action: string, new_valeur?: string, merge_into_id?: string, reason?: string, status?: string }[]} */
    let queue = [];
    let valeurSnapshot = new Map(items.map((x) => [String(x.id), x.valeur]));

    function close() {
      closed = true;
      clearInterval(timer);
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
    }
    function onKey(e) {
      if (e.key === 'Escape' && !busy) close();
    }
    document.addEventListener('keydown', onKey);
    $('entIaCancel').addEventListener('click', () => { if (!busy) close(); });

    function setStatus(msg, kind) {
      statusEl.hidden = !msg;
      statusEl.className = 'jp-ia-status' + (kind ? ' is-' + kind : '');
      statusEl.textContent = msg || '';
    }

    function pending() {
      return queue.filter((p) => p.status === 'pending' && isActionable(p));
    }

    function resolveValeur(id) {
      return valeurSnapshot.get(String(id)) || valeurById(id) || '';
    }

    function renderQueue() {
      const host = $('entIaQueue');
      const meta = $('entIaMeta');
      const pend = pending();
      const done = queue.filter((p) => p.status === 'accepted' || p.status === 'ignored');
      meta.innerHTML = (metaExtraHtml || '')
        + '<p><strong>' + pend.length + '</strong> proposition(s) à valider'
        + (done.length ? ' · ' + done.length + ' traitée(s)' : '')
        + '</p>';

      if (!pend.length) {
        host.innerHTML = '<p class="jp-ia-ok">Aucune proposition restante. Fermez ou relancez avec une autre consigne.</p>';
        $('entIaIgnoreAll').hidden = true;
        $('entIaAddAll').hidden = true;
        $('entIaGo').hidden = true;
        return;
      }

      $('entIaIgnoreAll').hidden = false;
      $('entIaAddAll').hidden = false;
      $('entIaGo').hidden = true;

      host.innerHTML = pend.map((p, idx) => {
        const a = String(p.action || '').toLowerCase();
        const badgeClass = a === 'delete' ? 'jp-ia-badge-warn' : (a === 'merge' ? 'jp-ia-badge-new' : 'jp-ia-badge-ok');
        const cur = resolveValeur(p.id);
        let detail = '';
        if (a === 'rename') {
          detail = '<p class="jp-ia-entites-change"><span class="jp-muted">Actuel</span> '
            + esc(cur) + '<br><span class="jp-muted">Proposé</span> <strong>'
            + esc(p.new_valeur || '') + '</strong></p>';
        } else if (a === 'merge') {
          detail = '<p class="jp-ia-entites-change">Fusionner <strong>' + esc(cur) + '</strong> vers <strong>'
            + esc(resolveValeur(p.merge_into_id) || String(p.merge_into_id || ''))
            + '</strong></p>';
        } else if (a === 'delete') {
          detail = '<p class="jp-ia-entites-change">Supprimer <strong>' + esc(cur) + '</strong></p>';
        }
        return '<article class="jp-ia-entites-card" data-prop-idx="' + idx + '" data-prop-id="' + esc(p.id) + '">'
          + '<div class="jp-ia-entites-card-head">'
          + '<span class="jp-ia-badge ' + badgeClass + '">' + esc(ACTION_LABELS[a] || a) + '</span>'
          + (p.reason ? '<span class="jp-field-hint">' + esc(p.reason) + '</span>' : '')
          + '</div>'
          + detail
          + '<div class="jp-ia-chip-actions">'
          + '<button type="button" class="jp-btn jp-btn-primary" data-ia-act="accept">Accepter</button>'
          + '<button type="button" class="jp-btn jp-btn-ghost" data-ia-act="ignore">Ignorer</button>'
          + '</div></article>';
      }).join('');
    }

    function showReview(ia) {
      valeurSnapshot = new Map(items.map((x) => [String(x.id), x.valeur]));
      const props = Array.isArray(ia.propositions) ? ia.propositions : [];
      queue = props.map((p) => ({
        id: p.id,
        action: String(p.action || 'noop').toLowerCase(),
        new_valeur: p.new_valeur,
        merge_into_id: p.merge_into_id,
        reason: p.reason,
        status: isActionable(p) ? 'pending' : 'skipped',
      }));
      backdrop.querySelector('[data-panel="prompt"]').hidden = true;
      backdrop.querySelector('[data-panel="review"]').hidden = false;
      const warns = (ia.avertissements || []).slice(0, 6);
      metaExtraHtml = (warns.length
        ? '<ul class="jp-ia-warns">' + warns.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>'
        : '');
      renderQueue();
      if (!pending().length) {
        global.JpToast?.ok?.('L’IA n’a rien à proposer (tout keep/noop)');
      }
    }

    async function runAnalyze() {
      if (busy) return;
      const instruction = String($('entIaInst')?.value || '').trim();
      if (!instruction) {
        global.JpToast?.warn?.('Saisissez une consigne');
        return;
      }
      busy = true;
      $('entIaGo').disabled = true;
      $('entIaCancel').disabled = true;
      setStatus('Analyse IA…', 'busy');
      const started = Date.now();
      clearInterval(timer);
      timer = setInterval(() => {
        setStatus('Analyse IA… ' + Math.round((Date.now() - started) / 1000) + ' s', 'busy');
      }, 1000);
      try {
        const ia = await G.invoke(G.FN_ENTITES, {
          table: state.table,
          instruction,
          items,
        });
        clearInterval(timer);
        if (closed) return;
        setStatus('', '');
        showReview(ia);
        void global.JpLogs?.action?.('ref_entites_ia', {
          table: state.table,
          count: items.length,
          actionable: (ia.propositions || []).filter(isActionable).length,
          model: ia.model || null,
        });
      } catch (e) {
        clearInterval(timer);
        if (!closed) setStatus((e && e.message) || 'Erreur IA', 'error');
      } finally {
        busy = false;
        if (!closed) {
          $('entIaGo').disabled = false;
          $('entIaCancel').disabled = false;
        }
      }
    }

    function settleProposition(prop) {
      prop.status = 'accepted';
      const gone = new Set([String(prop.id)]);
      if (String(prop.action).toLowerCase() === 'merge') {
        /* id source disparaît ; cible reste */
      }
      if (String(prop.action).toLowerCase() === 'delete') {
        gone.add(String(prop.id));
      }
      queue.forEach((q) => {
        if (q.status !== 'pending') return;
        if (gone.has(String(q.id))) {
          q.status = 'ignored';
          return;
        }
        if (String(q.action).toLowerCase() === 'merge' && gone.has(String(q.merge_into_id))) {
          q.status = 'ignored';
        }
      });
      if (String(prop.action).toLowerCase() === 'rename' && prop.new_valeur) {
        valeurSnapshot.set(String(prop.id), String(prop.new_valeur));
      }
    }

    function logAccept(prop) {
      void global.JpLogs?.action?.('ref_entites_ia_accept', {
        table: state.table,
        id: prop.id,
        action: prop.action,
      });
    }

    function setActionsDisabled(on) {
      ['entIaAddAll', 'entIaIgnoreAll', 'entIaCancel'].forEach((id) => {
        const btn = $(id);
        if (btn) btn.disabled = on;
      });
      backdrop.querySelectorAll('[data-ia-act]').forEach((btn) => { btn.disabled = on; });
    }

    async function acceptOne(prop) {
      if (busy || !prop || prop.status !== 'pending') return;
      busy = true;
      try {
        await applyProposition(prop);
        settleProposition(prop);
        global.JpToast?.ok?.('Appliqué : ' + (ACTION_LABELS[prop.action] || prop.action));
        logAccept(prop);
        await loadRows();
        state.rows.forEach((r) => valeurSnapshot.set(String(r.id), r.valeur || ''));
        renderQueue();
      } catch (e) {
        global.JpToast?.fromError?.(e);
      } finally {
        busy = false;
      }
    }

    async function acceptAll() {
      if (busy || !pending().length) return;
      busy = true;
      setActionsDisabled(true);
      let applied = 0;
      try {
        while (pending().length) {
          const prop = pending()[0];
          try {
            await applyProposition(prop);
          } catch (e) {
            global.JpToast?.fromError?.(e);
            break;
          }
          settleProposition(prop);
          applied += 1;
          logAccept(prop);
        }
      } finally {
        if (applied) {
          global.JpToast?.ok?.(
            applied + (applied > 1 ? ' propositions appliquées' : ' proposition appliquée'),
          );
        }
        if (!closed) {
          try {
            if (applied) {
              await loadRows();
              state.rows.forEach((r) => valeurSnapshot.set(String(r.id), r.valeur || ''));
            }
          } catch (e) {
            global.JpToast?.fromError?.(e);
          }
          renderQueue();
          busy = false;
          setActionsDisabled(false);
        } else {
          busy = false;
        }
      }
    }

    function ignoreOne(prop) {
      if (!prop || prop.status !== 'pending') return;
      prop.status = 'ignored';
      renderQueue();
    }

    function ignoreAll() {
      queue.forEach((p) => {
        if (p.status === 'pending') p.status = 'ignored';
      });
      renderQueue();
    }

    $('entIaGo').addEventListener('click', () => void runAnalyze());
    $('entIaIgnoreAll').addEventListener('click', () => {
      if (!busy) ignoreAll();
    });
    $('entIaAddAll').addEventListener('click', () => {
      if (!busy) void acceptAll();
    });
    $('entIaQueue').addEventListener('click', (e) => {
      const act = e.target.getAttribute('data-ia-act')
        || e.target.closest('[data-ia-act]')?.getAttribute('data-ia-act');
      if (!act || busy) return;
      const card = e.target.closest('[data-prop-id]');
      if (!card) return;
      const id = card.getAttribute('data-prop-id');
      const prop = pending().find((p) => String(p.id) === String(id));
      if (!prop) return;
      if (act === 'accept') void acceptOne(prop);
      else if (act === 'ignore') ignoreOne(prop);
    });

    setTimeout(() => $('entIaInst')?.focus(), 50);
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
    host.querySelector('#entIA')?.addEventListener('click', () => openIaWizard());
    host.querySelector('#entLot')?.addEventListener('click', selectFollowingLot);
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
    if (document.querySelector('.jp-ia-entites-backdrop')) return;
    close();
  }

  function bootFromHash() {
    document.addEventListener('keydown', onKeydown);
    if (location.hash === '#entites') void open();
  }

  global.JpReferentielEntites = { open, close, bootFromHash };
})(window);
