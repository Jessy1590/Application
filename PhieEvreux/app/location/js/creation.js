/**
 * Module Création — patient → personnel/caution → appareil → ordo.
 */
(function (global) {
  function typeCodes() {
    if (typeof LocationRules?.typeCodes === 'function') {
      const list = LocationRules.typeCodes();
      if (list && list.length) return list;
    }
    const keys = Object.keys(LocationRules?.TYPE_LABELS || {});
    return keys.length ? keys : ['aerosol', 'tire_lait', 'pese_bebe', 'tens', 'fauteuil', 'autre'];
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function field(label, inputHtml, required) {
    return `<label class="loc-field">${label}${required ? ' *' : ''}
      ${inputHtml}
    </label>`;
  }

  function escStatic(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  let helpTipSeq = 0;

  function helpTipHtml(text, ariaLabel) {
    helpTipSeq += 1;
    const id = `loc-help-tip-cre-${helpTipSeq}`;
    return `<span class="loc-help-tip">
      <button type="button" class="loc-help-tip__btn" aria-label="${escStatic(ariaLabel)}" aria-expanded="false" aria-controls="${id}">?</button>
      <span class="loc-help-tip__bubble" role="tooltip" id="${id}">${escStatic(text)}</span>
    </span>`;
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

  function champInputHtml(champ, value) {
    if (champ.data_type === 'attention') return '';
    const code = champ.code;
    const name = `ce_${code}`;
    const val = value == null ? '' : value;
    const opts = LocationRules.parseJson(champ.options, {});
    const choix = Array.isArray(opts.choix) ? opts.choix : [];
    if (champ.data_type === 'oui_non') {
      const checked = val === true || val === 'oui' || val === 'true';
      return `<label class="loc-check"><input type="checkbox" name="${name}"${checked ? ' checked' : ''}> ${escStatic(champ.libelle)}${champ.obligatoire ? ' *' : ''}</label>`;
    }
    if (champ.data_type === 'date') {
      return field(champ.libelle, `<input type="date" name="${name}" value="${escStatic(val)}">`, champ.obligatoire);
    }
    if (champ.data_type === 'nombre') {
      return field(champ.libelle, `<input type="number" name="${name}" value="${escStatic(val)}">`, champ.obligatoire);
    }
    if (champ.data_type === 'liste') {
      return field(
        champ.libelle,
        `<select name="${name}">
          <option value="">—</option>
          ${choix.map((c) => `<option value="${escStatic(c)}"${String(val) === String(c) ? ' selected' : ''}>${escStatic(c)}</option>`).join('')}
        </select>`,
        champ.obligatoire
      );
    }
    return field(champ.libelle, `<input type="text" name="${name}" value="${escStatic(val)}">`, champ.obligatoire);
  }

  function attentionBoxesHtml(champs) {
    const items = (champs || []).filter((c) => c.data_type === 'attention' && c.libelle);
    if (!items.length) return '';
    return `<div class="loc-attention-stack">
      ${items
        .map(
          (c) =>
            `<div class="loc-attention-box" role="note"><strong>Attention</strong><p>${escStatic(c.libelle)}</p></div>`
        )
        .join('')}
    </div>`;
  }

  async function mount(root, ctx) {
    const params = await LocationData.loadParams();
    const prestataires = await LocationData.listPrestataires(true);
    const show = (etape, code) => LocationData.isCreationActif(params, etape, code);
    const req = (etape, code) => LocationData.isCreationRequired(params, etape, code);
    const quiFactureDefaut = params.qui_facture_defaut === 'prestataire' ? 'prestataire' : 'pharmacie';
    const champsDef = await LocationData.listChampsCreation(null, true);

    let step = 0;
    const state = {
      dossier_id: null,
      patient_id: null,
      patient: {
        nom: '',
        prenom: '',
        date_naissance: '',
        adresse: '',
        telephones: [],
        mails: [],
      },
      code_op: '',
      caution: '',
      appareil: {
        type_appareil: 'aerosol',
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
      },
      date_debut: LocationRules.todayISO(),
      date_ordo: LocationRules.todayISO(),
      duree: 10,
      unite: 'semaines',
      notes: '',
    };

    const prefill = ctx.creationPrefill || {};
    if (prefill.source === 'parc' || prefill.source === 'prestataire') {
      state.appareil.source = prefill.source;
    }
    if (prefill.type_appareil && typeCodes().includes(prefill.type_appareil)) {
      state.appareil.type_appareil = prefill.type_appareil;
    }
    if (prefill.numero_pharmacie) {
      state.appareil.numero_pharmacie = String(prefill.numero_pharmacie);
    }
    if (prefill.matricule) {
      state.appareil.matricule = String(prefill.matricule);
    }
    if (prefill.step === 'appareil') {
      step = 2;
    }
    if (state.appareil.source === 'parc') {
      state.appareil.prestataire_id = '';
    }

    root.innerHTML = '';
    const wrap = el(`<div class="loc-module">
      <div class="loc-queue-block" id="creAttenteBlock" hidden>
        <p class="loc-queue-title">Dossiers en attente</p>
        <div class="loc-list" id="creAttenteList"></div>
      </div>
      <div class="loc-steps" id="creSteps"></div>
      <div class="loc-form" id="creForm"></div>
      <div class="loc-form-actions" id="creActions"></div>
      <p class="loc-msg" id="creMsg" hidden></p>
    </div>`);
    root.appendChild(wrap);

    const formEl = wrap.querySelector('#creForm');
    const stepsEl = wrap.querySelector('#creSteps');
    const actionsEl = wrap.querySelector('#creActions');
    const msgEl = wrap.querySelector('#creMsg');
    const attenteBlock = wrap.querySelector('#creAttenteBlock');
    const attenteList = wrap.querySelector('#creAttenteList');

    function showMsg(text, isErr) {
      msgEl.hidden = !text;
      msgEl.textContent = text || '';
      msgEl.classList.toggle('loc-msg-err', !!isErr);
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

    function customFieldsHtml(etapeId) {
      const extra = state.appareil.champs_extra || {};
      return customFieldsForEtape(etapeId)
        .map((f) => {
          if (!show(etapeId, f.code)) return '';
          const val = extra[f.code] == null ? '' : String(extra[f.code]);
          return field(
            f.label,
            `<input name="cd_${escStatic(f.code)}" value="${esc(val)}">`,
            req(etapeId, f.code)
          );
        })
        .join('');
    }

    function collectCustomFields(etapeId) {
      const fields = customFieldsForEtape(etapeId);
      if (!fields.length) return;
      const extra = { ...(state.appareil.champs_extra || {}) };
      for (const f of fields) {
        const elIn = formEl.querySelector(`[name="cd_${f.code}"]`);
        if (!elIn) continue;
        const v = elIn.value.trim();
        extra[f.code] = v === '' ? null : v;
      }
      state.appareil.champs_extra = extra;
    }

    function validateCustomFields(etapeId) {
      for (const f of customFieldsForEtape(etapeId)) {
        if (!req(etapeId, f.code)) continue;
        const v = state.appareil.champs_extra?.[f.code];
        if (v == null || String(v).trim() === '') {
          return showMsg(`${f.label} obligatoire.`, true), false;
        }
      }
      return true;
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

    function renderSteps() {
      const labels = ['Patient', 'Personnel', 'Appareil', 'Location'];
      stepsEl.innerHTML = labels
        .map((l, i) => `<button type="button" class="loc-step${i === step ? ' active' : ''}${i < step ? ' done' : ''}" data-step="${i}">${i + 1}. ${l}</button>`)
        .join('');
      stepsEl.querySelectorAll('[data-step]').forEach((b) => {
        b.addEventListener('click', () => {
          const s = Number(b.dataset.step);
          if (s <= step) {
            if (step === 0) collectPatient();
            if (step === 1) collectPersonnel();
            if (step === 2) collectAppareil();
            if (step === 3) collectOrdo();
            step = s;
            render();
          }
        });
      });
    }

    function collectPatient() {
      // Étapes suivantes : champs absents du DOM — ne pas écraser state.patient
      if (
        !formEl.querySelector('[name=nom]') &&
        !formEl.querySelector('[name=prenom]') &&
        !formEl.querySelector('[name=date_naissance]') &&
        !formEl.querySelector('[name=adresse]') &&
        !formEl.querySelector('#phonesList') &&
        !formEl.querySelector('#mailsList')
      ) {
        collectCustomFields('patient');
        return;
      }
      const nom = formEl.querySelector('[name=nom]')
        ? formEl.querySelector('[name=nom]').value.trim()
        : state.patient.nom;
      const prenom = formEl.querySelector('[name=prenom]')
        ? formEl.querySelector('[name=prenom]').value.trim()
        : state.patient.prenom;
      const date_naissance = formEl.querySelector('[name=date_naissance]')
        ? formEl.querySelector('[name=date_naissance]').value || ''
        : state.patient.date_naissance;
      const adresse = formEl.querySelector('[name=adresse]')
        ? formEl.querySelector('[name=adresse]').value.trim()
        : state.patient.adresse;
      const phonesList = formEl.querySelector('#phonesList');
      const mailsList = formEl.querySelector('#mailsList');
      const telephones = phonesList
        ? LocationFields.collectPhones(phonesList)
        : state.patient.telephones;
      const mails = mailsList
        ? LocationFields.collectMails(mailsList)
        : state.patient.mails;
      state.patient = {
        nom,
        prenom,
        date_naissance: date_naissance || null,
        adresse: adresse || null,
        telephones,
        mails,
      };
      collectCustomFields('patient');
    }

    function collectPersonnel() {
      if (
        !formEl.querySelector('[name=code_op]') &&
        !formEl.querySelector('[name=caution]') &&
        !formEl.querySelector('[name=notes]')
      ) {
        collectCustomFields('personnel');
        return;
      }
      if (formEl.querySelector('[name=code_op]')) {
        state.code_op = formEl.querySelector('[name=code_op]').value.trim() || '';
      }
      if (formEl.querySelector('[name=caution]')) {
        state.caution = formEl.querySelector('[name=caution]').value || '';
      }
      if (formEl.querySelector('[name=notes]')) {
        state.notes = formEl.querySelector('[name=notes]').value.trim() || '';
      }
      collectCustomFields('personnel');
    }

    function collectChampsExtra(type) {
      const extra = { ...(state.appareil.champs_extra || {}) };
      for (const champ of champsForType(type)) {
        if (champ.data_type === 'attention') continue;
        const elIn = formEl.querySelector(`[name="ce_${champ.code}"]`);
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

    function collectAppareil() {
      if (!formEl.querySelector('[name=type_appareil]')) return;
      const type = formEl.querySelector('[name=type_appareil]')?.value || state.appareil.type_appareil || 'aerosol';
      const sourceEl = formEl.querySelector('[name=source]');
      const source = sourceEl ? sourceEl.value || 'parc' : state.appareil.source || 'parc';
      const next = {
        type_appareil: type,
        type_libelle: formEl.querySelector('[name=type_libelle]')
          ? formEl.querySelector('[name=type_libelle]').value.trim() || ''
          : state.appareil.type_libelle || '',
        source,
        prestataire_id: formEl.querySelector('[name=prestataire_id]')
          ? formEl.querySelector('[name=prestataire_id]').value || null
          : state.appareil.prestataire_id,
        matricule: formEl.querySelector('[name=matricule]')
          ? formEl.querySelector('[name=matricule]').value.trim() || ''
          : state.appareil.matricule || '',
        numero_pharmacie: formEl.querySelector('[name=numero_pharmacie]')
          ? formEl.querySelector('[name=numero_pharmacie]').value.trim() || ''
          : state.appareil.numero_pharmacie || '',
        mode_obtention: formEl.querySelector('[name=mode_obtention]')
          ? formEl.querySelector('[name=mode_obtention]').value || null
          : state.appareil.mode_obtention,
        livraison: formEl.querySelector('[name=livraison]')
          ? formEl.querySelector('[name=livraison]').value || null
          : state.appareil.livraison,
        desinfection: formEl.querySelector('[name=desinfection]')
          ? !!formEl.querySelector('[name=desinfection]').checked
          : !!state.appareil.desinfection,
        encart_texte: formEl.querySelector('[name=encart_texte]')
          ? formEl.querySelector('[name=encart_texte]').value
          : state.appareil.encart_texte,
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
      state.appareil = next;
      collectCustomFields('appareil');
    }

    function collectOrdo() {
      if (formEl.querySelector('[name=date_debut]')) {
        state.date_debut = formEl.querySelector('[name=date_debut]').value || null;
      }
      if (formEl.querySelector('[name=date_ordo]')) {
        state.date_ordo = formEl.querySelector('[name=date_ordo]').value || null;
      }
      if (formEl.querySelector('[name=duree]')) {
        state.duree = Number(formEl.querySelector('[name=duree]').value || 0);
      }
      if (formEl.querySelector('[name=unite]')) {
        state.unite = formEl.querySelector('[name=unite]').value || 'semaines';
      }
      collectCustomFields('location');
    }

    function validateStep() {
      showMsg('');
      if (step === 0) {
        collectPatient();
        if (req('patient', 'patient_nom') && !state.patient.nom) return showMsg('Nom obligatoire.', true), false;
        if (req('patient', 'patient_prenom') && !state.patient.prenom) return showMsg('Prénom obligatoire.', true), false;
        if (req('patient', 'patient_date_naissance') && !state.patient.date_naissance) {
          return showMsg('Date de naissance obligatoire.', true), false;
        }
        if (req('patient', 'patient_adresse') && !state.patient.adresse) return showMsg('Adresse obligatoire.', true), false;
        if (req('patient', 'patient_telephone') && !state.patient.telephones.length) {
          return showMsg('Téléphone obligatoire.', true), false;
        }
        if (!validateCustomFields('patient')) return false;
      }
      if (step === 1) {
        collectPersonnel();
        if (req('personnel', 'code_op') && !state.code_op) return showMsg('Code OP obligatoire.', true), false;
        if (req('personnel', 'caution') && !state.caution) return showMsg('Caution obligatoire.', true), false;
        if (!validateCustomFields('personnel')) return false;
      }
      if (step === 2) {
        collectAppareil();
        if (req('appareil', 'type_appareil') && !state.appareil.type_appareil) {
          return showMsg('Type d’appareil obligatoire.', true), false;
        }
        if (
          state.appareil.type_appareil === 'autre' &&
          show('appareil', 'type_libelle') &&
          req('appareil', 'type_libelle') &&
          !state.appareil.type_libelle
        ) {
          return showMsg('Précisez le type d’appareil.', true), false;
        }
        if (state.appareil.source === 'prestataire') {
          if (req('appareil', 'prestataire_id') && !state.appareil.prestataire_id) {
            return showMsg('Prestataire obligatoire.', true), false;
          }
          if (req('appareil', 'mode_obtention') && !state.appareil.mode_obtention) {
            return showMsg('Mode d’obtention obligatoire.', true), false;
          }
          if (req('appareil', 'livraison') && !state.appareil.livraison) {
            return showMsg('Livraison obligatoire.', true), false;
          }
        }
        if (state.appareil.source === 'parc') {
          if (req('appareil', 'numero_pharmacie') && !state.appareil.numero_pharmacie) {
            return showMsg('N° pharmacie obligatoire pour un appareil du parc.', true), false;
          }
        }
        for (const champ of champsForType(state.appareil.type_appareil)) {
          if (!champ.obligatoire) continue;
          const v = state.appareil.champs_extra?.[champ.code];
          if (champ.data_type === 'oui_non') continue;
          if (champ.data_type === 'attention') continue;
          if (v == null || v === '') {
            return showMsg(`Champ obligatoire : ${champ.libelle}.`, true), false;
          }
        }
        if (!validateCustomFields('appareil')) return false;
      }
      if (step === 3) {
        collectOrdo();
        if (req('location', 'date_debut') && !state.date_debut) return showMsg('Date de début obligatoire.', true), false;
        if (req('location', 'date_ordo') && !state.date_ordo) return showMsg('Date d’ordonnance obligatoire.', true), false;
        if (show('location', 'duree') && req('location', 'duree') && (!state.duree || state.duree < 1)) {
          return showMsg('Durée invalide.', true), false;
        }
        if (!show('location', 'duree') && (!state.duree || state.duree < 1)) {
          state.duree = 10;
        }
        if (!validateCustomFields('location')) return false;
      }
      return true;
    }

    function renderPatient() {
      formEl.innerHTML = `
        <div class="loc-search-row">
          <input type="search" id="crePatientSearch" placeholder="Rechercher un patient existant (nom / prénom)">
          <div class="loc-suggest" id="creSuggest" hidden></div>
        </div>
        ${show('patient', 'patient_nom') ? field('Nom', `<input name="nom" value="${esc(state.patient.nom)}" autocomplete="family-name">`, req('patient', 'patient_nom')) : ''}
        ${show('patient', 'patient_prenom') ? field('Prénom', `<input name="prenom" value="${esc(state.patient.prenom)}" autocomplete="given-name">`, req('patient', 'patient_prenom')) : ''}
        ${show('patient', 'patient_date_naissance') ? field('Date de naissance', `<input name="date_naissance" type="date" value="${esc(state.patient.date_naissance || '')}">`, req('patient', 'patient_date_naissance')) : ''}
        ${show('patient', 'patient_adresse') ? field('Adresse', `<textarea name="adresse" rows="2">${esc(state.patient.adresse || '')}</textarea>`, req('patient', 'patient_adresse')) : ''}
        ${show('patient', 'patient_telephone') ? LocationFields.blockHtml('phones', `Téléphones${req('patient', 'patient_telephone') ? ' *' : ''}`) : ''}
        ${show('patient', 'patient_mails') ? LocationFields.blockHtml('mails', 'Mails') : ''}
        ${customFieldsHtml('patient')}
      `;
      if (show('patient', 'patient_telephone')) {
        LocationFields.mountPhones(
          formEl.querySelector('#phonesList'),
          formEl.querySelector('#addPhoneBtn'),
          state.patient.telephones
        );
      }
      if (show('patient', 'patient_mails')) {
        LocationFields.mountMails(
          formEl.querySelector('#mailsList'),
          formEl.querySelector('#addMailBtn'),
          state.patient.mails
        );
      }
      const search = formEl.querySelector('#crePatientSearch');
      const suggest = formEl.querySelector('#creSuggest');
      let timer;
      search.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          const q = search.value.trim();
          if (q.length < 2) { suggest.hidden = true; return; }
          try {
            const rows = await LocationData.searchPatients(q);
            if (!rows.length) { suggest.hidden = true; return; }
            suggest.hidden = false;
            suggest.innerHTML = rows.map((r) =>
              `<button type="button" data-id="${r.id}">${esc(r.nom)} ${esc(r.prenom)}${r.date_naissance ? ' · ' + r.date_naissance : ''}</button>`
            ).join('');
            suggest.querySelectorAll('button').forEach((b) => {
              b.addEventListener('click', () => {
                const row = rows.find((x) => x.id === b.dataset.id);
                if (!row) return;
                state.patient_id = row.id;
                state.patient = {
                  nom: row.nom || '',
                  prenom: row.prenom || '',
                  date_naissance: row.date_naissance || '',
                  adresse: row.adresse || '',
                  telephones: row.telephones || [],
                  mails: row.mails || [],
                };
                suggest.hidden = true;
                render();
              });
            });
          } catch (e) {
            showMsg(e.message || 'Recherche impossible', true);
          }
        }, 250);
      });
    }

    function renderPersonnel() {
      formEl.innerHTML = `
        ${show('personnel', 'code_op') ? field('Code OP', `<input name="code_op" value="${esc(state.code_op)}">`, req('personnel', 'code_op')) : ''}
        ${show('personnel', 'caution') ? field('Caution', `<select name="caution">
          <option value=""${state.caution === '' || state.caution == null ? ' selected' : ''}></option>
          <option value="cheque_150"${state.caution === 'cheque_150' ? ' selected' : ''}>Chèque 150 €</option>
          <option value="especes"${state.caution === 'especes' ? ' selected' : ''}>Espèces</option>
        </select>`, req('personnel', 'caution')) : ''}
        ${show('personnel', 'notes') ? field('Notes', `<textarea name="notes" rows="2">${esc(state.notes)}</textarea>`, req('personnel', 'notes')) : ''}
        ${customFieldsHtml('personnel')}
      `;
    }

    function renderAppareil() {
      const autre = state.appareil.type_appareil === 'autre';
      const prest = state.appareil.source === 'prestataire';
      const parc = state.appareil.source === 'parc';
      const extra = state.appareil.champs_extra || {};
      const typeChamps = champsForType(state.appareil.type_appareil);
      const dynamiques = typeChamps
        .filter((c) => c.data_type !== 'attention')
        .map((c) => champInputHtml(c, extra[c.code]))
        .join('');
      const attentions = attentionBoxesHtml(typeChamps);

      formEl.innerHTML = `
        ${attentions}
        ${show('appareil', 'type_appareil') ? field('Type d’appareil', `<select name="type_appareil">
          ${typeCodes().map((t) => `<option value="${t}"${state.appareil.type_appareil === t ? ' selected' : ''}>${LocationRules.typeLabel(t)}</option>`).join('')}
        </select>`, req('appareil', 'type_appareil')) : `<input type="hidden" name="type_appareil" value="${esc(state.appareil.type_appareil)}">`}
        ${autre && show('appareil', 'type_libelle') ? field('Libellé (autre)', `<input name="type_libelle" value="${esc(state.appareil.type_libelle || '')}">`, req('appareil', 'type_libelle')) : ''}
        ${show('appareil', 'source') ? field('Source', `<select name="source">
          <option value="parc"${parc ? ' selected' : ''}>Parc pharmacie</option>
          <option value="prestataire"${prest ? ' selected' : ''}>Prestataire</option>
        </select>`, req('appareil', 'source')) : `<input type="hidden" name="source" value="${esc(state.appareil.source)}">`}
        ${prest ? `
          ${show('appareil', 'prestataire_id') ? field('Prestataire', `<select name="prestataire_id">
            <option value="">—</option>
            ${prestataires.map((p) => `<option value="${p.id}"${state.appareil.prestataire_id === p.id ? ' selected' : ''}>${esc(p.nom)}</option>`).join('')}
          </select>`, req('appareil', 'prestataire_id')) : ''}
          ${show('appareil', 'matricule') ? `<div class="loc-field">
            <span class="loc-field-label-row">
              <label for="creMatricule">Matricule${req('appareil', 'matricule') ? ' *' : ''}</label>
              ${helpTipHtml('Si le matricule est connu.', 'Aide : matricule')}
            </span>
            <input id="creMatricule" name="matricule" value="${esc(state.appareil.matricule || '')}">
          </div>` : ''}
          ${show('appareil', 'mode_obtention') ? field('Obtention', `<select name="mode_obtention">
            <option value="depot"${state.appareil.mode_obtention === 'depot' ? ' selected' : ''}>Dépôt</option>
            <option value="appel"${state.appareil.mode_obtention === 'appel' ? ' selected' : ''}>Appel pour l’obtenir</option>
          </select>`, req('appareil', 'mode_obtention')) : ''}
          ${show('appareil', 'livraison') ? field('Livraison', `<select name="livraison">
            <option value="pharmacie"${state.appareil.livraison === 'pharmacie' ? ' selected' : ''}>À la pharmacie</option>
            <option value="patient"${state.appareil.livraison === 'patient' ? ' selected' : ''}>Chez le patient</option>
          </select>`, req('appareil', 'livraison')) : ''}
        ` : ''}
        ${parc ? `
          ${show('appareil', 'numero_pharmacie') ? field('N° appareil pharmacie', `<input name="numero_pharmacie" value="${esc(state.appareil.numero_pharmacie || '')}">`, req('appareil', 'numero_pharmacie')) : ''}
          ${show('appareil', 'desinfection') ? `<label class="loc-check"><input type="checkbox" name="desinfection"${state.appareil.desinfection ? ' checked' : ''}> Désinfection faite</label>` : ''}
        ` : ''}
        ${dynamiques ? `<div class="loc-champs-extra">${dynamiques}</div>` : ''}
        ${show('appareil', 'encart_texte') ? field('Commentaire', `<textarea name="encart_texte" rows="3">${esc(state.appareil.encart_texte || '')}</textarea>`, req('appareil', 'encart_texte')) : ''}
        ${customFieldsHtml('appareil')}
      `;

      bindHelpTips(formEl);

      formEl.querySelector('[name=type_appareil]')?.addEventListener('change', (e) => {
        collectAppareil();
        const t = e.target.value;
        const prevExtra = state.appareil.champs_extra || {};
        state.appareil.type_appareil = t;
        state.appareil.champs_extra = preserveCreationCustomExtra(prevExtra);
        if (t === 'tire_lait') {
          state.duree = 10;
          state.unite = 'semaines';
        }
        render();
      });
      formEl.querySelector('[name=source]')?.addEventListener('change', () => {
        collectAppareil();
        render();
      });
    }

    function renderOrdo() {
      const fin = LocationRules.addDuration(state.date_debut || state.date_ordo, state.duree, state.unite);
      formEl.innerHTML = `
        ${show('location', 'date_debut') ? field('Date de début', `<input type="date" name="date_debut" value="${esc(state.date_debut || '')}">`, req('location', 'date_debut')) : `<input type="hidden" name="date_debut" value="${esc(state.date_debut || '')}">`}
        ${show('location', 'date_ordo') ? field('Date d’ordonnance', `<input type="date" name="date_ordo" value="${esc(state.date_ordo || '')}">`, req('location', 'date_ordo')) : `<input type="hidden" name="date_ordo" value="${esc(state.date_ordo || '')}">`}
        ${show('location', 'duree') ? field('Durée', `<input type="number" name="duree" min="1" value="${state.duree}">`, req('location', 'duree')) : `<input type="hidden" name="duree" value="${state.duree}">`}
        ${show('location', 'unite') ? field('Unité', `<select name="unite">
          <option value="jours"${state.unite === 'jours' ? ' selected' : ''}>Jours</option>
          <option value="semaines"${state.unite === 'semaines' ? ' selected' : ''}>Semaines</option>
          <option value="mois"${state.unite === 'mois' ? ' selected' : ''}>Mois</option>
        </select>`, req('location', 'unite')) : `<input type="hidden" name="unite" value="${esc(state.unite)}">`}
        ${customFieldsHtml('location')}
        <p class="loc-hint">Fin calculée : <strong>${fin || '—'}</strong></p>
      `;
      const recalc = () => {
        collectOrdo();
        const f = LocationRules.addDuration(state.date_debut || state.date_ordo, state.duree, state.unite);
        formEl.querySelector('.loc-hint strong').textContent = f || '—';
      };
      formEl.querySelectorAll('input,select').forEach((i) => i.addEventListener('change', recalc));
      formEl.querySelectorAll('input').forEach((i) => i.addEventListener('input', recalc));
    }

    function renderActions() {
      actionsEl.innerHTML = `
        ${step > 0 ? '<button type="button" class="loc-btn loc-btn-ghost" id="crePrev">Précédent</button>' : '<span></span>'}
        <button type="button" class="loc-btn loc-btn-ghost" id="creHold">Mise en attente</button>
        ${step < 3
          ? '<button type="button" class="loc-btn" id="creNext">Suivant</button>'
          : '<button type="button" class="loc-btn" id="creSave">Créer la fiche</button>'}
      `;
      actionsEl.querySelector('#crePrev')?.addEventListener('click', () => {
        if (step === 0) collectPatient();
        if (step === 1) collectPersonnel();
        if (step === 2) collectAppareil();
        if (step === 3) collectOrdo();
        step -= 1;
        render();
      });
      actionsEl.querySelector('#creNext')?.addEventListener('click', () => {
        if (!validateStep()) return;
        step += 1;
        render();
      });
      actionsEl.querySelector('#creHold')?.addEventListener('click', saveEnAttente);
      actionsEl.querySelector('#creSave')?.addEventListener('click', save);
    }

    function buildPayload() {
      return {
        patient_id: state.patient_id,
        patient: state.patient,
        code_op: state.code_op,
        caution: state.caution || null,
        qui_facture: quiFactureDefaut,
        notes: state.notes,
        appareil: {
          ...state.appareil,
          facturation_prestataire: false,
        },
        date_debut: state.date_debut,
        date_ordo: state.date_ordo,
        duree: state.duree,
        unite: state.unite,
      };
    }

    function collectCurrentStep() {
      if (step === 0) collectPatient();
      else if (step === 1) collectPersonnel();
      else if (step === 2) collectAppareil();
      else collectOrdo();
    }

    function validateEnAttente() {
      collectCurrentStep();
      showMsg('');
      if (!state.patient.nom || !state.patient.prenom) {
        return showMsg('Nom et prénom obligatoires pour la mise en attente.', true), false;
      }
      return true;
    }

    function formatErr(e) {
      if (!e) return 'Erreur';
      const parts = [e.message, e.details, e.hint].filter(Boolean);
      return parts.length ? parts.join(' — ') : String(e);
    }

    async function persistDossier(statut) {
      const payload = buildPayload();
      const opts = { statut: statut === 'en_attente' ? 'en_attente' : 'actif' };
      if (state.dossier_id) {
        return LocationData.updateDossierComplet(state.dossier_id, payload, ctx.userId, opts);
      }
      return LocationData.createDossierComplet(payload, ctx.userId, opts);
    }

    async function saveEnAttente() {
      if (!validateEnAttente()) return;
      const btn = actionsEl.querySelector('#creHold');
      if (btn) btn.disabled = true;
      showMsg('Mise en attente…');
      try {
        const dossier = await persistDossier('en_attente');
        state.dossier_id = dossier.id;
        state.patient_id = dossier.patient_id || state.patient_id;
        showMsg('Dossier mis en attente.');
        await refreshAttenteList();
        resetForm();
      } catch (e) {
        if (e.patient_id && !state.patient_id) state.patient_id = e.patient_id;
        if (e.dossier_id && !state.dossier_id) state.dossier_id = e.dossier_id;
        showMsg(formatErr(e) || 'Erreur à la mise en attente', true);
      } finally {
        if (btn) btn.disabled = false;
      }
    }

    async function save() {
      collectCurrentStep();
      const prev = step;
      for (let s = 0; s < 4; s += 1) {
        step = s;
        if (!validateStep()) {
          render();
          return;
        }
      }
      step = prev;
      const btn = actionsEl.querySelector('#creSave');
      if (btn) btn.disabled = true;
      showMsg('Enregistrement…');
      try {
        const dossier = await persistDossier('actif');
        showMsg('Fiche créée.');
        await refreshAttenteList();
        afterCreate(dossier);
      } catch (e) {
        if (e.patient_id && !state.patient_id) state.patient_id = e.patient_id;
        if (e.dossier_id && !state.dossier_id) state.dossier_id = e.dossier_id;
        showMsg(formatErr(e) || 'Erreur à la création', true);
        if (btn) btn.disabled = false;
      }
    }

    function applyDossierToState(d) {
      const p = d.patient || {};
      const a = d.appareil_actif || {};
      const prolongs = (d.prolongations || []).slice().sort((x, y) =>
        String(x.created_at || '').localeCompare(String(y.created_at || ''))
      );
      const init =
        prolongs.find((pr) => pr.notes === 'Location initiale') || prolongs[0] || null;
      state.dossier_id = d.id;
      state.patient_id = d.patient_id || p.id || null;
      state.patient = {
        nom: p.nom || '',
        prenom: p.prenom || '',
        date_naissance: p.date_naissance || '',
        adresse: p.adresse || '',
        telephones: Array.isArray(p.telephones) ? p.telephones : [],
        mails: Array.isArray(p.mails) ? p.mails : [],
      };
      state.code_op = d.code_op || '';
      state.caution = d.caution || '';
      state.notes = d.notes || '';
      state.appareil = {
        type_appareil: a.type_appareil || 'aerosol',
        type_libelle: a.type_libelle || '',
        source: a.source || 'parc',
        prestataire_id: a.prestataire_id || '',
        matricule: a.matricule || '',
        numero_pharmacie: a.numero_pharmacie || '',
        mode_obtention: a.mode_obtention || 'depot',
        livraison: a.livraison || 'pharmacie',
        desinfection: !!a.desinfection,
        encart_texte: a.encart_texte || '',
        champs_extra:
          a.champs_extra && typeof a.champs_extra === 'object' ? { ...a.champs_extra } : {},
      };
      state.date_debut = d.date_debut || a.date_debut || LocationRules.todayISO();
      state.date_ordo = init?.date_ordo || LocationRules.todayISO();
      state.duree = Number(init?.duree) > 0 ? Number(init.duree) : 10;
      state.unite = init?.unite || 'semaines';
      step = 0;
    }

    function canDeleteAttente() {
      return typeof ctx.can === 'function'
        ? ctx.can('suppression_dossier')
        : !!(ctx.isAdmin || ctx.isGestionnaire);
    }

    async function deleteAttenteDossier(d) {
      if (!canDeleteAttente()) {
        showMsg('Suppression non autorisée pour votre rôle.', true);
        return;
      }
      const p = d.patient || {};
      const label = `${p.nom || ''} ${p.prenom || ''}`.trim() || 'ce dossier';
      if (!window.confirm(`Supprimer définitivement ${label} ?`)) return;
      try {
        await LocationData.deleteDossier(d.id);
        if (state.dossier_id === d.id) resetForm();
        await refreshAttenteList();
        showMsg('Dossier supprimé.');
      } catch (e) {
        showMsg(e.message || 'Erreur suppression', true);
      }
    }

    async function refreshAttenteList() {
      try {
        const rows = await LocationData.listDossiers({ statut: 'en_attente' });
        if (!rows.length) {
          attenteBlock.hidden = true;
          attenteList.innerHTML = '';
          return;
        }
        attenteBlock.hidden = false;
        const showDelete = canDeleteAttente();
        attenteList.innerHTML = rows
          .map((d) => {
            const p = d.patient || {};
            const type = d.appareil_actif
              ? LocationRules.typeLabel(d.appareil_actif.type_appareil)
              : '—';
            const when = d.updated_at || d.created_at || '';
            const whenLabel = when ? String(when).slice(0, 10) : '';
            const delBtn = showDelete
              ? `<button type="button" class="loc-icon-btn" data-delete-attente="${esc(d.id)}" title="Supprimer" aria-label="Supprimer">🗑</button>`
              : '';
            return `<div class="loc-list-item loc-attente-row">
              <button type="button" class="loc-attente-resume" data-id="${esc(d.id)}">
                <strong>${esc(p.nom || '')} ${esc(p.prenom || '')}</strong>
                <span>${esc(type)}${whenLabel ? ' · ' + esc(whenLabel) : ''}</span>
                <span>Reprendre</span>
              </button>
              ${delBtn}
            </div>`;
          })
          .join('');
        attenteList.querySelectorAll('[data-id]').forEach((b) => {
          b.addEventListener('click', async () => {
            try {
              const dossier = await LocationData.getDossier(b.dataset.id);
              if (!dossier || dossier.statut !== 'en_attente') {
                showMsg('Dossier indisponible.', true);
                await refreshAttenteList();
                return;
              }
              applyDossierToState(dossier);
              showMsg('');
              render();
            } catch (e) {
              showMsg(e.message || 'Reprise impossible', true);
            }
          });
        });
        attenteList.querySelectorAll('[data-delete-attente]').forEach((b) => {
          b.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const d = rows.find((r) => r.id === b.dataset.deleteAttente);
            if (d) void deleteAttenteDossier(d);
          });
        });
      } catch (e) {
        attenteBlock.hidden = true;
        attenteList.innerHTML = '';
        showMsg(formatErr(e) || 'Impossible de charger les dossiers en attente', true);
      }
    }

    function afterCreate(dossier) {
      const modal = el(`<div class="loc-modal" role="dialog" aria-modal="true" aria-labelledby="creDoneTitle">
        <div class="loc-modal-backdrop" data-close></div>
        <div class="loc-modal-panel">
          <h3 id="creDoneTitle">Création terminée</h3>
          <p>Le dossier a été créé. Vous pouvez imprimer la fiche de suivi, l’ouvrir, ou créer un nouveau dossier.</p>
          <div class="loc-modal-actions">
            <button type="button" class="loc-btn" data-act="print">Imprimer la fiche de suivi</button>
            <button type="button" class="loc-btn loc-btn-ghost" data-act="suivi">Aller sur la fiche de suivi</button>
            <button type="button" class="loc-btn loc-btn-ghost" data-act="new">Créer un nouveau dossier</button>
          </div>
        </div>
      </div>`);
      document.body.appendChild(modal);
      const close = () => modal.remove();
      const nouveau = () => {
        close();
        resetForm();
      };
      modal.querySelector('[data-close]').addEventListener('click', nouveau);
      modal.querySelector('[data-act=new]').addEventListener('click', nouveau);
      modal.querySelector('[data-act=suivi]').addEventListener('click', () => {
        close();
        ctx.openSuivi?.(dossier.id);
      });
      modal.querySelector('[data-act=print]').addEventListener('click', () => {
        void LocationPrint.printFiche(dossier);
      });
    }

    function resetForm() {
      state.dossier_id = null;
      state.patient_id = null;
      state.patient = { nom: '', prenom: '', date_naissance: '', adresse: '', telephones: [], mails: [] };
      state.code_op = '';
      state.caution = '';
      state.notes = '';
      state.appareil = {
        type_appareil: 'aerosol',
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
      state.date_debut = LocationRules.todayISO();
      state.date_ordo = LocationRules.todayISO();
      state.duree = 10;
      state.unite = 'semaines';
      step = 0;
      render();
    }

    function esc(s) {
      return escStatic(s);
    }

    function render() {
      renderSteps();
      if (step === 0) renderPatient();
      else if (step === 1) renderPersonnel();
      else if (step === 2) renderAppareil();
      else renderOrdo();
      renderActions();
    }

    void refreshAttenteList();
    render();
  }

  global.LocationCreation = { mount };
})(window);
