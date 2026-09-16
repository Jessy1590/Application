/**
 * Client Supabase schéma phieevreux (+ helpers portail).
 * Prérequis : shared/supabase-config.js + @supabase/supabase-js chargés.
 */
(function (global) {
  const SITE_ID = '9dd064a4-13ec-4cc2-9707-29210c3744ce';
  const SCHEMA = 'phieevreux';

  function getCfg() {
    const cfg = global.SUPABASE_CONFIG;
    if (!cfg?.url || !cfg?.anonKey) {
      throw new Error('SUPABASE_CONFIG manquant');
    }
    return cfg;
  }

  function createAppsClient() {
    const cfg = getCfg();
    return supabase.createClient(cfg.url, cfg.anonKey, {
      db: { schema: SCHEMA },
    });
  }

  function createPortailClient() {
    const cfg = getCfg();
    return supabase.createClient(cfg.url, cfg.anonKey, {
      db: { schema: 'portail' },
    });
  }

  global.PhieEvreuxApps = {
    SITE_ID,
    SCHEMA,
    getCfg,
    createAppsClient,
    createPortailClient,
  };
})(window);
