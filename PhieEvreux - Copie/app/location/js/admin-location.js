/**
 * Admin Location — paramètres, prestataires, règles, templates.
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
        else await renderTemplates();
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
        <div class="loc-admin-list">
          ${rules.map((r) => `
            <div class="loc-admin-rule" data-id="${r.id}">
              <div class="loc-admin-rule-head">
                <label class="loc-check"><input type="checkbox" data-f="actif"${r.actif ? ' checked' : ''}> Actif</label>
              </div>
              <label class="loc-field">Nom<input data-f="nom" value="${esc(r.nom)}"></label>
              <label class="loc-field">Code<input data-f="code" value="${esc(r.code)}"></label>
              <label class="loc-field">Type<select data-f="type_appareil">
                <option value="">Tous</option>
                ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) =>
                  `<option value="${k}"${r.type_appareil === k ? ' selected' : ''}>${v}</option>`
                ).join('')}
              </select></label>
              <label class="loc-field">Action<input data-f="action" value="${esc(r.action)}"></label>
              <label class="loc-field">Priorité<input type="number" data-f="priorite" value="${r.priorite ?? 100}"></label>
              <label class="loc-field">Message<textarea data-f="message" rows="2">${esc(r.message || '')}</textarea></label>
              <label class="loc-field">Conditions (JSON)<textarea data-f="conditions" rows="2">${esc(JSON.stringify(r.conditions || {}))}</textarea></label>
              <div class="loc-row-actions">
                <button type="button" class="loc-btn loc-btn-ghost" data-save>Sauver</button>
                <button type="button" class="loc-btn loc-btn-ghost" data-del>Supprimer</button>
              </div>
            </div>`).join('')}
        </div>
        <h3>Nouvelle règle</h3>
        <div class="loc-grid-2" id="adNewRule">
          <label class="loc-field">Code<input data-n="code"></label>
          <label class="loc-field">Nom<input data-n="nom"></label>
          <label class="loc-field">Type<select data-n="type_appareil">
            <option value="">Tous</option>
            ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select></label>
          <label class="loc-field">Action<input data-n="action" value="alerte_contact"></label>
          <label class="loc-field loc-span-2">Message<textarea data-n="message" rows="2"></textarea></label>
          <label class="loc-field loc-span-2">Conditions JSON<textarea data-n="conditions" rows="2">{}</textarea></label>
        </div>
        <button type="button" class="loc-btn" id="adAddRule">Ajouter</button>
      `;

      body.querySelectorAll('.loc-admin-rule [data-save]').forEach((btn) => {
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

      body.querySelectorAll('.loc-admin-rule [data-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Supprimer cette règle ?')) return;
          try {
            await LocationRules.deleteRule(LocationData.sb(), btn.closest('[data-id]').dataset.id);
            LocationData.invalidateCache();
            render();
          } catch (e) {
            showMsg(e.message, true);
          }
        });
      });

      body.querySelector('#adAddRule').addEventListener('click', async () => {
        const box = body.querySelector('#adNewRule');
        let conditions = {};
        try {
          conditions = JSON.parse(box.querySelector('[data-n=conditions]').value || '{}');
        } catch (_) {
          return showMsg('JSON invalide', true);
        }
        const code = box.querySelector('[data-n=code]').value.trim();
        const nom = box.querySelector('[data-n=nom]').value.trim();
        if (!code || !nom) return showMsg('Code et nom requis', true);
        try {
          await LocationRules.upsertRule(LocationData.sb(), {
            code,
            nom,
            type_appareil: box.querySelector('[data-n=type_appareil]').value || null,
            action: box.querySelector('[data-n=action]').value.trim() || 'alerte_contact',
            message: box.querySelector('[data-n=message]').value,
            conditions,
            actif: true,
            priorite: 100,
          });
          LocationData.invalidateCache();
          showMsg('Règle ajoutée.');
          render();
        } catch (e) {
          showMsg(e.message, true);
        }
      });
    }

    async function renderTemplates() {
      const rows = await LocationData.listTemplates();
      body.innerHTML = `
        <div class="loc-admin-list">
          ${rows.map((r) => `
            <div class="loc-admin-rule" data-id="${r.id}">
              <label class="loc-field">Titre<input data-f="titre" value="${esc(r.titre)}"></label>
              <label class="loc-field">Motif<input data-f="motif" value="${esc(r.motif)}"></label>
              <label class="loc-field">Type<select data-f="type_appareil">
                <option value="">Tous</option>
                ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) =>
                  `<option value="${k}"${r.type_appareil === k ? ' selected' : ''}>${v}</option>`
                ).join('')}
              </select></label>
              <label class="loc-check"><input type="checkbox" data-f="actif"${r.actif ? ' checked' : ''}> Actif</label>
              <label class="loc-field">Corps<textarea data-f="corps" rows="3">${esc(r.corps || '')}</textarea></label>
              <div class="loc-row-actions">
                <button type="button" class="loc-btn loc-btn-ghost" data-save>Sauver</button>
                <button type="button" class="loc-btn loc-btn-ghost" data-del>Supprimer</button>
              </div>
            </div>`).join('') || '<p class="loc-muted">Aucun template.</p>'}
        </div>
        <h3>Nouveau template</h3>
        <div class="loc-grid-2" id="adNewTpl">
          <label class="loc-field">Titre<input data-n="titre"></label>
          <label class="loc-field">Motif<input data-n="motif" placeholder="fin_location"></label>
          <label class="loc-field">Type<select data-n="type_appareil">
            <option value="">Tous</option>
            ${Object.entries(LocationRules.TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select></label>
          <label class="loc-field loc-span-2">Corps<textarea data-n="corps" rows="3"></textarea></label>
        </div>
        <button type="button" class="loc-btn" id="adAddTpl">Ajouter</button>
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
      body.querySelectorAll('[data-del]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          if (!confirm('Supprimer ?')) return;
          try {
            await LocationData.deleteTemplate(btn.closest('[data-id]').dataset.id);
            render();
          } catch (e) {
            showMsg(e.message, true);
          }
        });
      });
      body.querySelector('#adAddTpl').addEventListener('click', async () => {
        const box = body.querySelector('#adNewTpl');
        const titre = box.querySelector('[data-n=titre]').value.trim();
        const motif = box.querySelector('[data-n=motif]').value.trim();
        if (!titre || !motif) return showMsg('Titre et motif requis', true);
        try {
          await LocationData.upsertTemplate({
            titre,
            motif,
            type_appareil: box.querySelector('[data-n=type_appareil]').value || null,
            corps: box.querySelector('[data-n=corps]').value,
            actif: true,
          });
          showMsg('Ajouté.');
          render();
        } catch (e) {
          showMsg(e.message, true);
        }
      });
    }

    await render();
  }

  global.LocationAdmin = { open };
})(window);
