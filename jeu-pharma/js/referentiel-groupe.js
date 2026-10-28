/**
 * Admin Référentiel — Gestion par groupe (aligner des champs sur plusieurs fiches DCI).
 * Filtres liste : texte DCI/nom ∩ classe théra ∩ classe pharma (typeahead entités).
 * Réutilise JpMedicaments.replaceLiaisons + JpTypeahead.entiteSource(allowCreate).
 */
(function (global) {
  const esc = (s) => global.JpUi.escapeHtml(String(s ?? ''));
  const CONCURRENCY = 4;

  function sb() {
    return global.JpApp.sbJeu();
  }

  function MED() {
    return global.JpMedicaments;
  }

  function ENT() {
    return global.JpEntites;
  }

  function TA() {
    return global.JpTypeahead;
  }

  function champsActifs() {
    return (typeof global.JpConstants?.champsActifs === 'function'
      ? global.JpConstants.champsActifs()
      : (global.JpConstants?.CHAMP_CODES || []).filter((c) => c.actif !== false));
  }

  function multiChamps() {
    return champsActifs().filter((c) => c.card === 'N');
  }

  function singularChampsEditables() {
    // Exclure DCI (identité de la fiche) ; garder détail / posologie / grossesse…
    return champsActifs().filter((c) => c.card === 1 && c.code !== 'dci' && c.fk);
  }

  function multiOf(row, code) {
    if (!row) return [];
    if (code === 'nom_commercial') {
      return (row.noms_commerciaux || []).filter((x) => x && x.id)
        .map((x) => ({ id: x.id, label: MED().labelFrom(x) }));
    }
    const arr = Array.isArray(row[code]) ? row[code] : [];
    return arr.filter((x) => x && x.id).map((x) => ({
      id: x.id,
      label: MED().labelFrom(x),
    }));
  }

  async function mapPool(items, limit, fn) {
    const list = items || [];
    const out = new Array(list.length);
    let next = 0;
    const workers = Array.from(
      { length: Math.min(limit, Math.max(list.length, 1)) },
      async () => {
        while (next < list.length) {
          const i = next++;
          out[i] = await fn(list[i], i);
        }
      }
    );
    await Promise.all(workers);
    return out;
  }

  const state = {
    open: false,
    host: null,
    mainEl: null,
    all: [],
    filter: '',
    filterClasseThId: null,
    filterClassePhId: null,
    selected: new Set(),
    ctrls: [],
    filterCtrls: [],
    busy: false,
  };

  const HELP_LINES = [
    'Filtrez par texte DCI/nom (ex. « sartan ») et/ou par classe thérapeutique / pharmacologique.',
    'Plusieurs filtres actifs = intersection (une fiche doit tout satisfaire).',
    'Cochez les fiches affichées, puis alignez les champs à droite.',
    'Champs multi : Ajouter / Retirer une valeur, ou Remplacer toute la liste par les chips choisies.',
    'Champs singuliers : Appliquer la même valeur sur toutes les fiches sélectionnées.',
    'Seules les fiches cochées sont modifiées — le reste du référentiel n’est pas touché.',
  ];

  function destroyCtrls() {
    (state.ctrls || []).forEach((c) => {
      try { c?.destroy?.(); } catch (_) { /* ignore */ }
    });
    state.ctrls = [];
  }

  function destroyFilterCtrls() {
    (state.filterCtrls || []).forEach((c) => {
      try { c?.destroy?.(); } catch (_) { /* ignore */ }
    });
    state.filterCtrls = [];
  }

  function onCreateEntite(table) {
    return async function (label) {
      const ent = await ENT().findOrCreate(table, label);
      if (!ent?.id) return null;
      return { id: ent.id, label: ent.valeur || label };
    };
  }

  function ensureHost() {
    if (state.host) return state.host;
    state.mainEl = document.querySelector('main.jp-page');
    const host = document.createElement('div');
    host.id = 'refGroupeView';
    host.className = 'jp-comparaison jp-ref-groupe';
    host.hidden = true;
    (state.mainEl?.parentNode || document.body).appendChild(host);
    state.host = host;
    return host;
  }

  function shellHtml() {
    return '<div class="jp-comparaison-inner jp-ref-groupe-inner">'
      + '<header class="jp-comparaison-head">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="grpBack">← Retour référentiel</button>'
      + '<h1 class="jp-title">Gestion par groupe</h1>'
      + '<div class="jp-comparaison-head-actions"><span id="grpHelpHost"></span></div>'
      + '<span class="jp-muted" id="grpCount"></span>'
      + '</header>'
      + '<div class="jp-ref-groupe-layout">'
      + '<aside class="jp-ref-groupe-listpane" aria-label="Fiches">'
      + '<div class="jp-ref-groupe-list-toolbar">'
      + '<input type="search" id="grpFilter" class="jp-ref-entites-search" '
      + 'placeholder="Filtrer DCI / nom… ex. sartan" aria-label="Filtrer les DCI" autocomplete="off">'
      + '<div class="jp-ref-groupe-class-filters">'
      + '<div id="grpFiltClasseTh" class="jp-ref-groupe-ta" aria-label="Classe thérapeutique"></div>'
      + '<div id="grpFiltClassePh" class="jp-ref-groupe-ta" aria-label="Classe pharmacologique"></div>'
      + '</div>'
      + '<div class="jp-ref-groupe-list-actions">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="grpSelectVisible">Tout cocher (filtrés)</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="grpClearSel">Effacer sélection</button>'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="grpClearFilt">Effacer filtres</button>'
      + '</div></div>'
      + '<div id="grpList" class="jp-ref-groupe-list"><p class="jp-muted">Chargement…</p></div>'
      + '</aside>'
      + '<section class="jp-ref-groupe-ops" aria-label="Alignement">'
      + '<p class="jp-muted" id="grpSelInfo">Cochez au moins une fiche.</p>'
      + '<div id="grpOps" class="jp-ref-groupe-ops-body"></div>'
      + '</section>'
      + '</div></div>';
  }

  /** Ids de classe liés à la fiche (jonction + FK d’ordre 0). */
  function classeIdsOf(row, code) {
    const ids = new Set();
    const fk = code === 'classe_therapeutique'
      ? 'classe_therapeutique_id'
      : (code === 'classe_pharmacologique' ? 'classe_pharmacologique_id' : null);
    if (fk && row?.[fk]) ids.add(String(row[fk]));
    const arr = Array.isArray(row?.[code]) ? row[code] : [];
    arr.forEach((x) => {
      if (x?.id) ids.add(String(x.id));
    });
    return ids;
  }

  function rowMatchesText(r, q, qn) {
    if (!q) return true;
    const dci = String(r.dci || '').toLowerCase();
    const dciN = ENT().normaliser(r.dci || '');
    const noms = String(MED().formatNoms?.(r) || '').toLowerCase();
    const nomsN = ENT().normaliser(noms);
    return dci.includes(q) || dciN.includes(qn) || noms.includes(q) || nomsN.includes(qn);
  }

  /**
   * Filtre liste : intersection des critères actifs (texte ∩ classe théra ∩ classe pharma).
   * Une classe choisie = fiches liées à cet id (jonction ou FK).
   */
  function filteredRows() {
    const q = String(state.filter || '').trim().toLowerCase();
    const qn = q ? ENT().normaliser(q) : '';
    const thId = state.filterClasseThId ? String(state.filterClasseThId) : null;
    const phId = state.filterClassePhId ? String(state.filterClassePhId) : null;
    if (!q && !thId && !phId) return state.all;
    return state.all.filter((r) => {
      if (!rowMatchesText(r, q, qn)) return false;
      if (thId && !classeIdsOf(r, 'classe_therapeutique').has(thId)) return false;
      if (phId && !classeIdsOf(r, 'classe_pharmacologique').has(phId)) return false;
      return true;
    });
  }

  function hasActiveFilters() {
    return !!(String(state.filter || '').trim()
      || state.filterClasseThId
      || state.filterClassePhId);
  }

  function paintCount() {
    const el = state.host?.querySelector('#grpCount');
    const info = state.host?.querySelector('#grpSelInfo');
    const vis = filteredRows().length;
    const n = state.selected.size;
    if (el) {
      el.textContent = vis + ' fiche(s) affichée(s) · ' + state.all.length + ' au total';
    }
    if (info) {
      info.textContent = n
        ? (n + ' fiche(s) sélectionnée(s) — les actions s’appliquent uniquement à elles.')
        : 'Cochez au moins une fiche.';
    }
  }

  function renderList() {
    const box = state.host?.querySelector('#grpList');
    if (!box) return;
    const rows = filteredRows();
    if (!rows.length) {
      box.innerHTML = '<p class="jp-muted">Aucune fiche'
        + (hasActiveFilters() ? ' pour ces filtres' : '') + '.</p>';
      paintCount();
      return;
    }
    let html = '<ul class="jp-ref-groupe-ul">';
    rows.forEach((r) => {
      const id = String(r.id);
      const on = state.selected.has(id);
      const noms = MED().formatNoms?.(r) || '';
      html += '<li>'
        + '<label class="jp-ref-groupe-row">'
        + '<input type="checkbox" data-grp-mid="' + esc(id) + '"' + (on ? ' checked' : '') + '>'
        + '<span class="jp-ref-groupe-row-text">'
        + '<strong>' + esc(r.dci || '—') + '</strong>'
        + (noms ? '<span class="jp-muted">' + esc(noms) + '</span>' : '')
        + '</span></label></li>';
    });
    html += '</ul>';
    box.innerHTML = html;
    box.querySelectorAll('input[data-grp-mid]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const id = inp.getAttribute('data-grp-mid');
        if (inp.checked) state.selected.add(id);
        else state.selected.delete(id);
        paintCount();
      });
    });
    paintCount();
  }

  function mountClassFilters() {
    destroyFilterCtrls();
    const ta = TA();
    const hostTh = state.host?.querySelector('#grpFiltClasseTh');
    const hostPh = state.host?.querySelector('#grpFiltClassePh');
    if (!ta?.entiteSource || !hostTh || !hostPh) return;

    const onFilt = () => { renderList(); };

    state.filterCtrls.push(ta.combo(hostTh, {
      search: ta.entiteSource('classes_therapeutiques', { limit: 14 }),
      minChars: 0,
      placeholder: 'Classe thérapeutique…',
      ariaLabel: 'Filtrer par classe thérapeutique',
      onChange: (it) => {
        state.filterClasseThId = it?.id || null;
        onFilt();
      },
    }));
    state.filterCtrls.push(ta.combo(hostPh, {
      search: ta.entiteSource('classes_pharmacologiques', { limit: 14 }),
      minChars: 0,
      placeholder: 'Classe pharmacologique…',
      ariaLabel: 'Filtrer par classe pharmacologique',
      onChange: (it) => {
        state.filterClassePhId = it?.id || null;
        onFilt();
      },
    }));
  }

  function clearFilters() {
    state.filter = '';
    state.filterClasseThId = null;
    state.filterClassePhId = null;
    const inp = state.host?.querySelector('#grpFilter');
    if (inp) inp.value = '';
    (state.filterCtrls || []).forEach((c) => {
      try { c?.clear?.(true); } catch (_) { /* ignore */ }
    });
    renderList();
  }

  function mountOps() {
    destroyCtrls();
    const box = state.host?.querySelector('#grpOps');
    if (!box) return;
    const multi = multiChamps();
    const singular = singularChampsEditables();
    let html = '<h2 class="jp-ref-groupe-section-title">Champs multi</h2>'
      + '<p class="jp-muted jp-ref-groupe-hint">Ajouter / Retirer une valeur, ou Remplacer toute la liste du champ.</p>';
    multi.forEach((ch) => {
      html += '<div class="jp-ref-groupe-field" data-grp-multi="' + esc(ch.code) + '">'
        + '<label class="jp-ref-groupe-field-label">' + esc(ch.libelle) + '</label>'
        + '<div class="jp-ref-groupe-field-row">'
        + '<div class="jp-ref-groupe-ta" data-grp-ta="' + esc(ch.code) + '"></div>'
        + '<div class="jp-ref-groupe-btns">'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-grp-add="' + esc(ch.code) + '">Ajouter</button>'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-grp-rm="' + esc(ch.code) + '">Retirer</button>'
        + '</div></div>'
        + '<div class="jp-ref-groupe-field-row jp-ref-groupe-replace-row">'
        + '<div class="jp-ref-groupe-ta" data-grp-chips="' + esc(ch.code) + '"></div>'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-grp-replace="' + esc(ch.code)
        + '" title="Remplace entièrement la liste sur les fiches sélectionnées">Remplacer</button>'
        + '</div></div>';
    });
    html += '<h2 class="jp-ref-groupe-section-title">Champs singuliers</h2>'
      + '<p class="jp-muted jp-ref-groupe-hint">Applique la même valeur sur toutes les fiches cochées.</p>';
    singular.forEach((ch) => {
      html += '<div class="jp-ref-groupe-field" data-grp-sing="' + esc(ch.code) + '">'
        + '<label class="jp-ref-groupe-field-label">' + esc(ch.libelle) + '</label>'
        + '<div class="jp-ref-groupe-field-row">'
        + '<div class="jp-ref-groupe-ta" data-grp-sing-ta="' + esc(ch.code) + '"></div>'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-grp-set="' + esc(ch.code) + '">Appliquer</button>'
        + '</div></div>';
    });
    box.innerHTML = html;

    const ta = TA();
    if (!ta) {
      box.insertAdjacentHTML('afterbegin', '<p class="jp-muted">Typeahead indisponible</p>');
      return;
    }

    multi.forEach((ch) => {
      const hostCombo = box.querySelector('[data-grp-ta="' + ch.code + '"]');
      const hostChips = box.querySelector('[data-grp-chips="' + ch.code + '"]');
      if (hostCombo) {
        state.ctrls.push(ta.combo(hostCombo, {
          search: ta.entiteSource(ch.table, { limit: 12, allowCreate: true }),
          minChars: 1,
          placeholder: 'Valeur à ajouter / retirer…',
          ariaLabel: ch.libelle,
          onCreate: onCreateEntite(ch.table),
        }));
        state.ctrls[state.ctrls.length - 1]._grpKind = 'combo';
        state.ctrls[state.ctrls.length - 1]._grpCode = ch.code;
      }
      if (hostChips) {
        state.ctrls.push(ta.chips(hostChips, {
          search: ta.entiteSource(ch.table, { limit: 12, allowCreate: true }),
          minChars: 1,
          placeholder: 'Liste de remplacement…',
          ariaLabel: 'Remplacer ' + ch.libelle,
          initial: [],
          onCreate: onCreateEntite(ch.table),
        }));
        state.ctrls[state.ctrls.length - 1]._grpKind = 'chips';
        state.ctrls[state.ctrls.length - 1]._grpCode = ch.code;
      }
    });

    singular.forEach((ch) => {
      const host = box.querySelector('[data-grp-sing-ta="' + ch.code + '"]');
      if (!host) return;
      state.ctrls.push(ta.combo(host, {
        search: ta.entiteSource(ch.table, { limit: 12, allowCreate: true }),
        minChars: 1,
        placeholder: 'Valeur…',
        ariaLabel: ch.libelle,
        onCreate: onCreateEntite(ch.table),
      }));
      state.ctrls[state.ctrls.length - 1]._grpKind = 'sing';
      state.ctrls[state.ctrls.length - 1]._grpCode = ch.code;
    });

    box.querySelectorAll('[data-grp-add]').forEach((btn) => {
      btn.addEventListener('click', () => void applyMulti(btn.getAttribute('data-grp-add'), 'add'));
    });
    box.querySelectorAll('[data-grp-rm]').forEach((btn) => {
      btn.addEventListener('click', () => void applyMulti(btn.getAttribute('data-grp-rm'), 'rm'));
    });
    box.querySelectorAll('[data-grp-replace]').forEach((btn) => {
      btn.addEventListener('click', () => void applyMulti(btn.getAttribute('data-grp-replace'), 'replace'));
    });
    box.querySelectorAll('[data-grp-set]').forEach((btn) => {
      btn.addEventListener('click', () => void applySingular(btn.getAttribute('data-grp-set')));
    });
  }

  function ctrlFor(code, kind) {
    return state.ctrls.find((c) => c._grpCode === code && c._grpKind === kind);
  }

  async function resolveComboItem(ctrl, table) {
    let it = ctrl?.getItem?.();
    const typed = String(ctrl?.input?.value || '').trim();
    if (!it && typed) {
      it = await onCreateEntite(table)(typed);
    }
    return it;
  }

  function selectedIds() {
    return [...state.selected];
  }

  async function applyMulti(code, mode) {
    if (state.busy) return;
    const ids = selectedIds();
    if (!ids.length) {
      global.JpToast?.warn?.('Cochez au moins une fiche');
      return;
    }
    const ch = multiChamps().find((c) => c.code === code);
    if (!ch) return;

    let entityIds = [];
    if (mode === 'replace') {
      const chips = ctrlFor(code, 'chips');
      const items = chips?.getItems?.() || [];
      entityIds = items.map((x) => x.id).filter(Boolean);
      // Remplacer par liste vide = vider le champ — confirmer
      if (!entityIds.length) {
        const ok = await new Promise((resolve) => {
          global.JpModal.open({
            title: 'Vider « ' + (ch.libelle || code) + ' » ?',
            body: 'Aucune valeur dans les chips : le champ sera vidé sur les '
              + ids.length + ' fiche(s) sélectionnée(s).',
            confirmLabel: 'Vider',
            onConfirm: () => { resolve(true); },
            onCancel: () => { resolve(false); },
          });
        });
        if (!ok) return;
      }
    } else {
      const combo = ctrlFor(code, 'combo');
      let it;
      try {
        it = await resolveComboItem(combo, ch.table);
      } catch (e) {
        global.JpToast?.fromError?.(e);
        return;
      }
      if (!it?.id) {
        global.JpToast?.warn?.('Choisissez une entité');
        return;
      }
      entityIds = [it.id];
    }

    state.busy = true;
    try {
      let n = 0;
      await mapPool(ids, CONCURRENCY, async (mid) => {
        const row = await MED().getById(mid);
        if (!row) return;
        let cur = multiOf(row, ch.code).map((x) => String(x.id));
        if (mode === 'add') {
          const eid = String(entityIds[0]);
          if (!cur.includes(eid)) cur = cur.concat([eid]);
          else return;
        } else if (mode === 'rm') {
          const eid = String(entityIds[0]);
          const next = cur.filter((id) => id !== eid);
          if (next.length === cur.length) return;
          cur = next;
        } else {
          cur = entityIds.map(String);
        }
        await MED().replaceLiaisons(mid, ch, cur);
        if (ch.fk && (ch.code === 'classe_therapeutique' || ch.code === 'classe_pharmacologique')) {
          const { error } = await sb().from('matrice_medicaments')
            .update({ [ch.fk]: cur[0] || null, fiche_validee: false }).eq('id', mid);
          if (error) throw error;
        } else {
          // Invalider validation sans toucher le reste
          await sb().from('matrice_medicaments')
            .update({ fiche_validee: false }).eq('id', mid);
        }
        n += 1;
      });
      const labels = {
        add: 'Ajouté',
        rm: 'Retiré',
        replace: 'Remplacé',
      };
      global.JpToast?.ok?.((labels[mode] || 'OK') + ' sur ' + n + ' fiche(s)');
      void global.JpLogs?.action?.('ref_groupe_multi', {
        champ: code, mode, count: n, entity_ids: entityIds,
      });
      if (mode !== 'replace') {
        ctrlFor(code, 'combo')?.clear?.(true);
      }
    } catch (e) {
      global.JpToast?.fromError?.(e);
    } finally {
      state.busy = false;
    }
  }

  async function applySingular(code) {
    if (state.busy) return;
    const ids = selectedIds();
    if (!ids.length) {
      global.JpToast?.warn?.('Cochez au moins une fiche');
      return;
    }
    const ch = singularChampsEditables().find((c) => c.code === code);
    if (!ch?.fk) return;
    const combo = ctrlFor(code, 'sing');
    let it;
    try {
      it = await resolveComboItem(combo, ch.table);
    } catch (e) {
      global.JpToast?.fromError?.(e);
      return;
    }
    if (!it?.id) {
      global.JpToast?.warn?.('Choisissez une entité');
      return;
    }

    state.busy = true;
    try {
      let n = 0;
      await mapPool(ids, CONCURRENCY, async (mid) => {
        const { error } = await sb().from('matrice_medicaments')
          .update({ [ch.fk]: it.id, fiche_validee: false }).eq('id', mid);
        if (error) throw error;
        n += 1;
      });
      global.JpToast?.ok?.('Appliqué sur ' + n + ' fiche(s)');
      void global.JpLogs?.action?.('ref_groupe_singulier', {
        champ: code, count: n, entity_id: it.id,
      });
      combo?.clear?.(true);
    } catch (e) {
      global.JpToast?.fromError?.(e);
    } finally {
      state.busy = false;
    }
  }

  async function loadAll() {
    const box = state.host?.querySelector('#grpList');
    if (box) box.innerHTML = '<p class="jp-muted">Chargement…</p>';
    try {
      state.all = (await MED().list()).filter((r) => r.statut !== 'archive');
      renderList();
    } catch (e) {
      if (box) box.innerHTML = '<p class="jp-muted">Erreur de chargement</p>';
      global.JpToast?.fromError?.(e);
    }
  }

  function closeSiblingSurfaces() {
    try { global.JpReferentielComparaison?.close?.(); } catch (_) { /* ignore */ }
    try { global.JpReferentielEntites?.close?.(); } catch (_) { /* ignore */ }
  }

  async function open() {
    closeSiblingSurfaces();
    const host = ensureHost();
    if (state.mainEl) state.mainEl.hidden = true;
    host.hidden = false;
    host.innerHTML = shellHtml();
    state.open = true;
    state.filter = '';
    state.filterClasseThId = null;
    state.filterClassePhId = null;
    state.selected.clear();
    document.body.classList.add('jp-comparaison-open');
    if (location.hash !== '#groupe') {
      history.replaceState(null, '', '#groupe');
    }

    host.querySelector('#grpBack').addEventListener('click', close);
    const helpHost = host.querySelector('#grpHelpHost');
    if (helpHost && global.JpModal?.helpButton) {
      helpHost.appendChild(global.JpModal.helpButton('Gestion par groupe', HELP_LINES));
    }

    let filtTimer = null;
    host.querySelector('#grpFilter').addEventListener('input', (e) => {
      state.filter = e.target.value || '';
      clearTimeout(filtTimer);
      filtTimer = setTimeout(() => renderList(), 180);
    });
    host.querySelector('#grpSelectVisible').addEventListener('click', () => {
      filteredRows().forEach((r) => state.selected.add(String(r.id)));
      renderList();
    });
    host.querySelector('#grpClearSel').addEventListener('click', () => {
      state.selected.clear();
      renderList();
    });
    host.querySelector('#grpClearFilt').addEventListener('click', clearFilters);

    mountClassFilters();
    mountOps();
    await loadAll();
  }

  function close() {
    if (!state.open) return;
    destroyCtrls();
    destroyFilterCtrls();
    state.selected.clear();
    state.filter = '';
    state.filterClasseThId = null;
    state.filterClassePhId = null;
    state.all = [];
    if (state.host) {
      state.host.hidden = true;
      state.host.innerHTML = '';
    }
    if (state.mainEl) state.mainEl.hidden = false;
    state.open = false;
    document.body.classList.remove('jp-comparaison-open');
    if (location.hash === '#groupe') {
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
    if (location.hash === '#groupe') void open();
  }

  global.JpReferentielGroupe = { open, close, bootFromHash };
})(window);
