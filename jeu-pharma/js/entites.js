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

  /** Compacte espaces / apostrophes pour comparer des libellés proches. */
  function compactNorm(valeur) {
    return normaliser(valeur)
      .replace(/[''`´]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Distance d’édition (Levenshtein) avec sortie anticipée si > max. */
  function editDistanceAtMost(a, b, max) {
    const s = String(a || '');
    const t = String(b || '');
    if (s === t) return 0;
    const m = s.length;
    const n = t.length;
    if (Math.abs(m - n) > max) return max + 1;
    if (!m) return n;
    if (!n) return m;
    let prev = new Array(n + 1);
    let cur = new Array(n + 1);
    for (let j = 0; j <= n; j++) prev[j] = j;
    for (let i = 1; i <= m; i++) {
      cur[0] = i;
      let rowMin = cur[0];
      for (let j = 1; j <= n; j++) {
        const cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      const tmp = prev;
      prev = cur;
      cur = tmp;
    }
    return prev[n];
  }

  /**
   * True si deux libellés sont « proches » (quasi-doublons).
   * Même valeur_norm, l’un contient l’autre (court ≥ 4), ou très petite
   * distance d’édition (1–2) — pas « HTA » vs « insuffisance cardiaque ».
   */
  function estProche(a, b) {
    const na = compactNorm(a);
    const nb = compactNorm(b);
    if (!na || !nb) return false;
    if (na === nb) return true;
    const sh = na.length <= nb.length ? na : nb;
    const lo = na.length <= nb.length ? nb : na;
    if (sh.length >= 4 && lo.indexOf(sh) !== -1) return true;
    const maxLen = Math.max(na.length, nb.length);
    if (maxLen < 4) return false;
    const maxDist = maxLen <= 14 ? 1 : 2;
    if (Math.abs(na.length - nb.length) > maxDist) return false;
    return editDistanceAtMost(na, nb, maxDist) <= maxDist;
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
   * Première entité active « proche » du libellé (hors `excludeId`).
   * S’appuie sur list(ilike / valeur_norm) puis filtre client `estProche`.
   */
  async function findProcheActif(table, valeur, opts) {
    assertTable(table);
    const raw = String(valeur || '').trim();
    if (!raw) return null;
    const excludeId = opts && opts.excludeId != null ? String(opts.excludeId) : '';
    const exact = await findActiveByValeur(table, raw);
    if (exact && (!excludeId || String(exact.id) !== excludeId)) return exact;
    const rows = await list(table, { q: raw, actif: true, limit: 40 });
    let best = null;
    for (let i = 0; i < (rows || []).length; i++) {
      const r = rows[i];
      if (!r || (excludeId && String(r.id) === excludeId)) continue;
      if (!estProche(raw, r.valeur)) continue;
      if (compactNorm(r.valeur) === compactNorm(raw)) return r;
      if (!best) best = r;
    }
    return best;
  }

  /**
   * Trouve une entité active (norm / synonyme canonique) ou la crée.
   * Règle vocabulaire unique : HTA ≡ Hypertension ≡ Hypertension artérielle → même UUID.
   * Si `existingId` est fourni (id stable déjà connu), le retourne sans lookup/create
   * sauf si `valeur` force un rename (appelant doit alors passer par update).
   * Ne crée pas de quasi-doublon : un proche actif est réutilisé.
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
    const proche = await findProcheActif(table, v);
    if (proche) return proche;
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
    const proche = await findProcheActif(table, row.valeur);
    if (proche) {
      const err = new Error('Libellé trop proche de « ' + (proche.valeur || '') + ' »');
      err.code = 'proche';
      err.proche = proche;
      throw err;
    }
    const { data, error } = await sb().from(table).insert(row).select('*').single();
    if (error) throw error;
    return data;
  }

  async function update(table, id, patch) {
    assertTable(table);
    const row = {};
    if (patch.valeur != null) row.valeur = String(patch.valeur).trim();
    if (patch.actif != null) row.actif = !!patch.actif;
    if (row.valeur) {
      const cur = await getById(table, id);
      if (cur && compactNorm(cur.valeur) === compactNorm(row.valeur)) {
        // Même enregistrement, accents / espaces seulement → OK (éventuel no-op DB).
      } else {
        const proche = await findProcheActif(table, row.valeur, { excludeId: id });
        if (proche) {
          const err = new Error('Libellé trop proche de « ' + (proche.valeur || '') + ' »');
          err.code = 'proche';
          err.proche = proche;
          throw err;
        }
      }
    }
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
    compactNorm,
    estProche,
    findProcheActif,
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
