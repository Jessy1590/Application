/**
 * Thème dark / light — attribut data-theme sur <html>, persistance localStorage.
 */
(function (global) {
  const KEY = 'phieevreux-theme';

  function current() {
    const stored = localStorage.getItem(KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return 'dark';
  }

  function apply(theme) {
    const t = theme === 'light' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem(KEY, t);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#f4f5f8' : '#0a0a0f');
    return t;
  }

  function toggle() {
    return apply(current() === 'dark' ? 'light' : 'dark');
  }

  function init() {
    apply(current());
  }

  /* Appliquer tout de suite (html existe) — ne pas attendre DOMContentLoaded */
  init();

  global.PhieTheme = { current, apply, toggle, init };
})(window);
