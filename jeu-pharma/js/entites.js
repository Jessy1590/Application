/**
 * CRUD générique entités jeupharma (schéma jeupharma, clé anon + RLS admin).
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
      // Recherche insensible casse + accents (valeur et valeur_norm).
      const term = String(opts.q).trim().replace(/[,()*%"\\]/g, ' ').trim();
      if (term) {
        const qn = normaliser(term);
        query = query.or('valeur.ilike.*' + term + '*,valeur_norm.ilike.*' + qn + '*');
      }
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

  /** Candidats valeur_norm : norme JS (NFD) + lower seul. */
  function normCandidates(valeur) {
    const v = String(valeur || '').trim();
    if (!v) return [];
    const lower = v.toLowerCase();
    const nfd = normaliser(v);
    return [...new Set([nfd, lower].filter(Boolean))];
  }

  /** Entité active dont valeur_norm matche la valeur. */
  async function findActiveByValeur(table, valeur) {
    assertTable(table);
    for (const norm of normCandidates(valeur)) {
      const { data, error } = await sb()
        .from(table)
        .select('id, valeur, valeur_norm, actif')
        .eq('valeur_norm', norm)
        .eq('actif', true)
        .maybeSingle();
      if (error) throw error;
      if (data) return data;
    }
    const v = String(valeur || '').trim().replace(/[%_]/g, '');
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

  /** Trouve une entité active (norm) ou la crée. */
  async function findOrCreate(table, valeur) {
    assertTable(table);
    const v = String(valeur || '').trim();
    if (!v) return null;
    const existing = await findActiveByValeur(table, v);
    if (existing) return existing;
    try {
      return await create(table, { valeur: v });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const again = await findActiveByValeur(table, v);
      if (!again) throw err;
      return again;
    }
  }

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

  async function update(table, id, patch) {
    assertTable(table);
    const row = {};
    if (patch.valeur != null) row.valeur = String(patch.valeur).trim();
    if (patch.actif != null) row.actif = !!patch.actif;
    const { data, error } = await sb().from(table).update(row).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  }

  /** Soft-delete (actif=false). */
  async function softDelete(table, id) {
    return update(table, id, { actif: false });
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
  };
})(window);
