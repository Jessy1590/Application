/**
 * Module Transcription — import/OCR + formulaire création ouvert (scroll) + persist.
 */
(function (global) {
  const TYPES = ['aerosol', 'tire_lait', 'pese_bebe', 'tens', 'fauteuil', 'autre'];

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstChild;
  }

  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function field(label, inputHtml, required, fieldCode) {
    const codeAttr = fieldCode ? ` data-field-code="${esc(fieldCode)}"` : '';
    return `<label class="loc-field"${codeAttr}>${label}${required ? ' *' : ''}
      ${inputHtml}
    </label>`;
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
      return `<label class="loc-check" data-field-code="${esc(code)}"><input type="checkbox" name="${name}"${checked ? ' checked' : ''}> ${esc(champ.libelle)}${champ.obligatoire ? ' *' : ''}</label>`;
    }
    if (champ.data_type === 'date') {
      return field(champ.libelle, `<input type="date" name="${name}" value="${esc(val)}">`, champ.obligatoire, code);
    }
    if (champ.data_type === 'nombre') {
      return field(champ.libelle, `<input type="number" name="${name}" value="${esc(val)}">`, champ.obligatoire, code);
    }
    if (champ.data_type === 'liste') {
      return field(
        champ.libelle,
        `<select name="${name}">
          <option value="">—</option>
          ${choix.map((c) => `<option value="${esc(c)}"${String(val) === String(c) ? ' selected' : ''}>${esc(c)}</option>`).join('')}
        </select>`,
        champ.obligatoire,
        code
      );
    }
    return field(champ.libelle, `<input type="text" name="${name}" value="${esc(val)}">`, champ.obligatoire, code);
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

  /** Pastilles : regrouper mots proches en lignes / tokens utiles. */
  function buildPills(words, pageW, pageH) {
    const usable = (words || []).filter((w) => w.confidence >= 40 && w.text.length >= 2);
    const pills = [];
    const used = new Set();
    for (let i = 0; i < usable.length; i += 1) {
      if (used.has(i)) continue;
      const w = usable[i];
      let text = w.text;
      let x0 = w.bbox.x0;
      let y0 = w.bbox.y0;
      let x1 = w.bbox.x1;
      let y1 = w.bbox.y1;
      used.add(i);
      for (let j = i + 1; j < usable.length; j += 1) {
        if (used.has(j)) continue;
        const n = usable[j];
        const sameLine = Math.abs(n.bbox.y0 - y0) < 12;
        const close = n.bbox.x0 - x1 < 28 && n.bbox.x0 >= x0 - 4;
        if (sameLine && close) {
          text += ` ${n.text}`;
          x1 = Math.max(x1, n.bbox.x1);
          y1 = Math.max(y1, n.bbox.y1);
          y0 = Math.min(y0, n.bbox.y0);
          used.add(j);
        }
      }
      if (text.replace(/\s/g, '').length < 2) continue;
      pills.push({
        text: text.trim(),
        leftPct: (x0 / pageW) * 100,
        topPct: (y0 / pageH) * 100,
        id: `pill_${pills.length}`,
      });
    }
    return pills.slice(0, 80);
  }

  async function mount(root, ctx) {
    const params = await LocationData.loadParams();
    const prestataires = await LocationData.listPrestataires(true);
    const show = (etape, code) => LocationData.isCreationActif(params, etape, code);
    const req = (etape, code) => LocationData.isCreationRequired(params, etape, code);
    const quiFactureDefaut = params.qui_facture_defaut === 'prestataire' ? 'prestataire' : 'pharmacie';
    const champsDef = await LocationData.listChampsCreation(null, true);

    const state = {
      pages: [],
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
      notes: '',
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
      busy: false,
    };

    root.innerHTML = '';
    const wrap = el(`<div class="loc-tr-shell">
      <div class="loc-tr-toolbar">
        <button type="button" class="loc-btn" id="trImportBtn">Numériser / Importer</button>
        <button type="button" class="loc-btn loc-btn-ghost" id="trPhotoBtn">Photo</button>
        <input type="file" id="trFileInput" class="loc-tr-file-input" accept="image/*,application/pdf" multiple>
        <input type="file" id="trPhotoInput" class="loc-tr-file-input" accept="image/*" capture="environment">
        <p class="loc-muted" id="trStatus">Importez des images ou un PDF scanné.</p>
      </div>
      <div class="loc-tr-split">
        <section class="loc-tr-pane" aria-label="Documents">
          <p class="loc-tr-pane-head">Documents</p>
          <div class="loc-tr-pane-scroll" id="trDocs"></div>
        </section>
        <section class="loc-tr-pane" aria-label="Formulaire">
          <p class="loc-tr-pane-head">Dossier</p>
          <div class="loc-tr-pane-scroll">
            <div class="loc-tr-form loc-form" id="trForm"></div>
            <div class="loc-tr-actions" id="trActions"></div>
            <p class="loc-msg" id="trMsg" hidden></p>
          </div>
        </section>
      </div>
    </div>`);
    root.appendChild(wrap);

    const docsEl = wrap.querySelector('#trDocs');
    const formEl = wrap.querySelector('#trForm');
    const actionsEl = wrap.querySelector('#trActions');
    const msgEl = wrap.querySelector('#trMsg');
    const statusEl = wrap.querySelector('#trStatus');
    const fileInput = wrap.querySelector('#trFileInput');
    const photoInput = wrap.querySelector('#trPhotoInput');

    function showMsg(text, isErr) {
      msgEl.hidden = !text;
      msgEl.textContent = text || '';
      msgEl.classList.toggle('loc-msg-err', !!isErr);
    }

    function setStatus(text) {
      statusEl.textContent = text || '';
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
            `<input name="cd_${esc(f.code)}" value="${esc(val)}">`,
            req(etapeId, f.code),
            f.code
          );
        })
        .join('');
    }

    function isFieldEmpty(code) {
      switch (code) {
        case 'patient_nom':
          return !state.patient.nom;
        case 'patient_prenom':
          return !state.patient.prenom;
        case 'patient_date_naissance':
          return !state.patient.date_naissance;
        case 'patient_adresse':
          return !state.patient.adresse;
        case 'patient_telephone':
          return !(state.patient.telephones && state.patient.telephones.length);
        case 'patient_mails':
          return !(state.patient.mails && state.patient.mails.length);
        case 'code_op':
          return !state.code_op;
        case 'caution':
          return !state.caution;
        case 'notes':
          return !state.notes;
        case 'type_appareil':
          return !state.appareil.type_appareil;
        case 'type_libelle':
          return !state.appareil.type_libelle;
        case 'source':
          return !state.appareil.source;
        case 'prestataire_id':
          return !state.appareil.prestataire_id;
        case 'matricule':
          return !state.appareil.matricule;
        case 'numero_pharmacie':
          return !state.appareil.numero_pharmacie;
        case 'mode_obtention':
          return !state.appareil.mode_obtention;
        case 'livraison':
          return !state.appareil.livraison;
        case 'encart_texte':
          return !state.appareil.encart_texte;
        case 'date_debut':
          return !state.date_debut;
        case 'date_ordo':
          return !state.date_ordo;
        case 'duree':
          return state.duree == null || state.duree === '';
        case 'unite':
          return !state.unite;
        default: {
          const v = state.appareil.champs_extra?.[code];
          return v == null || v === '';
        }
      }
    }

    function applyValueToState(code, value) {
      const v = value == null ? '' : String(value).trim();
      switch (code) {
        case 'patient_nom':
          state.patient.nom = v;
          break;
        case 'patient_prenom':
          state.patient.prenom = v;
          break;
        case 'patient_date_naissance':
          state.patient.date_naissance =
            LocationTranscriptionOcr.parseFrDate(v) || v;
          break;
        case 'patient_adresse':
          state.patient.adresse = v;
          break;
        case 'patient_telephone':
          if (v) state.patient.telephones = [v];
          break;
        case 'patient_mails':
          if (v) state.patient.mails = [v];
          break;
        case 'code_op':
          state.code_op = v;
          break;
        case 'caution':
          if (v === 'cheque_150' || v === 'especes' || v === '') state.caution = v;
          else if (/150|cheque|chèque/i.test(v)) state.caution = 'cheque_150';
          else if (/espec/i.test(v)) state.caution = 'especes';
          else state.caution = v;
          break;
        case 'notes':
          state.notes = v;
          break;
        case 'type_appareil':
          if (TYPES.includes(v)) state.appareil.type_appareil = v;
          break;
        case 'type_libelle':
          state.appareil.type_libelle = v;
          break;
        case 'source':
          if (v === 'parc' || v === 'prestataire') state.appareil.source = v;
          break;
        case 'prestataire_id':
          state.appareil.prestataire_id = v;
          break;
        case 'matricule':
          state.appareil.matricule = v;
          break;
        case 'numero_pharmacie':
          state.appareil.numero_pharmacie = v;
          break;
        case 'mode_obtention':
          if (v === 'depot' || v === 'appel') state.appareil.mode_obtention = v;
          break;
        case 'livraison':
          if (v === 'pharmacie' || v === 'patient') state.appareil.livraison = v;
          break;
        case 'desinfection':
          state.appareil.desinfection = v === true || v === 'true' || v === 'oui' || v === '1';
          break;
        case 'encart_texte':
          state.appareil.encart_texte = v;
          break;
        case 'date_debut':
          state.date_debut = LocationTranscriptionOcr.parseFrDate(v) || v;
          break;
        case 'date_ordo':
          state.date_ordo = LocationTranscriptionOcr.parseFrDate(v) || v;
          break;
        case 'duree': {
          const n = Number(v);
          if (Number.isFinite(n) && n > 0) state.duree = n;
          break;
        }
        case 'unite':
          if (v === 'jours' || v === 'semaines' || v === 'mois') state.unite = v;
          break;
        default:
          state.appareil.champs_extra = {
            ...(state.appareil.champs_extra || {}),
            [code]: v === '' ? null : v,
          };
      }
    }

    function applyMappings(mappings) {
      for (const m of mappings || []) {
        if (!m || !m.code) continue;
        if (!isFieldEmpty(m.code)) continue;
        applyValueToState(m.code, m.value);
      }
      if (state.appareil.source === 'parc') {
        state.appareil.prestataire_id = '';
      }
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

    function collectAll() {
      const nom = formEl.querySelector('[name=nom]');
      const prenom = formEl.querySelector('[name=prenom]');
      const dn = formEl.querySelector('[name=date_naissance]');
      const adresse = formEl.querySelector('[name=adresse]');
      if (nom) state.patient.nom = nom.value.trim();
      if (prenom) state.patient.prenom = prenom.value.trim();
      if (dn) state.patient.date_naissance = dn.value || '';
      if (adresse) state.patient.adresse = adresse.value.trim();
      const phonesList = formEl.querySelector('#phonesList');
      const mailsList = formEl.querySelector('#mailsList');
      if (phonesList) state.patient.telephones = LocationFields.collectPhones(phonesList);
      if (mailsList) state.patient.mails = LocationFields.collectMails(mailsList);
      collectCustomFields('patient');

      const codeOp = formEl.querySelector('[name=code_op]');
      const caution = formEl.querySelector('[name=caution]');
      const notes = formEl.querySelector('[name=notes]');
      if (codeOp) state.code_op = codeOp.value.trim();
      if (caution) state.caution = caution.value || '';
      if (notes) state.notes = notes.value.trim();
      collectCustomFields('personnel');

      const typeEl = formEl.querySelector('[name=type_appareil]');
      const type = typeEl ? typeEl.value : state.appareil.type_appareil;
      const sourceEl = formEl.querySelector('[name=source]');
      const source = sourceEl ? sourceEl.value || 'parc' : state.appareil.source || 'parc';
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
        encart_texte: formEl.querySelector('[name=encart_texte]')?.value || '',
        champs_extra: collectChampsExtra(type),
      };
      if (!next.prestataire_id) next.prestataire_id = null;
      if (source === 'parc') {
        next.prestataire_id = null;
        next.mode_obtention = null;
      }
      if (source === 'prestataire') {
        next.numero_pharmacie = '';
        next.desinfection = false;
      }
      state.appareil = next;
      collectCustomFields('appareil');

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

    function validateActif() {
      showMsg('');
      if (req('patient', 'patient_nom') && !state.patient.nom) return showMsg('Nom obligatoire.', true), false;
      if (req('patient', 'patient_prenom') && !state.patient.prenom) {
        return showMsg('Prénom obligatoire.', true), false;
      }
      if (req('patient', 'patient_date_naissance') && !state.patient.date_naissance) {
        return showMsg('Date de naissance obligatoire.', true), false;
      }
      if (req('patient', 'patient_adresse') && !state.patient.adresse) {
        return showMsg('Adresse obligatoire.', true), false;
      }
      if (req('patient', 'patient_telephone') && !state.patient.telephones.length) {
        return showMsg('Téléphone obligatoire.', true), false;
      }
      if (!validateCustomFields('patient')) return false;

      if (req('personnel', 'code_op') && !state.code_op) return showMsg('Code OP obligatoire.', true), false;
      if (req('personnel', 'caution') && !state.caution) return showMsg('Caution obligatoire.', true), false;
      if (!validateCustomFields('personnel')) return false;

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
        if (champ.data_type === 'oui_non' || champ.data_type === 'attention') continue;
        if (v == null || v === '') {
          return showMsg(`Champ obligatoire : ${champ.libelle}.`, true), false;
        }
      }
      if (!validateCustomFields('appareil')) return false;

      if (req('location', 'date_debut') && !state.date_debut) {
        return showMsg('Date de début obligatoire.', true), false;
      }
      if (req('location', 'date_ordo') && !state.date_ordo) {
        return showMsg('Date d’ordonnance obligatoire.', true), false;
      }
      if (show('location', 'duree') && req('location', 'duree') && (!state.duree || state.duree < 1)) {
        return showMsg('Durée invalide.', true), false;
      }
      if (!show('location', 'duree') && (!state.duree || state.duree < 1)) {
        state.duree = 10;
      }
      if (!validateCustomFields('location')) return false;
      return true;
    }

    function validateEnAttente() {
      collectAll();
      showMsg('');
      if (!state.patient.nom || !state.patient.prenom) {
        return showMsg('Nom et prénom obligatoires pour la mise en attente.', true), false;
      }
      return true;
    }

    function setDropValue(target, value) {
      const code = target.getAttribute('data-field-code');
      if (!code) return;
      collectAll();
      applyValueToState(code, value);
      renderForm();
    }

    function bindDropZones() {
      formEl.querySelectorAll('[data-field-code]').forEach((zone) => {
        zone.addEventListener('dragover', (e) => {
          e.preventDefault();
          zone.classList.add('is-drop-target');
        });
        zone.addEventListener('dragleave', () => {
          zone.classList.remove('is-drop-target');
        });
        zone.addEventListener('drop', (e) => {
          e.preventDefault();
          zone.classList.remove('is-drop-target');
          const text = e.dataTransfer.getData('text/plain');
          if (text) setDropValue(zone, text);
        });
      });
    }

    function renderDocs() {
      if (!state.pages.length) {
        docsEl.innerHTML =
          '<p class="loc-tr-docs-empty">Aucun document. Utilisez « Numériser / Importer ».</p>';
        return;
      }
      docsEl.innerHTML = state.pages
        .map((page) => {
          const pills = buildPills(page.words, page.width, page.height);
          return `<article class="loc-tr-page" data-page-id="${esc(page.id)}">
            <p class="loc-tr-page-label">${esc(page.label)}</p>
            <div class="loc-tr-page-stage">
              <img src="${esc(page.objectUrl)}" alt="${esc(page.label)}" width="${page.width}" height="${page.height}">
              ${pills
                .map(
                  (p) =>
                    `<button type="button" class="loc-tr-pill" draggable="true" data-pill-text="${esc(p.text)}" style="left:${p.leftPct}%;top:${p.topPct}%;" title="${esc(p.text)}">${esc(p.text)}</button>`
                )
                .join('')}
            </div>
          </article>`;
        })
        .join('');

      docsEl.querySelectorAll('.loc-tr-pill').forEach((pill) => {
        pill.addEventListener('dragstart', (e) => {
          const text = pill.getAttribute('data-pill-text') || pill.textContent || '';
          e.dataTransfer.setData('text/plain', text);
          e.dataTransfer.effectAllowed = 'copy';
          pill.classList.add('is-used');
        });
        pill.addEventListener('click', () => {
          const text = pill.getAttribute('data-pill-text') || '';
          try {
            navigator.clipboard?.writeText(text);
            setStatus(`Copié : ${text.slice(0, 40)}${text.length > 40 ? '…' : ''}`);
          } catch (_) {
            setStatus(text);
          }
        });
      });
    }

    function renderPatientSection() {
      return `<div class="loc-tr-form-section" data-etape="patient">
        <h3>Patient</h3>
        ${show('patient', 'patient_nom') ? field('Nom', `<input name="nom" value="${esc(state.patient.nom)}" autocomplete="family-name">`, req('patient', 'patient_nom'), 'patient_nom') : ''}
        ${show('patient', 'patient_prenom') ? field('Prénom', `<input name="prenom" value="${esc(state.patient.prenom)}" autocomplete="given-name">`, req('patient', 'patient_prenom'), 'patient_prenom') : ''}
        ${show('patient', 'patient_date_naissance') ? field('Date de naissance', `<input name="date_naissance" type="date" value="${esc(state.patient.date_naissance || '')}">`, req('patient', 'patient_date_naissance'), 'patient_date_naissance') : ''}
        ${show('patient', 'patient_adresse') ? field('Adresse', `<textarea name="adresse" rows="2">${esc(state.patient.adresse || '')}</textarea>`, req('patient', 'patient_adresse'), 'patient_adresse') : ''}
        ${show('patient', 'patient_telephone') ? `<div class="loc-multi-block" data-field-code="patient_telephone" data-multi="phones">
          <div class="loc-multi-head">
            <span>Téléphones${req('patient', 'patient_telephone') ? ' *' : ''}</span>
            <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" id="addPhoneBtn">＋ Ajouter</button>
          </div>
          <div id="phonesList" class="loc-multi-list"></div>
        </div>` : ''}
        ${show('patient', 'patient_mails') ? `<div class="loc-multi-block" data-field-code="patient_mails" data-multi="mails">
          <div class="loc-multi-head">
            <span>Mails</span>
            <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" id="addMailBtn">＋ Ajouter</button>
          </div>
          <div id="mailsList" class="loc-multi-list"></div>
        </div>` : ''}
        ${customFieldsHtml('patient')}
      </div>`;
    }

    function renderPersonnelSection() {
      return `<div class="loc-tr-form-section" data-etape="personnel">
        <h3>Personnel</h3>
        ${show('personnel', 'code_op') ? field('Code OP', `<input name="code_op" value="${esc(state.code_op)}">`, req('personnel', 'code_op'), 'code_op') : ''}
        ${show('personnel', 'caution') ? field('Caution', `<select name="caution">
          <option value=""${state.caution === '' || state.caution == null ? ' selected' : ''}>Rien</option>
          <option value="cheque_150"${state.caution === 'cheque_150' ? ' selected' : ''}>Chèque 150 €</option>
          <option value="especes"${state.caution === 'especes' ? ' selected' : ''}>Espèces</option>
        </select>`, req('personnel', 'caution'), 'caution') : ''}
        ${show('personnel', 'notes') ? field('Notes', `<textarea name="notes" rows="2">${esc(state.notes)}</textarea>`, req('personnel', 'notes'), 'notes') : ''}
        ${customFieldsHtml('personnel')}
      </div>`;
    }

    function renderAppareilSection() {
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

      return `<div class="loc-tr-form-section" data-etape="appareil">
        <h3>Appareil</h3>
        ${attentions}
        ${show('appareil', 'type_appareil') ? field('Type d’appareil', `<select name="type_appareil">
          ${TYPES.map((t) => `<option value="${t}"${state.appareil.type_appareil === t ? ' selected' : ''}>${LocationRules.typeLabel(t)}</option>`).join('')}
        </select>`, req('appareil', 'type_appareil'), 'type_appareil') : `<input type="hidden" name="type_appareil" value="${esc(state.appareil.type_appareil)}">`}
        ${autre && show('appareil', 'type_libelle') ? field('Libellé (autre)', `<input name="type_libelle" value="${esc(state.appareil.type_libelle || '')}">`, req('appareil', 'type_libelle'), 'type_libelle') : ''}
        ${show('appareil', 'source') ? field('Source', `<select name="source">
          <option value="parc"${parc ? ' selected' : ''}>Parc pharmacie</option>
          <option value="prestataire"${prest ? ' selected' : ''}>Prestataire</option>
        </select>`, req('appareil', 'source'), 'source') : `<input type="hidden" name="source" value="${esc(state.appareil.source)}">`}
        ${prest ? `
          ${show('appareil', 'prestataire_id') ? field('Prestataire', `<select name="prestataire_id">
            <option value="">—</option>
            ${prestataires.map((p) => `<option value="${p.id}"${state.appareil.prestataire_id === p.id ? ' selected' : ''}>${esc(p.nom)}</option>`).join('')}
          </select>`, req('appareil', 'prestataire_id'), 'prestataire_id') : ''}
          ${show('appareil', 'matricule') ? field('Matricule', `<input name="matricule" value="${esc(state.appareil.matricule || '')}">`, req('appareil', 'matricule'), 'matricule') : ''}
          ${show('appareil', 'mode_obtention') ? field('Obtention', `<select name="mode_obtention">
            <option value="depot"${state.appareil.mode_obtention === 'depot' ? ' selected' : ''}>Dépôt</option>
            <option value="appel"${state.appareil.mode_obtention === 'appel' ? ' selected' : ''}>Appel pour l’obtenir</option>
          </select>`, req('appareil', 'mode_obtention'), 'mode_obtention') : ''}
          ${show('appareil', 'livraison') ? field('Livraison', `<select name="livraison">
            <option value="pharmacie"${state.appareil.livraison === 'pharmacie' ? ' selected' : ''}>À la pharmacie</option>
            <option value="patient"${state.appareil.livraison === 'patient' ? ' selected' : ''}>Chez le patient</option>
          </select>`, req('appareil', 'livraison'), 'livraison') : ''}
        ` : ''}
        ${parc ? `
          ${show('appareil', 'numero_pharmacie') ? field('N° appareil pharmacie', `<input name="numero_pharmacie" value="${esc(state.appareil.numero_pharmacie || '')}">`, req('appareil', 'numero_pharmacie'), 'numero_pharmacie') : ''}
          ${show('appareil', 'desinfection') ? `<label class="loc-check" data-field-code="desinfection"><input type="checkbox" name="desinfection"${state.appareil.desinfection ? ' checked' : ''}> Désinfection faite</label>` : ''}
        ` : ''}
        ${dynamiques ? `<div class="loc-champs-extra">${dynamiques}</div>` : ''}
        ${show('appareil', 'encart_texte') ? field('Commentaire', `<textarea name="encart_texte" rows="3">${esc(state.appareil.encart_texte || '')}</textarea>`, req('appareil', 'encart_texte'), 'encart_texte') : ''}
        ${customFieldsHtml('appareil')}
      </div>`;
    }

    function renderLocationSection() {
      const fin = LocationRules.addDuration(state.date_debut || state.date_ordo, state.duree, state.unite);
      return `<div class="loc-tr-form-section" data-etape="location">
        <h3>Location</h3>
        ${show('location', 'date_debut') ? field('Date de début', `<input type="date" name="date_debut" value="${esc(state.date_debut || '')}">`, req('location', 'date_debut'), 'date_debut') : `<input type="hidden" name="date_debut" value="${esc(state.date_debut || '')}">`}
        ${show('location', 'date_ordo') ? field('Date d’ordonnance', `<input type="date" name="date_ordo" value="${esc(state.date_ordo || '')}">`, req('location', 'date_ordo'), 'date_ordo') : `<input type="hidden" name="date_ordo" value="${esc(state.date_ordo || '')}">`}
        ${show('location', 'duree') ? field('Durée', `<input type="number" name="duree" min="1" value="${state.duree}">`, req('location', 'duree'), 'duree') : `<input type="hidden" name="duree" value="${state.duree}">`}
        ${show('location', 'unite') ? field('Unité', `<select name="unite">
          <option value="jours"${state.unite === 'jours' ? ' selected' : ''}>Jours</option>
          <option value="semaines"${state.unite === 'semaines' ? ' selected' : ''}>Semaines</option>
          <option value="mois"${state.unite === 'mois' ? ' selected' : ''}>Mois</option>
        </select>`, req('location', 'unite'), 'unite') : `<input type="hidden" name="unite" value="${esc(state.unite)}">`}
        ${customFieldsHtml('location')}
        <p class="loc-hint">Fin calculée : <strong id="trFinHint">${fin || '—'}</strong></p>
      </div>`;
    }

    function renderForm() {
      formEl.innerHTML =
        renderPatientSection() +
        renderPersonnelSection() +
        renderAppareilSection() +
        renderLocationSection();

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

      formEl.querySelector('[name=type_appareil]')?.addEventListener('change', () => {
        collectAll();
        const prevExtra = state.appareil.champs_extra || {};
        const keep = {};
        for (const etape of LocationData.CREATION_ETAPES) {
          for (const f of customFieldsForEtape(etape.id)) {
            if (prevExtra[f.code] != null) keep[f.code] = prevExtra[f.code];
          }
        }
        state.appareil.champs_extra = keep;
        if (state.appareil.type_appareil === 'tire_lait') {
          state.duree = 10;
          state.unite = 'semaines';
        }
        renderForm();
      });
      formEl.querySelector('[name=source]')?.addEventListener('change', () => {
        collectAll();
        renderForm();
      });

      const recalc = () => {
        const dd = formEl.querySelector('[name=date_debut]')?.value || state.date_debut;
        const duree = Number(formEl.querySelector('[name=duree]')?.value || state.duree);
        const unite = formEl.querySelector('[name=unite]')?.value || state.unite;
        const f = LocationRules.addDuration(dd || state.date_ordo, duree, unite);
        const hint = formEl.querySelector('#trFinHint');
        if (hint) hint.textContent = f || '—';
      };
      formEl.querySelectorAll('[name=date_debut],[name=date_ordo],[name=duree],[name=unite]').forEach((i) => {
        i.addEventListener('change', recalc);
        i.addEventListener('input', recalc);
      });

      bindDropZones();
    }

    function renderActions() {
      actionsEl.innerHTML = `
        <button type="button" class="loc-btn loc-btn-ghost" id="trHold">Mise en attente</button>
        <button type="button" class="loc-btn" id="trSave">Créer le dossier</button>
      `;
      actionsEl.querySelector('#trHold')?.addEventListener('click', saveEnAttente);
      actionsEl.querySelector('#trSave')?.addEventListener('click', save);
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

    function formatErr(e) {
      if (!e) return 'Erreur';
      const parts = [e.message, e.details, e.hint].filter(Boolean);
      return parts.length ? parts.join(' — ') : String(e);
    }

    function resetAfterSave() {
      state.pages.forEach((p) => LocationTranscriptionOcr.revokeUrl(p.objectUrl));
      state.pages = [];
      state.patient_id = null;
      state.patient = {
        nom: '',
        prenom: '',
        date_naissance: '',
        adresse: '',
        telephones: [],
        mails: [],
      };
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
      renderDocs();
      renderForm();
    }

    async function saveEnAttente() {
      if (state.busy) return;
      if (!validateEnAttente()) return;
      state.busy = true;
      const btn = actionsEl.querySelector('#trHold');
      if (btn) btn.disabled = true;
      showMsg('Mise en attente…');
      try {
        await LocationData.createDossierComplet(buildPayload(), ctx.userId, { statut: 'en_attente' });
        showMsg('Dossier mis en attente.');
        resetAfterSave();
        setStatus('Dossier en attente enregistré.');
      } catch (e) {
        showMsg(formatErr(e) || 'Erreur à la mise en attente', true);
      } finally {
        state.busy = false;
        if (btn) btn.disabled = false;
      }
    }

    async function save() {
      if (state.busy) return;
      collectAll();
      if (!validateActif()) return;
      state.busy = true;
      const btn = actionsEl.querySelector('#trSave');
      if (btn) btn.disabled = true;
      showMsg('Enregistrement…');
      try {
        await LocationData.createDossierComplet(buildPayload(), ctx.userId, {
          statut: 'actif',
        });
        showMsg('Dossier créé.');
        resetAfterSave();
        setStatus('Dossier créé.');
      } catch (e) {
        showMsg(formatErr(e) || 'Erreur à la création', true);
      } finally {
        state.busy = false;
        if (btn) btn.disabled = false;
      }
    }

    async function handleFiles(fileList) {
      const files = [...(fileList || [])];
      if (!files.length || state.busy) return;
      state.busy = true;
      wrap.querySelector('#trImportBtn').disabled = true;
      wrap.querySelector('#trPhotoBtn').disabled = true;
      showMsg('');
      try {
        setStatus('Chargement OCR…');
        const result = await LocationTranscriptionOcr.processFiles(files, {
          prestataires,
          onStatus: setStatus,
        });
        state.pages.forEach((p) => LocationTranscriptionOcr.revokeUrl(p.objectUrl));
        state.pages = result.pages || [];
        collectAll();
        applyMappings(result.mappings);
        renderDocs();
        renderForm();
        setStatus(
          state.pages.length
            ? `${state.pages.length} page(s) — glissez une pastille vers un champ.`
            : 'Aucun texte détecté.'
        );
      } catch (e) {
        showMsg(formatErr(e) || 'Erreur OCR', true);
        setStatus('Échec OCR');
      } finally {
        state.busy = false;
        wrap.querySelector('#trImportBtn').disabled = false;
        wrap.querySelector('#trPhotoBtn').disabled = false;
        fileInput.value = '';
        photoInput.value = '';
      }
    }

    wrap.querySelector('#trImportBtn').addEventListener('click', () => fileInput.click());
    wrap.querySelector('#trPhotoBtn').addEventListener('click', () => photoInput.click());
    fileInput.addEventListener('change', () => handleFiles(fileInput.files));
    photoInput.addEventListener('change', () => handleFiles(photoInput.files));

    renderDocs();
    renderForm();
    renderActions();
  }

  global.LocationTranscription = { mount };
})(window);
