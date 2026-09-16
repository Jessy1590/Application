/**
 * Module Création — patient → personnel/caution → appareil → ordo.
 */
(function (global) {
  const TYPES = ['aerosol', 'tire_lait', 'pese_bebe', 'tens', 'fauteuil', 'autre'];

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

  function champInputHtml(champ, value) {
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

  async function mount(root, ctx) {
    const params = await LocationData.loadParams();
    const rules = await LocationData.loadRules();
    const prestataires = await LocationData.listPrestataires(true);
    const req = (k) => LocationData.isRequired(params, k);
    const quiFactureDefaut = params.qui_facture_defaut === 'prestataire' ? 'prestataire' : 'pharmacie';
    const champsDef = await LocationData.listChampsCreation(null, true);

    let step = 0;
    const state = {
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
        encart_texte: LocationRules.encartDefaut('aerosol'),
        champs_extra: {},
      },
      date_debut: LocationRules.todayISO(),
      date_ordo: LocationRules.todayISO(),
      duree: 10,
      unite: 'semaines',
      notes: '',
    };

    root.innerHTML = '';
    const wrap = el(`<div class="loc-module">
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
      if (!formEl.querySelector('[name=nom]')) return;
      const nom = formEl.querySelector('[name=nom]')?.value.trim() || '';
      const prenom = formEl.querySelector('[name=prenom]')?.value.trim() || '';
      const date_naissance = formEl.querySelector('[name=date_naissance]')?.value || '';
      const adresse = formEl.querySelector('[name=adresse]')?.value.trim() || '';
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
    }

    function collectPersonnel() {
      // Étapes suivantes : champs absents du DOM — ne pas écraser code_op / caution / notes
      if (!formEl.querySelector('[name=code_op]')) return;
      state.code_op = formEl.querySelector('[name=code_op]')?.value.trim() || '';
      const caution = formEl.querySelector('[name=caution]')?.value;
      state.caution = caution || '';
      state.notes = formEl.querySelector('[name=notes]')?.value.trim() || '';
    }

    function collectChampsExtra(type) {
      const extra = { ...(state.appareil.champs_extra || {}) };
      for (const champ of champsForType(type)) {
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
      const type = formEl.querySelector('[name=type_appareil]')?.value || 'aerosol';
      const prevType = state.appareil.type_appareil;
      const source = formEl.querySelector('[name=source]')?.value || 'parc';
      const next = {
        type_appareil: type,
        type_libelle: formEl.querySelector('[name=type_libelle]')?.value.trim() || '',
        source,
        prestataire_id: formEl.querySelector('[name=prestataire_id]')?.value || null,
        matricule: formEl.querySelector('[name=matricule]')?.value.trim() || '',
        numero_pharmacie: formEl.querySelector('[name=numero_pharmacie]')?.value.trim() || '',
        mode_obtention: formEl.querySelector('[name=mode_obtention]')?.value || null,
        livraison: formEl.querySelector('[name=livraison]')?.value || null,
        desinfection: !!formEl.querySelector('[name=desinfection]')?.checked,
        encart_texte: formEl.querySelector('[name=encart_texte]')?.value ?? state.appareil.encart_texte,
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
      if (type !== prevType && !formEl.querySelector('[name=encart_texte]')?.dataset.touched) {
        state.appareil.encart_texte = LocationRules.encartDefaut(type);
      }
    }

    function collectOrdo() {
      state.date_debut = formEl.querySelector('[name=date_debut]')?.value || null;
      state.date_ordo = formEl.querySelector('[name=date_ordo]')?.value || null;
      state.duree = Number(formEl.querySelector('[name=duree]')?.value || 0);
      state.unite = formEl.querySelector('[name=unite]')?.value || 'semaines';
    }

    function validateStep() {
      showMsg('');
      if (step === 0) {
        collectPatient();
        if (req('patient_nom') && !state.patient.nom) return showMsg('Nom obligatoire.', true), false;
        if (req('patient_prenom') && !state.patient.prenom) return showMsg('Prénom obligatoire.', true), false;
        if (req('patient_date_naissance') && !state.patient.date_naissance) return showMsg('Date de naissance obligatoire.', true), false;
        if (req('patient_adresse') && !state.patient.adresse) return showMsg('Adresse obligatoire.', true), false;
        if (req('patient_telephone') && !state.patient.telephones.length) return showMsg('Téléphone obligatoire.', true), false;
      }
      if (step === 1) {
        collectPersonnel();
        if (req('code_op') && !state.code_op) return showMsg('Code OP obligatoire.', true), false;
        if (req('caution') && !state.caution) return showMsg('Caution obligatoire.', true), false;
      }
      if (step === 2) {
        collectAppareil();
        if (req('type_appareil') && !state.appareil.type_appareil) return showMsg('Type d’appareil obligatoire.', true), false;
        if (state.appareil.type_appareil === 'autre' && !state.appareil.type_libelle) {
          return showMsg('Précisez le type d’appareil.', true), false;
        }
        if (state.appareil.source === 'prestataire') {
          if (!state.appareil.prestataire_id) return showMsg('Prestataire obligatoire.', true), false;
          if (!state.appareil.mode_obtention) return showMsg('Mode d’obtention obligatoire.', true), false;
          if (!state.appareil.livraison) return showMsg('Livraison obligatoire.', true), false;
        }
        if (state.appareil.source === 'parc') {
          if (!state.appareil.numero_pharmacie) return showMsg('N° pharmacie obligatoire pour un appareil du parc.', true), false;
        }
        for (const champ of champsForType(state.appareil.type_appareil)) {
          if (!champ.obligatoire) continue;
          const v = state.appareil.champs_extra?.[champ.code];
          if (champ.data_type === 'oui_non') continue;
          if (v == null || v === '') {
            return showMsg(`Champ obligatoire : ${champ.libelle}.`, true), false;
          }
        }
      }
      if (step === 3) {
        collectOrdo();
        if (req('date_debut') && !state.date_debut) return showMsg('Date de début obligatoire.', true), false;
        if (req('date_ordo') && !state.date_ordo) return showMsg('Date d’ordonnance obligatoire.', true), false;
        if (!state.duree || state.duree < 1) return showMsg('Durée invalide.', true), false;
      }
      return true;
    }

    function renderPatient() {
      formEl.innerHTML = `
        <div class="loc-search-row">
          <input type="search" id="crePatientSearch" placeholder="Rechercher un patient existant (nom / prénom)">
          <div class="loc-suggest" id="creSuggest" hidden></div>
        </div>
        ${field('Nom', `<input name="nom" value="${esc(state.patient.nom)}" autocomplete="family-name">`, req('patient_nom'))}
        ${field('Prénom', `<input name="prenom" value="${esc(state.patient.prenom)}" autocomplete="given-name">`, req('patient_prenom'))}
        ${field('Date de naissance', `<input name="date_naissance" type="date" value="${esc(state.patient.date_naissance || '')}">`, req('patient_date_naissance'))}
        ${field('Adresse', `<textarea name="adresse" rows="2">${esc(state.patient.adresse || '')}</textarea>`, req('patient_adresse'))}
        ${LocationFields.blockHtml('phones', `Téléphones${req('patient_telephone') ? ' *' : ''}`)}
        ${LocationFields.blockHtml('mails', 'Mails')}
      `;
      LocationFields.mountPhones(
        formEl.querySelector('#phonesList'),
        formEl.querySelector('#addPhoneBtn'),
        state.patient.telephones
      );
      LocationFields.mountMails(
        formEl.querySelector('#mailsList'),
        formEl.querySelector('#addMailBtn'),
        state.patient.mails
      );
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
        ${field('Code OP', `<input name="code_op" value="${esc(state.code_op)}" placeholder="texte libre">`, req('code_op'))}
        ${field('Caution', `<select name="caution">
          <option value=""${state.caution === '' || state.caution == null ? ' selected' : ''}>Rien</option>
          <option value="cheque_150"${state.caution === 'cheque_150' ? ' selected' : ''}>Chèque 150 €</option>
          <option value="especes"${state.caution === 'especes' ? ' selected' : ''}>Espèces</option>
        </select>`, req('caution'))}
        ${field('Notes', `<textarea name="notes" rows="2">${esc(state.notes)}</textarea>`, false)}
      `;
    }

    function renderAppareil() {
      const typeInfos = LocationRules.infosForType(state.appareil.type_appareil, rules);
      const infoHtml = typeInfos.length
        ? `<div class="loc-info-box">${typeInfos.map((i) => `<p>${esc(i.message)}</p>`).join('')}</div>`
        : '';
      const autre = state.appareil.type_appareil === 'autre';
      const prest = state.appareil.source === 'prestataire';
      const parc = state.appareil.source === 'parc';
      const extra = state.appareil.champs_extra || {};
      const dynamiques = champsForType(state.appareil.type_appareil)
        .map((c) => champInputHtml(c, extra[c.code]))
        .join('');

      formEl.innerHTML = `
        ${infoHtml}
        ${field('Type d’appareil', `<select name="type_appareil">
          ${TYPES.map((t) => `<option value="${t}"${state.appareil.type_appareil === t ? ' selected' : ''}>${LocationRules.typeLabel(t)}</option>`).join('')}
        </select>`, req('type_appareil'))}
        ${autre ? field('Libellé (autre)', `<input name="type_libelle" value="${esc(state.appareil.type_libelle || '')}">`, true) : ''}
        ${field('Source', `<select name="source">
          <option value="parc"${parc ? ' selected' : ''}>Parc pharmacie</option>
          <option value="prestataire"${prest ? ' selected' : ''}>Prestataire</option>
        </select>`, true)}
        ${prest ? `
          ${field('Prestataire', `<select name="prestataire_id">
            <option value="">—</option>
            ${prestataires.map((p) => `<option value="${p.id}"${state.appareil.prestataire_id === p.id ? ' selected' : ''}>${esc(p.nom)}</option>`).join('')}
          </select>`, true)}
          ${field('Matricule', `<input name="matricule" value="${esc(state.appareil.matricule || '')}" placeholder="si disponible">`, false)}
          ${field('Obtention', `<select name="mode_obtention">
            <option value="depot"${state.appareil.mode_obtention === 'depot' ? ' selected' : ''}>Dépôt</option>
            <option value="appel"${state.appareil.mode_obtention === 'appel' ? ' selected' : ''}>Appel pour l’obtenir</option>
          </select>`, true)}
          ${field('Livraison', `<select name="livraison">
            <option value="pharmacie"${state.appareil.livraison === 'pharmacie' ? ' selected' : ''}>À la pharmacie</option>
            <option value="patient"${state.appareil.livraison === 'patient' ? ' selected' : ''}>Chez le patient</option>
          </select>`, true)}
        ` : ''}
        ${parc ? `
          ${field('N° appareil pharmacie', `<input name="numero_pharmacie" value="${esc(state.appareil.numero_pharmacie || '')}">`, true)}
          <label class="loc-check"><input type="checkbox" name="desinfection"${state.appareil.desinfection ? ' checked' : ''}> Désinfection faite</label>
        ` : ''}
        ${dynamiques ? `<div class="loc-champs-extra">${dynamiques}</div>` : ''}
        ${field('Encart (texte libre)', `<textarea name="encart_texte" rows="4" data-touched="${state.appareil.encart_texte !== LocationRules.encartDefaut(state.appareil.type_appareil) ? '1' : ''}">${esc(state.appareil.encart_texte || '')}</textarea>`, false)}
      `;

      formEl.querySelector('[name=type_appareil]').addEventListener('change', (e) => {
        collectAppareil();
        const t = e.target.value;
        state.appareil.type_appareil = t;
        state.appareil.encart_texte = LocationRules.encartDefaut(t);
        state.appareil.champs_extra = {};
        if (t === 'tire_lait') {
          state.duree = 10;
          state.unite = 'semaines';
        }
        render();
      });
      formEl.querySelector('[name=source]').addEventListener('change', () => {
        collectAppareil();
        render();
      });
      const enc = formEl.querySelector('[name=encart_texte]');
      enc?.addEventListener('input', () => { enc.dataset.touched = '1'; });
    }

    function renderOrdo() {
      const fin = LocationRules.addDuration(state.date_debut || state.date_ordo, state.duree, state.unite);
      formEl.innerHTML = `
        ${field('Date de début', `<input type="date" name="date_debut" value="${esc(state.date_debut || '')}">`, req('date_debut'))}
        ${field('Date d’ordonnance', `<input type="date" name="date_ordo" value="${esc(state.date_ordo || '')}">`, req('date_ordo'))}
        ${field('Durée', `<input type="number" name="duree" min="1" value="${state.duree}">`, true)}
        ${field('Unité', `<select name="unite">
          <option value="jours"${state.unite === 'jours' ? ' selected' : ''}>Jours</option>
          <option value="semaines"${state.unite === 'semaines' ? ' selected' : ''}>Semaines</option>
          <option value="mois"${state.unite === 'mois' ? ' selected' : ''}>Mois</option>
        </select>`, true)}
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
      actionsEl.querySelector('#creSave')?.addEventListener('click', save);
    }

    async function save() {
      if (!validateStep()) return;
      collectPatient();
      collectPersonnel();
      collectAppareil();
      collectOrdo();
      const btn = actionsEl.querySelector('#creSave');
      if (btn) btn.disabled = true;
      showMsg('Enregistrement…');
      try {
        const dossier = await LocationData.createDossierComplet(
          {
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
          },
          ctx.userId
        );
        showMsg('Fiche créée.');
        afterCreate(dossier);
      } catch (e) {
        showMsg(e.message || 'Erreur à la création', true);
        if (btn) btn.disabled = false;
      }
    }

    function afterCreate(dossier) {
      const modal = el(`<div class="loc-modal" role="dialog">
        <div class="loc-modal-backdrop" data-close></div>
        <div class="loc-modal-panel">
          <h3>Fiche créée</h3>
          <p>Que souhaitez-vous faire ?</p>
          <div class="loc-modal-actions">
            <button type="button" class="loc-btn" data-act="stay">Rester sur Création</button>
            <button type="button" class="loc-btn loc-btn-ghost" data-act="suivi">Ouvrir le suivi</button>
            <button type="button" class="loc-btn loc-btn-ghost" data-act="print">Imprimer</button>
          </div>
        </div>
      </div>`);
      document.body.appendChild(modal);
      const close = () => modal.remove();
      modal.querySelector('[data-close]').addEventListener('click', () => {
        close();
        resetForm();
      });
      modal.querySelector('[data-act=stay]').addEventListener('click', () => {
        close();
        resetForm();
      });
      modal.querySelector('[data-act=suivi]').addEventListener('click', () => {
        close();
        ctx.openSuivi?.(dossier.id);
      });
      modal.querySelector('[data-act=print]').addEventListener('click', () => {
        // dossier déjà enrichi par createDossierComplet → getDossier (pas d’await ici)
        LocationPrint.printFiche(dossier);
      });
    }

    function resetForm() {
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
        encart_texte: LocationRules.encartDefaut('aerosol'),
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

    render();
  }

  global.LocationCreation = { mount };
})(window);
