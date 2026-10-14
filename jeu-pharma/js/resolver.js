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
    // #region agent log
    try {
      const champs = data?.champs || {};
      const detail0 = champs.detail_pharmacologie?.[0]?.valeur || null;
      const __dbg = {
        sessionId: '257be1',
        runId: 'post-fix-055',
        hypothesisId: 'REF',
        location: 'resolver.js:ficheResolue',
        message: 'fiche resolue source',
        data: {
          matriceId,
          source: data?.source || null,
          nChamps: Object.keys(champs).length,
          detail0: detail0 ? String(detail0).slice(0, 80) : null,
          hasFe: /Fe2\+|fer ferreux/i.test(detail0 || ''),
          hasOldAtc: /PREPARATIONS ANTIANEMIQUES|BO3AA07/i.test(JSON.stringify(champs)),
        },
        timestamp: Date.now(),
      };
      global.__JP_DBG_FICHE = __dbg;
      fetch('http://127.0.0.1:7615/ingest/3b03709f-83a7-40e8-aca7-8515e77f385c', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '257be1' },
        body: JSON.stringify(__dbg),
      }).catch(() => {});
    } catch (_) { /* ignore */ }
    // #endregion
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
    progression,
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
