/**
 * Clients Supabase Jeu Pharma — schéma portail + jeupharma.
 * Prérequis : shared/supabase-config.js + @supabase/supabase-js.
 */
(function (global) {
  /** UUID `portail.sites` Jeu Pharma — aligné SQL `has_jeupharma_access` + STATE.md */
  const SITE_ID = 'd4fc7fd0-944b-4594-9ba2-e1e2035aeddc';
  const SCHEMA = 'jeupharma';

  function getCfg() {
    const cfg = global.SUPABASE_CONFIG;
    if (!cfg?.url || !cfg?.anonKey) {
      throw new Error('SUPABASE_CONFIG manquant');
    }
    return cfg;
  }

  function createPortailClient() {
    const cfg = getCfg();
    return supabase.createClient(cfg.url, cfg.anonKey, {
      db: { schema: 'portail' },
    });
  }

  function createJeuClient() {
    const cfg = getCfg();
    return supabase.createClient(cfg.url, cfg.anonKey, {
      db: { schema: SCHEMA },
    });
  }

  let _sbPortail = null;
  let _sbJeu = null;
  let _adminCache = null;

  function sbPortail() {
    if (!_sbPortail) _sbPortail = createPortailClient();
    return _sbPortail;
  }

  function sbJeu() {
    if (!_sbJeu) _sbJeu = createJeuClient();
    return _sbJeu;
  }

  /**
   * Admin métier = portail.profiles.role === 'admin'.
   * @param {{ force?: boolean }} [opts]
   */
  async function isAdmin(opts = {}) {
    if (!opts.force && _adminCache != null) return _adminCache;
    try {
      const sb = sbPortail();
      const { data: { user }, error: authErr } = await sb.auth.getUser();
      if (authErr || !user) {
        _adminCache = false;
        return false;
      }
      const { data: profile } = await sb
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      _adminCache = profile?.role === 'admin';
      return _adminCache;
    } catch (_) {
      _adminCache = false;
      return false;
    }
  }

  async function getUser() {
    const { data: { user }, error } = await sbPortail().auth.getUser();
    if (error) return null;
    return user;
  }

  async function getDisplayName(userId) {
    if (!userId) return null;
    try {
      const { data } = await sbPortail()
        .from('profiles')
        .select('display_name')
        .eq('id', userId)
        .maybeSingle();
      return data?.display_name || null;
    } catch (_) {
      return null;
    }
  }

  global.JpApp = {
    SITE_ID,
    SCHEMA,
    getCfg,
    createPortailClient,
    createJeuClient,
    sbPortail,
    sbJeu,
    isAdmin,
    getUser,
    getDisplayName,
  };
})(window);
