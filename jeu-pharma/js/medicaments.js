/**
 * CRUD fiches médicaments (admin) — matrice DCI-centrique + liaisons + vue v_medicaments_complet.
 * 1 fiche = 1 DCI ; N noms commerciaux via matrice_noms_commerciaux.
 * Liste admin : v_medicaments_liste (légère) ; fiche éditeur : getById (complet).
 * Clé anon + RLS admin portail.
 */
(function (global) {
  const SAVE_CONCURRENCY = 6;

  function sb() {
    return global.JpApp.sbJeu();
  }

  function champs() {
    return global.JpConstants?.CHAMP_CODES || [];
  }

  function champsActifs() {
    if (typeof global.JpConstants?.champsActifs === 'function') {
      return global.JpConstants.champsActifs();
    }
    return champs().filter((c) => c.actif !== false);
  }

  function singularChamps() {
    return champsActifs().filter((c) => c.card === 1);
  }

  function multiChamps() {
    return champsActifs().filter((c) => c.card === 'N');
  }

  /** Exécute `fn` sur chaque item avec au plus `limit` promesses concurrentes. */
  async function mapPool(items, limit, fn) {
    const list = items || [];
    const out = new Array(list.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, Math.max(list.length, 1)) }, async () => {
      while (next < list.length) {
        const i = next++;
        out[i] = await fn(list[i], i);
      }
    });
    await Promise.all(workers);
    return out;
  }

  /** True si la fiche référence l’entité (FK singulière ou jonction multi). */
  function lieAEntite(row, champCode, entityId) {
    if (!row || !champCode || !entityId) return false;
    const champ = champs().find((c) => c.code === champCode);
    if (!champ) return false;
    if (champ.card === 1 && champ.fk) {
      return String(row[champ.fk] || '') === String(entityId);
    }
    const arr = champCode === 'nom_commercial'
      ? row.noms_commerciaux || []
      : Array.isArray(row[champCode]) ? row[champCode] : [];
    return arr.some((x) => x && String(x.id) === String(entityId));
  }

  /** Libellé texte depuis une entité jsonb / scalaire (jamais un objet). */
  function labelFrom(x) {
    if (x == null || x === '') return '';
    if (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean') {
      const text = String(x);
      if (text === '[object Object]') return '';
      if (/^\s*[\[{]/.test(text)) {
        try {
          return labelsOf(JSON.parse(text)).join(', ');
        } catch (_) { /* texte normal */ }
      }
      return text;
    }
    if (Array.isArray(x)) return labelsOf(x).join(', ');
    if (typeof x === 'object') {
      const v = x.valeur ?? x.label ?? x.libelle ?? x.nom ?? x.name;
      return v == null ? '' : labelFrom(v);
    }
    return '';
  }

  function nomsList(row) {
    if (!row) return [];
    if (Array.isArray(row.noms_commerciaux) && row.noms_commerciaux.length) {
      return row.noms_commerciaux.map(labelFrom).filter(Boolean);
    }
    if (row.nom_commercial) {
      const n = labelFrom(row.nom_commercial);
      return n ? [n] : [];
    }
    return [];
  }

  function formatNoms(row, sep) {
    return nomsList(row).join(sep != null ? sep : ', ');
  }

  function labelsOf(value) {
    if (Array.isArray(value)) {
      return value.flatMap((x) => {
        if (Array.isArray(x)) return labelsOf(x);
        const label = labelFrom(x);
        return label ? [label] : [];
      });
    }
    const one = labelFrom(value);
    return one ? [one] : [];
  }

  function formatLabels(value, sep) {
    const labs = labelsOf(value);
    return labs.length ? labs.join(sep != null ? sep : ', ') : '—';
  }

  /** Page par page (PostgREST plafonne à 1000 lignes) — vue liste légère. */
  async function list() {
    const PAGE = 1000;
    const out = [];
    for (let from = 0; from < 20000; from += PAGE) {
      const { data, error } = await sb()
        .from('v_medicaments_liste')
        .select('*')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      const rows = data || [];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out;
  }

  async function getById(id) {
    const { data, error } = await sb()
      .from('v_medicaments_complet')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  /** Composants d’une fiche association : [{id,dci,ordre,couleur}]. */
  async function listComposants(matriceId) {
    if (!matriceId) return [];
    const { data, error } = await sb().rpc('v2_matrice_composants', {
      p_matrice_id: matriceId,
    });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  /** Fiche active (non archive) pour une DCI, sinon null. */
  async function findByDciId(dciId, excludeId) {
    if (!dciId) return null;
    let query = sb()
      .from('matrice_medicaments')
      .select('id, dci_id, statut')
      .eq('dci_id', dciId)
      .neq('statut', 'archive')
      .limit(1);
    if (excludeId) query = query.neq('id', excludeId);
    const { data, error } = await query.maybeSingle();
    if (error) throw error;
    if (!data) return null;
    return getById(data.id);
  }

  /**
   * Résout une valeur singulière → id entité.
   * Skip findOrCreate si `id` stable déjà présent (sauf rename scope all / détache molecule).
   * scope `all` : met à jour l’entité partagée ; `molecule` : détache (find/create).
   */
  async function resolveSingular(field, table) {
    if (!field) return null;
    const scope = field.scope === 'molecule' ? 'molecule' : 'all';
    const v = field.valeur != null ? String(field.valeur).trim() : '';
    if (field.id && scope === 'all') {
      if (v) await global.JpEntites.update(table, field.id, { valeur: v });
      return field.id;
    }
    if (field.id && !v) return field.id;
    if (!v) return null;
    if (field.id && scope === 'molecule') {
      const existing = await global.JpEntites.getById(table, field.id);
      if (existing && global.JpEntites.normaliser(existing.valeur) === global.JpEntites.normaliser(v)) {
        return field.id;
      }
      const found = await global.JpEntites.findActiveByValeur(table, v);
      if (found) return found.id;
      const created = await global.JpEntites.create(table, { valeur: v });
      return created?.id || null;
    }
    if (field.id) return field.id;
    const ent = await global.JpEntites.findOrCreate(table, v);
    return ent?.id || null;
  }

  /**
   * Résout une liste d’items {id?, valeur, scope?} → ids dédoublonnés (ordre conservé).
   * Items avec id stable : pas de findOrCreate ; résolution réseau parallélisée (plafond).
   */
  async function resolveMulti(items, table) {
    const E = global.JpEntites;
    const ids = [];
    const seenNorm = new Set();
    const pending = [];

    for (const item of items || []) {
      if (!item) continue;
      const scope = item.scope === 'molecule' ? 'molecule' : 'all';
      const v = item.valeur != null ? String(item.valeur).trim() : '';
      const norms = E.normCandidates(v);

      if (item.id && scope === 'all') {
        if (v) pending.push({ kind: 'update', id: item.id, v, norms });
        else {
          ids.push(item.id);
          norms.forEach((n) => seenNorm.add(n));
        }
        continue;
      }
      if (item.id && !v) {
        ids.push(item.id);
        continue;
      }
      if (!v) continue;

      if (item.id && scope === 'molecule') {
        pending.push({ kind: 'molecule', id: item.id, v, norms });
        continue;
      }
      if (item.id) {
        ids.push(item.id);
        norms.forEach((n) => seenNorm.add(n));
        continue;
      }
      if (norms.some((n) => seenNorm.has(n))) continue;
      norms.forEach((n) => seenNorm.add(n));
      pending.push({ kind: 'create', v, norms, scope });
    }

    // Updates scope all (id + valeur) en parallèle — conserve l’id.
    const updates = pending.filter((p) => p.kind === 'update');
    if (updates.length) {
      await mapPool(updates, SAVE_CONCURRENCY, async (p) => {
        await E.update(table, p.id, { valeur: p.v });
        return p.id;
      });
      for (const p of updates) {
        ids.push(p.id);
        p.norms.forEach((n) => seenNorm.add(n));
      }
    }

    // molecule / create : résolution parallèle (findOrCreate déduplique côté unique).
    const resolvers = pending.filter((p) => p.kind !== 'update');
    if (resolvers.length) {
      const resolved = await mapPool(resolvers, SAVE_CONCURRENCY, async (p) => {
        if (p.kind === 'molecule') {
          const existing = await E.getById(table, p.id);
          if (existing && E.normaliser(existing.valeur) === E.normaliser(p.v)) {
            return { id: p.id, norms: p.norms };
          }
          const ent = (await E.findActiveByValeur(table, p.v)) || (await E.create(table, { valeur: p.v }));
          return ent?.id ? { id: ent.id, norms: p.norms, valeur_norm: ent.valeur_norm } : null;
        }
        const ent = p.scope === 'molecule'
          ? (await E.findActiveByValeur(table, p.v)) || (await E.create(table, { valeur: p.v }))
          : await E.findOrCreate(table, p.v);
        return ent?.id ? { id: ent.id, norms: p.norms, valeur_norm: ent.valeur_norm } : null;
      });
      const seenId = new Set(ids.map(String));
      for (const r of resolved) {
        if (!r?.id || seenId.has(String(r.id))) continue;
        seenId.add(String(r.id));
        ids.push(r.id);
        r.norms?.forEach((n) => seenNorm.add(n));
        if (r.valeur_norm) seenNorm.add(r.valeur_norm);
      }
    }

    return [...new Set(ids)];
  }

  async function replaceLiaisons(matriceId, champ, entityIds) {
    const { liaison, liaisonFk } = champ;
    const { error: delErr } = await sb().from(liaison).delete().eq('matrice_id', matriceId);
    if (delErr) throw delErr;
    if (!entityIds.length) return;
    const rows = entityIds.map((eid, ordre) => ({ matrice_id: matriceId, [liaisonFk]: eid, ordre }));
    const { error: insErr } = await sb().from(liaison).insert(rows);
    if (insErr) throw insErr;
  }

  /** Union des multi-valeurs existantes + entrantes (fusion DCI). */
  function mergeMultiPayload(existingArr, incomingItems) {
    const norm = (val) => global.JpEntites.normaliser(val);
    const out = [];
    const seenId = new Set();
    const seenNorm = new Set();
    for (const x of [...(existingArr || []).map((e) => ({ id: e.id, valeur: labelFrom(e) })), ...(incomingItems || [])]) {
      if (!x) continue;
      const n = norm(x.valeur);
      if ((x.id && seenId.has(String(x.id))) || (n && seenNorm.has(n))) continue;
      if (x.id) seenId.add(String(x.id));
      if (n) seenNorm.add(n);
      out.push(x);
    }
    return out;
  }

  /**
   * Payload admin :
   * { statut, fiche_validee?,
   *   singular: { [code]: { valeur?, id?, scope? } },
   *   multi: { [code]: [{ valeur?, id?, scope? }] } }
   * Si la DCI est déjà portée par une autre fiche active → fusion vers cette fiche.
   * Toute sauvegarde invalide `fiche_validee`, sauf `payload.fiche_validee === true`.
   */
  async function save(payload, existingId) {
    const user = await global.JpApp.getUser();
    const row = {
      statut: payload.statut || 'brouillon',
      updated_by: user?.id || null,
      fiche_validee: payload.fiche_validee === true,
    };

    const singular = singularChamps();
    const fkIds = await mapPool(singular, SAVE_CONCURRENCY, async (c) => (
      resolveSingular(payload.singular?.[c.code], c.table)
    ));
    singular.forEach((c, i) => { row[c.fk] = fkIds[i]; });

    let id = existingId || null;
    let merged = false;
    let abandonedId = null;

    if (row.dci_id) {
      const other = await findByDciId(row.dci_id, id);
      if (other?.id && (!id || id !== other.id)) {
        if (id) abandonedId = id;
        id = other.id;
        merged = true;
      }
    }
    if (merged) {
      for (const c of singular) {
        if (row[c.fk] == null) delete row[c.fk];
      }
    }

    if (id) {
      const { data, error } = await sb().from('matrice_medicaments').update(row).eq('id', id).select('id').single();
      if (error) throw error;
      id = data.id;
    } else {
      const { data, error } = await sb().from('matrice_medicaments').insert(row).select('id').single();
      if (error) throw error;
      id = data.id;
    }

    if (abandonedId && abandonedId !== id) {
      await sb().from('matrice_medicaments')
        .update({ statut: 'archive', updated_by: user?.id || null })
        .eq('id', abandonedId);
    }

    const current = merged ? await getById(id) : null;
    const multi = multiChamps();
    const savedId = id;

    await mapPool(multi, SAVE_CONCURRENCY, async (c) => {
      let items = payload.multi?.[c.code] || [];
      if (merged && current) {
        const existingArr = c.code === 'nom_commercial'
          ? current.noms_commerciaux || []
          : Array.isArray(current[c.code]) ? current[c.code] : [];
        items = mergeMultiPayload(existingArr, items);
      }
      const entityIds = await resolveMulti(items, c.table);
      await replaceLiaisons(savedId, c, entityIds);
      if (c.fk && (c.code === 'classe_therapeutique' || c.code === 'classe_pharmacologique')) {
        const { error: fkErr } = await sb().from('matrice_medicaments')
          .update({ [c.fk]: entityIds[0] || null }).eq('id', savedId);
        if (fkErr) throw fkErr;
      }
    });

    void global.JpLogs?.action?.('medicament_save', {
      id,
      statut: row.statut,
      create: !existingId && !merged,
      merge_dci: merged,
    });
    return getById(id);
  }

  async function setStatut(id, statut) {
    const user = await global.JpApp.getUser();
    const { data, error } = await sb()
      .from('matrice_medicaments')
      .update({ statut, updated_by: user?.id || null })
      .eq('id', id)
      .select('id, statut')
      .single();
    if (error) throw error;
    void global.JpLogs?.action?.('medicament_statut', { id, statut });
    return data;
  }

  async function setFicheValidee(id, validee, userOpt) {
    const user = userOpt || await global.JpApp.getUser();
    const { error } = await sb()
      .from('matrice_medicaments')
      .update({ fiche_validee: !!validee, updated_by: user?.id || null })
      .eq('id', id);
    if (error) throw error;
    void global.JpLogs?.action?.('medicament_fiche_validee', { id, fiche_validee: !!validee });
  }

  async function resetFicheValidee(ids, userOpt) {
    const list = (ids || []).filter(Boolean);
    if (!list.length) return 0;
    const user = userOpt || await global.JpApp.getUser();
    for (let i = 0; i < list.length; i += 200) {
      const { error } = await sb()
        .from('matrice_medicaments')
        .update({ fiche_validee: false, updated_by: user?.id || null })
        .in('id', list.slice(i, i + 200));
      if (error) throw error;
    }
    void global.JpLogs?.action?.('medicament_fiche_validee_reset', { count: list.length });
    return list.length;
  }

  global.JpMedicaments = {
    list,
    getById,
    listComposants,
    findByDciId,
    save,
    setStatut,
    setFicheValidee,
    resetFicheValidee,
    singularChamps,
    multiChamps,
    champsActifs,
    lieAEntite,
    nomsList,
    formatNoms,
    labelsOf,
    formatLabels,
    labelFrom,
  };
})(window);
