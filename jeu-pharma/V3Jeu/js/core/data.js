/* V3Data — lectures jeupharma (site de base, lecture seule) + auth. */
(function (global) {
  let sbJeu = null;
  let sbPortail = null;
  let cacheLessons = null;
  let cacheBlocks = null;

  const COMPLET = 'id, dci, nom_commercial, noms_commerciaux, indications, contre_indications, effets_indesirables, precautions_emploi, interactions, surveillances, voies_administration, detail_pharmacologie, posologie_generale, grossesse_allaitement, secteur_therapeutique, classe_therapeutique, classe_pharmacologique, conditions_prescription_delivrance, conseils_delivrance';
  const PAGE = 1000;
  const IN_CHUNK = 80;

  function cfg() {
    const c = global.V3CFG || {};
    if (!c.url || !c.anonKey || !global.supabase) throw new Error('Config Supabase manquante');
    return c;
  }

  function jeu() {
    if (sbJeu) return sbJeu;
    const c = cfg();
    sbJeu = global.supabase.createClient(c.url, c.anonKey, { db: { schema: 'jeupharma' } });
    return sbJeu;
  }

  function portail() {
    if (sbPortail) return sbPortail;
    const c = cfg();
    sbPortail = global.supabase.createClient(c.url, c.anonKey, { db: { schema: 'portail' } });
    return sbPortail;
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function safeTerm(q) {
    return String(q || '').replace(/[%_,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function idsFromPayload(payload) {
    const matrice = new Set();
    const masque = new Set();
    function layer(src) {
      if (!src || typeof src !== 'object') return;
      const mats = Array.isArray(src.matrice_ids)
        ? src.matrice_ids
        : (src.matrice_id ? [src.matrice_id] : []);
      mats.forEach(function (id) { if (id) matrice.add(String(id)); });
      (Array.isArray(src.masque_ids) ? src.masque_ids : []).forEach(function (id) {
        if (id) masque.add(String(id));
      });
    }
    const p = payload && typeof payload === 'object' ? payload : {};
    layer(p);
    const draft = p._brouillon && p._brouillon.payload;
    if (draft) {
      layer(draft);
      const dv = draft.variantes && typeof draft.variantes === 'object' ? draft.variantes : {};
      Object.keys(dv).forEach(function (k) { layer(dv[k]); });
    }
    const v = p.variantes && typeof p.variantes === 'object' ? p.variantes : {};
    Object.keys(v).forEach(function (k) { layer(v[k]); });
    return { matriceIds: Array.from(matrice), masqueIds: Array.from(masque) };
  }

  async function paged(build) {
    const out = [];
    for (let from = 0; ; from += PAGE) {
      const q = build();
      const { data, error } = await q.range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      out.push.apply(out, rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }

  async function inChunks(table, select, col, ids, extra) {
    const uniq = Array.from(new Set((ids || []).filter(Boolean).map(String)));
    if (!uniq.length) return [];
    const out = [];
    for (let i = 0; i < uniq.length; i += IN_CHUNK) {
      const slice = uniq.slice(i, i + IN_CHUNK);
      const rows = await paged(function () {
        let q = jeu().from(table).select(select).in(col, slice);
        if (extra) q = extra(q);
        return q;
      });
      out.push.apply(out, rows);
    }
    return out;
  }

  async function syncPortailSession(session) {
    if (!session) return;
    try {
      await portail().auth.setSession({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      });
    } catch (_) { /* ignore */ }
  }

  async function session() {
    const { data, error } = await jeu().auth.getSession();
    if (error) throw error;
    const s = data && data.session;
    if (s) await syncPortailSession(s);
    return s || null;
  }

  async function user() {
    const s = await session();
    return (s && s.user) || null;
  }

  async function signIn(email, password) {
    const { data, error } = await jeu().auth.signInWithPassword({ email: email, password: password });
    if (error) throw error;
    if (data.session) await syncPortailSession(data.session);
    return data.session;
  }

  async function signOut() {
    await jeu().auth.signOut();
    try { await portail().auth.signOut(); } catch (_) { /* ignore */ }
    cacheLessons = null;
    cacheBlocks = null;
  }

  async function isAdmin() {
    const u = await user();
    if (!u) return false;
    const { data, error } = await portail()
      .from('profiles')
      .select('role')
      .eq('id', u.id)
      .maybeSingle();
    if (error) throw error;
    return !!(data && data.role === 'admin');
  }

  function onAuth(cb) {
    return jeu().auth.onAuthStateChange(function (_e, s) {
      if (s) syncPortailSession(s);
      cb(s || null);
    });
  }

  function isLab(pa) {
    return !!(pa && pa.est_laboratoire);
  }

  async function lessons() {
    if (cacheLessons) return cacheLessons;
    const { data, error } = await jeu()
      .from('modules_cours')
      .select('id, titre, est_groupe, parcours_id, parcours_apprentissage(libelle, est_laboratoire)')
      .eq('est_groupe', false)
      .order('titre');
    if (error) throw error;
    cacheLessons = (data || []).filter(function (m) {
      return !isLab(m.parcours_apprentissage);
    }).map(function (m) {
      return {
        id: m.id,
        kind: 'lecon',
        label: m.titre || 'Leçon',
        sub: (m.parcours_apprentissage && m.parcours_apprentissage.libelle) || '',
        parcours_id: m.parcours_id,
      };
    });
    return cacheLessons;
  }

  async function blocks() {
    if (cacheBlocks) return cacheBlocks;
    const { data, error } = await jeu()
      .from('module_blocs')
      .select('id, titre, module_id, payload_json, modules_cours(titre, parcours_apprentissage(libelle, est_laboratoire))')
      .eq('type_bloc', 'molecule');
    if (error) throw error;
    cacheBlocks = (data || []).filter(function (b) {
      const mod = b.modules_cours;
      return !(mod && isLab(mod.parcours_apprentissage));
    }).map(function (b) {
      const ids = idsFromPayload(b.payload_json);
      return {
        id: b.id,
        kind: 'bloc',
        label: b.titre || 'Bloc',
        sub: (b.modules_cours && b.modules_cours.titre) || '',
        moduleId: b.module_id,
        matriceIds: ids.matriceIds,
        masqueIds: ids.masqueIds,
      };
    });
    return cacheBlocks;
  }

  async function searchMolecules(q, filtres) {
    const f = filtres || {};
    const secteur = Array.isArray(f.secteur) ? f.secteur[0] : f.secteur;
    const classeT = Array.isArray(f.classe_ther) ? f.classe_ther[0] : f.classe_ther;
    const classeP = Array.isArray(f.classe_pharma) ? f.classe_pharma[0] : f.classe_pharma;
    const { data, error } = await jeu().rpc('v2_chercher_matrices', {
      p_q: q || null,
      p_secteur_norm: secteur || null,
      p_indication_norm: null,
      p_classe_ther_norm: classeT || null,
      p_classe_pharma_norm: classeP || null,
      p_limit: 20,
    });
    if (error) throw error;
    const rows = Array.isArray(data) ? data : [];
    return rows.map(function (r) {
      return {
        id: r.id,
        kind: 'molecule',
        label: r.dci || '—',
        sub: typeof r.noms === 'string' ? r.noms : '',
      };
    });
  }

  async function entites(table, q) {
    let query = jeu()
      .from(table)
      .select('id, valeur, valeur_norm')
      .eq('actif', true)
      .order('valeur')
      .limit(20);
    const term = safeTerm(q);
    if (term) {
      const n = norm(term);
      query = query.or('valeur.ilike.%' + term + '%,valeur_norm.ilike.%' + n + '%');
    }
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  function secteurs(q) { return entites('secteurs_therapeutiques', q); }
  function classesTher(q) { return entites('classes_therapeutiques', q); }
  function classesPharma(q) { return entites('classes_pharmacologiques', q); }

  async function fiches(ids) {
    return inChunks('v_medicaments_complet', COMPLET, 'id', ids);
  }

  async function composants(ids) {
    return inChunks('matrice_composants', 'matrice_id, composant_matrice_id, ordre', 'matrice_id', ids);
  }

  async function publications(moduleIds) {
    const rows = await inChunks(
      'publications_connaissances',
      'id, module_id, connaissance_id, connaissances!inner(id, matrice_id, champ_code, texte, entite_id)',
      'module_id',
      moduleIds,
      function (q) { return q.eq('actif', true); }
    );
    return rows.map(function (p) {
      const c = p.connaissances || {};
      return {
        id: p.id,
        module_id: p.module_id,
        connaissance_id: p.connaissance_id,
        matrice_id: c.matrice_id ? String(c.matrice_id) : '',
        champ_code: c.champ_code || '',
        texte: c.texte || '',
        entite_id: c.entite_id || null,
      };
    }).filter(function (p) { return p.matrice_id; });
  }

  async function rpc(name, args) {
    const { data, error } = await jeu().rpc(name, args || {});
    if (error) throw error;
    return data;
  }

  global.V3Data = {
    jeu: jeu,
    portail: portail,
    session: session,
    user: user,
    signIn: signIn,
    signOut: signOut,
    isAdmin: isAdmin,
    onAuth: onAuth,
    lessons: lessons,
    blocks: blocks,
    searchMolecules: searchMolecules,
    secteurs: secteurs,
    classesTher: classesTher,
    classesPharma: classesPharma,
    fiches: fiches,
    composants: composants,
    publications: publications,
    rpc: rpc,
    idsFromPayload: idsFromPayload,
    norm: norm,
  };
})(window);
