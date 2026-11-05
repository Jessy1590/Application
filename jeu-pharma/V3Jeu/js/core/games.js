/* V3Games — registre des modules de jeu. */
(function (global) {
  const ORDER = ['quiz', 'trous', 'fiche_aleatoire', 'ordonnance', 'classement', 'appariement'];
  const defs = {};

  function register(type, def) {
    defs[type] = def;
  }

  function get(type) {
    return defs[type] || null;
  }

  function list() {
    return ORDER.filter(function (t) { return defs[t]; }).map(function (t) {
      return Object.assign({ type: t }, defs[t]);
    });
  }

  global.V3Games = { register: register, get: get, list: list };
})(window);
