/* V3Store — RPC jeu_* (écriture V3 uniquement). */
(function (global) {
  function human(e) {
    const m = (e && (e.message || e.error_description || e.details)) || String(e || '');
    if (/jwt|session|not authenticated|401|pgrst301/i.test(m)) return 'Connexion requise';
    if (/42501|row-level|permission|rls|accès refusé/i.test(m)) return 'Accès refusé';
    if (/réservé admin/i.test(m)) return 'Réservé admin';
    if (/introuvable/i.test(m)) return 'Introuvable';
    if (/déjà joué/i.test(m)) return 'Déjà joué — archiver';
    if (/statut invalide/i.test(m)) return 'Statut invalide';
    if (/network|failed to fetch/i.test(m)) return 'Hors ligne';
    const line = m.split('\n')[0].replace(/^.{0,40}error:\s*/i, '');
    return line.slice(0, 140) || 'Erreur';
  }

  async function wrap(fn) {
    try {
      return await fn();
    } catch (e) {
      throw new Error(human(e));
    }
  }

  function creer(payload) {
    return wrap(function () { return global.V3Data.rpc('jeu_creer', { p_payload: payload }); });
  }

  function maj(id, payload) {
    return wrap(function () { return global.V3Data.rpc('jeu_maj', { p_jeu_id: id, p_payload: payload }); });
  }

  function statut(id, s) {
    return wrap(function () { return global.V3Data.rpc('jeu_set_statut', { p_jeu_id: id, p_statut: s }); });
  }

  function charger(code) {
    return wrap(function () { return global.V3Data.rpc('jeu_charger', { p_code: code }); });
  }

  function config(id) {
    return wrap(function () { return global.V3Data.rpc('jeu_type_config', { p_jeu_id: id }); });
  }

  function lister(statutFiltre) {
    return wrap(async function () {
      const data = await global.V3Data.rpc('jeu_lister', { p_statut: statutFiltre || null });
      return Array.isArray(data) ? data : [];
    });
  }

  function supprimer(id) {
    return wrap(function () { return global.V3Data.rpc('jeu_supprimer', { p_jeu_id: id }); });
  }

  global.V3Store = {
    creer: creer,
    maj: maj,
    statut: statut,
    charger: charger,
    config: config,
    lister: lister,
    supprimer: supprimer,
    human: human,
  };
})(window);
