/**
 * Droits PhieEvreux : admin portail ∪ phieevreux.equipe.role
 * administrateur | gestionnaire | personnel
 */
(function (global) {
  const ROLES = Object.freeze({
    ADMINISTRATEUR: 'administrateur',
    GESTIONNAIRE: 'gestionnaire',
    PERSONNEL: 'personnel',
  });

  const state = {
    ready: false,
    userId: null,
    portailAdmin: false,
    equipeRole: null,
    displayName: null,
  };

  async function load() {
    const apps = global.PhieEvreuxApps;
    if (!apps) throw new Error('PhieEvreuxApps manquant');

    const portail = apps.createPortailClient();
    const { data: { user }, error: authErr } = await portail.auth.getUser();
    if (authErr || !user) {
      Object.assign(state, {
        ready: true,
        userId: null,
        portailAdmin: false,
        equipeRole: null,
        displayName: null,
      });
      return getSnapshot();
    }

    state.userId = user.id;

    const { data: profile } = await portail
      .from('profiles')
      .select('role, display_name, email')
      .eq('id', user.id)
      .maybeSingle();

    state.portailAdmin = profile?.role === 'admin';
    state.displayName = profile?.display_name || profile?.email || user.email || null;

    const sb = apps.createAppsClient();
    const { data: row } = await sb
      .from('equipe')
      .select('role')
      .eq('user_id', user.id)
      .maybeSingle();

    state.equipeRole = row?.role || null;
    state.ready = true;
    return getSnapshot();
  }

  function getSnapshot() {
    return {
      ready: state.ready,
      userId: state.userId,
      portailAdmin: state.portailAdmin,
      equipeRole: state.equipeRole,
      displayName: state.displayName,
      isAdmin: isAdmin(),
      isGestionnaire: isGestionnaire(),
      canManageEquipe: canManageEquipe(),
      canInvite: canInvite(),
      canManageBugs: canManageBugs(),
    };
  }

  function isAdmin() {
    return state.portailAdmin || state.equipeRole === ROLES.ADMINISTRATEUR;
  }

  function isGestionnaire() {
    return isAdmin() || state.equipeRole === ROLES.GESTIONNAIRE;
  }

  function canManageEquipe() {
    return isAdmin();
  }

  function canInvite() {
    return isAdmin();
  }

  function canManageBugs() {
    return isAdmin();
  }

  /**
   * Liste admin : tous les utilisateurs avec accès site PhieEvreux
   * (portail.site_access), enrichis profil + rôle equipe (peut être null).
   */
  async function listMembers() {
    const apps = global.PhieEvreuxApps;
    const portail = apps.createPortailClient();
    const sb = apps.createAppsClient();

    const { data: accessRows, error: accessErr } = await portail
      .from('site_access')
      .select('user_id, granted_at')
      .eq('site_id', apps.SITE_ID)
      .order('granted_at', { ascending: true });
    if (accessErr) throw accessErr;

    const userIds = (accessRows || []).map((r) => r.user_id);
    if (!userIds.length) return [];

    const [
      { data: profiles, error: profErr },
      { data: equipeRows, error: eqErr },
    ] = await Promise.all([
      portail.from('profiles').select('id, display_name, email').in('id', userIds),
      sb.from('equipe').select('user_id, role, created_at').in('user_id', userIds),
    ]);
    if (profErr) throw profErr;
    if (eqErr) throw eqErr;

    const profileById = Object.fromEntries((profiles || []).map((p) => [p.id, p]));
    const equipeById = Object.fromEntries((equipeRows || []).map((e) => [e.user_id, e]));

    return (accessRows || []).map((a) => {
      const p = profileById[a.user_id];
      const e = equipeById[a.user_id];
      return {
        user_id: a.user_id,
        role: e?.role || null,
        created_at: e?.created_at || a.granted_at,
        granted_at: a.granted_at,
        display_name: p?.display_name || null,
        email: p?.email || null,
      };
    });
  }

  async function setRole(userId, role) {
    if (!canManageEquipe()) throw new Error('Droits insuffisants');
    if (![ROLES.ADMINISTRATEUR, ROLES.GESTIONNAIRE, ROLES.PERSONNEL].includes(role)) {
      throw new Error('Rôle invalide');
    }
    const sb = global.PhieEvreuxApps.createAppsClient();
    const { error } = await sb
      .from('equipe')
      .upsert({ user_id: userId, role }, { onConflict: 'user_id' });
    if (error) throw error;
  }

  async function removeMember(userId) {
    if (!canManageEquipe()) throw new Error('Droits insuffisants');
    const sb = global.PhieEvreuxApps.createAppsClient();
    const { error } = await sb.from('equipe').delete().eq('user_id', userId);
    if (error) throw error;
  }

  global.PhieEquipe = {
    ROLES,
    load,
    getSnapshot,
    isAdmin,
    isGestionnaire,
    canManageEquipe,
    canInvite,
    canManageBugs,
    listMembers,
    setRole,
    removeMember,
  };
})(window);
