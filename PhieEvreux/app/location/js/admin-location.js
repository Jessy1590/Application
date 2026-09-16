/**
 * Admin Location — paramètres, prestataires, règles, templates, champs création.
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
  ];

  const BUG_HINT =
    'Pour ajouter une règle, un template ou un champ de création, signalez-le via le bouton Bug.';

  async function open(ctx) {
    if (!ctx?.isAdmin) {
      alert('Réservé aux administrateurs.');
      return;
    }

    const existing = document.getElementById('locAdminSheet');
    if (existing) existing.remove();

    const sheet = el(`<div class="loc-admin-sheet" id="locAdminSheet">
      <div class="loc-admin-backdrop" data-close></div>
      <div class="loc-admin-panel" role="dialog" aria-labelledby="locAdminTitle">
        <div class="loc-admin-head">
          <h2 id="locAdminTitle">Paramètres Location</h2>
          <button type="button" class="loc-icon-btn" data-close aria-label="Fermer">✕</button>
        </div>
        <div class="loc-admin-tabs">
          <button type="button" class="loc-admin-tab active" data-tab="params">Champs & seuils</button>
          <button type="button" class="loc-admin-tab" data-tab="prestataires">Prestataires</button>
          <button type="button" class="loc-admin-tab" data-tab="regles">Règles</button>
          <button type="button" class="loc-admin-tab" data-tab="templates">Templates</button>
          <button type="button" class="loc-admin-tab" data-tab="champs">Champs création</button>
        </div>
        <div class="loc-admin-body" id="locAdminBody"></div>
        <p class="loc-msg" id="locAdminMsg" hidden></p>
      </div>
    </div>`);
    document.body.appendChild(sheet);

    const body = sheet.querySelector('#locAdminBody');
    const msg = sheet.querySelector('#locAdminMsg');
    let tab = 'params';

    const close = () => sheet.remove();
    sheet.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    sheet.querySelectorAll('[data-tab]').forEach((b) => {
      b.addEventListener('click', () => {
        tab = b.dataset.tab;
        sheet.querySelectorAll('.loc-admin-tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === tab));
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
      const fauteuil = params.fauteuil_bascule_prestataire_mois ?? 2;
      const qui = params.qui_facture_defaut === 'prestataire' ? 'prestataire' : 'pharmacie';

      body.innerHTML = `
        <h3>Champs obligatoires à la création</h3>
        <div class="loc-checks">
          ${CHAMP_KEYS.map(([k, label]) => `
            <label class="loc-check"><input type="checkbox" data-champ="${k}"${champs[k] !== false ? ' checked' : ''}> ${esc(label)}</label>
          `).join('')}
        </div>
        <h3>Seuils</h3>
        <div class="loc-grid-2">
          <label class="loc-field">Seuil contact (J-n)<input type="number" min="0" id="adSeuil" value="${Number(seuil)}"></label>
          <label class="loc-field">Fauteuil bascule prestataire (mois)<input type="number" min="1" id="adFauteuil" value="${Number(fauteuil)}"></label>
          <label class="loc-field">Qui facture (défaut)<select id="adQui">
            <option value="pharmacie"${qui === 'pharmacie' ? ' selected' : ''}>Pharmacie</option>
            <option value="prestataire"${qui === 'prestataire' ? ' selected' : ''}>Prestataire</option>
          </select></label>
        </div>
        <button type="button" class="loc-btn" id="adSaveParams">Enregistrer</button>
      `;
      body.querySelector('#adSaveParams').addEventListener('click', async () => {
        const nextChamps = {};
        body.querySelectorAll('[data-champ]').forEach((c) => {
          nextChamps[c.dataset.champ] = c.checked;
        });
        try {
          await LocationData.setParam('champs_obligatoires', nextChamps, ctx.userId);
          await LocationData.setParam('seuil_contact_jours', Number(body.querySelector('#adSeuil').value), ctx.userId);
          await LocationData.setParam('fauteuil_bascule_prestataire_mois', Number(body.querySelector('#adFauteuil').value), ctx.userId);
          await LocationData.setParam('qui_facture_defaut', body.querySelector('#adQui').value, ctx.userId);
          showMsg('Paramètres enregistrés.');
        } catch (e) {
          showMsg(e.message, true);
        }
      });
    }

    async function renderPrestataires() {
      const rows = await LocationData.listPrestataires(false);
      body.innerHTML = `
        <div class="loc-admin-list">
          ${rows.map((r) => `
            <div class="loc-admin-row" data-id="${r.id}">
              <input data-f="nom" value="${esc(r.nom)}" placeholder="Nom">
              <input data-f="telephone" value="${esc(r.telephone || '')}" placeholder="Tél.">
              <input data-f="email" value="${esc(r.email || '')}" placeholder="E-mail">
              <label class="loc-check"><input type="checkbox" data-f="actif"${r.actif ? ' checked' : ''}> Actif</label>
              <button type="button" class="loc-btn loc-btn-ghost" data-save>Sauver</button>
            </div>`).join('') || '<p class="loc-muted">Aucun prestataire.</p>'}
        </div>
        <h3>Nouveau</h3>
        <div class="loc-grid-2" id="adNewPrest">
          <label class="loc-field">Nom<input data-n="nom"></label>
          <label class="loc-field">Tél.<input data-n="telephone"></label>
          <label class="loc-field">E-mail<input data-n="email"></label>
          <label class="loc-field">Contact<input data-n="contact"></label>
        </div>
        <button type="button" class="loc-btn" id="adAddPrest">Ajouter</button>
      `;
      body.querySelectorAll('[data-save]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const row = btn.closest('[data-id]');
          try {
            await LocationData.upsertPrestataire({
              id: row.dataset.id,
              nom: row.querySelector('[data-f=nom]').value.trim(),
              telephone: row.querySelector('[data-f=telephone]').value.trim() || null,
              email: row.querySelector('[data-f=email]').value.trim() || null,
              actif: row.querySelector('[data-f=actif]').checked,
            });
            showMsg('Prestataire enregistré.');
            render();
          } catch (e) {
            showMsg(e.message, true);
          }
        });
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

    async function renderRegles() {
      const rules = await LocationRules.listRules(LocationData.sb());
      body.innerHTML = `
        <p class="loc-admin-hint">${esc(BUG_HINT)}</p>
        <div class="loc-admin-table-wrap">
          <table class="loc-admin-table">
            <thead>
              <tr>
                <th>Actif</th>
                <th>Code</th>
                <th>Nom</th>
                <th>Type</th>
                <th>Action</th>
                <th>Priorité</th>
                <th>Message</th>
                <th>Conditions</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rules.map((r) => `
                <tr data-id="${r.id}">
                  <td><input type="checkbox" data-f="actif"${r.actif ? ' checked' : ''}></td>
                  <td><input data-f="code" value="${esc(r.code)}"></td>
                  <td><input data-f="nom" value="${esc(r.nom)}"></td>
                  <td><select data-f="type_appareil">
                    <option value="">Tous</option>
                    ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) =>
                      `<option value="${k}"${r.type_appareil === k ? ' selected' : ''}>${v}</option>`
                    ).join('')}
                  </select></td>
                  <td><input data-f="action" value="${esc(r.action)}"></td>
                  <td><input type="number" data-f="priorite" value="${r.priorite ?? 100}"></td>
                  <td><textarea data-f="message" rows="2">${esc(r.message || '')}</textarea></td>
                  <td><textarea data-f="conditions" rows="2">${esc(JSON.stringify(r.conditions || {}))}</textarea></td>
                  <td><button type="button" class="loc-btn loc-btn-ghost" data-save>Sauver</button></td>
                </tr>`).join('') || '<tr><td colspan="9" class="loc-muted">Aucune règle.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      body.querySelectorAll('[data-save]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const box = btn.closest('[data-id]');
          let conditions = {};
          try {
            conditions = JSON.parse(box.querySelector('[data-f=conditions]').value || '{}');
          } catch (_) {
            return showMsg('JSON conditions invalide', true);
          }
          try {
            await LocationRules.upsertRule(LocationData.sb(), {
              id: box.dataset.id,
              code: box.querySelector('[data-f=code]').value.trim(),
              nom: box.querySelector('[data-f=nom]').value.trim(),
              type_appareil: box.querySelector('[data-f=type_appareil]').value || null,
              action: box.querySelector('[data-f=action]').value.trim(),
              priorite: Number(box.querySelector('[data-f=priorite]').value),
              message: box.querySelector('[data-f=message]').value,
              conditions,
              actif: box.querySelector('[data-f=actif]').checked,
            });
            LocationData.invalidateCache();
            showMsg('Règle enregistrée.');
            render();
          } catch (e) {
            showMsg(e.message, true);
          }
        });
      });
    }

    async function renderTemplates() {
      const rows = await LocationData.listTemplates();
      body.innerHTML = `
        <p class="loc-admin-hint">${esc(BUG_HINT)}</p>
        <div class="loc-admin-table-wrap">
          <table class="loc-admin-table">
            <thead>
              <tr>
                <th>Motif</th>
                <th>Type</th>
                <th>Titre</th>
                <th>Corps</th>
                <th>Actif</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r) => `
                <tr data-id="${r.id}">
                  <td><input data-f="motif" value="${esc(r.motif)}"></td>
                  <td><select data-f="type_appareil">
                    <option value="">Tous</option>
                    ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) =>
                      `<option value="${k}"${r.type_appareil === k ? ' selected' : ''}>${v}</option>`
                    ).join('')}
                  </select></td>
                  <td><input data-f="titre" value="${esc(r.titre)}"></td>
                  <td><textarea data-f="corps" rows="2">${esc(r.corps || '')}</textarea></td>
                  <td><input type="checkbox" data-f="actif"${r.actif ? ' checked' : ''}></td>
                  <td><button type="button" class="loc-btn loc-btn-ghost" data-save>Sauver</button></td>
                </tr>`).join('') || '<tr><td colspan="6" class="loc-muted">Aucun template.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      body.querySelectorAll('[data-save]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const box = btn.closest('[data-id]');
          try {
            await LocationData.upsertTemplate({
              id: box.dataset.id,
              titre: box.querySelector('[data-f=titre]').value.trim(),
              motif: box.querySelector('[data-f=motif]').value.trim(),
              type_appareil: box.querySelector('[data-f=type_appareil]').value || null,
              corps: box.querySelector('[data-f=corps]').value,
              actif: box.querySelector('[data-f=actif]').checked,
            });
            showMsg('Template enregistré.');
            render();
          } catch (e) {
            showMsg(e.message, true);
          }
        });
      });
    }

    async function renderChampsCreation() {
      const rows = await LocationData.listChampsCreation(null, false);
      body.innerHTML = `
        <p class="loc-admin-hint">${esc(BUG_HINT)}</p>
        <div class="loc-admin-table-wrap">
          <table class="loc-admin-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Code</th>
                <th>Libellé</th>
                <th>Data type</th>
                <th>Options</th>
                <th>Ordre</th>
                <th>Oblig.</th>
                <th>Actif</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((r) => `
                <tr data-id="${r.id}">
                  <td><select data-f="type_appareil">
                    ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) =>
                      `<option value="${k}"${r.type_appareil === k ? ' selected' : ''}>${v}</option>`
                    ).join('')}
                  </select></td>
                  <td><input data-f="code" value="${esc(r.code)}"></td>
                  <td><input data-f="libelle" value="${esc(r.libelle)}"></td>
                  <td><select data-f="data_type">
                    ${DATA_TYPES.map(([k, v]) =>
                      `<option value="${k}"${r.data_type === k ? ' selected' : ''}>${v}</option>`
                    ).join('')}
                  </select></td>
                  <td><textarea data-f="options" rows="2">${esc(JSON.stringify(r.options || {}))}</textarea></td>
                  <td><input type="number" data-f="ordre" value="${r.ordre ?? 0}"></td>
                  <td><input type="checkbox" data-f="obligatoire"${r.obligatoire ? ' checked' : ''}></td>
                  <td><input type="checkbox" data-f="actif"${r.actif ? ' checked' : ''}></td>
                  <td><button type="button" class="loc-btn loc-btn-ghost" data-save>Sauver</button></td>
                </tr>`).join('') || '<tr><td colspan="9" class="loc-muted">Aucun champ.</td></tr>'}
            </tbody>
          </table>
        </div>
      `;

      body.querySelectorAll('[data-save]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const box = btn.closest('[data-id]');
          let options = {};
          try {
            options = JSON.parse(box.querySelector('[data-f=options]').value || '{}');
          } catch (_) {
            return showMsg('JSON options invalide', true);
          }
          try {
            await LocationData.upsertChampCreation({
              id: box.dataset.id,
              type_appareil: box.querySelector('[data-f=type_appareil]').value,
              code: box.querySelector('[data-f=code]').value.trim(),
              libelle: box.querySelector('[data-f=libelle]').value.trim(),
              data_type: box.querySelector('[data-f=data_type]').value,
              options,
              ordre: Number(box.querySelector('[data-f=ordre]').value),
              obligatoire: box.querySelector('[data-f=obligatoire]').checked,
              actif: box.querySelector('[data-f=actif]').checked,
            });
            showMsg('Champ enregistré.');
            render();
          } catch (e) {
            showMsg(e.message, true);
          }
        });
      });
    }

    await render();
  }

  global.LocationAdmin = { open };
})(window);
