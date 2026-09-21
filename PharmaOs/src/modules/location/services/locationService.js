/**
 * Accès données Location — port PhieEvreux data.js (schéma PharmaOs).
 */
import { supabase } from '../../../shared/supabaseClient.js';
import * as LocationRules from './locationRules.js';
import { renderAppMail } from '../../admin/services/mailTemplatesService.js';
import {
  fetchPharmacySettings,
  pharmacyToMailFields,
} from '../../admin/services/pharmacySettingsService.js';
import { logEvent, logMailEvent } from '../../../shared/logService.js';


  let paramsCache = null;
  let rulesCache = null;

  function sb() {
    return supabase;
  }

  function audit(action, detail) {
    const d = detail && typeof detail === 'object' ? detail : {};
    logEvent({
      category: 'location',
      action: String(action || 'action').slice(0, 80),
      entity: d.dossier_id ? 'location_dossiers' : 'location',
      entityId: d.dossier_id || d.contact_id || d.appareil_id || null,
      message: `Location · ${action}`,
      details: d,
    });
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
    rulesCache = await LocationRules.listRules(sb());
    return rulesCache;
  }

  /**
   * Catalogue des champs du formulaire Création (étapes = chips admin « Création dossier »).
   * creation_champs (location_parametres) :
   *   { [etape]: { [code]: { actif?: boolean, obligatoire?: boolean, libelle?: string, custom?: boolean } } }
   * etapes : patient | personnel | appareil | location
   * Defaults : actif=true ; obligatoire = champs_obligatoires[code] si clé historique, sinon defaultObligatoire.
   * Entrées custom (hors catalogue) : libelle + custom:true ; valeurs formulaires via appareil.champs_extra.
   * champs_obligatoires reste synchronisé à l’enregistrement admin (compat).
   */
  const CREATION_ETAPES = [
    {
      id: 'patient',
      label: 'Patient',
      fields: [
        { code: 'patient_nom', label: 'Nom', defaultObligatoire: true },
        { code: 'patient_prenom', label: 'Prénom', defaultObligatoire: true },
        { code: 'patient_date_naissance', label: 'Date de naissance', defaultObligatoire: true },
        { code: 'patient_adresse', label: 'Adresse', defaultObligatoire: true },
        { code: 'patient_telephone', label: 'Téléphones', defaultObligatoire: true },
        { code: 'patient_mails', label: 'Mails', defaultObligatoire: false },
      ],
    },
    {
      id: 'personnel',
      label: 'Personnel',
      fields: [
        { code: 'code_op', label: 'Code OP', defaultObligatoire: true },
        { code: 'caution', label: 'Caution', defaultObligatoire: true },
        { code: 'notes', label: 'Notes', defaultObligatoire: false },
      ],
    },
    {
      id: 'appareil',
      label: 'Appareil',
      fields: [
        { code: 'type_appareil', label: 'Type d’appareil', defaultObligatoire: true },
        { code: 'type_libelle', label: 'Libellé (autre)', defaultObligatoire: true },
        { code: 'source', label: 'Source', defaultObligatoire: true },
        { code: 'prestataire_id', label: 'Prestataire', defaultObligatoire: true },
        { code: 'matricule', label: 'Matricule', defaultObligatoire: false },
        { code: 'mode_obtention', label: 'Obtention', defaultObligatoire: true },
        { code: 'livraison', label: 'Livraison', defaultObligatoire: true },
        { code: 'numero_pharmacie', label: 'N° appareil pharmacie', defaultObligatoire: true },
        { code: 'desinfection', label: 'Désinfection faite', defaultObligatoire: false },
        { code: 'encart_texte', label: 'Commentaire', defaultObligatoire: false },
      ],
    },
    {
      id: 'location',
      label: 'Location',
      fields: [
        { code: 'date_debut', label: 'Date de début', defaultObligatoire: true },
        { code: 'date_ordo', label: 'Date d’ordonnance', defaultObligatoire: true },
        { code: 'duree', label: 'Durée', defaultObligatoire: true },
        { code: 'unite', label: 'Unité', defaultObligatoire: true },
      ],
    },
  ];

  const CREATION_FIELD_INDEX = (() => {
    const map = {};
    for (const etape of CREATION_ETAPES) {
      for (const f of etape.fields) {
        map[f.code] = { etape: etape.id, ...f };
      }
    }
    return map;
  })();

  function legacyObligatoire(params, key, fallback) {
    const champs = params?.champs_obligatoires;
    if (champs && typeof champs === 'object' && Object.prototype.hasOwnProperty.call(champs, key)) {
      return champs[key] !== false;
    }
    return fallback !== false;
  }

  const CREATION_LEGACY_OBL_KEYS = [
    'patient_nom',
    'patient_prenom',
    'patient_date_naissance',
    'patient_adresse',
    'patient_telephone',
    'code_op',
    'caution',
    'type_appareil',
    'date_debut',
    'date_ordo',
  ];

  /** @returns {{ actif: boolean, obligatoire: boolean, libelle?: string, custom?: boolean }} */
  function getCreationChamp(params, etape, code) {
    const meta = CREATION_FIELD_INDEX[code];
    const defObl = meta ? meta.defaultObligatoire !== false : false;
    const entry = params?.creation_champs?.[etape]?.[code];
    const custom = !!(entry?.custom || (!meta && entry));
    const actif = entry?.actif !== false;
    let obligatoire;
    if (entry && typeof entry.obligatoire === 'boolean') {
      obligatoire = entry.obligatoire;
    } else if (meta) {
      obligatoire = legacyObligatoire(params, code, defObl);
    } else {
      obligatoire = false;
    }
    const libelle =
      (entry && typeof entry.libelle === 'string' && entry.libelle.trim()) ||
      meta?.label ||
      code;
    return { actif, obligatoire, libelle, custom };
  }

  /**
   * Champs d’une étape : catalogue fixe + éventuelles lignes custom (creation_champs).
   * @returns {{ code: string, label: string, custom: boolean, defaultObligatoire?: boolean }[]}
   */
  function listCreationFieldsForEtape(params, etapeId) {
    const etape = CREATION_ETAPES.find((e) => e.id === etapeId);
    const catalog = (etape?.fields || []).map((f) => ({
      code: f.code,
      label: f.label,
      custom: false,
      defaultObligatoire: f.defaultObligatoire,
    }));
    const known = new Set(catalog.map((f) => f.code));
    const bag = params?.creation_champs?.[etapeId];
    const customs = [];
    if (bag && typeof bag === 'object') {
      for (const code of Object.keys(bag)) {
        if (known.has(code)) continue;
        const entry = bag[code];
        if (!entry || typeof entry !== 'object') continue;
        const libelle =
          typeof entry.libelle === 'string' && entry.libelle.trim()
            ? entry.libelle.trim()
            : code;
        customs.push({ code, label: libelle, custom: true });
      }
    }
    customs.sort((a, b) => a.label.localeCompare(b.label, 'fr'));
    return catalog.concat(customs);
  }

  function isCreationActif(params, etape, code) {
    return getCreationChamp(params, etape, code).actif;
  }

  function isCreationRequired(params, etape, code) {
    const c = getCreationChamp(params, etape, code);
    return c.actif && c.obligatoire;
  }

  /** Compat : clé historique champs_obligatoires / code catalogue. */
  function isRequired(params, key) {
    const meta = CREATION_FIELD_INDEX[key];
    if (meta) return isCreationRequired(params, meta.etape, key);
    return legacyObligatoire(params, key, true);
  }

  /** Fusionne creation_champs + miroir champs_obligatoires pour les codes historiques. */
  function buildCreationChampsPayload(uiMap) {
    const creation_champs = {};
    const champs_obligatoires = {};
    for (const etape of CREATION_ETAPES) {
      creation_champs[etape.id] = {};
      const codes = new Set(etape.fields.map((f) => f.code));
      const fromUi = uiMap?.[etape.id];
      if (fromUi && typeof fromUi === 'object') {
        for (const code of Object.keys(fromUi)) codes.add(code);
      }
      for (const code of codes) {
        const meta = CREATION_FIELD_INDEX[code];
        const raw = fromUi?.[code] || {};
        const custom = !!(raw.custom || !meta);
        const actif = raw.actif !== false;
        const obligatoire = raw.obligatoire === true;
        const entry = { actif, obligatoire };
        if (custom) {
          entry.custom = true;
          const libelle =
            typeof raw.libelle === 'string' && raw.libelle.trim()
              ? raw.libelle.trim()
              : code;
          entry.libelle = libelle;
        }
        creation_champs[etape.id][code] = entry;
        if (meta && CREATION_LEGACY_OBL_KEYS.includes(code)) {
          champs_obligatoires[code] = actif && obligatoire;
        }
      }
    }
    return { creation_champs, champs_obligatoires };
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

  function sanitizePatientRow(row) {
    const r = row && typeof row === 'object' ? { ...row } : {};
    if (r.date_naissance === '') r.date_naissance = null;
    r.telephones = Array.isArray(r.telephones) ? r.telephones : [];
    r.mails = Array.isArray(r.mails) ? r.mails : [];
    if (r.adresse === '') r.adresse = null;
    return r;
  }

  function formatSbError(error, fallback) {
    if (!error) return fallback || 'Erreur';
    const parts = [error.message, error.details, error.hint].filter(Boolean);
    return parts.length ? parts.join(' — ') : fallback || String(error);
  }

  async function createPatient(row) {
    const payload = sanitizePatientRow(row);
    const { data, error } = await sb().from('location_patients').insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async function updatePatient(id, row) {
    const payload = {
      ...sanitizePatientRow(row),
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
   * Filtre texte partagé (Prolongation / Clôture / Suivi) :
   * nom, prénom, type, matricule, numéro pharmacie.
   */
  function matchesDossierSearch(d, q) {
    const t = String(q || '')
      .toLowerCase()
      .trim();
    if (!t) return true;
    const p = d?.patient || {};
    const a = d?.appareil_actif || {};
    const typeCode = String(a.type_appareil || '').toLowerCase();
    const typeLabel = String(
      (LocationRules && LocationRules.typeLabel(a.type_appareil)) || ''
    ).toLowerCase();
    if (
      String(p.nom || '')
        .toLowerCase()
        .includes(t) ||
      String(p.prenom || '')
        .toLowerCase()
        .includes(t) ||
      typeCode.includes(t) ||
      typeLabel.includes(t) ||
      String(a.matricule || '')
        .toLowerCase()
        .includes(t) ||
      String(a.numero_pharmacie || '')
        .toLowerCase()
        .includes(t)
    ) {
      return true;
    }
    return (d?.appareils || []).some(
      (app) =>
        String(app.matricule || '')
          .toLowerCase()
          .includes(t) ||
        String(app.numero_pharmacie || '')
          .toLowerCase()
          .includes(t)
    );
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
      rows = rows.filter((d) => matchesDossierSearch(d, filters.q));
    }
    if (filters.type_appareil) {
      rows = rows.filter((d) => d.appareil_actif?.type_appareil === filters.type_appareil);
    }
    if (filters.a_contacter) {
      const params = await loadParams();
      const rules = await loadRules();
      rows = rows.filter((d) => {
        if (d.statut === 'en_attente' || d.statut === 'cloture' || d.statut === 'annule') {
          return false;
        }
        const ctx = dossierContext(d);
        return LocationRules.evaluate(ctx, rules, params).shouldContact;
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

  /**
   * Facturation courante = prestataire (qui_facture dossier ou flag appareil).
   * Toujours lire la valeur à jour du dossier enrichi — peut changer en cours de location.
   */
  function isFactureParPrestataire(d) {
    if (!d) return false;
    const a = d.appareil_actif || {};
    return LocationRules.isFactureParPrestataire({
      qui_facture: d.qui_facture,
      facturation_prestataire: a.facturation_prestataire,
    });
  }

  function dossierContext(d) {
    const a = d.appareil_actif || {};
    const prolongs = (d.prolongations || []).slice().sort((x, y) =>
      String(y.date_fin || y.created_at || '').localeCompare(String(x.date_fin || x.created_at || ''))
    );
    const lastProlong = prolongs[0] || null;
    return {
      type_appareil: a.type_appareil,
      date_debut: d.date_debut || a.date_debut,
      date_fin: d.date_fin,
      appareil_rendu: d.appareil_rendu,
      qui_facture: d.qui_facture,
      facturation_prestataire: a.facturation_prestataire,
      statut: d.statut,
      has_prolongation: (d.prolongations || []).length > 1,
      prolong_duree: lastProlong != null ? lastProlong.duree : null,
      prolong_unite: lastProlong != null ? lastProlong.unite : null,
    };
  }

  function normalizeDossierStatut(statut) {
    if (statut && typeof statut === 'object') statut = statut.statut;
    return statut === 'en_attente' ? 'en_attente' : 'actif';
  }

  /** DB : `semaine` | `mois` — alias UI/saisie → valeur contrainte. */
  function normalizePeseBebePeriode(value) {
    if (value == null || value === '') return null;
    const s = String(value).trim().toLowerCase();
    if (s === 'mois' || s === 'mensuelle' || s === 'mensuel') return 'mois';
    if (s === 'semaine' || s === 'semaines' || s === 'hebdomadaire') return 'semaine';
    return s;
  }

  function appareilRowFromPayload(payload, dossierId) {
    const app = payload.appareil || {};
    return {
      dossier_id: dossierId,
      type_appareil: app.type_appareil || 'aerosol',
      type_libelle: app.type_libelle || null,
      source: app.source || 'parc',
      prestataire_id: app.prestataire_id || null,
      matricule: app.matricule || null,
      numero_pharmacie: app.numero_pharmacie || null,
      mode_obtention: app.mode_obtention || null,
      livraison: app.livraison || null,
      desinfection: !!app.desinfection,
      encart_texte: app.encart_texte || null,
      pese_bebe_regler_avance: app.pese_bebe_regler_avance ?? null,
      pese_bebe_periode: normalizePeseBebePeriode(app.pese_bebe_periode),
      facturation_prestataire: !!app.facturation_prestataire,
      date_accouchement: app.date_accouchement || null,
      champs_extra: app.champs_extra && typeof app.champs_extra === 'object' ? app.champs_extra : {},
      actif: true,
      date_debut: payload.date_debut || null,
    };
  }

  function prolongInitialeFromPayload(payload, dossierId, userId) {
    const duree = Number(payload.duree) > 0 ? Number(payload.duree) : 10;
    const unite = payload.unite || 'semaines';
    const dateOrdo = payload.date_ordo || null;
    const dateFin = LocationRules.addDuration(
      payload.date_debut || dateOrdo,
      duree,
      unite
    );
    return {
      dossier_id: dossierId,
      date_ordo: dateOrdo,
      duree,
      unite,
      date_fin: dateFin,
      notes: 'Location initiale',
      created_by: userId || null,
    };
  }

  /**
   * Insert dossier ; réessaie sans created_by si FK profiles échoue.
   */
  async function insertDossierRow(dossierRow) {
    let { data, error } = await sb()
      .from('location_dossiers')
      .insert(dossierRow)
      .select()
      .single();
    // FK created_by → portail.profiles : réessaie sans created_by si profil manquant
    if (
      error &&
      dossierRow.created_by &&
      (error.code === '23503' || /created_by|foreign key|profiles/i.test(String(error.message || '')))
    ) {
      const retry = { ...dossierRow, created_by: null };
      ({ data, error } = await sb().from('location_dossiers').insert(retry).select().single());
    }
    if (error) {
      const err = new Error(formatSbError(error, 'Erreur création dossier'));
      err.cause = error;
      err.code = error.code;
      throw err;
    }
    return data;
  }

  /**
   * Annule une création partielle (dossier + patient neuf si orphelin).
   * Appareils / prolongations / contacts partent en CASCADE avec le dossier.
   */
  async function rollbackCreateDossierComplet(dossierId, patientId, patientWasNew) {
    if (dossierId) {
      try {
        await deleteDossier(dossierId);
      } catch (_) {
        /* best-effort */
      }
    }
    if (patientWasNew && patientId) {
      try {
        await sb().from('location_patients').delete().eq('id', patientId);
      } catch (_) {
        /* patient encore lié à un autre dossier → on laisse */
      }
    }
  }

  /**
   * Crée patient + dossier + appareil + prolongation initiale.
   * Si appareil / prolongation échoue : rollback dossier (+ patient neuf orphelin).
   * @param {object} payload
   * @param {string|null} userId
   * @param {{ statut?: 'actif'|'en_attente' }} [opts]
   */
  async function createDossierComplet(payload, userId, opts = {}) {
    const statut = normalizeDossierStatut(opts && opts.statut);
    const patientWasNew = !payload.patient_id;
    const patient = payload.patient_id
      ? await updatePatient(payload.patient_id, payload.patient)
      : await createPatient(payload.patient);

    const dossierRow = {
      patient_id: patient.id,
      code_op: payload.code_op || null,
      caution: payload.caution || null,
      statut,
      date_debut: payload.date_debut || null,
      qui_facture: payload.qui_facture || 'pharmacie',
      created_by: userId || null,
      notes: payload.notes || null,
    };
    let dossier;
    try {
      dossier = await insertDossierRow(dossierRow);
    } catch (e) {
      e.patient_id = patient.id;
      if (patientWasNew) {
        try {
          await sb().from('location_patients').delete().eq('id', patient.id);
        } catch (_) {
          /* ignore */
        }
      }
      throw e;
    }

    const { error: aErr } = await sb()
      .from('location_appareils')
      .insert(appareilRowFromPayload(payload, dossier.id))
      .select()
      .single();
    if (aErr) {
      await rollbackCreateDossierComplet(dossier.id, patient.id, patientWasNew);
      const err = new Error(formatSbError(aErr, 'Erreur appareil'));
      err.patient_id = patient.id;
      err.dossier_id = dossier.id;
      throw err;
    }

    const { error: pErr } = await sb()
      .from('location_prolongations')
      .insert(prolongInitialeFromPayload(payload, dossier.id, userId))
      .select()
      .single();
    if (pErr) {
      await rollbackCreateDossierComplet(dossier.id, patient.id, patientWasNew);
      const err = new Error(formatSbError(pErr, 'Erreur prolongation'));
      err.patient_id = patient.id;
      err.dossier_id = dossier.id;
      throw err;
    }

    const created = await getDossier(dossier.id);
    audit('dossier_create', {
      dossier_id: dossier.id,
      statut,
      type_appareil: payload?.appareil?.type_appareil || payload?.type_appareil || null,
    });
    return created;
  }

  /**
   * Met à jour un dossier existant (reprise en_attente → en_attente ou actif).
   * @param {string} dossierId
   * @param {object} payload
   * @param {string|null} userId
   * @param {{ statut?: 'actif'|'en_attente' }} [opts]
   */
  async function updateDossierComplet(dossierId, payload, userId, opts = {}) {
    const statut = normalizeDossierStatut(opts && opts.statut);
    const existing = await getDossier(dossierId);
    if (!existing) throw new Error('Dossier introuvable');

    const patient = payload.patient_id
      ? await updatePatient(payload.patient_id, payload.patient)
      : existing.patient_id
        ? await updatePatient(existing.patient_id, payload.patient)
        : await createPatient(payload.patient);

    await updateDossier(dossierId, {
      patient_id: patient.id,
      code_op: payload.code_op || null,
      caution: payload.caution || null,
      statut,
      date_debut: payload.date_debut || null,
      qui_facture: payload.qui_facture || existing.qui_facture || 'pharmacie',
      notes: payload.notes || null,
    });

    const appareil = existing.appareil_actif || (existing.appareils || [])[0];
    const appPayload = appareilRowFromPayload(payload, dossierId);
    delete appPayload.dossier_id;
    if (appareil?.id) {
      await updateAppareil(appareil.id, appPayload);
    } else {
      const { error: aErr } = await sb()
        .from('location_appareils')
        .insert({ ...appPayload, dossier_id: dossierId })
        .select()
        .single();
      if (aErr) throw aErr;
    }

    const prolongs = (existing.prolongations || []).slice().sort((a, b) =>
      String(a.created_at || '').localeCompare(String(b.created_at || ''))
    );
    const initiale =
      prolongs.find((p) => p.notes === 'Location initiale') || prolongs[0] || null;
    const prolongRow = prolongInitialeFromPayload(payload, dossierId, userId);
    if (initiale?.id) {
      const duree = prolongRow.duree;
      const unite = prolongRow.unite;
      const dateOrdo = prolongRow.date_ordo;
      const base = payload.date_debut || dateOrdo;
      const dateFin = LocationRules.addDuration(base, duree, unite);
      const { error: pErr } = await sb()
        .from('location_prolongations')
        .update({
          date_ordo: dateOrdo,
          duree,
          unite,
          date_fin: dateFin,
          notes: 'Location initiale',
        })
        .eq('id', initiale.id);
      if (pErr) throw pErr;
    } else {
      const { error: pErr } = await sb()
        .from('location_prolongations')
        .insert(prolongRow)
        .select()
        .single();
      if (pErr) throw pErr;
    }

    const updated = await getDossier(dossierId);
    audit('dossier_update', { dossier_id: dossierId, statut });
    return updated;
  }

  async function updateAppareil(id, row) {
    const patch = { ...row, updated_at: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(patch, 'pese_bebe_periode')) {
      patch.pese_bebe_periode = normalizePeseBebePeriode(patch.pese_bebe_periode);
    }
    const { data, error } = await sb()
      .from('location_appareils')
      .update(patch)
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
   *   notes?: string|null,
   *   code_op?: string|null,
   * }} answers
   */
  async function cloturerDossier(id, answers) {
    const today = LocationRules.todayISO();
    const notes = answers.notes != null ? String(answers.notes).trim() || null : null;
    const patch = {
      statut: 'cloture',
      date_cloture: today,
      appareil_rendu: !!answers.appareil_rendu,
      caution_rendue: !!answers.caution_rendue,
      facturation_ok: !!answers.facturation_ok,
      notes,
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
    const out = await updateDossier(id, patch);
    audit('dossier_cloture', { dossier_id: id });
    return out;
  }

  /** Supprime un dossier ; appareils / prolongations / suivi_lignes / contacts via CASCADE. */
  async function deleteDossier(id) {
    const { error } = await sb().from('location_dossiers').delete().eq('id', id);
    if (error) throw error;
    audit('dossier_delete', { dossier_id: id });
  }

  async function changerAppareil(dossierId, newApp, userId) {
    const today = LocationRules.todayISO();
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
    audit('appareil_change', {
      dossier_id: dossierId,
      type_appareil: newApp?.type_appareil || null,
    });
    return data;
  }

  /**
   * Prolongation : nouvelle date_fin = date_fin courante du dossier + durée ordo.
   * (Création initiale calcule date_debut|date_ordo + durée ; ici on étend la fin existante.)
   * date_ordo est enregistrée pour l’historique, pas comme base du calcul.
   */
  async function addProlongation(dossierId, row, userId) {
    let dateFin = row.date_fin || null;
    if (!dateFin) {
      const dossier = await getDossier(dossierId);
      const base =
        dossier?.date_fin ||
        row.date_ordo ||
        LocationRules.todayISO();
      dateFin = LocationRules.addDuration(base, row.duree, row.unite);
    }
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
    audit('prolongation_add', {
      dossier_id: dossierId,
      duree: row.duree,
      unite: row.unite,
      date_fin: dateFin,
    });
    return data;
  }

  async function recalcProlongationChain(dossierId) {
    const dossier = await getDossier(dossierId);
    const list = (dossier.prolongations || []).slice().sort((a, b) =>
      String(a.created_at || '').localeCompare(String(b.created_at || ''))
    );
    let base =
      dossier.date_debut ||
      list[0]?.date_ordo ||
      LocationRules.todayISO();
    for (const p of list) {
      const dateFin = LocationRules.addDuration(base, p.duree, p.unite);
      const { error } = await sb()
        .from('location_prolongations')
        .update({ date_fin: dateFin })
        .eq('id', p.id);
      if (error) throw error;
      base = dateFin || base;
    }
    return getDossier(dossierId);
  }

  async function updateProlongation(id, row) {
    const { data: existing, error: getErr } = await sb()
      .from('location_prolongations')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr) throw getErr;
    const payload = {
      date_ordo: row.date_ordo !== undefined ? row.date_ordo || null : existing.date_ordo,
      duree: row.duree != null ? Number(row.duree) : existing.duree,
      unite: row.unite != null ? row.unite : existing.unite,
      notes: row.notes !== undefined ? row.notes || null : existing.notes,
    };
    const { error } = await sb()
      .from('location_prolongations')
      .update(payload)
      .eq('id', id);
    if (error) throw error;
    return recalcProlongationChain(existing.dossier_id);
  }

  async function deleteProlongation(id) {
    const { data: existing, error: getErr } = await sb()
      .from('location_prolongations')
      .select('*')
      .eq('id', id)
      .single();
    if (getErr) throw getErr;
    const { error } = await sb().from('location_prolongations').delete().eq('id', id);
    if (error) throw error;
    return recalcProlongationChain(existing.dossier_id);
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
   * Résout un template Contact par motif template (prolongation, reclame_appareil, …).
   */
  async function findTemplateByMotif(typeAppareil, templateMotif) {
    const tplMotif = templateMotif || 'prolongation';
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

  async function findTemplateById(id) {
    if (!id) return null;
    const { data, error } = await sb()
      .from('location_templates_contact')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  }

  function contactInterpVars(motif, rules, dossier) {
    const rule = (rules || []).find((r) => r.code === motif);
    const cond = LocationRules.parseJson(rule?.conditions, {});
    const dateRaw = dossier?.date_fin || '';
    const typeCode = dossier?.appareil_actif?.type_appareil;
    return LocationRules.varsFromConditions(cond, {
      date_min: LocationRules.formatDateFr(dateRaw) || dateRaw,
      type_appareil: typeCode ? LocationRules.typeLabel(typeCode) : '',
    });
  }

  const CONTACT_MOTIF_LABELS = {
    prolongation: 'Prolongation',
    prolongation_tire_lait: 'Prolongation tire-lait',
    reclame_appareil: 'Réclamer appareil',
    reclame_appareil_tens: 'Réclamer TENS',
  };

  function yesNo(v) {
    return v ? 'oui' : 'non';
  }

  /** Contexte placeholders mail Location (champs Suivi + contact). */
  function buildLocationMailContext(dossier, contact = null, extra = {}) {
    const d = dossier || {};
    const p = d.patient || {};
    const a = d.appareil_actif || {};
    const mails = Array.isArray(p.mails) ? p.mails.filter(Boolean) : [];
    const phones = Array.isArray(p.telephones) ? p.telephones.filter(Boolean) : [];
    const firstProlong = Array.isArray(d.prolongations) && d.prolongations.length
      ? d.prolongations[0]
      : null;
    const motif = contact?.motif || extra.contact_motif || '';
    const motifLabel =
      CONTACT_MOTIF_LABELS[motif] ||
      (LocationRules.templateMotifFor?.(motif)
        ? CONTACT_MOTIF_LABELS[LocationRules.templateMotifFor(motif)]
        : null) ||
      motif ||
      '';
    const typeCode = a.type_appareil || '';
    return {
      patient_nom: p.nom || '',
      patient_prenom: p.prenom || '',
      patient_date_naissance: p.date_naissance || '',
      patient_adresse: p.adresse || '',
      patient_telephones: phones.join(' · '),
      patient_mails: mails.join(' · '),
      patient_email: mails[0] || '',
      code_op: d.code_op || '',
      caution: d.caution || '',
      statut: d.statut || '',
      qui_facture: d.qui_facture || '',
      date_debut: d.date_debut || '',
      date_fin: d.date_fin || '',
      date_ordo: firstProlong?.date_ordo || '',
      appareil_rendu: yesNo(!!d.appareil_rendu),
      caution_rendue: yesNo(!!d.caution_rendue),
      caution_rendue_le: d.caution_rendue_le || '',
      caution_rendue_op: d.caution_rendue_op || '',
      date_cloture: d.date_cloture || '',
      cloture_op: d.cloture_op || '',
      notes: d.notes || '',
      type_appareil: typeCode ? LocationRules.typeLabel(typeCode) : '',
      type_appareil_code: typeCode,
      type_libelle: a.type_libelle || '',
      source: a.source || (a.prestataire_id ? 'prestataire' : 'parc'),
      matricule: a.matricule || '',
      numero_pharmacie: a.numero_pharmacie || '',
      mode_obtention: a.mode_obtention || '',
      livraison: a.livraison || '',
      desinfection: yesNo(!!a.desinfection),
      encart_texte: a.encart_texte || '',
      facturation_prestataire: yesNo(!!a.facturation_prestataire),
      pese_bebe_regler_avance: yesNo(!!a.pese_bebe_regler_avance),
      pese_bebe_periode: a.pese_bebe_periode || '',
      date_accouchement: a.date_accouchement || '',
      dossier_id: d.id || '',
      dossier_id_short: d.id ? String(d.id).slice(0, 8) : '',
      contact_motif: motif,
      contact_motif_label: motifLabel,
      contact_commentaire: contact?.commentaire || extra.contact_commentaire || '',
      contact_resultat: contact?.resultat || extra.contact_resultat || '',
      contact_note: extra.contact_note || contact?.note || '',
      contact_statut: contact?.statut || '',
      date_aujourdhui: new Date().toLocaleDateString('fr-FR'),
      ...extra,
    };
  }

  /**
   * Envoie le template location.contact_probleme au 1er mail patient (ou `to`).
   * @returns {{ to: string, subject: string }}
   */
  async function sendContactProblemEmail(dossier, contact = null, { to, note, resultat } = {}) {
    const mails = dossier?.patient?.mails || [];
    const dest = String(to || mails[0] || '').trim();
    if (!dest || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) {
      throw new Error('Aucun e-mail patient valide pour l’envoi.');
    }
    const ctx = {
      ...buildLocationMailContext(dossier, contact, {
        contact_note: note || '',
        contact_resultat: resultat || contact?.resultat || '',
      }),
      ...pharmacyToMailFields(await fetchPharmacySettings()),
    };
    const rendered = await renderAppMail('location', 'contact_probleme', ctx);
    const subject = rendered.subject || 'Votre location — contact pharmacie';
    const html = (rendered.body && rendered.body.trim())
      ? rendered.body
      : `<p>Bonjour ${ctx.patient_prenom || ''},</p><p>Nous vous contactons au sujet de votre location.</p>`;
    const { data, error } = await sb().functions.invoke('send-transactional-email', {
      body: { to: dest, subject, html },
    });
    if (error || data?.error) {
      const msg = data?.error || error?.message || 'Échec envoi e-mail';
      logMailEvent({
        module: 'location',
        templateKey: 'contact_probleme',
        to: dest,
        success: false,
        error: msg,
        entity: 'location_dossiers',
        entityId: dossier?.id || null,
      });
      throw new Error(msg);
    }
    logMailEvent({
      module: 'location',
      templateKey: 'contact_probleme',
      to: dest,
      success: true,
      entity: 'location_dossiers',
      entityId: dossier?.id || null,
    });
    return { to: dest, subject };
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

  const CONTACT_SELECT =
    '*, dossier:location_dossiers(*, patient:location_patients(*), appareils:location_appareils(*), prolongations:location_prolongations(*), contacts:location_contacts(*))';

  const OPEN_CONTACT_STATUTS = ['a_contacter', 'en_cours', 'reporte'];
  const OUTCOME_RESULTATS = ['ramene_semaine', 'ordo_mail', 'autre_raison', 'mauvais_numero', 'PERTE'];

  /**
   * Tâches équipe liées au flux Contact Location (matrice Assignation).
   * - File ouverte → location_a_rappeler
   * - Résolu + résultat « suite métier » → location_attente_suite
   * - Sinon (annulé / clos) → clôture des deux catégories
   */
  async function syncLocationContactTasks(contact) {
    if (!contact?.id) return;
    try {
      const { ensureCategoryTask, completeCategoryTasks } = await import('../../tasks/services/taskService.js');
      const open = OPEN_CONTACT_STATUTS.includes(contact.statut);
      const attente = contact.statut === 'resolu' && OUTCOME_RESULTATS.includes(contact.resultat);
      const patientLabel =
        contact.dossier?.patient
          ? `${contact.dossier.patient.nom || ''} ${contact.dossier.patient.prenom || ''}`.trim()
          : '';
      const motif = contact.motif || 'contact';
      const createdBy = contact.created_by || null;

      if (open) {
        await completeCategoryTasks('location_attente_suite', 'contact_id', contact.id, 'Contact rouvert');
        await ensureCategoryTask(
          'location_a_rappeler',
          `Location à rappeler — ${patientLabel || motif}`,
          {
            type: 'location_a_rappeler',
            contact_id: contact.id,
            dossier_id: contact.dossier_id,
            motif: contact.motif,
            statut: contact.statut,
            patient: patientLabel || null,
          },
          createdBy,
        );
      } else if (attente) {
        await completeCategoryTasks('location_a_rappeler', 'contact_id', contact.id, 'Appel abouti');
        await ensureCategoryTask(
          'location_attente_suite',
          `Location — suite (${contact.resultat}) — ${patientLabel || motif}`,
          {
            type: 'location_attente_suite',
            contact_id: contact.id,
            dossier_id: contact.dossier_id,
            motif: contact.motif,
            resultat: contact.resultat,
            patient: patientLabel || null,
          },
          createdBy,
        );
      } else {
        await completeCategoryTasks('location_a_rappeler', 'contact_id', contact.id, `Contact ${contact.statut}`);
        await completeCategoryTasks('location_attente_suite', 'contact_id', contact.id, `Contact ${contact.statut}`);
      }
    } catch (e) {
      console.warn('[location] sync tâches:', e.message);
    }
  }

  function mapContactRows(data) {
    return (data || []).map((c) => ({
      ...c,
      dossier: enrichDossier(c.dossier),
    }));
  }

  /**
   * Cycle contact obsolète si la date_fin dossier a avancé (prolongation)
   * après phase_date_fin — même critère que shouldResetContactToCommentaire.
   */
  function isContactCycleObsolete(contact, dossier) {
    const newFin = dossier?.date_fin || null;
    const cycleFin = contact?.phase_date_fin || null;
    return !!(newFin && cycleFin && newFin > cycleFin);
  }

  async function fetchOpenContactsRaw() {
    const { data, error } = await sb()
      .from('location_contacts')
      .select(CONTACT_SELECT)
      .in('statut', OPEN_CONTACT_STATUTS)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return mapContactRows(data);
  }

  async function fetchOutcomeContactsRaw() {
    const { data, error } = await sb()
      .from('location_contacts')
      .select(CONTACT_SELECT)
      .eq('statut', 'resolu')
      .in('resultat', OUTCOME_RESULTATS)
      .order('contacted_at', { ascending: false });
    if (error) throw error;
    return mapContactRows(data);
  }

  /** File ouverte UI : exclut cycles obsolètes et facturation prestataire (valeur dossier à jour). */
  async function listOpenContacts() {
    return (await fetchOpenContactsRaw()).filter((c) => {
      if (isContactCycleObsolete(c, c.dossier)) return false;
      if (isFactureParPrestataire(c.dossier)) return false;
      return true;
    });
  }

  /**
   * Contacts résolus en attente de suite métier (prolongation / retour appareil / PERTE).
   * Hors file ouverte — statut DB = resolu uniquement.
   * Exclut les cycles obsolètes, la facturation prestataire, et les dossiers
   * qui ont déjà un contact ouvert courant (évite Appels + Attente/Perte).
   */
  async function listOutcomeContacts() {
    const [outcomes, opens] = await Promise.all([
      fetchOutcomeContactsRaw(),
      fetchOpenContactsRaw(),
    ]);
    const openDossierIds = new Set(
      opens
        .filter((c) => !isContactCycleObsolete(c, c.dossier) && !isFactureParPrestataire(c.dossier))
        .map((c) => c.dossier_id)
    );
    return outcomes.filter((c) => {
      if (isContactCycleObsolete(c, c.dossier)) return false;
      if (isFactureParPrestataire(c.dossier)) return false;
      if (openDossierIds.has(c.dossier_id)) return false;
      return true;
    });
  }

  /**
   * Upsert contact ; réessaie sans created_by si FK profiles échoue.
   */
  async function upsertContact(row) {
    const isFkCreatedBy = (error) =>
      error &&
      row.created_by &&
      (error.code === '23503' || /created_by|foreign key|profiles/i.test(String(error.message || '')));

    if (row.id) {
      const payload = { ...row, updated_at: new Date().toISOString() };
      let { data, error } = await sb()
        .from('location_contacts')
        .update(payload)
        .eq('id', row.id)
        .select()
        .single();
      // FK created_by → portail.profiles : réessaie sans created_by si profil manquant
      if (isFkCreatedBy(error)) {
        const retry = { ...payload, created_by: null };
        ({ data, error } = await sb()
          .from('location_contacts')
          .update(retry)
          .eq('id', row.id)
          .select()
          .single());
      }
      if (error) throw error;
      await syncLocationContactTasks(data);
      return data;
    }
    let { data, error } = await sb().from('location_contacts').insert(row).select().single();
    // FK created_by → portail.profiles : réessaie sans created_by si profil manquant
    if (isFkCreatedBy(error)) {
      const retry = { ...row, created_by: null };
      ({ data, error } = await sb().from('location_contacts').insert(retry).select().single());
    }
    if (error) throw error;
    audit('contact_upsert', {
      dossier_id: data?.dossier_id || row.dossier_id || null,
      motif: data?.motif || row.motif || null,
      phase: data?.phase || row.phase || null,
      statut: data?.statut || row.statut || null,
    });
    await syncLocationContactTasks(data);
    return data;
  }

  /** Annule tous les contacts non déjà annulés du dossier sauf keepId. */
  async function archiveDossierContactSiblings(dossierId, keepId) {
    if (!dossierId || !keepId) return;
    const { data, error } = await sb()
      .from('location_contacts')
      .select('*')
      .eq('dossier_id', dossierId)
      .neq('statut', 'annule');
    if (error) throw error;
    for (const c of data || []) {
      if (!c || c.id === keepId) continue;
      await upsertContact({
        id: c.id,
        dossier_id: dossierId,
        motif: c.motif,
        commentaire: c.commentaire || null,
        phase: c.phase || 'appel',
        statut: 'annule',
        resultat: c.resultat || null,
        canal: c.canal || null,
        contacted_at: c.contacted_at || null,
        commentaire_fait_at: c.commentaire_fait_at || null,
        phase_date_fin: c.phase_date_fin || null,
        mail_envoye: !!c.mail_envoye,
      });
    }
  }

  /** Remet tout le dossier en phase commentaire (une seule file, pas de doublon). */
  async function invalidateDossierCommentaire(dossierId, contacts) {
    if (!dossierId) throw new Error('Dossier introuvable');
    const list = (contacts || []).slice().sort((a, b) =>
      String(b.updated_at || b.created_at || '').localeCompare(
        String(a.updated_at || a.created_at || '')
      )
    );
    if (!list.length) throw new Error('Aucun contact sur ce dossier');

    const openStatuts = new Set(OPEN_CONTACT_STATUTS);
    const open = list.filter((c) => openStatuts.has(c.statut));
    const keeper = open[0] || list.find((c) => c.statut !== 'annule') || list[0];
    const others = list.filter((c) => c.id !== keeper.id);

    for (const c of others) {
      if (c.statut === 'annule') continue;
      await upsertContact({
        id: c.id,
        dossier_id: dossierId,
        motif: c.motif,
        commentaire: c.commentaire || null,
        phase: c.phase || 'appel',
        statut: 'annule',
        resultat: c.resultat || null,
        canal: c.canal || null,
        contacted_at: c.contacted_at || null,
        commentaire_fait_at: c.commentaire_fait_at || null,
        phase_date_fin: c.phase_date_fin || null,
        mail_envoye: !!c.mail_envoye,
      });
    }

    // Commentaire vidé : le prochain syncContactQueue le remplit depuis le template admin.
    return upsertContact({
      id: keeper.id,
      dossier_id: dossierId,
      motif: keeper.motif,
      commentaire: null,
      phase: 'commentaire',
      statut: 'a_contacter',
      resultat: null,
      canal: null,
      contacted_at: null,
      commentaire_fait_at: null,
      phase_date_fin: keeper.phase_date_fin || null,
      mail_envoye: !!keeper.mail_envoye,
    });
  }

  /**
   * Nouveau cycle commentaire si, après passage en phase appel, la date_fin
   * a avancé (prolongation) et les règles redemandent un contact (manque ordo).
   */
  function shouldResetContactToCommentaire(contact, dossier) {
    if (!contact || contact.phase !== 'appel') return false;
    return isContactCycleObsolete(contact, dossier);
  }

  /**
   * Annule tous les contacts ouverts d’un dossier (ex. bascule facturation prestataire).
   */
  async function cancelOpenContactsForDossier(dossierId) {
    if (!dossierId) return;
    const { data, error } = await sb()
      .from('location_contacts')
      .select('*')
      .eq('dossier_id', dossierId)
      .in('statut', OPEN_CONTACT_STATUTS);
    if (error) throw error;
    for (const c of data || []) {
      await upsertContact({
        id: c.id,
        dossier_id: dossierId,
        motif: c.motif,
        commentaire: c.commentaire || null,
        phase: c.phase || 'appel',
        statut: 'annule',
        resultat: c.resultat || null,
        canal: c.canal || null,
        contacted_at: c.contacted_at || null,
        commentaire_fait_at: c.commentaire_fait_at || null,
        phase_date_fin: c.phase_date_fin || null,
        mail_envoye: !!c.mail_envoye,
      });
    }
  }

  /**
   * Synchronise la file contact à partir des dossiers actifs + règles.
   * Crée en phase « commentaire » ; réouvre un cycle commentaire si manque ordo
   * après une prolongation post-phase-appel (contact ouvert) ou après résolution
   * obsolète (Attente/Perte d’un ancien cycle → nouvelle ligne, anciens annulés).
   * Un dossier déjà en Attente/Perte du cycle courant n’est pas re-créé en parallèle.
   * Facturation prestataire (qui_facture à jour) : hors file — contacts ouverts annulés.
   */
  async function syncContactQueue(userId) {
    const params = await loadParams();
    const rules = await loadRules();
    const dossiers = await listDossiers({ statut: 'actif' });
    const [existing, outcomes] = await Promise.all([
      fetchOpenContactsRaw(),
      fetchOutcomeContactsRaw(),
    ]);
    const byDossier = new Map();
    for (const c of existing) {
      // Un seul contact ouvert retenu par dossier (le plus récent en fin de liste).
      byDossier.set(c.dossier_id, c);
    }
    const outcomesByDossier = new Map();
    for (const c of outcomes) {
      // contacted_at desc : premier = plus récent
      if (!outcomesByDossier.has(c.dossier_id)) outcomesByDossier.set(c.dossier_id, c);
    }
    const created = [];
    const reset = [];
    const cancelledPrestataire = [];

    for (const d of dossiers) {
      // Toujours la valeur courante qui_facture / facturation_prestataire du dossier.
      if (isFactureParPrestataire(d)) {
        if (byDossier.has(d.id)) {
          await cancelOpenContactsForDossier(d.id);
          cancelledPrestataire.push(d.id);
          byDossier.delete(d.id);
        }
        continue;
      }
      const a = d.appareil_actif;
      const ctx = dossierContext(d);
      const evalRes = LocationRules.evaluate(ctx, rules, params);
      if (!evalRes.shouldContact) continue;

      const resolved = LocationRules.resolveLgo(ctx, evalRes.contactReasons, params);
      const motif = resolved.motif;
      const vars = contactInterpVars(motif, rules, d);
      let tpl = null;
      if (resolved.template_id) {
        tpl = await findTemplateById(resolved.template_id);
      }
      if (!tpl) {
        tpl = await findTemplateByMotif(a?.type_appareil, resolved.templateMotif);
      }
      // Message LGO = uniquement le corps du template admin (jamais raison.message ni texte inventé).
      if (!tpl || !String(tpl.corps || '').trim()) continue;
      const commentaire = LocationRules.interpolate(String(tpl.corps), vars);
      const open = byDossier.get(d.id);
      const outcome = outcomesByDossier.get(d.id);

      if (open) {
        // Un seul contact pertinent : annuler jumeaux ouverts / Attente / Perte.
        await archiveDossierContactSiblings(d.id, open.id);
        if (shouldResetContactToCommentaire(open, d)) {
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
        // Contact encore en phase commentaire (LGO non validé) : recalculer le
        // message depuis règles/templates admin (pas le texte seed / figé).
        if (
          open.phase === 'commentaire' &&
          !open.commentaire_fait_at &&
          open.statut === 'a_contacter'
        ) {
          const same =
            (open.commentaire || '') === commentaire && (open.motif || '') === motif;
          if (!same) {
            const row = await upsertContact({
              id: open.id,
              dossier_id: d.id,
              motif,
              commentaire,
              phase_date_fin: d.date_fin || open.phase_date_fin || null,
            });
            reset.push(row);
            byDossier.set(d.id, row);
          }
        }
        continue;
      }

      // Attente / Perte du cycle courant : ne pas ouvrir une 2ᵉ file.
      if (outcome && !isContactCycleObsolete(outcome, d)) {
        await archiveDossierContactSiblings(d.id, outcome.id);
        continue;
      }

      // Ancien cycle résolu (ex. après prolongation) : nouvelle ligne, anciens annulés.
      const row = await upsertContact({
        dossier_id: d.id,
        motif,
        statut: 'a_contacter',
        phase: 'commentaire',
        commentaire,
        phase_date_fin: d.date_fin || null,
        created_by: userId || null,
      });
      await archiveDossierContactSiblings(d.id, row.id);
      created.push(row);
      byDossier.set(d.id, row);
    }
    return {
      created,
      reset,
      cancelledPrestataire,
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

  /**
   * Identité stable d’un appareil du parc pharmacie.
   * Priorité : numero_pharmacie (trim, insensible à la casse) → matricule → id appareil.
   */
  function appareilIdentiteParc(a) {
    const numRaw = String(a?.numero_pharmacie || '').trim();
    if (numRaw) {
      return { key: `num:${numRaw.toLowerCase()}`, kind: 'numero_pharmacie', value: numRaw };
    }
    const matRaw = String(a?.matricule || '').trim();
    if (matRaw) {
      return { key: `mat:${matRaw.toLowerCase()}`, kind: 'matricule', value: matRaw };
    }
    const id = a?.id || null;
    return { key: id ? `id:${id}` : 'id:', kind: 'id', value: id };
  }

  function dossierLiePrestataire(d, prestataireId) {
    if (!prestataireId || d?.statut !== 'actif') return false;
    const a = d.appareil_actif;
    if (!a) return false;
    if (a.prestataire_id !== prestataireId) return false;
    return (
      a.source === 'prestataire' ||
      d.qui_facture === 'prestataire' ||
      !!a.facturation_prestataire
    );
  }

  /** Dossiers actifs liés à un prestataire, regroupés par type d’appareil. */
  async function listParcPrestataire(prestataireId) {
    const dossiers = await listDossiers({ statut: 'actif' });
    const rows = dossiers.filter((d) => dossierLiePrestataire(d, prestataireId));
    const byType = new Map();
    for (const d of rows) {
      const type = d.appareil_actif?.type_appareil || 'autre';
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push(d);
    }
    return {
      dossiers: rows,
      byType: [...byType.entries()]
        .map(([type, list]) => ({ type, dossiers: list }))
        .sort((a, b) => String(a.type).localeCompare(String(b.type), 'fr')),
    };
  }

  /**
   * Vue parc pharmacie : appareils source=parc groupés par identité.
   * enLocation = appareil actif sur dossier statut actif.
   */
  async function listParcPharmacie() {
    const dossiers = await listDossiers({});
    const byKey = new Map();

    for (const d of dossiers) {
      if (d.statut === 'en_attente') continue;
      for (const a of d.appareils || []) {
        if (a.source !== 'parc') continue;
        const ident = appareilIdentiteParc(a);
        if (!ident.key || ident.key === 'id:') continue;
        let entry = byKey.get(ident.key);
        if (!entry) {
          entry = {
            key: ident.key,
            kind: ident.kind,
            value: ident.value,
            type_appareil: a.type_appareil || 'autre',
            type_libelle: a.type_libelle || null,
            numero_pharmacie: a.numero_pharmacie || null,
            matricule: a.matricule || null,
            locations: [],
            enLocation: false,
            dossierActif: null,
            appareilActif: null,
          };
          byKey.set(ident.key, entry);
        }
        if (a.numero_pharmacie) entry.numero_pharmacie = a.numero_pharmacie;
        if (a.matricule) entry.matricule = a.matricule;
        if (a.type_appareil) entry.type_appareil = a.type_appareil;
        if (a.type_libelle) entry.type_libelle = a.type_libelle;

        const enCours = !!a.actif && d.statut === 'actif';
        entry.locations.push({
          dossier: d,
          appareil: a,
          enCours,
        });
        if (enCours) {
          entry.enLocation = true;
          entry.dossierActif = d;
          entry.appareilActif = a;
        }
      }
    }

    for (const entry of byKey.values()) {
      entry.locations.sort((x, y) =>
        String(y.appareil?.date_debut || y.dossier?.date_debut || y.dossier?.created_at || '').localeCompare(
          String(x.appareil?.date_debut || x.dossier?.date_debut || x.dossier?.created_at || '')
        )
      );
    }

    const all = [...byKey.values()];
    const enLocation = all.filter((e) => e.enLocation);
    const disponibles = all.filter((e) => !e.enLocation);

    function groupByType(list) {
      const map = new Map();
      for (const e of list) {
        const type = e.type_appareil || 'autre';
        if (!map.has(type)) map.set(type, []);
        map.get(type).push(e);
      }
      return [...map.entries()]
        .map(([type, items]) => ({
          type,
          items: items.sort((a, b) =>
            String(a.value || '').localeCompare(String(b.value || ''), 'fr', { numeric: true })
          ),
        }))
        .sort((a, b) => String(a.type).localeCompare(String(b.type), 'fr'));
    }

    return {
      all,
      enLocation,
      disponibles,
      enLocationByType: groupByType(enLocation),
      disponiblesByType: groupByType(disponibles),
    };
  }

  
export {
  sb,
  invalidateCache,
  loadParams,
  setParam,
  loadRules,
  CREATION_ETAPES,
  CREATION_FIELD_INDEX,
  getCreationChamp,
  listCreationFieldsForEtape,
  isCreationActif,
  isCreationRequired,
  isRequired,
  buildCreationChampsPayload,
  listPrestataires,
  searchPatients,
  createPatient,
  updatePatient,
  listDossiers,
  matchesDossierSearch,
  getDossier,
  enrichDossier,
  dossierContext,
  createDossierComplet,
  updateDossierComplet,
  updateDossier,
  cloturerDossier,
  deleteDossier,
  updateAppareil,
  changerAppareil,
  addProlongation,
  updateProlongation,
  deleteProlongation,
  recalcProlongationChain,
  listTemplates,
  findTemplateByMotif,
  findTemplateById,
  contactInterpVars,
  buildLocationMailContext,
  sendContactProblemEmail,
  listChampsCreation,
  upsertChampCreation,
  deleteChampCreation,
  upsertTemplate,
  deleteTemplate,
  upsertPrestataire,
  deletePrestataire,
  listOpenContacts,
  listOutcomeContacts,
  upsertContact,
  isContactCycleObsolete,
  shouldResetContactToCommentaire,
  archiveDossierContactSiblings,
  invalidateDossierCommentaire,
  cancelOpenContactsForDossier,
  syncContactQueue,
  isFactureParPrestataire,
  splitList,
  joinList,
  appareilIdentiteParc,
  dossierLiePrestataire,
  listParcPrestataire,
  listParcPharmacie,
};
