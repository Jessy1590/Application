/**
 * CRUD fiches médicaments (matrice DCI-centrique + liaisons + vue v_medicaments_complet).
 * 1 fiche = 1 DCI ; N noms commerciaux via matrice_noms_commerciaux.
 */
(function (global) {
  function sb() {
    return global.JpApp.sbJeu();
  }

  function champs() {
    return global.JpConstants?.CHAMP_CODES || [];
  }

  function singularChamps() {
    return champs().filter((c) => c.card === 1);
  }

  function multiChamps() {
    return champs().filter((c) => c.card === 'N');
  }

  /** Liste des libellés noms commerciaux (vue array ou fallback déprécié). */
  function nomsList(row) {
    if (!row) return [];
    if (Array.isArray(row.noms_commerciaux) && row.noms_commerciaux.length) {
      return row.noms_commerciaux.map((x) => x?.valeur || x).filter(Boolean);
    }
    if (row.nom_commercial) return [row.nom_commercial];
    return [];
  }

  function formatNoms(row, sep) {
    return nomsList(row).join(sep != null ? sep : ', ');
  }

  /**
   * @param {{ statut?: string|null, q?: string, secteurId?: string|null, publieOnly?: boolean }} [opts]
   */
  async function list(opts = {}) {
    let query = sb()
      .from('v_medicaments_complet')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(500);
    if (opts.publieOnly || opts.statut === 'publie') {
      query = query.eq('statut', 'publie');
    } else if (opts.statut) {
      query = query.eq('statut', opts.statut);
    }
    if (opts.secteurId) {
      query = query.eq('secteur_therapeutique_id', opts.secteurId);
    }
    const { data, error } = await query;
    if (error) throw error;
    let rows = data || [];
    const q = String(opts.q || '').trim().toLowerCase();
    if (q) {
      rows = rows.filter((r) => {
        const blob = [
          formatNoms(r, ' '),
          r.dci,
          r.secteur_therapeutique,
          r.classe_therapeutique,
          r.classe_pharmacologique,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    return rows;
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
   * Résout une valeur singulière → id entité (création si besoin).
   * @param {{ valeur?: string, id?: string, niveaux_connus?: string[], mergeNiveaux?: boolean }} field
   * @param {string} table
   */
  async function resolveSingular(field, table) {
    if (!field) return null;
    if (field.id) {
      if (Array.isArray(field.niveaux_connus)) {
        await global.JpEntites.update(table, field.id, {
          niveaux_connus: field.niveaux_connus,
          ...(field.valeur ? { valeur: field.valeur } : {}),
        });
      } else if (field.valeur) {
        await global.JpEntites.update(table, field.id, { valeur: field.valeur });
      }
      return field.id;
    }
    if (field.valeur && String(field.valeur).trim()) {
      const ent = await global.JpEntites.findOrCreate(
        table,
        field.valeur,
        Array.isArray(field.niveaux_connus) ? field.niveaux_connus : [],
        { mergeNiveaux: !!field.mergeNiveaux }
      );
      return ent?.id || null;
    }
    return null;
  }

  /**
   * @param {{ valeur: string, id?: string, niveaux_connus?: string[], mergeNiveaux?: boolean }[]} items
   * @param {string} table
   */
  async function resolveMulti(items, table) {
    const ids = [];
    const seenNorm = new Set();
    for (const item of items || []) {
      if (!item) continue;
      if (item.id) {
        if (Array.isArray(item.niveaux_connus)) {
          await global.JpEntites.update(table, item.id, {
            niveaux_connus: item.niveaux_connus,
            ...(item.valeur ? { valeur: item.valeur } : {}),
          });
        }
        ids.push(item.id);
        if (item.valeur) {
          for (const n of global.JpEntites.normCandidates(item.valeur)) seenNorm.add(n);
        }
        continue;
      }
      if (item.valeur && String(item.valeur).trim()) {
        const norms = global.JpEntites.normCandidates(item.valeur);
        if (norms.some((n) => seenNorm.has(n))) continue;
        const ent = await global.JpEntites.findOrCreate(
          table,
          item.valeur,
          Array.isArray(item.niveaux_connus) ? item.niveaux_connus : [],
          { mergeNiveaux: !!item.mergeNiveaux }
        );
        if (ent?.id) {
          ids.push(ent.id);
          for (const n of norms) seenNorm.add(n);
          if (ent.valeur_norm) seenNorm.add(ent.valeur_norm);
        }
      }
    }
    return [...new Set(ids)];
  }

  async function replaceLiaisons(matriceId, champ, entityIds) {
    const { liaison, liaisonFk } = champ;
    const { error: delErr } = await sb().from(liaison).delete().eq('matrice_id', matriceId);
    if (delErr) throw delErr;
    if (!entityIds.length) return;
    const rows = entityIds.map((eid, ordre) => ({
      matrice_id: matriceId,
      [liaisonFk]: eid,
      ordre,
    }));
    const { error: insErr } = await sb().from(liaison).insert(rows);
    if (insErr) throw insErr;
  }

  /**
   * Union des multi-valeurs payload + existantes (dédup par id / valeur_norm côté resolve).
   */
  function mergeMultiPayload(existingArr, incomingItems) {
    const byId = new Map();
    const byVal = new Map();
    const normOf = (val) => global.JpEntites.normaliser(val);
    for (const x of existingArr || []) {
      if (!x) continue;
      if (x.id) byId.set(x.id, x);
      const n = normOf(x.valeur);
      if (n) byVal.set(n, x);
    }
    for (const item of incomingItems || []) {
      if (!item) continue;
      if (item.id && byId.has(item.id)) {
        byId.set(item.id, { ...byId.get(item.id), ...item });
        continue;
      }
      const n = normOf(item.valeur);
      if (n && byVal.has(n)) {
        const prev = byVal.get(n);
        byId.set(prev.id || n, { ...prev, ...item, id: prev.id || item.id });
        continue;
      }
      const key = item.id || n || Math.random();
      byId.set(key, item);
      if (n) byVal.set(n, item);
    }
    return [...byId.values()];
  }

  /**
   * Payload admin :
   * {
   *   statut,
   *   singular: { [code]: { valeur?, id?, niveaux_connus?, mergeNiveaux? } },
   *   multi: { [code]: [{ valeur?, id?, niveaux_connus?, mergeNiveaux? }] }
   * }
   * Si DCI déjà associée à une autre fiche active → fusionne vers cette fiche.
   */
  async function save(payload, existingId) {
    const user = await global.JpApp.getUser();
    const row = {
      statut: payload.statut || 'brouillon',
      updated_by: user?.id || null,
    };

    for (const c of singularChamps()) {
      row[c.fk] = await resolveSingular(payload.singular?.[c.code], c.table);
    }

    let id = existingId || null;
    let mergedOntoExisting = false;
    let abandonedId = null;

    if (row.dci_id) {
      const other = await findByDciId(row.dci_id, id);
      if (other?.id) {
        if (!id || id !== other.id) {
          if (id && id !== other.id) abandonedId = id;
          id = other.id;
          mergedOntoExisting = true;
        }
      }
    }

    // En fusion DCI : ne pas écraser les FK singulières du keeper avec null
    if (mergedOntoExisting) {
      for (const c of singularChamps()) {
        if (row[c.fk] == null) delete row[c.fk];
      }
    }

    if (id) {
      const { data, error } = await sb()
        .from('matrice_medicaments')
        .update(row)
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
      id = data.id;
    } else {
      const { data, error } = await sb()
        .from('matrice_medicaments')
        .insert(row)
        .select('id')
        .single();
      if (error) throw error;
      id = data.id;
    }

    // Si on a basculé vers une autre fiche DCI, archiver l’ancienne
    if (abandonedId && abandonedId !== id) {
      await sb()
        .from('matrice_medicaments')
        .update({ statut: 'archive', updated_by: user?.id || null })
        .eq('id', abandonedId);
    }

    const current = mergedOntoExisting || existingId ? await getById(id) : null;

    for (const c of multiChamps()) {
      let items = payload.multi?.[c.code] || [];
      if (mergedOntoExisting && current) {
        const existingArr =
          c.code === 'nom_commercial'
            ? current.noms_commerciaux || []
            : Array.isArray(current[c.code])
              ? current[c.code]
              : [];
        items = mergeMultiPayload(existingArr, items);
      }
      const ids = await resolveMulti(items, c.table);
      await replaceLiaisons(id, c, ids);
    }

    void global.JpLogs?.action?.('medicament_save', {
      id,
      statut: row.statut,
      create: !existingId && !mergedOntoExisting,
      merge_dci: mergedOntoExisting,
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

  /** Archive (soft) — pas de hard-delete. */
  async function archive(id) {
    return setStatut(id, 'archive');
  }

  async function listHistorique(opts = {}) {
    let query = sb()
      .from('historique_modifications')
      .select('id, table_name, record_id, operation, ancien_etat, nouvel_etat, user_id, created_at, etat')
      .order('created_at', { ascending: false })
      .limit(opts.limit || 100);
    if (opts.table_name) query = query.eq('table_name', opts.table_name);
    if (opts.operation) query = query.eq('operation', opts.operation);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  global.JpMedicaments = {
    list,
    getById,
    findByDciId,
    save,
    setStatut,
    archive,
    listHistorique,
    singularChamps,
    multiChamps,
    nomsList,
    formatNoms,
  };
})(window);
