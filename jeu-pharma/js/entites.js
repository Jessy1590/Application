/**
 * CRUD générique entités jeupharma + niveaux_connus + fusion.
 */
(function (global) {
  function sb() {
    return global.JpApp.sbJeu();
  }

  function normaliser(valeur) {
    return String(valeur || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
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
      .select('id, valeur, valeur_norm, niveaux_connus, actif, created_at, updated_at')
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
      .select('id, valeur, valeur_norm, niveaux_connus, actif, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /**
   * Trouve une entité active par valeur (norm) ou la crée.
   * @param {string} table
   * @param {string} valeur
   * @param {string[]} [niveaux]
   * @param {{ mergeNiveaux?: boolean }} [opts] — merge = union (CSV) ; sinon remplacement
   */
  async function findOrCreate(table, valeur, niveaux, opts = {}) {
    assertTable(table);
    const v = String(valeur || '').trim();
    if (!v) return null;
    const norm = normaliser(v);
    const { data: existing, error: findErr } = await sb()
      .from(table)
      .select('id, valeur, niveaux_connus, actif')
      .eq('valeur_norm', norm)
      .eq('actif', true)
      .maybeSingle();
    if (findErr) throw findErr;
    if (existing) {
      if (Array.isArray(niveaux)) {
        const next = opts.mergeNiveaux
          ? Array.from(new Set([...(existing.niveaux_connus || []), ...niveaux]))
          : niveaux;
        const prev = [...(existing.niveaux_connus || [])].sort().join('|');
        const nxt = [...next].sort().join('|');
        if (prev !== nxt) {
          return update(table, existing.id, { niveaux_connus: next });
        }
      }
      return existing;
    }
    return create(table, {
      valeur: v,
      niveaux_connus: Array.isArray(niveaux) ? niveaux : [],
    });
  }

  /**
   * @param {string} table
   * @param {{ valeur: string, niveaux_connus?: string[], actif?: boolean }} payload
   */
  async function create(table, payload) {
    assertTable(table);
    const row = {
      valeur: String(payload.valeur || '').trim(),
      niveaux_connus: Array.isArray(payload.niveaux_connus) ? payload.niveaux_connus : [],
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
   * @param {{ valeur?: string, niveaux_connus?: string[], actif?: boolean }} patch
   */
  async function update(table, id, patch) {
    assertTable(table);
    const row = {};
    if (patch.valeur != null) row.valeur = String(patch.valeur).trim();
    if (patch.niveaux_connus != null) row.niveaux_connus = patch.niveaux_connus;
    if (patch.actif != null) row.actif = !!patch.actif;
    const { data, error } = await sb().from(table).update(row).eq('id', id).select('*').single();
    if (error) throw error;
    return data;
  }

  /** Soft-delete (actif=false) — pas de hard-delete si référencé. */
  async function softDelete(table, id) {
    return update(table, id, { actif: false });
  }

  /**
   * Met à jour niveaux_connus pour plusieurs ids.
   * @param {string} table
   * @param {string[]} ids
   * @param {string[]} niveaux
   */
  async function updateNiveauxBulk(table, ids, niveaux) {
    assertTable(table);
    if (!ids?.length) return [];
    const { data, error } = await sb()
      .from(table)
      .update({ niveaux_connus: niveaux || [] })
      .in('id', ids)
      .select('id, valeur, niveaux_connus');
    if (error) throw error;
    return data || [];
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
    list,
    getById,
    findOrCreate,
    create,
    update,
    softDelete,
    updateNiveauxBulk,
    fusionner,
  };
})(window);
