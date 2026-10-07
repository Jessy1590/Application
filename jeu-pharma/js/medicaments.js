/**
 * CRUD fiches médicaments (matrice + liaisons + vue v_medicaments_complet).
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
          r.nom_commercial,
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
        continue;
      }
      if (item.valeur && String(item.valeur).trim()) {
        const ent = await global.JpEntites.findOrCreate(
          table,
          item.valeur,
          Array.isArray(item.niveaux_connus) ? item.niveaux_connus : [],
          { mergeNiveaux: !!item.mergeNiveaux }
        );
        if (ent?.id) ids.push(ent.id);
      }
    }
    return ids;
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
   * Payload admin :
   * {
   *   statut,
   *   singular: { [code]: { valeur?, id?, niveaux_connus?, mergeNiveaux? } },
   *   multi: { [code]: [{ valeur?, id?, niveaux_connus?, mergeNiveaux? }] }
   * }
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

    let id = existingId;
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

    for (const c of multiChamps()) {
      const ids = await resolveMulti(payload.multi?.[c.code] || [], c.table);
      await replaceLiaisons(id, c, ids);
    }

    void global.JpLogs?.action?.('medicament_save', {
      id,
      statut: row.statut,
      create: !existingId,
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
    save,
    setStatut,
    archive,
    listHistorique,
    singularChamps,
    multiChamps,
  };
})(window);
