/**
 * Module Clôture — recherche dossiers actifs + modal de clôture (partagé avec Suivi).
 */
(function (global) {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function infoBanner(bodyHtml) {
    return `<div class="loc-info-banner" role="note">
      <p class="loc-info-banner-title">Information</p>
      <div class="loc-info-banner-body">${bodyHtml}</div>
    </div>`;
  }

  function patientLabel(d) {
    const p = d?.patient || {};
    return [p.nom, p.prenom].filter(Boolean).join(' ').trim() || '—';
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso);
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function appareilRef(a) {
    if (!a) return '—';
    const parts = [];
    if (a.matricule) parts.push(`Mat. ${a.matricule}`);
    if (a.numero_pharmacie) parts.push(`N° ${a.numero_pharmacie}`);
    return parts.join(' · ') || '—';
  }

  function cautionClotureLabel(caution) {
    if (caution === 'especes') return 'Espèces rendues ?';
    if (caution === 'cheque_150') return 'Chèque / caution rendue ?';
    if (!caution) return 'Aucune caution (rien) — OK ?';
    return 'Caution rendue ?';
  }

  function clotureOuiMeta(prefix, defaultDate, defaultOp) {
    return `<div class="loc-cloture-meta loc-grid-2" data-meta-for="${prefix}" hidden>
          <label class="loc-field">Quand ?<input type="date" name="${prefix}_le" value="${esc(defaultDate || '')}"></label>
          <label class="loc-field">Par qui (OP)<input name="${prefix}_op" value="${esc(defaultOp || '')}" placeholder="Code OP"></label>
        </div>`;
  }

  function bindClotureOuiMeta(modal, selectName, prefix) {
    const sel = modal.querySelector(`[name=${selectName}]`);
    const box = modal.querySelector(`[data-meta-for="${prefix}"]`);
    const sync = () => {
      const oui = sel.value === 'oui';
      box.hidden = !oui;
      box.querySelectorAll('input').forEach((inp) => {
        inp.required = oui;
      });
    };
    sel.addEventListener('change', sync);
    sync();
  }

  /**
   * Modal de clôture identique à Suivi.
   * @param {object} d dossier enrichi
   * @param {{
   *   defaultOp?: string,
   *   notes?: string|null,
   *   showMsg?: (msg: string, err?: boolean) => void,
   *   onSuccess?: () => void|Promise<void>,
   * }} [opts]
   */
  function openModal(d, opts = {}) {
    const showMsg =
      typeof opts.showMsg === 'function'
        ? opts.showMsg
        : (msg, err) => {
            if (err) window.alert(msg);
          };
    const cautionLabel = cautionClotureLabel(d.caution);
    const today = LocationRules.todayISO();
    const defaultOp = String(opts.defaultOp || d.code_op || '').trim();
    const modal = el(`<div class="loc-modal" role="dialog" aria-labelledby="clClotureTitle">
      <div class="loc-modal-backdrop" data-close></div>
      <div class="loc-modal-panel">
        <h3 id="clClotureTitle">Clôturer le dossier</h3>
        ${infoBanner('<p>Pour chaque réponse « Oui », renseignez la date et l’opérateur.</p>')}
        <div class="loc-grid-2" style="margin-top:10px">
          <label class="loc-field loc-span-2">Appareil rendu ?
            <select name="cl_appareil" required>
              <option value="">—</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </label>
          ${clotureOuiMeta('cl_appareil', today, defaultOp)}
          <label class="loc-field loc-span-2">${esc(cautionLabel)}
            <select name="cl_caution" required>
              <option value="">—</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </label>
          ${clotureOuiMeta('cl_caution', today, defaultOp)}
          <label class="loc-field loc-span-2">Facturation OK ?
            <select name="cl_factu" required>
              <option value="">—</option>
              <option value="oui">Oui</option>
              <option value="non">Non</option>
            </select>
          </label>
          ${clotureOuiMeta('cl_factu', today, defaultOp)}
          <label class="loc-field loc-span-2">Commentaire à ajouter au dossier (optionnel)
            <textarea name="cl_commentaire" rows="3" placeholder="Optionnel"></textarea>
          </label>
        </div>
        <div class="loc-modal-actions">
          <button type="button" class="loc-btn" id="clClotureConfirm">Confirmer la clôture</button>
          <button type="button" class="loc-btn loc-btn-ghost" data-close>Annuler</button>
        </div>
      </div>
    </div>`);
    document.body.appendChild(modal);
    bindClotureOuiMeta(modal, 'cl_appareil', 'cl_appareil');
    bindClotureOuiMeta(modal, 'cl_caution', 'cl_caution');
    bindClotureOuiMeta(modal, 'cl_factu', 'cl_factu');
    const close = () => modal.remove();
    modal.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    modal.querySelector('#clClotureConfirm').addEventListener('click', async () => {
      const appareil = modal.querySelector('[name=cl_appareil]').value;
      const caution = modal.querySelector('[name=cl_caution]').value;
      const factu = modal.querySelector('[name=cl_factu]').value;
      if (!appareil || !caution || !factu) {
        showMsg('Répondez aux trois questions Oui/Non.', true);
        return;
      }
      const readMeta = (prefix, isOui) => {
        if (!isOui) return { le: null, op: null };
        const le = modal.querySelector(`[name=${prefix}_le]`).value;
        const op = modal.querySelector(`[name=${prefix}_op]`).value.trim();
        return { le: le || null, op: op || null };
      };
      const metaApp = readMeta('cl_appareil', appareil === 'oui');
      const metaCaut = readMeta('cl_caution', caution === 'oui');
      const metaFact = readMeta('cl_factu', factu === 'oui');
      if (appareil === 'oui' && (!metaApp.le || !metaApp.op)) {
        showMsg('Indiquez quand et par qui pour « Appareil rendu ».', true);
        return;
      }
      if (caution === 'oui' && (!metaCaut.le || !metaCaut.op)) {
        showMsg('Indiquez quand et par qui pour la caution.', true);
        return;
      }
      if (factu === 'oui' && (!metaFact.le || !metaFact.op)) {
        showMsg('Indiquez quand et par qui pour « Facturation OK ».', true);
        return;
      }
      try {
        await LocationData.cloturerDossier(d.id, {
          appareil_rendu: appareil === 'oui',
          appareil_rendu_le: metaApp.le,
          appareil_rendu_op: metaApp.op,
          caution_rendue: caution === 'oui',
          caution_rendue_le: metaCaut.le,
          caution_rendue_op: metaCaut.op,
          facturation_ok: factu === 'oui',
          facturation_ok_le: metaFact.le,
          facturation_ok_op: metaFact.op,
          commentaire: modal.querySelector('[name=cl_commentaire]').value,
          notes: opts.notes != null ? opts.notes : d.notes || null,
          code_op: defaultOp || null,
        });
        close();
        if (typeof opts.onSuccess === 'function') await opts.onSuccess();
        else showMsg('Dossier clôturé.');
      } catch (e) {
        showMsg(e.message || 'Erreur clôture', true);
      }
    });
  }

  function canSuivi(ctx) {
    return typeof ctx.can === 'function' ? ctx.can('module_suivi') : true;
  }

  function canCloturer(ctx) {
    return typeof ctx.can === 'function' ? ctx.can('module_cloture') : true;
  }

  async function mount(root, ctx) {
    root.innerHTML = '';
    const wrap = el(`<div class="loc-module loc-cloture">
      <div class="loc-search-row">
        <input type="search" id="clSearch" placeholder="Nom, prénom, type, matricule, n° interne…" autocomplete="off">
      </div>
      <div class="loc-bar">
        <button type="button" class="loc-btn loc-btn-ghost loc-toggle-btn" id="clToggleFilters" aria-expanded="false" aria-controls="clFilters">Filtres</button>
        <button type="button" class="loc-btn loc-btn-ghost" id="clRefresh">Actualiser</button>
      </div>
      <div class="loc-toolbar loc-filters" id="clFilters" hidden>
        <select id="clType">
          <option value="">Tous types</option>
          ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <label class="loc-check loc-check-inline"><input type="checkbox" id="clContact"> À contacter</label>
      </div>
      <div class="loc-list-panel" id="clListPanel">
        <div class="loc-list" id="clList"><p class="loc-muted">Chargement…</p></div>
      </div>
      <div class="loc-detail" id="clDetail" hidden></div>
      <p class="loc-msg" id="clMsg" hidden></p>
    </div>`);
    root.appendChild(wrap);

    const searchEl = wrap.querySelector('#clSearch');
    const filtersEl = wrap.querySelector('#clFilters');
    const btnFilters = wrap.querySelector('#clToggleFilters');
    const listEl = wrap.querySelector('#clList');
    const detailEl = wrap.querySelector('#clDetail');
    const msgEl = wrap.querySelector('#clMsg');

    let allRows = [];
    let filtered = [];
    let selectedId = null;
    let searchTimer = null;

    function setToggle(btn, panel, open) {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('is-active', open);
    }

    btnFilters.addEventListener('click', () => {
      setToggle(btnFilters, filtersEl, filtersEl.hidden);
    });
    setToggle(btnFilters, filtersEl, false);

    function showMsg(t, err) {
      msgEl.hidden = !t;
      msgEl.textContent = t || '';
      msgEl.classList.toggle('loc-msg-err', !!err);
    }

    function renderList() {
      if (!filtered.length) {
        listEl.innerHTML = `<p class="loc-muted">${
          searchEl.value.trim() ? 'Aucun dossier actif trouvé.' : 'Aucun dossier actif.'
        }</p>`;
        return;
      }
      listEl.innerHTML = filtered
        .map((d) => {
          const a = d.appareil_actif || {};
          return `<button type="button" class="loc-list-item${d.id === selectedId ? ' active' : ''}" data-id="${esc(d.id)}">
            <strong>${esc(patientLabel(d))}</strong>
            <span>${esc(LocationRules.typeLabel(a.type_appareil))} · ${esc(appareilRef(a))} · fin ${esc(fmtDate(d.date_fin))}</span>
          </button>`;
        })
        .join('');
      listEl.querySelectorAll('[data-id]').forEach((b) => {
        b.addEventListener('click', () => void selectDossier(b.dataset.id));
      });
    }

    function applyFilter() {
      filtered = allRows.filter((d) => LocationData.matchesDossierSearch(d, searchEl.value));
      renderList();
    }

    function renderDetail(d) {
      const a = d.appareil_actif || {};
      const suiviBtn = canSuivi(ctx)
        ? `<button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" id="clOpenSuivi" title="Ouvrir Suivi" aria-label="Ouvrir Suivi">✎</button>`
        : '';
      const clotureBtn = canCloturer(ctx)
        ? `<button type="button" class="loc-btn" id="clOpenModal">Clôturer le dossier</button>`
        : '';
      detailEl.hidden = false;
      detailEl.innerHTML = `
        <div class="loc-card">
          <div class="loc-card-body">
            <div class="loc-dossier-actions">
              <strong>${esc(patientLabel(d))}</strong>
              ${suiviBtn}
            </div>
            <p class="loc-muted">${esc(LocationRules.typeLabel(a.type_appareil))} · ${esc(appareilRef(a))} · fin ${esc(fmtDate(d.date_fin))}</p>
            <div class="loc-form-actions">
              ${clotureBtn || '<p class="loc-muted">Clôture non autorisée pour votre rôle.</p>'}
            </div>
          </div>
        </div>
      `;
      detailEl.querySelector('#clOpenSuivi')?.addEventListener('click', () => {
        ctx.openSuivi?.(d.id);
      });
      detailEl.querySelector('#clOpenModal')?.addEventListener('click', () => {
        openModal(d, {
          defaultOp: d.code_op || '',
          notes: d.notes || null,
          showMsg,
          onSuccess: async () => {
            showMsg('Dossier clôturé.');
            selectedId = null;
            detailEl.hidden = true;
            detailEl.innerHTML = '';
            await load();
          },
        });
      });
    }

    async function selectDossier(id) {
      selectedId = id;
      showMsg('');
      renderList();
      detailEl.hidden = false;
      detailEl.innerHTML = '<p class="loc-muted">Chargement…</p>';
      try {
        const d = await LocationData.getDossier(id);
        if (d.statut !== 'actif') {
          showMsg('Ce dossier n’est plus actif.', true);
          detailEl.hidden = true;
          detailEl.innerHTML = '';
          selectedId = null;
          await load();
          return;
        }
        renderDetail(d);
      } catch (e) {
        detailEl.innerHTML = `<p class="loc-msg loc-msg-err">${esc(e.message || e)}</p>`;
      }
    }

    async function load() {
      showMsg('Chargement…');
      try {
        allRows = await LocationData.listDossiers({
          statut: 'actif',
          type_appareil: wrap.querySelector('#clType').value || undefined,
          a_contacter: wrap.querySelector('#clContact').checked || undefined,
        });
        showMsg('');
        applyFilter();
      } catch (e) {
        allRows = [];
        filtered = [];
        listEl.innerHTML = '';
        showMsg(e.message || 'Erreur chargement', true);
      }
    }

    searchEl.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(applyFilter, 120);
    });
    searchEl.addEventListener('search', applyFilter);
    wrap.querySelector('#clRefresh').addEventListener('click', () => void load());
    wrap.querySelector('#clType').addEventListener('change', () => void load());
    wrap.querySelector('#clContact').addEventListener('change', () => void load());

    await load();
    searchEl.focus();
  }

  global.LocationCloture = { mount, openModal };
})(window);
