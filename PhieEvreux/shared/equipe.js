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

  /** Liste équipe (admin). */
  async function listMembers() {
    const sb = global.PhieEvreuxApps.createAppsClient();
    const { data, error } = await sb
      .from('equipe')
      .select('user_id, role, created_at')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
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
