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
    return t;
  }

  function toggle() {
    return apply(current() === 'dark' ? 'light' : 'dark');
  }

  function init() {
    apply(current());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.PhieTheme = { current, apply, toggle, init };
})(window);
