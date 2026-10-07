/**
 * Signalement bugs / améliorations (sheet) + helpers admin — schéma jeupharma.bugs.
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

  function ensureSheet() {
    let sheet = document.getElementById('jpBugsSheet');
    if (sheet) return sheet;

    sheet = document.createElement('div');
    sheet.id = 'jpBugsSheet';
    sheet.className = 'jp-sheet no-print';
    sheet.hidden = true;
    sheet.innerHTML = `
      <div class="jp-sheet-backdrop" data-jp-bugs-close></div>
      <div class="jp-sheet-panel" role="dialog" aria-labelledby="jpBugsTitle" aria-modal="true">
        <div class="jp-sheet-head">
          <h2 id="jpBugsTitle">Signalement</h2>
          <button type="button" class="jp-icon-btn" data-jp-bugs-close aria-label="Fermer">✕</button>
        </div>
        <form id="jpBugsForm" class="jp-bugs-form" autocomplete="off">
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
          <button type="submit" class="jp-btn jp-btn-primary" style="width:100%">Envoyer</button>
          <p class="jp-bugs-msg" id="jpBugsMsg" hidden></p>
        </form>
      </div>
    `;
    document.body.appendChild(sheet);

    sheet.querySelectorAll('[data-jp-bugs-close]').forEach((n) => {
      n.addEventListener('click', () => { sheet.hidden = true; });
    });

    document.getElementById('jpBugsForm').addEventListener('submit', onSubmit);
    return sheet;
  }

  async function onSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const msg = document.getElementById('jpBugsMsg');
    const fd = new FormData(form);
    const titre = String(fd.get('titre') || '').trim();
    const description = String(fd.get('description') || '').trim();
    const type = String(fd.get('type') || 'bug');
    if (!TYPES.includes(type)) return;

    msg.hidden = true;

    try {
      const app = global.JpApp;
      if (!app) throw new Error('JpApp manquant');
      const user = await app.getUser();
      const sb = app.sbJeu();
      const { error } = await sb.from('bugs').insert({
        type,
        titre,
        description,
        statut: 'nouveau',
        page_path: `${location.pathname}${location.search || ''}`.slice(0, 500),
        created_by: user?.id || null,
      });

      if (error) {
        msg.hidden = false;
        msg.textContent = error.message;
        msg.className = 'jp-bugs-msg error';
        global.JpToast?.fromError?.(error);
        return;
      }

      form.reset();
      msg.hidden = false;
      msg.textContent = 'Signalement envoyé.';
      msg.className = 'jp-bugs-msg ok';
      global.JpToast?.ok?.('Signalement envoyé');
      try {
        void global.JpLogs?.action?.('bug_report', { type, titre });
      } catch (_) { /* ignore */ }
    } catch (err) {
      msg.hidden = false;
      msg.textContent = err.message || String(err);
      msg.className = 'jp-bugs-msg error';
      global.JpToast?.fromError?.(err);
    }
  }

  function open() {
    const sheet = ensureSheet();
    const msg = document.getElementById('jpBugsMsg');
    if (msg) msg.hidden = true;
    sheet.hidden = false;
  }

  /**
   * Liste (admin : tout ; joueur : ses signalements — RLS).
   * @param {{ statut?: string, type?: string, limit?: number, offset?: number }} [opts]
   */
  async function list(opts = {}) {
    const app = global.JpApp;
    if (!app) throw new Error('JpApp manquant');
    const sb = app.sbJeu();
    const limit = Math.min(Number(opts.limit) || 100, 500);
    const offset = Math.max(Number(opts.offset) || 0, 0);
    let q = sb
      .from('bugs')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (opts.statut) q = q.eq('statut', opts.statut);
    if (opts.type) q = q.eq('type', opts.type);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  /**
   * Mise à jour statut (admin — RLS).
   * @param {string} id
   * @param {string} statut
   */
  async function updateStatut(id, statut) {
    if (!id || !STATUTS.includes(statut)) {
      throw new Error('Statut invalide');
    }
    const app = global.JpApp;
    if (!app) throw new Error('JpApp manquant');
    const sb = app.sbJeu();
    const { data, error } = await sb
      .from('bugs')
      .update({ statut })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  global.JpBugs = {
    open,
    list,
    updateStatut,
    STATUTS,
    TYPES,
    STATUT_LABELS,
    TYPE_LABELS,
  };
})(window);
