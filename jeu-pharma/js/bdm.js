/**
 * Client BDPM lecture seule (schéma Supabase `bdm`, clé anon).
 * Amorçage noms commerciaux + DCI + détail CIS — pas d’écriture métier.
 * Une fiche = une DCI ; le nom BDPM s’ajoute à la liste des noms.
 */
(function (global) {
  const SCHEMA = 'bdm';

  let _sbBdm = null;

  function sbBdm() {
    if (_sbBdm) return _sbBdm;
    const cfg = global.JpApp?.getCfg?.() || global.SUPABASE_CONFIG;
    if (!cfg?.url || !cfg?.anonKey) {
      throw new Error('SUPABASE_CONFIG manquant');
    }
    _sbBdm = supabase.createClient(cfg.url, cfg.anonKey, {
      db: { schema: SCHEMA },
    });
    return _sbBdm;
  }

  /**
   * @param {string} q
   * @param {number} [lim=20]
   * @returns {Promise<object[]>}
   */
  async function searchProducts(q, lim = 20) {
    const query = String(q || '').trim();
    if (query.length < 2) return [];
    const limit = Math.max(1, Math.min(Number(lim) || 20, 50));
    const { data, error } = await sbBdm().rpc('search_products', {
      q: query,
      lim: limit,
    });
    if (error) throw error;
    return data || [];
  }

  /**
   * Suggestions typées (spécialité / substance / générique).
   * @param {string} q
   * @param {number} [lim=20]
   * @returns {Promise<object[]>}
   */
  async function suggest(q, lim = 20) {
    const query = String(q || '').trim();
    if (query.length < 2) return [];
    const limit = Math.max(1, Math.min(Number(lim) || 20, 40));
    const { data, error } = await sbBdm().rpc('suggest', {
      q: query,
      lim: limit,
    });
    if (error) throw error;
    return data || [];
  }

  /**
   * Détail d’une spécialité + substances actives (pour wizard IA / CIS).
   * @param {string} cis
   * @returns {Promise<object|null>}
   */
  async function getSpecialite(cis) {
    const code = String(cis || '').trim();
    if (!code) return null;
    const { data: sp, error } = await sbBdm()
      .from('specialites')
      .select('cis, denomination, forme_pharmaceutique, voies_administration, etat_commercialisation, numero_autorisation_europeenne, titulaires, statut_amm')
      .eq('cis', code)
      .maybeSingle();
    if (error) throw error;
    if (!sp) return null;

    const { data: comps, error: e2 } = await sbBdm()
      .from('compositions')
      .select('denomination_substance, dosage, nature_composant, code_substance')
      .eq('cis', code)
      .order('numero_lien', { ascending: true });
    if (e2) throw e2;

    const actives = (comps || []).filter((c) => {
      const nat = String(c.nature_composant || '').toUpperCase();
      return !nat || nat === 'SA' || nat.startsWith('SA');
    });
    const substances = (actives.length ? actives : comps || [])
      .map((c) => String(c.denomination_substance || '').trim())
      .filter(Boolean);
    const uniq = [...new Set(substances)];

    return {
      ...sp,
      substances: uniq.join(', '),
      substances_list: uniq,
      compositions: comps || [],
      mono_substance: uniq.length === 1,
    };
  }

  /**
   * Mappe une ligne `search_products` → préremplissage fiche.
   * DCI = 1ʳᵉ substance de `substances` (séparateur `, `), sinon vide.
   * @returns {{ nom_commercial: string, dci: string }}
   */
  function pickToPrefill(row) {
    const nom = String(row?.denomination || '').trim();
    const substances = String(row?.substances || '').trim();
    const dci = substances
      ? substances.split(', ').map((s) => s.trim()).filter(Boolean)[0] || ''
      : '';
    return { nom_commercial: nom, dci };
  }

  /**
   * Heuristique CIS recommandé : mono-substance, commercialisé, forme orale préférée.
   * @param {object[]} rows lignes search_products
   * @param {string} [dciHint]
   * @returns {object|null}
   */
  function pickRecommendedCis(rows, dciHint) {
    const list = Array.isArray(rows) ? rows : [];
    const hint = String(dciHint || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const scored = [];
    for (const r of list) {
      const subs = String(r.substances || '').split(', ').map((s) => s.trim()).filter(Boolean);
      if (subs.length !== 1) continue;
      let score = 0;
      const etat = String(r.etat_commercialisation || '').toLowerCase();
      if (etat.includes('commercialis')) score += 12;
      const forme = String(r.forme_pharmaceutique || r.denomination || '').toLowerCase();
      if (/comprim|g[eé]lule|capsule|solution buvable|goutte/.test(forme)) score += 10;
      else if (/injectable|perfusion|intraveineuse/.test(forme)) score -= 2;
      if (hint) {
        const sn = subs[0].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        if (sn === hint || sn.includes(hint) || hint.includes(sn)) score += 8;
      }
      if (String(r.match_reason || '') === 'dci') score += 4;
      if (score >= 8) scored.push({ r, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.r || list.find((r) => String(r.substances || '').split(', ').filter(Boolean).length === 1) || list[0] || null;
  }

  global.JpBdm = {
    SCHEMA,
    sbBdm,
    searchProducts,
    suggest,
    getSpecialite,
    pickToPrefill,
    pickRecommendedCis,
  };
})(window);
