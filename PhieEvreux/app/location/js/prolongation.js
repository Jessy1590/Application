/**
 * Module Prolongation — recherche dossiers actifs + prolongation rapide.
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

  function fmtDate(iso) {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return String(iso);
    return `${m[3]}/${m[2]}/${m[1]}`;
  }

  function patientLabel(d) {
    const p = d?.patient || {};
    return [p.nom, p.prenom].filter(Boolean).join(' ').trim() || '—';
  }

  function appareilRef(a) {
    if (!a) return '—';
    const parts = [];
    if (a.matricule) parts.push(`Mat. ${a.matricule}`);
    if (a.numero_pharmacie) parts.push(`N° ${a.numero_pharmacie}`);
    return parts.join(' · ') || '—';
  }

  function isPrestataireOnly(d) {
    const a = d?.appareil_actif;
    return d?.qui_facture === 'prestataire' || !!a?.facturation_prestataire;
  }

  function canSuivi(ctx) {
    return typeof ctx.can === 'function' ? ctx.can('module_suivi') : true;
  }

  async function mount(root, ctx) {
    root.innerHTML = '';
    const wrap = el(`<div class="loc-module loc-prolongation">
      <div class="loc-search-row">
        <input type="search" id="prSearch" placeholder="Nom, prénom, type, matricule, n° interne…" autocomplete="off">
      </div>
      <div class="loc-list-panel" id="prListPanel">
        <div class="loc-list" id="prList"><p class="loc-muted">Chargement…</p></div>
      </div>
      <div class="loc-detail" id="prDetail" hidden></div>
      <p class="loc-msg" id="prMsg" hidden></p>
    </div>`);
    root.appendChild(wrap);

    const searchEl = wrap.querySelector('#prSearch');
    const listEl = wrap.querySelector('#prList');
    const detailEl = wrap.querySelector('#prDetail');
    const msgEl = wrap.querySelector('#prMsg');

    let allRows = [];
    let filtered = [];
    let selectedId = null;
    let selectedDossier = null;
    let searchTimer = null;

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
        ? `<button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" id="prOpenSuivi" title="Ouvrir Suivi" aria-label="Ouvrir Suivi">✎</button>`
        : '';
      detailEl.hidden = false;
      detailEl.innerHTML = `
        <div class="loc-card">
          <div class="loc-card-body">
            <div class="loc-dossier-actions">
              <strong>${esc(patientLabel(d))}</strong>
              ${suiviBtn}
            </div>
            <p class="loc-muted">${esc(LocationRules.typeLabel(a.type_appareil))} · ${esc(appareilRef(a))}</p>
            <p>Date fin actuelle : <strong id="prDateFin">${esc(fmtDate(d.date_fin))}</strong></p>
            <div class="loc-grid-2" id="prProlongForm">
              <label class="loc-field">Date ordo<input type="date" name="pr_ordo" value="${esc(LocationRules.todayISO())}"></label>
              <label class="loc-field">Durée<input type="number" min="1" name="pr_duree" value="1"></label>
              <label class="loc-field">Unité<select name="pr_unite">
                <option value="jours">Jours</option>
                <option value="semaines" selected>Semaines</option>
                <option value="mois">Mois</option>
              </select></label>
              <label class="loc-field">Notes<input name="pr_notes" placeholder="Optionnel"></label>
            </div>
            <div class="loc-form-actions">
              <button type="button" class="loc-btn" id="prSubmit">Valider la prolongation</button>
            </div>
          </div>
        </div>
      `;
      detailEl.querySelector('#prOpenSuivi')?.addEventListener('click', () => {
        ctx.openSuivi?.(d.id);
      });
      detailEl.querySelector('#prSubmit')?.addEventListener('click', () => void submitProlong(d));
    }

    async function selectDossier(id) {
      selectedId = id;
      showMsg('');
      renderList();
      detailEl.hidden = false;
      detailEl.innerHTML = '<p class="loc-muted">Chargement…</p>';
      try {
        selectedDossier = await LocationData.getDossier(id);
        renderDetail(selectedDossier);
      } catch (e) {
        selectedDossier = null;
        detailEl.innerHTML = `<p class="loc-msg loc-msg-err">${esc(e.message || e)}</p>`;
      }
    }

    async function submitProlong(d) {
      const box = detailEl.querySelector('#prProlongForm');
      if (!box) return;
      const duree = Number(box.querySelector('[name=pr_duree]').value);
      const unite = box.querySelector('[name=pr_unite]').value;
      if (!Number.isFinite(duree) || duree < 1) {
        showMsg('Indiquez une durée valide.', true);
        return;
      }
      const rules = await LocationData.loadRules();
      const evalRes = LocationRules.evaluate(
        { ...LocationData.dossierContext(d), prolong_duree: duree, prolong_unite: unite },
        rules,
        await LocationData.loadParams()
      );
      const block = evalRes.alerts.find((a) => a.action === 'bloquer_ou_alerter');
      if (block && !confirm(block.message + '\n\nContinuer quand même ?')) return;
      try {
        showMsg('Enregistrement…');
        await LocationData.addProlongation(
          d.id,
          {
            date_ordo: box.querySelector('[name=pr_ordo]').value || null,
            duree,
            unite,
            notes: box.querySelector('[name=pr_notes]').value.trim() || null,
          },
          ctx.userId
        );
        selectedDossier = await LocationData.getDossier(d.id);
        const idx = allRows.findIndex((r) => r.id === d.id);
        if (idx >= 0) allRows[idx] = selectedDossier;
        applyFilter();
        renderDetail(selectedDossier);
        const fin = fmtDate(selectedDossier.date_fin);
        const suiviHint = canSuivi(ctx) ? ' · crayon pour ouvrir le Suivi' : '';
        showMsg(`Prolongation enregistrée. Nouvelle date fin : ${fin}${suiviHint}`);
      } catch (e) {
        showMsg(e.message || 'Erreur prolongation', true);
      }
    }

    async function load() {
      showMsg('Chargement…');
      try {
        const rows = await LocationData.listDossiers({ statut: 'actif' });
        allRows = rows.filter((d) => !isPrestataireOnly(d));
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

    await load();
    searchEl.focus();
  }

  global.LocationProlongation = { mount };
})(window);
