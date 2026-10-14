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

  function normKey(s) {
    return String(s || '').trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /**
   * Heuristique CIS recommandé : mono-substance, commercialisé, forme orale préférée.
   * @param {object[]} rows lignes search_products
   * @param {string} [dciHint]
   * @returns {object|null}
   */
  function pickRecommendedCis(rows, dciHint) {
    const list = Array.isArray(rows) ? rows : [];
    const hint = normKey(dciHint);
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
        const sn = normKey(subs[0]);
        if (sn === hint || sn.includes(hint) || hint.includes(sn)) score += 8;
      }
      if (String(r.match_reason || '') === 'dci') score += 4;
      if (score >= 8) scored.push({ r, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.r || list.find((r) => String(r.substances || '').split(', ').filter(Boolean).length === 1) || list[0] || null;
  }

  /**
   * Annotation courte de forme pour libellés multi-formes : "(oral)", "(crème)"…
   * @param {string} forme
   * @returns {string}
   */
  function formeAnnotation(forme) {
    const f = String(forme || '').toLowerCase();
    if (!f) return '';
    if (/cr[eè]me|pommade|gel\b/.test(f)) return 'crème';
    if (/patch|dispositif/.test(f)) return 'patch';
    if (/collyre|ophtalm/.test(f)) return 'collyre';
    if (/injectable|perfusion|intraveineuse|i\.?\s*v/.test(f)) return 'IV';
    if (/intramusculaire|i\.?\s*m/.test(f)) return 'IM';
    if (/sous.?cutan|s\.?\s*c/.test(f)) return 'SC';
    if (/suppositoire|rectal/.test(f)) return 'rectal';
    if (/spray|nasal/.test(f)) return 'nasal';
    if (/comprim|g[eé]lule|capsule|sachet|solution buvable|sirop|goutte|orale/.test(f)) return 'oral';
    const short = String(forme || '').trim().split(/[,\s]+/)[0];
    return short ? short.slice(0, 24).toLowerCase() : '';
  }

  /**
   * Agrège toutes les spécialités mono-substance d’une DCI (1 fiche = toutes formes).
   * @param {string} dci
   * @param {number} [lim=40]
   * @returns {Promise<{
   *   dci: string,
   *   specialites: object[],
   *   formes: string[],
   *   noms: string[],
   *   voies: string[],
   *   cis_list: string[],
   *   recommended: object|null,
   *   resume: string,
   *   contexte_bdm: object
   * }>}
   */
  async function listByDci(dci, lim = 40) {
    const label = String(dci || '').trim();
    if (!label) {
      return {
        dci: '', specialites: [], formes: [], noms: [], voies: [],
        cis_list: [], recommended: null, resume: '', contexte_bdm: {},
      };
    }
    const rows = await searchProducts(label, Math.max(10, Math.min(Number(lim) || 40, 50)));
    const hint = normKey(label);
    const mono = (rows || []).filter((r) => {
      const subs = String(r.substances || '').split(', ').map((s) => s.trim()).filter(Boolean);
      if (subs.length !== 1) return false;
      const sn = normKey(subs[0]);
      return !hint || sn === hint || sn.includes(hint) || hint.includes(sn);
    });
    const seenCis = new Set();
    const specialites = [];
    for (const r of mono) {
      const cis = String(r.cis || '').trim();
      if (!cis || seenCis.has(cis)) continue;
      seenCis.add(cis);
      specialites.push(r);
    }

    const formesSet = new Set();
    const nomsSet = new Set();
    const voiesSet = new Set();
    const cis_list = [];
    for (const r of specialites) {
      const forme = String(r.forme_pharmaceutique || '').trim();
      if (forme) formesSet.add(forme);
      const brand = String(r.denomination || '').trim().match(/^([A-Za-zÀ-ÿ0-9'’\-]+)/);
      if (brand?.[1]) nomsSet.add(brand[1].slice(0, 80));
      String(r.voies_administration || '').split(/[,;\/]+/).map((s) => s.trim()).filter(Boolean)
        .forEach((v) => voiesSet.add(v));
      if (r.cis) cis_list.push(String(r.cis));
    }

    // Enrichir voies via détail du CIS recommandé si manquant
    const recommended = pickRecommendedCis(specialites, label);
    if (recommended?.cis) {
      try {
        const detail = await getSpecialite(recommended.cis);
        String(detail?.voies_administration || '').split(/[,;\/]+/).map((s) => s.trim()).filter(Boolean)
          .forEach((v) => voiesSet.add(v));
        if (detail?.forme_pharmaceutique) formesSet.add(String(detail.forme_pharmaceutique).trim());
        if (detail?.numero_autorisation_europeenne) {
          recommended._eu = detail.numero_autorisation_europeenne;
        }
      } catch (_) { /* optionnel */ }
    }

    const formes = [...formesSet];
    const noms = [...nomsSet].slice(0, 12);
    const voies = [...voiesSet];
    const annos = [...new Set(formes.map(formeAnnotation).filter(Boolean))];
    const resume = [
      specialites.length + ' spécialité(s) mono-substance',
      formes.length ? formes.length + ' forme(s)' : '',
      annos.length ? 'annotations : ' + annos.map((a) => '(' + a + ')').join(' ') : '',
    ].filter(Boolean).join(' · ');

    const contexte_bdm = {
      denomination: recommended?.denomination || specialites[0]?.denomination || '',
      forme_pharmaceutique: recommended?.forme_pharmaceutique || formes[0] || '',
      voies_administration: voies.join(', '),
      etat_commercialisation: recommended?.etat_commercialisation || '',
      numero_autorisation_europeenne: recommended?._eu || '',
      substances: label,
      formes,
      noms_commerciaux_bdm: noms,
      cis_list: cis_list.slice(0, 20),
      resume_formes: resume,
      nb_specialites: specialites.length,
    };

    return {
      dci: label,
      specialites,
      formes,
      noms,
      voies,
      cis_list,
      recommended,
      resume,
      contexte_bdm,
    };
  }

  global.JpBdm = {
    SCHEMA,
    sbBdm,
    searchProducts,
    suggest,
    getSpecialite,
    pickToPrefill,
    pickRecommendedCis,
    formeAnnotation,
    listByDci,
  };
})(window);
