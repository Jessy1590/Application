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
    tmp.querySelectorAll('*').forEach((el) => {
      [...el.attributes].forEach((a) => {
        if (/^on/i.test(a.name) || (a.name === 'href' && /^javascript:/i.test(a.value))) {
          el.removeAttribute(a.name);
        }
      });
    });
    return tmp.innerHTML;
  }

  async function boot(root, moduleId, preview) {
    const { data, error } = await sb().rpc('v2_lecon_joueur', {
      p_module_id: moduleId,
      p_preview: !!preview,
    });
    if (error) throw error;
    const module = data.module || {};
    const blocs = data.blocs || [];
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
      } else if (b.type_bloc === 'molecule' && p.matrice_id) {
        html += '<div data-mol="' + esc(p.matrice_id) + '" class="jp-mol-slot">…</div>';
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
