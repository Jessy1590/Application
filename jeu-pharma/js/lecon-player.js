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

  /**
   * Tableau `matrice_ids` (même vide) prime sur le scalaire legacy `matrice_id`.
   * Le payload est déjà résolu ★ côté RPC (`v2__payload_resolu` : Base ∪ variante additive).
   */
  function matriceIds(p) {
    if (Array.isArray(p.matrice_ids)) return p.matrice_ids.filter(Boolean);
    return p.matrice_id ? [p.matrice_id] : [];
  }

  const BLOC_META = {
    section: { label: 'Section', ico: '§' },
    texte: { label: 'Texte', ico: '¶' },
    video: { label: 'Vidéo', ico: '▶' },
    photo: { label: 'Photo', ico: '▣' },
    conseil: { label: 'Conseil', ico: '✦' },
    recommandation: { label: 'Recommandation', ico: '→' },
    molecule: { label: 'Molécules', ico: '⬡' },
    jeu: { label: 'Jeu', ico: '◆' },
  };

  function recoNormalizeRef(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const kindRaw = String(r.target_kind || '').trim();
    const kind = (kindRaw === 'parcours' || kindRaw === 'chapitre' || kindRaw === 'lecon' || kindRaw === 'url')
      ? kindRaw
      : '';
    return {
      label: String(r.label ?? r.lien_label ?? '').trim(),
      href: String(r.href ?? r.lien_href ?? '').trim(),
      module_id: String(r.module_id ?? r.lien_module_id ?? '').trim(),
      parcours_id: String(r.parcours_id ?? r.lien_parcours_id ?? '').trim(),
      bloc_id: String(r.bloc_id ?? r.lien_bloc_id ?? '').trim(),
      target_kind: kind,
    };
  }

  /** Lit `references[]` ou migre les champs legacy `lien_*` (un seul item). */
  function recoReferencesList(p) {
    const pay = p && typeof p === 'object' ? p : {};
    if (Array.isArray(pay.references) && pay.references.length) {
      return pay.references.map(recoNormalizeRef);
    }
    const legacy = recoNormalizeRef({
      label: pay.lien_label,
      href: pay.lien_href,
      module_id: pay.lien_module_id,
      parcours_id: pay.lien_parcours_id,
      bloc_id: pay.lien_bloc_id,
      target_kind: pay.target_kind,
    });
    const has = legacy.label || legacy.href || legacy.module_id || legacy.parcours_id || legacy.bloc_id;
    return has ? [legacy] : [];
  }

  /** Conserve preview=1 / niveau en aperçu admin (sinon la leçon cible peut être inaccessible). */
  function recoPreviewQuery() {
    const qs = new URLSearchParams(location.search);
    if (qs.get('preview') !== '1') return '';
    let extra = '&preview=1';
    const niv = qs.get('niveau');
    if (niv) extra += '&niveau=' + encodeURIComponent(niv);
    return extra;
  }

  function recoAppendPreview(href) {
    const extra = recoPreviewQuery();
    if (!extra || !href || href.indexOf('preview=') >= 0) return href;
    return href + (href.indexOf('?') >= 0 ? extra : '?' + extra.slice(1));
  }

  /** Lien in-app ou https pour une référence recommandation (pas de pop-up). */
  function recoHrefForRef(ref, module) {
    const blocId = (ref.bloc_id || '').trim();
    if (blocId) return '#jp-bloc-' + blocId;

    const kind = String(ref.target_kind || '').trim();
    const modId = (ref.module_id || '').trim();
    const parcRef = (ref.parcours_id || '').trim();
    const parc = parcRef || (module && module.parcours_id ? String(module.parcours_id).trim() : '');

    if (kind === 'parcours') {
      if (!parcRef) return '';
      return recoAppendPreview('espace.html?parcours=' + encodeURIComponent(parcRef));
    }
    if (kind === 'chapitre') {
      if (!modId) return '';
      let h = 'espace.html?';
      if (parc) h += 'parcours=' + encodeURIComponent(parc) + '&';
      h += 'chapitre=' + encodeURIComponent(modId);
      return recoAppendPreview(h);
    }
    if (modId) {
      // lecon (explicite ou legacy sans target_kind)
      let h = 'lecon.html?module=' + encodeURIComponent(modId);
      if (parc) h += '&parcours=' + encodeURIComponent(parc);
      return recoAppendPreview(h);
    }
    if (parcRef && kind !== 'url') {
      return recoAppendPreview('espace.html?parcours=' + encodeURIComponent(parcRef));
    }

    const href = (ref.href || '').trim();
    if (!href) return '';
    if (href.startsWith('#')) return href;
    if (/^(lecon|espace|parcours|jeux\/|catalogue|mon-espace)\.html/i.test(href) || href.startsWith('/')) {
      return recoAppendPreview(href);
    }
    if (/^https:\/\//i.test(href)) return href;
    return '';
  }

  function recoLinksHtml(p, module) {
    const refs = recoReferencesList(p);
    if (!refs.length) return '';
    const items = refs.map((ref) => {
      const rh = recoHrefForRef(ref, module);
      if (!rh) return '';
      const lab = ref.label || 'Voir la section indiquée';
      return '<p class="jp-reco-lien"><a class="jp-reco-a" href="' + esc(rh) + '">'
        + esc(lab) + ' →</a></p>';
    }).filter(Boolean);
    if (!items.length) return '';
    return '<div class="jp-reco-liens">' + items.join('') + '</div>';
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

  function toneAttr(tones) {
    const css = global.JpConstants?.assoStyle?.(tones) || '';
    return css ? ' style="' + esc(css) + '"' : '';
  }

  function compsOfFiche(fiche) {
    const comps = Array.isArray(fiche && fiche.composants) ? fiche.composants : [];
    return comps.slice().sort((a, b) => (a.ordre || 0) - (b.ordre || 0)
      || String(a.dci || '').localeCompare(String(b.dci || ''), 'fr'));
  }

  /** Valeurs affichées des molécules séparées, plus les spécificités propres à l’association. */
  function heritageEntries(fiche, fichesById) {
    const comps = compsOfFiche(fiche);
    const entries = [];
    const map = fichesById || {};
    if (comps.length >= 2) {
      comps.forEach((c, i) => {
        const src = map[c.id] || map[String(c.id)] || null;
        const champs = (src && src.champs) || {};
        Object.keys(champs).forEach((code) => {
          if (code === 'dci' || code === 'nom_commercial') return;
          (champs[code] || []).forEach((it) => {
            if (!it || !it.valeur) return;
            entries.push({
              champ: code,
              id: it.entite_id || it.id || it.valeur,
              label: it.valeur,
              index: i,
            });
          });
        });
      });
    }
    const own = (fiche && fiche.champs) || {};
    Object.keys(own).forEach((code) => {
      if (code === 'dci' || code === 'nom_commercial') return;
      (own[code] || []).forEach((it) => {
        if (!it || !it.valeur) return;
        entries.push({
          champ: code,
          id: it.entite_id || it.id || it.valeur,
          label: it.valeur,
          own: true,
        });
      });
    });
    return { comps, grouped: global.JpConstants.groupHeritage(entries) };
  }

  function ficheHtml(fiche, fichesById) {
    const { comps, grouped } = heritageEntries(fiche, fichesById);
    const isAsso = comps.length >= 2;
    let hasOwn = false;
    if (isAsso) {
      Object.keys(grouped).forEach((code) => {
        (grouped[code] || []).forEach((it) => {
          if (it.own && !(it.indexes || []).length) hasOwn = true;
        });
      });
    }

    let body = '<div class="jp-mol-head' + (isAsso ? ' jp-mol-head--asso' : '') + '">';
    if (isAsso) body += '<p class="jp-mol-asso-label">Association</p>';
    body += '<strong class="jp-mol-dci">' + esc(fiche.dci || '') + '</strong>';
    if (isAsso) {
      body += '<div class="jp-mol-asso-legend" role="list" aria-label="Composition">';
      comps.forEach((c, i) => {
        const tones = global.JpConstants.assoTones([i], comps);
        body += '<span class="jp-mol-asso-pill" role="listitem"' + toneAttr(tones) + '>'
          + esc(c.dci || 'Composant') + '</span>';
      });
      if (hasOwn) {
        body += '<span class="jp-mol-asso-pill jp-mol-asso-pill--blend" role="listitem"'
          + toneAttr([global.JpConstants.ASSO_BLEND]) + '>Spécifique association</span>';
      }
      body += '</div>';
    }
    const noms = (fiche.noms_commerciaux || []).map((n) => n.valeur).filter(Boolean);
    if (noms.length) {
      body += '<div class="jp-chip-list jp-chip-list--noms">'
        + noms.map((n) => '<span class="jp-chip">' + esc(n) + '</span>').join('') + '</div>';
    }
    body += '</div>';
    const codes = Object.keys(grouped).sort((a, b) => champRank(a) - champRank(b));
    let dl = '';
    codes.forEach((code) => {
      const items = grouped[code] || [];
      if (!items.length) return;
      dl += '<div class="jp-mol-row' + (isAsso ? ' jp-mol-row--asso' : '') + '"><dt>'
        + esc(champLibelle(code)) + '</dt><dd>'
        + items.map((it) => {
          let tones = null;
          if (isAsso && (it.indexes || []).length) tones = global.JpConstants.assoTones(it.indexes, comps);
          else if (isAsso && it.own) tones = [global.JpConstants.ASSO_BLEND];
          const names = (it.indexes || []).map((i) => comps[i] && comps[i].dci).filter(Boolean);
          const title = names.length ? ' title="' + esc(names.join(' · ')) + '"' : '';
          return '<span class="jp-chip' + (tones ? ' jp-chip--asso' : '') + '"' + toneAttr(tones) + title + '>'
            + esc(it.label) + '</span>';
        }).join('') + '</dd></div>';
    });
    if (dl) body += '<dl class="jp-mol-fields">' + dl + '</dl>';
    return body;
  }

  /** Diapositives visibles, et ids masqués (toujours chargés pour l’héritage). */
  function moleculeSlidePlan(p) {
    const all = matriceIds(p);
    const masque = new Set((Array.isArray(p.masque_ids) ? p.masque_ids : []).map(String));
    return {
      shown: all.filter((id) => !masque.has(String(id))),
      hidden: all.filter((id) => masque.has(String(id))),
    };
  }

  /* ——— Carrousel de molécules ——— */

  function carouselHtml(ids, hiddenIds) {
    const extra = (hiddenIds || []).filter(Boolean).map((id) => String(id)).join(',');
    const extraAttr = extra ? ' data-mol-extra="' + esc(extra) + '"' : '';
    const n = ids.length;
    const slides = ids.map((id, i) => '<div class="jp-carousel-slide" role="group" aria-roledescription="diapositive" aria-label="'
      + (i + 1) + ' sur ' + n + '" data-mol="' + esc(id) + '"><div class="jp-mol-slot">…</div></div>').join('');
    if (n === 1) {
      return '<div class="jp-carousel is-single"' + extraAttr + '><div class="jp-carousel-viewport"><div class="jp-carousel-track">' + slides + '</div></div></div>';
    }
    return '<div class="jp-carousel" tabindex="0" role="region" aria-roledescription="carrousel" aria-label="Molécules"' + extraAttr + '>'
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
      const isFiche = j.type_jeu === 'fiche_aleatoire';
      const min = isFiche
        ? Math.round(j.score_min_pct) + ' % maîtrisées'
        : PU().sur10(j.score_min_pct);
      const best = isFiche
        ? (j.meilleur_pct != null ? Math.round(j.meilleur_pct) + ' %' : '—')
        : PU().sur10(j.meilleur_pct);
      const href = jeuHref(j.code_unique, j.type_jeu, moduleId, parcoursId);
      if (j.ok) {
        rows.push('<li class="is-ok"><span class="jp-crit-mark">✓</span><span>Jeu « ' + esc(j.titre) + ' » : '
          + esc(best) + ' <small>(minimum ' + esc(min) + ')</small></span></li>');
      } else {
        rows.push('<li><span class="jp-crit-mark">○</span><span>Jeu « ' + esc(j.titre) + ' » : minimum ' + esc(min)
          + (j.fait ? ' <small>(actuel : ' + esc(best) + ')</small>' : '')
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

  /**
   * Recharge progression + détail de la leçon courante (après jeu / lecture).
   * Sans cela, le cache `_nav` / `detail` reste figé et « Leçon suivante » reste verrouillée
   * jusqu’à un rechargement de page.
   */
  async function refreshNavFromProgression(ctx) {
    const { module } = ctx;
    if (!module?.parcours_id || !global.JpV2Resolver?.progression) return;
    try {
      const prog = await global.JpV2Resolver.progression(module.parcours_id);
      const leaves = PU().orderedLeaves(prog.modules || []);
      const idx = leaves.findIndex((m) => m.id === module.id);
      const cur = idx >= 0 ? leaves[idx] : null;
      if (cur && cur.detail) ctx.detail = cur.detail;
      ctx._nav = {
        idx,
        next: idx >= 0 ? leaves[idx + 1] : null,
      };
    } catch (_) { /* conserve le cache */ }
  }

  /**
   * Footer critères + nav « leçon suivante ».
   * Navigation : v2_progression_parcours (cache ctx._nav, invalidé après jeu).
   * Scroll / lecture : réutilise detail de v2_enregistrer_lecture — pas de progression.
   */
  async function renderFooter(host, ctx) {
    const { module, preview } = ctx;
    let detail = ctx.detail;

    if (!ctx._nav) {
      await refreshNavFromProgression(ctx);
      detail = ctx.detail || detail;
    }

    // Après lecture / jeu : si la leçon courante valide débloque la suivante, ouvrir le lien.
    let next = ctx._nav ? ctx._nav.next : null;
    if (next && next.statut === 'verrouille' && detail && detail.valide) {
      const bp = next.bloque_par;
      if (bp && bp.type === 'module' && bp.module_id === module.id) {
        next = Object.assign({}, next, { statut: 'disponible', bloque_par: null });
        ctx._nav.next = next;
      }
    }

    ctx.detail = detail;
    const idx = ctx._nav ? ctx._nav.idx : -1;
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

  async function fillMoleculeSlots(root, carousels, opts) {
    const slots = Array.from(root.querySelectorAll('.jp-carousel-slide[data-mol]'));
    const ids = slots.map((s) => s.getAttribute('data-mol')).filter(Boolean);
    root.querySelectorAll('.jp-carousel[data-mol-extra]').forEach((car) => {
      String(car.getAttribute('data-mol-extra') || '').split(',').forEach((id) => {
        if (id) ids.push(id);
      });
    });
    let fichesMap = {};
    if (ids.length && global.JpV2Resolver?.fichesResolues) {
      try {
        fichesMap = await global.JpV2Resolver.fichesResolues(ids, opts || {});
        const have = new Set(Object.keys(fichesMap || {}).map(String));
        const more = [];
        Object.keys(fichesMap || {}).forEach((k) => {
          const comps = (fichesMap[k] && fichesMap[k].composants) || [];
          comps.forEach((c) => {
            const id = c && c.id ? String(c.id) : '';
            if (id && !have.has(id)) {
              have.add(id);
              more.push(c.id);
            }
          });
        });
        if (more.length) {
          const extra = await global.JpV2Resolver.fichesResolues(more, opts || {});
          fichesMap = Object.assign({}, fichesMap, extra || {});
        }
      } catch (_) { /* slots en « — » */ }
    }
    for (const slot of slots) {
      const id = slot.getAttribute('data-mol');
      const holder = slot.querySelector('.jp-mol-slot');
      if (!holder) continue;
      const fiche = fichesMap[id];
      holder.innerHTML = fiche ? ficheHtml(fiche, fichesMap) : '—';
    }
    (carousels || []).forEach((c) => c.fit());
  }

  /* ——— Rendu principal ——— */

  async function boot(root, moduleId, preview, previewNiveau) {
    const rpcArgs = {
      p_module_id: moduleId,
      p_preview: !!preview,
    };
    const niv = previewNiveau != null && previewNiveau !== '' ? Number(previewNiveau) : null;
    if (preview && niv >= 1 && niv <= 5) rpcArgs.p_preview_niveau = niv;

    const { data, error } = await sb().rpc('v2_lecon_joueur', rpcArgs);
    if (error) throw error;
    if (!data || data.preview === false && preview) {
      // Admin attendu mais RPC n’a pas activé le mode aperçu (rôle)
      throw new Error('Aperçu réservé aux administrateurs portail');
    }
    const module = data.module || {};
    let blocs = data.blocs || [];
    if (!preview) {
      blocs = blocs.map((b) => Object.assign({}, b, { payload_json: publishedPayload(b.payload_json) }));
    }
    // preview : brouillons + blocs masqués déjà fusionnés côté RPC (044)
    document.title = (module.titre || 'Leçon')
      + (preview ? ' (aperçu)' : '')
      + ' — Jeu Pharma';
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
      if (b.type_bloc === 'section') {
        html += '<section class="jp-lecon-section" id="jp-bloc-' + esc(b.id) + '">'
          + '<h2 class="jp-lecon-section-title">' + esc(b.titre || 'Section') + '</h2></section>';
        continue;
      } else if (b.type_bloc === 'texte') {
        inner = '<div class="jp-rich">' + sanitizeHtml(p.html || '') + '</div>';
      } else if (b.type_bloc === 'video') {
        inner = videoEmbed(p.url) || '<p class="jp-muted">Vidéo indisponible.</p>';
      } else if (b.type_bloc === 'photo') {
        inner = global.JpBlocPhoto.figureHtml(p);
      } else if (b.type_bloc === 'conseil') {
        inner = (p.pathologie ? '<p class="jp-conseil-patho">' + esc(p.pathologie) + '</p>' : '')
          + '<div class="jp-rich">' + sanitizeHtml(p.corps_html || '') + '</div>';
      } else if (b.type_bloc === 'recommandation') {
        inner = '<div class="jp-rich jp-reco-body">' + sanitizeHtml(p.corps_html || '') + '</div>'
          + recoLinksHtml(p, module);
      } else if (b.type_bloc === 'molecule') {
        const plan = moleculeSlidePlan(p);
        if (!plan.shown.length) continue;
        inner = carouselHtml(plan.shown, plan.hidden);
      } else if (b.type_bloc === 'jeu') {
        const code = p.code_unique || '';
        const href = jeuHref(code, p.type_jeu, module.id, module.parcours_id);
        const crit = (p.modele_id && jeuxDetail[p.modele_id])
          || ((detail && detail.jeux) || []).find((j) => code && j.code_unique === code) || null;
        let status = '';
        if (crit) {
          const isFiche = (crit.type_jeu || p.type_jeu) === 'fiche_aleatoire';
          const pctLab = isFiche
            ? (crit.meilleur_pct != null ? Math.round(crit.meilleur_pct) + ' % maîtrisées' : '—')
            : PU().sur10(crit.meilleur_pct);
          const minLab = isFiche
            ? Math.round(crit.score_min_pct) + ' % de molécules maîtrisées'
            : PU().sur10(crit.score_min_pct);
          status = '<p class="jp-jeu-req ' + (crit.ok ? 'is-ok' : 'is-todo') + '" data-jeu-req>'
            + (crit.ok
              ? '✓ Validé : ' + esc(pctLab)
              : 'Minimum requis : ' + esc(minLab)
                + (crit.fait ? ' · actuel : ' + esc(pctLab) : ''))
            + '</p>';
        }
        inner = '<div class="jp-jeu-embed" data-jeu-bloc="' + esc(b.id) + '"'
          + ' data-code="' + esc(code) + '"'
          + ' data-type="' + esc(p.type_jeu || '') + '">'
          + '<div class="jp-jeu-cta"><div class="jp-jeu-cta-text">'
          + (p.type_jeu ? '<span class="jp-jeu-cta-type">' + esc(({
            fiche_aleatoire: 'fiche aléatoire',
            classement: 'classement',
            appariement: 'appariement',
          })[p.type_jeu] || p.type_jeu) + '</span>' : '')
          + status + '</div>'
          + '<div class="jp-jeu-cta-actions">'
          + '<button type="button" class="jp-btn jp-btn-touch jp-jeu-play" data-jeu-retry'
          + (code ? '' : ' disabled') + '>' + esc(p.libelle_cta || 'Nouvelle tentative') + '</button>'
          + (code
            ? '<a class="jp-btn jp-btn-ghost jp-btn-touch" href="' + esc(href)
              + '" target="_blank" rel="noopener">Aller sur la page du jeu</a>'
            : '')
          + '</div></div>'
          + '<div class="jp-jeu-mount" id="jp-jeu-mount-' + esc(b.id) + '">'
          + (code ? '<p class="jp-muted">Chargement du jeu…</p>' : '<p class="jp-muted">Aucun jeu lié.</p>')
          + '</div>'
          + (code ? '<p class="jp-jeu-code"><code>' + esc(code) + '</code></p>' : '')
          + '</div>';
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

    // Jeux inline : mount JpJeuxPlay dans chaque bloc
    Array.from(root.querySelectorAll('[data-jeu-bloc]')).forEach((wrap) => {
      const code = wrap.getAttribute('data-code');
      const typeJeu = wrap.getAttribute('data-type') || '';
      const mount = wrap.querySelector('.jp-jeu-mount');
      if (!code || !mount || !global.JpJeuxPlay) return;
      let busy = false;
      let autoRetryTimer = null;

      async function mountGame() {
        if (busy) return;
        busy = true;
        if (autoRetryTimer) {
          clearTimeout(autoRetryTimer);
          autoRetryTimer = null;
        }
        mount.innerHTML = '<p class="jp-muted">Préparation…</p>';
        try {
          await global.JpJeuxPlay.boot(mount, code, {
            embed: true,
            moduleId: module.id,
            parcoursId: module.parcours_id,
            onReplay: function () { void mountGame(); },
            onFinished: function (res) {
              if (preview) return;
              // Fiche : l’exclusion / next() gère déjà la suite — pas d’auto-retry score
              if (typeJeu === 'fiche_aleatoire') {
                void (async function () {
                  await refreshJeuStatus(wrap, code);
                  await refreshNavFromProgression(ctx);
                  await renderFooter(ctx.footer, ctx);
                })();
                return;
              }
              if (res && res.okCritere === false) {
                autoRetryTimer = setTimeout(function () {
                  global.JpToast?.warn?.('Score insuffisant — nouvelle tentative…');
                  void mountGame();
                }, 1400);
              } else {
                void (async function () {
                  await refreshJeuStatus(wrap, code);
                  // Invalide le cache nav : détail.valide + statut de la leçon suivante
                  await refreshNavFromProgression(ctx);
                  await renderFooter(ctx.footer, ctx);
                })();
              }
            },
          });
        } catch (e) {
          global.JpToast?.fromError?.(e);
          mount.innerHTML = '<p class="jp-muted">' + esc(e.message || String(e)) + '</p>';
        } finally {
          busy = false;
        }
      }

      wrap.querySelector('[data-jeu-retry]')?.addEventListener('click', function () {
        void mountGame();
      });
      void mountGame();
    });

    async function refreshJeuStatus(wrap, code) {
      if (!global.JpV2Resolver?.critereJeu || !code) return;
      try {
        const modele = await global.JpJeuxPlay.loadModele(code);
        const row = await global.JpV2Resolver.critereJeu(modele.id, {
          moduleId: module.id,
          parcoursId: module.parcours_id,
        });
        const el = wrap.querySelector('[data-jeu-req]');
        if (!el || !row) return;
        const isFiche = modele.type_jeu === 'fiche_aleatoire';
        const pctLab = isFiche
          ? (row.meilleur_pct != null ? Math.round(row.meilleur_pct) + ' % maîtrisées' : '—')
          : PU().sur10(row.meilleur_pct);
        const minLab = isFiche
          ? Math.round(row.score_min_pct) + ' % de molécules maîtrisées'
          : PU().sur10(row.score_min_pct);
        el.className = 'jp-jeu-req ' + (row.ok ? 'is-ok' : 'is-todo');
        el.textContent = row.ok
          ? '✓ Validé : ' + pctLab
          : 'Minimum requis : ' + minLab + (row.meilleur_pct != null ? ' · actuel : ' + pctLab : '');
      } catch (_) { /* ignore */ }
    }

    // Navigation / critères (async : ne bloque pas l’affichage)
    void renderFooter(ctx.footer, ctx);
    if (!preview) trackReading(ctx);

    // Aperçu ★N : même niveau que v2_lecon_joueur (sinon pubs / valeurs restent au ★ inscription).
    const ficheNiveau = (preview && data.niveau_parcours >= 1 && data.niveau_parcours <= 5)
      ? data.niveau_parcours
      : null;
    await fillMoleculeSlots(root, carousels, {
      parcoursId: module.parcours_id,
      moduleIds: [module.id],
      niveau: ficheNiveau,
    });
  }

  /**
   * HTML d’un seul bloc (aperçu admin / miroir Preview).
   * @param {object} b — { id, type_bloc, titre, payload_json }
   * @param {{ niveau?: number|null, module?: object, idPrefix?: string }} opts
   */
  function blocArticleHtml(b, opts) {
    const o = opts || {};
    const niveau = o.niveau != null && o.niveau !== '' ? Number(o.niveau) : null;
    const module = o.module || {};
    const idPrefix = o.idPrefix || 'jp-bloc-';
    const p = b.payload_json || {};
    let pay = p;
    if (niveau >= 1 && niveau <= 5 && p.variantes && p.variantes[String(niveau)]) {
      pay = Object.assign({}, p, p.variantes[String(niveau)]);
    }
    const type = BLOC_META[b.type_bloc] ? b.type_bloc : 'texte';
    const meta = BLOC_META[type];
    const bid = idPrefix + esc(b.id || '');
    if (b.type_bloc === 'section') {
      return '<section class="jp-lecon-section" id="' + bid + '">'
        + '<h2 class="jp-lecon-section-title">' + esc(b.titre || 'Section') + '</h2></section>';
    }
    let inner = '';
    if (b.type_bloc === 'texte') {
      inner = '<div class="jp-rich">' + sanitizeHtml(pay.html || '') + '</div>';
    } else if (b.type_bloc === 'video') {
      inner = videoEmbed(pay.url) || '<p class="jp-muted">Vidéo indisponible.</p>';
    } else if (b.type_bloc === 'photo') {
      inner = global.JpBlocPhoto ? global.JpBlocPhoto.figureHtml(pay) : '';
    } else if (b.type_bloc === 'conseil') {
      inner = (pay.pathologie ? '<p class="jp-conseil-patho">' + esc(pay.pathologie) + '</p>' : '')
        + '<div class="jp-rich">' + sanitizeHtml(pay.corps_html || '') + '</div>';
    } else if (b.type_bloc === 'recommandation') {
      inner = '<div class="jp-rich jp-reco-body">' + sanitizeHtml(pay.corps_html || '') + '</div>'
        + recoLinksHtml(pay, module);
    } else if (b.type_bloc === 'molecule') {
      const plan = moleculeSlidePlan(pay);
      if (!plan.shown.length) return '';
      inner = carouselHtml(plan.shown, plan.hidden);
    } else if (b.type_bloc === 'jeu') {
      const code = pay.code_unique || '';
      inner = '<p class="jp-muted">Jeu'
        + (pay.type_jeu ? ' · ' + esc(pay.type_jeu) : '')
        + (code ? ' · <code>' + esc(code) + '</code>' : '')
        + '</p>';
    }
    let head;
    if (type === 'texte') {
      head = b.titre ? '<header class="jp-bloc-head"><h2>' + esc(b.titre) + '</h2></header>' : '';
    } else {
      head = '<header class="jp-bloc-head"><span class="jp-bloc-ico" aria-hidden="true">' + meta.ico + '</span>'
        + '<span class="jp-bloc-kind">' + esc(meta.label) + '</span>'
        + (b.titre ? '<h2>' + esc(b.titre) + '</h2>' : '') + '</header>';
    }
    return '<article class="jp-lecon-block jp-bloc jp-bloc--' + type + '" id="' + bid + '">'
      + head
      + '<div class="jp-bloc-body">' + inner + '</div></article>';
  }

  /**
   * Rendu léger pour Preview admin (sans footer, critères ni jeux inline).
   * @param {HTMLElement} host
   * @param {{ module: object, blocs: object[], niveau?: number|null }} opts
   */
  async function renderContent(host, opts) {
    const module = (opts && opts.module) || {};
    let blocs = (opts && opts.blocs) || [];
    const preview = !!(opts && opts.preview);
    const niveau = opts && opts.niveau != null && opts.niveau !== '' ? Number(opts.niveau) : null;
    if (preview) {
      blocs = blocs.map((b) => withDraft(b));
    } else {
      blocs = blocs.map((b) => Object.assign({}, b, { payload_json: publishedPayload(b.payload_json) }));
    }

    const maj = PU()?.majLabel?.(module.maj_at || module.contenu_maj_at || module.updated_at) || '';
    let html = '<header class="jp-lecon-head"><h1 class="jp-player-brand">' + esc(module.titre || '') + '</h1>'
      + (maj ? '<p class="jp-lecon-maj">' + esc(maj) + '</p>' : '')
      + (module.resume ? '<p class="jp-lecon-resume">' + esc(module.resume) + '</p>' : '')
      + '</header>';
    if (!blocs.length) html += '<p class="jp-muted">—</p>';

    for (const b of blocs) {
      html += blocArticleHtml(b, { niveau, module });
    }
    host.innerHTML = html;
    if (global.JpBlocPhoto) global.JpBlocPhoto.hydrate(host);

    const carousels = Array.from(host.querySelectorAll('.jp-carousel')).map((c) => initCarousel(c));
    await fillMoleculeSlots(host, carousels, {
      parcoursId: module.parcours_id,
      moduleIds: module.id ? [module.id] : [],
      niveau: niveau >= 1 && niveau <= 5 ? niveau : null,
    });
  }

  global.JpLeconPlayer = {
    boot,
    renderContent,
    blocArticleHtml,
    withDraft,
    publishedPayload,
    sanitizeHtml,
    BLOC_META,
  };
})(window);
