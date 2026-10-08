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

  /** Champs pédagogiques actifs (hors legacy posologie / grossesse / voies). */
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

  /**
   * True si la fiche référence l’entité (FK singulière ou jonction multi).
   * @param {object} row
   * @param {string} champCode
   * @param {string} entityId
   */
  function lieAEntite(row, champCode, entityId) {
    if (!row || !champCode || !entityId) return false;
    const champ = champs().find((c) => c.code === champCode);
    if (!champ) return false;
    if (champ.card === 1 && champ.fk) {
      return String(row[champ.fk] || '') === String(entityId);
    }
    const arr =
      champCode === 'nom_commercial'
        ? row.noms_commerciaux || []
        : Array.isArray(row[champCode])
          ? row[champCode]
          : [];
    return arr.some((x) => x && String(x.id) === String(entityId));
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
   * Fiche hospitalière (bool legacy ou DCI à niveaux_connus = hospitalier exclusif).
   * @param {object} row
   */
  function isHospitaliere(row) {
    if (!row) return false;
    if (row.hospitalier) return true;
    const nivs = Array.isArray(row.dci_niveaux) ? row.dci_niveaux : [];
    return nivs.length === 1 && nivs[0] === 'hospitalier';
  }

  /**
   * Fiche hospitalière : visible seulement au niveau pédagogique `hospitalier`.
   * Admin : toujours visible. Niveau vide côté joueur → masqué.
   * @param {object} row
   * @param {string|null|undefined} niveauCode
   * @param {{ admin?: boolean }} [opts]
   */
  function visiblePourNiveau(row, niveauCode, opts = {}) {
    if (opts.admin) return true;
    if (!isHospitaliere(row)) return true;
    return niveauCode === 'hospitalier';
  }

  /**
   * Si DCI ou noms portent le niveau hospitalier → force `['hospitalier']` exclusif
   * sur DCI + noms commerciaux ; dérive le bool matrice.
   * @param {object} payload
   * @returns {boolean}
   */
  function applyHospitalierExclusif(payload) {
    if (!payload) return false;
    const dci = payload.singular?.dci;
    const noms = Array.isArray(payload.multi?.nom_commercial)
      ? payload.multi.nom_commercial
      : [];
    const fromDci =
      Array.isArray(dci?.niveaux_connus) && dci.niveaux_connus.includes('hospitalier');
    const fromNom = noms.some(
      (n) => Array.isArray(n?.niveaux_connus) && n.niveaux_connus.includes('hospitalier')
    );
    const hospitalier = !!(fromDci || fromNom || payload.hospitalier);
    if (!hospitalier) return false;
    if (dci) dci.niveaux_connus = ['hospitalier'];
    for (const n of noms) {
      if (n) n.niveaux_connus = ['hospitalier'];
    }
    return true;
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
   * scope:
   *  - `all` (défaut) : met à jour la ligne d’entité partagée (id) → toutes les fiches liées
   *  - `molecule` : détache — ne touche pas l’ancienne entité ; find/create pour cette fiche
   * @param {{ valeur?: string, id?: string, niveaux_connus?: string[], mergeNiveaux?: boolean, scope?: 'all'|'molecule' }} field
   * @param {string} table
   */
  async function resolveSingular(field, table) {
    if (!field) return null;
    const scope = field.scope === 'molecule' ? 'molecule' : 'all';
    const v = field.valeur != null ? String(field.valeur).trim() : '';
    const niveaux = Array.isArray(field.niveaux_connus) ? field.niveaux_connus : null;

    if (field.id && scope === 'all') {
      const patch = {};
      if (niveaux) patch.niveaux_connus = niveaux;
      if (v) patch.valeur = v;
      if (Object.keys(patch).length) {
        await global.JpEntites.update(table, field.id, patch);
      }
      return field.id;
    }

    if (!v) return null;

    if (field.id && scope === 'molecule') {
      const existing = await global.JpEntites.getById(table, field.id);
      const same =
        existing &&
        global.JpEntites.normaliser(existing.valeur) === global.JpEntites.normaliser(v);
      if (same) {
        // Même libellé : conserver le lien sans modifier l’entité partagée
        return field.id;
      }
      // Nouveau libellé pour cette fiche uniquement
      const found = await global.JpEntites.findActiveByValeur(table, v);
      if (found) return found.id;
      const created = await global.JpEntites.create(table, {
        valeur: v,
        niveaux_connus: niveaux || [],
      });
      return created?.id || null;
    }

    const ent = await global.JpEntites.findOrCreate(
      table,
      v,
      niveaux || [],
      { mergeNiveaux: !!field.mergeNiveaux }
    );
    return ent?.id || null;
  }

  /**
   * @param {{ valeur: string, id?: string, niveaux_connus?: string[], mergeNiveaux?: boolean, scope?: 'all'|'molecule' }[]} items
   * @param {string} table
   */
  async function resolveMulti(items, table) {
    const ids = [];
    const seenNorm = new Set();
    for (const item of items || []) {
      if (!item) continue;
      const scope = item.scope === 'molecule' ? 'molecule' : 'all';
      const v = item.valeur != null ? String(item.valeur).trim() : '';
      const niveaux = Array.isArray(item.niveaux_connus) ? item.niveaux_connus : null;

      // Id forcé (picker) : prioriser le lien ; n’update la valeur que si fournie et scope all
      if (item.id && scope === 'all') {
        const patch = {};
        if (niveaux) patch.niveaux_connus = niveaux;
        if (v) patch.valeur = v;
        if (Object.keys(patch).length) {
          await global.JpEntites.update(table, item.id, patch);
        }
        ids.push(item.id);
        if (v) {
          for (const n of global.JpEntites.normCandidates(v)) seenNorm.add(n);
        }
        continue;
      }
      if (item.id && !v) {
        ids.push(item.id);
        continue;
      }

      if (item.id && scope === 'molecule' && v) {
        const existing = await global.JpEntites.getById(table, item.id);
        const same =
          existing &&
          global.JpEntites.normaliser(existing.valeur) === global.JpEntites.normaliser(v);
        if (same) {
          ids.push(item.id);
          for (const n of global.JpEntites.normCandidates(v)) seenNorm.add(n);
          continue;
        }
        const norms = global.JpEntites.normCandidates(v);
        if (norms.some((n) => seenNorm.has(n))) continue;
        const found = await global.JpEntites.findActiveByValeur(table, v);
        if (found) {
          ids.push(found.id);
          for (const n of norms) seenNorm.add(n);
          if (found.valeur_norm) seenNorm.add(found.valeur_norm);
          continue;
        }
        const created = await global.JpEntites.create(table, {
          valeur: v,
          niveaux_connus: niveaux || [],
        });
        if (created?.id) {
          ids.push(created.id);
          for (const n of norms) seenNorm.add(n);
          if (created.valeur_norm) seenNorm.add(created.valeur_norm);
        }
        continue;
      }

      if (v) {
        const norms = global.JpEntites.normCandidates(v);
        if (norms.some((n) => seenNorm.has(n))) continue;
        if (scope === 'molecule') {
          const found = await global.JpEntites.findActiveByValeur(table, v);
          if (found) {
            ids.push(found.id);
            for (const n of norms) seenNorm.add(n);
            if (found.valeur_norm) seenNorm.add(found.valeur_norm);
            continue;
          }
          const created = await global.JpEntites.create(table, {
            valeur: v,
            niveaux_connus: niveaux || [],
          });
          if (created?.id) {
            ids.push(created.id);
            for (const n of norms) seenNorm.add(n);
            if (created.valeur_norm) seenNorm.add(created.valeur_norm);
          }
          continue;
        }
        const ent = await global.JpEntites.findOrCreate(
          table,
          v,
          niveaux || [],
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
   *   singular: { [code]: { valeur?, id?, niveaux_connus?, mergeNiveaux?, scope? } },
   *   multi: { [code]: [{ valeur?, id?, niveaux_connus?, mergeNiveaux?, scope? }] }
   * }
   * scope `all` | `molecule` — voir resolveSingular / resolveMulti.
   * Si DCI déjà associée à une autre fiche active → fusionne vers cette fiche.
   */
  async function save(payload, existingId) {
    const user = await global.JpApp.getUser();
    const hospitalier = applyHospitalierExclusif(payload);
    const row = {
      statut: payload.statut || 'brouillon',
      hospitalier,
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
    champsActifs,
    lieAEntite,
    nomsList,
    formatNoms,
    isHospitaliere,
    visiblePourNiveau,
  };
})(window);
