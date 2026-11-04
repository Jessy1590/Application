/* Lectures jeupharma — schéma anon, session authentifiée (RLS). */
(function (global) {
  let sb = null;

  function client() {
    if (sb) return sb;
    const cfg = global.V3CFG || {};
    if (!cfg.url || !cfg.anonKey || !global.supabase) {
      throw new Error('Config Supabase manquante');
    }
    sb = global.supabase.createClient(cfg.url, cfg.anonKey, {
      db: { schema: 'jeupharma' },
    });
    return sb;
  }

  function noms(v) {
    if (!v) return '';
    if (typeof v === 'string') return v;
    if (Array.isArray(v)) {
      return v.map((n) => (n && typeof n === 'object' ? (n.valeur || '') : n)).filter(Boolean).join(', ');
    }
    return '';
  }

  function matriceIdsFromPayload(payload) {
    const ids = new Set();
    function fromLayer(src) {
      if (!src || typeof src !== 'object') return;
      if (Array.isArray(src.matrice_ids)) {
        src.matrice_ids.forEach((id) => { if (id) ids.add(String(id)); });
      } else if (src.matrice_id) ids.add(String(src.matrice_id));
    }
    const p = payload && typeof payload === 'object' ? payload : {};
    fromLayer(p);
    if (p._brouillon && p._brouillon.payload) fromLayer(p._brouillon.payload);
    const variantes = p.variantes && typeof p.variantes === 'object' ? p.variantes : {};
    Object.keys(variantes).forEach((k) => fromLayer(variantes[k]));
    return Array.from(ids);
  }

  function isLab(row) {
    return !!(row && row.est_laboratoire);
  }

  async function lessons() {
    const { data, error } = await client()
      .from('modules_cours')
      .select('id, titre, est_groupe, parcours_apprentissage(libelle, est_laboratoire)')
      .eq('est_groupe', false)
      .order('titre');
    if (error) throw error;
    return (data || []).filter((m) => !isLab(m.parcours_apprentissage)).map((m) => ({
      id: m.id,
      kind: 'lecon',
      label: m.titre || 'Leçon',
      sub: (m.parcours_apprentissage && m.parcours_apprentissage.libelle) || '',
    }));
  }

  async function blocks() {
    const { data, error } = await client()
      .from('module_blocs')
      .select('id, titre, module_id, payload_json, modules_cours(titre, parcours_apprentissage(libelle, est_laboratoire))')
      .eq('type_bloc', 'molecule');
    if (error) throw error;
    return (data || []).filter((b) => {
      const mod = b.modules_cours;
      return !(mod && isLab(mod.parcours_apprentissage));
    }).map((b) => ({
      id: b.id,
      kind: 'bloc',
      label: b.titre || 'Bloc',
      sub: (b.modules_cours && b.modules_cours.titre) || '',
      matriceIds: matriceIdsFromPayload(b.payload_json),
    }));
  }

  async function searchMolecules(q) {
    const { data, error } = await client().rpc('v2_chercher_matrices', {
      p_q: q || null,
      p_secteur_norm: null,
      p_indication_norm: null,
      p_classe_ther_norm: null,
      p_classe_pharma_norm: null,
      p_limit: 15,
    });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    return rows.map((r) => ({
      id: r.id,
      kind: 'molecule',
      label: r.dci || '—',
      sub: typeof r.noms === 'string' ? r.noms : noms(r.noms),
    }));
  }

  async function blocsOfLessons(moduleIds) {
    if (!moduleIds.length) return [];
    const { data, error } = await client()
      .from('module_blocs')
      .select('id, module_id, titre, payload_json')
      .eq('type_bloc', 'molecule')
      .in('module_id', moduleIds);
    if (error) throw error;
    return data || [];
  }

  const COMPLET = 'id, dci, nom_commercial, noms_commerciaux, indications, contre_indications, effets_indesirables, precautions_emploi, interactions, surveillances, voies_administration, detail_pharmacologie, posologie_generale, grossesse_allaitement, secteur_therapeutique, classe_therapeutique, classe_pharmacologique, conditions_prescription_delivrance, conseils_delivrance';
  const LISTE = 'id, dci, nom_commercial, noms_commerciaux, indications, secteur_therapeutique, classe_therapeutique, classe_pharmacologique, detail_pharmacologie';

  async function fiches(ids) {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (!uniq.length) return [];
    let res = await client().from('v_medicaments_complet').select(COMPLET).in('id', uniq);
    if (res.error) res = await client().from('v_medicaments_liste').select(LISTE).in('id', uniq);
    if (res.error) throw res.error;
    return res.data || [];
  }

  async function composants(ids) {
    const uniq = Array.from(new Set(ids.filter(Boolean)));
    if (!uniq.length) return [];
    const { data, error } = await client()
      .from('matrice_composants')
      .select('matrice_id, composant_matrice_id, ordre')
      .in('matrice_id', uniq);
    if (error) return [];
    return data || [];
  }

  async function assosTouchant(composantIds) {
    const uniq = Array.from(new Set(composantIds.filter(Boolean)));
    if (uniq.length < 2) return [];
    const { data, error } = await client()
      .from('matrice_composants')
      .select('matrice_id, composant_matrice_id')
      .in('composant_matrice_id', uniq);
    if (error) return [];
    return data || [];
  }

  global.V3Data = {
    client,
    lessons,
    blocks,
    searchMolecules,
    blocsOfLessons,
    fiches,
    composants,
    assosTouchant,
    matriceIdsFromPayload,
    noms,
  };
})(window);
