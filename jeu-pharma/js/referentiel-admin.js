/**
 * Admin Référentiel : liste de toutes les fiches (recherche / filtres) + éditeur.
 * Dépend : JpApp, JpConstants, JpUi, JpToast, JpLogs, JpEntites, JpMedicaments, JpBdm, JpModal.
 * Clé anon + RLS : l’UI ne remplace pas les policies.
 */
(function (global) {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => global.JpUi.escapeHtml(String(s ?? ''));
  const MED = () => global.JpMedicaments;
  const ENT = () => global.JpEntites;
  const norm = (s) => global.JpEntites.normaliser(s);

  const PREFS_KEY = 'jp-ref-prefs-v1';
  const DEFAULT_COLS = ['nom_commercial', 'dci', 'secteur_therapeutique', 'classe_pharmacologique', 'indications'];
  const PAGE_STEP = 200;
  const AC_MAX = 12;

  const CHAMPS = (typeof global.JpConstants.champsActifs === 'function'
    ? global.JpConstants.champsActifs()
    : global.JpConstants.CHAMP_CODES.filter((c) => c.actif !== false));

  const SECTIONS = [
    { id: 'identite', title: 'Identité', codes: ['nom_commercial', 'dci', 'secteur_therapeutique'] },
    { id: 'classes', title: 'Classes', codes: ['classe_therapeutique', 'classe_pharmacologique', 'detail_pharmacologie'] },
    { id: 'clinique', title: 'Clinique', codes: ['indications', 'contre_indications', 'effets_indesirables', 'precautions_emploi'] },
    { id: 'suivi', title: 'Interactions & suivi', codes: ['interactions', 'surveillances'] },
  ];

  let all = [];
  let prefs = loadPrefs();
  let shown = PAGE_STEP;
  let editingId = null;
  let dirty = false;
  let pickerMulti = {};
  let bdmRows = [];
  let bdmReq = 0;
  let acSeq = {};
  let acActive = null;
  let acHighlight = -1;
  let acBlur = null;
  let lieHighlight = -1;
  let lieBlur = null;
  let lieSeq = 0;
  let queue = [];
  let queueIdx = 0;
  let queueActive = false;
  let queueResume = false;

  /* ——— Préférences ——— */
  function defaultPrefs() {
    return {
      q: '', sort: 'dci', statut: '', validation: '',
      secteur: '', classeTh: '', classePh: '',
      incomplet: false, incompletChamp: '',
      lieType: '', lieEntityId: '', lieEntityLabel: '',
      columns: DEFAULT_COLS.slice(),
    };
  }

  function loadPrefs() {
    const base = defaultPrefs();
    try {
      const p = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null');
      if (!p || typeof p !== 'object') return base;
      const has = (code) => CHAMPS.some((c) => c.code === code);
      const str = (v) => (typeof v === 'string' ? v : '');
      const cols = Array.isArray(p.columns) ? p.columns.filter(has) : [];
      return {
        q: str(p.q),
        sort: ['dci', 'nom', 'secteur', 'updated_at'].includes(p.sort) ? p.sort : 'dci',
        statut: str(p.statut),
        validation: ['a_valider', 'validee'].includes(p.validation) ? p.validation : '',
        secteur: str(p.secteur), classeTh: str(p.classeTh), classePh: str(p.classePh),
        incomplet: !!p.incomplet,
        incompletChamp: has(p.incompletChamp) ? p.incompletChamp : '',
        lieType: has(p.lieType) ? p.lieType : '',
        lieEntityId: str(p.lieEntityId), lieEntityLabel: str(p.lieEntityLabel),
        columns: cols.length ? cols : base.columns,
      };
    } catch (_) {
      return base;
    }
  }

  function savePrefs() {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_) { /* ignore */ }
  }

  /* ——— Données liste ——— */
  const champBy = (code) => CHAMPS.find((c) => c.code === code);
  const nomsOf = (r) => MED().formatNoms(r);
  const labs = (v) => MED().labelsOf(v);
  const isValidee = (r) => !!r?.fiche_validee;

  function decorate(rows) {
    for (const r of rows) {
      r._blob = norm([
        nomsOf(r), r.dci,
        labs(r.secteur_therapeutique).join(' '),
        labs(r.classe_therapeutique).join(' '),
        labs(r.classe_pharmacologique).join(' '),
        r.detail_pharmacologie,
      ].filter(Boolean).join(' '));
    }
    return rows;
  }

  function isChampIncomplet(r, code) {
    const c = champBy(code);
    if (!c) return false;
    if (code === 'nom_commercial') return !nomsOf(r);
    if (c.card === 'N') return !Array.isArray(r[code]) || !r[code].length;
    const v = r[code];
    return v == null || String(v).trim() === '';
  }

  function isIncomplet(r) {
    if (prefs.incompletChamp) return isChampIncomplet(r, prefs.incompletChamp);
    return !nomsOf(r) || !r.dci || !labs(r.secteur_therapeutique).length;
  }

  function cellValue(r, code) {
    const c = champBy(code);
    if (!c) return '—';
    if (code === 'nom_commercial') return nomsOf(r) || '—';
    const raw = r[code];
    if (c.card === 'N' || Array.isArray(raw) || (raw && typeof raw === 'object')) return MED().formatLabels(raw);
    return raw ? String(raw) : '—';
  }

  function sortRows(rows) {
    const key = prefs.sort;
    const out = rows.slice();
    out.sort((a, b) => {
      if (key === 'updated_at') return (Date.parse(b.updated_at) || 0) - (Date.parse(a.updated_at) || 0);
      let va; let vb;
      if (key === 'nom') { va = nomsOf(a); vb = nomsOf(b); }
      else if (key === 'secteur') { va = labs(a.secteur_therapeutique).join(', '); vb = labs(b.secteur_therapeutique).join(', '); }
      else { va = a.dci || ''; vb = b.dci || ''; }
      return String(va).localeCompare(String(vb), 'fr', { sensitivity: 'base' });
    });
    return out;
  }

  function filtered() {
    const terms = norm(prefs.q).split(/\s+/).filter(Boolean);
    return sortRows(all.filter((r) => {
      if (prefs.statut && r.statut !== prefs.statut) return false;
      if (prefs.validation === 'a_valider' && isValidee(r)) return false;
      if (prefs.validation === 'validee' && !isValidee(r)) return false;
      if (prefs.incomplet && !isIncomplet(r)) return false;
      if (prefs.secteur && !labs(r.secteur_therapeutique).includes(prefs.secteur)) return false;
      if (prefs.classeTh && !labs(r.classe_therapeutique).includes(prefs.classeTh)) return false;
      if (prefs.classePh && !labs(r.classe_pharmacologique).includes(prefs.classePh)) return false;
      if (prefs.lieType && prefs.lieEntityId && !MED().lieAEntite(r, prefs.lieType, prefs.lieEntityId)) return false;
      return terms.every((t) => r._blob.includes(t));
    }));
  }

  /* ——— Rendu liste ——— */
  const pencil = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  function badges(r) {
    return '<span class="jp-badge jp-badge-' + esc(r.statut) + '">' + esc(r.statut) + '</span>'
      + (isValidee(r)
        ? ' <span class="jp-badge jp-badge-validee">Validée</span>'
        : ' <span class="jp-badge jp-badge-a-valider">À valider</span>');
  }

  function render() {
    const host = $('list');
    const rows = filtered();
    const cols = CHAMPS.filter((c) => prefs.columns.includes(c.code));
    const nValid = rows.filter(isValidee).length;
    $('refCount').textContent = rows.length === all.length ? rows.length + ' fiches' : rows.length + ' / ' + all.length;
    $('valCount').textContent = nValid + ' / ' + rows.length + ' validées';
    $('btnResetVal').disabled = !rows.length;
    $('toolbar').hidden = !all.length;

    if (!all.length) {
      global.JpUi.emptyState(host, { title: 'Aucune fiche' });
      return;
    }
    if (!rows.length) {
      global.JpUi.emptyState(host, { title: 'Aucun résultat' });
      return;
    }
    const slice = rows.slice(0, shown);
    host.innerHTML = '<table class="jp-table jp-catalogue-table"><thead><tr>'
      + '<th class="jp-admin-cat-actions-col"></th>'
      + cols.map((c) => '<th>' + esc(c.libelle) + '</th>').join('')
      + '<th>Statut</th></tr></thead><tbody>'
      + slice.map((r) => '<tr tabindex="0" data-id="' + esc(r.id) + '"' + (r.id === editingId ? ' class="is-selected"' : '') + '>'
        + '<td class="jp-admin-cat-actions-col"><button type="button" class="jp-icon-btn" data-edit="' + esc(r.id)
        + '" title="Modifier" aria-label="Modifier ' + esc(nomsOf(r) || r.dci || 'la fiche') + '">' + pencil + '</button></td>'
        + cols.map((c) => '<td class="jp-med-cell-wrap">' + esc(cellValue(r, c.code)) + '</td>').join('')
        + '<td>' + badges(r) + '</td></tr>').join('')
      + '</tbody></table>'
      + (rows.length > shown
        ? '<p style="text-align:center;margin:0.75rem 0"><button type="button" class="jp-btn jp-btn-ghost" id="btnMore">+ '
          + Math.min(PAGE_STEP, rows.length - shown) + '</button></p>'
        : '');
  }

  function onFilterChange(resetShown) {
    readPrefs();
    if (resetShown !== false) shown = PAGE_STEP;
    render();
  }

  function uniqueSorted(values) {
    return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' }));
  }

  function fillSelect(sel, values, allLabel, current) {
    sel.innerHTML = '<option value="">' + esc(allLabel) + '</option>'
      + values.map((v) => '<option value="' + esc(v) + '">' + esc(v) + '</option>').join('');
    sel.value = current && values.includes(current) ? current : '';
  }

  function syncFilterOptions() {
    fillSelect($('fSecteur'), uniqueSorted(all.flatMap((r) => labs(r.secteur_therapeutique))), 'Secteur', prefs.secteur);
    fillSelect($('fClasseTh'), uniqueSorted(all.flatMap((r) => labs(r.classe_therapeutique))), 'Classe théra.', prefs.classeTh);
    fillSelect($('fClassePh'), uniqueSorted(all.flatMap((r) => labs(r.classe_pharmacologique))), 'Classe pharma.', prefs.classePh);
    prefs.secteur = $('fSecteur').value;
    prefs.classeTh = $('fClasseTh').value;
    prefs.classePh = $('fClassePh').value;
  }

  function fillStaticSelects() {
    const opts = CHAMPS.map((c) => '<option value="' + esc(c.code) + '">' + esc(c.libelle) + '</option>').join('');
    $('fIncompletChamp').innerHTML = '<option value="">Identité (noms, DCI, secteur)</option>' + opts;
    $('fLieType').innerHTML = '<option value="">—</option>' + opts;
    $('cols').innerHTML = CHAMPS.map((c) => '<label class="jp-catalogue-col"><input type="checkbox" data-col="' + esc(c.code) + '"><span>'
      + esc(c.libelle) + '</span></label>').join('');
  }

  function applyPrefsToUi() {
    $('q').value = prefs.q;
    $('fSort').value = prefs.sort;
    $('fStatut').value = prefs.statut;
    $('fValidation').value = prefs.validation;
    $('fIncomplet').checked = prefs.incomplet;
    $('fIncompletChamp').value = prefs.incompletChamp;
    $('fIncompletChamp').disabled = !prefs.incomplet;
    $('fLieType').value = prefs.lieType;
    $('fLieEntity').disabled = !prefs.lieType;
    $('fLieEntity').value = prefs.lieEntityLabel;
    $('fLieEntityId').value = prefs.lieEntityId;
    $('fLieClear').hidden = !prefs.lieEntityId;
    document.querySelectorAll('#cols input[data-col]').forEach((el) => {
      el.checked = prefs.columns.includes(el.getAttribute('data-col'));
    });
  }

  function readPrefs() {
    prefs.q = $('q').value || '';
    prefs.sort = $('fSort').value || 'dci';
    prefs.statut = $('fStatut').value || '';
    prefs.validation = $('fValidation').value || '';
    prefs.secteur = $('fSecteur').value || '';
    prefs.classeTh = $('fClasseTh').value || '';
    prefs.classePh = $('fClassePh').value || '';
    prefs.incomplet = $('fIncomplet').checked;
    prefs.incompletChamp = $('fIncompletChamp').value || '';
    $('fIncompletChamp').disabled = !prefs.incomplet;
    prefs.lieType = $('fLieType').value || '';
    $('fLieEntity').disabled = !prefs.lieType;
    prefs.lieEntityId = $('fLieEntityId').value || '';
    if (prefs.lieEntityId) prefs.lieEntityLabel = $('fLieEntity').value || prefs.lieEntityLabel;
    const cols = [...document.querySelectorAll('#cols input[data-col]:checked')].map((el) => el.getAttribute('data-col'));
    prefs.columns = cols.length ? cols : DEFAULT_COLS.slice();
    savePrefs();
  }

  function setPrefsOpen(open) {
    $('prefsPanel').hidden = !open;
    $('prefsBtn').setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* ——— Filtre « lié à » (entité) ——— */
  async function fetchEntities(table, q) {
    const rows = await ENT().list(table, { q, actif: true, limit: 40 });
    const nq = norm(q);
    return rows.map((r) => ({ id: r.id, valeur: r.valeur, n: norm(r.valeur) }))
      .sort((a, b) => (a.n.startsWith(nq) ? 0 : 1) - (b.n.startsWith(nq) ? 0 : 1) || a.valeur.localeCompare(b.valeur, 'fr'))
      .slice(0, AC_MAX);
  }

  function hideLie() {
    const list = $('sug_lie');
    list.hidden = true;
    list.innerHTML = '';
    lieHighlight = -1;
  }

  async function updateLie() {
    const code = $('fLieType').value;
    const q = $('fLieEntity').value.trim();
    const c = champBy(code);
    if (!c || !q) { hideLie(); return; }
    const seq = ++lieSeq;
    try {
      const items = await fetchEntities(c.table, q);
      if (seq !== lieSeq) return;
      if (!items.length) { hideLie(); return; }
      lieHighlight = -1;
      $('sug_lie').innerHTML = items.map((it, i) => '<li role="option" class="jp-ac-item" data-lie-id="' + esc(it.id)
        + '" data-lie-valeur="' + esc(it.valeur) + '" data-i="' + i + '">' + esc(it.valeur) + '</li>').join('');
      $('sug_lie').hidden = false;
    } catch (e) {
      global.JpToast.fromError(e);
    }
  }

  function applyLie(id, valeur) {
    $('fLieEntity').value = valeur || '';
    $('fLieEntityId').value = id || '';
    $('fLieClear').hidden = !id;
    hideLie();
    onFilterChange();
  }

  function bindLie() {
    const input = $('fLieEntity');
    $('fLieType').addEventListener('change', () => {
      $('fLieEntity').value = '';
      $('fLieEntityId').value = '';
      prefs.lieEntityLabel = '';
      $('fLieClear').hidden = true;
      hideLie();
      onFilterChange();
    });
    input.addEventListener('input', () => {
      $('fLieEntityId').value = '';
      $('fLieClear').hidden = !input.value;
      void updateLie();
    });
    input.addEventListener('focus', () => { clearTimeout(lieBlur); void updateLie(); });
    input.addEventListener('blur', () => { lieBlur = setTimeout(hideLie, 160); });
    input.addEventListener('keydown', (e) => {
      const list = $('sug_lie');
      const items = list.hidden ? [] : [...list.querySelectorAll('.jp-ac-item')];
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && items.length) {
        e.preventDefault();
        items.forEach((el) => el.classList.remove('is-active'));
        lieHighlight = (lieHighlight + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[lieHighlight].classList.add('is-active');
      } else if (e.key === 'Enter' && items.length) {
        e.preventDefault();
        const it = items[Math.max(0, lieHighlight)];
        applyLie(it.getAttribute('data-lie-id'), it.getAttribute('data-lie-valeur'));
      } else if (e.key === 'Escape' && items.length) {
        e.preventDefault();
        hideLie();
      }
    });
    $('sug_lie').addEventListener('mousedown', (e) => {
      const it = e.target.closest('.jp-ac-item');
      if (!it) return;
      e.preventDefault();
      applyLie(it.getAttribute('data-lie-id'), it.getAttribute('data-lie-valeur'));
    });
    $('fLieClear').addEventListener('click', () => {
      $('fLieEntity').value = '';
      $('fLieEntityId').value = '';
      prefs.lieEntityLabel = '';
      $('fLieClear').hidden = true;
      hideLie();
      onFilterChange();
    });
  }

  /* ——— Éditeur : champs ——— */
  function fieldCard(c) {
    const span = c.card === 'N' || c.code === 'detail_pharmacologie' ? ' jp-field-span-2' : '';
    const sug = 'sug_' + c.code;
    if (c.card === 1) {
      return '<div class="jp-med-field-card' + span + '" data-champ="' + esc(c.code) + '">'
        + '<label for="val_' + esc(c.code) + '">' + esc(c.libelle) + '</label>'
        + '<div class="jp-entity-singular-row"><div class="jp-ac-wrap">'
        + '<input type="text" id="val_' + esc(c.code) + '" autocomplete="off" data-entity-id="" data-ac-code="' + esc(c.code)
        + '" aria-autocomplete="list" aria-controls="' + sug + '" placeholder="Rechercher ou créer…">'
        + '<ul id="' + sug + '" class="jp-ac-list" hidden role="listbox"></ul></div>'
        + '<button type="button" class="jp-link-btn" data-rename-singular="' + esc(c.code) + '" title="Renommer (toutes les fiches liées)" hidden>Renommer</button>'
        + '<button type="button" class="jp-link-btn jp-entity-clear" data-clear-singular="' + esc(c.code) + '" hidden>Effacer</button>'
        + '</div></div>';
    }
    return '<div class="jp-med-field-card' + span + '" data-champ="' + esc(c.code) + '">'
      + '<label for="val_' + esc(c.code) + '">' + esc(c.libelle) + '</label>'
      + '<div class="jp-entity-picker"><div class="jp-entity-chips" id="chips_' + esc(c.code) + '" role="list"></div>'
      + '<div class="jp-ac-wrap"><input type="search" id="val_' + esc(c.code) + '" autocomplete="off" data-ac-code="' + esc(c.code)
      + '" aria-autocomplete="list" aria-controls="' + sug + '" placeholder="Rechercher ou créer… (Entrée)">'
      + '<ul id="' + sug + '" class="jp-ac-list" hidden role="listbox"></ul></div></div></div>';
  }

  function buildFields() {
    const used = new Set();
    const parts = [];
    for (const sec of SECTIONS) {
      const cards = [];
      for (const code of sec.codes) {
        const c = champBy(code);
        if (!c || used.has(code)) continue;
        used.add(code);
        cards.push(fieldCard(c));
      }
      if (cards.length) {
        parts.push('<section class="jp-med-section"><h3 class="jp-med-section-title">' + esc(sec.title)
          + '</h3><div class="jp-med-grid">' + cards.join('') + '</div></section>');
      }
    }
    for (const c of CHAMPS) {
      if (used.has(c.code)) continue;
      parts.push('<section class="jp-med-section"><h3 class="jp-med-section-title">' + esc(c.libelle)
        + '</h3><div class="jp-med-grid">' + fieldCard(c) + '</div></section>');
    }
    $('fields').innerHTML = parts.join('');
    bindFieldAutocomplete($('fields'));
  }

  const getMulti = (code) => pickerMulti[code] || [];

  function setMulti(code, items) {
    pickerMulti[code] = items || [];
    const host = $('chips_' + code);
    if (!host) return;
    host.innerHTML = pickerMulti[code].map((it) => '<span class="jp-entity-chip" role="listitem">'
      + '<button type="button" class="jp-entity-chip-label" style="background:none;border:0;padding:0;font:inherit;color:inherit;cursor:text" data-rename-chip="'
      + esc(code) + '" data-id="' + esc(it.id) + '" title="Renommer (toutes les fiches liées)">' + esc(it.valeur) + '</button>'
      + '<button type="button" class="jp-entity-chip-remove" data-remove-chip="' + esc(code) + '" data-id="' + esc(it.id)
      + '" aria-label="Retirer">×</button></span>').join('');
  }

  function syncSingular(code) {
    const input = $('val_' + code);
    if (!input) return;
    const clear = document.querySelector('[data-clear-singular="' + code + '"]');
    const ren = document.querySelector('[data-rename-singular="' + code + '"]');
    if (clear) clear.hidden = !(input.value || input.dataset.entityId);
    if (ren) ren.hidden = !input.dataset.entityId;
  }

  function hideSug(code) {
    const codes = code ? [code] : CHAMPS.map((c) => c.code);
    for (const k of codes) {
      const list = $('sug_' + k);
      if (list && !list.hidden) { list.hidden = true; list.innerHTML = ''; }
    }
    if (!code || acActive === code) { acActive = null; acHighlight = -1; }
  }

  async function updateSug(code) {
    const c = champBy(code);
    const input = $('val_' + code);
    if (!c || !input) return;
    const q = input.value.trim();
    if (!q) { hideSug(code); return; }
    const seq = (acSeq[code] = (acSeq[code] || 0) + 1);
    let items;
    try {
      items = await fetchEntities(c.table, q);
    } catch (e) {
      global.JpToast.fromError(e);
      return;
    }
    if (seq !== acSeq[code] || input.value.trim() !== q) return;
    if (c.card === 'N') {
      const sel = new Set(getMulti(code).map((x) => String(x.id)));
      items = items.filter((it) => !sel.has(String(it.id)));
    }
    const exact = norm(q);
    const hasExact = items.some((it) => it.n === exact);
    const list = $('sug_' + code);
    if (!items.length && hasExact) { hideSug(code); return; }
    acActive = code;
    acHighlight = -1;
    list.innerHTML = items.map((it, i) => '<li role="option" class="jp-ac-item" data-ac-idx="' + i + '" data-ac-id="' + esc(it.id)
      + '" data-ac-valeur="' + esc(it.valeur) + '">' + esc(it.valeur) + '</li>').join('')
      + (hasExact ? '' : '<li role="option" class="jp-ac-item jp-ac-create" data-ac-idx="' + items.length
        + '" data-ac-create="1" data-ac-valeur="' + esc(q) + '">Créer « ' + esc(q) + ' »</li>');
    list.hidden = false;
  }

  async function applySuggestion(code, id, valeur, create) {
    const c = champBy(code);
    const input = $('val_' + code);
    if (!c || !input) return;
    let entId = id || '';
    let entVal = valeur || '';
    if (create || (!entId && entVal)) {
      try {
        const ent = await ENT().findOrCreate(c.table, entVal);
        if (!ent?.id) throw new Error('Création impossible');
        entId = ent.id;
        entVal = ent.valeur || entVal;
      } catch (e) {
        global.JpToast.fromError(e);
        return;
      }
    }
    if (!entId || !entVal) return;
    if (c.card === 1) {
      input.value = entVal;
      input.dataset.entityId = entId;
      syncSingular(code);
    } else {
      const items = getMulti(code);
      if (!items.some((x) => String(x.id) === String(entId))) setMulti(code, items.concat([{ id: entId, valeur: entVal }]));
      input.value = '';
    }
    dirty = true;
    hideSug(code);
    input.focus();
  }

  function moveHighlight(delta) {
    const list = acActive && $('sug_' + acActive);
    if (!list || list.hidden) return;
    const items = [...list.querySelectorAll('.jp-ac-item')];
    if (!items.length) return;
    items.forEach((el) => el.classList.remove('is-active'));
    acHighlight = (acHighlight + delta + items.length) % items.length;
    items[acHighlight].classList.add('is-active');
    items[acHighlight].scrollIntoView({ block: 'nearest' });
  }

  async function renameEntity(table, id, current) {
    const next = global.prompt('Renommer (toutes les fiches liées) :', current);
    if (next == null) return null;
    const v = next.trim();
    if (!v || v === current) return null;
    try {
      const row = await ENT().update(table, id, { valeur: v });
      void global.JpLogs?.action?.('entite_renommee', { table, id });
      global.JpToast.ok('Renommé');
      return row?.valeur || v;
    } catch (e) {
      global.JpToast.fromError(e);
      return null;
    }
  }

  function bindFieldAutocomplete(host) {
    host.addEventListener('input', (e) => {
      const el = e.target.closest('[data-ac-code]');
      if (!el) return;
      const code = el.getAttribute('data-ac-code');
      dirty = true;
      if (champBy(code)?.card === 1) { el.dataset.entityId = ''; syncSingular(code); }
      void updateSug(code);
    });
    host.addEventListener('focusin', (e) => {
      const el = e.target.closest('[data-ac-code]');
      if (!el) return;
      clearTimeout(acBlur);
      void updateSug(el.getAttribute('data-ac-code'));
    });
    host.addEventListener('focusout', (e) => {
      const el = e.target.closest('[data-ac-code]');
      if (!el) return;
      const code = el.getAttribute('data-ac-code');
      acBlur = setTimeout(() => hideSug(code), 160);
    });
    host.addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-remove-chip]');
      if (rm) {
        e.preventDefault();
        const code = rm.getAttribute('data-remove-chip');
        setMulti(code, getMulti(code).filter((x) => String(x.id) !== rm.getAttribute('data-id')));
        dirty = true;
        return;
      }
      const ren = e.target.closest('[data-rename-chip]');
      if (ren) {
        const code = ren.getAttribute('data-rename-chip');
        const id = ren.getAttribute('data-id');
        const items = getMulti(code);
        const cur = items.find((x) => String(x.id) === id);
        if (!cur) return;
        const v = await renameEntity(champBy(code).table, id, cur.valeur);
        if (v) setMulti(code, items.map((x) => (String(x.id) === id ? { id: x.id, valeur: v } : x)));
        return;
      }
      const rs = e.target.closest('[data-rename-singular]');
      if (rs) {
        const code = rs.getAttribute('data-rename-singular');
        const input = $('val_' + code);
        if (!input?.dataset.entityId) return;
        const v = await renameEntity(champBy(code).table, input.dataset.entityId, input.value);
        if (v) input.value = v;
        return;
      }
      const clr = e.target.closest('[data-clear-singular]');
      if (clr) {
        e.preventDefault();
        const code = clr.getAttribute('data-clear-singular');
        const input = $('val_' + code);
        if (input) { input.value = ''; input.dataset.entityId = ''; }
        syncSingular(code);
        hideSug(code);
        dirty = true;
      }
    });
    host.addEventListener('keydown', (e) => {
      const el = e.target.closest('[data-ac-code]');
      if (!el) return;
      const code = el.getAttribute('data-ac-code');
      const list = $('sug_' + code);
      const open = list && !list.hidden;
      if (e.key === 'ArrowDown' && open) { e.preventDefault(); moveHighlight(1); }
      else if (e.key === 'ArrowUp' && open) { e.preventDefault(); moveHighlight(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        const multi = champBy(code).card === 'N';
        const count = open ? list.querySelectorAll('.jp-ac-item').length : 0;
        const item = open && (acHighlight >= 0 || (!multi && count === 1))
          ? list.querySelector('.jp-ac-item[data-ac-idx="' + Math.max(0, acHighlight) + '"]') : null;
        if (item) {
          void applySuggestion(code, item.getAttribute('data-ac-id'), item.getAttribute('data-ac-valeur'), item.getAttribute('data-ac-create') === '1');
        } else if (multi && el.value.trim()) {
          void applySuggestion(code, '', el.value.trim(), true);
        }
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        e.stopPropagation();
        hideSug(code);
      }
    });
    host.addEventListener('mousedown', (e) => {
      const item = e.target.closest('.jp-ac-item');
      if (!item) return;
      const list = item.closest('.jp-ac-list');
      const code = list?.id?.replace(/^sug_/, '');
      if (!code) return;
      e.preventDefault();
      clearTimeout(acBlur);
      void applySuggestion(code, item.getAttribute('data-ac-id'), item.getAttribute('data-ac-valeur'), item.getAttribute('data-ac-create') === '1');
    });
  }

  /* ——— Éditeur : ouverture / sauvegarde ——— */
  const isEditorOpen = () => !$('editorModal').hidden;

  function multiArr(row, code) {
    if (code === 'nom_commercial') return Array.isArray(row.noms_commerciaux) ? row.noms_commerciaux : [];
    return Array.isArray(row[code]) ? row[code] : [];
  }

  function highlightRow(id) {
    document.querySelectorAll('#list tbody tr').forEach((tr) => {
      tr.classList.toggle('is-selected', tr.getAttribute('data-id') === id);
    });
  }

  function resetForm() {
    editingId = null;
    pickerMulti = {};
    $('editorTitle').textContent = 'Nouvelle fiche';
    $('fStatutEd').value = 'brouillon';
    $('edValBadge').innerHTML = '';
    for (const c of CHAMPS) {
      const input = $('val_' + c.code);
      if (!input) continue;
      input.value = '';
      if (c.card === 1) { input.dataset.entityId = ''; syncSingular(c.code); } else setMulti(c.code, []);
    }
  }

  function openEditor(row) {
    $('editorModal').hidden = false;
    $('editor').scrollTop = 0;
    document.querySelector('.jp-med-editor-body')?.scrollTo(0, 0);
    clearBdm();
    if (!row) {
      resetForm();
      highlightRow(null);
      dirty = false;
      $('bdmQ').focus();
      return;
    }
    resetForm();
    editingId = row.id;
    $('editorTitle').textContent = nomsOf(row) || row.dci || 'Fiche';
    $('fStatutEd').value = row.statut || 'brouillon';
    $('edValBadge').innerHTML = isValidee(row)
      ? '<span class="jp-badge jp-badge-validee">Validée</span>'
      : '<span class="jp-badge jp-badge-a-valider">À valider</span>';
    for (const c of CHAMPS) {
      const input = $('val_' + c.code);
      if (!input) continue;
      if (c.card === 1) {
        input.value = row[c.code] || '';
        input.dataset.entityId = row[c.fk] || '';
        syncSingular(c.code);
      } else {
        setMulti(c.code, multiArr(row, c.code).filter((x) => x && x.id)
          .map((x) => ({ id: x.id, valeur: MED().labelFrom(x) })));
      }
    }
    highlightRow(row.id);
    dirty = false;
    (document.querySelector('#fields input') || $('bdmQ')).focus();
  }

  function closeEditor(force) {
    if (!force && dirty && !global.confirm('Fermer sans enregistrer ?')) return;
    hideSug();
    $('editorModal').hidden = true;
    editingId = null;
    dirty = false;
    highlightRow(null);
    if (queueActive && queueResume) resumeQueue();
  }

  function collectPayload(validee) {
    const singular = {};
    const multi = {};
    for (const c of CHAMPS) {
      const input = $('val_' + c.code);
      if (!input) continue;
      if (c.card === 1) {
        const v = input.value.trim();
        const id = input.dataset.entityId || '';
        if (id && v) singular[c.code] = { id };
        else if (v) singular[c.code] = { valeur: v };
      } else {
        const items = getMulti(c.code).map((it) => ({ id: it.id }));
        const pending = input.value.trim();
        if (pending) items.push({ valeur: pending });
        multi[c.code] = items;
      }
    }
    return {
      statut: $('fStatutEd').value,
      fiche_validee: !!validee,
      singular,
      multi,
    };
  }

  async function doSave(validee) {
    const btns = [$('btnSave'), $('btnSaveVal')];
    btns.forEach((b) => { b.disabled = true; });
    try {
      const payload = collectPayload(validee);
      if (!payload.singular.dci && !(payload.multi.nom_commercial || []).length) {
        global.JpToast.warn('DCI ou nom commercial requis');
        return;
      }
      const saved = await MED().save(payload, editingId);
      global.JpToast.ok(validee ? 'Enregistrée et validée' : 'Enregistrée');
      dirty = false;
      await refreshAll();
      if (validee) { closeEditor(true); return; }
      const row = all.find((r) => r.id === (saved?.id || editingId));
      if (row) openEditor(row); else closeEditor(true);
    } catch (e) {
      global.JpToast.fromError(e);
      void global.JpLogs?.error?.('medicament_save', { message: e?.message });
    } finally {
      btns.forEach((b) => { b.disabled = false; });
    }
  }

  async function refreshAll() {
    all = decorate(await MED().list());
    syncFilterOptions();
    applyPrefsToUi();
    savePrefs();
    render();
  }

  /* ——— BDPM ——— */
  function clearBdm() {
    bdmRows = [];
    $('bdmResults').innerHTML = '';
    $('bdmResults').hidden = true;
    $('bdmQ').value = '';
  }

  function renderBdm(rows) {
    bdmRows = rows || [];
    const host = $('bdmResults');
    host.innerHTML = bdmRows.length
      ? bdmRows.map((r, i) => '<button type="button" class="jp-bdm-result" role="option" data-bdm-idx="' + i + '">'
        + '<span class="jp-bdm-result-name">' + esc(r.denomination || '—') + '</span>'
        + '<span class="jp-bdm-result-meta">' + esc(r.substances || '—') + '</span>'
        + '<span class="jp-bdm-result-forme">' + esc(r.forme_pharmaceutique || '') + '</span></button>').join('')
      : '<p class="jp-bdm-empty">Aucun résultat</p>';
    host.hidden = false;
  }

  async function addNom(valeur) {
    const v = String(valeur || '').trim();
    if (!v) return;
    const ent = await ENT().findOrCreate('noms_commerciaux', v);
    if (!ent?.id) return;
    const items = getMulti('nom_commercial');
    if (!items.some((x) => String(x.id) === String(ent.id))) {
      setMulti('nom_commercial', items.concat([{ id: ent.id, valeur: ent.valeur || v }]));
      dirty = true;
    }
  }

  function setDci(ent, fallback) {
    const inp = $('val_dci');
    if (!inp) return;
    inp.value = ent?.valeur || fallback;
    inp.dataset.entityId = ent?.id || '';
    syncSingular('dci');
    dirty = true;
  }

  async function applyBdm(row) {
    const pre = global.JpBdm.pickToPrefill(row);
    clearBdm();
    try {
      let dciEnt = null;
      if (pre.dci) {
        dciEnt = await ENT().findOrCreate('dcis', pre.dci);
        const existing = dciEnt?.id ? await MED().findByDciId(dciEnt.id, editingId) : null;
        if (existing) {
          openEditor(existing);
          if (pre.nom_commercial) await addNom(pre.nom_commercial);
          global.JpToast.ok('DCI existante — nom ajouté');
          return;
        }
      }
      if (pre.nom_commercial) await addNom(pre.nom_commercial);
      if (dciEnt) setDci(dciEnt, pre.dci);
      global.JpToast.ok('Prérempli');
    } catch (e) {
      global.JpToast.fromError(e);
    }
  }

  function bindBdm() {
    const input = $('bdmQ');
    input.addEventListener('input', () => {
      clearTimeout(global.__jpBdmT);
      const q = input.value.trim();
      if (q.length < 2) { bdmRows = []; $('bdmResults').hidden = true; return; }
      global.__jpBdmT = setTimeout(async () => {
        const req = ++bdmReq;
        try {
          const rows = await global.JpBdm.searchProducts(q, 20);
          if (req === bdmReq) renderBdm(rows);
        } catch (e) {
          if (req !== bdmReq) return;
          $('bdmResults').hidden = true;
          global.JpToast.fromError(e);
        }
      }, 280);
    });
    $('bdmResults').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-bdm-idx]');
      if (btn && bdmRows[Number(btn.getAttribute('data-bdm-idx'))]) void applyBdm(bdmRows[Number(btn.getAttribute('data-bdm-idx'))]);
    });
  }

  /* ——— Revue « Valider fiches » ——— */
  const queueRow = () => all.find((r) => r.id === queue[queueIdx]) || null;

  function renderQueue() {
    const total = queue.length;
    const row = queueRow();
    if (!total || queueIdx >= total || !row) {
      $('valProgress').textContent = 'Terminé';
      $('valBody').innerHTML = '<p class="jp-title" style="font-size:1.1rem">Revue terminée</p>';
      $('valOk').disabled = true;
      $('valEdit').disabled = true;
      return;
    }
    $('valProgress').textContent = (queueIdx + 1) + ' / ' + total;
    const lines = CHAMPS.map((c) => {
      const v = cellValue(row, c.code);
      const empty = v === '—';
      return '<div class="jp-validation-field' + (empty ? ' is-empty' : '') + '"><span class="jp-validation-field-label">'
        + esc(c.libelle) + '</span><span class="jp-validation-field-value">' + esc(v) + '</span></div>';
    }).join('');
    $('valBody').innerHTML = '<div class="jp-validation-identity"><p class="jp-validation-dci">' + esc(row.dci || 'Sans DCI')
      + '</p><p class="jp-validation-noms">' + esc(nomsOf(row) || '—') + '</p><div class="jp-validation-badges">' + badges(row)
      + '</div></div><div class="jp-validation-fields">' + lines + '</div>';
    $('valOk').disabled = false;
    $('valEdit').disabled = false;
  }

  function openQueue() {
    const base = filtered().filter((r) => !isValidee(r));
    if (!base.length) { global.JpToast.warn('Rien à valider (filtre actuel)'); return; }
    queue = base.map((r) => r.id);
    queueIdx = 0;
    queueActive = true;
    queueResume = false;
    $('valModal').hidden = false;
    renderQueue();
    $('valOk').focus();
  }

  function closeQueue() {
    $('valModal').hidden = true;
    queueActive = false;
    queueResume = false;
    queue = [];
    queueIdx = 0;
  }

  function resumeQueue() {
    queueResume = false;
    const cur = queue[queueIdx];
    queue = queue.filter((id) => { const r = all.find((x) => x.id === id); return r && !isValidee(r); });
    const i = queue.indexOf(cur);
    queueIdx = queue.length ? Math.max(0, i < 0 ? Math.min(queueIdx, queue.length - 1) : i) : 0;
    $('valModal').hidden = false;
    renderQueue();
  }

  async function queueValidate() {
    const row = queueRow();
    if (!row) return;
    $('valOk').disabled = true;
    try {
      await MED().setFicheValidee(row.id, true);
      row.fiche_validee = true;
      queueIdx += 1;
      render();
      renderQueue();
    } catch (e) {
      global.JpToast.fromError(e);
      $('valOk').disabled = false;
    }
  }

  async function resetValidation() {
    const rows = filtered();
    if (!rows.length) return;
    if (!global.confirm('Remettre à « à valider » : ' + rows.length + ' fiche(s) du filtre ?')) return;
    try {
      await MED().resetFicheValidee(rows.map((r) => r.id));
      global.JpToast.ok('OK');
      await refreshAll();
    } catch (e) {
      global.JpToast.fromError(e);
    }
  }

  /* ——— Boot ——— */
  function bind() {
    let t = null;
    $('q').addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => onFilterChange(), 120);
    });
    $('q').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const first = filtered()[0];
        if (first) openEditor(first);
      } else if (e.key === 'ArrowDown') {
        document.querySelector('#list tbody tr')?.focus();
        e.preventDefault();
      }
    });
    ['fStatut', 'fValidation', 'fSort', 'fSecteur', 'fClasseTh', 'fClassePh', 'fIncomplet', 'fIncompletChamp']
      .forEach((id) => $(id).addEventListener('change', () => onFilterChange()));
    $('cols').addEventListener('change', () => onFilterChange(false));
    bindLie();

    $('prefsBtn').addEventListener('click', () => setPrefsOpen($('prefsPanel').hidden));
    $('prefsClose').addEventListener('click', () => setPrefsOpen(false));
    $('prefsReset').addEventListener('click', () => {
      prefs = defaultPrefs();
      savePrefs();
      applyPrefsToUi();
      syncFilterOptions();
      onFilterChange();
    });

    $('list').addEventListener('click', (e) => {
      if (e.target.closest('#btnMore')) { shown += PAGE_STEP; render(); return; }
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      const row = all.find((r) => r.id === tr.getAttribute('data-id'));
      if (row) openEditor(row);
    });
    $('list').addEventListener('keydown', (e) => {
      const tr = e.target.closest('tr[data-id]');
      if (!tr) return;
      if (e.key === 'Enter') {
        const row = all.find((r) => r.id === tr.getAttribute('data-id'));
        if (row) openEditor(row);
      } else if (e.key === 'ArrowDown') { e.preventDefault(); tr.nextElementSibling?.focus(); }
      else if (e.key === 'ArrowUp') {
        e.preventDefault();
        (tr.previousElementSibling || $('q')).focus();
      }
    });

    $('btnNew').addEventListener('click', () => openEditor(null));
    $('btnIa')?.addEventListener('click', () => {
      if (!global.JpReferentielIA) {
        global.JpToast.warn('Module IA référentiel indisponible');
        return;
      }
      global.JpReferentielIA.open({
        onSaved: async (saved) => {
          await refreshAll();
          if (saved?.id) {
            const row = all.find((r) => r.id === saved.id);
            if (row) openEditor(row);
          }
        },
      });
    });
    $('btnValider').addEventListener('click', openQueue);
    $('btnResetVal').addEventListener('click', () => void resetValidation());

    $('form').addEventListener('submit', (e) => { e.preventDefault(); void doSave(false); });
    $('btnSaveVal').addEventListener('click', () => void doSave(true));
    $('btnCancel').addEventListener('click', () => closeEditor());
    document.querySelector('[data-close-editor]').addEventListener('click', () => closeEditor());
    ['fStatutEd'].forEach((id) => $(id).addEventListener('change', () => { dirty = true; }));

    $('valOk').addEventListener('click', () => void queueValidate());
    $('valEdit').addEventListener('click', () => {
      const row = queueRow();
      if (!row) return;
      queueResume = true;
      $('valModal').hidden = true;
      openEditor(row);
    });
    document.querySelectorAll('[data-close-validation]').forEach((el) => el.addEventListener('click', closeQueue));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (!$('valModal').hidden) closeQueue();
        else if (isEditorOpen() && !acActive) closeEditor();
        else if (!$('prefsPanel').hidden) setPrefsOpen(false);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's' && isEditorOpen()) {
        e.preventDefault();
        void doSave(false);
      } else if (e.key === '/' && !isEditorOpen() && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) {
        e.preventDefault();
        $('q').focus();
      }
    });
  }

  async function boot() {
    global.JpUi.bootPage({ module: 'admin-referentiel', homeHref: 'index.html' });
    $('helpRef')?.appendChild(global.JpModal.helpButton('Référentiel', [
      'Toutes les fiches : recherche, filtres, édition.',
      'Clic ou Entrée sur une ligne = éditer. « / » = recherche. Ctrl+S = enregistrer.',
      'Toute modification remet la fiche « à valider » ; « Enregistrer et valider » la valide.',
      'Renommer une valeur (clic sur le libellé) la change pour toutes les fiches liées.',
      'Ce qui est visible par les apprenants se règle dans Modif parcours.',
    ]));
    fillStaticSelects();
    buildFields();
    bindBdm();
    bind();
    applyPrefsToUi();
    try {
      await refreshAll();
      const id = new URLSearchParams(location.search).get('id');
      if (id) {
        const row = all.find((r) => r.id === id) || await MED().getById(id);
        if (row) openEditor(row); else global.JpToast.warn('Fiche introuvable');
      }
    } catch (e) {
      global.JpToast.fromError(e);
      void global.JpLogs?.error?.('referentiel_list', { message: e?.message });
      $('list').innerHTML = '<p class="jp-muted">Erreur de chargement</p>';
    }
  }

  global.JpReferentielAdmin = { boot };
})(window);
