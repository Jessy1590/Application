/**
 * Module Transcription — import/OCR + formulaire création ouvert (scroll) + persist.
 */
(function (global) {
  const TYPES = ['aerosol', 'tire_lait', 'pese_bebe', 'tens', 'fauteuil', 'autre'];

  const MOTIF_LABELS = {
    prolongation: 'Prolongation',
    prolongation_tire_lait: 'Prolongation tire-lait',
    reclame_appareil: 'Réclamer appareil',
    reclame_appareil_tens: 'Réclamer TENS',
  };

  function motifLabel(motif) {
    return MOTIF_LABELS[motif] || motif || '—';
  }

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
    const usable = (words || []).filter((w) => w.confidence >= 30 && w.text.length >= 1);
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
    const templatesAll = (await LocationData.listTemplates()).filter((t) => t.actif !== false);
    const show = (etape, code) => LocationData.isCreationActif(params, etape, code);
    const req = (etape, code) => LocationData.isCreationRequired(params, etape, code);
    const quiFactureDefaut = params.qui_facture_defaut === 'prestataire' ? 'prestataire' : 'pharmacie';
    const champsDef = await LocationData.listChampsCreation(null, true);

    const state = {
      pages: [],
      showPills: true,
      selectedPillKeys: new Set(),
      lastPillKey: null,
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
      prolongations: [],
      contacts: [],
      busy: false,
    };

    root.innerHTML = '';
    const wrap = el(`<div class="loc-tr-shell">
      <div class="loc-info-banner" role="note">
        <p class="loc-info-banner-title">Information</p>
        <div class="loc-info-banner-body">
          <ul>
            <li><strong>Organisation</strong> — à gauche les documents scannés ; à droite le formulaire dossier (Patient → Personnel → Appareil → Location → Prolongation → Contacts), toujours ouvert en défilement.</li>
            <li><strong>Import</strong> — bouton « Numériser / Importer » : plusieurs images et/ou PDF en une fois (les pages PDF sont séparées). « Photo » : plusieurs photos depuis la galerie. Un nouvel import s’ajoute aux documents déjà présents.</li>
            <li><strong>Remplissage</strong> — OCR Azure + IA Gemini proposent les champs ; les pastilles affichent le texte détecté sur le document. Clic / Ctrl+clic / Maj+clic pour multi-sélection, puis glisser vers une case du formulaire. Cases manquantes : saisie manuelle.</li>
            <li><strong>Pastilles</strong> — case « Afficher les pastilles » pour les masquer/afficher. Zoom − / + sur chaque document. Relisez avant Mise en attente ou Créer le dossier.</li>
          </ul>
        </div>
      </div>
      <div class="loc-tr-toolbar">
        <button type="button" class="loc-btn" id="trImportBtn">Numériser / Importer</button>
        <button type="button" class="loc-btn loc-btn-ghost" id="trPhotoBtn">Photo</button>
        <input type="file" id="trFileInput" class="loc-tr-file-input" accept="image/*,.pdf,application/pdf" multiple>
        <input type="file" id="trPhotoInput" class="loc-tr-file-input" accept="image/*" multiple>
        <label class="loc-check loc-tr-pills-toggle"><input type="checkbox" id="trShowPills" checked> Afficher les pastilles</label>
        <p class="loc-muted loc-tr-status" id="trStatus" aria-live="polite"></p>
      </div>
      <div class="loc-tr-split">
        <section class="loc-tr-pane" id="trDocsPane" aria-label="Documents">
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
    const docsPane = wrap.querySelector('#trDocsPane');
    const formEl = wrap.querySelector('#trForm');
    const actionsEl = wrap.querySelector('#trActions');
    const msgEl = wrap.querySelector('#trMsg');
    const statusEl = wrap.querySelector('#trStatus');
    const fileInput = wrap.querySelector('#trFileInput');
    const photoInput = wrap.querySelector('#trPhotoInput');
    const showPillsInput = wrap.querySelector('#trShowPills');

    const ZOOM_MIN = 1;
    const ZOOM_MAX = 2;
    const ZOOM_STEP = 0.25;

    function pageZoom(page) {
      const z = Number(page.zoom);
      if (!Number.isFinite(z) || z < ZOOM_MIN) return ZOOM_MIN;
      if (z > ZOOM_MAX) return ZOOM_MAX;
      return Math.round(z / ZOOM_STEP) * ZOOM_STEP;
    }

    function selectedTextsJoined() {
      const texts = [];
      docsEl.querySelectorAll('.loc-tr-pill').forEach((pill) => {
        const key = pill.getAttribute('data-pill-key');
        if (!key || !state.selectedPillKeys.has(key)) return;
        const t = pill.getAttribute('data-pill-text') || '';
        if (t) texts.push(t);
      });
      return texts.join(' ').replace(/\s+/g, ' ').trim();
    }

    function syncPillSelectionUI(pillNodes) {
      const nodes = pillNodes || docsEl.querySelectorAll('.loc-tr-pill');
      nodes.forEach((p) => {
        p.classList.toggle('is-selected', state.selectedPillKeys.has(p.getAttribute('data-pill-key')));
      });
      const n = state.selectedPillKeys.size;
      if (n > 1) {
        setStatus(`${n} pastilles sélectionnées — glissez vers un champ.`);
      } else if (n === 1) {
        const onlyKey = [...state.selectedPillKeys][0];
        let text = '';
        nodes.forEach((pill) => {
          if (pill.getAttribute('data-pill-key') === onlyKey) {
            text = pill.getAttribute('data-pill-text') || '';
          }
        });
        setStatus(text ? `Sélection : ${text.slice(0, 48)}${text.length > 48 ? '…' : ''}` : '');
      }
    }

    function applyPillsVisibility() {
      docsPane.classList.toggle('is-pills-hidden', !state.showPills);
      if (showPillsInput) showPillsInput.checked = !!state.showPills;
    }

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
        case 'prolong_enabled':
          return !(state.prolongations && state.prolongations.length);
        case 'prolong_duree':
          return !(state.prolongations && state.prolongations[0]?.duree);
        case 'prolong_unite':
          return !(state.prolongations && state.prolongations[0]?.unite);
        case 'prolong_notes':
          return !(state.prolongations && state.prolongations[0]?.notes);
        case 'prolong_date_ordo':
          return !(state.prolongations && state.prolongations[0]?.date_ordo);
        case 'prolongations':
          return !(state.prolongations && state.prolongations.length);
        case 'contact_enabled':
          return !(state.contacts || []).some((c) => c.enabled);
        case 'contact_motif':
          return !(state.contacts || []).some((c) => c.enabled && c.motif);
        case 'contact_template_id':
          return !(state.contacts || []).some((c) => c.enabled && c.template_id);
        case 'contact_appel_enabled':
          return !(state.contacts || []).some((c) => c.appel_enabled);
        case 'contact_appel_note':
        case 'contact_appel_statut':
        case 'contact_appel_mail':
          return !(state.contacts || []).some((c) => c.appel_enabled);
        case 'contacts':
          return !(state.contacts && state.contacts.length);
        default: {
          const v = state.appareil.champs_extra?.[code];
          return v == null || v === '';
        }
      }
    }

    function toMultiList(value) {
      if (Array.isArray(value)) {
        return value
          .map((x) => (x == null ? '' : String(x).trim()))
          .filter(Boolean);
      }
      if (value == null) return [];
      const s = String(value).trim();
      if (!s) return [];
      if (/[;\n|]/.test(s)) {
        return s.split(/[;\n|]+/).map((x) => x.trim()).filter(Boolean);
      }
      if (s.includes(',') && (s.includes('@') || /(?:\+33|0)\s*[1-9]/.test(s))) {
        return s.split(',').map((x) => x.trim()).filter(Boolean);
      }
      return [s];
    }

    function normalizeFrPhone(raw) {
      let tel = String(raw || '').replace(/[^\d+]/g, '');
      if (tel.startsWith('+33')) tel = `0${tel.slice(3)}`;
      else if (tel.startsWith('33') && tel.length >= 11) tel = `0${tel.slice(2)}`;
      tel = tel.replace(/\D/g, '');
      if (tel.length === 10 && /^0[1-9]/.test(tel)) return tel;
      return String(raw || '').replace(/[^\d+]/g, '').replace(/^\+?33/, '0') || '';
    }

    function extractPhonesFromValue(value) {
      const parts = toMultiList(value);
      const found = [];
      const re = /(?:\+33|0)\s*[1-9](?:[\s.-]*\d{2}){4}/g;
      for (const part of parts) {
        const matches = part.match(re);
        if (matches && matches.length) {
          for (const m of matches) {
            const tel = normalizeFrPhone(m);
            if (tel && !found.includes(tel)) found.push(tel);
          }
        } else {
          const tel = normalizeFrPhone(part);
          if (tel.length >= 10 && !found.includes(tel)) found.push(tel);
        }
      }
      return found;
    }

    function extractMailsFromValue(value) {
      const parts = toMultiList(value);
      const found = [];
      const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      for (const part of parts) {
        const matches = part.match(re);
        if (matches && matches.length) {
          for (const m of matches) {
            const mail = m.trim().toLowerCase();
            if (mail && !found.includes(mail)) found.push(mail);
          }
        } else if (part.includes('@')) {
          const mail = part.trim().toLowerCase();
          if (mail && !found.includes(mail)) found.push(mail);
        }
      }
      return found;
    }

    function applyValueToState(code, value) {
      const v = value == null ? '' : Array.isArray(value) ? value : String(value).trim();
      switch (code) {
        case 'patient_nom':
          state.patient.nom = Array.isArray(v) ? String(v[0] || '').trim() : v;
          break;
        case 'patient_prenom':
          state.patient.prenom = Array.isArray(v) ? String(v[0] || '').trim() : v;
          break;
        case 'patient_date_naissance':
          state.patient.date_naissance =
            LocationTranscriptionOcr.parseFrDate(Array.isArray(v) ? v[0] : v) ||
            (Array.isArray(v) ? String(v[0] || '') : v);
          break;
        case 'patient_adresse': {
          const list = toMultiList(value);
          if (list.length > 1) {
            state.patient.adresse = list.join('\n');
          } else if (list.length === 1) {
            state.patient.adresse = list[0];
          } else if (!Array.isArray(value) && v) {
            state.patient.adresse = Array.isArray(v) ? v.join('\n') : v;
          }
          break;
        }
        case 'patient_telephone': {
          const list = extractPhonesFromValue(value);
          if (list.length) state.patient.telephones = list;
          break;
        }
        case 'patient_mails': {
          const list = extractMailsFromValue(value);
          if (list.length) state.patient.mails = list;
          break;
        }
        case 'code_op':
          state.code_op = v;
          break;
        case 'caution': {
          const code = resolveEnumCode(v, ['cheque_150', 'especes'], [
            [/150|cheque|ch[eè]que/i, 'cheque_150'],
            [/espec/i, 'especes'],
          ]);
          if (code) state.caution = code;
          break;
        }
        case 'notes':
          state.notes = v;
          break;
        case 'type_appareil': {
          const code = resolveEnumCode(v, TYPES, [
            [/neurostim|tens|neuro.?stim/i, 'tens'],
            [/tire.?lait|tirelait|medela|symphony/i, 'tire_lait'],
            [/a[eé]rosol|nebul/i, 'aerosol'],
            [/p[eè]se.?b[eé]b|pesee/i, 'pese_bebe'],
            [/fauteuil/i, 'fauteuil'],
          ]);
          if (code) state.appareil.type_appareil = code;
          break;
        }
        case 'type_libelle':
          state.appareil.type_libelle = v;
          break;
        case 'source': {
          const code = resolveEnumCode(v, ['parc', 'prestataire'], [
            [/orkyn|presta/i, 'prestataire'],
            [/parc|pharmacie.?num|interne/i, 'parc'],
          ]);
          if (code) state.appareil.source = code;
          break;
        }
        case 'prestataire_id':
          state.appareil.prestataire_id = v;
          break;
        case 'matricule':
          state.appareil.matricule = v;
          break;
        case 'numero_pharmacie':
          state.appareil.numero_pharmacie = v;
          break;
        case 'mode_obtention': {
          const code = resolveEnumCode(v, ['depot', 'appel'], [
            [/depot|d[eé]p[oô]t|stock/i, 'depot'],
            [/appel|obtenir/i, 'appel'],
          ]);
          if (code) state.appareil.mode_obtention = code;
          break;
        }
        case 'livraison': {
          const code = resolveEnumCode(v, ['pharmacie', 'patient'], [
            [/pharmacie|officine/i, 'pharmacie'],
            [/patient|domicile|chez/i, 'patient'],
          ]);
          if (code) state.appareil.livraison = code;
          break;
        }
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
        case 'unite': {
          const code = resolveEnumCode(v, ['jours', 'semaines', 'mois'], [
            [/jour/i, 'jours'],
            [/semain/i, 'semaines'],
            [/mois|trimestre/i, 'mois'],
          ]);
          if (code) state.unite = code;
          break;
        }
        case 'prolongations': {
          const list = normalizeProlongationsValue(value);
          if (list.length) state.prolongations = list;
          break;
        }
        case 'prolong_enabled':
          if (value === true || v === 'true' || v === 'oui' || v === '1') {
            ensureProlongRow(0);
          } else {
            state.prolongations = [];
          }
          break;
        case 'prolong_duree': {
          const n = Number(Array.isArray(v) ? v[0] : v);
          if (Number.isFinite(n) && n > 0) {
            ensureProlongRow(0).duree = n;
          }
          break;
        }
        case 'prolong_unite': {
          const u = Array.isArray(v) ? v[0] : v;
          if (u === 'jours' || u === 'semaines' || u === 'mois') {
            ensureProlongRow(0).unite = u;
          }
          break;
        }
        case 'prolong_notes': {
          const note = Array.isArray(v) ? v.filter(Boolean).join('\n') : v;
          if (note) ensureProlongRow(0).notes = note;
          break;
        }
        case 'prolong_date_ordo': {
          const d = LocationTranscriptionOcr.parseFrDate(Array.isArray(v) ? v[0] : v) || (Array.isArray(v) ? v[0] : v);
          if (d) ensureProlongRow(0).date_ordo = d;
          break;
        }
        case 'prolong_date_fin_hint':
          ensureProlongRow(0);
          break;
        case 'contacts': {
          const list = normalizeContactsValue(value);
          if (list.length) {
            state.contacts = list.map((c) => {
              const row = emptyContactRow();
              Object.assign(row, c);
              if (row.motif) {
                const hit = findTemplateForMotif(row.motif);
                if (hit) {
                  row.template_id = hit.id;
                  row.motif = hit.motif || row.motif;
                }
                row.enabled = true;
              }
              return row;
            });
          }
          break;
        }
        case 'contact_enabled':
          if (value === true || v === 'true' || v === 'oui' || v === '1') {
            ensureContactRow(0).enabled = true;
          } else if (state.contacts[0]) {
            state.contacts[0].enabled = false;
          }
          break;
        case 'contact_motif':
          if (v) {
            const row = ensureContactRow(0);
            row.motif = Array.isArray(v) ? String(v[0] || '') : v;
            row.enabled = true;
            const hit = findTemplateForMotif(row.motif);
            if (hit) {
              row.template_id = hit.id;
              row.motif = hit.motif || row.motif;
            }
          }
          break;
        case 'contact_template_id':
          if (v) {
            const row = ensureContactRow(0);
            row.template_id = Array.isArray(v) ? String(v[0] || '') : v;
            row.enabled = true;
          }
          break;
        case 'contact_appel_enabled':
          ensureContactRow(0).appel_enabled =
            value === true || v === 'true' || v === 'oui' || v === '1';
          break;
        case 'contact_appel_note':
          if (v) {
            const row = ensureContactRow(0);
            const note = Array.isArray(v) ? v.filter(Boolean).join('\n') : v;
            row.appel_note = row.appel_note ? `${row.appel_note} ${note}`.trim() : note;
            row.appel_enabled = true;
          }
          break;
        case 'contact_appel_statut':
          if (v) {
            const row = ensureContactRow(0);
            const key = String(Array.isArray(v) ? v[0] : v)
              .toLowerCase()
              .replace(/\s+/g, '_');
            if (/rappeler|a_rappeler/.test(key)) row.appel_statut = 'a_rappeler';
            else if (/terminer|termine|terminé/.test(key)) row.appel_statut = 'termine';
            else if (/perte/.test(key)) row.appel_statut = 'PERTE';
            else if (/appeler|a_appeler|à_appeler/.test(key)) row.appel_statut = 'a_appeler';
            else row.appel_statut = Array.isArray(v) ? String(v[0] || '') : v;
            row.appel_enabled = true;
          }
          break;
        case 'contact_appel_mail':
          if (v) {
            const row = ensureContactRow(0);
            const key = String(Array.isArray(v) ? v[0] : v).toLowerCase();
            if (/oui|yes|envoyé|envoye/.test(key)) row.appel_mail = 'yes';
            else if (/faire|afaire|à faire/.test(key)) row.appel_mail = 'afaire';
            else if (/non|no/.test(key)) row.appel_mail = 'no';
            else row.appel_mail = Array.isArray(v) ? String(v[0] || '') : v;
            row.appel_enabled = true;
          }
          break;
        default:
          state.appareil.champs_extra = {
            ...(state.appareil.champs_extra || {}),
            [code]: resolveChampExtraValue(code, value),
          };
      }
    }

    function emptyProlongRow() {
      return {
        date_ordo: LocationRules.todayISO(),
        duree: 12,
        unite: 'mois',
        notes: '',
      };
    }

    function emptyContactRow() {
      return {
        enabled: false,
        template_id: '',
        motif: '',
        appel_enabled: false,
        appel_note: '',
        appel_statut: '',
        appel_mail: '',
      };
    }

    function ensureProlongRow(idx) {
      while (state.prolongations.length <= idx) state.prolongations.push(emptyProlongRow());
      return state.prolongations[idx];
    }

    function ensureContactRow(idx) {
      while (state.contacts.length <= idx) state.contacts.push(emptyContactRow());
      return state.contacts[idx];
    }

    function normalizeUnite(raw) {
      const s = String(raw || '').toLowerCase();
      if (/trimestre/.test(s)) return 'mois';
      if (/mois/.test(s)) return 'mois';
      if (/jour/.test(s)) return 'jours';
      if (/semain/.test(s)) return 'semaines';
      if (s === 'jours' || s === 'semaines' || s === 'mois') return s;
      return 'mois';
    }

    function normalizeProlongationsValue(value) {
      const raw = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
      const out = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        let duree = Number(item.duree);
        let unite = normalizeUnite(item.unite);
        if (/trimestre/i.test(String(item.unite || ''))) duree = duree * 3;
        if (!Number.isFinite(duree) || duree < 1) continue;
        out.push({
          date_ordo:
            LocationTranscriptionOcr.parseFrDate(item.date_ordo) ||
            String(item.date_ordo || '').trim() ||
            '',
          duree,
          unite,
          notes: String(item.notes || '').trim(),
        });
      }
      return out;
    }

    function normalizeContactsValue(value) {
      const raw = Array.isArray(value) ? value : value && typeof value === 'object' ? [value] : [];
      return raw
        .map((item) => {
          if (!item || typeof item !== 'object') return null;
          const row = emptyContactRow();
          if (item.motif) row.motif = String(item.motif).trim();
          if (item.template_id) row.template_id = String(item.template_id).trim();
          if (item.appel_note) {
            row.appel_note = String(item.appel_note).trim();
            row.appel_enabled = true;
          }
          if (item.appel_statut) {
            row.appel_statut = String(item.appel_statut).trim();
            row.appel_enabled = true;
          }
          if (item.appel_mail) {
            row.appel_mail = String(item.appel_mail).trim();
            row.appel_enabled = true;
          }
          if (item.appel_enabled === true || item.appel_enabled === 'true') row.appel_enabled = true;
          if (row.motif || row.template_id || row.appel_enabled) row.enabled = true;
          if (item.enabled === false) row.enabled = false;
          return row.enabled || row.appel_enabled ? row : null;
        })
        .filter(Boolean);
    }

    function findTemplateForMotif(motif) {
      if (!motif) return null;
      const list = templatesForType(state.appareil.type_appareil);
      return (
        list.find((t) => t.motif === motif && t.type_appareil === state.appareil.type_appareil) ||
        list.find((t) => t.motif === motif) ||
        null
      );
    }

    function templatesForType(type) {
      const t = type || state.appareil.type_appareil;
      const typed = templatesAll.filter((x) => x.type_appareil === t);
      const generic = templatesAll.filter((x) => !x.type_appareil);
      return typed.length ? [...typed, ...generic.filter((g) => !typed.some((x) => x.id === g.id))] : generic.length ? generic : templatesAll;
    }

    function pickTemplateForMotif(motif, contactIdx) {
      if (!motif) return;
      const hit = findTemplateForMotif(motif);
      const idx = contactIdx == null ? 0 : contactIdx;
      const row = ensureContactRow(idx);
      if (hit) {
        row.template_id = hit.id;
        row.motif = hit.motif || motif;
      } else {
        row.motif = motif;
      }
      row.enabled = true;
    }

    /**
     * Schéma IA 100 % dérivé du catalogue Location (création_champs + spécificités appareil).
     * Se met à jour seul quand Paramètres / types / champs changent.
     */
    function buildAiFieldSchema() {
      const typeLabels = LocationRules.TYPE_LABELS || {};
      const typeCodes = Object.keys(typeLabels).length
        ? Object.keys(typeLabels)
        : TYPES.slice();

      /** Listes déroulantes = mêmes options que le formulaire Création. */
      const DROPDOWNS = {
        type_appareil: typeCodes.map((value) => ({
          value,
          label: typeLabels[value] || value,
          aliases: ({
            aerosol: ['aérosol', 'aerosoltherapie', 'nébuliseur', 'nebuliseur'],
            tire_lait: ['tire-lait', 'tire lait', 'medela', 'symphony'],
            pese_bebe: ['pèse-bébé', 'pese bebe', 'pesée bébé'],
            tens: ['neurostimulateur', 'neurostimulation', 'tens', 'tens eco', 'actitens'],
            fauteuil: ['fauteuil'],
            autre: ['autre'],
          })[value] || [],
        })),
        caution: [
          { value: 'cheque_150', label: 'Chèque 150 €' },
          { value: 'especes', label: 'Espèces' },
        ],
        source: [
          { value: 'parc', label: 'Parc pharmacie' },
          { value: 'prestataire', label: 'Prestataire' },
        ],
        mode_obtention: [
          { value: 'depot', label: 'Dépôt' },
          { value: 'appel', label: 'Appel pour l’obtenir' },
        ],
        livraison: [
          { value: 'pharmacie', label: 'À la pharmacie' },
          { value: 'patient', label: 'Chez le patient' },
        ],
        unite: [
          { value: 'jours', label: 'Jours' },
          { value: 'semaines', label: 'Semaines' },
          { value: 'mois', label: 'Mois' },
        ],
      };

      /** Visibilité conditionnelle = même logique que Création. */
      const ONLY_IF = {
        type_libelle: { type_appareil: 'autre' },
        prestataire_id: { source: 'prestataire' },
        matricule: { source: 'prestataire' },
        mode_obtention: { source: 'prestataire' },
        livraison: { source: 'prestataire' },
        numero_pharmacie: { source: 'parc' },
      };

      const DATE_CODES = new Set([
        'patient_date_naissance',
        'date_debut',
        'date_ordo',
        'prolong_date_ordo',
      ]);
      const NUMBER_CODES = new Set(['duree', 'prolong_duree']);
      const BOOL_CODES = new Set([
        'desinfection',
        'prolong_enabled',
        'contact_enabled',
        'contact_appel_enabled',
      ]);

      function fieldType(code) {
        if (DROPDOWNS[code]) return 'enum';
        if (DATE_CODES.has(code)) return 'date';
        if (NUMBER_CODES.has(code)) return 'number';
        if (BOOL_CODES.has(code)) return 'boolean';
        return 'string';
      }

      const fields = [];
      const seen = new Set();
      const push = (row, opts = {}) => {
        if (!row?.code) return;
        if (!opts.allowDup) {
          if (seen.has(row.code)) return;
          seen.add(row.code);
        }
        fields.push(row);
      };

      /* 1) Catalogue création (étapes + custom admin), filtrés par actif */
      for (const etape of LocationData.CREATION_ETAPES) {
        for (const f of LocationData.listCreationFieldsForEtape(params, etape.id)) {
          if (!LocationData.isCreationActif(params, etape.id, f.code)) continue;
          const meta = LocationData.getCreationChamp(params, etape.id, f.code);
          const row = {
            code: f.code,
            label: meta.libelle || f.label || f.code,
            type: fieldType(f.code),
            section: etape.label || etape.id,
            obligatoire: !!LocationData.isCreationRequired(params, etape.id, f.code),
            custom: !!f.custom,
          };
          if (DROPDOWNS[f.code]) row.enum = DROPDOWNS[f.code];
          if (DATE_CODES.has(f.code)) row.format = 'YYYY-MM-DD';
          if (ONLY_IF[f.code]) {
            row.only_if = ONLY_IF[f.code];
            row.hint = `Uniquement si ${Object.entries(ONLY_IF[f.code])
              .map(([k, v]) => `${k}="${v}"`)
              .join(' et ')}`;
          }
          if (f.code === 'patient_nom') {
            row.hint = (row.hint ? row.hint + ' — ' : '') + 'Pas la pharmacie / prestataire';
          }
          if (f.code === 'patient_adresse') {
            row.type = 'string_or_string[]';
            row.hint =
              (row.hint ? row.hint + ' — ' : '') +
              'Si plusieurs adresses patient : value = tableau JSON, une adresse par élément. Elles seront jointes une par ligne.';
          }
          if (f.code === 'patient_telephone') {
            row.type = 'string_or_string[]';
            row.hint =
              (row.hint ? row.hint + ' — ' : '') +
              'TOUS les numéros du patient. Si plusieurs : value = tableau JSON ex. ["0612345678","0198765432"]. Un seul : string ou tableau à 1. Pas pharmacie / prestataire.';
          }
          if (f.code === 'patient_mails') {
            row.type = 'string_or_string[]';
            row.hint =
              (row.hint ? row.hint + ' — ' : '') +
              'TOUS les emails du patient. Si plusieurs : value = tableau JSON ex. ["a@mail.fr","b@mail.fr"]. Pas pharmacie / prestataire.';
          }
          if (f.code === 'prestataire_id') {
            row.hint =
              (row.hint ? row.hint + ' — ' : '') +
              'Mettre l’id UUID du prestataire (liste fournie), pas le nom seul';
          }
          push(row);
        }
      }

      /* 2) Spécificités appareil (Paramètres) — conditionnel auto par type_appareil */
      const byType = {};
      for (const champ of champsDef || []) {
        if (!champ?.code || champ.actif === false) continue;
        if (champ.data_type === 'attention') continue;
        const typeCode = String(champ.type_appareil || '');
        if (!typeCode) continue;
        const t =
          champ.data_type === 'oui_non'
            ? 'boolean'
            : champ.data_type === 'nombre'
              ? 'number'
              : 'string';
        const typeLabel = typeLabels[typeCode] || typeCode;
        const codeKey = champ.code;
        /* Préfixe section distincte ; code métier inchangé (champs_extra) */
        push(
          {
            code: codeKey,
            label: champ.libelle || champ.label || champ.code,
            type: t,
            section: `Spécificité · ${typeLabel}`,
            only_if: { type_appareil: typeCode },
            hint: `Renseigner UNIQUEMENT si type_appareil="${typeCode}" (${typeLabel})`,
            obligatoire: !!champ.obligatoire,
          },
          { allowDup: true }
        );
        if (!byType[typeCode]) byType[typeCode] = [];
        byType[typeCode].push(codeKey);
      }

      /* 3) Blocs Transcription (prolongations / contacts multi) — hors catalogue création */
      const extraBlocks = [
        {
          code: 'prolongations',
          label: 'Prolongations supplémentaires',
          type: 'array',
          section: 'Prolongation',
          hint:
            'Tableau JSON d’objets {date_ordo,duree,unite,notes}. UNE entrée par prolongation manuscrite/ordonnancée APRÈS la période initiale (ex. 2 « Prolongation ORDO DU … » = 2 objets). unite = jours|semaines|mois. Ne pas y mettre la durée initiale du tableau (début/fin prévue).',
        },
        {
          code: 'contacts',
          label: 'Contacts à créer',
          type: 'array',
          section: 'Contacts',
          hint:
            'Tableau JSON d’objets {motif, appel_note?, appel_statut?, appel_mail?}. Un objet par contact distinct si plusieurs. motif ex. prolongation, reclame_appareil.',
        },
      ];
      for (const row of extraBlocks) push(row);

      /* 4) Workflow généré automatiquement depuis enums + only_if + spécificités */
      const workflowParts = [
        'Pour chaque champ enum : value = code exact (enum[].value), jamais le libellé seul.',
        'Parcours : Patient → Personnel → type_appareil → champs only_if de ce type → source → champs only_if de cette source → Location → Prolongation/Contacts si visibles.',
      ];
      for (const [typeCode, codes] of Object.entries(byType)) {
        const lab = typeLabels[typeCode] || typeCode;
        workflowParts.push(
          `Si type_appareil="${typeCode}" (${lab}) alors remplir aussi : ${codes.join(', ')}.`
        );
      }
      for (const [code, cond] of Object.entries(ONLY_IF)) {
        if (!seen.has(code)) continue;
        workflowParts.push(
          `Champ "${code}" uniquement si ${Object.entries(cond)
            .map(([k, v]) => `${k}="${v}"`)
            .join(' et ')}.`
        );
      }

      return {
        fields,
        workflow: workflowParts.join(' '),
        generated_at: new Date().toISOString(),
        types: typeCodes,
      };
    }

    function resolveEnumCode(raw, allowed, aliases) {
      const v = String(raw || '').trim();
      if (!v) return '';
      if (allowed.includes(v)) return v;
      const n = v
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, '_');
      if (allowed.includes(n)) return n;
      for (const [re, code] of aliases || []) {
        if (re.test(v) || re.test(n)) return code;
      }
      const labels = LocationRules.TYPE_LABELS || {};
      for (const code of allowed) {
        const lab = String(labels[code] || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        if (lab && (n === lab || n.includes(lab) || lab.includes(n))) return code;
      }
      return '';
    }

    function resolveChampExtraValue(code, value) {
      const champ = (champsDef || []).find((c) => c && c.code === code);
      if (!champ) {
        if (value === true || value === false) return value;
        const s = value == null ? '' : String(value).trim();
        if (s === 'true' || s === 'oui' || s === '1') return true;
        if (s === 'false' || s === 'non' || s === '0') return false;
        return s === '' ? null : s;
      }
      if (champ.data_type === 'oui_non') {
        return (
          value === true ||
          value === 'true' ||
          value === 'oui' ||
          value === '1' ||
          String(value).toLowerCase() === 'oui'
        );
      }
      if (champ.data_type === 'nombre') {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      }
      if (champ.data_type === 'liste') {
        const opts = LocationRules.parseJson(champ.options, {});
        const choix = Array.isArray(opts.choix) ? opts.choix : [];
        const raw = String(value == null ? '' : value).trim();
        if (!raw) return null;
        const exact = choix.find((c) => String(c) === raw);
        if (exact != null) return exact;
        const norm = (s) =>
          String(s)
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
        const nRaw = norm(raw);
        const byCase = choix.find((c) => norm(c) === nRaw);
        if (byCase != null) return byCase;
        const compact = (s) => norm(s).replace(/\s+/g, '');
        const byCompact = choix.find((c) => compact(c) === compact(raw));
        if (byCompact != null) return byCompact;
        return raw;
      }
      if (champ.data_type === 'date') {
        return LocationTranscriptionOcr.parseFrDate(value) || String(value || '').trim() || null;
      }
      const s = value == null ? '' : String(value).trim();
      return s === '' ? null : s;
    }

    function applyMappings(mappings, opts) {
      const overwrite = !opts || opts.overwrite !== false;
      const list = (mappings || []).filter((m) => m && m.code != null && m.value != null);
      const rank = { type_appareil: 0, source: 1, prestataire_id: 2, matricule: 3 };
      list.sort((a, b) => (rank[a.code] ?? 40) - (rank[b.code] ?? 40));

      for (const m of list) {
        if (!overwrite && !isFieldEmpty(m.code)) continue;
        applyValueToState(m.code, m.value);
      }

      if (state.appareil.source === 'parc') {
        state.appareil.prestataire_id = '';
        state.appareil.mode_obtention = null;
      }
      if (state.appareil.source === 'prestataire') {
        state.appareil.numero_pharmacie = '';
        state.appareil.desinfection = false;
      }
    }

    /** Retire le bruit heuristique quand l’IA a déjà couvert le dossier. */
    function sanitizeMappingsForApply(result) {
      const all = result?.mappings || [];
      const aiCodes = new Set((result?.aiDebug?.mappings || []).map((m) => m.code));
      const hasAi = aiCodes.size > 0;
      return all.filter((m) => {
        if (!m || !m.code) return false;
        if (m.source !== 'heuristique') return true;
        if (!hasAi) return true;
        if (/^prolong_|^contact_/.test(m.code) && m.code !== 'prolongations' && m.code !== 'contacts') return false;
        if (m.confidence != null && m.confidence < 0.75) return false;
        const v = String(m.value == null ? '' : m.value).trim();
        if (/^(NOM|DEBUT|TELEPHONE|ADRESSE|DATE|PRENOM|ORKYN)$/i.test(v)) return false;
        return true;
      });
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

      const prolongCards = formEl.querySelectorAll('[data-prolong-idx]');
      if (prolongCards.length) {
        state.prolongations = [...prolongCards].map((card) => {
          const i = card.getAttribute('data-prolong-idx');
          return {
            date_ordo: formEl.querySelector('[name=pr_ordo_' + i + ']')?.value || LocationRules.todayISO(),
            duree: Number(formEl.querySelector('[name=pr_duree_' + i + ']')?.value || 0),
            unite: formEl.querySelector('[name=pr_unite_' + i + ']')?.value || 'semaines',
            notes: (formEl.querySelector('[name=pr_notes_' + i + ']')?.value || '').trim() || '',
          };
        });
      } else if (!formEl.querySelector('#trProlongList')) {
        /* section absente */
      } else {
        state.prolongations = [];
      }

      const contactCards = formEl.querySelectorAll('[data-contact-idx]');
      if (contactCards.length) {
        state.contacts = [...contactCards].map((card) => {
          const i = card.getAttribute('data-contact-idx');
          const row = emptyContactRow();
          row.enabled = !!formEl.querySelector('[name=contact_enabled_' + i + ']')?.checked;
          const tplSel = formEl.querySelector('[name=contact_template_id_' + i + ']');
          if (tplSel) {
            row.template_id = tplSel.value || '';
            const tpl = templatesAll.find((t) => t.id === row.template_id);
            row.motif = tpl?.motif || row.motif || '';
          }
          row.appel_enabled = !!formEl.querySelector('[name=contact_appel_enabled_' + i + ']')?.checked;
          row.appel_note = (formEl.querySelector('[name=contact_appel_note_' + i + ']')?.value || '').trim() || '';
          row.appel_statut =
            formEl.querySelector('[name=contact_appel_statut_' + i + ']:checked')?.value || '';
          row.appel_mail =
            formEl.querySelector('[name=contact_appel_mail_' + i + ']:checked')?.value || '';
          return row;
        });
      } else if (formEl.querySelector('#trContactList')) {
        state.contacts = [];
      }
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
      applyPillsVisibility();
      if (!state.pages.length) {
        docsEl.innerHTML =
          '<p class="loc-tr-docs-empty">Aucun document. Utilisez « Numériser / Importer ».</p>';
        state.selectedPillKeys.clear();
        state.lastPillKey = null;
        return;
      }
      docsEl.innerHTML = state.pages
        .map((page) => {
          const zoom = pageZoom(page);
          const pills = buildPills(page.words, page.width, page.height);
          return `<article class="loc-tr-page" data-page-id="${esc(page.id)}">
            <div class="loc-tr-page-bar">
              <p class="loc-tr-page-label">${esc(page.label)}</p>
              <div class="loc-tr-zoom" data-page-id="${esc(page.id)}">
                <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-zoom="-">−</button>
                <span class="loc-tr-zoom-label">${Math.round(zoom * 100)} %</span>
                <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-zoom="+">+</button>
              </div>
            </div>
            <div class="loc-tr-page-stage" style="--tr-zoom:${zoom}">
              <img src="${esc(page.objectUrl)}" alt="${esc(page.label)}" width="${page.width}" height="${page.height}">
              ${pills
                .map(
                  (p, idx) => {
                    const key = `${page.id}:${idx}`;
                    const sel = state.selectedPillKeys.has(key) ? ' is-selected' : '';
                    /* span (pas button) : click + HTML5 drag cohabitent mieux pour la multi-sélection */
                    return `<span role="button" tabindex="0" class="loc-tr-pill${sel}" draggable="true" data-pill-key="${esc(key)}" data-pill-text="${esc(p.text)}" style="left:${p.leftPct}%;top:${p.topPct}%;" title="${esc(p.text)}">${esc(p.text)}</span>`;
                  }
                )
                .join('')}
            </div>
          </article>`;
        })
        .join('');

      docsEl.querySelectorAll('.loc-tr-zoom').forEach((bar) => {
        const pageId = bar.getAttribute('data-page-id');
        bar.querySelectorAll('[data-zoom]').forEach((btn) => {
          btn.addEventListener('click', () => {
            const page = state.pages.find((p) => p.id === pageId);
            if (!page) return;
            let z = pageZoom(page);
            if (btn.getAttribute('data-zoom') === '+') z = Math.min(ZOOM_MAX, z + ZOOM_STEP);
            else z = Math.max(ZOOM_MIN, z - ZOOM_STEP);
            page.zoom = z;
            renderDocs();
          });
        });
      });

      const pillNodes = [...docsEl.querySelectorAll('.loc-tr-pill')];
      let suppressPillClick = false;

      function selectRange(fromKey, toKey) {
        const keys = pillNodes.map((p) => p.getAttribute('data-pill-key'));
        const a = keys.indexOf(fromKey);
        const b = keys.indexOf(toKey);
        if (a < 0 || b < 0) return;
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        for (let i = lo; i <= hi; i += 1) state.selectedPillKeys.add(keys[i]);
      }

      function applyPillPointerSelect(e, pill) {
        const key = pill.getAttribute('data-pill-key');
        if (!key) return;
        if (e.shiftKey && state.lastPillKey) {
          selectRange(state.lastPillKey, key);
          state.lastPillKey = key;
        } else if (e.ctrlKey || e.metaKey) {
          if (state.selectedPillKeys.has(key)) state.selectedPillKeys.delete(key);
          else state.selectedPillKeys.add(key);
          state.lastPillKey = key;
        } else if (state.selectedPillKeys.has(key) && state.selectedPillKeys.size > 1) {
          /* garder la multi-sélection pour un drag éventuel */
          state.lastPillKey = key;
        } else {
          state.selectedPillKeys.clear();
          state.selectedPillKeys.add(key);
          state.lastPillKey = key;
        }
        syncPillSelectionUI(pillNodes);
      }

      pillNodes.forEach((pill) => {
        pill.addEventListener('pointerdown', (e) => {
          if (e.button !== 0) return;
          const multi = e.ctrlKey || e.metaKey || e.shiftKey;
          /* Empêche le drag natif pendant Ctrl/Shift+clic (sinon sélection annulée) */
          if (multi) e.preventDefault();
          applyPillPointerSelect(e, pill);
        });
        pill.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          /* Après un drag, le click navigateur ne doit pas réduire la multi-sélection */
          if (suppressPillClick) {
            suppressPillClick = false;
            return;
          }
          const key = pill.getAttribute('data-pill-key');
          if (!key) return;
          if (!e.ctrlKey && !e.metaKey && !e.shiftKey && state.selectedPillKeys.size > 1 && state.selectedPillKeys.has(key)) {
            state.selectedPillKeys.clear();
            state.selectedPillKeys.add(key);
            state.lastPillKey = key;
            syncPillSelectionUI(pillNodes);
          }
        });
        pill.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          applyPillPointerSelect(e, pill);
        });
        pill.addEventListener('dragstart', (e) => {
          suppressPillClick = true;
          const key = pill.getAttribute('data-pill-key');
          if (key && !state.selectedPillKeys.has(key)) {
            state.selectedPillKeys.clear();
            state.selectedPillKeys.add(key);
            state.lastPillKey = key;
            syncPillSelectionUI(pillNodes);
          }
          const text = selectedTextsJoined() || pill.getAttribute('data-pill-text') || '';
          e.dataTransfer.setData('text/plain', text);
          e.dataTransfer.effectAllowed = 'copy';
          pillNodes.forEach((p) => {
            if (state.selectedPillKeys.has(p.getAttribute('data-pill-key'))) {
              p.classList.add('is-used');
            }
          });
        });
        pill.addEventListener('dragend', () => {
          /* click post-drag : laisser suppressPillClick jusqu’au click ou fallback */
          setTimeout(() => {
            suppressPillClick = false;
          }, 50);
        });
      });
    }

    function renderPatientSection() {
      return `<div class="loc-tr-form-section" data-etape="patient">
        <h3>Patient</h3>
        ${show('patient', 'patient_nom') ? field('Nom', `<input name="nom" value="${esc(state.patient.nom)}" autocomplete="family-name">`, req('patient', 'patient_nom'), 'patient_nom') : ''}
        ${show('patient', 'patient_prenom') ? field('Prénom', `<input name="prenom" value="${esc(state.patient.prenom)}" autocomplete="given-name">`, req('patient', 'patient_prenom'), 'patient_prenom') : ''}
        ${show('patient', 'patient_date_naissance') ? field('Date de naissance', `<input name="date_naissance" type="date" value="${esc(state.patient.date_naissance || '')}">`, req('patient', 'patient_date_naissance'), 'patient_date_naissance') : ''}
        ${show('patient', 'patient_adresse') ? field('Adresse', `<textarea name="adresse" rows="3" placeholder="Une adresse par ligne si plusieurs">${esc(state.patient.adresse || '')}</textarea>`, req('patient', 'patient_adresse'), 'patient_adresse') : ''}
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

    function locationFinBase() {
      return (
        LocationRules.addDuration(state.date_debut || state.date_ordo, state.duree, state.unite) ||
        state.date_debut ||
        state.date_ordo ||
        LocationRules.todayISO()
      );
    }

    function renderProlongationSection() {
      const list = state.prolongations || [];
      let running = locationFinBase();
      const cards = list
        .map((pr, i) => {
          const fin =
            pr.duree > 0 ? LocationRules.addDuration(running, pr.duree, pr.unite) : null;
          if (fin) running = fin;
          return `<div class="loc-tr-multi-card" data-prolong-idx="${i}">
          <div class="loc-tr-multi-card-head">
            <strong>Prolongation ${i + 1}</strong>
            <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-remove-prolong="${i}">Retirer</button>
          </div>
          <div class="loc-grid-2">
            ${field('Date ordo', `<input type="date" name="pr_ordo_${i}" value="${esc(pr.date_ordo || '')}">`, false, 'prolong_date_ordo')}
            ${field('Durée', `<input type="number" min="1" name="pr_duree_${i}" value="${esc(pr.duree)}">`, false, 'prolong_duree')}
            ${field(
              'Unité',
              `<select name="pr_unite_${i}">
                <option value="jours"${pr.unite === 'jours' ? ' selected' : ''}>Jours</option>
                <option value="semaines"${pr.unite === 'semaines' ? ' selected' : ''}>Semaines</option>
                <option value="mois"${pr.unite === 'mois' ? ' selected' : ''}>Mois</option>
              </select>`,
              false,
              'prolong_unite'
            )}
            ${field('Notes', `<input name="pr_notes_${i}" value="${esc(pr.notes || '')}" placeholder="Optionnel">`, false, 'prolong_notes')}
          </div>
          <p class="loc-hint">Fin après celle-ci : <strong>${fin || '—'}</strong></p>
        </div>`;
        })
        .join('');
      return `<div class="loc-tr-form-section" data-etape="prolongation">
        <h3>Prolongations</h3>
        <p class="loc-hint">Période initiale = dates Location ci-dessus. Ajoutez ici chaque prolongation (ex. 2 ordo manuscrites = 2 lignes).</p>
        <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" id="trAddProlong">＋ Ajouter une prolongation</button>
        <div id="trProlongList" class="loc-tr-multi-list">${cards || '<p class="loc-muted">Aucune prolongation supplémentaire.</p>'}</div>
        <p class="loc-hint">Fin finale calculée : <strong id="trProlongFinHint">${list.length ? running : '—'}</strong></p>
      </div>`;
    }

    function contactPreviewHtml(tpl) {
      if (!tpl || !String(tpl.corps || '').trim()) {
        return '<p class="loc-muted">Aucun texte template.</p>';
      }
      const fin = locationFinBase();
      const typeCode = state.appareil.type_appareil;
      const vars = {
        date_min: LocationRules.formatDateFr(fin) || fin || '',
        type_appareil: typeCode ? LocationRules.typeLabel(typeCode) : '',
      };
      const body = LocationRules.interpolate(String(tpl.corps), vars);
      return `<div class="loc-lgo-box">${esc(body)}</div>`;
    }

    function renderContactsSection() {
      const list = templatesForType(state.appareil.type_appareil);
      const contacts = state.contacts || [];
      const statutChoices = [
        ['a_appeler', 'À appeler'],
        ['a_rappeler', 'À rappeler'],
        ['termine', 'Terminé'],
        ['PERTE', 'PERTE'],
      ];
      const mailChoices = [
        ['yes', 'Oui — j’envoie un mail'],
        ['afaire', 'À faire'],
        ['no', 'Non'],
      ];
      const cards = contacts
        .map((co, i) => {
          let selectedId = co.template_id;
          if (co.enabled && !selectedId && list.length) {
            if (co.motif) {
              const byMotif =
                list.find((t) => t.motif === co.motif && t.type_appareil === state.appareil.type_appareil) ||
                list.find((t) => t.motif === co.motif);
              if (byMotif) selectedId = byMotif.id;
            }
            if (!selectedId) selectedId = list[0].id;
          }
          const selected = list.find((t) => t.id === selectedId) || null;
          const tplOptions = list
            .map((t) => {
              const typeBit = t.type_appareil ? LocationRules.typeLabel(t.type_appareil) : 'Tous types';
              const label = motifLabel(t.motif) + ' · ' + typeBit;
              return (
                '<option value="' +
                esc(t.id) +
                '"' +
                (t.id === selectedId ? ' selected' : '') +
                '>' +
                esc(label) +
                '</option>'
              );
            })
            .join('');
          const statutHtml = statutChoices
            .map(
              ([code, label]) =>
                '<label class="loc-check loc-tr-choice"><input type="radio" name="contact_appel_statut_' +
                i +
                '" value="' +
                esc(code) +
                '"' +
                (co.appel_statut === code ? ' checked' : '') +
                '> ' +
                esc(label) +
                '</label>'
            )
            .join('');
          const mailHtml = mailChoices
            .map(
              ([code, label]) =>
                '<label class="loc-check loc-tr-choice"><input type="radio" name="contact_appel_mail_' +
                i +
                '" value="' +
                esc(code) +
                '"' +
                (co.appel_mail === code ? ' checked' : '') +
                '> ' +
                esc(label) +
                '</label>'
            )
            .join('');
          const fieldsBlock = !list.length
            ? '<p class="loc-muted">Aucun template contact actif.</p>'
            : '<div' +
              (co.enabled ? '' : ' hidden') +
              ' data-contact-fields="' +
              i +
              '">' +
              field(
                'Template',
                '<select name="contact_template_id_' + i + '">' + tplOptions + '</select>',
                false,
                'contact_template_id'
              ) +
              '<p class="loc-muted" style="margin:8px 0 4px">Aperçu message</p>' +
              '<div data-contact-preview="' +
              i +
              '">' +
              contactPreviewHtml(selected) +
              '</div></div>';
          return (
            '<div class="loc-tr-multi-card" data-contact-idx="' +
            i +
            '"><div class="loc-tr-multi-card-head"><strong>Contact ' +
            (i + 1) +
            '</strong><button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-remove-contact="' +
            i +
            '">Retirer</button></div><label class="loc-check"><input type="checkbox" name="contact_enabled_' +
            i +
            '"' +
            (co.enabled ? ' checked' : '') +
            (list.length ? '' : ' disabled') +
            '> Créer un contact (phase commentaire)</label>' +
            fieldsBlock +
            '<label class="loc-check" style="margin-top:12px"><input type="checkbox" name="contact_appel_enabled_' +
            i +
            '"' +
            (co.appel_enabled ? ' checked' : '') +
            '> Créer un appel (phase appel)</label><div' +
            (co.appel_enabled ? '' : ' hidden') +
            ' data-appel-fields="' +
            i +
            '"><p class="loc-hint">Comme « Autres » dans Contact : commentaire, statut, puis mail.</p>' +
            field(
              'Commentaire appel',
              '<textarea name="contact_appel_note_' +
                i +
                '" rows="3" placeholder="Obligatoire — ce qui a été dit">' +
                esc(co.appel_note || '') +
                '</textarea>',
              true,
              'contact_appel_note'
            ) +
            '<p class="loc-muted" style="margin:8px 0 4px">Statut de l’appel</p><div class="loc-tr-choice-row" role="group" aria-label="Statut appel">' +
            statutHtml +
            '</div><p class="loc-muted" style="margin:12px 0 4px">Adresse mail disponible pour envoyer un mail (depuis le logiciel métier) ?</p><div class="loc-tr-choice-row" role="group" aria-label="Mail">' +
            mailHtml +
            '</div></div></div>'
          );
        })
        .join('');
      return (
        '<div class="loc-tr-form-section" data-etape="contact"><h3>Contacts</h3><p class="loc-hint">Créés uniquement à la validation « Créer le dossier » (dossier actif). Plusieurs contacts possibles.</p><button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" id="trAddContact">＋ Ajouter un contact</button><div id="trContactList" class="loc-tr-multi-list">' +
        (cards || '<p class="loc-muted">Aucun contact prévu.</p>') +
        '</div></div>'
      );
    }

    function renderForm() {
      formEl.innerHTML =
        renderPatientSection() +
        renderPersonnelSection() +
        renderAppareilSection() +
        renderLocationSection() +
        renderProlongationSection() +
        renderContactsSection();

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
        (state.contacts || []).forEach((c, idx) => {
          if (c.enabled && c.motif) pickTemplateForMotif(c.motif, idx);
        });
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
        recalcProlongHint();
      };

      function recalcProlongHint() {
        let running = locationFinBase();
        (state.prolongations || []).forEach((pr, i) => {
          const duree = Number(formEl.querySelector('[name=pr_duree_' + i + ']')?.value || pr.duree || 0);
          const unite = formEl.querySelector('[name=pr_unite_' + i + ']')?.value || pr.unite || 'semaines';
          if (duree > 0) running = LocationRules.addDuration(running, duree, unite) || running;
        });
        const ph = formEl.querySelector('#trProlongFinHint');
        if (ph) ph.textContent = (state.prolongations || []).length ? running || '—' : '—';
      }

      formEl.querySelector('#trAddProlong')?.addEventListener('click', (e) => {
        e.preventDefault();
        collectAll();
        state.prolongations.push(emptyProlongRow());
        renderForm();
      });
      formEl.querySelectorAll('[data-remove-prolong]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          collectAll();
          const idx = Number(btn.getAttribute('data-remove-prolong'));
          if (Number.isFinite(idx)) state.prolongations.splice(idx, 1);
          renderForm();
        });
      });
      formEl.querySelector('#trAddContact')?.addEventListener('click', (e) => {
        e.preventDefault();
        collectAll();
        const row = emptyContactRow();
        row.enabled = true;
        const list = templatesForType(state.appareil.type_appareil);
        if (list[0]) {
          row.template_id = list[0].id;
          row.motif = list[0].motif || '';
        }
        state.contacts.push(row);
        renderForm();
      });
      formEl.querySelectorAll('[data-remove-contact]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          collectAll();
          const idx = Number(btn.getAttribute('data-remove-contact'));
          if (Number.isFinite(idx)) state.contacts.splice(idx, 1);
          renderForm();
        });
      });
      formEl.querySelectorAll('[name^="contact_enabled_"],[name^="contact_appel_enabled_"]').forEach((el) => {
        el.addEventListener('change', () => {
          collectAll();
          renderForm();
        });
      });
      formEl.querySelectorAll('[name^="contact_template_id_"]').forEach((el) => {
        el.addEventListener('change', () => {
          collectAll();
          renderForm();
        });
      });

      formEl.querySelectorAll('[name=date_debut],[name=date_ordo],[name=duree],[name=unite]').forEach((i) => {
        i.addEventListener('change', recalc);
        i.addEventListener('input', recalc);
      });
      formEl.querySelectorAll('[name^="pr_duree_"],[name^="pr_unite_"]').forEach((i) => {
        i.addEventListener('change', () => recalcProlongHint());
        i.addEventListener('input', () => recalcProlongHint());
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
      state.selectedPillKeys.clear();
      state.lastPillKey = null;
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
      state.prolongations = [];
      state.contacts = [];
      renderDocs();
      renderForm();
    }

    function mapAppelStatut(ancienne) {
      if (ancienne === 'termine' || ancienne === 'PERTE') return 'resolu';
      if (ancienne === 'a_rappeler') return 'reporte';
      if (ancienne === 'a_appeler') return 'a_contacter';
      return 'a_contacter';
    }

    function afterCreate(dossier) {
      const modal = el(`<div class="loc-modal" role="dialog" aria-modal="true" aria-labelledby="trDoneTitle">
        <div class="loc-modal-backdrop" data-close></div>
        <div class="loc-modal-panel">
          <h3 id="trDoneTitle">Création terminée</h3>
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
        resetAfterSave();
      };
      modal.querySelector('[data-close]').addEventListener('click', nouveau);
      modal.querySelector('[data-act=new]').addEventListener('click', nouveau);
      modal.querySelector('[data-act=suivi]').addEventListener('click', () => {
        close();
        ctx.openSuivi?.(dossier.id);
      });
      modal.querySelector('[data-act=print]').addEventListener('click', () => {
        void global.LocationPrint.printFiche(dossier);
      });
    }

    async function applyProlongationIfNeeded(dossier) {
      const list = (state.prolongations || []).filter((pr) => Number(pr.duree) > 0);
      if (!list.length) return null;
      let current = dossier;
      const rules = await LocationData.loadRules();
      for (const pr of list) {
        const duree = Number(pr.duree);
        const unite = pr.unite || 'semaines';
        if (!Number.isFinite(duree) || duree < 1) {
          throw new Error('Durée de prolongation invalide.');
        }
        const evalRes = LocationRules.evaluate(
          { ...LocationData.dossierContext(current), prolong_duree: duree, prolong_unite: unite },
          rules,
          params
        );
        const block = evalRes.alerts.find((a) => a.action === 'bloquer_ou_alerter');
        if (block && !confirm(block.message + '\n\nContinuer quand même ?')) {
          throw new Error('Prolongation annulée.');
        }
        await LocationData.addProlongation(
          current.id,
          {
            date_ordo: pr.date_ordo || null,
            duree,
            unite,
            notes: pr.notes || null,
          },
          ctx.userId
        );
        current = await LocationData.getDossier(current.id);
      }
      return current;
    }

    async function applyOneContact(dossier, co) {
      if (!co || (!co.enabled && !co.appel_enabled)) return null;
      const d = dossier.date_fin ? dossier : await LocationData.getDossier(dossier.id);
      let motif = co.motif || 'prolongation';
      let lgoText = '';
      let contactId = null;

      if (co.enabled) {
        if (!co.template_id) throw new Error('Template contact introuvable.');
        const tpl = templatesAll.find((t) => t.id === co.template_id);
        if (!tpl || !String(tpl.corps || '').trim()) {
          throw new Error('Template contact introuvable ou vide.');
        }
        motif = tpl.motif || co.motif || 'prolongation';
        const vars = LocationData.contactInterpVars(motif, await LocationData.loadRules(), d);
        lgoText = LocationRules.interpolate(String(tpl.corps), vars);
        const row = await LocationData.upsertContact({
          dossier_id: d.id,
          motif,
          statut: 'a_contacter',
          phase: 'commentaire',
          commentaire: lgoText,
          phase_date_fin: d.date_fin || null,
          created_by: ctx.userId || null,
        });
        contactId = row?.id || null;
      }

      if (co.appel_enabled) {
        const note = String(co.appel_note || '').trim();
        if (!note) throw new Error('Commentaire appel obligatoire.');
        if (!co.appel_statut) throw new Error('Choisissez le statut de l’appel.');
        if (!co.appel_mail) throw new Error('Choisissez l’option mail (Oui / À faire / Non).');

        if (!motif && co.template_id) {
          const tpl = templatesAll.find((t) => t.id === co.template_id);
          motif = tpl?.motif || 'prolongation';
        }
        if (!motif) motif = 'prolongation';

        const isPerte = co.appel_statut === 'PERTE';
        const commentaire = lgoText ? lgoText + '\n\n--- Appel ---\n' + note : note;
        const appelRow = {
          dossier_id: d.id,
          motif,
          statut: mapAppelStatut(co.appel_statut),
          phase: 'appel',
          resultat: isPerte ? 'PERTE' : 'autre_raison',
          commentaire,
          commentaire_fait_at: co.enabled ? new Date().toISOString() : null,
          phase_date_fin: d.date_fin || null,
          mail_envoye: co.appel_mail === 'yes',
        };
        if (contactId) appelRow.id = contactId;
        else appelRow.created_by = ctx.userId || null;
        await LocationData.upsertContact(appelRow);
      }
      return true;
    }

    async function applyContactIfNeeded(dossier) {
      const list = (state.contacts || []).filter((c) => c.enabled || c.appel_enabled);
      if (!list.length) return null;
      for (const co of list) {
        await applyOneContact(dossier, co);
      }
      return true;
    }

    async function persistExtras(dossier, { asActif }) {
      let current = dossier;
      current = (await applyProlongationIfNeeded(current)) || current;
      if (asActif) {
        await applyContactIfNeeded(current);
      }
    }

    async function saveEnAttente() {
      if (state.busy) return;
      if (!validateEnAttente()) return;
      if ((state.prolongations || []).some((pr) => !Number.isFinite(Number(pr.duree)) || Number(pr.duree) < 1)) {
        return showMsg('Durée de prolongation invalide.', true);
      }
      state.busy = true;
      const btn = actionsEl.querySelector('#trHold');
      if (btn) btn.disabled = true;
      showMsg('Mise en attente…');
      try {
        const dossier = await LocationData.createDossierComplet(buildPayload(), ctx.userId, {
          statut: 'en_attente',
        });
        await persistExtras(dossier, { asActif: false });
        showMsg(
          (state.contacts || []).some((c) => c.enabled || c.appel_enabled)
            ? 'Dossier mis en attente (contact / appel non créés — réservés au dossier actif).'
            : 'Dossier mis en attente.'
        );
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
      if ((state.prolongations || []).some((pr) => !Number.isFinite(Number(pr.duree)) || Number(pr.duree) < 1)) {
        return showMsg('Durée de prolongation invalide.', true);
      }
      for (const co of state.contacts || []) {
        if (co.enabled && !co.template_id) {
          return showMsg('Choisissez un template contact.', true);
        }
        if (co.appel_enabled) {
          if (!String(co.appel_note || '').trim()) {
            return showMsg('Commentaire appel obligatoire.', true);
          }
          if (!co.appel_statut) {
            return showMsg('Choisissez le statut de l’appel.', true);
          }
          if (!co.appel_mail) {
            return showMsg('Choisissez l’option mail (Oui / À faire / Non).', true);
          }
        }
      }
      state.busy = true;
      const btn = actionsEl.querySelector('#trSave');
      if (btn) btn.disabled = true;
      showMsg('Enregistrement…');
      try {
        const dossier = await LocationData.createDossierComplet(buildPayload(), ctx.userId, {
          statut: 'actif',
        });
        await persistExtras(dossier, { asActif: true });
        const full = (await LocationData.getDossier(dossier.id)) || dossier;
        showMsg('Dossier créé.');
        setStatus('Dossier créé.');
        afterCreate(full);
      } catch (e) {
        showMsg(formatErr(e) || 'Erreur à la création', true);
      } finally {
        state.busy = false;
        if (btn) btn.disabled = false;
      }
    }

    /** FileList figée : ne pas relire l’input après clear / pendant busy. */
    const pendingImportFiles = [];

    async function handleFiles(fileList) {
      const incoming = Array.from(fileList || []).filter((f) => f && f.size >= 0);
      if (!incoming.length) return;
      if (state.busy) {
        pendingImportFiles.push(...incoming);
        setStatus(`OCR en cours — ${pendingImportFiles.length} fichier(s) en attente…`);
        return;
      }
      const files = incoming;
      state.busy = true;
      wrap.querySelector('#trImportBtn').disabled = true;
      wrap.querySelector('#trPhotoBtn').disabled = true;
      showMsg('');
      try {
        setStatus(`OCR + IA de ${files.length} fichier(s)…`);
        const schema = buildAiFieldSchema();
        const result = await LocationTranscriptionOcr.processFiles(files, {
          prestataires,
          fields: schema.fields,
          workflow: schema.workflow,
          onStatus: setStatus,
        });
        const added = result.pages || [];
        state.pages = state.pages.concat(added);
        applyMappings(sanitizeMappingsForApply(result), { overwrite: true });
        renderDocs();
        renderForm();
        if (result.errors && result.errors.length) {
          showMsg(`Certains fichiers ont échoué : ${result.errors.join(' — ')}`, true);
        } else if (result.aiError) {
          showMsg(`IA mapping : ${result.aiError} (heuristiques utilisées). Vérifiez GEMINI_API_KEY.`, true);
        }
        setStatus(
          state.pages.length
            ? `${state.pages.length} page(s) — ${added.length} ajoutée(s)${
                result.aiCount ? `, IA ${result.aiCount} champs` : ''
              }. Relisez les cases cochées / manuscrit.`
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
        if (pendingImportFiles.length) {
          const queued = pendingImportFiles.splice(0, pendingImportFiles.length);
          handleFiles(queued);
        }
      }
    }

    /* Garantit multi-fichiers côté propriété DOM (pas seulement l’attribut HTML). */
    fileInput.multiple = true;
    fileInput.accept = 'image/*,.pdf,application/pdf';
    fileInput.removeAttribute('capture');
    /* Sans capture : la galerie autorise plusieurs photos ; capture forçait souvent 1 seule. */
    photoInput.multiple = true;
    photoInput.accept = 'image/*';
    photoInput.removeAttribute('capture');

    wrap.querySelector('#trImportBtn').addEventListener('click', (e) => {
      e.preventDefault();
      fileInput.value = '';
      fileInput.click();
    });
    wrap.querySelector('#trPhotoBtn').addEventListener('click', (e) => {
      e.preventDefault();
      photoInput.value = '';
      photoInput.click();
    });
    fileInput.addEventListener('change', () => {
      const list = Array.from(fileInput.files || []);
      handleFiles(list);
    });
    photoInput.addEventListener('change', () => {
      const list = Array.from(photoInput.files || []);
      handleFiles(list);
    });
    showPillsInput?.addEventListener('change', () => {
      state.showPills = !!showPillsInput.checked;
      applyPillsVisibility();
    });

    applyPillsVisibility();
    renderDocs();
    renderForm();
    renderActions();
  }

  global.LocationTranscription = { mount };
})(window);
