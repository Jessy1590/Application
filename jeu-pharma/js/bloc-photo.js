/**
 * Bloc « photo » : stockage Supabase privé (`jeupharma-lecons`, URL signées) ou lien https externe.
 * payload_json : { path?, url?, alt?, legende? } — `path` prioritaire sur `url`.
 * Utilisé par le studio (aperçu + upload) et le lecteur de leçon (rendu + agrandissement).
 */
(function (global) {
  const BUCKET = 'jeupharma-lecons';
  const MAX_BYTES = 5 * 1024 * 1024;
  const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
  const SIGN_TTL = 3600; // s
  const cache = {}; // path -> { url, exp }

  function sb() { return global.JpApp.sbJeu(); }
  function esc(s) { return global.JpUi.escapeHtml(String(s ?? '')); }

  /** Lien externe accepté uniquement en https. */
  function safeUrl(u) {
    const v = String(u || '').trim();
    return /^https:\/\/\S+$/i.test(v) ? v : '';
  }

  function safePath(p) {
    const v = String(p || '').trim();
    return /^[\w\-./]+$/.test(v) && v.indexOf('..') === -1 ? v : '';
  }

  async function signedUrl(path) {
    const hit = cache[path];
    if (hit && hit.exp > Date.now()) return hit.url;
    const { data, error } = await sb().storage.from(BUCKET).createSignedUrl(path, SIGN_TTL);
    if (error) throw error;
    cache[path] = { url: data.signedUrl, exp: Date.now() + (SIGN_TTL - 300) * 1000 };
    return data.signedUrl;
  }

  async function upload(file, moduleId) {
    const ext = MIME_EXT[file.type];
    if (!ext) throw new Error('Format non pris en charge (JPEG, PNG, WebP ou GIF).');
    if (file.size > MAX_BYTES) throw new Error('Image trop lourde (5 Mo maximum).');
    const id = (global.crypto && global.crypto.randomUUID) ? global.crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
    const path = 'modules/' + (moduleId || 'divers') + '/' + id + '.' + ext;
    const { error } = await sb().storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    return path;
  }

  /** HTML du cadre photo. L’image « path » est résolue ensuite par `hydrate`. */
  function figureHtml(p) {
    const path = safePath(p.path);
    const url = path ? '' : safeUrl(p.url);
    if (!path && !url) return '<p class="jp-muted">Photo indisponible.</p>';
    const alt = p.alt || p.legende || '';
    return '<figure class="jp-photo">'
      + '<button type="button" class="jp-photo-frame" data-photo-zoom aria-label="Agrandir la photo">'
      + '<img class="jp-photo-img" alt="' + esc(alt) + '" loading="lazy" decoding="async" referrerpolicy="no-referrer"'
      + (path ? ' data-photo-path="' + esc(path) + '"' : ' src="' + esc(url) + '"') + '></button>'
      + (p.legende ? '<figcaption class="jp-photo-cap">' + esc(p.legende) + '</figcaption>' : '')
      + '</figure>';
  }

  /** Résout les URL signées des images `data-photo-path` et branche l’agrandissement. */
  function hydrate(root) {
    root.querySelectorAll('img[data-photo-path]').forEach((img) => {
      const path = img.getAttribute('data-photo-path');
      img.removeAttribute('data-photo-path');
      signedUrl(path).then((u) => { img.src = u; }).catch(() => {
        const fig = img.closest('.jp-photo');
        if (fig) fig.innerHTML = '<p class="jp-muted">Photo indisponible.</p>';
      });
    });
    root.querySelectorAll('[data-photo-zoom]').forEach((btn) => {
      if (btn.__zoom) return;
      btn.__zoom = true;
      btn.addEventListener('click', () => {
        const img = btn.querySelector('img');
        if (img && img.src) zoom(img.src, img.alt);
      });
    });
  }

  /** Agrandissement dans le même document (pas de pop-up). */
  function zoom(src, alt) {
    const ov = document.createElement('div');
    ov.className = 'jp-photo-zoom';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<img alt="' + esc(alt || '') + '" referrerpolicy="no-referrer">'
      + '<button type="button" class="jp-photo-zoom-x" aria-label="Fermer">×</button>';
    ov.querySelector('img').src = src;
    const close = () => { document.removeEventListener('keydown', onKey); ov.remove(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    ov.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    document.body.appendChild(ov);
    ov.querySelector('.jp-photo-zoom-x').focus();
  }

  global.JpBlocPhoto = { BUCKET, MAX_BYTES, safeUrl, safePath, upload, figureHtml, hydrate };
})(window);
