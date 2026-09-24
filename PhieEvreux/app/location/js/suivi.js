/**
 * Module Suivi — liste, édition, appareils, prolongations, contacts, impression.
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

  let helpTipSeq = 0;

  function helpTipHtml(text, ariaLabel) {
    helpTipSeq += 1;
    const id = `loc-help-tip-su-${helpTipSeq}`;
    return `<span class="loc-help-tip">
      <button type="button" class="loc-help-tip__btn" aria-label="${esc(ariaLabel)}" aria-expanded="false" aria-controls="${id}">?</button>
      <span class="loc-help-tip__bubble" role="tooltip" id="${id}">${esc(text)}</span>
    </span>`;
  }

  const CONTACT_STATUT_LABELS = {
    a_contacter: 'À appeler',
    en_cours: 'En cours',
    reporte: 'À rappeler',
    contacte: 'Contacté',
    resolu: 'Terminé',
    annule: 'Annulé',
    PERTE: 'PERTE',
  };

  const CONTACT_MOTIF_LABELS = {
    prolongation: 'Prolongation',
    prolongation_tire_lait: 'Prolongation tire-lait',
    reclame_appareil: 'Réclamer appareil',
    reclame_appareil_tens: 'Réclamer TENS',
  };

  function motifContactLabel(motif) {
    if (!motif) return '—';
    if (CONTACT_MOTIF_LABELS[motif]) return CONTACT_MOTIF_LABELS[motif];
    const tpl = global.LocationRules?.templateMotifFor?.(motif);
    if (tpl && CONTACT_MOTIF_LABELS[tpl]) return CONTACT_MOTIF_LABELS[tpl];
    return String(motif);
  }

  function formatDateFr(iso) {
    if (!iso) return '—';
    const s = String(iso).slice(0, 10);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    return s;
  }

  /** Résultat de la phase (commentaire → ECRIS / à faire ; appel → résultat). */
  function phaseResultatLabel(c) {
    const resMap = global.LocationContact?.APPEL_RESULTAT_LABELS || {};
    if (c.resultat) return resMap[c.resultat] || c.resultat;
    if (c.phase === 'commentaire' || !c.commentaire_fait_at) {
      return c.commentaire_fait_at ? 'ECRIS' : 'com. à faire';
    }
    if (c.commentaire_fait_at && c.phase === 'appel' && !c.resultat) return 'ECRIS';
    return '—';
  }

  /** Tableau contacts / étapes passées (source = location_contacts, pas le journal). */
  function contactsTableHtml(contacts) {
    const list = (contacts || []).slice().sort((a, b) =>
      String(a.contacted_at || a.commentaire_fait_at || a.created_at || '').localeCompare(
        String(b.contacted_at || b.commentaire_fait_at || b.created_at || '')
      )
    );
    if (!list.length) {
      return '<p class="loc-muted">Aucun contact enregistré.</p>';
    }
    const statutMap = {
      ...CONTACT_STATUT_LABELS,
      ...(global.LocationContact?.APPEL_STATUT_LABELS || {}),
    };
    const rows = list
      .map((c) => {
        const when =
          formatDateFr(c.contacted_at) !== '—'
            ? formatDateFr(c.contacted_at)
            : formatDateFr(c.commentaire_fait_at) !== '—'
              ? formatDateFr(c.commentaire_fait_at)
              : formatDateFr(c.created_at);
        const phase = c.phase === 'appel' ? 'Appel' : c.phase === 'commentaire' ? 'Commentaire' : '—';
        const statut = statutMap[c.statut] || c.statut || '—';
        const resultat = phaseResultatLabel(c);
        const mailCell =
          c.phase === 'appel'
            ? `<input type="checkbox" class="loc-mail-check" disabled ${
                c.mail_envoye ? 'checked' : ''
              } aria-label="Mail envoyé">`
            : '—';
        return `<tr>
          <td>${esc(when)}</td>
          <td>${esc(phase)}</td>
          <td>${esc(motifContactLabel(c.motif))}</td>
          <td>${esc(resultat)}</td>
          <td>${esc(c.commentaire || '')}</td>
          <td class="loc-mail-cell">${mailCell}</td>
          <td>${esc(statut)}</td>
        </tr>`;
      })
      .join('');
    return `<div class="loc-table-wrap">
      <table class="loc-table loc-contacts-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Phase</th>
            <th>Motif</th>
            <th>Résultat de la phase</th>
            <th>Commentaire</th>
            <th>Mail</th>
            <th>Statut actuel</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  function closeHelpTips(root, except) {
    (root || document).querySelectorAll('.loc-help-tip.is-open').forEach((wrap) => {
      if (except && wrap === except) return;
      wrap.classList.remove('is-open');
      const btn = wrap.querySelector('.loc-help-tip__btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function bindHelpTips(root) {
    if (!root) return;
    root.querySelectorAll('.loc-help-tip').forEach((wrap) => {
      const btn = wrap.querySelector('.loc-help-tip__btn');
      if (!btn || btn.dataset.helpBound === '1') return;
      btn.dataset.helpBound = '1';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const willOpen = !wrap.classList.contains('is-open');
        closeHelpTips(root, wrap);
        wrap.classList.toggle('is-open', willOpen);
        btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        if (!willOpen) btn.blur();
      });
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          closeHelpTips(root);
          btn.blur();
        }
      });
    });
    if (root.dataset.helpOutsideBound === '1') return;
    root.dataset.helpOutsideBound = '1';
    root.addEventListener('click', (e) => {
      if (e.target.closest('.loc-help-tip')) return;
      closeHelpTips(root);
    });
  }

  async function mount(root, ctx) {
    root.innerHTML = '';
    const wrap = el(`<div class="loc-module loc-suivi">
      <div class="loc-bar">
        <button type="button" class="loc-btn loc-btn-ghost loc-toggle-btn" id="suToggleFilters" aria-expanded="false" aria-controls="suFilters">Filtres</button>
        <button type="button" class="loc-btn loc-btn-ghost loc-toggle-btn" id="suToggleList" aria-expanded="true" aria-controls="suListPanel">Dossiers</button>
        <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" id="suPrev" aria-label="Dossier précédent" disabled>←</button>
        <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" id="suNext" aria-label="Dossier suivant" disabled>→</button>
        <button type="button" class="loc-btn loc-btn-ghost" id="suRefresh">Actualiser</button>
        <button type="button" class="loc-btn loc-btn-ghost" id="suPrintTable">Imprimer tableau</button>
      </div>
      <div class="loc-toolbar loc-filters" id="suFilters" hidden>
        <input type="search" id="suSearch" placeholder="Recherche nom / prénom">
        <select id="suStatut">
          <option value="">Tous statuts</option>
          <option value="actif" selected>Actifs</option>
          <option value="en_attente">En attente</option>
          <option value="cloture">Clôturés</option>
          <option value="annule">Annulés</option>
        </select>
        <select id="suType">
          <option value="">Tous types</option>
          ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <label class="loc-check loc-check-inline"><input type="checkbox" id="suContact"> À contacter</label>
      </div>
      <div class="loc-split" id="suSplit">
        <div class="loc-list-panel" id="suListPanel">
          <div class="loc-list" id="suList"></div>
        </div>
        <div class="loc-detail" id="suDetail"><p class="loc-muted">Sélectionnez une fiche.</p></div>
      </div>
      <p class="loc-msg" id="suMsg" hidden></p>
    </div>`);
    root.appendChild(wrap);

    let rows = [];
    let selectedId = ctx.initialDossierId || null;
    let pendingCloture = !!ctx.initialCloture;
    const listEl = wrap.querySelector('#suList');
    const listPanel = wrap.querySelector('#suListPanel');
    const splitEl = wrap.querySelector('#suSplit');
    const filtersEl = wrap.querySelector('#suFilters');
    const btnFilters = wrap.querySelector('#suToggleFilters');
    const btnList = wrap.querySelector('#suToggleList');
    const detailEl = wrap.querySelector('#suDetail');
    const msgEl = wrap.querySelector('#suMsg');
    const btnPrev = wrap.querySelector('#suPrev');
    const btnNext = wrap.querySelector('#suNext');

    function currentIndex() {
      if (!selectedId) return -1;
      return rows.findIndex((r) => r.id === selectedId);
    }

    function updateNav() {
      const n = rows.length;
      if (!n) {
        btnPrev.disabled = true;
        btnNext.disabled = true;
        return;
      }
      const i = currentIndex();
      if (i < 0) {
        btnPrev.disabled = false;
        btnNext.disabled = false;
        return;
      }
      btnPrev.disabled = i <= 0;
      btnNext.disabled = i >= n - 1;
    }

    function goPrev() {
      if (!rows.length) return;
      const i = currentIndex();
      const target = i < 0 ? rows[rows.length - 1] : rows[i - 1];
      if (target) void openDetail(target.id);
    }

    function goNext() {
      if (!rows.length) return;
      const i = currentIndex();
      const target = i < 0 ? rows[0] : rows[i + 1];
      if (target) void openDetail(target.id);
    }

    function setToggle(btn, panel, open) {
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.classList.toggle('is-active', open);
    }

    btnFilters.addEventListener('click', () => {
      setToggle(btnFilters, filtersEl, filtersEl.hidden);
    });
    btnList.addEventListener('click', () => {
      const open = listPanel.hidden;
      setToggle(btnList, listPanel, open);
      splitEl.classList.toggle('is-list-collapsed', !open);
    });
    setToggle(btnFilters, filtersEl, false);
    setToggle(btnList, listPanel, true);
    splitEl.classList.remove('is-list-collapsed');

    function showMsg(t, err) {
      msgEl.hidden = !t;
      msgEl.textContent = t || '';
      msgEl.classList.toggle('loc-msg-err', !!err);
    }

    async function refresh() {
      showMsg('Chargement…');
      try {
        rows = await LocationData.listDossiers({
          q: wrap.querySelector('#suSearch').value,
          statut: wrap.querySelector('#suStatut').value || undefined,
          type_appareil: wrap.querySelector('#suType').value || undefined,
          a_contacter: wrap.querySelector('#suContact').checked || undefined,
        });
        showMsg('');
        renderList();
        if (selectedId) {
          const still = rows.find((r) => r.id === selectedId);
          if (still) await openDetail(selectedId);
          else {
            selectedId = null;
            detailEl.innerHTML = '<p class="loc-muted">Sélectionnez une fiche.</p>';
          }
        }
      } catch (e) {
        showMsg(e.message || 'Erreur chargement', true);
      }
    }

    function renderList() {
      if (!rows.length) {
        listEl.innerHTML = '<p class="loc-muted">Aucune fiche.</p>';
        updateNav();
        return;
      }
      listEl.innerHTML = rows
        .map((d) => {
          const p = d.patient || {};
          const a = d.appareil_actif || {};
          const enAttente = d.statut === 'en_attente';
          const badgeClass = enAttente ? 'loc-badge loc-badge-en-attente' : 'loc-badge';
          const itemClass = `loc-list-item${d.id === selectedId ? ' active' : ''}${enAttente ? ' is-en-attente' : ''}`;
          return `<button type="button" class="${itemClass}" data-id="${d.id}">
            <strong>${esc(p.nom)} ${esc(p.prenom)}</strong>
            <span>${esc(LocationRules.typeLabel(a.type_appareil))} · fin ${esc(d.date_fin || '—')}</span>
            <span class="${badgeClass}">${esc(enAttente ? 'en attente' : d.statut)}</span>
          </button>`;
        })
        .join('');
      listEl.querySelectorAll('[data-id]').forEach((b) => {
        b.addEventListener('click', () => openDetail(b.dataset.id));
      });
      updateNav();
    }

    async function openDetail(id) {
      selectedId = id;
      renderList();
      detailEl.innerHTML = '<p class="loc-muted">Chargement…</p>';
      try {
        const d = await LocationData.getDossier(id);
        const [rules, params, champsDef, prestataires] = await Promise.all([
          LocationData.loadRules(),
          LocationData.loadParams(),
          LocationData.listChampsCreation(null, false),
          LocationData.listPrestataires(true),
        ]);
        renderDetail(d, rules, params, champsDef, prestataires);
        if (pendingCloture) {
          pendingCloture = false;
          const canCloturerRole = typeof ctx.can === 'function' ? ctx.can('module_cloture') : true;
          if (canCloturerRole && d.statut === 'actif') openClotureModal(d);
        }
      } catch (e) {
        detailEl.innerHTML = `<p class="loc-msg-err">${esc(e.message)}</p>`;
      }
    }

    function champSpecInputHtml(champ, value, inactiveHint) {
      if (champ.data_type === 'attention') return '';
      const code = champ.code;
      const name = `ce_${code}`;
      const val = value == null ? '' : value;
      const opts = LocationRules.parseJson(champ.options, {});
      const choix = Array.isArray(opts.choix) ? opts.choix : [];
      const hint = inactiveHint || '';
      if (champ.data_type === 'oui_non') {
        const checked = val === true || val === 'oui' || val === 'true';
        return `<label class="loc-check"><input type="checkbox" name="${esc(name)}"${checked ? ' checked' : ''}> ${esc(champ.libelle)}${hint}</label>`;
      }
      if (champ.data_type === 'date') {
        return `<label class="loc-field">${esc(champ.libelle)}${hint}<input type="date" name="${esc(name)}" value="${esc(val)}"></label>`;
      }
      if (champ.data_type === 'nombre') {
        return `<label class="loc-field">${esc(champ.libelle)}${hint}<input type="number" name="${esc(name)}" value="${esc(val)}"></label>`;
      }
      if (champ.data_type === 'liste') {
        return `<label class="loc-field">${esc(champ.libelle)}${hint}<select name="${esc(name)}">
          <option value="">—</option>
          ${choix
            .map(
              (c) =>
                `<option value="${esc(c)}"${String(val) === String(c) ? ' selected' : ''}>${esc(c)}</option>`
            )
            .join('')}
        </select></label>`;
      }
      return `<label class="loc-field">${esc(champ.libelle)}${hint}<input type="text" name="${esc(name)}" value="${esc(val)}"></label>`;
    }

    function champsSpecHtml(typeAppareil, champsDef, extraBag) {
      const typeChamps = (champsDef || [])
        .filter((c) => c.type_appareil === typeAppareil)
        .slice()
        .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
      if (!typeChamps.length) return '';
      const attentions = typeChamps
        .filter((c) => c.data_type === 'attention' && c.libelle)
        .map(
          (c) =>
            `<div class="loc-attention-box" role="note"><strong>Attention</strong><p>${esc(c.libelle)}</p></div>`
        )
        .join('');
      const dynamiques = typeChamps
        .filter((c) => c.data_type !== 'attention')
        .map((c) => {
          const hint =
            c.actif === false
              ? ' <span class="loc-muted" style="font-weight:normal;font-size:11px">(désactivé à la création)</span>'
              : '';
          return champSpecInputHtml(c, extraBag[c.code], hint);
        })
        .join('');
      return `${attentions ? `<div class="loc-attention-stack loc-span-2">${attentions}</div>` : ''}${dynamiques}`;
    }

    function wireAccordion(container) {
      const items = [...container.querySelectorAll('details.loc-card')];
      items.forEach((item) => {
        item.addEventListener('toggle', () => {
          if (!item.open) return;
          items.forEach((other) => {
            if (other !== item) other.open = false;
          });
        });
      });
    }

    function fauteuilBasculeNote(d, rules, params) {
      const a = d.appareil_actif || {};
      if (a.type_appareil !== 'fauteuil') return null;
      if (d.qui_facture === 'prestataire' || a.facturation_prestataire) return null;
      const rule = (rules || []).find((r) => r.code === 'fauteuil_bascule' && r.actif !== false);
      if (!rule) return null;
      const cond = LocationRules.parseJson(rule.conditions, {});
      const n = cond.bascule_apres_mois ?? params?.fauteuil_bascule_prestataire_mois ?? 2;
      return `Attention après ${n} mois faire passer l'appareil chez le prestataire`;
    }

    function renderDetail(d, rules, params, champsDef, prestataires) {
      const p = d.patient || {};
      const a = d.appareil_actif || {};
      const canEdit = typeof ctx.can === 'function' ? ctx.can('edition_suivi') : true;
      const canDelete = typeof ctx.can === 'function'
        ? ctx.can('suppression_dossier')
        : !!(ctx.isAdmin || ctx.isGestionnaire);
      const canPrint = typeof ctx.can === 'function' ? ctx.can('impression_fiche') : true;
      const canCloturerRole = typeof ctx.can === 'function' ? ctx.can('module_cloture') : true;
      const prest = a.source === 'prestataire';
      const parc = !prest;
      const autre = a.type_appareil === 'autre';
      const prestList = Array.isArray(prestataires) ? prestataires : [];
      const prolongCount = (d.prolongations || []).length;
      const appCount = (d.appareils || []).length;
      const contactCount = (d.contacts || []).length;
      const canCloturer = canCloturerRole && d.statut === 'actif';
      const enAttente = d.statut === 'en_attente';
      const fauteuilNote = fauteuilBasculeNote(d, rules, params);
      const creOff = (etape, code) => !LocationData.isCreationActif(params, etape, code);
      const creHint = (etape, code) =>
        creOff(etape, code)
          ? ' <span class="loc-muted" style="font-weight:normal;font-size:11px">(désactivé à la création)</span>'
          : '';
      const extraBag = a.champs_extra && typeof a.champs_extra === 'object' ? a.champs_extra : {};
      const customHtml = (etapeId) =>
        LocationData.listCreationFieldsForEtape(params, etapeId)
          .filter((f) => f.custom)
          .map((f) => {
            const val = extraBag[f.code] == null ? '' : String(extraBag[f.code]);
            return `<label class="loc-field loc-span-2">${esc(f.label)}${creHint(etapeId, f.code)}<input name="cd_${esc(f.code)}" value="${esc(val)}"></label>`;
          })
          .join('');
      const specHtml = champsSpecHtml(a.type_appareil, champsDef, extraBag);
      const canInvalidateCom =
        canEdit &&
        (d.contacts || []).some(
          (c) =>
            ["a_contacter", "en_cours", "reporte"].includes(c.statut) &&
            (c.phase === "appel" || c.commentaire_fait_at)
        );

      detailEl.innerHTML = `
        <div class="loc-detail-head">
          <h3>${esc(p.nom)} ${esc(p.prenom)}${enAttente ? ' <span class="loc-badge loc-badge-en-attente">en attente</span>' : ''}</h3>
          <div class="loc-detail-actions">
            ${canPrint ? '<button type="button" class="loc-btn loc-btn-ghost" id="suPrint">Imprimer fiche</button>' : ''}
            ${canEdit ? '<button type="button" class="loc-btn" id="suSave">Enregistrer</button>' : ''}
            ${canCloturer ? '<button type="button" class="loc-btn" id="suCloturer">Clôturer le dossier</button>' : ''}
            ${canDelete ? '<button type="button" class="loc-btn loc-btn-ghost" id="suDelete">Supprimer</button>' : ''}
          </div>
        </div>
        ${fauteuilNote ? `<div class="loc-attention" role="status">${esc(fauteuilNote)}</div>` : ''}

        <div class="loc-accordion">
        <details class="loc-card">
          <summary>Patient</summary>
          <div class="loc-card-body">
            <div class="loc-grid-2">
              <label class="loc-field">Nom${creHint('patient', 'patient_nom')}<input name="p_nom" value="${esc(p.nom)}"></label>
              <label class="loc-field">Prénom${creHint('patient', 'patient_prenom')}<input name="p_prenom" value="${esc(p.prenom)}"></label>
              <label class="loc-field">Naissance${creHint('patient', 'patient_date_naissance')}<input type="date" name="p_dn" value="${esc(p.date_naissance || '')}"></label>
              <label class="loc-field loc-span-2">Adresse${creHint('patient', 'patient_adresse')}<textarea name="p_adresse" rows="2">${esc(p.adresse || '')}</textarea></label>
            </div>
            <div class="loc-grid-2" style="margin-top:10px">
              <div class="loc-span-2">${LocationFields.blockHtml('phones', `Téléphones${creOff('patient', 'patient_telephone') ? ' (désactivé à la création)' : ''}`)}</div>
              <div class="loc-span-2">${LocationFields.blockHtml('mails', `Mails${creOff('patient', 'patient_mails') ? ' (désactivé à la création)' : ''}`)}</div>
              ${customHtml('patient')}
            </div>
          </div>
        </details>

        <details class="loc-card">
          <summary>Dossier · ${esc(d.statut || '—')} · fin ${esc(d.date_fin || '—')}</summary>
          <div class="loc-card-body">
            <div class="loc-grid-2">
              <label class="loc-field">Code OP${creHint('personnel', 'code_op')}<input name="code_op" value="${esc(d.code_op || '')}"></label>
              <label class="loc-field">Caution${creHint('personnel', 'caution')}<select name="caution">
                <option value="aucune"${!d.caution || d.caution === 'aucune' ? ' selected' : ''}>Aucune</option>
                <option value="cheque_150"${d.caution === 'cheque_150' ? ' selected' : ''}>Cheque 150E</option>
                <option value="especes"${d.caution === 'especes' ? ' selected' : ''}>Especes</option>
                <option value="autres"${d.caution === 'autres' ? ' selected' : ''}>Autres</option>
              </select></label>
              <label class="loc-field">Statut<select name="statut">
                <option value="actif"${d.statut === 'actif' ? ' selected' : ''}>Actif</option>
                <option value="en_attente"${d.statut === 'en_attente' ? ' selected' : ''}>En attente</option>
                <option value="cloture"${d.statut === 'cloture' ? ' selected' : ''}>Clôturé</option>
                <option value="annule"${d.statut === 'annule' ? ' selected' : ''}>Annulé</option>
              </select></label>
              <label class="loc-field">Qui facture<select name="qui_facture">
                <option value="pharmacie"${d.qui_facture === 'pharmacie' ? ' selected' : ''}>Pharmacie</option>
                <option value="prestataire"${d.qui_facture === 'prestataire' ? ' selected' : ''}>Prestataire</option>
              </select></label>
              <label class="loc-field">Date début${creHint('location', 'date_debut')}<input type="date" name="date_debut" value="${esc(d.date_debut || '')}"></label>
              <label class="loc-field">Fin courante<input type="text" value="${esc(d.date_fin || '')}" disabled></label>
              <label class="loc-check"><input type="checkbox" name="appareil_rendu"${d.appareil_rendu ? ' checked' : ''}> Appareil rendu</label>
              <label class="loc-check"><input type="checkbox" name="caution_rendue"${d.caution_rendue ? ' checked' : ''}> Caution rendue</label>
              <label class="loc-field">Caution rendue le<input type="date" name="caution_rendue_le" value="${esc(d.caution_rendue_le || '')}"></label>
              <label class="loc-field">OP caution<input name="caution_rendue_op" value="${esc(d.caution_rendue_op || '')}"></label>
              <label class="loc-field">Date clôture<input type="date" name="date_cloture" value="${esc(d.date_cloture || '')}"></label>
              <label class="loc-field">OP clôture<input name="cloture_op" value="${esc(d.cloture_op || '')}"></label>
              <label class="loc-field loc-span-2">Notes initiales${creHint('personnel', 'notes')}<textarea name="notes" rows="2">${esc(d.notes || '')}</textarea></label>
              ${customHtml('personnel')}
              ${customHtml('location')}
            </div>
          </div>
        </details>

        <details class="loc-card">
          <summary>Appareil · ${esc(LocationRules.typeLabel(a.type_appareil) || '—')}${appCount ? ` · ${appCount} hist.` : ''}</summary>
          <div class="loc-card-body">
            <div class="loc-appareil-actif loc-grid-2">
              <label class="loc-field">Type d’appareil${creHint('appareil', 'type_appareil')}<input value="${esc(LocationRules.typeLabel(a.type_appareil))}" disabled></label>
              ${
                autre
                  ? `<label class="loc-field">Libellé (autre)${creHint('appareil', 'type_libelle')}<input name="a_type_libelle" value="${esc(a.type_libelle || '')}"></label>`
                  : ''
              }
              <label class="loc-field">Source${creHint('appareil', 'source')}<select name="a_source">
                <option value="parc"${parc ? ' selected' : ''}>Parc pharmacie</option>
                <option value="prestataire"${prest ? ' selected' : ''}>Prestataire</option>
              </select></label>
              <div class="loc-appareil-prest loc-span-2 loc-grid-2"${prest ? '' : ' hidden'}>
                <label class="loc-field">Prestataire${creHint('appareil', 'prestataire_id')}<select name="a_prestataire_id">
                  <option value="">—</option>
                  ${prestList.map((pr) => `<option value="${esc(pr.id)}"${a.prestataire_id === pr.id ? ' selected' : ''}>${esc(pr.nom)}</option>`).join('')}
                </select></label>
                <div class="loc-field">
                  <span class="loc-field-label-row">
                    <label for="suMatricule">Matricule${creHint('appareil', 'matricule')}</label>
                    ${helpTipHtml('Si le matricule est connu.', 'Aide : matricule')}
                  </span>
                  <input id="suMatricule" name="a_matricule" value="${esc(a.matricule || '')}">
                </div>
                <label class="loc-field">Obtention${creHint('appareil', 'mode_obtention')}<select name="a_obtention">
                  <option value="depot"${a.mode_obtention === 'depot' ? ' selected' : ''}>Dépôt</option>
                  <option value="appel"${a.mode_obtention === 'appel' ? ' selected' : ''}>Appel pour l’obtenir</option>
                </select></label>
                <label class="loc-field">Livraison${creHint('appareil', 'livraison')}<select name="a_livraison">
                  <option value="pharmacie"${a.livraison === 'pharmacie' ? ' selected' : ''}>À la pharmacie</option>
                  <option value="patient"${a.livraison === 'patient' ? ' selected' : ''}>Chez le patient</option>
                </select></label>
              </div>
              <div class="loc-appareil-parc loc-span-2 loc-grid-2"${parc ? '' : ' hidden'}>
                <label class="loc-field">N° appareil pharmacie${creHint('appareil', 'numero_pharmacie')}<input name="a_numero" value="${esc(a.numero_pharmacie || '')}"></label>
                <label class="loc-check"><input type="checkbox" name="a_desinfection"${a.desinfection ? ' checked' : ''}> Désinfection faite${creOff('appareil', 'desinfection') ? ' <span class="loc-muted" style="font-weight:normal;font-size:11px">(désactivé à la création)</span>' : ''}</label>
              </div>
              <label class="loc-check"><input type="checkbox" name="facturation_prestataire"${a.facturation_prestataire ? ' checked' : ''}> Facturation prestataire (hors file contact)</label>
              ${specHtml}
              <label class="loc-field loc-span-2">Commentaire${creHint('appareil', 'encart_texte')}<textarea name="encart_texte" rows="3">${esc(a.encart_texte || '')}</textarea></label>
              ${customHtml('appareil')}
            </div>
            <h4>Historique</h4>
            <ul class="loc-history">
              ${(d.appareils || []).map((x) => `<li>${esc(LocationRules.typeLabel(x.type_appareil))} · ${x.source || ''} · ${x.actif ? 'actif' : 'inactif'} · n° ${esc(x.numero_pharmacie || x.matricule || '—')} · ${esc(x.date_debut || '')} → ${esc(x.date_fin || '…')}</li>`).join('') || '<li>Aucun</li>'}
            </ul>
            ${
              canEdit
                ? `<button type="button" class="loc-btn loc-btn-ghost" id="suNewApp">Changer d’appareil</button>${
                    appCount > 1
                      ? '<button type="button" class="loc-btn loc-btn-ghost" id="suCancelAppChange">Annuler le changement</button>'
                      : ''
                  }<div id="suNewAppForm" hidden></div>`
                : ''
            }
          </div>
        </details>

        <details class="loc-card">
          <summary>Prolongations${prolongCount ? ` · ${prolongCount}` : ''}</summary>
          <div class="loc-card-body">
            <ul class="loc-history" id="suProlongList">
              ${(d.prolongations || []).map((pr) =>
                `<li data-pr-id="${esc(pr.id)}">
                  <span>${esc(pr.date_ordo || '')} · ${pr.duree} ${esc(pr.unite)} → fin ${esc(pr.date_fin || '')}${pr.notes ? ' · ' + esc(pr.notes) : ''}</span>
                  ${
                    canEdit
                      ? `<span class="loc-step-actions" style="margin-top:4px">
                          <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-edit-pr="${esc(pr.id)}">Modifier</button>
                          <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-del-pr="${esc(pr.id)}">Supprimer</button>
                        </span>`
                      : ''
                  }
                </li>`
              ).join('') || '<li>Aucune</li>'}
            </ul>
            <div id="suProlongEdit" hidden></div>
            ${
              canEdit
                ? `<div class="loc-grid-2" id="suProlongForm">
              <label class="loc-field">Date ordo<input type="date" name="pr_ordo" value="${LocationRules.todayISO()}"></label>
              <label class="loc-field">Durée<input type="number" min="1" name="pr_duree" value="1"></label>
              <label class="loc-field">Unité<select name="pr_unite">
                <option value="jours">Jours</option>
                <option value="semaines" selected>Semaines</option>
                <option value="mois">Mois</option>
              </select></label>
              <label class="loc-field">Notes<input name="pr_notes"></label>
            </div>
            <button type="button" class="loc-btn loc-btn-ghost" id="suAddProlong">Ajouter prolongation</button>`
                : ''
            }
          </div>
        </details>

        <details class="loc-card">
          <summary>Contacts / appels${contactCount ? ` · ${contactCount}` : ''}</summary>
          <div class="loc-card-body">
            ${
              canInvalidateCom
                ? `<span class="loc-field-label-row">
                     <button type="button" class="loc-btn loc-btn-ghost" id="suInvalidateCom">Invalider le commentaire</button>
                     ${helpTipHtml('Remet le dossier en file Commentaire.', 'Aide : invalider le commentaire')}
                   </span>`
                : ''
            }
            <h4 class="loc-contacts-heading">Contacts / appels</h4>
            ${contactsTableHtml(d.contacts)}
          </div>
        </details>
        </div>
      `;

      wireAccordion(detailEl.querySelector('.loc-accordion'));
      bindHelpTips(detailEl);

      detailEl.querySelector('[name=a_source]')?.addEventListener('change', (e) => {
        const isPrest = e.target.value === 'prestataire';
        detailEl.querySelector('.loc-appareil-prest')?.toggleAttribute('hidden', !isPrest);
        detailEl.querySelector('.loc-appareil-parc')?.toggleAttribute('hidden', isPrest);
      });

      LocationFields.mountPhones(
        detailEl.querySelector('#phonesList'),
        detailEl.querySelector('#addPhoneBtn'),
        p.telephones || []
      );
      LocationFields.mountMails(
        detailEl.querySelector('#mailsList'),
        detailEl.querySelector('#addMailBtn'),
        p.mails || []
      );

      if (!canEdit) {
        detailEl.querySelectorAll('input, select, textarea').forEach((node) => {
          node.disabled = true;
        });
        detailEl.querySelector('#addPhoneBtn')?.remove();
        detailEl.querySelector('#addMailBtn')?.remove();
        detailEl.querySelectorAll('.loc-multi-remove').forEach((btn) => btn.remove());
      }

      detailEl.querySelector('#suPrint')?.addEventListener('click', () => {
        if (typeof ctx.can === 'function' && !ctx.can('impression_fiche')) {
          showMsg('Impression non autorisée pour votre rôle.', true);
          return;
        }
        // d déjà chargé via getDossier dans openDetail — print synchrone (geste utilisateur)
        void LocationPrint.printFiche(d);
      });
      detailEl.querySelector('#suSave')?.addEventListener('click', () => saveDetail(d));
      detailEl.querySelector('#suCloturer')?.addEventListener('click', () => {
        if (typeof ctx.can === 'function' && !ctx.can('module_cloture')) {
          showMsg('Clôture non autorisée pour votre rôle.', true);
          return;
        }
        openClotureModal(d);
      });
      detailEl.querySelector('#suAddProlong')?.addEventListener('click', () => addProlong(d));
      detailEl.querySelector('#suDelete')?.addEventListener('click', () => deleteFiche(d));
      detailEl.querySelector('#suNewApp')?.addEventListener('click', () =>
        showNewAppForm(d, params, champsDef, prestataires)
      );
      detailEl.querySelector('#suCancelAppChange')?.addEventListener('click', () => cancelAppChange(d));
      detailEl.querySelectorAll('[data-edit-pr]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const pr = (d.prolongations || []).find((x) => x.id === btn.dataset.editPr);
          if (pr) showEditProlong(d, pr);
        });
      });
      detailEl.querySelectorAll('[data-del-pr]').forEach((btn) => {
        btn.addEventListener('click', () => deleteProlong(d, btn.dataset.delPr));
      });
      detailEl.querySelector('#suInvalidateCom')?.addEventListener('click', async () => {
        if (typeof ctx.can === 'function' && !ctx.can('edition_suivi')) {
          showMsg('Édition non autorisée pour votre rôle.', true);
          return;
        }
        if (
          !window.confirm(
            'Invalider le commentaire ? Tout le dossier repasse en phase Commentaire (une seule file).'
          )
        ) {
          return;
        }
        try {
          await LocationData.invalidateDossierCommentaire(d.id, d.contacts || []);
          await LocationData.syncContactQueue(ctx.userId);
          showMsg('Dossier remis en phase Commentaire.');
          await openDetail(d.id);
        } catch (e) {
          showMsg(e.message || 'Erreur', true);
        }
      });
    }

    function openClotureModal(d) {
      const notesField = detailEl.querySelector('[name=notes]');
      const defaultOp =
        detailEl.querySelector('[name=code_op]')?.value.trim() || d.code_op || '';
      LocationCloture.openModal(d, {
        defaultOp,
        notes: notesField ? notesField.value : d.notes || null,
        showMsg,
        onSuccess: async () => {
          showMsg('Dossier clôturé.');
          await refresh();
          await openDetail(d.id);
        },
      });
    }

    async function deleteFiche(d) {
      const canDelete = typeof ctx.can === 'function'
        ? ctx.can('suppression_dossier')
        : !!(ctx.isAdmin || ctx.isGestionnaire);
      if (!canDelete) {
        showMsg('Suppression non autorisée pour votre rôle.', true);
        return;
      }
      const p = d.patient || {};
      const label = `${p.nom || ''} ${p.prenom || ''}`.trim() || 'cette fiche';
      if (!window.confirm(`Supprimer définitivement la fiche de ${label} ?`)) return;
      try {
        await LocationData.deleteDossier(d.id);
        selectedId = null;
        detailEl.innerHTML = '<p class="loc-muted">Sélectionnez une fiche.</p>';
        await refresh();
        showMsg('Fiche supprimée.');
      } catch (e) {
        showMsg(e.message || 'Erreur suppression', true);
      }
    }

    function showNewAppForm(d, params, champsDef, prestataires) {
      if (typeof ctx.can === 'function' && !ctx.can('edition_suivi')) {
        showMsg('Édition non autorisée pour votre rôle.', true);
        return;
      }
      const box = detailEl.querySelector('#suNewAppForm');
      if (!box) return;
      box.hidden = false;

      const show = (etape, code) => LocationData.isCreationActif(params, etape, code);
      const req = (etape, code) => LocationData.isCreationRequired(params, etape, code);
      const prestList = Array.isArray(prestataires) ? prestataires : [];

      function typeCodes() {
        if (typeof LocationRules?.typeCodes === 'function') {
          const list = LocationRules.typeCodes();
          if (list && list.length) return list;
        }
        const keys = Object.keys(LocationRules?.TYPE_LABELS || {});
        return keys.length ? keys : ['aerosol', 'tire_lait', 'pese_bebe', 'tens', 'fauteuil', 'autre'];
      }

      function field(label, inputHtml, required) {
        return `<label class="loc-field">${label}${required ? ' *' : ''}
      ${inputHtml}
    </label>`;
      }

      function champsForType(type) {
        return (champsDef || [])
          .filter((c) => c.type_appareil === type && c.actif !== false)
          .slice()
          .sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
      }

      function customFieldsForEtape(etapeId) {
        return LocationData.listCreationFieldsForEtape(params, etapeId).filter((f) => f.custom);
      }

      function champInputHtml(champ, value) {
        if (champ.data_type === 'attention') return '';
        const code = champ.code;
        const name = `ce_${code}`;
        const val = value == null ? '' : value;
        const opts = LocationRules.parseJson(champ.options, {});
        const choix = Array.isArray(opts.choix) ? opts.choix : [];
        if (champ.data_type === 'oui_non') {
          const checked = val === true || val === 'oui' || val === 'true';
          return `<label class="loc-check"><input type="checkbox" name="${esc(name)}"${checked ? ' checked' : ''}> ${esc(champ.libelle)}${champ.obligatoire ? ' *' : ''}</label>`;
        }
        if (champ.data_type === 'date') {
          return field(champ.libelle, `<input type="date" name="${esc(name)}" value="${esc(val)}">`, champ.obligatoire);
        }
        if (champ.data_type === 'nombre') {
          return field(champ.libelle, `<input type="number" name="${esc(name)}" value="${esc(val)}">`, champ.obligatoire);
        }
        if (champ.data_type === 'liste') {
          return field(
            champ.libelle,
            `<select name="${esc(name)}">
          <option value="">—</option>
          ${choix.map((c) => `<option value="${esc(c)}"${String(val) === String(c) ? ' selected' : ''}>${esc(c)}</option>`).join('')}
        </select>`,
            champ.obligatoire
          );
        }
        return field(champ.libelle, `<input type="text" name="${esc(name)}" value="${esc(val)}">`, champ.obligatoire);
      }

      function attentionBoxesHtml(champs) {
        const items = (champs || []).filter((c) => c.data_type === 'attention' && c.libelle);
        if (!items.length) return '';
        return `<div class="loc-attention-stack">
      ${items
        .map(
          (c) =>
            `<div class="loc-attention-box" role="note"><strong>Attention</strong><p>${esc(c.libelle)}</p></div>`
        )
        .join('')}
    </div>`;
      }

      function preserveCreationCustomExtra(prevExtra) {
        const keep = {};
        for (const etape of LocationData.CREATION_ETAPES) {
          for (const f of customFieldsForEtape(etape.id)) {
            if (prevExtra && prevExtra[f.code] != null) keep[f.code] = prevExtra[f.code];
          }
        }
        return keep;
      }

      const state = {
        type_appareil: typeCodes()[0] || 'aerosol',
        type_libelle: '',
        source: 'parc',
        prestataire_id: '',
        matricule: '',
        numero_pharmacie: '',
        mode_obtention: 'depot',
        livraison: 'pharmacie',
        desinfection: false,
        encart_texte: '',
        champs_extra: {},
      };

      function collectChampsExtra(type) {
        const extra = { ...(state.champs_extra || {}) };
        for (const champ of champsForType(type)) {
          if (champ.data_type === 'attention') continue;
          const elIn = box.querySelector(`[name="ce_${champ.code}"]`);
          if (!elIn) continue;
          if (champ.data_type === 'oui_non') {
            extra[champ.code] = !!elIn.checked;
          } else if (champ.data_type === 'nombre') {
            const n = elIn.value === '' ? null : Number(elIn.value);
            extra[champ.code] = Number.isFinite(n) ? n : null;
          } else {
            const v = elIn.value;
            extra[champ.code] = v === '' ? null : v;
          }
        }
        return extra;
      }

      function collectCustomFields() {
        const fields = customFieldsForEtape('appareil');
        if (!fields.length) return;
        const extra = { ...(state.champs_extra || {}) };
        for (const f of fields) {
          const elIn = box.querySelector(`[name="cd_${f.code}"]`);
          if (!elIn) continue;
          const v = elIn.value.trim();
          extra[f.code] = v === '' ? null : v;
        }
        state.champs_extra = extra;
      }

      function collect() {
        if (!box.querySelector('[name=type_appareil]')) return;
        const type = box.querySelector('[name=type_appareil]')?.value || state.type_appareil || 'aerosol';
        const sourceEl = box.querySelector('[name=source]');
        const source = sourceEl ? sourceEl.value || 'parc' : state.source || 'parc';
        const next = {
          type_appareil: type,
          type_libelle: box.querySelector('[name=type_libelle]')
            ? box.querySelector('[name=type_libelle]').value.trim() || ''
            : state.type_libelle || '',
          source,
          prestataire_id: box.querySelector('[name=prestataire_id]')
            ? box.querySelector('[name=prestataire_id]').value || null
            : state.prestataire_id,
          matricule: box.querySelector('[name=matricule]')
            ? box.querySelector('[name=matricule]').value.trim() || ''
            : state.matricule || '',
          numero_pharmacie: box.querySelector('[name=numero_pharmacie]')
            ? box.querySelector('[name=numero_pharmacie]').value.trim() || ''
            : state.numero_pharmacie || '',
          mode_obtention: box.querySelector('[name=mode_obtention]')
            ? box.querySelector('[name=mode_obtention]').value || null
            : state.mode_obtention,
          livraison: box.querySelector('[name=livraison]')
            ? box.querySelector('[name=livraison]').value || null
            : state.livraison,
          desinfection: box.querySelector('[name=desinfection]')
            ? !!box.querySelector('[name=desinfection]').checked
            : !!state.desinfection,
          encart_texte: box.querySelector('[name=encart_texte]')
            ? box.querySelector('[name=encart_texte]').value
            : state.encart_texte,
          champs_extra: collectChampsExtra(type),
        };
        if (!next.prestataire_id) next.prestataire_id = null;
        if (source === 'parc') {
          next.prestataire_id = null;
          next.matricule = next.matricule || '';
          next.mode_obtention = null;
        }
        if (source === 'prestataire') {
          next.numero_pharmacie = '';
          next.desinfection = false;
        }
        Object.assign(state, next);
        collectCustomFields();
      }

      function validate() {
        collect();
        if (req('appareil', 'type_appareil') && !state.type_appareil) {
          return showMsg('Type d’appareil obligatoire.', true), false;
        }
        if (
          state.type_appareil === 'autre' &&
          show('appareil', 'type_libelle') &&
          req('appareil', 'type_libelle') &&
          !state.type_libelle
        ) {
          return showMsg('Précisez le type d’appareil.', true), false;
        }
        if (state.source === 'prestataire') {
          if (req('appareil', 'prestataire_id') && !state.prestataire_id) {
            return showMsg('Prestataire obligatoire.', true), false;
          }
          if (req('appareil', 'mode_obtention') && !state.mode_obtention) {
            return showMsg('Mode d’obtention obligatoire.', true), false;
          }
          if (req('appareil', 'livraison') && !state.livraison) {
            return showMsg('Livraison obligatoire.', true), false;
          }
        }
        if (state.source === 'parc') {
          if (req('appareil', 'numero_pharmacie') && !state.numero_pharmacie) {
            return showMsg('N° pharmacie obligatoire pour un appareil du parc.', true), false;
          }
        }
        for (const champ of champsForType(state.type_appareil)) {
          if (!champ.obligatoire) continue;
          const v = state.champs_extra?.[champ.code];
          if (champ.data_type === 'oui_non') continue;
          if (champ.data_type === 'attention') continue;
          if (v == null || v === '') {
            return showMsg(`Champ obligatoire : ${champ.libelle}.`, true), false;
          }
        }
        for (const f of customFieldsForEtape('appareil')) {
          if (!req('appareil', f.code)) continue;
          const v = state.champs_extra?.[f.code];
          if (v == null || String(v).trim() === '') {
            return showMsg(`${f.label} obligatoire.`, true), false;
          }
        }
        return true;
      }

      function renderForm() {
        const autre = state.type_appareil === 'autre';
        const prest = state.source === 'prestataire';
        const parc = state.source === 'parc';
        const extra = state.champs_extra || {};
        const typeChamps = champsForType(state.type_appareil);
        const dynamiques = typeChamps
          .filter((c) => c.data_type !== 'attention')
          .map((c) => champInputHtml(c, extra[c.code]))
          .join('');
        const attentions = attentionBoxesHtml(typeChamps);
        const customHtml = customFieldsForEtape('appareil')
          .map((f) => {
            if (!show('appareil', f.code)) return '';
            const val = extra[f.code] == null ? '' : String(extra[f.code]);
            return field(
              f.label,
              `<input name="cd_${esc(f.code)}" value="${esc(val)}">`,
              req('appareil', f.code)
            );
          })
          .join('');

        box.innerHTML = `
        <div class="loc-form" style="margin-top:8px">
        ${attentions}
        ${show('appareil', 'type_appareil') ? field('Type d’appareil', `<select name="type_appareil">
          ${typeCodes().map((t) => `<option value="${t}"${state.type_appareil === t ? ' selected' : ''}>${LocationRules.typeLabel(t)}</option>`).join('')}
        </select>`, req('appareil', 'type_appareil')) : `<input type="hidden" name="type_appareil" value="${esc(state.type_appareil)}">`}
        ${autre && show('appareil', 'type_libelle') ? field('Libellé (autre)', `<input name="type_libelle" value="${esc(state.type_libelle || '')}">`, req('appareil', 'type_libelle')) : ''}
        ${show('appareil', 'source') ? field('Source', `<select name="source">
          <option value="parc"${parc ? ' selected' : ''}>Parc pharmacie</option>
          <option value="prestataire"${prest ? ' selected' : ''}>Prestataire</option>
        </select>`, req('appareil', 'source')) : `<input type="hidden" name="source" value="${esc(state.source)}">`}
        ${prest ? `
          ${show('appareil', 'prestataire_id') ? field('Prestataire', `<select name="prestataire_id">
            <option value="">—</option>
            ${prestList.map((p) => `<option value="${esc(p.id)}"${state.prestataire_id === p.id ? ' selected' : ''}>${esc(p.nom)}</option>`).join('')}
          </select>`, req('appareil', 'prestataire_id')) : ''}
          ${show('appareil', 'matricule') ? `<div class="loc-field">
            <span class="loc-field-label-row">
              <label for="suNaMatricule">Matricule${req('appareil', 'matricule') ? ' *' : ''}</label>
              ${helpTipHtml('Si le matricule est connu.', 'Aide : matricule')}
            </span>
            <input id="suNaMatricule" name="matricule" value="${esc(state.matricule || '')}">
          </div>` : ''}
          ${show('appareil', 'mode_obtention') ? field('Obtention', `<select name="mode_obtention">
            <option value="depot"${state.mode_obtention === 'depot' ? ' selected' : ''}>Dépôt</option>
            <option value="appel"${state.mode_obtention === 'appel' ? ' selected' : ''}>Appel pour l’obtenir</option>
          </select>`, req('appareil', 'mode_obtention')) : ''}
          ${show('appareil', 'livraison') ? field('Livraison', `<select name="livraison">
            <option value="pharmacie"${state.livraison === 'pharmacie' ? ' selected' : ''}>À la pharmacie</option>
            <option value="patient"${state.livraison === 'patient' ? ' selected' : ''}>Chez le patient</option>
          </select>`, req('appareil', 'livraison')) : ''}
        ` : ''}
        ${parc ? `
          ${show('appareil', 'numero_pharmacie') ? field('N° appareil pharmacie', `<input name="numero_pharmacie" value="${esc(state.numero_pharmacie || '')}">`, req('appareil', 'numero_pharmacie')) : ''}
          ${show('appareil', 'desinfection') ? `<label class="loc-check"><input type="checkbox" name="desinfection"${state.desinfection ? ' checked' : ''}> Désinfection faite</label>` : ''}
        ` : ''}
        ${dynamiques ? `<div class="loc-champs-extra">${dynamiques}</div>` : ''}
        ${show('appareil', 'encart_texte') ? field('Commentaire', `<textarea name="encart_texte" rows="3">${esc(state.encart_texte || '')}</textarea>`, req('appareil', 'encart_texte')) : ''}
        ${customHtml}
        </div>
        <div class="loc-step-actions" style="margin-top:8px">
          <button type="button" class="loc-btn" id="suConfirmApp">Confirmer le changement</button>
          <button type="button" class="loc-btn loc-btn-ghost" id="suCancelApp">Annuler</button>
        </div>
      `;

        bindHelpTips(box);

        box.querySelector('[name=type_appareil]')?.addEventListener('change', (e) => {
          collect();
          const t = e.target.value;
          const prevExtra = state.champs_extra || {};
          state.type_appareil = t;
          state.champs_extra = preserveCreationCustomExtra(prevExtra);
          renderForm();
        });
        box.querySelector('[name=source]')?.addEventListener('change', () => {
          collect();
          renderForm();
        });
        box.querySelector('#suCancelApp')?.addEventListener('click', () => {
          box.hidden = true;
          box.innerHTML = '';
        });
        box.querySelector('#suConfirmApp')?.addEventListener('click', async () => {
          if (!validate()) return;
          try {
            const payload = {
              type_appareil: state.type_appareil,
              type_libelle:
                state.type_appareil === 'autre' ? state.type_libelle || null : null,
              source: state.source || 'parc',
              prestataire_id: state.prestataire_id || null,
              matricule: state.matricule || null,
              numero_pharmacie: state.numero_pharmacie || null,
              mode_obtention: state.mode_obtention || null,
              livraison: state.livraison || null,
              desinfection: !!state.desinfection,
              encart_texte: state.encart_texte || null,
              champs_extra:
                state.champs_extra && typeof state.champs_extra === 'object'
                  ? state.champs_extra
                  : {},
              facturation_prestataire: false,
            };
            if (payload.source === 'parc') {
              payload.prestataire_id = null;
              payload.mode_obtention = null;
            }
            if (payload.source === 'prestataire') {
              payload.numero_pharmacie = null;
              payload.desinfection = false;
            }
            await LocationData.changerAppareil(d.id, payload);
            showMsg('Appareil changé.');
            openDetail(d.id);
          } catch (e) {
            showMsg(e.message, true);
          }
        });
      }

      renderForm();
    }

    async function cancelAppChange(d) {
      if (typeof ctx.can === 'function' && !ctx.can('edition_suivi')) {
        showMsg('Édition non autorisée pour votre rôle.', true);
        return;
      }
      if (!window.confirm('Annuler le dernier changement d’appareil ?')) return;
      try {
        await LocationData.annulerChangementAppareil(d.id);
        showMsg('Changement d’appareil annulé.');
        await openDetail(d.id);
      } catch (e) {
        showMsg(e.message || 'Erreur', true);
      }
    }

    async function saveDetail(d) {
      if (typeof ctx.can === 'function' && !ctx.can('edition_suivi')) {
        showMsg('Édition non autorisée pour votre rôle.', true);
        return;
      }
      const g = (n) => detailEl.querySelector(`[name=${n}]`);
      try {
        await LocationData.updatePatient(d.patient.id, {
          nom: g('p_nom').value.trim(),
          prenom: g('p_prenom').value.trim(),
          date_naissance: g('p_dn').value || null,
          adresse: g('p_adresse').value.trim() || null,
          telephones: LocationFields.collectPhones(detailEl.querySelector('#phonesList')),
          mails: LocationFields.collectMails(detailEl.querySelector('#mailsList')),
        });
        const statut = g('statut').value;
        const cautionVal = g('caution').value;
        await LocationData.updateDossier(d.id, {
          code_op: g('code_op').value.trim() || null,
          caution: cautionVal || null,
          statut,
          qui_facture: g('qui_facture').value,
          date_debut: g('date_debut').value || null,
          appareil_rendu: g('appareil_rendu').checked,
          caution_rendue: g('caution_rendue').checked,
          caution_rendue_le: g('caution_rendue_le').value || null,
          caution_rendue_op: g('caution_rendue_op').value.trim() || null,
          date_cloture: g('date_cloture').value || (statut === 'cloture' ? LocationRules.todayISO() : null),
          cloture_op: g('cloture_op').value.trim() || null,
          notes: g('notes').value.trim() || null,
        });
        if (d.appareil_actif) {
          const source = g('a_source').value || 'parc';
          const appPatch = {
            source,
            type_libelle: g('a_type_libelle')
              ? g('a_type_libelle').value.trim() || null
              : d.appareil_actif.type_libelle || null,
            prestataire_id: g('a_prestataire_id')?.value || null,
            matricule: g('a_matricule')?.value.trim() || null,
            numero_pharmacie: g('a_numero')?.value.trim() || null,
            mode_obtention: g('a_obtention')?.value || null,
            livraison: g('a_livraison')?.value || null,
            desinfection: !!g('a_desinfection')?.checked,
            encart_texte: g('encart_texte').value,
            facturation_prestataire: g('facturation_prestataire').checked,
          };
          if (source === 'parc') {
            appPatch.prestataire_id = null;
            appPatch.mode_obtention = null;
          }
          if (source === 'prestataire') {
            appPatch.numero_pharmacie = null;
            appPatch.desinfection = false;
          }
          const nextExtra = {
            ...(d.appareil_actif.champs_extra && typeof d.appareil_actif.champs_extra === 'object'
              ? d.appareil_actif.champs_extra
              : {}),
          };
          const [paramsSave, champsSave] = await Promise.all([
            LocationData.loadParams(),
            LocationData.listChampsCreation(null, false),
          ]);
          for (const etape of LocationData.CREATION_ETAPES) {
            for (const f of LocationData.listCreationFieldsForEtape(paramsSave, etape.id)) {
              if (!f.custom) continue;
              const inp = detailEl.querySelector(`[name="cd_${f.code}"]`);
              if (!inp) continue;
              const v = inp.value.trim();
              nextExtra[f.code] = v === '' ? null : v;
            }
          }
          const typeChamps = (champsSave || []).filter(
            (c) => c.type_appareil === d.appareil_actif.type_appareil
          );
          for (const champ of typeChamps) {
            if (champ.data_type === 'attention') continue;
            const elIn = detailEl.querySelector(`[name="ce_${champ.code}"]`);
            if (!elIn) continue;
            if (champ.data_type === 'oui_non') {
              nextExtra[champ.code] = !!elIn.checked;
            } else if (champ.data_type === 'nombre') {
              const n = elIn.value === '' ? null : Number(elIn.value);
              nextExtra[champ.code] = Number.isFinite(n) ? n : null;
            } else {
              const v = elIn.value;
              nextExtra[champ.code] = v === '' ? null : v;
            }
          }
          appPatch.champs_extra = nextExtra;
          await LocationData.updateAppareil(d.appareil_actif.id, appPatch);
        }
        // Qui facture peut changer en cours de location → resync file Contact immédiatement.
        try {
          await LocationData.syncContactQueue(ctx.userId);
        } catch (_) {
          /* sync best-effort */
        }
        showMsg('Enregistré.');
        await refresh();
        await openDetail(d.id);
      } catch (e) {
        showMsg(e.message || 'Erreur enregistrement', true);
      }
    }

    async function addProlong(d) {
      if (typeof ctx.can === 'function' && !ctx.can('edition_suivi')) {
        showMsg('Édition non autorisée pour votre rôle.', true);
        return;
      }
      const box = detailEl.querySelector('#suProlongForm');
      const duree = Number(box.querySelector('[name=pr_duree]').value);
      const unite = box.querySelector('[name=pr_unite]').value;
      const rules = await LocationData.loadRules();
      const evalRes = LocationRules.evaluate(
        { ...LocationData.dossierContext(d), prolong_duree: duree, prolong_unite: unite },
        rules,
        await LocationData.loadParams()
      );
      const block = evalRes.alerts.find((a) => a.action === 'bloquer_ou_alerter');
      if (block && !confirm(block.message + '\n\nContinuer quand même ?')) return;
      try {
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
        showMsg('Prolongation ajoutée.');
        await refresh();
        await openDetail(d.id);
      } catch (e) {
        showMsg(e.message, true);
      }
    }

    function showEditProlong(d, pr) {
      if (typeof ctx.can === 'function' && !ctx.can('edition_suivi')) {
        showMsg('Édition non autorisée pour votre rôle.', true);
        return;
      }
      const box = detailEl.querySelector('#suProlongEdit');
      if (!box) return;
      box.hidden = false;
      box.innerHTML = `
        <div class="loc-grid-2" style="margin-top:8px">
          <label class="loc-field">Date ordo<input type="date" name="ep_ordo" value="${esc(pr.date_ordo || '')}"></label>
          <label class="loc-field">Durée<input type="number" min="1" name="ep_duree" value="${esc(pr.duree)}"></label>
          <label class="loc-field">Unité<select name="ep_unite">
            <option value="jours"${pr.unite === 'jours' ? ' selected' : ''}>Jours</option>
            <option value="semaines"${pr.unite === 'semaines' ? ' selected' : ''}>Semaines</option>
            <option value="mois"${pr.unite === 'mois' ? ' selected' : ''}>Mois</option>
          </select></label>
          <label class="loc-field">Notes<input name="ep_notes" value="${esc(pr.notes || '')}"></label>
        </div>
        <div class="loc-step-actions" style="margin-top:8px">
          <button type="button" class="loc-btn" id="suSaveProlong">Enregistrer</button>
          <button type="button" class="loc-btn loc-btn-ghost" id="suCancelProlong">Annuler</button>
        </div>
      `;
      box.querySelector('#suCancelProlong').addEventListener('click', () => {
        box.hidden = true;
        box.innerHTML = '';
      });
      box.querySelector('#suSaveProlong').addEventListener('click', async () => {
        const duree = Number(box.querySelector('[name=ep_duree]').value);
        const unite = box.querySelector('[name=ep_unite]').value;
        try {
          await LocationData.updateProlongation(pr.id, {
            date_ordo: box.querySelector('[name=ep_ordo]').value || null,
            duree,
            unite,
            notes: box.querySelector('[name=ep_notes]').value.trim() || null,
          });
          showMsg('Prolongation modifiée.');
          await refresh();
          await openDetail(d.id);
        } catch (e) {
          showMsg(e.message || 'Erreur', true);
        }
      });
    }

    async function deleteProlong(d, prolongId) {
      if (typeof ctx.can === 'function' && !ctx.can('edition_suivi')) {
        showMsg('Édition non autorisée pour votre rôle.', true);
        return;
      }
      if (!window.confirm('Supprimer cette prolongation ?')) return;
      try {
        await LocationData.deleteProlongation(prolongId);
        showMsg('Prolongation supprimée.');
        await refresh();
        await openDetail(d.id);
      } catch (e) {
        showMsg(e.message || 'Erreur', true);
      }
    }

    btnPrev.addEventListener('click', goPrev);
    btnNext.addEventListener('click', goNext);
    wrap.querySelector('#suRefresh').addEventListener('click', refresh);
    wrap.querySelector('#suSearch').addEventListener('change', refresh);
    wrap.querySelector('#suStatut').addEventListener('change', refresh);
    wrap.querySelector('#suType').addEventListener('change', refresh);
    wrap.querySelector('#suContact').addEventListener('change', refresh);
    wrap.querySelector('#suPrintTable').addEventListener('click', () => {
      void LocationPrint.printTableau(rows);
    });

    await refresh();
    if (selectedId) await openDetail(selectedId);
  }

  global.LocationSuivi = { mount, contactsTableHtml };
})(window);
