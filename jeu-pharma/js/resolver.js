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
    const args = {
      p_matrice_id: matriceId,
      p_parcours: opts.parcoursId || null,
      p_module_ids: opts.moduleIds || null,
    };
    const niv = opts.niveau != null && opts.niveau !== '' ? Number(opts.niveau) : null;
    if (niv >= 1 && niv <= 5) args.p_niveau = niv;
    const { data, error } = await sb().rpc('v2_fiche_resolue', args);
    if (error) throw error;
    return data;
  }

  /** Bulk : map { [matrice_id]: fiche } — 1 RPC (pubs visibles mutualisées). */
  async function fichesResolues(matriceIds, opts = {}) {
    const ids = Array.from(new Set((matriceIds || []).filter(Boolean)));
    if (!ids.length) return {};
    const args = {
      p_matrice_ids: ids,
      p_parcours: opts.parcoursId || null,
      p_module_ids: opts.moduleIds || null,
    };
    const niv = opts.niveau != null && opts.niveau !== '' ? Number(opts.niveau) : null;
    if (niv >= 1 && niv <= 5) args.p_niveau = niv;
    const { data, error } = await sb().rpc('v2_fiches_resolues', args);
    if (error) throw error;
    return data && typeof data === 'object' ? data : {};
  }

  async function progression(parcoursId) {
    const { data, error } = await sb().rpc('v2_progression_parcours', {
      p_parcours: parcoursId || null,
    });
    if (error) throw error;
    return data;
  }

  /** Critère d’un jeu pour une leçon — sans arbre progression complet. */
  async function critereJeu(modeleId, opts = {}) {
    const { data, error } = await sb().rpc('v2_critere_jeu', {
      p_modele_id: modeleId,
      p_module_id: opts.moduleId || null,
      p_parcours: opts.parcoursId || null,
    });
    if (error) throw error;
    return data;
  }

  async function listParcours() {
    const { data, error } = await sb()
      .from('parcours_apprentissage')
      .select('id, code, libelle, description, mode_contenu, ordre, actif')
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

  /**
   * Active un parcours déjà accepté (pas d’auto-inscription).
   * `opts.inscriptions` : réutilise un cache déjà chargé (évite un 2ᵉ mesInscriptions).
   */
  async function setParcoursActif(parcoursId, opts = {}) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non connecté');
    if (parcoursId) {
      const insc = Array.isArray(opts.inscriptions) ? opts.inscriptions : await mesInscriptions();
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
      .select('user_id, parcours_id')
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
      .select('user_id, parcours_id, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Parcours actif si accepté ; sinon premier accepté. */
  async function ensureParcoursActif() {
    const [profil, insc] = await Promise.all([getProfilV2(), mesInscriptions()]);
    const accepted = insc.filter((i) => i.statut === 'accepte');
    if (profil?.parcours_id && accepted.some((i) => i.parcours_id === profil.parcours_id)) {
      return profil;
    }
    if (!accepted.length) return profil;
    return setParcoursActif(accepted[0].parcours_id, { inscriptions: insc });
  }

  async function monEspace() {
    const { data, error } = await sb().rpc('v2_mon_espace');
    if (error) throw error;
    return data;
  }

  /** Parcours actifs + état d’inscription, verrou (parcours prérequis), progression et date de mise à jour. */
  async function parcoursListe() {
    const { data, error } = await sb().rpc('v2_parcours_liste');
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  /**
   * Enregistre la lecture (0–100 %) d’une leçon ; ≥ 95 % = lue (critère « lecture »).
   * Renvoie { detail } (état de validation de la leçon).
   */
  async function enregistrerLecture(moduleId, pct) {
    const { data, error } = await sb().rpc('v2_enregistrer_lecture', {
      p_module_id: moduleId,
      p_pct: Math.round(Number(pct) || 0),
    });
    if (error) throw error;
    return data;
  }

  global.JpV2Resolver = {
    listerMedicaments,
    ficheResolue,
    fichesResolues,
    progression,
    critereJeu,
    listParcours,
    mesInscriptions,
    demanderParcours,
    setParcoursActif,
    getProfilV2,
    ensureParcoursActif,
    monEspace,
    parcoursListe,
    enregistrerLecture,
  };
})(window);
