/**
 * Client BDPM lecture seule (schéma Supabase `bdm`).
 * Amorçage noms commerciaux + DCI uniquement — pas d’écriture métier.
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
   * Mappe une ligne `search_products` → préremplissage fiche.
   * DCI = 1ʳᵉ substance de `substances` (séparateur `, `), sinon vide.
   * @param {{ denomination?: string, substances?: string|null }} row
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

  global.JpBdm = {
    SCHEMA,
    sbBdm,
    searchProducts,
    pickToPrefill,
  };
})(window);
