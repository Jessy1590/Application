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
      .select('id, code, libelle, description, niveau_lie, mode_contenu, ordre')
      .eq('actif', true)
      .order('ordre');
    if (error) throw error;
    return data || [];
  }

  async function setParcoursActif(parcoursId) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non connecté');
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

    if (parcoursId) {
      await sb().from('inscriptions_parcours').upsert(
        { user_id: user.id, parcours_id: parcoursId, actif: true },
        { onConflict: 'user_id,parcours_id' }
      );
    }
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

  global.JpV2Resolver = {
    listerMedicaments,
    ficheResolue,
    progression,
    listParcours,
    setParcoursActif,
    getProfilV2,
  };
})(window);
