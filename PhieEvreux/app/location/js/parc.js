/**
 * Module Parc — vue prestataire (dossiers en cours) / pharmacie (split en location / disponibles).
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

  function appareilRef(entry) {
    if (entry.numero_pharmacie) return `N° ${entry.numero_pharmacie}`;
    if (entry.matricule) return `Mat. ${entry.matricule}`;
    return entry.value || '—';
  }

  async function mount(root, ctx) {
    root.innerHTML = '';
    const wrap = el(`<div class="loc-module loc-parc">
      <div class="loc-parc-toolbar">
        <div class="loc-parc-modes" role="tablist" aria-label="Mode parc">
          <button type="button" class="loc-parc-mode active" data-mode="prestataire" role="tab" aria-selected="true">Prestataire</button>
          <button type="button" class="loc-parc-mode" data-mode="pharmacie" role="tab" aria-selected="false">Pharmacie</button>
        </div>
        <div class="loc-parc-prest-wrap" id="parcPrestWrap">
          <label class="loc-field loc-parc-prest-field">Prestataire
            <select id="parcPrestSelect"><option value="">Chargement…</option></select>
          </label>
        </div>
      </div>
      <div class="loc-parc-body" id="parcBody">
        <p class="loc-muted">Chargement…</p>
      </div>
    </div>`);
    root.appendChild(wrap);

    const body = wrap.querySelector('#parcBody');
    const prestWrap = wrap.querySelector('#parcPrestWrap');
    const prestSelect = wrap.querySelector('#parcPrestSelect');
    const modeBtns = [...wrap.querySelectorAll('.loc-parc-mode')];

    let mode = 'prestataire';
    let prestataires = [];
    let prestataireId = '';

    try {
      prestataires = await LocationData.listPrestataires(true);
    } catch (_) {
      prestataires = [];
    }

    prestSelect.innerHTML =
      `<option value="">— Choisir —</option>` +
      prestataires
        .map((p) => `<option value="${esc(p.id)}">${esc(p.nom || 'Sans nom')}</option>`)
        .join('');

    function setMode(next) {
      mode = next;
      modeBtns.forEach((b) => {
        const on = b.dataset.mode === mode;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      prestWrap.hidden = mode !== 'prestataire';
      void render();
    }

    modeBtns.forEach((b) => {
      b.addEventListener('click', () => setMode(b.dataset.mode));
    });
    prestSelect.addEventListener('change', () => {
      prestataireId = prestSelect.value || '';
      void render();
    });

    function openHistModal(entry) {
      const rows = (entry.locations || [])
        .map((loc) => {
          const d = loc.dossier;
          const a = loc.appareil;
          const desinf = a?.desinfection ? 'Oui' : 'Non';
          return `<li class="loc-parc-hist-item">
            <div>
              <strong>${esc(patientLabel(d))}</strong>
              <span>${esc(fmtDate(a?.date_debut || d?.date_debut))} → ${esc(fmtDate(a?.date_fin || d?.date_fin))}</span>
              <span>Statut dossier : ${esc(d?.statut || '—')}${loc.enCours ? ' · en cours' : ''}</span>
            </div>
            <div class="loc-parc-hist-actions">
              <span class="loc-parc-badge${a?.desinfection ? ' is-ok' : ''}">Désinfecté : ${esc(desinf)}</span>
              <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-suivi="${esc(d.id)}">Ouvrir</button>
            </div>
          </li>`;
        })
        .join('');

      const modal = el(`<div class="loc-modal" role="dialog" aria-modal="true">
        <div class="loc-modal-backdrop" data-close></div>
        <div class="loc-modal-panel loc-parc-hist-panel">
          <h3>Historique — ${esc(appareilRef(entry))}</h3>
          <p class="loc-muted">${esc(LocationRules.typeLabel(entry.type_appareil))} · ${entry.locations.length} location(s)</p>
          <ul class="loc-parc-hist-list">${rows || '<li class="loc-muted">Aucune location.</li>'}</ul>
          <div class="loc-modal-actions">
            <button type="button" class="loc-btn loc-btn-ghost" data-close>Fermer</button>
          </div>
        </div>
      </div>`);
      document.body.appendChild(modal);
      const close = () => {
        modal.remove();
      };
      modal.querySelectorAll('[data-close]').forEach((n) => n.addEventListener('click', close));
      modal.querySelectorAll('[data-suivi]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-suivi');
          close();
          ctx.openSuivi?.(id);
        });
      });
    }

    function openCreationFromEntry(entry) {
      const numero =
        entry.numero_pharmacie ||
        (entry.kind === 'numero_pharmacie' || entry.kind === 'matricule' ? entry.value : '') ||
        '';
      const q = {
        source: 'parc',
        type_appareil: entry.type_appareil || '',
        numero_pharmacie: numero,
        matricule: entry.matricule || '',
        step: 'appareil',
      };
      if (ctx.openCreation) ctx.openCreation(q);
      else {
        const params = new URLSearchParams();
        Object.entries(q).forEach(([k, v]) => {
          if (v) params.set(k, v);
        });
        window.location.href = `creation.html?${params.toString()}`;
      }
    }

    function renderTypeGroups(groups, emptyMsg, itemRenderer) {
      if (!groups.length) {
        return `<p class="loc-muted loc-parc-empty">${esc(emptyMsg)}</p>`;
      }
      return groups
        .map((g) => {
          const label = LocationRules.typeLabel(g.type);
          const count = g.dossiers?.length ?? g.items?.length ?? 0;
          return `<details class="loc-card loc-parc-group">
            <summary>${esc(label)} <span class="loc-parc-count">${count}</span></summary>
            <div class="loc-card-body loc-parc-group-body">
              ${itemRenderer(g)}
            </div>
          </details>`;
        })
        .join('');
    }

    async function renderPrestataire() {
      if (!prestataireId) {
        body.innerHTML = `<p class="loc-muted loc-parc-empty">Choisissez un prestataire pour voir les dossiers en cours.</p>`;
        return;
      }
      body.innerHTML = `<p class="loc-muted">Chargement…</p>`;
      const data = await LocationData.listParcPrestataire(prestataireId);
      body.innerHTML = `<div class="loc-parc-view loc-parc-fade">${renderTypeGroups(
        data.byType,
        'Aucun dossier actif pour ce prestataire.',
        (g) =>
          `<div class="loc-list">${g.dossiers
            .map((d) => {
              const a = d.appareil_actif || {};
              const ref = a.matricule || a.numero_pharmacie || '—';
              return `<button type="button" class="loc-list-item loc-parc-item" data-dossier="${esc(d.id)}">
                <strong>${esc(patientLabel(d))}</strong>
                <span>${esc(ref)} · ${esc(fmtDate(d.date_debut))} → ${esc(fmtDate(d.date_fin))}</span>
              </button>`;
            })
            .join('')}</div>`
      )}</div>`;

      body.querySelectorAll('[data-dossier]').forEach((btn) => {
        btn.addEventListener('click', () => ctx.openSuivi?.(btn.getAttribute('data-dossier')));
      });
    }

    function renderPharmaItem(entry, side) {
      const ref = appareilRef(entry);
      const typeExtra = entry.type_libelle ? ` · ${entry.type_libelle}` : '';
      if (side === 'right') {
        const d = entry.dossierActif;
        return `<div class="loc-parc-device">
          <div class="loc-parc-device-main">
            <strong>${esc(ref)}</strong>
            <span>${esc(patientLabel(d))}${esc(typeExtra)}</span>
            <span>${esc(fmtDate(d?.date_debut))} → ${esc(fmtDate(d?.date_fin))}</span>
          </div>
          <div class="loc-parc-device-actions">
            <button type="button" class="loc-btn loc-btn-sm" data-modif="${esc(d?.id || '')}">Modifier le dossier</button>
          </div>
        </div>`;
      }
      return `<div class="loc-parc-device">
        <div class="loc-parc-device-main">
          <strong>${esc(ref)}</strong>
          <span>${entry.locations.length} location(s)${esc(typeExtra)}</span>
        </div>
        <div class="loc-parc-device-actions">
          <button type="button" class="loc-btn loc-btn-sm" data-creer="${esc(entry.key)}">Créer un dossier</button>
          <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-hist="${esc(entry.key)}">Suivre les locations</button>
        </div>
      </div>`;
    }

    async function renderPharmacie() {
      body.innerHTML = `<p class="loc-muted">Chargement…</p>`;
      const data = await LocationData.listParcPharmacie();
      const byKey = new Map(data.all.map((e) => [e.key, e]));

      body.innerHTML = `<div class="loc-parc-split loc-parc-fade">
        <section class="loc-parc-col" aria-label="Appareils disponibles">
          <header class="loc-parc-col-head">
            <h2>Disponibles</h2>
            <p class="loc-muted">Déjà utilisés, pas en location actuellement</p>
          </header>
          ${renderTypeGroups(
            data.disponiblesByType,
            'Aucun appareil disponible dans l’historique.',
            (g) => g.items.map((e) => renderPharmaItem(e, 'left')).join('')
          )}
        </section>
        <section class="loc-parc-col loc-parc-col-active" aria-label="Appareils en location">
          <header class="loc-parc-col-head">
            <h2>En location</h2>
            <p class="loc-muted">Parc pharmacie actuellement loué</p>
          </header>
          ${renderTypeGroups(
            data.enLocationByType,
            'Aucun appareil du parc en location.',
            (g) => g.items.map((e) => renderPharmaItem(e, 'right')).join('')
          )}
        </section>
      </div>`;

      body.querySelectorAll('[data-modif]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const id = btn.getAttribute('data-modif');
          if (id) ctx.openSuivi?.(id);
        });
      });
      body.querySelectorAll('[data-creer]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const entry = byKey.get(btn.getAttribute('data-creer'));
          if (entry) openCreationFromEntry(entry);
        });
      });
      body.querySelectorAll('[data-hist]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const entry = byKey.get(btn.getAttribute('data-hist'));
          if (entry) openHistModal(entry);
        });
      });
    }

    async function render() {
      try {
        if (mode === 'prestataire') await renderPrestataire();
        else await renderPharmacie();
      } catch (e) {
        body.innerHTML = `<p class="loc-msg loc-msg-err">${esc(e.message || e)}</p>`;
      }
    }

    await render();
  }

  global.LocationParc = { mount };
})(window);
