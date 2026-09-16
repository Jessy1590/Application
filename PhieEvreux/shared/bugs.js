/**
 * Signalement bugs / améliorations + liste admin.
 */
(function (global) {
  const STATUTS = ['nouveau', 'en_cours', 'modifie', 'impossible', 'annule'];
  const TYPES = ['bug', 'amelioration'];

  const STATUT_LABELS = {
    nouveau: 'Nouveau',
    en_cours: 'En cours',
    modifie: 'Modifié',
    impossible: 'Impossible',
    annule: 'Annulé',
  };

  const TYPE_LABELS = {
    bug: 'Bug',
    amelioration: 'Amélioration',
  };

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function ensureSheet() {
    let sheet = document.getElementById('phieBugsSheet');
    if (sheet) return sheet;

    sheet = document.createElement('div');
    sheet.id = 'phieBugsSheet';
    sheet.className = 'phie-sheet';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="phie-sheet-backdrop" data-phie-bugs-close></div>
      <div class="phie-sheet-panel" role="dialog" aria-labelledby="phieBugsTitle">
        <div class="phie-sheet-head">
          <h2 id="phieBugsTitle">Signalement</h2>
          <button type="button" class="phie-icon-btn" data-phie-bugs-close aria-label="Fermer">✕</button>
        </div>
        <div class="phie-bugs-tabs" id="phieBugsTabs" hidden>
          <button type="button" class="phie-bugs-tab active" data-phie-bugs-tab="new">Nouveau</button>
          <button type="button" class="phie-bugs-tab" data-phie-bugs-tab="list">Gestion</button>
        </div>
        <div id="phieBugsNewPane">
          <form id="phieBugsForm" class="phie-bugs-form" autocomplete="off">
            <label>Type
              <select name="type" required>
                <option value="bug">Bug</option>
                <option value="amelioration">Amélioration</option>
              </select>
            </label>
            <label>Titre
              <input name="titre" required maxlength="120" placeholder="Résumé court">
            </label>
            <label>Description
              <textarea name="description" rows="4" required placeholder="Détails, étapes…"></textarea>
            </label>
            <button type="submit" class="phie-btn phie-btn-primary">Envoyer</button>
            <p class="phie-bugs-msg" id="phieBugsMsg" hidden></p>
          </form>
        </div>
        <div id="phieBugsListPane" hidden>
          <div id="phieBugsList" class="phie-bugs-list"></div>
        </div>
      </div>
    `;
    document.body.appendChild(sheet);

    sheet.querySelectorAll('[data-phie-bugs-close]').forEach((n) => {
      n.addEventListener('click', () => { sheet.hidden = true; });
    });

    sheet.querySelectorAll('[data-phie-bugs-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.phieBugsTab;
        sheet.querySelectorAll('.phie-bugs-tab').forEach((b) => {
          b.classList.toggle('active', b.dataset.phieBugsTab === tab);
        });
        document.getElementById('phieBugsNewPane').hidden = tab !== 'new';
        document.getElementById('phieBugsListPane').hidden = tab !== 'list';
        if (tab === 'list') renderAdminList();
      });
    });

    document.getElementById('phieBugsForm').addEventListener('submit', onSubmit);
    return sheet;
  }

  let currentApp = 'hub';

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const msg = document.getElementById('phieBugsMsg');
    const fd = new FormData(form);
    const titre = String(fd.get('titre') || '').trim();
    const description = String(fd.get('description') || '').trim();
    const type = String(fd.get('type') || 'bug');
    if (!TYPES.includes(type)) return;

    msg.hidden = true;
    const snap = global.PhieEquipe?.getSnapshot?.() || {};
    const sb = global.PhieEvreuxApps.createAppsClient();
    const { error } = await sb.from('bugs').insert({
      user_id: snap.userId || null,
      app: currentApp,
      type,
      titre,
      description,
      statut: 'nouveau',
    });

    if (error) {
      msg.hidden = false;
      msg.textContent = error.message;
      msg.className = 'phie-bugs-msg error';
      return;
    }
    form.reset();
    msg.hidden = false;
    msg.textContent = 'Signalement envoyé.';
    msg.className = 'phie-bugs-msg ok';
  }

  async function renderAdminList() {
    const list = document.getElementById('phieBugsList');
    if (!list) return;
    list.innerHTML = '<p class="phie-muted">Chargement…</p>';
    const sb = global.PhieEvreuxApps.createAppsClient();
    const { data, error } = await sb
      .from('bugs')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      list.innerHTML = `<p class="phie-bugs-msg error">${escapeHtml(error.message)}</p>`;
      return;
    }
    if (!data?.length) {
      list.innerHTML = '<p class="phie-muted">Aucun signalement.</p>';
      return;
    }
    list.innerHTML = data.map((b) => `
      <article class="phie-bug-card" data-id="${escapeHtml(b.id)}">
        <div class="phie-bug-card-head">
          <strong>${escapeHtml(b.titre)}</strong>
          <span class="phie-bug-tag">${escapeHtml(TYPE_LABELS[b.type] || b.type)}</span>
        </div>
        <p class="phie-muted tiny">${escapeHtml(b.app || '')} · ${escapeHtml(new Date(b.created_at).toLocaleString('fr-FR'))}</p>
        <p class="phie-bug-desc">${escapeHtml(b.description || '')}</p>
        <label>Statut
          <select data-bug-statut>
            ${STATUTS.map((s) =>
              `<option value="${s}" ${b.statut === s ? 'selected' : ''}>${STATUT_LABELS[s]}</option>`
            ).join('')}
          </select>
        </label>
        <label>Commentaire admin
          <textarea data-bug-comment rows="2">${escapeHtml(b.commentaire_admin || '')}</textarea>
        </label>
        <button type="button" class="phie-btn phie-btn-secondary" data-bug-save>Enregistrer</button>
      </article>
    `).join('');

    list.querySelectorAll('[data-bug-save]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.phie-bug-card');
        const id = card.dataset.id;
        const statut = card.querySelector('[data-bug-statut]').value;
        const commentaire_admin = card.querySelector('[data-bug-comment]').value.trim() || null;
        btn.disabled = true;
        const { error: upErr } = await sb
          .from('bugs')
          .update({ statut, commentaire_admin, updated_at: new Date().toISOString() })
          .eq('id', id);
        btn.disabled = false;
        if (upErr) {
          alert(upErr.message);
          return;
        }
        btn.textContent = 'Enregistré';
        setTimeout(() => { btn.textContent = 'Enregistrer'; }, 1500);
      });
    });
  }

  /**
   * @param {{ app?: string }} [opts]
   */
  async function open(opts = {}) {
    currentApp = opts.app || 'hub';
    const sheet = ensureSheet();
    const canAdmin = global.PhieEquipe?.canManageBugs?.() === true;
    const tabs = document.getElementById('phieBugsTabs');
    tabs.hidden = !canAdmin;
    document.getElementById('phieBugsNewPane').hidden = false;
    document.getElementById('phieBugsListPane').hidden = true;
    tabs.querySelectorAll('.phie-bugs-tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.phieBugsTab === 'new');
    });
    document.getElementById('phieBugsMsg').hidden = true;
    sheet.hidden = false;
  }

  global.PhieBugs = {
    open,
    STATUTS,
    TYPES,
    STATUT_LABELS,
    TYPE_LABELS,
  };
})(window);
