/**
 * Accès données Location (schéma phieevreux).
 */
(function (global) {
  let client = null;
  let paramsCache = null;
  let rulesCache = null;

  function sb() {
    if (!client) client = global.PhieEvreuxApps.createAppsClient();
    return client;
  }

  function invalidateCache() {
    paramsCache = null;
    rulesCache = null;
  }

  async function loadParams() {
    if (paramsCache) return paramsCache;
    const { data, error } = await sb().from('location_parametres').select('*');
    if (error) throw error;
    const map = {};
    for (const row of data || []) {
      map[row.cle] = row.valeur;
      map['__meta_' + row.cle] = row;
    }
    paramsCache = map;
    return map;
  }

  async function setParam(cle, valeur, userId) {
    const { data: existing } = await sb().from('location_parametres').select('id').eq('cle', cle).maybeSingle();
    const payload = {
      cle,
      valeur,
      updated_at: new Date().toISOString(),
      updated_by: userId || null,
    };
    let error;
    if (existing?.id) {
      ({ error } = await sb().from('location_parametres').update(payload).eq('id', existing.id));
    } else {
      ({ error } = await sb().from('location_parametres').insert(payload));
    }
    if (error) throw error;
    paramsCache = null;
  }

  async function loadRules(force) {
    if (rulesCache && !force) return rulesCache;
    rulesCache = await global.LocationRules.listRules(sb());
    return rulesCache;
  }

  function isRequired(params, key) {
    const champs = params?.champs_obligatoires;
    if (!champs || typeof champs !== 'object') return true;
    if (champs[key] === false) return false;
    return champs[key] !== false;
  }

  async function listPrestataires(actifsOnly) {
    let q = sb().from('location_prestataires').select('*').order('nom');
    if (actifsOnly) q = q.eq('actif', true);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  }

  async function searchPatients(q) {
    const term = String(q || '').trim().replace(/[%_,.()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!term) return [];
    const { data, error } = await sb()
      .from('location_patients')
      .select('*')
      .or(`nom.ilike.%${term}%,prenom.ilike.%${term}%`)
      .order('nom')
      .limit(20);
    if (error) throw error;
    return data || [];
  }

  async function createPatient(row) {
    const payload = {
      ...row,
      telephones: Array.isArray(row.telephones) ? row.telephones : [],
      mails: Array.isArray(row.mails) ? row.mails : [],
    };
    const { data, error } = await sb().from('location_patients').insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async function updatePatient(id, row) {
    const payload = {
      ...row,
      telephones: Array.isArray(row.telephones) ? row.telephones : [],
      mails: Array.isArray(row.mails) ? row.mails : [],
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await sb()
      .from('location_patients')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /**
   * Dossiers avec patient + appareil actif + dernière date_fin.
   */
  async function listDossiers(filters = {}) {
    let q = sb()
      .from('location_dossiers')
      .select(`
        *,
        patient:location_patients(*),
        appareils:location_appareils(*),
        prolongations:location_prolongations(*),
        suivi:location_suivi_lignes(*)
      `)
      .order('created_at', { ascending: false });

    if (filters.statut) q = q.eq('statut', filters.statut);

    const { data, error } = await q;
    if (error) throw error;
    let rows = (data || []).map(enrichDossier);

    if (filters.q) {
      const t = String(filters.q).toLowerCase().trim();
      rows = rows.filter((d) => {
        const p = d.patient || {};
        return (
          String(p.nom || '').toLowerCase().includes(t) ||
          String(p.prenom || '').toLowerCase().includes(t)
        );
      });
    }
    if (filters.type_appareil) {
      rows = rows.filter((d) => d.appareil_actif?.type_appareil === filters.type_appareil);
    }
    if (filters.a_contacter) {
      const params = await loadParams();
      const rules = await loadRules();
      rows = rows.filter((d) => {
        const ctx = dossierContext(d);
        return global.LocationRules.evaluate(ctx, rules, params).shouldContact;
      });
    }
    return rows;
  }

  async function getDossier(id) {
    const { data, error } = await sb()
      .from('location_dossiers')
      .select(`
        *,
        patient:location_patients(*),
        appareils:location_appareils(*),
        prolongations:location_prolongations(*),
        suivi:location_suivi_lignes(*),
        contacts:location_contacts(*)
      `)
      .eq('id', id)
      .single();
    if (error) throw error;
    return enrichDossier(data);
  }

  function enrichDossier(d) {
    if (!d) return d;
    const patient = Array.isArray(d.patient) ? d.patient[0] || null : d.patient;
    const appareils = (d.appareils || []).slice().sort((a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );
    const prolongations = (d.prolongations || []).slice().sort((a, b) =>
      String(b.created_at || '').localeCompare(String(a.created_at || ''))
    );
    const suivi = (d.suivi || []).slice().sort((a, b) =>
      String(a.date_ligne || a.created_at || '').localeCompare(String(b.date_ligne || b.created_at || ''))
    );
    const contacts = (d.contacts || []).slice().sort((a, b) =>
      String(a.contacted_at || a.created_at || '').localeCompare(
        String(b.contacted_at || b.created_at || '')
      )
    );
    const appareil_actif = appareils.find((a) => a.actif) || appareils[0] || null;
    const date_fin = prolongations.reduce((max, p) => {
      if (!p.date_fin) return max;
      return !max || p.date_fin > max ? p.date_fin : max;
    }, null);
    return {
      ...d,
      patient,
      appareils,
      prolongations,
      suivi,
      contacts,
      appareil_actif,
      date_fin,
    };
  }

  function dossierContext(d) {
    const a = d.appareil_actif || {};
    return {
      type_appareil: a.type_appareil,
      date_debut: d.date_debut || a.date_debut,
      date_fin: d.date_fin,
      appareil_rendu: d.appareil_rendu,
      qui_facture: d.qui_facture,
      facturation_prestataire: a.facturation_prestataire,
      statut: d.statut,
      has_prolongation: (d.prolongations || []).length > 1,
    };
  }

  async function createDossierComplet(payload, userId) {
    const patient = payload.patient_id
      ? await updatePatient(payload.patient_id, payload.patient)
      : await createPatient(payload.patient);

    const dossierRow = {
      patient_id: patient.id,
      code_op: payload.code_op || null,
      caution: payload.caution || null,
      statut: 'actif',
      date_debut: payload.date_debut || null,
      qui_facture: payload.qui_facture || 'pharmacie',
      created_by: userId || null,
      notes: payload.notes || null,
    };
    const { data: dossier, error: dErr } = await sb()
      .from('location_dossiers')
      .insert(dossierRow)
      .select()
      .single();
    if (dErr) throw dErr;

    const appRow = {
      dossier_id: dossier.id,
      type_appareil: payload.appareil.type_appareil,
      type_libelle: payload.appareil.type_libelle || null,
      source: payload.appareil.source || 'parc',
      prestataire_id: payload.appareil.prestataire_id || null,
      matricule: payload.appareil.matricule || null,
      numero_pharmacie: payload.appareil.numero_pharmacie || null,
      mode_obtention: payload.appareil.mode_obtention || null,
      livraison: payload.appareil.livraison || null,
      desinfection: !!payload.appareil.desinfection,
      encart_texte: payload.appareil.encart_texte || null,
      pese_bebe_regler_avance: payload.appareil.pese_bebe_regler_avance ?? null,
      pese_bebe_periode: payload.appareil.pese_bebe_periode || null,
      facturation_prestataire: !!payload.appareil.facturation_prestataire,
      date_accouchement: payload.appareil.date_accouchement || null,
      actif: true,
      date_debut: payload.date_debut || null,
    };
    const { data: appareil, error: aErr } = await sb()
      .from('location_appareils')
      .insert(appRow)
      .select()
      .single();
    if (aErr) throw aErr;

    const duree = Number(payload.duree);
    const unite = payload.unite;
    const dateOrdo = payload.date_ordo || null;
    const dateFin = global.LocationRules.addDuration(
      payload.date_debut || dateOrdo,
      duree,
      unite
    );
    const { data: prolong, error: pErr } = await sb()
      .from('location_prolongations')
      .insert({
        dossier_id: dossier.id,
        date_ordo: dateOrdo,
        duree,
        unite,
        date_fin: dateFin,
        notes: 'Location initiale',
        created_by: userId || null,
      })
      .select()
      .single();
    if (pErr) throw pErr;

    return getDossier(dossier.id);
  }

  async function updateAppareil(id, row) {
    const { data, error } = await sb()
      .from('location_appareils')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function updateDossier(id, row) {
    const { data, error } = await sb()
      .from('location_dossiers')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  /** Supprime un dossier ; appareils / prolongations / suivi_lignes / contacts via CASCADE. */
  async function deleteDossier(id) {
    const { error } = await sb().from('location_dossiers').delete().eq('id', id);
    if (error) throw error;
  }

  async function changerAppareil(dossierId, newApp, userId) {
    const today = global.LocationRules.todayISO();
    await sb()
      .from('location_appareils')
      .update({ actif: false, date_fin: today, updated_at: new Date().toISOString() })
      .eq('dossier_id', dossierId)
      .eq('actif', true);

    const { data, error } = await sb()
      .from('location_appareils')
      .insert({
        ...newApp,
        dossier_id: dossierId,
        actif: true,
        date_debut: newApp.date_debut || today,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function addProlongation(dossierId, row, userId) {
    const dateFin = row.date_fin || global.LocationRules.addDuration(
      row.date_ordo || global.LocationRules.todayISO(),
      row.duree,
      row.unite
    );
    const { data, error } = await sb()
      .from('location_prolongations')
      .insert({
        dossier_id: dossierId,
        date_ordo: row.date_ordo || null,
        duree: row.duree,
        unite: row.unite,
        date_fin: dateFin,
        notes: row.notes || null,
        created_by: userId || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function upsertSuiviLigne(row) {
    if (row.id) {
      const { data, error } = await sb()
        .from('location_suivi_lignes')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await sb().from('location_suivi_lignes').insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async function deleteSuiviLigne(id) {
    const { error } = await sb().from('location_suivi_lignes').delete().eq('id', id);
    if (error) throw error;
  }

  async function listTemplates() {
    const { data, error } = await sb()
      .from('location_templates_contact')
      .select('*')
      .order('motif');
    if (error) throw error;
    return data || [];
  }

  async function findTemplate(typeAppareil, motif) {
    const all = await listTemplates();
    const actifs = all.filter((t) => t.actif !== false);
    return (
      actifs.find((t) => t.motif === motif && t.type_appareil === typeAppareil) ||
      actifs.find((t) => t.motif === motif && !t.type_appareil) ||
      actifs.find((t) => t.motif === 'fin_location' && !t.type_appareil) ||
      null
    );
  }

  async function upsertTemplate(row) {
    if (row.id) {
      const { data, error } = await sb()
        .from('location_templates_contact')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await sb().from('location_templates_contact').insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async function deleteTemplate(id) {
    const { error } = await sb().from('location_templates_contact').delete().eq('id', id);
    if (error) throw error;
  }

  async function upsertPrestataire(row) {
    if (row.id) {
      const { data, error } = await sb()
        .from('location_prestataires')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await sb().from('location_prestataires').insert(row).select().single();
    if (error) throw error;
    return data;
  }

  async function deletePrestataire(id) {
    const { error } = await sb().from('location_prestataires').delete().eq('id', id);
    if (error) throw error;
  }

  async function listOpenContacts() {
    const { data, error } = await sb()
      .from('location_contacts')
      .select('*, dossier:location_dossiers(*, patient:location_patients(*), appareils:location_appareils(*))')
      .in('statut', ['a_contacter', 'en_cours', 'reporte'])
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map((c) => ({
      ...c,
      dossier: enrichDossier(c.dossier),
    }));
  }

  async function upsertContact(row) {
    if (row.id) {
      const { data, error } = await sb()
        .from('location_contacts')
        .update({ ...row, updated_at: new Date().toISOString() })
        .eq('id', row.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await sb().from('location_contacts').insert(row).select().single();
    if (error) throw error;
    return data;
  }

  /**
   * Synchronise la file contact à partir des dossiers actifs + règles.
   */
  async function syncContactQueue(userId) {
    const params = await loadParams();
    const rules = await loadRules();
    const dossiers = await listDossiers({ statut: 'actif' });
    const existing = await listOpenContacts();
    const byDossier = new Map(existing.map((c) => [c.dossier_id, c]));
    const created = [];

    for (const d of dossiers) {
      const a = d.appareil_actif;
      if (d.qui_facture === 'prestataire' || a?.facturation_prestataire) continue;
      const evalRes = global.LocationRules.evaluate(dossierContext(d), rules, params);
      if (!evalRes.shouldContact) continue;
      if (byDossier.has(d.id)) continue;
      const motif = evalRes.contactReasons[0]?.motif || 'fin_location';
      const tpl = await findTemplate(a?.type_appareil, motif);
      const row = await upsertContact({
        dossier_id: d.id,
        motif,
        statut: 'a_contacter',
        commentaire: tpl?.corps || evalRes.contactReasons.map((r) => r.message).join('\n'),
        created_by: userId || null,
      });
      created.push(row);
    }
    return { created, totalOpen: existing.length + created.length };
  }

  function splitList(str) {
    return String(str || '')
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function joinList(arr) {
    return (arr || []).join(', ');
  }

  global.LocationData = {
    sb,
    invalidateCache,
    loadParams,
    setParam,
    loadRules,
    isRequired,
    listPrestataires,
    searchPatients,
    createPatient,
    updatePatient,
    listDossiers,
    getDossier,
    enrichDossier,
    dossierContext,
    createDossierComplet,
    updateDossier,
    deleteDossier,
    updateAppareil,
    changerAppareil,
    addProlongation,
    upsertSuiviLigne,
    deleteSuiviLigne,
    listTemplates,
    findTemplate,
    upsertTemplate,
    deleteTemplate,
    upsertPrestataire,
    deletePrestataire,
    listOpenContacts,
    upsertContact,
    syncContactQueue,
    splitList,
    joinList,
  };
})(window);
