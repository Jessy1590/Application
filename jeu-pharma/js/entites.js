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
   * Charge par pages de 1000 (plafond PostgREST) jusqu’à `limit` (défaut 500, max 10 000).
   */
  async function list(table, opts = {}) {
    assertTable(table);
    const max = Math.min(Math.max(1, Number(opts.limit) || 500), 10000);
    const PAGE = 1000;
    const out = [];

    for (let from = 0; from < max; from += PAGE) {
      const to = Math.min(from + PAGE, max) - 1;
      let query = sb()
        .from(table)
        .select('id, valeur, valeur_norm, actif, created_at, updated_at')
        .order('valeur', { ascending: true })
        .range(from, to);
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
      const rows = data || [];
      out.push.apply(out, rows);
      if (rows.length < PAGE) break;
    }
    return out;
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

  /**
   * Résout un alias pédagogique (vocabulaire_alias) → libellé canonique.
   * Ex. HTA / Hypertension → « Hypertension artérielle ».
   */
  async function resolveAliasCanonique(table, valeur) {
    const v = String(valeur || '').trim();
    if (!v) return null;
    for (const norm of normCandidates(v)) {
      const { data, error } = await sb()
        .from('vocabulaire_alias')
        .select('valeur_canonique')
        .eq('table_name', table)
        .eq('alias_norm', norm)
        .maybeSingle();
      if (error) {
        // Table absente / RLS : ignorer silencieusement
        if (/vocabulaire_alias|schema cache|does not exist/i.test(String(error.message || ''))) return null;
        throw error;
      }
      if (data?.valeur_canonique) return String(data.valeur_canonique).trim();
    }
    // Pluriel simple → alias singulier
    const n0 = normaliser(v);
    if (n0.endsWith('s') && n0.length > 4) {
      const stem = n0.slice(0, -1);
      const { data } = await sb()
        .from('vocabulaire_alias')
        .select('valeur_canonique')
        .eq('table_name', table)
        .eq('alias_norm', stem)
        .maybeSingle();
      if (data?.valeur_canonique) return String(data.valeur_canonique).trim();
    }
    return null;
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

  /**
   * Trouve une entité active (norm / synonyme canonique) ou la crée.
   * Règle vocabulaire unique : HTA ≡ Hypertension ≡ Hypertension artérielle → même UUID.
   * Si `existingId` est fourni (id stable déjà connu), le retourne sans lookup/create
   * sauf si `valeur` force un rename (appelant doit alors passer par update).
   */
  async function findOrCreate(table, valeur, existingId) {
    assertTable(table);
    if (existingId && (valeur == null || String(valeur).trim() === '')) {
      return getById(table, existingId);
    }
    const raw = String(valeur || '').trim();
    if (!raw) return null;
    if (existingId) {
      const cur = await getById(table, existingId);
      if (cur && normaliser(cur.valeur) === normaliser(raw)) return cur;
    }
    const canon = await resolveAliasCanonique(table, raw);
    const v = canon || raw;
    const existing = await findActiveByValeur(table, v);
    if (existing) return existing;
    if (canon && canon !== raw) {
      const byRaw = await findActiveByValeur(table, raw);
      if (byRaw) return byRaw;
    }
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
    resolveAliasCanonique,
    findActiveByValeur,
    list,
    getById,
    findOrCreate,
    create,
    update,
    softDelete,
  };
})(window);
