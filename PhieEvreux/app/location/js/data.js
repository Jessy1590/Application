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
      champs_extra: payload.appareil.champs_extra && typeof payload.appareil.champs_extra === 'object'
        ? payload.appareil.champs_extra
        : {},
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

  /**
   * Clôture un dossier avec les réponses du formulaire dédié.
   * Pour chaque « oui », date ( *_le ) et OP ( *_op ) sont enregistrés.
   * @param {string} id
   * @param {{
   *   appareil_rendu: boolean,
   *   appareil_rendu_le?: string|null,
   *   appareil_rendu_op?: string|null,
   *   caution_rendue: boolean,
   *   caution_rendue_le?: string|null,
   *   caution_rendue_op?: string|null,
   *   facturation_ok: boolean,
   *   facturation_ok_le?: string|null,
   *   facturation_ok_op?: string|null,
   *   commentaire?: string|null,
   *   notes?: string|null,
   *   code_op?: string|null,
   * }} answers
   */
  async function cloturerDossier(id, answers) {
    const today = global.LocationRules.todayISO();
    const commentaire = String(answers.commentaire || '').trim();
    let notes = answers.notes != null ? String(answers.notes) : '';
    if (commentaire) {
      const line = `[Clôture ${today}] ${commentaire}`;
      notes = notes.trim() ? `${notes.trim()}\n${line}` : line;
    }
    const patch = {
      statut: 'cloture',
      date_cloture: today,
      appareil_rendu: !!answers.appareil_rendu,
      caution_rendue: !!answers.caution_rendue,
      facturation_ok: !!answers.facturation_ok,
      notes: notes.trim() || null,
      cloture_op: answers.code_op || null,
    };
    if (answers.appareil_rendu) {
      patch.appareil_rendu_le = answers.appareil_rendu_le || today;
      patch.appareil_rendu_op = answers.appareil_rendu_op || answers.code_op || null;
    } else {
      patch.appareil_rendu_le = null;
      patch.appareil_rendu_op = null;
    }
    if (answers.caution_rendue) {
      patch.caution_rendue_le = answers.caution_rendue_le || today;
      patch.caution_rendue_op = answers.caution_rendue_op || answers.code_op || null;
    } else {
      patch.caution_rendue_le = null;
      patch.caution_rendue_op = null;
    }
    if (answers.facturation_ok) {
      patch.facturation_ok_le = answers.facturation_ok_le || today;
      patch.facturation_ok_op = answers.facturation_ok_op || answers.code_op || null;
    } else {
      patch.facturation_ok_le = null;
      patch.facturation_ok_op = null;
    }
    return updateDossier(id, patch);
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

  /**
   * Résout un template Contact : mapping motif règle → motif template + fallback prolongation.
   */
  async function findTemplate(typeAppareil, motif) {
    const tplMotif = global.LocationRules.templateMotifFor(motif);
    const all = await listTemplates();
    const actifs = all.filter((t) => t.actif !== false);
    return (
      actifs.find((t) => t.motif === tplMotif && t.type_appareil === typeAppareil) ||
      actifs.find((t) => t.motif === tplMotif && !t.type_appareil) ||
      actifs.find((t) => t.motif === 'prolongation' && !t.type_appareil) ||
      actifs.find((t) => t.motif === 'prolongation') ||
      null
    );
  }

  function contactInterpVars(motif, rules, dossier) {
    const rule = (rules || []).find((r) => r.code === motif);
    const cond = global.LocationRules.parseJson(rule?.conditions, {});
    return global.LocationRules.varsFromConditions(cond, {
      date_min: dossier?.date_fin || '',
    });
  }

  async function listChampsCreation(typeAppareil, actifsOnly) {
    let q = sb()
      .from('location_champs_creation')
      .select('*')
      .order('type_appareil', { ascending: true })
      .order('code', { ascending: true });
    if (typeAppareil) q = q.eq('type_appareil', typeAppareil);
    if (actifsOnly) q = q.eq('actif', true);
    const { data, error } = await q;
    if (error) throw error;
    const rows = data || [];
    rows.sort((a, b) => {
      const ta = String(a.type_appareil || '');
      const tb = String(b.type_appareil || '');
      if (ta !== tb) return ta.localeCompare(tb, 'fr');
      return String(a.code || '').localeCompare(String(b.code || ''), 'fr');
    });
    return rows;
  }

  async function upsertChampCreation(row) {
    const payload = {
      type_appareil: row.type_appareil,
      code: row.code,
      libelle: row.libelle,
      data_type: row.data_type,
      options: row.options || {},
      obligatoire: !!row.obligatoire,
      ordre: Number(row.ordre) || 0,
      actif: row.actif !== false,
      updated_at: new Date().toISOString(),
    };
    if (row.id) {
      const { data, error } = await sb()
        .from('location_champs_creation')
        .update(payload)
        .eq('id', row.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await sb()
      .from('location_champs_creation')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function deleteChampCreation(id) {
    const { error } = await sb().from('location_champs_creation').delete().eq('id', id);
    if (error) throw error;
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
      .select(
        '*, dossier:location_dossiers(*, patient:location_patients(*), appareils:location_appareils(*), prolongations:location_prolongations(*))'
      )
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
   * Nouveau cycle commentaire si, après passage en phase appel, la date_fin
   * a avancé (prolongation) et les règles redemandent un contact (manque ordo).
   */
  function shouldResetContactToCommentaire(contact, dossier) {
    if (!contact || contact.phase !== 'appel') return false;
    const newFin = dossier.date_fin || null;
    const cycleFin = contact.phase_date_fin || null;
    return !!(newFin && cycleFin && newFin > cycleFin);
  }

  /**
   * Synchronise la file contact à partir des dossiers actifs + règles.
   * Crée en phase « commentaire » ; réouvre un cycle commentaire si manque ordo
   * après une prolongation post-phase-appel (contact ouvert) ou après résolution
   * (plus de contact ouvert → nouvelle ligne).
   */
  async function syncContactQueue(userId) {
    const params = await loadParams();
    const rules = await loadRules();
    const dossiers = await listDossiers({ statut: 'actif' });
    const existing = await listOpenContacts();
    const byDossier = new Map(existing.map((c) => [c.dossier_id, c]));
    const created = [];
    const reset = [];

    for (const d of dossiers) {
      const a = d.appareil_actif;
      if (d.qui_facture === 'prestataire' || a?.facturation_prestataire) continue;
      const evalRes = global.LocationRules.evaluate(dossierContext(d), rules, params);
      if (!evalRes.shouldContact) continue;

      const motif = evalRes.contactReasons[0]?.motif || 'fin_location';
      const tpl = await findTemplate(a?.type_appareil, motif);
      const vars = contactInterpVars(motif, rules, d);
      const rawCorps =
        tpl?.corps || evalRes.contactReasons.map((r) => r.message).join('\n');
      const commentaire = global.LocationRules.interpolate(rawCorps, vars);
      const open = byDossier.get(d.id);

      if (open) {
        if (!shouldResetContactToCommentaire(open, d)) continue;
        const row = await upsertContact({
          id: open.id,
          dossier_id: d.id,
          motif,
          statut: 'a_contacter',
          phase: 'commentaire',
          commentaire,
          resultat: null,
          canal: null,
          contacted_at: null,
          commentaire_fait_at: null,
          phase_date_fin: d.date_fin || null,
        });
        reset.push(row);
        byDossier.set(d.id, row);
        continue;
      }

      const row = await upsertContact({
        dossier_id: d.id,
        motif,
        statut: 'a_contacter',
        phase: 'commentaire',
        commentaire,
        phase_date_fin: d.date_fin || null,
        created_by: userId || null,
      });
      created.push(row);
      byDossier.set(d.id, row);
    }
    return {
      created,
      reset,
      totalOpen: byDossier.size,
    };
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
    cloturerDossier,
    deleteDossier,
    updateAppareil,
    changerAppareil,
    addProlongation,
    upsertSuiviLigne,
    deleteSuiviLigne,
    listTemplates,
    findTemplate,
    contactInterpVars,
    listChampsCreation,
    upsertChampCreation,
    deleteChampCreation,
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
