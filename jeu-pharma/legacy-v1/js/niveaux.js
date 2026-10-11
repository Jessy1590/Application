/**
 * Configuration pédagogique centralisée : taxonomies et champs par niveau.
 * Les classifications de fiche sont filtrées par `JpMedicaments` selon le
 * niveau d'apprentissage, jamais selon un rôle portail.
 */
(function (global) {
  let cache = null;

  function sb() {
    return global.JpApp.sbJeu();
  }

  function emptyConfig() {
    return {
      secteurs: {},
      classesTherapeutiques: {},
      classesPharmacologiques: {},
      champs: {},
    };
  }

  function add(map, niveau, value) {
    if (!map[niveau]) map[niveau] = new Set();
    map[niveau].add(String(value));
  }

  async function load(force) {
    if (cache && !force) return cache;
    const [sec, ct, cp, ch] = await Promise.all([
      sb().from('niveau_secteurs_therapeutiques').select('niveau_id, secteur_therapeutique_id'),
      sb().from('niveau_classes_therapeutiques').select('niveau_id, classe_therapeutique_id'),
      sb().from('niveau_classes_pharmacologiques').select('niveau_id, classe_pharmacologique_id'),
      sb().from('niveau_champs').select('niveau_id, champ_code'),
    ]);
    const error = sec.error || ct.error || cp.error || ch.error;
    if (error) throw error;
    const cfg = emptyConfig();
    (sec.data || []).forEach((r) => add(cfg.secteurs, r.niveau_id, r.secteur_therapeutique_id));
    (ct.data || []).forEach((r) => add(cfg.classesTherapeutiques, r.niveau_id, r.classe_therapeutique_id));
    (cp.data || []).forEach((r) => add(cfg.classesPharmacologiques, r.niveau_id, r.classe_pharmacologique_id));
    (ch.data || []).forEach((r) => add(cfg.champs, r.niveau_id, r.champ_code));
    cache = cfg;
    return cfg;
  }

  function setFor(map, niveau) {
    return cache?.[map]?.[niveau] || new Set();
  }

  function champDisponible(niveau, code) {
    if (!niveau || !cache) return true;
    return setFor('champs', niveau).has(String(code));
  }

  function entiteDisponible(niveau, type, id) {
    if (!niveau || !id || !cache) return true;
    const map = type === 'secteur_therapeutique'
      ? 'secteurs'
      : type === 'classe_therapeutique'
        ? 'classesTherapeutiques'
        : type === 'classe_pharmacologique'
          ? 'classesPharmacologiques'
          : null;
    return !map || setFor(map, niveau).has(String(id));
  }

  function ficheDisponible(row, niveau) {
    if (!row || !niveau || !cache) return true;
    const dimensions = [
      ['secteur_therapeutique', 'secteurs'],
      ['classe_therapeutique', 'classesTherapeutiques'],
      ['classe_pharmacologique', 'classesPharmacologiques'],
    ];
    return dimensions.every(([code, map]) => {
      const ids = global.JpMedicaments?.idsOf?.(row, code) || [];
      if (!ids.length) return true;
      const allowed = setFor(map, niveau);
      return ids.some((id) => allowed.has(String(id)));
    });
  }

  function filtrerMedicaments(rows, niveau) {
    return (rows || []).filter((r) =>
      global.JpMedicaments.visiblePourNiveau(r, niveau)
      && ficheDisponible(r, niveau)
    );
  }

  function filtrerEntites(items, niveau, type) {
    return (items || []).filter((item) => entiteDisponible(niveau, type, item.id));
  }

  function champsPourNiveau(niveau, champs) {
    return (champs || []).filter((c) => champDisponible(niveau, c.code || c));
  }

  async function enregistrer(niveau, config) {
    const { error } = await sb().rpc('enregistrer_configuration_niveau', {
      p_niveau: niveau,
      p_secteurs: config.secteurs || [],
      p_classes_therapeutiques: config.classesTherapeutiques || [],
      p_classes_pharmacologiques: config.classesPharmacologiques || [],
      p_champs: config.champs || [],
    });
    if (error) throw error;
    return load(true);
  }

  global.JpNiveaux = {
    load,
    champDisponible,
    entiteDisponible,
    ficheDisponible,
    filtrerMedicaments,
    filtrerEntites,
    champsPourNiveau,
    enregistrer,
    get cache() { return cache; },
  };
})(window);
