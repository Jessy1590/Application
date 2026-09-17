/**
 * Module Contact — files Commentaire / Appels / Attente / Perte.
 * Phase commentaire = message LGO (template) à reporter sur le compte patient.
 * Phase appel = arbre décisionnel (joint ? → résultat → mail éventuel).
 * Attente = resolu + ramene_semaine | ordo_mail ; Perte = resolu + resultat PERTE.
 * Note / résultat d’appel : champs vides (pas de préremplissage).
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

  const PHASE_COMMENTAIRE = 'commentaire';
  const PHASE_APPEL = 'appel';

  const APPEL_STATUT_LABELS = {
    a_contacter: 'À appeler',
    en_cours: 'En cours',
    reporte: 'À rappeler',
    contacte: 'Contacté',
    resolu: 'Terminé',
    annule: 'Annulé',
    PERTE: 'PERTE',
  };

  const APPEL_RESULTAT_LABELS = {
    ramene_semaine: 'Ramène appareil dans la semaine',
    ordo_mail: 'Envoie ordonnance par mail',
    ordo_mail_a_faire: 'Envoie ordonnance par mail — À faire',
    message_repondeur: 'Message sur le répondeur',
    raccroche: 'Raccroché',
    mauvais_numero: 'Mauvais numéro',
    pas_de_numero: 'Pas de numéro',
    autre_raison: 'Autre raison',
    message_laisse: 'Message laissé',
    PERTE: 'PERTE',
  };

  /** Résultats d’appel → file « Attente prolongation ou retour appareil » (appel OK). */
  const ATTENTE_RESULTATS = new Set(['ramene_semaine', 'ordo_mail', 'autre_raison']);

  /** Libellés motifs template (mêmes que admin-location). */
  const MOTIF_LABELS = {
    prolongation: 'Prolongation',
    prolongation_tire_lait: 'Prolongation tire-lait',
    reclame_appareil: 'Réclamer appareil',
    reclame_appareil_tens: 'Réclamer TENS',
  };

  function contactPhase(it) {
    return it?.phase === PHASE_APPEL ? PHASE_APPEL : PHASE_COMMENTAIRE;
  }

  function todayFr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  function appendJournal(prev, line) {
    const p = String(prev || '').trim();
    const l = String(line || '').trim();
    if (!l) return p || null;
    return p ? `${p}\n${l}` : l;
  }

  function phonesOf(dossier) {
    return dossier?.patient?.telephones || [];
  }

  function mailsOf(dossier) {
    return dossier?.patient?.mails || [];
  }

  /** Libellé humain du motif contact, sinon code motif. */
  function motifCommentLabel(motif) {
    if (!motif) return '—';
    if (MOTIF_LABELS[motif]) return MOTIF_LABELS[motif];
    const tpl = global.LocationRules?.templateMotifFor?.(motif);
    if (tpl && MOTIF_LABELS[tpl]) return MOTIF_LABELS[tpl];
    return motif;
  }

  function patientLabel(d) {
    const p = d?.patient || {};
    return [p.nom, p.prenom].filter(Boolean).join(' ').trim() || '—';
  }

  /** Map statut appel Ancienne → statut location_contacts (contrainte DB sans PERTE). */
  function mapAppelStatut(ancienne) {
    if (ancienne === 'termine' || ancienne === 'PERTE') return 'resolu';
    if (ancienne === 'a_rappeler') return 'reporte';
    if (ancienne === 'a_appeler') return 'a_contacter';
    return 'a_contacter';
  }

  function isOpenContact(it) {
    return ['a_contacter', 'en_cours', 'reporte'].includes(it?.statut);
  }

  function isAttenteContact(it) {
    return it?.statut === 'resolu' && ATTENTE_RESULTATS.has(it.resultat);
  }

  function isPerteContact(it) {
    return it?.statut === 'resolu' && it.resultat === 'PERTE';
  }

  async function mount(root, ctx) {
    root.innerHTML = '';
    const wrap = el(`<div class="loc-module loc-contact">
      <div class="loc-bar">
        <button type="button" class="loc-btn loc-btn-ghost loc-toggle-btn" id="coToggleFilters" aria-expanded="false" aria-controls="coFilters">Filtres</button>
        <button type="button" class="loc-btn loc-btn-ghost loc-toggle-btn" id="coToggleList" aria-expanded="true" aria-controls="coListPanel">Dossiers</button>
        <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" id="coPrev" aria-label="Dossier précédent" disabled>←</button>
        <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" id="coNext" aria-label="Dossier suivant" disabled>→</button>
        <button type="button" class="loc-btn" id="coSync">Synchroniser la file</button>
        <button type="button" class="loc-btn loc-btn-ghost" id="coPrint">Imprimer la liste</button>
        <span class="loc-muted" id="coCount"></span>
      </div>
      <div class="loc-toolbar loc-filters" id="coFilters" hidden>
        <input type="search" id="coSearch" placeholder="Recherche nom / prénom">
        <select id="coStatut">
          <option value="">Tous statuts</option>
          <option value="actif" selected>Actifs</option>
          <option value="cloture">Clôturés</option>
          <option value="annule">Annulés</option>
        </select>
        <select id="coType">
          <option value="">Tous types</option>
          ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
        <label class="loc-check loc-check-inline"><input type="checkbox" id="coContact"> À contacter</label>
      </div>
      <div class="loc-contact-tabs" role="tablist">
        <button type="button" class="loc-admin-tab active" data-file="commentaire">Commentaire</button>
        <button type="button" class="loc-admin-tab" data-file="appel">Appels</button>
        <button type="button" class="loc-admin-tab" data-file="attente">Attente prolongation ou retour appareil</button>
        <button type="button" class="loc-admin-tab" data-file="perte">Perte</button>
      </div>
      <div class="loc-split" id="coSplit">
        <div class="loc-list-panel" id="coListPanel">
          <div class="loc-list" id="coList"></div>
        </div>
        <div class="loc-detail" id="coFlow"><p class="loc-muted">Sélectionnez un patient.</p></div>
      </div>
      <p class="loc-msg" id="coMsg" hidden></p>
    </div>`);
    root.appendChild(wrap);

    let items = [];
    let filteredItems = [];
    let current = null;
    let file = 'commentaire';
    /** @type {string} */
    let callStep = 'ask_call';
    const draft = {};

    const listEl = wrap.querySelector('#coList');
    const listPanel = wrap.querySelector('#coListPanel');
    const splitEl = wrap.querySelector('#coSplit');
    const flowEl = wrap.querySelector('#coFlow');
    const msgEl = wrap.querySelector('#coMsg');
    const countEl = wrap.querySelector('#coCount');
    const filtersEl = wrap.querySelector('#coFilters');
    const btnFilters = wrap.querySelector('#coToggleFilters');
    const btnList = wrap.querySelector('#coToggleList');
    const btnPrev = wrap.querySelector('#coPrev');
    const btnNext = wrap.querySelector('#coNext');

    function setFile(name) {
      file = name;
      wrap.querySelectorAll('[data-file]').forEach((b) =>
        b.classList.toggle('active', b.dataset.file === file)
      );
    }

    /** Onglet cible après enregistrement d’un contact. */
    function fileForContact(it) {
      if (!it) return file;
      if (isPerteContact(it)) return 'perte';
      if (isAttenteContact(it)) return 'attente';
      if (isOpenContact(it) && contactPhase(it) === PHASE_APPEL) return 'appel';
      if (isOpenContact(it) && contactPhase(it) === PHASE_COMMENTAIRE) return 'commentaire';
      return file;
    }

    function activeQueue() {
      if (file === 'appel') return callQueue();
      if (file === 'attente') return attenteQueue();
      if (file === 'perte') return perteQueue();
      return commentQueue();
    }

    function currentIndex() {
      if (!current) return -1;
      return activeQueue().findIndex((i) => i.id === current.id);
    }

    function updateNav() {
      const queue = activeQueue();
      const n = queue.length;
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
      const queue = activeQueue();
      if (!queue.length) return;
      const i = currentIndex();
      const target = i < 0 ? queue[queue.length - 1] : queue[i - 1];
      if (target) selectItem(target.id);
    }

    function goNext() {
      const queue = activeQueue();
      if (!queue.length) return;
      const i = currentIndex();
      const target = i < 0 ? queue[0] : queue[i + 1];
      if (target) selectItem(target.id);
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

    function commentQueue() {
      return filteredItems.filter((i) => isOpenContact(i) && contactPhase(i) === PHASE_COMMENTAIRE);
    }

    function callQueue() {
      return filteredItems.filter((i) => isOpenContact(i) && contactPhase(i) === PHASE_APPEL);
    }

    function attenteQueue() {
      return filteredItems.filter(isAttenteContact);
    }

    function perteQueue() {
      return filteredItems.filter(isPerteContact);
    }

    function updateCount() {
      countEl.textContent = `${commentQueue().length} com. · ${callQueue().length} appels · ${attenteQueue().length} attente · ${perteQueue().length} perte`;
    }

    function queueTitle() {
      if (file === 'appel') return 'File Appels';
      if (file === 'attente') return 'Attente prolongation ou retour appareil';
      if (file === 'perte') return 'Perte';
      return 'File Commentaire (LGO)';
    }

    /** Filtrage dossier = mêmes critères que Suivi / listDossiers. */
    async function applyFilters() {
      let list = items.slice();
      const q = wrap.querySelector('#coSearch').value;
      const statut = wrap.querySelector('#coStatut').value || undefined;
      const typeAppareil = wrap.querySelector('#coType').value || undefined;
      const aContacter = wrap.querySelector('#coContact').checked || undefined;

      // Dossiers brouillon création : hors module Contact
      list = list.filter((i) => (i.dossier || {}).statut !== 'en_attente');

      if (statut) {
        list = list.filter((i) => (i.dossier || {}).statut === statut);
      }
      if (q) {
        const t = String(q).toLowerCase().trim();
        list = list.filter((i) => {
          const p = i.dossier?.patient || {};
          return (
            String(p.nom || '').toLowerCase().includes(t) ||
            String(p.prenom || '').toLowerCase().includes(t)
          );
        });
      }
      if (typeAppareil) {
        list = list.filter((i) => i.dossier?.appareil_actif?.type_appareil === typeAppareil);
      }
      if (aContacter) {
        const params = await LocationData.loadParams();
        const rules = await LocationData.loadRules();
        list = list.filter((i) => {
          const d = i.dossier;
          if (!d) return false;
          const ctx = LocationData.dossierContext(d);
          return LocationRules.evaluate(ctx, rules, params).shouldContact;
        });
      }
      filteredItems = list;
    }

    function resetDraft() {
      Object.keys(draft).forEach((k) => delete draft[k]);
      callStep = 'ask_call';
    }

    async function refresh() {
      showMsg('Chargement…');
      try {
        const [open, outcomes] = await Promise.all([
          LocationData.listOpenContacts(),
          LocationData.listOutcomeContacts(),
        ]);
        items = open.concat(outcomes);
        await applyFilters();
        updateCount();
        showMsg('');
        renderList();
        if (current) {
          const still = filteredItems.find((i) => i.id === current.id);
          if (still) {
            current = still;
            renderFlow();
          } else {
            current = null;
            flowEl.innerHTML = '<p class="loc-muted">Sélectionnez un patient.</p>';
          }
        }
      } catch (e) {
        showMsg(e.message || 'Erreur', true);
      }
    }

    async function onFiltersChange() {
      try {
        await applyFilters();
        updateCount();
        renderList();
        if (current && !filteredItems.find((i) => i.id === current.id)) {
          current = null;
          resetDraft();
          flowEl.innerHTML = '<p class="loc-muted">Sélectionnez un patient.</p>';
        }
      } catch (e) {
        showMsg(e.message || 'Erreur filtres', true);
      }
    }

    function selectItem(id) {
      current = filteredItems.find((i) => i.id === id) || null;
      resetDraft();
      if (current) setFile(fileForContact(current));
      renderList();
      renderFlow();
    }

    function listButton(it) {
      const d = it.dossier || {};
      let phaseLabel = 'Commentaire';
      if (isAttenteContact(it)) phaseLabel = APPEL_RESULTAT_LABELS[it.resultat] || it.resultat || 'Attente';
      else if (isPerteContact(it)) phaseLabel = 'PERTE';
      else if (contactPhase(it) === PHASE_APPEL) phaseLabel = 'Appel';
      return `<button type="button" class="loc-list-item${current?.id === it.id ? ' active' : ''}" data-id="${esc(it.id)}">
        <strong>${esc(patientLabel(d))}</strong>
        <span>${esc(it.motif || '')} · ${esc(phaseLabel)}</span>
        <span class="loc-badge">${esc(d.date_fin || '—')}</span>
      </button>`;
    }

    function canSuivi() {
      return typeof ctx.can === 'function' ? ctx.can('module_suivi') : true;
    }

    function dossierActif(d) {
      return !!(d && d.statut !== 'cloture' && d.statut !== 'annule' && d.statut !== 'en_attente');
    }

    function canCloture(d) {
      if (!dossierActif(d)) return false;
      return typeof ctx.can === 'function' ? ctx.can('module_cloture') : true;
    }

    function canProlongation(d) {
      if (!dossierActif(d)) return false;
      return typeof ctx.can === 'function' ? ctx.can('module_prolongation') : true;
    }

    function canInvalidateCommentaire(contact) {
      if (!contact || !isOpenContact(contact)) return false;
      return contactPhase(contact) === PHASE_APPEL || !!contact.commentaire_fait_at;
    }

    function dossierNavBtns(d) {
      const dossierId = d?.id || current?.dossier_id || '';
      const parts = [];
      if (canSuivi()) {
        parts.push(
          `<button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-suivi="${esc(dossierId)}" title="Ouvrir Suivi" aria-label="Ouvrir Suivi" ${dossierId ? '' : 'disabled'}>✎</button>`
        );
      }
      if (canCloture(d) && dossierId) {
        parts.push(
          `<button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-cloture="${esc(dossierId)}" title="Clôturer le dossier" aria-label="Clôturer le dossier">C</button>`
        );
      }
      if (canProlongation(d) && dossierId) {
        parts.push(
          `<button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-prolong="${esc(dossierId)}" title="Prolongation" aria-label="Prolongation">P</button>`
        );
      }
      return parts.join('');
    }

    function invalidateComBtn() {
      if (!canInvalidateCommentaire(current)) return '';
      return `<span class="loc-help-tip">
        <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-invalidate-com aria-label="Invalider le commentaire">IC</button>
        <span class="loc-help-tip__bubble" role="tooltip">Invalider le commentaire : remet le dossier en file Commentaire (LGO à refaire).</span>
      </span>`;
    }

    function detailHeadActions(d) {
      return `<div class="loc-detail-head-actions">${dossierNavBtns(d)}${invalidateComBtn()}</div>`;
    }

    function bindDetailHeadActions() {
      flowEl.querySelector('[data-suivi]')?.addEventListener('click', (ev) => {
        const id = ev.currentTarget.dataset.suivi;
        if (id) ctx.openSuivi?.(id);
      });
      flowEl.querySelector('[data-cloture]')?.addEventListener('click', (ev) => {
        const id = ev.currentTarget.dataset.cloture;
        if (id) ctx.openCloture?.(id);
      });
      flowEl.querySelector('[data-prolong]')?.addEventListener('click', (ev) => {
        const id = ev.currentTarget.dataset.prolong;
        if (id) ctx.openProlongation?.(id);
      });
      flowEl.querySelector('[data-invalidate-com]')?.addEventListener('click', () => {
        void invalidateCommentaire();
      });
    }

    async function invalidateCommentaire() {
      const dossierId = current?.dossier_id || current?.dossier?.id;
      if (!dossierId) return;
      if (
        !window.confirm(
          'Invalider le commentaire ? Tout le dossier repasse en phase Commentaire (une seule file).'
        )
      ) {
        return;
      }
      try {
        showMsg('Enregistrement…');
        const d = await LocationData.getDossier(dossierId);
        await LocationData.invalidateDossierCommentaire(d.id, d.contacts || []);
        await LocationData.syncContactQueue(ctx.userId);
        showMsg('Dossier remis en phase Commentaire.');
        current = null;
        resetDraft();
        await refresh();
        flowEl.innerHTML = '<p class="loc-muted">Sélectionnez un patient.</p>';
      } catch (e) {
        showMsg(e.message || 'Erreur', true);
      }
    }

    function renderList() {
      const queue = activeQueue();
      const title = queueTitle();
      if (!queue.length) {
        listEl.innerHTML = `<p class="loc-muted">${esc(title)} vide.</p>`;
        updateNav();
        return;
      }
      listEl.innerHTML = `<h4 class="loc-queue-title">${esc(title)} (${queue.length})</h4>${queue.map(listButton).join('')}`;
      listEl.querySelectorAll('[data-id]').forEach((b) => {
        b.addEventListener('click', () => selectItem(b.dataset.id));
      });
      updateNav();
    }

    function stepCard(title, actionsHtml, extraHtml = '') {
      return `<div class="loc-step-card">
        <h4>${esc(title)}</h4>
        ${extraHtml}
        <div class="loc-step-actions">${actionsHtml}</div>
      </div>`;
    }

    function btn(label, attrs, cls = '') {
      return `<button type="button" class="loc-btn ${cls}" ${attrs}>${esc(label)}</button>`;
    }

    function go(step) {
      callStep = step;
      renderFlow();
    }

    function callJournalPrefix() {
      return draft.fromPatientRecall ? 'Rappel par le patient' : 'Appel OK';
    }

    function rowHasMailSent(dossier) {
      return /Mail déjà envoyé|Mail envoyé/i.test(String(dossier?.notes || ''));
    }

    async function appendDossierJournal(dossierId, line) {
      if (!dossierId || !line) return;
      const d = await LocationData.getDossier(dossierId);
      const notes = appendJournal(d.notes, line);
      await LocationData.updateDossier(dossierId, { notes });
    }

    async function applyCallUpdate(contact, { appel_statut, appel_resultat, journalLine, mailNote }) {
      const statut = mapAppelStatut(appel_statut);
      /** PERTE n’existe pas en contrainte statut DB → resolu + resultat PERTE. */
      const resultat = appel_statut === 'PERTE' ? 'PERTE' : appel_resultat || null;
      const lines = [journalLine, mailNote].filter(Boolean);
      for (const line of lines) {
        await appendDossierJournal(contact.dossier_id, line);
      }
      const saved = await LocationData.upsertContact({
        id: contact.id,
        dossier_id: contact.dossier_id,
        motif: contact.motif,
        statut,
        phase: PHASE_APPEL,
        commentaire: contact.commentaire || null,
        resultat,
        canal: 'telephone',
        contacted_at: new Date().toISOString(),
        phase_date_fin: contact.dossier?.date_fin || contact.phase_date_fin || null,
      });
      const nextFile = fileForContact({ ...contact, ...saved, statut, resultat, phase: PHASE_APPEL });
      if (nextFile === 'perte') showMsg('Statut PERTE — rangé dans Perte.');
      else if (nextFile === 'attente') showMsg('Appel OK — rangé en Attente prolongation ou retour.');
      else showMsg('Appel enregistré — reste en file Appels.');
      current = null;
      resetDraft();
      setFile(nextFile);
      await refresh();
      flowEl.innerHTML = '<p class="loc-muted">Fiche suivante : sélectionnez dans la liste.</p>';
    }

    async function handleCallYes(contact) {
      const code = draft.resultat;
      const note = (draft.note || '').trim();
      const date = todayFr();
      const prefix = callJournalPrefix();
      const d = contact.dossier || {};

      if (code === 'ramene_semaine') {
        const line =
          `${date} — ${prefix} : ramène l’appareil dans la semaine` + (note ? ` (${note})` : '');
        await applyCallUpdate(contact, {
          appel_resultat: code,
          appel_statut: 'termine',
          journalLine: line,
        });
        return;
      }

      if (code === 'autre_raison') {
        const statut = draft.autreStatut || 'a_rappeler';
        const statutLabel = APPEL_STATUT_LABELS[statut] || statut;
        const line = `${date} — ${prefix} : autres — ${note} → ${statutLabel}`;
        await applyCallUpdate(contact, {
          appel_resultat: 'autre_raison',
          appel_statut: statut,
          journalLine: line,
        });
        return;
      }

      if (code === 'ordo_mail') {
        draft.backAfterMail = 'call_yes_comment';
        draft.afterMail = 'termine_ordo';
        draft.recallLine =
          `${date} — ${prefix} : envoie l’ordonnance par mail` + (note ? ` (${note})` : '');
        goMailStepOrSkip(contact);
        return;
      }

      if (code === 'message_repondeur') {
        draft.recallLine = draft.fromPatientRecall
          ? `${date} — Rappel par le patient : message sur le répondeur` + (note ? ` (${note})` : '')
          : `${date} — Déjà appelé le ${date} et laissé message sur le répondeur` +
            (note ? ` (${note})` : '');
        draft.afterMail = 'rappeler';
      } else if (code === 'raccroche') {
        draft.recallLine = draft.fromPatientRecall
          ? `${date} — Rappel par le patient : a raccroché` + (note ? ` (${note})` : '')
          : `${date} — Déjà appelé le ${date} : a raccroché` + (note ? ` (${note})` : '');
        draft.afterMail = 'rappeler';
      } else if (code === 'mauvais_numero') {
        draft.recallLine = `${date} — ${prefix} : mauvais numéro` + (note ? ` (${note})` : '');
        draft.afterMail = 'mauvais_numero';
      }

      draft.backAfterMail = 'call_yes_comment';
      goMailStepOrSkip(contact);
    }

    async function handleCallNo(contact) {
      const date = todayFr();
      const reason = draft.noReason;
      const note = (draft.note || '').trim();

      if (reason === 'autre_raison') {
        const line = `${date} — Pas appelé : ${note}`;
        await applyCallUpdate(contact, {
          appel_resultat: 'autre_raison',
          appel_statut: 'a_rappeler',
          journalLine: line,
        });
        return;
      }

      draft.recallLine = `${date} — Pas de numéro` + (note ? ` (${note})` : '');
      draft.afterMail = 'pas_de_numero';
      draft.backAfterMail = 'call_no_comment';
      goMailStepOrSkip(contact);
    }

    function goMailStepOrSkip(contact) {
      if (rowHasMailSent(contact.dossier)) {
        handleMailYes(contact);
        return;
      }
      go('ask_mail');
    }

    async function handleMailYes(contact) {
      const d = contact.dossier || {};
      const date = todayFr();
      const after = draft.afterMail;
      const baseLine = draft.recallLine || `${date} — Suivi appel`;
      const already = rowHasMailSent(d);
      const mailLine = already
        ? `${date} — Mail déjà envoyé (module comptes / métier)`
        : `${date} — Mail envoyé (logiciel métier)`;

      let appel_resultat = draft.resultat || draft.noReason;
      let appel_statut = 'a_rappeler';

      if (after === 'termine_ordo') {
        appel_resultat = 'ordo_mail';
        appel_statut = 'termine';
      } else if (after === 'rappeler') {
        appel_statut = 'a_rappeler';
      } else if (after === 'mauvais_numero' || after === 'pas_de_numero') {
        appel_resultat = after;
        appel_statut = 'termine';
      }

      await applyCallUpdate(contact, {
        appel_resultat,
        appel_statut,
        journalLine: baseLine,
        mailNote: mailLine,
      });
    }

    async function handleMailAFaire(contact) {
      if (rowHasMailSent(contact.dossier)) {
        await handleMailYes(contact);
        return;
      }
      const date = todayFr();
      const after = draft.afterMail;
      const baseLine = draft.recallLine || `${date} — Suivi`;
      const aFaireLine = `${date} — Mail à faire`;

      let appel_resultat = draft.resultat || draft.noReason;
      if (after === 'termine_ordo') appel_resultat = 'ordo_mail_a_faire';
      else if (after === 'mauvais_numero' || after === 'pas_de_numero') appel_resultat = after;

      await applyCallUpdate(contact, {
        appel_resultat,
        appel_statut: 'a_rappeler',
        journalLine: baseLine,
        mailNote: aFaireLine,
      });
    }

    async function handleNoMail(contact) {
      if (rowHasMailSent(contact.dossier)) {
        await handleMailYes(contact);
        return;
      }
      const date = todayFr();
      const after = draft.afterMail;
      const baseLine = draft.recallLine || `${date} — Suivi`;
      const noMailLine = `${date} — Pas d’adresse mail / pas d’envoi possible`;

      if (after === 'termine_ordo') {
        await applyCallUpdate(contact, {
          appel_resultat: 'ordo_mail',
          appel_statut: 'PERTE',
          journalLine: `${baseLine}\n${noMailLine}\n${date} — Statut PERTE (ordo mail impossible)`,
        });
        return;
      }

      if (after === 'rappeler') {
        await applyCallUpdate(contact, {
          appel_resultat: draft.resultat,
          appel_statut: 'a_rappeler',
          journalLine: `${baseLine}\n${noMailLine}`,
        });
        return;
      }

      await applyCallUpdate(contact, {
        appel_resultat: after === 'mauvais_numero' ? 'mauvais_numero' : 'pas_de_numero',
        appel_statut: 'termine',
        journalLine: `${baseLine}\n${noMailLine}`,
      });
    }

    async function validateCommentaire(mailAlready) {
      if (!current) return;
      const lgoText = String(current.commentaire || '').trim();
      if (!lgoText) {
        showMsg('Aucun message LGO à valider.', true);
        return;
      }
      try {
        showMsg('Enregistrement…');
        if (mailAlready) {
          await appendDossierJournal(
            current.dossier_id,
            `${todayFr()} — Mail déjà envoyé (module comptes)`
          );
        }
        await LocationData.upsertContact({
          id: current.id,
          dossier_id: current.dossier_id,
          motif: current.motif,
          statut: current.statut === 'reporte' ? 'reporte' : 'a_contacter',
          phase: PHASE_APPEL,
          commentaire: lgoText,
          commentaire_fait_at: new Date().toISOString(),
          phase_date_fin: current.dossier?.date_fin || null,
        });
        showMsg(
          mailAlready
            ? 'Commentaire ECRIS + mail noté — passé en file Appel.'
            : 'Commentaire ECRIS — passé en file Appel.'
        );
        current = null;
        resetDraft();
        setFile('appel');
        await refresh();
        flowEl.innerHTML = '<p class="loc-muted">Sélectionnez un patient dans Appels.</p>';
      } catch (e) {
        showMsg(e.message || 'Erreur', true);
      }
    }

    function renderCommentFlow(d, p) {
      const lgo = current.commentaire || '';
      const phones = phonesOf(d);
      const mails = mailsOf(d);
      const identity = [p.nom || '—', p.prenom || '—', p.date_naissance || '—'].join(' - ');
      const appareilFin = [
        LocationRules.typeLabel(d.appareil_actif?.type_appareil) || '—',
        d.date_fin || '—',
      ].join(' - ');
      return `
        <div class="loc-detail-head">
          <div>
            <p class="loc-badge">Phase A — Commentaire (LGO)</p>
            <h3>${esc(identity)}</h3>
            <div class="loc-phones-inline">${
              phones.length
                ? phones.map((n) => `<a class="loc-btn loc-btn-ghost loc-btn-sm" href="tel:${esc(n)}">${esc(n)}</a>`).join('')
                : '<p class="loc-muted">Aucun téléphone</p>'
            }</div>
            <p class="loc-muted">${
              mails.length
                ? mails.map((m) => esc(m)).join(' · ')
                : 'Aucun mail'
            }</p>
            <p class="loc-muted">${esc(appareilFin)}</p>
            <p class="loc-muted">${esc(motifCommentLabel(current.motif))}</p>
          </div>
          ${detailHeadActions(d)}
        </div>
        <div class="loc-step-card">
          <h4>Message à mettre sur le LGO</h4>
          <div class="loc-lgo-box" id="coLgoText">${esc(lgo) || '<span class="loc-muted">Aucun texte template.</span>'}</div>
          <button type="button" class="loc-btn loc-btn-ghost" id="coCopyLgo" ${lgo ? '' : 'disabled'}>Copier le message</button>
          <label class="loc-check"><input type="checkbox" id="coMailAlready"> Mail déjà envoyé</label>
          <button type="button" class="loc-btn" id="coValidateComment">Commentaire mis sur le compte</button>
        </div>`;
    }

    function renderCallFlowBody(d, p) {
      const phones = phonesOf(d);
      const mails = mailsOf(d);
      const identity = [p.nom || '—', p.prenom || '—', p.date_naissance || '—'].join(' - ');
      const appareilFin = [
        LocationRules.typeLabel(d.appareil_actif?.type_appareil) || '—',
        d.date_fin || '—',
      ].join(' - ');
      const journal = String(d.notes || '').trim();
      const header = `
        <div class="loc-detail-head">
          <div>
            <p class="loc-badge">Phase B — Appel</p>
            <h3>${esc(identity)}</h3>
            <div class="loc-phones-inline">${
              phones.length
                ? phones.map((n) => `<a class="loc-btn loc-btn-ghost loc-btn-sm" href="tel:${esc(n)}">${esc(n)}</a>`).join('')
                : '<p class="loc-muted">Aucun téléphone</p>'
            }</div>
            <p class="loc-muted">${
              mails.length
                ? mails.map((m) => esc(m)).join(' · ')
                : 'Aucun mail'
            }</p>
            <p class="loc-muted">${esc(appareilFin)}</p>
            <p class="loc-muted">${esc(current.commentaire || '—')}</p>
          </div>
          ${detailHeadActions(d)}
        </div>
        ${
          journal
            ? `<div class="loc-journal-box loc-journal-box--suivi">
                <p class="loc-journal-title">Suivi appels déjà effectué</p>
                <div class="loc-journal-body">${esc(journal)}</div>
              </div>`
            : ''
        }`;

      let body = '';

      if (callStep === 'ask_call') {
        body = stepCard(
          'Avez-vous appelé / joint le patient ?',
          [
            btn('Oui — appel fait', 'data-call="yes"'),
            btn('Rappel du patient', 'data-call="recall"', 'loc-btn-ghost'),
            btn('Non — pas d’appel', 'data-call="no"', 'loc-btn-ghost'),
          ].join('')
        );
      } else if (callStep === 'call_yes_comment') {
        const heading = draft.fromPatientRecall
          ? 'Rappel par le patient — commentaire (optionnel)'
          : 'Commentaire d’appel (optionnel)';
        const choices = [
          ['Réponse : je vous ramène l’appareil dans la semaine', 'ramene_semaine'],
          ['Réponse : je vous envoie par mail l’ordonnance', 'ordo_mail'],
          ['Laissé un message sur le répondeur', 'message_repondeur'],
          ['Raccroché', 'raccroche'],
          ['Mauvais numéro', 'mauvais_numero'],
          ['Autres', 'autre_raison'],
        ];
        body = stepCard(
          heading,
          btn('Retour', 'id="coBackAsk"', 'loc-btn-ghost') +
            choices.map(([label, code]) => btn(label, `data-yes-res="${code}"`, 'loc-btn-ghost')).join(''),
          `<label class="loc-field">Note<textarea id="coYesNote" rows="2" placeholder="Ex. a décroché, ton…"></textarea></label>
           <p class="loc-hint">Choisissez le résultat de l'appel</p>`
        );
      } else if (callStep === 'call_yes_autre') {
        const selected = draft.autreStatut || '';
        const autreNote = draft.autreNote || draft.note || '';
        const statutChoices = [
          ['a_appeler', 'À appeler'],
          ['a_rappeler', 'À rappeler'],
          ['termine', 'Terminé'],
          ['PERTE', 'PERTE'],
        ];
        body = stepCard(
          'Autres — ce qui a été dit',
          btn('Retour', 'id="coBackYes"', 'loc-btn-ghost') + btn('Enregistrer', 'id="coSaveAutre"'),
          `<label class="loc-field">Texte de l’échange<textarea id="coAutreNote" rows="3" placeholder="Obligatoire">${esc(autreNote)}</textarea></label>
           <p class="loc-hint">Choisissez le statut de l'appel</p>
           <div class="loc-step-actions" id="coAutreStatut">
             ${statutChoices
               .map(
                 ([code, label]) =>
                   `<button type="button" class="loc-btn loc-btn-ghost${selected === code ? ' loc-toggle-btn is-active' : ''}" data-autre-st="${code}">${esc(label)}</button>`
               )
               .join('')}
           </div>`
        );
      } else if (callStep === 'call_no') {
        body = stepCard(
          'Pourquoi pas d’appel ?',
          [
            btn('Pas de numéro', 'data-no-res="pas_de_numero"', 'loc-btn-ghost'),
            btn('Autre raison', 'data-no-res="autre_raison"', 'loc-btn-ghost'),
            btn('Retour', 'id="coBackAsk2"', 'loc-btn-ghost'),
          ].join('')
        );
      } else if (callStep === 'call_no_comment') {
        body = stepCard(
          'Commentaire',
          btn('Retour', 'id="coBackNo"', 'loc-btn-ghost') + btn('Continuer', 'id="coNoContinue"'),
          `<label class="loc-field">Précisez<textarea id="coNoNote" rows="3" placeholder="Obligatoire"></textarea></label>`
        );
      } else if (callStep === 'ask_mail') {
        body = stepCard(
          'Adresse mail disponible pour envoyer un mail (depuis le logiciel métier) ?',
          [
            btn('Oui — j’envoie un mail', 'data-mail="yes"'),
            btn('À faire', 'data-mail="afaire"', 'loc-btn-ghost'),
            btn('Non', 'data-mail="no"', 'loc-btn-ghost'),
            btn('Retour', 'id="coBackMail"', 'loc-btn-ghost'),
          ].join('')
        );
      }

      return header + body;
    }

    function renderOutcomeFlow(d, p) {
      const phones = phonesOf(d);
      const mails = mailsOf(d);
      const identity = [p.nom || '—', p.prenom || '—', p.date_naissance || '—'].join(' - ');
      const appareilFin = [
        LocationRules.typeLabel(d.appareil_actif?.type_appareil) || '—',
        d.date_fin || '—',
      ].join(' - ');
      const journal = String(d.notes || '').trim();
      const badge = isPerteContact(current)
        ? 'Perte'
        : 'Attente prolongation ou retour appareil';
      const resultatLabel =
        APPEL_RESULTAT_LABELS[current.resultat] || current.resultat || '—';
      return `
        <div class="loc-detail-head">
          <div>
            <p class="loc-badge">${esc(badge)}</p>
            <h3>${esc(identity)}</h3>
            <div class="loc-phones-inline">${
              phones.length
                ? phones.map((n) => `<a class="loc-btn loc-btn-ghost loc-btn-sm" href="tel:${esc(n)}">${esc(n)}</a>`).join('')
                : '<p class="loc-muted">Aucun téléphone</p>'
            }</div>
            <p class="loc-muted">${
              mails.length
                ? mails.map((m) => esc(m)).join(' · ')
                : 'Aucun mail'
            }</p>
            <p class="loc-muted">${esc(appareilFin)}</p>
            <p class="loc-muted">Résultat : ${esc(resultatLabel)}</p>
            <p class="loc-muted">${esc(current.commentaire || '—')}</p>
          </div>
          ${detailHeadActions(d)}
        </div>
        ${
          journal
            ? `<div class="loc-journal-box loc-journal-box--suivi">
                <p class="loc-journal-title">Suivi appels déjà effectué</p>
                <div class="loc-journal-body">${esc(journal)}</div>
              </div>`
            : ''
        }
        <div class="loc-row-actions" style="margin-top:12px; justify-content:flex-end">
          <button type="button" class="loc-btn" id="coARappeler">À rappeler</button>
        </div>`;
    }

    async function recallToAppel(contact) {
      if (!contact) return;
      try {
        showMsg('Enregistrement…');
        await LocationData.upsertContact({
          id: contact.id,
          dossier_id: contact.dossier_id,
          motif: contact.motif,
          commentaire: contact.commentaire || null,
          phase: PHASE_APPEL,
          statut: 'a_contacter',
          resultat: null,
          canal: contact.canal || null,
          contacted_at: contact.contacted_at || null,
          commentaire_fait_at: contact.commentaire_fait_at || null,
          phase_date_fin: contact.dossier?.date_fin || contact.phase_date_fin || null,
        });
        showMsg('Remis en file Appels (à appeler).');
        current = null;
        resetDraft();
        await refresh();
        flowEl.innerHTML = '<p class="loc-muted">Sélectionnez un patient.</p>';
      } catch (e) {
        showMsg(e.message || 'Erreur', true);
      }
    }

    function renderFlow() {
      if (!current) {
        flowEl.innerHTML = '<p class="loc-muted">Sélectionnez un patient.</p>';
        return;
      }
      const d = current.dossier || {};
      const p = d.patient || {};

      if (isAttenteContact(current) || isPerteContact(current)) {
        flowEl.innerHTML = renderOutcomeFlow(d, p);
        bindDetailHeadActions();
        flowEl.querySelector('#coARappeler')?.addEventListener('click', () => recallToAppel(current));
        return;
      }

      const phase = contactPhase(current);

      if (phase === PHASE_COMMENTAIRE) {
        flowEl.innerHTML = renderCommentFlow(d, p);
        bindDetailHeadActions();
        const validate = flowEl.querySelector('#coValidateComment');
        flowEl.querySelector('#coCopyLgo')?.addEventListener('click', async () => {
          const text = current.commentaire || '';
          if (!text) return;
          try {
            await navigator.clipboard.writeText(text);
            showMsg('Message LGO copié.');
          } catch (_) {
            showMsg('Copie impossible', true);
          }
        });
        validate?.addEventListener('click', () => {
          validateCommentaire(!!flowEl.querySelector('#coMailAlready')?.checked);
        });
        return;
      }

      flowEl.innerHTML = renderCallFlowBody(d, p);
      bindDetailHeadActions();

      flowEl.querySelector('[data-call="yes"]')?.addEventListener('click', () => {
        draft.fromPatientRecall = false;
        draft.note = '';
        draft.resultat = null;
        go('call_yes_comment');
      });
      flowEl.querySelector('[data-call="recall"]')?.addEventListener('click', () => {
        draft.fromPatientRecall = true;
        draft.note = '';
        draft.resultat = null;
        go('call_yes_comment');
      });
      flowEl.querySelector('[data-call="no"]')?.addEventListener('click', () => {
        draft.noReason = null;
        draft.note = '';
        go('call_no');
      });
      flowEl.querySelector('#coBackAsk')?.addEventListener('click', () => go('ask_call'));
      flowEl.querySelector('#coBackAsk2')?.addEventListener('click', () => go('ask_call'));
      flowEl.querySelector('#coBackYes')?.addEventListener('click', () => go('call_yes_comment'));
      flowEl.querySelector('#coBackNo')?.addEventListener('click', () => go('call_no'));
      flowEl.querySelector('#coBackMail')?.addEventListener('click', () => {
        go(draft.backAfterMail || 'ask_call');
      });

      flowEl.querySelectorAll('[data-yes-res]').forEach((b) => {
        b.addEventListener('click', () => {
          draft.note = flowEl.querySelector('#coYesNote')?.value.trim() || '';
          draft.resultat = b.dataset.yesRes;
          if (draft.resultat === 'autre_raison') {
            draft.autreNote = draft.note;
            draft.autreStatut = '';
            go('call_yes_autre');
            return;
          }
          handleCallYes(current);
        });
      });

      flowEl.querySelectorAll('[data-autre-st]').forEach((b) => {
        b.addEventListener('click', () => {
          draft.autreNote = flowEl.querySelector('#coAutreNote')?.value.trim() || draft.autreNote;
          draft.autreStatut = b.dataset.autreSt;
          go('call_yes_autre');
        });
      });

      flowEl.querySelector('#coSaveAutre')?.addEventListener('click', () => {
        const note = flowEl.querySelector('#coAutreNote')?.value.trim() || '';
        if (!note) return showMsg('Indiquez ce qui a été dit', true);
        if (!draft.autreStatut) return showMsg('Choisissez un statut', true);
        draft.note = note;
        draft.resultat = 'autre_raison';
        handleCallYes(current);
      });

      flowEl.querySelectorAll('[data-no-res]').forEach((b) => {
        b.addEventListener('click', () => {
          draft.noReason = b.dataset.noRes;
          draft.note = '';
          go('call_no_comment');
        });
      });

      flowEl.querySelector('#coNoContinue')?.addEventListener('click', () => {
        const note = flowEl.querySelector('#coNoNote')?.value.trim() || '';
        if (!note) return showMsg('Commentaire requis', true);
        draft.note = note;
        handleCallNo(current);
      });

      flowEl.querySelector('[data-mail="yes"]')?.addEventListener('click', () => handleMailYes(current));
      flowEl.querySelector('[data-mail="afaire"]')?.addEventListener('click', () => handleMailAFaire(current));
      flowEl.querySelector('[data-mail="no"]')?.addEventListener('click', () => handleNoMail(current));
    }

    wrap.querySelectorAll('[data-file]').forEach((b) => {
      b.addEventListener('click', () => {
        setFile(b.dataset.file);
        current = null;
        resetDraft();
        renderList();
        flowEl.innerHTML = '<p class="loc-muted">Sélectionnez un patient.</p>';
      });
    });

    btnPrev.addEventListener('click', goPrev);
    btnNext.addEventListener('click', goNext);

    wrap.querySelector('#coSync').addEventListener('click', async () => {
      showMsg('Synchronisation…');
      try {
        const res = await LocationData.syncContactQueue(ctx.userId);
        const nReset = (res.reset || []).length;
        showMsg(
          `${res.created.length} ajouté(s)` +
            (nReset ? ` · ${nReset} remis en commentaire` : '') +
            ` · file ouverte ≈ ${res.totalOpen}`
        );
        await refresh();
      } catch (e) {
        showMsg(e.message || 'Sync impossible', true);
      }
    });

    wrap.querySelector('#coPrint').addEventListener('click', () => {
      LocationPrint.printContactList(filteredItems);
    });
    wrap.querySelector('#coSearch').addEventListener('change', () => void onFiltersChange());
    wrap.querySelector('#coStatut').addEventListener('change', () => void onFiltersChange());
    wrap.querySelector('#coType').addEventListener('change', () => void onFiltersChange());
    wrap.querySelector('#coContact').addEventListener('change', () => void onFiltersChange());

    try {
      await LocationData.syncContactQueue(ctx.userId);
    } catch (_) {
      /* sync best-effort au chargement */
    }
    await refresh();
  }

  global.LocationContact = { mount, APPEL_RESULTAT_LABELS, APPEL_STATUT_LABELS };
})(window);
