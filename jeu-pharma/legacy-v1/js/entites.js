/**
 * CRUD générique entités jeupharma + fusion.
 */
(function (global) {
  function sb() {
    return global.JpApp.sbJeu();
  }

  /** Aligné sur jeupharma.normaliser_valeur (NFD + strip diacritiques). */
  function normaliser(valeur) {
    return String(valeur || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function isUniqueViolation(err) {
    if (!err) return false;
    const code = err.code || err.code?.toString?.();
    if (code === '23505') return true;
    const msg = String(err.message || err.details || '');
    return /duplicate key|unique constraint|_valeur_norm_actif_uidx/i.test(msg);
  }

  function assertTable(table) {
    const ok = (global.JpConstants?.ENTITY_TABLES || []).some((t) => t.table === table);
    if (!ok) throw new Error('Table d’entité inconnue: ' + table);
  }

  /**
   * @param {string} table
   * @param {{ q?: string, actif?: boolean|null, limit?: number }} [opts]
   */
  async function list(table, opts = {}) {
    assertTable(table);
    let query = sb()
      .from(table)
      .select('id, valeur, valeur_norm, actif, created_at, updated_at')
      .order('valeur', { ascending: true })
      .limit(opts.limit || 500);
    if (opts.actif === true) query = query.eq('actif', true);
    else if (opts.actif === false) query = query.eq('actif', false);
    if (opts.q && String(opts.q).trim()) {
      query = query.ilike('valeur', '%' + String(opts.q).trim() + '%');
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function getById(table, id) {
    assertTable(table);
    const { data, error } = await sb()
      .from(table)
      .select('id, valeur, valeur_norm, actif, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Candidats valeur_norm : norme JS (NFD) + lower seul (legacy SQL avant 003).
   * @param {string} valeur
   * @returns {string[]}
   */
  function normCandidates(valeur) {
    const v = String(valeur || '').trim();
    if (!v) return [];
    const lower = v.toLowerCase();
    const nfd = normaliser(v);
    return [...new Set([nfd, lower].filter(Boolean))];
  }

  /**
   * Trouve une entité active dont valeur_norm matche la valeur (plusieurs normes).
   */
  async function findActiveByValeur(table, valeur) {
    assertTable(table);
    const candidates = normCandidates(valeur);
    for (const norm of candidates) {
      const { data, error } = await sb()
        .from(table)
        .select('id, valeur, valeur_norm, actif')
        .eq('valeur_norm', norm)
        .eq('actif', true)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
    }
    // Dernier recours : égalité insensible à la casse sur valeur affichée
    const v = String(valeur || '').trim();
    if (!v) return null;
    const { data, error } = await sb()
      .from(table)
      .select('id, valeur, valeur_norm, actif')
      .ilike('valeur', v)
      .eq('actif', true)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  /**
   * Trouve une entité active par valeur (norm) ou la crée.
   * @param {string} table
   * @param {string} valeur
   */
  async function findOrCreate(table, valeur) {
    assertTable(table);
    const v = String(valeur || '').trim();
    if (!v) return null;

    const existing = await findActiveByValeur(table, v);
    if (existing) return existing;

    try {
      return await create(table, {
        valeur: v,
      });
    } catch (err) {
      // Course / mismatch norm → réutiliser la ligne déjà présente
      if (!isUniqueViolation(err)) throw err;
      const again = await findActiveByValeur(table, v);
      if (!again) throw err;
      return again;
    }
  }

  /**
   * @param {string} table
   * @param {{ valeur: string, actif?: boolean }} payload
   */
  async function create(table, payload) {
    assertTable(table);
    const row = {
      valeur: String(payload.valeur || '').trim(),
      actif: payload.actif !== false,
    };
    if (!row.valeur) throw new Error('Valeur obligatoire');
    const { data, error } = await sb().from(table).insert(row).select('*').single();
    if (error) throw error;
    return data;
  }

  /**
   * @param {string} table
   * @param {string} id
   * @param {{ valeur?: string, actif?: boolean }} patch
   */
  async function update(table, id, patch) {
    assertTable(table);
    const row = {};
    if (patch.valeur != null) row.valeur = String(patch.valeur).trim();
    if (patch.actif != null) row.actif = !!patch.actif;
    const { data, error } = await sb().from(table).update(row).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  }

  /** Soft-delete (actif=false) — pas de hard-delete si référencé. */
  async function softDelete(table, id) {
    return update(table, id, { actif: false });
  }

  /** RPC fusionner_entites(table, id_keep, id_drop) */
  async function fusionner(table, idKeep, idDrop) {
    assertTable(table);
    const { error } = await sb().rpc('fusionner_entites', {
      p_table_name: table,
      p_id_keep: idKeep,
      p_id_drop: idDrop,
    });
    if (error) throw error;
  }

  global.JpEntites = {
    normaliser,
    normCandidates,
    findActiveByValeur,
    list,
    getById,
    findOrCreate,
    create,
    update,
    softDelete,
    fusionner,
  };
})(window);
