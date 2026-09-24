/**
 * Invitation utilisateur via Edge Function invite-user,
 * puis site_access PhieEvreux + ligne equipe (personnel).
 */
(function (global) {
  const DEFAULT_EQUIPE_ROLE = 'personnel';
  const PORTAIL_ROLE = 'member';

  /**
   * @param {{ email: string, password: string, displayName?: string }} opts
   * @returns {Promise<{ userId: string, email: string }>}
   */
  async function inviteUser(opts) {
    const apps = global.PhieEvreuxApps;
    if (!apps) throw new Error('PhieEvreuxApps manquant');
    if (!global.PhieEquipe?.canInvite?.()) {
      throw new Error('Droits insuffisants pour inviter');
    }

    const email = String(opts.email || '').trim();
    const password = String(opts.password || '');
    const displayName = String(opts.displayName || '').trim() || email;
    if (!email || !password) throw new Error('E-mail et mot de passe requis');

    const cfg = apps.getCfg();
    const portail = apps.createPortailClient();
    const { data: { session } } = await portail.auth.getSession();
    if (!session?.access_token) throw new Error('Session expirée');

    const res = await fetch(`${cfg.url}/functions/v1/invite-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
        apikey: cfg.anonKey,
      },
      body: JSON.stringify({
        email,
        password,
        display_name: displayName,
        role: PORTAIL_ROLE,
      }),
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || 'Erreur lors de la création du compte');
    }

    const userId = body.user?.id;
    if (!userId) throw new Error('Réponse invite-user incomplète');

    const { error: accessErr } = await portail.from('site_access').upsert(
      { user_id: userId, site_id: apps.SITE_ID },
      { onConflict: 'user_id,site_id' }
    );
    if (accessErr) throw new Error(`Compte créé mais accès site : ${accessErr.message}`);

    const sb = apps.createAppsClient();
    const { error: equipeErr } = await sb.from('equipe').upsert(
      { user_id: userId, role: DEFAULT_EQUIPE_ROLE },
      { onConflict: 'user_id' }
    );
    if (equipeErr) throw new Error(`Compte créé mais équipe : ${equipeErr.message}`);

    return { userId, email };
  }

  global.PhieInvite = { inviteUser, DEFAULT_EQUIPE_ROLE };
})(window);
