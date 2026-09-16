/**
 * Module Paramètres Location — formulaires (pas de JSON brut), auto-save.
 */
(function (global) {
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const CHAMP_KEYS = [
    ['patient_nom', 'Nom patient'],
    ['patient_prenom', 'Prénom patient'],
    ['patient_date_naissance', 'Date de naissance'],
    ['patient_adresse', 'Adresse'],
    ['patient_telephone', 'Téléphone'],
    ['code_op', 'Code OP'],
    ['caution', 'Caution'],
    ['type_appareil', 'Type appareil'],
    ['date_debut', 'Date début'],
    ['date_ordo', 'Date ordonnance'],
  ];

  const DATA_TYPES = [
    ['texte', 'Texte'],
    ['date', 'Date'],
    ['oui_non', 'Oui / Non'],
    ['nombre', 'Nombre'],
    ['liste', 'Liste'],
    ['attention', 'Attention (encart rouge)'],
  ];

  const ACTION_OPTS = [
    ['alerte_contact', 'Alerte contact'],
    ['bloquer_ou_alerter', 'Bloquer ou alerter'],
    ['bascule_facture', 'Bascule facturation'],
  ];

  const UNITE_OPTS = [
    ['jours', 'Jours'],
    ['semaines', 'Semaines'],
    ['mois', 'Mois'],
  ];

  const BUG_HINT_TEMPLATES =
    'Pour ajouter un template hors règle, signalez-le via le bouton Bug (ou « Nouveau… » depuis une règle).';

  const BUG_HINT_CHAMPS =
    'Vous pouvez ajouter ou supprimer des champs de création ci-dessous.';

  const MOTIF_LABELS = {
    prolongation: 'Prolongation',
    prolongation_tire_lait: 'Prolongation tire-lait',
    reclame_appareil: 'Réclamer appareil',
    reclame_appareil_tens: 'Réclamer TENS',
  };

  function motifLabel(motif) {
    return MOTIF_LABELS[motif] || motif || '—';
  }

  const CONDITION_FIELDS = [
    { key: 'unite', label: 'Unité de durée', type: 'select', options: UNITE_OPTS },
    { key: 'max_duree', label: 'Durée max', type: 'number' },
    { key: 'max_duree_prolongation', label: 'Durée max prolongation', type: 'number' },
    { key: 'bascule_apres_mois', label: 'Bascule après (mois)', type: 'number' },
    {
      key: 'qui_facture',
      label: 'Qui facture',
      type: 'select',
      options: [
        ['pharmacie', 'Pharmacie'],
        ['prestataire', 'Prestataire'],
      ],
    },
  ];

  function numOrEmpty(v) {
    if (v == null || v === '') return '';
    return Number(v);
  }

  function readConditionsFromForm(root) {
    const out = {};
    root.querySelectorAll('[data-cond-row]').forEach((row) => {
      const key = row.dataset.condRow;
      const def = CONDITION_FIELDS.find((f) => f.key === key);
      if (!def) return;
      const el = row.querySelector('[data-cond-val]');
      if (!el) return;
      if (def.type === 'bool') {
        if (el.checked) out[key] = true;
      } else if (def.type === 'number') {
        const v = el.value.trim();
        if (v !== '') out[key] = Number(v);
      } else {
        const v = el.value;
        if (v) out[key] = v;
      }
    });
    return out;
  }

  function oneConditionRowHtml(f, value) {
    let control = '';
    if (f.type === 'bool') {
      control = `<label class="loc-check"><input type="checkbox" data-cond-val${value ? ' checked' : ''}> Activé</label>`;
    } else if (f.type === 'select') {
      control = `<select data-cond-val>
        <option value="">—</option>
        ${(f.options || [])
          .map(([k, v]) => `<option value="${k}"${value === k ? ' selected' : ''}>${esc(v)}</option>`)
          .join('')}
      </select>`;
    } else {
      control = `<input type="number" data-cond-val value="${esc(numOrEmpty(value))}">`;
    }
    return `<div class="loc-cond-row" data-cond-row="${esc(f.key)}">
      <span class="loc-cond-label">${esc(f.label)}</span>
      <div class="loc-cond-control">${control}</div>
      <button type="button" class="loc-btn loc-btn-ghost loc-btn-sm" data-rm-cond aria-label="Retirer">✕</button>
    </div>`;
  }

  function conditionsFormHtml(cond) {
    const c = cond && typeof cond === 'object' ? cond : {};
    const keys = Object.keys(c).filter((k) => CONDITION_FIELDS.some((f) => f.key === k));
    const rows = keys
      .map((k) => {
        const f = CONDITION_FIELDS.find((x) => x.key === k);
        return oneConditionRowHtml(f, c[k]);
      })
      .join('');
    const unused = CONDITION_FIELDS.filter((f) => !keys.includes(f.key));
    return `<div class="loc-cond-form" data-conditions-form>
      <div class="loc-cond-rows">${rows || '<p class="loc-muted">Aucune condition. Ajoutez-en une ci-dessous.</p>'}</div>
      <div class="loc-cond-add">
        <select id="adAddCondKey"${unused.length ? '' : ' disabled'}>
          <option value="">Ajouter une condition…</option>
          ${unused.map((f) => `<option value="${esc(f.key)}">${esc(f.label)}</option>`).join('')}
        </select>
        <button type="button" class="loc-btn loc-btn-ghost" id="adAddCondBtn" ${unused.length ? '' : 'disabled'}>Ajouter</button>
      </div>
    </div>`;
  }

  function bindConditionsForm(root) {
    const form = root.querySelector('[data-conditions-form]');
    if (!form) return;
    const refreshAddOptions = () => {
      const used = new Set([...form.querySelectorAll('[data-cond-row]')].map((r) => r.dataset.condRow));
      const sel = form.querySelector('#adAddCondKey');
      if (!sel) return;
      const unused = CONDITION_FIELDS.filter((f) => !used.has(f.key));
      sel.innerHTML =
        '<option value="">Ajouter une condition…</option>' +
        unused.map((f) => `<option value="${esc(f.key)}">${esc(f.label)}</option>`).join('');
      sel.disabled = !unused.length;
      const btn = form.querySelector('#adAddCondBtn');
      if (btn) btn.disabled = !unused.length;
    };
    form.querySelector('#adAddCondBtn')?.addEventListener('click', () => {
      const sel = form.querySelector('#adAddCondKey');
      const key = sel?.value;
      if (!key) return;
      const def = CONDITION_FIELDS.find((f) => f.key === key);
      if (!def) return;
      const wrap = form.querySelector('.loc-cond-rows');
      if (wrap.querySelector('.loc-muted')) wrap.innerHTML = '';
      wrap.insertAdjacentHTML('beforeend', oneConditionRowHtml(def, def.type === 'bool' ? true : ''));
      const row = wrap.querySelector(`[data-cond-row="${key}"]`);
      row?.querySelector('[data-rm-cond]')?.addEventListener('click', () => {
        row.remove();
        refreshAddOptions();
      });
      sel.value = '';
      refreshAddOptions();
    });
    form.querySelectorAll('[data-rm-cond]').forEach((btn) => {
      btn.addEventListener('click', () => {
        btn.closest('[data-cond-row]')?.remove();
        refreshAddOptions();
      });
    });
  }

  function readOptionsFromForm(root, dataType) {
    if (dataType !== 'liste') return {};
    const choix = [];
    root.querySelectorAll('[data-choix]').forEach((inp) => {
      const v = inp.value.trim();
      if (v) choix.push(v);
    });
    return choix.length ? { choix } : {};
  }

  function optionsFormHtml(options, dataType) {
    const choix = Array.isArray(options?.choix) ? options.choix : [''];
    const rows = (choix.length ? choix : ['']).map(
      (v, i) =>
        `<div class="loc-choix-row">
          <input data-choix value="${esc(v)}" placeholder="Option ${i + 1}">
          <button type="button" class="loc-btn loc-btn-ghost" data-rm-choix aria-label="Retirer">✕</button>
        </div>`
    );
    if (dataType !== 'liste') {
      return `<p class="loc-muted">Pas d’options pour ce type de champ.</p>`;
    }
    return `<div class="loc-options-form" data-options-form>
      <p class="loc-muted">Choix de la liste</p>
      <div class="loc-choix-list">${rows.join('')}</div>
      <button type="button" class="loc-btn loc-btn-ghost" data-add-choix>Ajouter un choix</button>
    </div>`;
  }

  function bindOptionsForm(root) {
    root.querySelector('[data-add-choix]')?.addEventListener('click', () => {
      const list = root.querySelector('.loc-choix-list');
      const row = document.createElement('div');
      row.className = 'loc-choix-row';
      row.innerHTML = `<input data-choix placeholder="Nouvelle option"><button type="button" class="loc-btn loc-btn-ghost" data-rm-choix aria-label="Retirer">✕</button>`;
      list.appendChild(row);
      row.querySelector('[data-rm-choix]').addEventListener('click', () => row.remove());
    });
    root.querySelectorAll('[data-rm-choix]').forEach((btn) => {
      btn.addEventListener('click', () => btn.closest('.loc-choix-row')?.remove());
    });
  }

  async function mount(container, ctx) {
    if (!ctx?.isAdmin) {
      container.innerHTML = '<p class="loc-msg loc-msg-err">Réservé aux administrateurs.</p>';
      return;
    }

    container.innerHTML = `
      <div class="loc-params">
        <nav class="loc-params-tabs" role="tablist">
          <button type="button" class="loc-admin-tab active" data-tab="params">Champs &amp; seuils</button>
          <button type="button" class="loc-admin-tab" data-tab="prestataires">Prestataires</button>
          <button type="button" class="loc-admin-tab" data-tab="regles">Règles</button>
          <button type="button" class="loc-admin-tab" data-tab="templates">Templates</button>
          <button type="button" class="loc-admin-tab" data-tab="champs">Champs création</button>
        </nav>
        <div class="loc-params-body" id="locParamsBody"></div>
        <p class="loc-msg" id="locParamsMsg" hidden></p>
      </div>
    `;

    const body = container.querySelector('#locParamsBody');
    const msg = container.querySelector('#locParamsMsg');
    let tab = 'params';
    /** @type {string|null} */
    let selectedRuleId = null;
    /** @type {string|null} */
    let selectedChampId = null;
    /** @type {string|null} */
    let selectedMotif = null;

    container.querySelectorAll('[data-tab]').forEach((b) => {
      b.addEventListener('click', async () => {
        if (tab === 'regles' && selectedRuleId) {
          await saveCurrentRule(false);
        }
        if (tab === 'champs' && selectedChampId) {
          await saveCurrentChamp(false);
        }
        tab = b.dataset.tab;
        container.querySelectorAll('.loc-admin-tab').forEach((x) =>
          x.classList.toggle('active', x.dataset.tab === tab)
        );
        render();
      });
    });

    function showMsg(t, err) {
      msg.hidden = !t;
      msg.textContent = t || '';
      msg.classList.toggle('loc-msg-err', !!err);
    }

    async function render() {
      showMsg('');
      body.innerHTML = '<p class="loc-muted">Chargement…</p>';
      try {
        if (tab === 'params') await renderParams();
        else if (tab === 'prestataires') await renderPrestataires();
        else if (tab === 'regles') await renderRegles();
        else if (tab === 'templates') await renderTemplates();
        else await renderChampsCreation();
      } catch (e) {
        body.innerHTML = `<p class="loc-msg-err">${esc(e.message)}</p>`;
      }
    }

    async function renderParams() {
      LocationData.invalidateCache();
      const params = await LocationData.loadParams();
      const champs = params.champs_obligatoires || {};
      const seuil = params.seuil_contact_jours ?? 7;
      const seuilReclame = params.seuil_reclame_mois ?? 6;
      const qui = params.qui_facture_defaut === 'prestataire' ? 'prestataire' : 'pharmacie';
      const delaiFacture = params.facture_delai_cloture_jours ?? 30;

      body.innerHTML = `
        <h3>Champs obligatoires à la création</h3>
        <div class="loc-checks">
          ${CHAMP_KEYS.map(
            ([k, label]) => `
            <label class="loc-check"><input type="checkbox" data-champ="${k}"${champs[k] !== false ? ' checked' : ''}> ${esc(label)}</label>
          `
          ).join('')}
        </div>
        <h3>Seuils</h3>
        <div class="loc-grid-2">
          <label class="loc-field">Seuil contact (J-n)<input type="number" min="0" id="adSeuil" value="${Number(seuil)}"></label>
          <label class="loc-field">Seuil réclamer appareil (mois)<input type="number" min="0" id="adSeuilReclame" value="${Number(seuilReclame)}"></label>
          <label class="loc-field">Délai clôture facture (jours)<input type="number" min="0" id="adDelaiFacture" value="${Number(delaiFacture)}"></label>
          <label class="loc-field">Qui facture (défaut)<select id="adQui">
            <option value="pharmacie"${qui === 'pharmacie' ? ' selected' : ''}>Pharmacie</option>
            <option value="prestataire"${qui === 'prestataire' ? ' selected' : ''}>Prestataire</option>
          </select></label>
        </div>
        <p class="loc-muted">Sans règle spécifique : mois depuis la fin de la dernière prolongation (&lt; seuil → prolongation ; ≥ seuil → réclamer l’appareil).</p>
        <p class="loc-muted loc-autosave-hint">Enregistrement automatique à chaque modification.</p>
      `;

      const persist = async () => {
        const nextChamps = {};
        body.querySelectorAll('[data-champ]').forEach((c) => {
          nextChamps[c.dataset.champ] = c.checked;
        });
        try {
          await LocationData.setParam('champs_obligatoires', nextChamps, ctx.userId);
          await LocationData.setParam('seuil_contact_jours', Number(body.querySelector('#adSeuil').value), ctx.userId);
          await LocationData.setParam(
            'seuil_reclame_mois',
            Number(body.querySelector('#adSeuilReclame').value),
            ctx.userId
          );
          await LocationData.setParam(
            'facture_delai_cloture_jours',
            Number(body.querySelector('#adDelaiFacture').value),
            ctx.userId
          );
          await LocationData.setParam('qui_facture_defaut', body.querySelector('#adQui').value, ctx.userId);
          showMsg('Paramètres enregistrés.');
        } catch (e) {
          showMsg(e.message, true);
        }
      };

      body.querySelectorAll('input, select').forEach((el) => {
        el.addEventListener('change', persist);
      });
    }

    async function renderPrestataires() {
      const rows = await LocationData.listPrestataires(false);
      body.innerHTML = `
        <div class="loc-admin-list">
          ${
            rows
              .map(
                (r) => `
            <div class="loc-admin-row" data-id="${r.id}">
              <label class="loc-field">Nom<input data-f="nom" value="${esc(r.nom)}"></label>
              <label class="loc-field">Tél.<input data-f="telephone" value="${esc(r.telephone || '')}"></label>
              <label class="loc-field">E-mail<input data-f="email" value="${esc(r.email || '')}"></label>
              <label class="loc-check"><input type="checkbox" data-f="actif"${r.actif ? ' checked' : ''}> Actif</label>
            </div>`
              )
              .join('') || '<p class="loc-muted">Aucun prestataire.</p>'
          }
        </div>
        <h3>Nouveau</h3>
        <div class="loc-grid-2" id="adNewPrest">
          <label class="loc-field">Nom<input data-n="nom"></label>
          <label class="loc-field">Tél.<input data-n="telephone"></label>
          <label class="loc-field">E-mail<input data-n="email"></label>
          <label class="loc-field">Contact<input data-n="contact"></label>
        </div>
        <button type="button" class="loc-btn" id="adAddPrest">Ajouter</button>
        <p class="loc-muted loc-autosave-hint">Les prestataires existants s’enregistrent automatiquement.</p>
      `;

      body.querySelectorAll('.loc-admin-row').forEach((row) => {
        const save = async () => {
          try {
            await LocationData.upsertPrestataire({
              id: row.dataset.id,
              nom: row.querySelector('[data-f=nom]').value.trim(),
              telephone: row.querySelector('[data-f=telephone]').value.trim() || null,
              email: row.querySelector('[data-f=email]').value.trim() || null,
              actif: row.querySelector('[data-f=actif]').checked,
            });
            showMsg('Prestataire enregistré.');
          } catch (e) {
            showMsg(e.message, true);
          }
        };
        row.querySelectorAll('input').forEach((inp) => inp.addEventListener('change', save));
      });

      body.querySelector('#adAddPrest').addEventListener('click', async () => {
        const box = body.querySelector('#adNewPrest');
        const nom = box.querySelector('[data-n=nom]').value.trim();
        if (!nom) return showMsg('Nom requis', true);
        try {
          await LocationData.upsertPrestataire({
            nom,
            telephone: box.querySelector('[data-n=telephone]').value.trim() || null,
            email: box.querySelector('[data-n=email]').value.trim() || null,
            contact: box.querySelector('[data-n=contact]').value.trim() || null,
            actif: true,
          });
          showMsg('Ajouté.');
          render();
        } catch (e) {
          showMsg(e.message, true);
        }
      });
    }

    function templateSelectHtml(templates, selectedId) {
      const actifs = (templates || []).filter((t) => t.actif !== false);
      return `<label class="loc-field" data-template-field>
        Template (message LGO si la règle s’applique)
        <select data-f="template_id">
          <option value="">— Aucun —</option>
          ${actifs
            .map(
              (t) =>
                `<option value="${esc(t.id)}"${t.id === selectedId ? ' selected' : ''}>${esc(
                  `${t.titre || t.motif} (${t.motif}${t.type_appareil ? ' · ' + t.type_appareil : ''})`
                )}</option>`
            )
            .join('')}
          <option value="__nouveau__">Nouveau…</option>
        </select>
      </label>`;
    }

    function collectRuleFromEditor(editor, id, prioriteAuto) {
      const action = editor.querySelector('[data-f=action]').value.trim();
      const tplSel = editor.querySelector('[data-f=template_id]');
      let template_id = null;
      if (tplSel && tplSel.value && tplSel.value !== '__nouveau__') {
        template_id = tplSel.value;
      }
      return {
        id,
        code: editor.querySelector('[data-f=code]').value.trim(),
        nom: editor.querySelector('[data-f=nom]').value.trim(),
        type_appareil: editor.querySelector('[data-f=type_appareil]').value || null,
        action,
        priorite: prioriteAuto,
        message: editor.querySelector('[data-f=message]').value,
        conditions: readConditionsFromForm(editor),
        actif: editor.querySelector('[data-f=actif]').checked,
        template_id,
      };
    }

    async function saveCurrentRule(silent) {
      const editor = body.querySelector('[data-rule-editor]');
      if (!editor || !selectedRuleId) return true;
      try {
        const rules = await LocationRules.listRules(LocationData.sb());
        const idx = Math.max(0, rules.findIndex((r) => r.id === selectedRuleId));
        const prioriteAuto = (idx + 1) * 10;
        await LocationRules.upsertRule(
          LocationData.sb(),
          collectRuleFromEditor(editor, selectedRuleId, prioriteAuto)
        );
        LocationData.invalidateCache();
        if (!silent) showMsg('Règle enregistrée.');
        return true;
      } catch (e) {
        showMsg(e.message, true);
        return false;
      }
    }

    async function createStubTemplateForRule(rule) {
      const code = String(rule.code || 'custom').trim() || 'custom';
      const motif = code.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      return LocationData.upsertTemplate({
        motif,
        titre: rule.nom || code,
        corps: 'À compléter',
        type_appareil: rule.type_appareil || null,
        actif: true,
      });
    }

    async function addNewRule() {
      const ok = selectedRuleId ? await saveCurrentRule(true) : true;
      if (!ok) return;
      try {
        const rules = await LocationRules.listRules(LocationData.sb());
        const base = `regle_${Date.now().toString(36)}`;
        const priorite = (rules.length + 1) * 10;
        const created = await LocationRules.upsertRule(LocationData.sb(), {
          code: base,
          nom: 'Nouvelle règle',
          type_appareil: null,
          action: 'alerte_contact',
          priorite,
          message: '',
          conditions: {},
          actif: true,
          template_id: null,
        });
        LocationData.invalidateCache();
        selectedRuleId = created.id;
        showMsg('Règle ajoutée — complétez code, conditions et template.');
        await renderRegles();
      } catch (e) {
        showMsg(e.message || 'Ajout impossible', true);
      }
    }

    async function renderRegles() {
      const [rules, templates] = await Promise.all([
        LocationRules.listRules(LocationData.sb()),
        LocationData.listTemplates(),
      ]);
      if (!selectedRuleId && rules[0]) selectedRuleId = rules[0].id;
      if (selectedRuleId && !rules.some((r) => r.id === selectedRuleId)) {
        selectedRuleId = rules[0]?.id || null;
      }
      const current = rules.find((r) => r.id === selectedRuleId) || null;

      body.innerHTML = `
        <div class="loc-motif-chips" role="tablist" aria-label="Règles">
          ${
            rules
              .map(
                (r) => `
            <button type="button" class="loc-motif-chip${r.id === selectedRuleId ? ' active' : ''}" data-pick-rule="${r.id}">
              ${esc(r.nom || r.code)}
            </button>`
              )
              .join('') || '<p class="loc-muted">Aucune règle.</p>'
          }
          <button type="button" class="loc-btn" id="adAddRule">Ajouter une règle</button>
        </div>
        <p class="loc-muted loc-autosave-hint">Enregistrement automatique en changeant de règle. Priorité calculée automatiquement. Choisissez le template LGO sur chaque règle.</p>
        <div class="loc-params-editor" data-rule-editor>
          ${
            current
              ? `
            <label class="loc-check"><input type="checkbox" data-f="actif"${current.actif ? ' checked' : ''}> Actif</label>
            <div class="loc-grid-2">
              <label class="loc-field">Code<input data-f="code" value="${esc(current.code)}"></label>
              <label class="loc-field">Nom<input data-f="nom" value="${esc(current.nom)}"></label>
              <label class="loc-field">Type appareil<select data-f="type_appareil">
                <option value="">Tous</option>
                ${Object.entries(LocationRules.TYPE_LABELS)
                  .map(
                    ([k, v]) =>
                      `<option value="${k}"${current.type_appareil === k ? ' selected' : ''}>${esc(v)}</option>`
                  )
                  .join('')}
              </select></label>
              <label class="loc-field">Action<select data-f="action">
                ${ACTION_OPTS.map(
                  ([k, v]) =>
                    `<option value="${k}"${current.action === k ? ' selected' : ''}>${esc(v)}</option>`
                ).join('')}
                ${
                  ACTION_OPTS.some(([k]) => k === current.action)
                    ? ''
                    : `<option value="${esc(current.action)}" selected>${esc(current.action)}</option>`
                }
              </select></label>
            </div>
            <label class="loc-field">Message<textarea data-f="message" rows="3">${esc(current.message || '')}</textarea></label>
            ${templateSelectHtml(templates, current.template_id)}
            <h3>Conditions</h3>
            ${conditionsFormHtml(current.conditions)}
          `
              : '<p class="loc-muted">Sélectionnez une règle ou ajoutez-en une.</p>'
          }
        </div>
      `;

      body.querySelector('#adAddRule')?.addEventListener('click', () => addNewRule());

      const editor = body.querySelector('[data-rule-editor]');
      if (editor) bindConditionsForm(editor);

      const tplSel = editor?.querySelector('[data-f=template_id]');
      tplSel?.addEventListener('change', async () => {
        if (tplSel.value === '__nouveau__') {
          try {
            const stub = await createStubTemplateForRule(current);
            tplSel.value = stub.id;
            const ok = await saveCurrentRule(true);
            if (!ok) return;
            showMsg('Template créé — complétez le texte dans l’onglet Templates.');
            selectedMotif = stub.motif;
            await renderRegles();
          } catch (e) {
            showMsg(e.message || 'Création template impossible', true);
            tplSel.value = current.template_id || '';
          }
          return;
        }
        await saveCurrentRule(true);
      });

      body.querySelectorAll('[data-pick-rule]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const nextId = btn.dataset.pickRule;
          if (nextId === selectedRuleId) return;
          const ok = await saveCurrentRule(true);
          if (!ok) return;
          selectedRuleId = nextId;
          showMsg('Règle enregistrée.');
          await renderRegles();
        });
      });
    }

    async function renderTemplates() {
      const rows = await LocationData.listTemplates();
      const motifs = [...new Set(rows.map((r) => r.motif).filter(Boolean))].sort((a, b) =>
        motifLabel(a).localeCompare(motifLabel(b), 'fr')
      );
      if (!selectedMotif && motifs[0]) selectedMotif = motifs[0];
      if (selectedMotif && !motifs.includes(selectedMotif)) {
        selectedMotif = motifs[0] || null;
      }
      const filtered = selectedMotif
        ? rows.filter((r) => r.motif === selectedMotif)
        : rows;

      body.innerHTML = `
        <p class="loc-admin-hint">${esc(BUG_HINT_TEMPLATES)}</p>
        <div class="loc-motif-chips" role="tablist" aria-label="Motifs">
          ${
            motifs
              .map(
                (m) => `
            <button type="button" class="loc-motif-chip${m === selectedMotif ? ' active' : ''}" data-motif="${esc(m)}">
              ${esc(motifLabel(m))}
            </button>`
              )
              .join('') || '<p class="loc-muted">Aucun motif.</p>'
          }
        </div>
        <p class="loc-muted loc-autosave-hint">Motif sélectionné : <strong>${esc(motifLabel(selectedMotif))}</strong> — enregistrement auto à chaque modification.</p>
        <p class="loc-hint">Placeholders dans le corps : <code>{date_min}</code> (date de fin JJ/MM/AAAA), <code>{max_duree}</code>, <code>{unite}</code> (jours/semaines/mois), <code>{max_duree_prolongation}</code>, <code>{bascule_apres_mois}</code>, <code>{type_appareil}</code> (libellé FR).</p>
        <div class="loc-admin-list" id="adTplList">
          ${
            filtered
              .map(
                (r) => `
            <div class="loc-admin-row" data-id="${r.id}">
              <label class="loc-field">Type appareil<select data-f="type_appareil">
                <option value="">Tous</option>
                ${Object.entries(LocationRules.TYPE_LABELS)
                  .map(
                    ([k, v]) =>
                      `<option value="${k}"${r.type_appareil === k ? ' selected' : ''}>${esc(v)}</option>`
                  )
                  .join('')}
              </select></label>
              <label class="loc-field">Titre<input data-f="titre" value="${esc(r.titre)}"></label>
              <label class="loc-field loc-span-2">Texte du commentaire<textarea data-f="corps" rows="4">${esc(r.corps || '')}</textarea></label>
              <div class="loc-row-actions">
                <button type="button" class="loc-btn loc-btn-ghost" data-del-tpl>Supprimer</button>
              </div>
            </div>`
              )
              .join('') || '<p class="loc-muted">Aucun template pour ce motif.</p>'
          }
        </div>
      `;

      body.querySelectorAll('[data-motif]').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedMotif = btn.dataset.motif;
          renderTemplates();
        });
      });

      body.querySelectorAll('.loc-admin-row').forEach((row) => {
        const save = async () => {
          try {
            await LocationData.upsertTemplate({
              id: row.dataset.id,
              titre: row.querySelector('[data-f=titre]').value.trim(),
              motif: selectedMotif,
              type_appareil: row.querySelector('[data-f=type_appareil]').value || null,
              corps: row.querySelector('[data-f=corps]').value,
            });
            showMsg('Template enregistré.');
          } catch (e) {
            showMsg(e.message, true);
          }
        };
        row.querySelectorAll('input, select, textarea').forEach((el) => {
          el.addEventListener('change', save);
        });
        row.querySelector('[data-del-tpl]')?.addEventListener('click', async () => {
          if (!confirm('Supprimer définitivement ce template ?')) return;
          try {
            await LocationData.deleteTemplate(row.dataset.id);
            showMsg('Template supprimé.');
            await renderTemplates();
          } catch (e) {
            showMsg(e.message || 'Suppression impossible', true);
          }
        });
      });
    }

    function collectChampFromEditor(editor, id) {
      const dataType = editor.querySelector('[data-f=data_type]').value;
      const isAttention = dataType === 'attention';
      return {
        id,
        type_appareil: editor.querySelector('[data-f=type_appareil]').value,
        code: editor.querySelector('[data-f=code]').value.trim(),
        libelle: editor.querySelector('[data-f=libelle]').value.trim(),
        data_type: dataType,
        options: isAttention ? {} : readOptionsFromForm(editor, dataType),
        ordre: Number(editor.querySelector('[data-f=ordre]').value),
        obligatoire: isAttention ? false : editor.querySelector('[data-f=obligatoire]')?.checked === true,
        actif: editor.querySelector('[data-f=actif]').checked,
      };
    }

    async function saveCurrentChamp(silent) {
      const editor = body.querySelector('[data-champ-editor]');
      if (!editor || !selectedChampId) return true;
      try {
        await LocationData.upsertChampCreation(collectChampFromEditor(editor, selectedChampId));
        if (!silent) showMsg('Champ enregistré.');
        return true;
      } catch (e) {
        showMsg(e.message, true);
        return false;
      }
    }

    async function renderChampsCreation() {
      const rows = await LocationData.listChampsCreation(null, false);
      if (!selectedChampId && rows[0]) selectedChampId = rows[0].id;
      if (selectedChampId && !rows.some((r) => r.id === selectedChampId)) {
        selectedChampId = rows[0]?.id || null;
      }
      const current = rows.find((r) => r.id === selectedChampId) || null;
      const nextOrdre = rows.reduce((m, r) => Math.max(m, Number(r.ordre) || 0), 0) + 10;

      body.innerHTML = `
        <p class="loc-admin-hint">${esc(BUG_HINT_CHAMPS)}</p>
        <p class="loc-muted loc-autosave-hint">Enregistrement automatique en changeant de champ.</p>
        <div class="loc-params-split">
          <div class="loc-params-nav" role="list">
            ${
              rows
                .map(
                  (r) => `
              <button type="button" class="loc-params-nav-item${r.id === selectedChampId ? ' active' : ''}" data-pick-champ="${r.id}">
                <strong>${esc(r.libelle || r.code)}</strong>
                <span>${esc(LocationRules.typeLabel(r.type_appareil))} · ${esc(r.code)}</span>
              </button>`
                )
                .join('') || '<p class="loc-muted">Aucun champ.</p>'
            }
            <button type="button" class="loc-btn" id="adAddChamp" style="margin-top:8px">＋ Ajouter un champ</button>
          </div>
          <div class="loc-params-editor" data-champ-editor>
            ${
              current
                ? `
              <div class="loc-grid-2">
                <label class="loc-field">Type appareil<select data-f="type_appareil">
                  ${Object.entries(LocationRules.TYPE_LABELS)
                    .map(
                      ([k, v]) =>
                        `<option value="${k}"${current.type_appareil === k ? ' selected' : ''}>${esc(v)}</option>`
                    )
                    .join('')}
                </select></label>
                <label class="loc-field">Code<input data-f="code" value="${esc(current.code)}" placeholder="ex. electrodes"></label>
                <label class="loc-field">Libellé<input data-f="libelle" value="${esc(current.libelle)}" placeholder="Texte affiché"></label>
                <label class="loc-field">Type de données<select data-f="data_type">
                  ${DATA_TYPES.map(
                    ([k, v]) =>
                      `<option value="${k}"${current.data_type === k ? ' selected' : ''}>${esc(v)}</option>`
                  ).join('')}
                </select></label>
                <label class="loc-field">Ordre<input type="number" data-f="ordre" value="${current.ordre ?? 0}"></label>
              </div>
              ${
                current.data_type === 'attention'
                  ? ''
                  : `<label class="loc-check"><input type="checkbox" data-f="obligatoire"${current.obligatoire ? ' checked' : ''}> Obligatoire</label>`
              }
              <label class="loc-check"><input type="checkbox" data-f="actif"${current.actif ? ' checked' : ''}> Actif</label>
              <h3>Options</h3>
              ${optionsFormHtml(current.options, current.data_type)}
              <div class="loc-row-actions" style="margin-top:12px">
                <button type="button" class="loc-btn loc-btn-ghost" id="adDelChamp">Supprimer ce champ</button>
              </div>
            `
                : '<p class="loc-muted">Sélectionnez un champ ou ajoutez-en un.</p>'
            }
          </div>
        </div>
      `;

      const editor = body.querySelector('[data-champ-editor]');
      if (editor) bindOptionsForm(editor);

      editor?.querySelector('[data-f=data_type]')?.addEventListener('change', async () => {
        await saveCurrentChamp(true);
        await renderChampsCreation();
      });

      body.querySelectorAll('[data-pick-champ]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const nextId = btn.dataset.pickChamp;
          if (nextId === selectedChampId) return;
          const ok = await saveCurrentChamp(true);
          if (!ok) return;
          selectedChampId = nextId;
          showMsg('Champ enregistré.');
          await renderChampsCreation();
        });
      });

      body.querySelector('#adAddChamp')?.addEventListener('click', async () => {
        if (selectedChampId) {
          const ok = await saveCurrentChamp(true);
          if (!ok) return;
        }
        try {
          const created = await LocationData.upsertChampCreation({
            type_appareil: 'tens',
            code: `champ_${Date.now().toString(36)}`,
            libelle: 'Nouveau champ',
            data_type: 'texte',
            options: {},
            ordre: nextOrdre,
            obligatoire: false,
            actif: true,
          });
          selectedChampId = created.id;
          showMsg('Champ ajouté.');
          await renderChampsCreation();
        } catch (e) {
          showMsg(e.message || 'Ajout impossible', true);
        }
      });

      body.querySelector('#adDelChamp')?.addEventListener('click', async () => {
        if (!selectedChampId) return;
        if (!confirm('Supprimer définitivement ce champ de création ?')) return;
        try {
          await LocationData.deleteChampCreation(selectedChampId);
          selectedChampId = null;
          showMsg('Champ supprimé.');
          await renderChampsCreation();
        } catch (e) {
          showMsg(e.message || 'Suppression impossible', true);
        }
      });
    }

    await render();
  }

  /** @deprecated utiliser mount — conservé pour compat éventuelle */
  async function open(ctx) {
    if (!ctx?.isAdmin) {
      alert('Réservé aux administrateurs.');
      return;
    }
    const host = document.getElementById('locViewContent') || document.body;
    await mount(host, ctx);
  }

  global.LocationAdmin = { mount, open };
})(window);
