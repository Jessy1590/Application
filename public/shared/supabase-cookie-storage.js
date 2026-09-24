/**
 * Storage auth compatible @supabase/ssr (cookies base64url + chunks).
 * Permet à protect.js (CDN supabase-js) de lire la session posée par le hub Next.
 */
(function (global) {
  const BASE64_PREFIX = 'base64-';
  const MAX_CHUNK = 3180;

  function parseCookies() {
    const out = {};
    if (typeof document === 'undefined' || !document.cookie) return out;
    document.cookie.split(';').forEach(function (part) {
      const idx = part.indexOf('=');
      if (idx === -1) return;
      const name = part.slice(0, idx).trim();
      const value = part.slice(idx + 1).trim();
      try {
        out[name] = decodeURIComponent(value);
      } catch {
        out[name] = value;
      }
    });
    return out;
  }

  function base64UrlToString(b64) {
    const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4));
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(padded + pad), function (c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        })
        .join(''),
    );
  }

  function stringToBase64Url(str) {
    const b64 = btoa(
      encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (_, p1) {
        return String.fromCharCode(parseInt(p1, 16));
      }),
    );
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  function combineChunks(key, jar) {
    if (typeof jar[key] === 'string') return jar[key];
    const chunks = [];
    for (let i = 0; i < 100; i++) {
      const v = jar[key + '.' + i];
      if (typeof v !== 'string') break;
      chunks.push(v);
    }
    if (!chunks.length) return null;
    return chunks.join('');
  }

  function decodeValue(raw) {
    if (raw == null) return null;
    if (!raw.startsWith(BASE64_PREFIX)) return raw;
    try {
      return base64UrlToString(raw.slice(BASE64_PREFIX.length));
    } catch {
      return null;
    }
  }

  function writeCookie(name, value, maxAge) {
    var opts =
      name +
      '=' +
      encodeURIComponent(value) +
      '; path=/; max-age=' +
      maxAge +
      '; SameSite=Lax';
    if (typeof location !== 'undefined' && location.protocol === 'https:') {
      opts += '; Secure';
    }
    document.cookie = opts;
  }

  function clearCookie(name) {
    document.cookie =
      name + '=; path=/; max-age=0; SameSite=Lax' +
      (typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '');
  }

  global.SupabaseCookieStorage = {
    getItem: function (key) {
      var jar = parseCookies();
      var raw = combineChunks(key, jar);
      return decodeValue(raw);
    },
    setItem: function (key, value) {
      var encoded = BASE64_PREFIX + stringToBase64Url(value);
      // clear old chunks
      var jar = parseCookies();
      Object.keys(jar).forEach(function (name) {
        if (name === key || name.indexOf(key + '.') === 0) clearCookie(name);
      });
      if (encoded.length <= MAX_CHUNK) {
        writeCookie(key, encoded, 60 * 60 * 24 * 365);
        return;
      }
      var i = 0;
      for (var offset = 0; offset < encoded.length; offset += MAX_CHUNK, i++) {
        writeCookie(key + '.' + i, encoded.slice(offset, offset + MAX_CHUNK), 60 * 60 * 24 * 365);
      }
    },
    removeItem: function (key) {
      var jar = parseCookies();
      Object.keys(jar).forEach(function (name) {
        if (name === key || name.indexOf(key + '.') === 0) clearCookie(name);
      });
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
