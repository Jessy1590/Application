/**
 * Profil pédagogique — niveau d’apprentissage (jeupharma.profil_apprentissage).
 */
(function (global) {
  function sb() {
    return global.JpApp.sbJeu();
  }

  async function getProfil() {
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

  /**
   * @param {string|null} niveauId code niveaux (ex. apprenti) ou null pour effacer
   */
  async function upsertNiveau(niveauId) {
    const user = await global.JpApp.getUser();
    if (!user) throw new Error('Non connecté');
    const code = niveauId ? String(niveauId).trim() : null;
    if (code) {
      const known = (global.JpConstants?.NIVEAUX || []).some((n) => n.code === code);
      if (!known) throw new Error('Niveau invalide');
    }
    // Préserver parcours_id V2 si déjà renseigné (upsert partiel via select puis merge).
    let parcoursId = null;
    try {
      const cur = await getProfil();
      parcoursId = cur?.parcours_id || null;
    } catch (_) { /* ignore */ }
    const row = {
      user_id: user.id,
      niveau_id: code,
      updated_at: new Date().toISOString(),
    };
    if (parcoursId) row.parcours_id = parcoursId;
    const { data, error } = await sb()
      .from('profil_apprentissage')
      .upsert(row, { onConflict: 'user_id' })
      .select('user_id, niveau_id, parcours_id, updated_at')
      .single();
    if (error) throw error;
    void global.JpLogs?.action?.('profil_niveau', { niveau_id: code });
    return data;
  }

  /** @returns {Promise<string|null>} */
  async function getNiveauCode() {
    const p = await getProfil();
    return p?.niveau_id || null;
  }

  global.JpProfil = {
    getProfil,
    upsertNiveau,
    getNiveauCode,
  };
})(window);
