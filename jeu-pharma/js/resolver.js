/**
 * Client RPC résolveur V2 — seule source de vérité pour le contenu joueur.
 */
(function (global) {
  function sb() {
    return global.JpApp.sbJeu();
  }

  async function listerMedicaments(opts = {}) {
    const { data, error } = await sb().rpc('v2_lister_medicaments', {
      p_parcours: opts.parcoursId || null,
      p_module_ids: opts.moduleIds || null,
    });
    if (error) throw error;
    return Array.isArray(data) ? data : (data || []);
  }

  async function ficheResolue(matriceId, opts = {}) {
    const { data, error } = await sb().rpc('v2_fiche_resolue', {
      p_matrice_id: matriceId,
      p_parcours: opts.parcoursId || null,
      p_module_ids: opts.moduleIds || null,
    });
    if (error) throw error;
    return data;
  }

  async function progression(parcoursId) {
    const { data, error } = await sb().rpc('v2_progression_parcours', {
      p_parcours: parcoursId || null,
    });
    if (error) throw error;
    return data;
  }

  async function listParcours() {
    const { data, error } = await sb()
      .from('parcours_apprentissage')
      .select('id, code, libelle, description, niveau_lie, mode_contenu, ordre, actif')
      .eq('actif', true)
      .order('ordre');
    if (error) throw error;
    return data || [];
  }

  async function mesInscriptions() {
    const { data, error } = await sb().rpc('v2_lister_mes_inscriptions');
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  async function demanderParcours(parcoursId) {
    const { data, error } = await sb().rpc('v2_demander_parcours', {
      p_parcours_id: parcoursId,
    });
    if (error) throw error;
    void global.JpLogs?.action?.('v2_demande_parcours', { parcours_id: parcoursId });
    return data;
  }

  /** Active un parcours déjà accepté (pas d’auto-inscription). */
  async function setParcoursActif(parcoursId) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non connecté');
    if (parcoursId) {
      const insc = await mesInscriptions();
      const ok = insc.find((i) => i.parcours_id === parcoursId && i.statut === 'accepte');
      if (!ok) throw new Error('Parcours non autorisé');
    }
    const { data, error } = await sb()
      .from('profil_apprentissage')
      .upsert(
        {
          user_id: user.id,
          parcours_id: parcoursId || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select('user_id, niveau_id, parcours_id')
      .single();
    if (error) throw error;
    void global.JpLogs?.action?.('v2_parcours_actif', { parcours_id: parcoursId });
    return data;
  }

  async function getProfilV2() {
    const user = await global.JpApp.getUser();
    if (!user) return null;
    const { data, error } = await sb()
      .from('profil_apprentissage')
      .select('user_id, niveau_id, parcours_id, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Parcours actif si accepté ; sinon premier accepté. */
  async function ensureParcoursActif() {
    const profil = await getProfilV2();
    const insc = await mesInscriptions();
    const accepted = insc.filter((i) => i.statut === 'accepte');
    if (profil?.parcours_id && accepted.some((i) => i.parcours_id === profil.parcours_id)) {
      return profil;
    }
    if (!accepted.length) return profil;
    return setParcoursActif(accepted[0].parcours_id);
  }

  async function monEspace() {
    const { data, error } = await sb().rpc('v2_mon_espace');
    if (error) throw error;
    return data;
  }

  global.JpV2Resolver = {
    listerMedicaments,
    ficheResolue,
    progression,
    listParcours,
    mesInscriptions,
    demanderParcours,
    setParcoursActif,
    getProfilV2,
    ensureParcoursActif,
    monEspace,
  };
})(window);
