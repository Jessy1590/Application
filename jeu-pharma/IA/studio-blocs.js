/**
 * Studio « IA » — texte / PDF de cours -> blocs brouillon d’une leçon.
 *
 * Contrat avec `js/studio-parcours.js` (hook mince) :
 *   JpStudioIA.open({
 *     module,          // leçon courante { id, titre, resume, … }
 *     getBlocs(),      // blocs courants (module_blocs)
 *     flush(),         // Promise : enregistre les brouillons en attente
 *     rpc(name, args), // RPC jeupharma (client anon + session admin)
 *     refresh(),       // Promise : recharge + repeint les blocs
 *   })
 *
 * Les blocs créés suivent le flux studio : `visible = false` + `payload_json._brouillon = { titre, payload }`
 * (contenu publié vide) ; ils n’apparaissent aux joueurs qu’après « Publier tout le parcours ».
 * Schéma JSON renvoyé par l’IA : voir IA/README.md.
 */
(function (global) {
  const TYPE_LABELS = {
    texte: 'Texte', conseil: 'Conseil', recommandation: 'Recommandation',
    photo: 'Photo', video: 'Vidéo', molecule: 'Molécules',
  };

  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }

  /* ——— Sanitisation HTML (liste blanche, sans attributs) ——— */

  const ALLOWED = new Set(['P', 'H2', 'H3', 'UL', 'OL', 'LI', 'STRONG', 'EM', 'U', 'BR']);
  const RENAME = { B: 'STRONG', I: 'EM', H1: 'H2', H4: 'H3', H5: 'H3', H6: 'H3' };
  const DROP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'IMG', 'SVG', 'LINK', 'META']);

  function cleanNode(node, doc) {
    const out = doc.createDocumentFragment();
    node.childNodes.forEach((ch) => {
      if (ch.nodeType === 3) { out.appendChild(doc.createTextNode(ch.textContent)); return; }
      if (ch.nodeType !== 1) return;
      let tag = ch.tagName;
      if (DROP.has(tag)) return;
      if (RENAME[tag]) tag = RENAME[tag];
      if (ALLOWED.has(tag)) {
        const el = doc.createElement(tag.toLowerCase());
        el.appendChild(cleanNode(ch, doc));
        out.appendChild(el);
      } else {
        out.appendChild(cleanNode(ch, doc)); // balise inconnue : on garde le texte
      }
    });
    return out;
  }

  function sanitizeHtml(html) {
    const doc = new DOMParser().parseFromString('<body>' + String(html || '') + '</body>', 'text/html');
    const wrap = doc.createElement('div');
    wrap.appendChild(cleanNode(doc.body, doc));
    const res = wrap.innerHTML.trim();
    return res || '<p></p>';
  }

  const safeHttps = (u) => (global.JpBlocPhoto ? global.JpBlocPhoto.safeUrl(u) : (/^https:\/\/\S+$/i.test(String(u || '').trim()) ? String(u).trim() : ''));

  /* ——— Schéma -> payload studio ——— */

  /** Contenu publié vide (le vrai contenu vit dans `_brouillon`). */
  function emptyPayload(type) {
    if (type === 'texte') return { html: '<p></p>' };
    if (type === 'conseil') return { pathologie: '', corps_html: '<p></p>' };
    if (type === 'recommandation') {
      return { corps_html: '<p></p>', lien_bloc_id: '', lien_module_id: '', lien_parcours_id: '', lien_href: '', lien_label: '' };
    }
    if (type === 'molecule') return { matrice_ids: [], mode: 'fiche' };
    if (type === 'photo') return { path: '', url: '', alt: '', legende: '' };
    return { url: '' };
  }

  /**
   * @param {object} b bloc IA (voir README)
   * @param {Map<string,string>} molByDci dci (minuscule) -> matrice_id
   * @returns {{ type: string, titre: string, payload: object }|null}
   */
  function toDraft(b, molByDci) {
    if (!b || !TYPE_LABELS[b.type]) return null;
    const titre = String(b.titre || '').trim().slice(0, 120);
    if (b.type === 'texte') {
      return { type: 'texte', titre, payload: { html: sanitizeHtml(b.html) } };
    }
    if (b.type === 'conseil') {
      return { type: 'conseil', titre, payload: { pathologie: String(b.pathologie || '').trim().slice(0, 160), corps_html: sanitizeHtml(b.corps_html) } };
    }
    if (b.type === 'recommandation') {
      return {
        type: 'recommandation',
        titre,
        payload: {
          corps_html: sanitizeHtml(b.corps_html),
          lien_bloc_id: '', // résolu après insertion (lien_bloc_index)
          lien_module_id: '',
          lien_parcours_id: '',
          lien_href: safeHttps(b.lien_href),
          lien_label: String(b.lien_label || '').trim().slice(0, 120),
        },
      };
    }
    if (b.type === 'photo') {
      return {
        type: 'photo',
        titre: titre || 'Photo à compléter',
        payload: { path: '', url: safeHttps(b.url), alt: String(b.alt || '').slice(0, 300), legende: String(b.legende || '').slice(0, 300) },
      };
    }
    if (b.type === 'video') {
      const url = String(b.url || '').trim();
      if (!/^https:\/\/\S+$/i.test(url)) return null;
      return { type: 'video', titre, payload: { url } };
    }
    if (b.type === 'molecule') {
      const ids = [];
      (Array.isArray(b.dci) ? b.dci : []).forEach((d) => {
        const id = molByDci.get(String(d || '').trim().toLowerCase());
        if (id && ids.indexOf(id) === -1) ids.push(id);
      });
      if (!ids.length) return null; // jamais de molécule hors publications de la leçon
      return { type: 'molecule', titre, payload: { matrice_ids: ids, matrice_id: ids[0], mode: 'fiche' } };
    }
    return null;
  }

  /* ——— Contexte leçon (molécules publiées sur la leçon) ——— */

  async function lessonMolecules(moduleId) {
    const sb = global.JpApp.sbJeu();
    const { data, error } = await sb
      .from('publications_connaissances')
      .select('connaissances!inner(matrice_id)')
      .eq('module_id', moduleId)
      .eq('actif', true);
    if (error) throw error;
    const ids = [];
    (data || []).forEach((p) => {
      const id = p.connaissances && p.connaissances.matrice_id;
      if (id && ids.indexOf(id) === -1) ids.push(id);
    });
    if (!ids.length) return [];
    const { data: rows, error: e2 } = await sb.from('v_medicaments_complet').select('id, dci').in('id', ids);
    if (e2) throw e2;
    return (rows || []).filter((r) => r.dci).map((r) => ({ id: r.id, dci: r.dci }));
  }

  /* ——— Insertion des brouillons ——— */

  async function insertDrafts(host, drafts, iaBlocs) {
    const m = host.module;
    const existing = host.getBlocs().slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0));
    const nonJeu = existing.filter((b) => b.type_bloc !== 'jeu');
    const jeux = existing.filter((b) => b.type_bloc === 'jeu');
    const base = nonJeu.reduce((mx, b) => Math.max(mx, b.ordre || 0), 0);

    const created = []; // { row, draft, srcIndex }
    for (let i = 0; i < drafts.length; i += 1) {
      const d = drafts[i].draft;
      const pj = Object.assign({}, emptyPayload(d.type), { _brouillon: { titre: d.titre, payload: d.payload } });
      const row = await host.rpc('v2_upsert_bloc', {
        p_payload: {
          module_id: m.id,
          type_bloc: d.type,
          ordre: base + (i + 1) * 10,
          payload_json: pj,
          visible: false,
        },
      });
      created.push({ row, draft: d, srcIndex: drafts[i].srcIndex });
      if (global.JpIaStudioProgress) global.JpIaStudioProgress(i + 1, drafts.length);
    }

    // Recommandations : lien_bloc_index (index dans la liste IA) -> id du bloc créé
    const idBySrc = new Map(created.map((c) => [c.srcIndex, c.row.id]));
    for (const c of created) {
      if (c.draft.type !== 'recommandation') continue;
      const idx = iaBlocs[c.srcIndex] && iaBlocs[c.srcIndex].lien_bloc_index;
      const target = Number.isInteger(idx) && idx !== c.srcIndex ? idBySrc.get(idx) : null;
      if (!target) continue;
      const payload = Object.assign({}, c.draft.payload, { lien_bloc_id: target });
      const pj = Object.assign({}, c.row.payload_json, { _brouillon: { titre: c.draft.titre, payload } });
      await host.rpc('v2_upsert_bloc', { p_payload: { id: c.row.id, payload_json: pj } });
    }

    // Blocs jeu en fin de leçon : on les garde après les nouveaux blocs
    const lastNew = base + drafts.length * 10;
    if (jeux.some((j) => (j.ordre || 0) <= lastNew)) {
      const ids = nonJeu.map((b) => b.id).concat(created.map((c) => c.row.id), jeux.map((b) => b.id));
      await host.rpc('v2_reorder_blocs', { p_module_id: m.id, p_ids: ids });
    }
    return created.length;
  }

  /* ——— Prompt système (ia_config.blocs_system) ——— */

  /**
   * Charge `blocs_system`, édite dans une modale, puis upsert après confirmation explicite.
   * Le suffixe progression ★1–★5 (PROGRESSION_SUFFIX) reste appliqué côté Edge.
   */
  async function editBasePrompt() {
    const jeu = global.JpApp.sbJeu();
    let valeur = '';
    try {
      const { data, error } = await jeu
        .from('ia_config')
        .select('valeur')
        .eq('cle', 'blocs_system')
        .maybeSingle();
      if (error) throw error;
      valeur = (data && data.valeur) != null ? String(data.valeur) : '';
    } catch (e) {
      global.JpToast?.fromError?.(e);
      return;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'jp-modal-backdrop jp-ia-prompt-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'iaPromptTitle');
    let closed = false;
    let busy = false;

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      backdrop.remove();
    }
    function onKey(e) {
      if (e.key !== 'Escape' || busy) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    }
    document.addEventListener('keydown', onKey, true);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && !busy) close();
    });

    function renderEdit() {
      backdrop.innerHTML = '<div class="jp-modal jp-ia-prompt-modal">'
        + '<h2 id="iaPromptTitle">Prompt système IA</h2>'
        + '<p class="jp-ia-lead">Éditez le prompt de base (<code>blocs_system</code>). '
        + 'Le suffixe de progression ★1–★5 reste appliqué côté serveur à chaque appel.</p>'
        + '<div class="jp-field"><label for="iaPromptBase">Prompt de base</label>'
        + '<textarea id="iaPromptBase" rows="18" spellcheck="false"></textarea></div>'
        + '<div class="jp-modal-actions">'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-act="cancel">Annuler</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" data-act="save">Enregistrer</button>'
        + '</div></div>';
      const ta = backdrop.querySelector('#iaPromptBase');
      ta.value = valeur;
      backdrop.querySelector('[data-act="cancel"]').addEventListener('click', () => close());
      backdrop.querySelector('[data-act="save"]').addEventListener('click', () => {
        const next = String(ta.value || '');
        if (!next.trim()) {
          global.JpToast?.warn?.('Le prompt ne peut pas être vide');
          ta.focus();
          return;
        }
        valeur = next;
        renderConfirm();
      });
      setTimeout(() => ta.focus(), 0);
    }

    function renderConfirm() {
      backdrop.innerHTML = '<div class="jp-modal jp-ia-prompt-confirm">'
        + '<h2 id="iaPromptTitle">Confirmation</h2>'
        + '<p>Confirmer la modification du prompt système IA ?</p>'
        + '<p class="jp-muted">Le suffixe de progression ★1–★5 reste appliqué côté serveur '
        + 'et n’est pas modifiable ici.</p>'
        + '<div class="jp-modal-actions">'
        + '<button type="button" class="jp-btn jp-btn-ghost" data-act="back">Retour</button>'
        + '<button type="button" class="jp-btn jp-btn-primary" data-act="confirm">Confirmer</button>'
        + '</div></div>';
      backdrop.querySelector('[data-act="back"]').addEventListener('click', () => {
        if (!busy) renderEdit();
      });
      backdrop.querySelector('[data-act="confirm"]').addEventListener('click', () => void doSave());
      setTimeout(() => backdrop.querySelector('[data-act="confirm"]')?.focus(), 0);
    }

    async function doSave() {
      if (busy) return;
      busy = true;
      const btn = backdrop.querySelector('[data-act="confirm"]');
      const back = backdrop.querySelector('[data-act="back"]');
      if (btn) btn.disabled = true;
      if (back) back.disabled = true;
      try {
        const user = await global.JpApp.getUser();
        const { error } = await jeu.from('ia_config').upsert({
          cle: 'blocs_system',
          valeur,
          updated_by: user?.id || null,
        }, { onConflict: 'cle' });
        if (error) throw error;
        void global.JpLogs?.action?.('ia_config_blocs_system', { length: valeur.length });
        global.JpToast?.ok?.('Prompt système enregistré');
        close();
      } catch (e) {
        busy = false;
        if (btn) btn.disabled = false;
        if (back) back.disabled = false;
        global.JpToast?.fromError?.(e);
      }
    }

    document.body.appendChild(backdrop);
    renderEdit();
  }

  /* ——— Modale ——— */

  function open(host) {
    const m = host && host.module;
    if (!m || m.est_groupe) { global.JpToast?.warn?.('Choisir une leçon'); return; }
    const G = global.JpIaGemini;

    const backdrop = document.createElement('div');
    backdrop.className = 'jp-modal-backdrop jp-ia-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.innerHTML = '<div class="jp-modal jp-ia-modal">'
      + '<h2>IA — créer des blocs depuis un cours</h2>'
      + '<p class="jp-ia-lead">Collez le texte du cours <strong>ou</strong> importez un PDF (export PowerPoint / Docs). '
      + 'L’IA propose des blocs <strong>en brouillon</strong> pour « ' + esc(m.titre) + ' » ; vous relisez avant « Publier tout le parcours ».</p>'
      + '<div class="jp-field"><label for="iaText">Texte du cours</label>'
      + '<textarea id="iaText" rows="9" maxlength="' + G.TEXT_MAX_CHARS + '" placeholder="Collez ici le contenu de la leçon…"></textarea></div>'
      + '<div class="jp-field"><label for="iaPdf">… ou PDF (10 Mo max)</label>'
      + '<input id="iaPdf" type="file" accept="application/pdf,.pdf"></div>'
      + '<p class="jp-field-hint jp-ia-privacy">Le contenu est envoyé à Google Gemini via une fonction sécurisée. '
      + 'Pas de données patient. Molécules : uniquement celles déjà publiées sur la leçon ; images et vidéos : à compléter si absentes du support.</p>'
      + '<p class="jp-field-hint jp-ia-prompt-entry">'
      + '<button type="button" class="jp-link-btn" id="iaEditPrompt">Modifier le prompt de base</button></p>'
      + '<div class="jp-ia-status" id="iaStatus" role="status" aria-live="polite" hidden></div>'
      + '<div class="jp-ia-result" id="iaResult" hidden></div>'
      + '<div class="jp-modal-actions">'
      + '<button type="button" class="jp-btn jp-btn-ghost" id="iaCancel">Fermer</button>'
      + '<button type="button" class="jp-btn jp-btn-primary" id="iaRun">Générer les blocs</button>'
      + '</div></div>';
    document.body.appendChild(backdrop);

    backdrop.querySelector('#iaEditPrompt')?.addEventListener('click', () => {
      void editBasePrompt();
    });

    const $ = (id) => backdrop.querySelector('#' + id);
    const status = $('iaStatus');
    const result = $('iaResult');
    const runBtn = $('iaRun');
    let busy = false;
    let closed = false;
    let timer = null;
    let started = 0;

    function close() {
      closed = true;
      clearInterval(timer);
      document.removeEventListener('keydown', onKey);
      global.JpIaStudioProgress = null;
      backdrop.remove();
    }
    function onKey(e) {
      if (e.key !== 'Escape' || busy) return;
      if (document.querySelector('.jp-ia-prompt-backdrop')) return;
      close();
    }
    document.addEventListener('keydown', onKey);
    $('iaCancel').addEventListener('click', () => { close(); });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop && !busy) close(); });

    function setStatus(msg, kind) {
      status.hidden = !msg;
      status.className = 'jp-ia-status' + (kind ? ' is-' + kind : '');
      status.textContent = msg || '';
    }
    function startTimer(label) {
      clearInterval(timer);
      started = Date.now();
      const tick = () => { setStatus(label + ' ' + Math.round((Date.now() - started) / 1000) + ' s', 'busy'); };
      tick();
      timer = setInterval(tick, 1000);
    }

    runBtn.addEventListener('click', async () => {
      if (busy) return;
      const text = $('iaText').value.trim();
      const file = $('iaPdf').files && $('iaPdf').files[0];
      result.hidden = true;
      if (!text && !file) { setStatus('Collez du texte ou choisissez un PDF.', 'error'); return; }
      if (file && !/pdf$/i.test(file.type || file.name)) { setStatus('Le fichier doit être un PDF.', 'error'); return; }
      if (file && file.size > G.PDF_MAX_BYTES) { setStatus('PDF trop lourd (10 Mo maximum).', 'error'); return; }

      busy = true;
      runBtn.disabled = true;
      $('iaCancel').disabled = true;
      try {
        await host.flush();
        setStatus('Préparation…', 'busy');
        const mols = await lessonMolecules(m.id).catch(() => []);
        const molByDci = new Map(mols.map((x) => [x.dci.trim().toLowerCase(), x.id]));
        const body = {
          text: text || undefined,
          pdfBase64: file ? await G.fileToBase64(file) : undefined,
          pdfName: file ? file.name : undefined,
          context: {
            titre: m.titre,
            resume: m.resume || '',
            molecules: mols.map((x) => x.dci),
            blocs_existants: host.getBlocs().map((b) => ({ type: b.type_bloc, titre: b.titre || '' })),
          },
        };
        startTimer('Analyse par l’IA (30 à 120 s pour un PDF)…');
        const ia = await G.invoke(G.FN_BLOCS, body);
        clearInterval(timer);
        if (closed) return;

        const iaBlocs = Array.isArray(ia && ia.blocs) ? ia.blocs : [];
        const drafts = [];
        iaBlocs.forEach((b, srcIndex) => {
          const d = toDraft(b, molByDci);
          if (d) drafts.push({ draft: d, srcIndex });
        });
        if (!drafts.length) throw new Error('L’IA n’a proposé aucun bloc exploitable.');

        global.JpIaStudioProgress = (n, total) => setStatus('Création des brouillons ' + n + ' / ' + total + '…', 'busy');
        setStatus('Création des brouillons…', 'busy');
        const n = await insertDrafts(host, drafts, iaBlocs);
        await host.refresh();
        void global.JpLogs?.action?.('studio_ia_blocs', {
          module_id: m.id, source: file ? 'pdf' : 'texte', count: n, model: ia.model || null,
        });

        const counts = {};
        drafts.forEach((x) => { counts[x.draft.type] = (counts[x.draft.type] || 0) + 1; });
        const summary = Object.keys(counts).map((t) => counts[t] + ' ' + TYPE_LABELS[t].toLowerCase()).join(' · ');
        const skipped = iaBlocs.length - drafts.length;
        const warns = (Array.isArray(ia.avertissements) ? ia.avertissements : []).slice(0, 8);
        const needPhoto = drafts.filter((x) => x.draft.type === 'photo' && !x.draft.payload.url).length;
        setStatus('', '');
        result.hidden = false;
        result.innerHTML = '<p class="jp-ia-ok">✓ ' + n + ' bloc' + (n > 1 ? 's' : '') + ' ajouté' + (n > 1 ? 's' : '')
          + ' en brouillon (' + esc(summary) + ').</p>'
          + (needPhoto ? '<p class="jp-field-hint">' + needPhoto + ' bloc(s) photo à compléter (téléverser l’image).</p>' : '')
          + (skipped > 0 ? '<p class="jp-field-hint">' + skipped + ' bloc(s) ignoré(s) (molécule absente de la leçon, lien invalide…).</p>' : '')
          + (warns.length ? '<ul class="jp-ia-warns">' + warns.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '')
          + '<p class="jp-field-hint">Relisez puis cliquez « Publier tout le parcours » pour les rendre visibles.</p>';
        global.JpToast?.ok?.(n + ' bloc(s) IA en brouillon');
        runBtn.textContent = 'Générer à nouveau';
      } catch (e) {
        clearInterval(timer);
        if (!closed) setStatus((e && e.message) || 'Erreur IA', 'error');
        // si des blocs ont été partiellement créés, on resynchronise l’affichage
        try { await host.refresh(); } catch (_) { /* silencieux */ }
      } finally {
        busy = false;
        global.JpIaStudioProgress = null;
        if (!closed) {
          runBtn.disabled = false;
          $('iaCancel').disabled = false;
        }
      }
    });

    setTimeout(() => $('iaText').focus(), 0);
  }

  global.JpStudioIA = { open, editBasePrompt, sanitizeHtml, toDraft, emptyPayload, TYPE_LABELS };
})(window);
