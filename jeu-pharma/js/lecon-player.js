/**
 * Lecteur de leçon (blocs) : blocs typés, carrousel de molécules, suivi de lecture,
 * critères de validation et bouton « Leçon suivante » (verrouillé tant que les conditions ne sont pas remplies).
 */
(function (global) {
  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }
  const PU = () => global.JpParcoursUi;

  function videoEmbed(url) {
    if (!url) return '';
    const u = String(url).trim();
    let src = '';
    const yt = u.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{6,})/i);
    if (yt) src = 'https://www.youtube.com/embed/' + yt[1];
    const vim = u.match(/vimeo\.com\/(\d+)/i);
    if (vim) src = 'https://player.vimeo.com/video/' + vim[1];
    if (!src && /\.(mp4|webm)(\?|$)/i.test(u)) {
      return '<div class="jp-video-wrap"><video controls src="' + esc(u) + '"></video></div>';
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

  const BLOC_META = {
    texte: { label: 'Texte', ico: '¶' },
    video: { label: 'Vidéo', ico: '▶' },
    photo: { label: 'Photo', ico: '▣' },
    conseil: { label: 'Conseil', ico: '✦' },
    recommandation: { label: 'Recommandation', ico: '→' },
    molecule: { label: 'Molécules', ico: '⬡' },
    jeu: { label: 'Jeu', ico: '◆' },
  };

  /** Lien in-app ou https pour un bloc recommandation (pas de pop-up). */
  function recoHref(p, module) {
    const blocId = (p.lien_bloc_id || '').trim();
    if (blocId) return '#jp-bloc-' + blocId;
    const modId = (p.lien_module_id || '').trim();
    if (modId) {
      let h = 'lecon.html?module=' + encodeURIComponent(modId);
      const parc = (p.lien_parcours_id || module.parcours_id || '').trim();
      if (parc) h += '&parcours=' + encodeURIComponent(parc);
      return h;
    }
    const href = (p.lien_href || '').trim();
    if (!href) return '';
    if (href.startsWith('#')) return href;
    if (/^(lecon|espace|parcours|jeux\/|catalogue|mon-espace)\.html/i.test(href) || href.startsWith('/')) return href;
    if (/^https:\/\//i.test(href)) return href;
    return '';
  }

  function champLibelle(code) {
    const c = (global.JpConstants?.CHAMP_CODES || []).find((x) => x.code === code);
    return c?.libelle || code;
  }

  function champRank(code) {
    const i = (global.JpConstants?.CHAMP_CODES || []).findIndex((x) => x.code === code);
    return i < 0 ? 999 : i;
  }

  /** Lien de jeu depuis une leçon (retour à la leçon après la partie). */
  function jeuHref(code, typeJeu, moduleId, parcoursId) {
    if (!code) return 'jeux/index.html';
    const q = '?code=' + encodeURIComponent(code)
      + (moduleId ? '&module=' + encodeURIComponent(moduleId) : '')
      + (parcoursId ? '&parcours=' + encodeURIComponent(parcoursId) : '');
    return (typeJeu === 'ordonnance' ? 'ordonnances/jouer.html' : 'jeux/jouer.html') + q;
  }

  function ficheHtml(fiche) {
    const champs = fiche.champs || {};
    let body = '<div class="jp-mol-head"><strong class="jp-mol-dci">' + esc(fiche.dci || '') + '</strong>';
    const noms = (fiche.noms_commerciaux || []).map((n) => n.valeur).filter(Boolean);
    if (noms.length) {
      body += '<div class="jp-chip-list jp-chip-list--noms">'
        + noms.map((n) => '<span class="jp-chip">' + esc(n) + '</span>').join('') + '</div>';
    }
    body += '</div>';
    const codes = Object.keys(champs)
      .filter((c) => c !== 'nom_commercial' && c !== 'dci')
      .sort((a, b) => champRank(a) - champRank(b));
    let dl = '';
    codes.forEach((code) => {
      const vals = (champs[code] || []).map((x) => x.valeur).filter(Boolean);
      if (!vals.length) return;
      dl += '<div class="jp-mol-row"><dt>' + esc(champLibelle(code)) + '</dt><dd>'
        + vals.map((v) => '<span class="jp-chip">' + esc(v) + '</span>').join('') + '</dd></div>';
    });
    if (dl) body += '<dl class="jp-mol-fields">' + dl + '</dl>';
    return body;
  }

  /* ——— Carrousel de molécules ——— */

  function carouselHtml(ids) {
    const n = ids.length;
    const slides = ids.map((id, i) => '<div class="jp-carousel-slide" role="group" aria-roledescription="diapositive" aria-label="'
      + (i + 1) + ' sur ' + n + '" data-mol="' + esc(id) + '"><div class="jp-mol-slot">…</div></div>').join('');
    if (n === 1) {
      return '<div class="jp-carousel is-single"><div class="jp-carousel-viewport"><div class="jp-carousel-track">' + slides + '</div></div></div>';
    }
    return '<div class="jp-carousel" tabindex="0" role="region" aria-roledescription="carrousel" aria-label="Molécules">'
      + '<div class="jp-carousel-bar"><span class="jp-carousel-count" aria-live="polite">1 / ' + n + '</span></div>'
      + '<button type="button" class="jp-carousel-arrow is-prev" aria-label="Molécule précédente">‹</button>'
      + '<div class="jp-carousel-viewport"><div class="jp-carousel-track">' + slides + '</div></div>'
      + '<button type="button" class="jp-carousel-arrow is-next" aria-label="Molécule suivante">›</button>'
      + '<div class="jp-carousel-dots">' + ids.map((_, i) => '<button type="button" class="jp-carousel-dot' + (i === 0 ? ' is-on' : '')
        + '" data-i="' + i + '" aria-label="Molécule ' + (i + 1) + '"></button>').join('') + '</div></div>';
  }

  function initCarousel(car) {
    const viewport = car.querySelector('.jp-carousel-viewport');
    const track = car.querySelector('.jp-carousel-track');
    const slides = Array.from(car.querySelectorAll('.jp-carousel-slide'));
    const prev = car.querySelector('.is-prev');
    const next = car.querySelector('.is-next');
    const count = car.querySelector('.jp-carousel-count');
    const dots = Array.from(car.querySelectorAll('.jp-carousel-dot'));
    let i = 0;

    function fit() {
      const h = slides[i] ? slides[i].offsetHeight : 0;
      if (h) viewport.style.height = h + 'px';
    }

    function go(n) {
      i = Math.max(0, Math.min(slides.length - 1, n));
      track.style.transform = 'translateX(' + (-100 * i) + '%)';
      slides.forEach((s, k) => {
        s.classList.toggle('is-active', k === i);
        s.setAttribute('aria-hidden', k === i ? 'false' : 'true');
      });
      dots.forEach((d, k) => d.classList.toggle('is-on', k === i));
      if (count) count.textContent = (i + 1) + ' / ' + slides.length;
      if (prev) prev.disabled = i === 0;
      if (next) next.disabled = i === slides.length - 1;
      fit();
    }

    if (prev) prev.addEventListener('click', () => go(i - 1));
    if (next) next.addEventListener('click', () => go(i + 1));
    dots.forEach((d) => d.addEventListener('click', () => go(Number(d.getAttribute('data-i')))));
    car.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); }
    });
    // Balayage tactile
    let x0 = null;
    viewport.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    viewport.addEventListener('touchend', (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 45) go(i + (dx < 0 ? 1 : -1));
    }, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => fit());
      slides.forEach((s) => ro.observe(s));
    }
    go(0);
    return { fit };
  }

  /* ——— Critères de validation / navigation ——— */

  function criteriaHtml(detail, moduleId, parcoursId) {
    if (!detail) return '';
    const rows = [];
    if (detail.lecture_requise) {
      if (detail.lu) {
        rows.push('<li class="is-ok"><span class="jp-crit-mark">✓</span><span>Leçon lue jusqu’en bas</span></li>');
      } else {
        const p = PU().clampPct(detail.lecture_pct);
        rows.push('<li><span class="jp-crit-mark">○</span><span>Lecture de la leçon : ' + p
          + ' % — faites défiler jusqu’en bas</span></li>');
      }
    }
    (detail.jeux || []).forEach((j) => {
      const min = PU().sur10(j.score_min_pct);
      const href = jeuHref(j.code_unique, j.type_jeu, moduleId, parcoursId);
      if (j.ok) {
        rows.push('<li class="is-ok"><span class="jp-crit-mark">✓</span><span>Jeu « ' + esc(j.titre) + ' » : '
          + esc(PU().sur10(j.meilleur_pct)) + ' <small>(minimum ' + esc(min) + ')</small></span></li>');
      } else {
        rows.push('<li><span class="jp-crit-mark">○</span><span>Jeu « ' + esc(j.titre) + ' » : minimum ' + esc(min)
          + (j.fait ? ' <small>(votre meilleur score : ' + esc(PU().sur10(j.meilleur_pct)) + ')</small>' : '')
          + ' <a class="jp-crit-play" href="' + esc(href) + '">Jouer</a></span></li>');
      }
    });
    if (!rows.length) return '';
    const ou = detail.logique === 'ou' && rows.length > 1
      ? '<p class="jp-crit-note">Un seul de ces critères suffit.</p>' : '';
    return '<section class="jp-valid' + (detail.valide ? ' is-done' : '') + '" aria-label="Validation de la leçon">'
      + '<h3>' + (detail.valide ? '✓ Leçon validée' : 'Pour valider cette leçon') + '</h3>'
      + '<ul class="jp-crit-list">' + rows.join('') + '</ul>' + ou + '</section>';
  }

  async function renderFooter(host, ctx) {
    const { module, preview } = ctx;
    let detail = ctx.detail;
    let prog = null;
    try {
      prog = await global.JpV2Resolver.progression(module.parcours_id);
    } catch (_) { /* navigation de repli ci-dessous */ }
    const leaves = prog ? PU().orderedLeaves(prog.modules || []) : [];
    const idx = leaves.findIndex((m) => m.id === module.id);
    const cur = idx >= 0 ? leaves[idx] : null;
    if (cur && cur.detail) detail = cur.detail;
    ctx.detail = detail;
    const next = idx >= 0 ? leaves[idx + 1] : null;
    const back = 'espace.html?parcours=' + encodeURIComponent(module.parcours_id || '');

    let nav = '';
    if (!next) {
      nav = '<a class="jp-btn jp-btn-ghost jp-btn-touch" href="' + back + '">Retour au parcours</a>'
        + (idx >= 0 ? '<p class="jp-lecon-nav-hint">Dernière leçon du parcours.</p>' : '');
    } else if (next.statut === 'verrouille' && !preview) {
      const msg = PU().messageSuivante(next.bloque_par, module.id, detail, module.titre)
        || 'Leçon suivante verrouillée.';
      nav = '<button type="button" class="jp-btn jp-btn-primary jp-btn-touch jp-lecon-next is-disabled" disabled aria-disabled="true" aria-describedby="leconNextHint">Leçon suivante →</button>'
        + '<p class="jp-lecon-nav-hint is-lock" id="leconNextHint" role="status">🔒 ' + esc(msg) + '</p>'
        + '<a class="jp-lecon-back" href="' + back + '">Retour au parcours</a>';
    } else {
      nav = '<a class="jp-btn jp-btn-primary jp-btn-touch jp-lecon-next" href="lecon.html?module=' + encodeURIComponent(next.id) + '">Leçon suivante →</a>'
        + '<a class="jp-lecon-back" href="' + back + '">Retour au parcours</a>';
    }
    host.innerHTML = (preview ? '' : criteriaHtml(detail, module.id, module.parcours_id))
      + '<nav class="jp-lecon-nav" aria-label="Navigation de leçon">' + nav + '</nav>';
  }

  /** Suivi de lecture : % de la page vue, « lue » après ~1 s en bas. */
  function trackReading(ctx) {
    let sent = 0;
    let timer = null;
    let busy = false;
    let raf = 0;

    async function send(pct) {
      if (busy || pct <= sent) return;
      busy = true;
      try {
        const res = await global.JpV2Resolver.enregistrerLecture(ctx.module.id, pct);
        sent = pct;
        if (res && res.detail) ctx.detail = res.detail;
        await renderFooter(ctx.footer, ctx);
      } catch (_) { /* silencieux : réessai au prochain scroll */ } finally {
        busy = false;
      }
    }

    function check() {
      raf = 0;
      const end = document.getElementById('jpReadEnd');
      if (!end) return;
      const endY = end.getBoundingClientRect().top + window.scrollY;
      const seen = window.scrollY + window.innerHeight;
      const pct = Math.max(0, Math.min(100, Math.round((seen / Math.max(endY, 1)) * 100)));
      const atBottom = seen >= endY - 8;
      if (atBottom) {
        if (!timer && sent < 100) {
          timer = setTimeout(() => {
            timer = null;
            const e2 = document.getElementById('jpReadEnd');
            if (e2 && window.scrollY + window.innerHeight >= e2.getBoundingClientRect().top + window.scrollY - 8) void send(100);
          }, 1100);
        }
      } else {
        if (timer) { clearTimeout(timer); timer = null; }
        if (pct >= sent + 25) void send(Math.min(90, pct));
      }
    }

    function schedule() { if (!raf) raf = requestAnimationFrame(check); }
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    [700, 2200, 5000].forEach((ms) => setTimeout(schedule, ms));
    return { schedule };
  }

  /* ——— Rendu principal ——— */

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
    const back = document.querySelector('.jp-back');
    if (back && module.parcours_id) back.setAttribute('href', 'espace.html?parcours=' + encodeURIComponent(module.parcours_id));

    const detail = data.detail || null;
    const jeuxDetail = {};
    ((detail && detail.jeux) || []).forEach((j) => { jeuxDetail[j.modele_id] = j; });
    const maj = PU().majLabel(module.maj_at || module.contenu_maj_at || module.updated_at);

    let html = '<header class="jp-lecon-head"><h1 class="jp-player-brand">' + esc(module.titre || '') + '</h1>'
      + (maj ? '<p class="jp-lecon-maj">' + esc(maj) + '</p>' : '')
      + (module.resume ? '<p class="jp-lecon-resume">' + esc(module.resume) + '</p>' : '')
      + '</header>';
    if (!blocs.length) {
      html += '<p class="jp-muted">—</p>';
    }
    for (const b of blocs) {
      const p = b.payload_json || {};
      const type = BLOC_META[b.type_bloc] ? b.type_bloc : 'texte';
      const meta = BLOC_META[type];
      let inner = '';
      if (b.type_bloc === 'texte') {
        inner = '<div class="jp-rich">' + sanitizeHtml(p.html || '') + '</div>';
      } else if (b.type_bloc === 'video') {
        inner = videoEmbed(p.url) || '<p class="jp-muted">Vidéo indisponible.</p>';
      } else if (b.type_bloc === 'photo') {
        inner = global.JpBlocPhoto.figureHtml(p);
      } else if (b.type_bloc === 'conseil') {
        inner = (p.pathologie ? '<p class="jp-conseil-patho">' + esc(p.pathologie) + '</p>' : '')
          + '<div class="jp-rich">' + sanitizeHtml(p.corps_html || '') + '</div>';
      } else if (b.type_bloc === 'recommandation') {
        const rh = recoHref(p, module);
        const link = rh
          ? '<p class="jp-reco-lien"><a class="jp-reco-a" href="' + esc(rh) + '">'
            + esc(p.lien_label || 'Voir la section indiquée') + ' →</a></p>'
          : '';
        inner = '<div class="jp-rich jp-reco-body">' + sanitizeHtml(p.corps_html || '') + '</div>' + link;
      } else if (b.type_bloc === 'molecule') {
        const ids = matriceIds(p);
        if (!ids.length) continue;
        inner = carouselHtml(ids);
      } else if (b.type_bloc === 'jeu') {
        const code = p.code_unique || '';
        const href = jeuHref(code, p.type_jeu, module.id, module.parcours_id);
        const crit = (p.modele_id && jeuxDetail[p.modele_id])
          || ((detail && detail.jeux) || []).find((j) => code && j.code_unique === code) || null;
        let status = '';
        if (crit) {
          status = '<p class="jp-jeu-req ' + (crit.ok ? 'is-ok' : 'is-todo') + '">'
            + (crit.ok ? '✓ Validé : ' + esc(PU().sur10(crit.meilleur_pct)) : 'Score minimum requis : ' + esc(PU().sur10(crit.score_min_pct))
              + (crit.fait ? ' · votre meilleur : ' + esc(PU().sur10(crit.meilleur_pct)) : ''))
            + '</p>';
        }
        inner = '<div class="jp-jeu-cta"><div class="jp-jeu-cta-text">'
          + (p.type_jeu ? '<span class="jp-jeu-type">' + esc(p.type_jeu === 'fiche_aleatoire' ? 'fiche aléatoire' : p.type_jeu) + '</span>' : '')
          + status + '</div>'
          + '<a class="jp-btn jp-btn-touch jp-jeu-play" href="' + esc(href) + '">' + esc(p.libelle_cta || 'Jouer') + ' →</a></div>'
          + (code ? '<p class="jp-jeu-code"><code>' + esc(code) + '</code></p>' : '');
      }
      // Texte : pas de pastille « Texte » — seulement le cadre (et le titre s’il existe).
      let head;
      if (type === 'texte') {
        head = b.titre ? '<header class="jp-bloc-head"><h2>' + esc(b.titre) + '</h2></header>' : '';
      } else {
        head = '<header class="jp-bloc-head"><span class="jp-bloc-ico" aria-hidden="true">' + meta.ico + '</span>'
          + '<span class="jp-bloc-kind">' + esc(meta.label) + '</span>'
          + (b.titre ? '<h2>' + esc(b.titre) + '</h2>' : '') + '</header>';
      }
      html += '<article class="jp-lecon-block jp-bloc jp-bloc--' + type + '" id="jp-bloc-' + esc(b.id) + '">'
        + head
        + '<div class="jp-bloc-body">' + inner + '</div></article>';
    }
    html += '<div id="jpReadEnd" aria-hidden="true"></div><footer class="jp-lecon-foot" id="leconFoot"></footer>';
    root.innerHTML = html;
    global.JpBlocPhoto.hydrate(root);

    const ctx = { module, detail, preview: !!preview, footer: document.getElementById('leconFoot') };
    const carousels = Array.from(root.querySelectorAll('.jp-carousel')).map((c) => initCarousel(c));

    // Navigation / critères (async : ne bloque pas l’affichage)
    void renderFooter(ctx.footer, ctx);
    if (!preview) trackReading(ctx);

    const slots = root.querySelectorAll('.jp-carousel-slide[data-mol]');
    for (const slot of slots) {
      const id = slot.getAttribute('data-mol');
      const holder = slot.querySelector('.jp-mol-slot');
      try {
        const fiche = await global.JpV2Resolver.ficheResolue(id, {
          parcoursId: module.parcours_id,
          moduleIds: [module.id],
        });
        holder.innerHTML = fiche ? ficheHtml(fiche) : '—';
      } catch (_) {
        holder.textContent = '—';
      }
      carousels.forEach((c) => c.fit());
    }
  }

  global.JpLeconPlayer = { boot };
})(window);
