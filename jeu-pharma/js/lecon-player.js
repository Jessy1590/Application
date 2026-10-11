/**
 * Lecteur de leçon (blocs).
 */
(function (global) {
  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }

  function videoEmbed(url) {
    if (!url) return '';
    const u = String(url).trim();
    let src = '';
    const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,})/i);
    if (yt) src = 'https://www.youtube.com/embed/' + yt[1];
    const vim = u.match(/vimeo\.com\/(\d+)/i);
    if (vim) src = 'https://player.vimeo.com/video/' + vim[1];
    if (!src && /\.(mp4|webm)(\?|$)/i.test(u)) {
      return '<video controls src="' + esc(u) + '"></video>';
    }
    if (!src) return '';
    return '<div class="jp-video-wrap"><iframe src="' + esc(src)
      + '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>';
  }

  function sanitizeHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html || '';
    tmp.querySelectorAll('script,iframe,object,embed').forEach((n) => n.remove());
    const SAFE_COLOR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*[\d.]+\s*)?\)|[a-z]{3,20})$/i;
    tmp.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((a) => {
        if (/^on/i.test(a.name) || (a.name === 'href' && /^javascript:/i.test(a.value))) {
          el.removeAttribute(a.name);
        } else if (a.name === 'style') {
          // Seule la couleur du texte est conservée (palette de l’éditeur studio)
          const m = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(a.value);
          const val = m ? m[1].trim() : '';
          if (val && SAFE_COLOR.test(val)) el.setAttribute('style', 'color:' + val);
          else el.removeAttribute('style');
        } else if (a.name === 'color' && !SAFE_COLOR.test(a.value.trim())) {
          el.removeAttribute('color');
        }
      });
    });
    return tmp.innerHTML;
  }

  /** Charge publiée = clés sans « _ » (les clés « _brouillon » / « _nouveau » sont réservées au studio). */
  function publishedPayload(p) {
    const out = {};
    Object.keys(p || {}).forEach((k) => { if (k.charAt(0) !== '_') out[k] = p[k]; });
    return out;
  }

  /** Aperçu admin : applique le brouillon par-dessus le contenu publié. */
  function withDraft(b) {
    const d = b.payload_json && b.payload_json._brouillon;
    const base = publishedPayload(b.payload_json);
    if (!d) return Object.assign({}, b, { payload_json: base });
    return Object.assign({}, b, {
      titre: Object.prototype.hasOwnProperty.call(d, 'titre') ? d.titre : b.titre,
      payload_json: Object.assign(base, d.payload || {}),
    });
  }

  function matriceIds(p) {
    if (Array.isArray(p.matrice_ids) && p.matrice_ids.length) return p.matrice_ids.filter(Boolean);
    return p.matrice_id ? [p.matrice_id] : [];
  }

  async function boot(root, moduleId, preview) {
    const { data, error } = await sb().rpc('v2_lecon_joueur', {
      p_module_id: moduleId,
      p_preview: !!preview,
    });
    if (error) throw error;
    const module = data.module || {};
    let blocs = data.blocs || [];
    if (preview) {
      // Aperçu admin : tous les blocs (y compris brouillons) avec le contenu brouillon
      const all = await sb().rpc('v2_lister_blocs', { p_module_id: moduleId });
      if (all.error) throw all.error;
      blocs = (Array.isArray(all.data) ? all.data : []).map(withDraft);
    } else {
      blocs = blocs.map((b) => Object.assign({}, b, { payload_json: publishedPayload(b.payload_json) }));
    }
    document.title = (module.titre || 'Leçon') + ' — Jeu Pharma';

    let html = '<h1 class="jp-player-brand">' + esc(module.titre || '') + '</h1>';
    if (!blocs.length) {
      html += '<p class="jp-muted">—</p>';
    }
    for (const b of blocs) {
      const p = b.payload_json || {};
      html += '<article class="jp-lecon-block">';
      if (b.titre) html += '<h2>' + esc(b.titre) + '</h2>';
      if (b.type_bloc === 'texte') {
        html += '<div class="jp-rich">' + sanitizeHtml(p.html || '') + '</div>';
      } else if (b.type_bloc === 'video') {
        html += videoEmbed(p.url);
      } else if (b.type_bloc === 'conseil') {
        html += '<p><strong>' + esc(p.pathologie || '') + '</strong></p>'
          + '<div class="jp-rich">' + sanitizeHtml(p.corps_html || '') + '</div>';
      } else if (b.type_bloc === 'molecule' && matriceIds(p).length) {
        html += matriceIds(p).map((id) => '<div data-mol="' + esc(id) + '" class="jp-mol-slot">…</div>').join('');
      } else if (b.type_bloc === 'jeu') {
        const code = p.code_unique || '';
        const href = code
          ? (String(code).includes('O') && /INTO|ORDO/i.test(code)
            ? 'ordonnances/jouer.html?code=' + encodeURIComponent(code)
            : 'jeux/jouer.html?code=' + encodeURIComponent(code))
          : 'jeux/index.html';
        // Fix path: lecon is at root
        const playHref = code
          ? 'jeux/jouer.html?code=' + encodeURIComponent(code)
          : 'jeux/index.html';
        html += '<a class="jp-btn jp-btn-primary jp-btn-touch" href="' + playHref + '">'
          + esc(p.libelle_cta || 'Jouer') + '</a>';
        if (code) html += ' <code>' + esc(code) + '</code>';
      }
      html += '</article>';
    }
    root.innerHTML = html;

    const slots = root.querySelectorAll('[data-mol]');
    for (const slot of slots) {
      const id = slot.getAttribute('data-mol');
      try {
        const fiche = await global.JpV2Resolver.ficheResolue(id, {
          parcoursId: module.parcours_id,
          moduleIds: [module.id],
        });
        if (!fiche) {
          slot.textContent = '—';
          continue;
        }
        const champs = fiche.champs || {};
        let body = '<strong>' + esc(fiche.dci || '') + '</strong>';
        const noms = (fiche.noms_commerciaux || []).map((n) => n.valeur).filter(Boolean);
        if (noms.length) body += '<p class="jp-muted">' + esc(noms.join(', ')) + '</p>';
        body += '<dl>';
        Object.keys(champs).forEach((code) => {
          if (code === 'nom_commercial' || code === 'dci') return;
          const vals = (champs[code] || []).map((x) => x.valeur).filter(Boolean);
          if (!vals.length) return;
          body += '<dt>' + esc(code) + '</dt><dd>' + esc(vals.join(' · ')) + '</dd>';
        });
        body += '</dl>';
        slot.innerHTML = body;
      } catch (_) {
        slot.textContent = '—';
      }
    }
  }

  global.JpLeconPlayer = { boot };
})(window);
