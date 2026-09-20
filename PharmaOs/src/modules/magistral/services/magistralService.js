import { supabase } from '../../../shared/supabaseClient.js';
import { logEvent, logMailEvent, logSoftFail } from '../../../shared/logService.js';
import {
  buildDefaultCreationChamps,
  validateCreationForm,
  getMailTemplate,
  buildMailContext,
} from './magistralParams.js';
import { renderAppMail } from '../../admin/services/mailTemplatesService.js';
import {
  fetchPharmacySettings,
  loadSettingsWithPharmacy,
} from '../../admin/services/pharmacySettingsService.js';

export {
  CREATION_ETAPES,
  CREATION_FIELD_DEFS,
  MAIL_PLACEHOLDERS,
  MAIL_TEMPLATE_KEYS,
  DEFAULT_MAIL_TEMPLATES,
  getCreationChamp,
  listCreationFieldsForEtape,
  buildDefaultCreationChamps,
  normalizeCreationChamps,
  isFieldActive,
  isFieldRequired,
  validateCreationForm,
  getMailTemplate,
  renderMailTemplate,
  buildMailContext,
} from './magistralParams.js';

export const MAGISTRAL_STATUTS = Object.freeze({
  brouillon: 'Brouillon',
  analyse_ok: 'Analyse OK',
  devis: 'Devis',
  commande: 'Commandé',
  en_transit: 'En transit',
  a_controler: 'À contrôler',
  /** File « prêt à dispenser » après appel patient abouti (disponible / vient chercher). */
  receptionne: 'À dispenser',
  a_rappeler: 'À rappeler',
  non_conforme: 'Non conforme',
  refuse: 'Refusé',
  dispense: 'Dispensé',
  cloture: 'Clôturé',
});

export const JUSTIFS = Object.freeze([
  'Absence de forme pharmaceutique',
  "Absence d'alternative thérapeutique",
  'Absence de dosage adapté',
  "Rupture de stock d'une spécialité",
  'Autre motif',
]);

export const APPEL_RESULTAT_LABELS = Object.freeze({
  disponible_pharmacie: 'Disponible en pharmacie (informé)',
  vient_chercher: 'Vient chercher',
  message_repondeur: 'Message sur le répondeur',
  raccroche: 'Raccroché',
  mauvais_numero: 'Mauvais numéro',
  pas_de_numero: 'Pas de numéro',
  autre_raison: 'Autre raison',
});

export const RECEPTION_CHECKLIST_KEYS = Object.freeze([
  { key: 'etiquetage', label: 'Étiquetage conforme (ST + DO prévus)' },
  { key: 'concordance', label: 'Concordance formule / patient / commande' },
  { key: 'integrite', label: 'Intégrité du conditionnement' },
  { key: 'conservation', label: 'Conservation / transport OK' },
  { key: 'liberation', label: 'Certificat de libération présent' },
  { key: 'lot_dates', label: 'Lot + dates relevés' },
]);

export const EMPTY_FORM = Object.freeze({
  pharmacie: { nom: '', adresse: '', email: '', interlocuteur: '' },
  demande: {
    nature: 'commande',
    historique: 'premiere',
    prescripteur: '',
    date_ordo: '',
    voie_admin: '',
    forme: '',
    quantite: '1',
    posologie: '',
    duree: '',
    formule: '',
  },
  patient: {
    nom: '',
    prenom: '',
    dob: '',
    type_prep: 'ad',
    poids: '',
    allergies: '',
    deglutition: '',
    grossesse_allaitement: '',
    phone: '',
  },
  analyse: {
    dose_posologie_ok: true,
    contre_indications: '',
    interactions: '',
    justifications: [],
    mention_ameli: 'na',
    risque_cat: '1',
    decision: 'st',
    commentaires: '',
  },
  patient_email: '',
  preparation_interne: false,
});

export function calcMagistralPrice(settings, prixHtNet, tvaRate, portOverride = null) {
  if (!settings || prixHtNet == null) return null;
  const ht = Number(prixHtNet) || 0;
  const port = portOverride != null ? Number(portOverride) || 0 : Number(settings.frais_port) || 0;
  const coef = Number(settings.coefficient) || 1;
  const tva = Number(tvaRate) || 0;
  const base = ht + port;
  const ttc = base * (1 + tva / 100);
  return Math.round(ttc * coef * 100) / 100;
}

export function maskPatient(nom, prenom) {
  return `${(prenom || '').slice(0, 2).toUpperCase()}${(nom || '').slice(0, 2).toUpperCase()}`;
}

function pushHistory(order, statut, userId, note = null) {
  const hist = Array.isArray(order?.status_history) ? [...order.status_history] : [];
  hist.push({
    at: new Date().toISOString(),
    statut,
    by: userId || null,
    note: note || null,
  });
  return hist;
}

function templateOr(settings, key, fallback) {
  const t = getMailTemplate(settings, key);
  return (t.subject && String(t.subject).trim()) || fallback;
}

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Envoi avec subject+body depuis app_settings.mail_templates (fallback magistral_settings). */
async function sendTemplatedMail(to, settings, key, order, { subjectFallback, bodyFallback, extra } = {}) {
  if (!to) throw new Error('Adresse e-mail destinataire manquante.');
  const ctx = buildMailContext(order || {}, settings, extra || {});
  const rendered = await renderAppMail('magistral', key, ctx, settings);
  const subject = rendered.subject || subjectFallback || key;
  const html = (rendered.body && rendered.body.trim())
    ? rendered.body
    : (bodyFallback || `<p>${escHtml(subject)}</p>`);
  return sendTransactionalEmail(to, subject, html, {
    templateKey: key,
    entityId: order?.id || null,
  });
}

/** Prix vente = (HT net réception + frais port) × (1 + TVA%) × coefficient */
export async function fetchSettings() {
  const { data, error } = await supabase.from('magistral_settings').select('*').limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return loadSettingsWithPharmacy(data);
}

/** Upsert : crée une ligne si absente. Pharmacie = Paramètres → Général. */
export async function ensureSettings(seed = {}) {
  const { data: existing, error: fetchErr } = await supabase
    .from('magistral_settings')
    .select('*')
    .limit(1)
    .maybeSingle();
  if (fetchErr) throw new Error(fetchErr.message);
  if (existing) return loadSettingsWithPharmacy(existing);

  const pharmacy = await fetchPharmacySettings();
  const row = {
    pharmacy_name: seed.pharmacy_name || pharmacy.name || 'Pharmacie',
    pharmacy_address: seed.pharmacy_address || pharmacy.address || null,
    pharmacy_email: seed.pharmacy_email || pharmacy.email || null,
    pharmacy_interlocuteur: seed.pharmacy_interlocuteur || pharmacy.interlocuteur || null,
    frais_port: seed.frais_port ?? 0,
    coefficient: seed.coefficient ?? 1,
    tva_rate: seed.tva_rate ?? 5.5,
    internal_prep_enabled: false,
    mail_templates: {},
    creation_champs: buildDefaultCreationChamps(),
    provider_forms: [],
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('magistral_settings').insert([row]).select().single();
  if (error) throw new Error(error.message);
  return loadSettingsWithPharmacy(data);
}

export async function updateSettings(payload, id) {
  const row = { ...payload, updated_at: new Date().toISOString() };
  if (!id) {
    const created = await ensureSettings(payload);
    return updateSettings(payload, created.id);
  }
  const { data, error } = await supabase.from('magistral_settings').update(row).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  logEvent({
    category: 'settings',
    action: 'save_magistral_settings',
    entity: 'magistral_settings',
    entityId: id,
    message: 'Paramètres préparations magistrales enregistrés',
    details: { keys: Object.keys(payload || {}) },
    flush: true,
  });
  return loadSettingsWithPharmacy(data);
}

export async function uploadMagistralFile(orderId, file, kind = 'ordonnance') {
  if (!file) throw new Error('Fichier manquant.');
  const ext = (file.name || 'file').split('.').pop() || 'bin';
  const path = `${orderId || 'pending'}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('magistral-ordonnances').upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw new Error(error.message);
  return path;
}

export async function sendTransactionalEmail(to, subject, html, meta = {}) {
  if (!to) throw new Error('Adresse e-mail destinataire manquante.');
  const { data, error } = await supabase.functions.invoke('send-transactional-email', {
    body: { to, subject, html },
  });
  if (error || data?.error) {
    const msg = data?.error || error?.message || 'Échec envoi e-mail';
    logMailEvent({
      module: 'magistral',
      templateKey: meta.templateKey || null,
      to,
      success: false,
      error: msg,
      entity: 'magistral_orders',
      entityId: meta.entityId || null,
    });
    throw new Error(msg);
  }
  logMailEvent({
    module: 'magistral',
    templateKey: meta.templateKey || null,
    to,
    success: true,
    entity: 'magistral_orders',
    entityId: meta.entityId || null,
  });
  return data;
}

export function buildOrderHtml(order, settings, title) {
  const fd = order.form_data || {};
  const ph = fd.pharmacie || {};
  const dem = fd.demande || {};
  const pat = fd.patient || {};
  const ana = fd.analyse || {};
  return `
    <h2>${escHtml(title)}</h2>
    <h3>Pharmacie (donneur d'ordre)</h3>
    <p>${escHtml(ph.nom || settings?.pharmacy_name)}<br>${escHtml(ph.adresse || settings?.pharmacy_address)}<br>
    ${escHtml(ph.email || settings?.pharmacy_email)} — ${escHtml(ph.interlocuteur || settings?.pharmacy_interlocuteur)}</p>
    <h3>Demande</h3>
    <p>Nature : ${escHtml(dem.nature || '—')} | Historique : ${escHtml(dem.historique || '—')}<br>
    Prescripteur : ${escHtml(dem.prescripteur || '—')} | Date ordo : ${escHtml(dem.date_ordo || '—')}<br>
    Voie : ${escHtml(dem.voie_admin || '—')} | Forme : ${escHtml(dem.forme || order.forme || '—')} | Qté : ${escHtml(dem.quantite || order.quantite || '—')}<br>
    Posologie : ${escHtml(dem.posologie || '—')} | Durée : ${escHtml(dem.duree || '—')}</p>
    <pre>${escHtml(dem.formule || order.formule || '')}</pre>
    <h3>Patient (masqué)</h3>
    <p>${escHtml(order.patient_initiales || maskPatient(pat.nom, pat.prenom))} — Né(e) le ${escHtml(pat.dob || '—')} — Type : ${escHtml(pat.type_prep || '—')}<br>
    Tél. : ${escHtml(order.patient_phone || pat.phone || '—')} — E-mail : ${escHtml(order.patient_email || '—')}<br>
    Allergies : ${escHtml(pat.allergies || '—')}</p>
    <h3>Analyse pharmaceutique (Annexe I)</h3>
    <p>Dose/posologie vérifiées : ${ana.dose_posologie_ok ? 'OUI' : 'NON'}<br>
    CI : ${escHtml(ana.contre_indications || '—')} | Interactions : ${escHtml(ana.interactions || '—')}<br>
    Mention Ameli : ${escHtml(ana.mention_ameli || '—')} | Risque (indic.) : cat. ${escHtml(ana.risque_cat || '—')}<br>
    Décision : ${escHtml(ana.decision || '—')}<br>
    Justifications : ${escHtml((ana.justifications || []).join(', ') || '—')}</p>
    <p>${escHtml(ana.commentaires || '')}</p>
    ${order.prix_calcule != null ? `<p><strong>Prix :</strong> ${escHtml(order.prix_calcule)} € TTC</p>` : ''}
  `;
}

function buildHtmlShort(order, settings, title) {
  const fd = order.form_data || {};
  const dem = fd.demande || {};
  const pat = fd.patient || {};
  return `
    <h2>${escHtml(title)}</h2>
    <pre>${escHtml(dem.formule || order.formule || '')}</pre>
    <p>Patient : ${escHtml(order.patient_initiales || maskPatient(pat.nom, pat.prenom))} — ${escHtml(pat.dob || '')}</p>
    ${order.prix_calcule != null ? `<p>Prix TTC : <strong>${escHtml(order.prix_calcule)} €</strong></p>` : ''}
    <p>Pharmacie : ${escHtml(settings?.pharmacy_name || '')}</p>
  `;
}

export async function sendProviderEmail(order, settings, subjectKey, subjectFallback) {
  const ctx = buildMailContext(order, settings);
  const rendered = await renderAppMail('magistral', subjectKey, ctx, settings);
  const subject = rendered.subject || subjectFallback || templateOr(settings, subjectKey, subjectFallback);
  const html = (rendered.body && rendered.body.trim())
    ? rendered.body
    : buildOrderHtml(order, settings, subject);
  await sendTransactionalEmail(settings.provider_email, subject, html, {
    templateKey: subjectKey,
    entityId: order?.id || null,
  });
  return updateOrder(order.id, { email_sent_at: new Date().toISOString() });
}

function formToRow(userId, form, { statut, ordonnance_path = null, analyseValidated = false } = {}) {
  const patient = form.patient || {};
  const dem = form.demande || {};
  const masked = maskPatient(patient.nom, patient.prenom);
  const phone = (patient.phone || '').trim();
  const row = {
    formule: dem.formule || '',
    forme: dem.forme || null,
    quantite: dem.quantite != null && dem.quantite !== '' ? Number(dem.quantite) : 1,
    patient_initiales: masked || null,
    patient_phone: phone || null,
    patient_email: form.patient_email || null,
    form_data: {
      pharmacie: form.pharmacie,
      demande: dem,
      patient: {
        ...patient,
        nom: (patient.nom || '').slice(0, 2).toUpperCase(),
        prenom: (patient.prenom || '').slice(0, 2).toUpperCase(),
      },
      analyse: form.analyse,
      patient_email: form.patient_email || null,
    },
    ordonnance_path: ordonnance_path || null,
    preparation_interne: !!form.preparation_interne,
    statut: statut || 'devis',
    created_by: userId,
    notes: form.notes || null,
    status_history: [{ at: new Date().toISOString(), statut: statut || 'devis', by: userId, note: 'création' }],
  };
  if (analyseValidated) {
    row.analyse_validated_at = new Date().toISOString();
    row.analyse_validated_by = userId;
  }
  return row;
}

export async function createMagistralOrder(userId, form, { asDraft = false, ordonnanceFile = null } = {}) {
  const settings = await ensureSettings();
  const cfgErr = validateCreationForm(form, settings, { asDraft, ordonnanceFile });
  if (cfgErr) throw new Error(cfgErr);

  // Commande / renouvellement → commande. Nature devis → devis (mail ST, puis accord patient).
  const nature = asDraft
    ? (form.demande?.nature || 'commande')
    : (form.demande?.nature === 'devis' ? 'devis' : 'commande');
  const statut = asDraft ? 'brouillon' : nature;
  const formNorm = {
    ...form,
    demande: { ...(form.demande || {}), nature },
  };
  let ordonnance_path = null;
  const row = formToRow(userId, formNorm, {
    statut,
    analyseValidated: !asDraft && formNorm.analyse?.decision === 'st',
  });

  const { data, error } = await supabase.from('magistral_orders').insert([row]).select().single();
  if (error) throw new Error(error.message);

  if (ordonnanceFile) {
    try {
      ordonnance_path = await uploadMagistralFile(data.id, ordonnanceFile, 'ordonnance');
      await updateOrder(data.id, { ordonnance_path });
      data.ordonnance_path = ordonnance_path;
    } catch (upErr) {
      console.warn('[magistral] upload ordonnance:', upErr.message);
      logSoftFail('upload_ordonnance', upErr, {
        category: 'magistral',
        entity: 'magistral_orders',
        entityId: data.id,
      });
    }
  }

  if (!asDraft && !formNorm.preparation_interne && settings?.provider_email) {
    try {
      const isCmd = statut === 'commande';
      await sendProviderEmail(
        data,
        settings,
        isCmd ? 'commande' : 'devis',
        isCmd
          ? `Commande préparation magistrale #${data.id.slice(0, 8)}`
          : 'Demande de devis — préparation magistrale',
      );
    } catch (mailErr) {
      console.warn('[magistral] e-mail prestataire non envoyé:', mailErr.message);
    }
  }
  return data;
}

/** Statuts historiques privilégiés pour un renouvellement. */
const RENEWAL_PREFERRED_STATUTS = new Set(['cloture', 'dispense', 'receptionne']);

function orderSearchHaystack(order) {
  const fd = order?.form_data || {};
  const pat = fd.patient || {};
  const dem = fd.demande || {};
  return [
    order.id,
    order.id?.slice(0, 8),
    order.patient_initiales,
    order.patient_phone,
    order.patient_email,
    order.formule,
    order.forme,
    order.provider_ref,
    order.provider_ordonnancier,
    order.ordonnancier_number,
    pat.nom,
    pat.prenom,
    pat.phone,
    dem.formule,
    dem.prescripteur,
    dem.forme,
    fd.renouvellement_de,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Recherche large pour renouvellement : initiales, id court, provider_ref /
 * ordonnancier ST, formule, nom/prénom masqués (form_data), téléphone.
 * Trie les dossiers historiques (clôturé / dispensé / réceptionné) en tête.
 */
export async function searchOrdersForRenewal(query, { limit = 40 } = {}) {
  const q = String(query || '').trim().toLowerCase();
  if (q.length < 1) return [];

  const { data, error } = await supabase
    .from('magistral_orders')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);

  const tokens = q.split(/\s+/).filter(Boolean);
  const matches = (data || []).filter((order) => {
    const hay = orderSearchHaystack(order);
    return tokens.every((t) => hay.includes(t));
  });

  matches.sort((a, b) => {
    const pa = RENEWAL_PREFERRED_STATUTS.has(a.statut) ? 0 : 1;
    const pb = RENEWAL_PREFERRED_STATUTS.has(b.statut) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  return matches.slice(0, limit);
}

/** Duplique un fichier Storage vers un nouveau chemin (nouvel orderId). */
async function copyMagistralStorageFile(sourcePath, newOrderId, kind = 'ordonnance') {
  if (!sourcePath) return null;
  const ext = (sourcePath.split('.').pop() || 'bin').split('?')[0];
  const dest = `${newOrderId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('magistral-ordonnances').copy(sourcePath, dest);
  if (error) throw new Error(error.message);
  return dest;
}

/**
 * Renouvelle un dossier : clone form_data / formule / contacts, marque
 * historique=renouvellement, duplique l’ordonnance Storage si possible, envoie au ST.
 * @returns {{ order: object, ordonnanceWarning?: string }}
 */
export async function renewMagistralOrder(userId, sourceOrderId) {
  if (!userId) throw new Error('Utilisateur manquant.');
  if (!sourceOrderId) throw new Error('Dossier source manquant.');

  const settings = await ensureSettings();
  const source = await fetchOrderById(sourceOrderId);
  const form = orderToForm(source, settings);

  form.demande = {
    ...form.demande,
    historique: 'renouvellement',
    nature: 'commande',
  };

  const phone = (form.patient?.phone || source.patient_phone || '').trim();
  if (!phone) throw new Error('Téléphone patient obligatoire pour renouveler.');
  form.patient = { ...form.patient, phone };

  if (form.analyse?.decision === 'st' && !form.analyse?.dose_posologie_ok) {
    throw new Error('Valider l’analyse (dose/posologie) avant envoi au sous-traitant.');
  }

  // Renouvellement = commande directe, attente réception ST (pas de devis)
  const statut = 'commande';
  const row = formToRow(userId, form, {
    statut,
    ordonnance_path: null,
    analyseValidated: form.analyse?.decision === 'st',
  });
  row.form_data = {
    ...row.form_data,
    renouvellement_de: source.id,
    demande: { ...row.form_data.demande, historique: 'renouvellement', nature: 'commande' },
  };
  row.status_history = [{
    at: new Date().toISOString(),
    statut,
    by: userId,
    note: `renouvellement de #${source.id.slice(0, 8)}`,
  }];

  const { data, error } = await supabase.from('magistral_orders').insert([row]).select().single();
  if (error) throw new Error(error.message);

  let ordonnanceWarning = null;
  if (source.ordonnance_path) {
    try {
      const newPath = await copyMagistralStorageFile(source.ordonnance_path, data.id, 'ordonnance');
      await updateOrder(data.id, { ordonnance_path: newPath });
      data.ordonnance_path = newPath;
    } catch (copyErr) {
      console.warn('[magistral] copie ordonnance:', copyErr.message);
      logSoftFail('copy_ordonnance', copyErr, {
        category: 'magistral',
        entity: 'magistral_orders',
        entityId: data.id,
      });
      ordonnanceWarning =
        'Ordonnance : copie Storage échouée — référence du dossier source conservée.';
      try {
        await updateOrder(data.id, { ordonnance_path: source.ordonnance_path });
        data.ordonnance_path = source.ordonnance_path;
      } catch (e) {
        console.warn('[magistral] fallback path ordonnance:', e.message);
        logSoftFail('copy_ordonnance_fallback', e, {
          category: 'magistral',
          entity: 'magistral_orders',
          entityId: data.id,
        });
      }
    }
  }

  if (!form.preparation_interne && settings?.provider_email) {
    try {
      await sendProviderEmail(
        data,
        settings,
        'commande',
        `Commande préparation magistrale #${data.id.slice(0, 8)} (renouvellement)`,
      );
    } catch (mailErr) {
      console.warn('[magistral] e-mail prestataire non envoyé:', mailErr.message);
    }
  }

  return { order: data, ordonnanceWarning };
}

export async function updateOrder(id, payload) {
  const row = { ...payload, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('magistral_orders').update(row).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

/** Catégories tâches liées au workflow magistral (matrice Assignation). */
const MAGISTRAL_TASK_CATEGORIES = Object.freeze([
  'magistral_devis',
  'magistral_a_controler',
  'magistral_a_rappeler',
  'magistral_a_dispenser',
  'magistral_non_conforme',
]);

const MAGISTRAL_STATUT_TO_TASK = Object.freeze({
  devis: 'magistral_devis',
  a_controler: 'magistral_a_controler',
  a_rappeler: 'magistral_a_rappeler',
  receptionne: 'magistral_a_dispenser',
  non_conforme: 'magistral_non_conforme',
});

/**
 * Aligne les tâches d’équipe sur le statut courant du dossier.
 * Clôture les anciennes catégories magistrales pour ce order_id, puis crée celle du statut.
 */
async function syncMagistralWorkflowTasks(order, createdBy) {
  if (!order?.id) return;
  try {
    const { ensureCategoryTask, completeCategoryTasks } = await import('../../tasks/services/taskService.js');
    const target = MAGISTRAL_STATUT_TO_TASK[order.statut] || null;
    for (const cat of MAGISTRAL_TASK_CATEGORIES) {
      if (cat === target) continue;
      await completeCategoryTasks(cat, 'order_id', order.id, `Magistrale → ${order.statut}`);
    }
    if (!target) return;
    const label = MAGISTRAL_STATUTS[order.statut] || order.statut;
    const patient = order.patient_initiales || 'patient';
    const titre = `Magistrale — ${label} : ${patient}`;
    await ensureCategoryTask(
      target,
      titre,
      {
        type: target,
        order_id: order.id,
        patient_initiales: order.patient_initiales || null,
        formule: String(order.formule || '').slice(0, 80),
        statut: order.statut,
      },
      createdBy || order.created_by || null,
    );
  } catch (e) {
    console.warn('[magistral] sync tâches:', e.message);
    logSoftFail('sync_tasks', e, {
      category: 'magistral',
      entity: 'magistral_orders',
      entityId: order?.id,
      module: 'magistral',
    });
  }
}

/**
 * Supprime un dossier magistral quel que soit son statut.
 * Best-effort : retire ordonnance / libération du Storage avant le DELETE BDD.
 */
export async function deleteOrder(id) {
  if (!id) throw new Error('Identifiant dossier manquant.');
  let order = null;
  try {
    order = await fetchOrderById(id);
  } catch {
    // La ligne peut déjà être absente — on tente quand même le delete.
  }

  const paths = [order?.ordonnance_path, order?.liberation_path].filter(Boolean);
  if (paths.length > 0) {
    try {
      const { error: storageErr } = await supabase.storage.from('magistral-ordonnances').remove(paths);
      if (storageErr) {
        console.warn('[magistral] purge storage:', storageErr.message);
        logSoftFail('purge_storage', storageErr, {
          category: 'magistral',
          entity: 'magistral_orders',
          entityId: id,
        });
      }
    } catch (e) {
      console.warn('[magistral] purge storage:', e?.message || e);
      logSoftFail('purge_storage', e, {
        category: 'magistral',
        entity: 'magistral_orders',
        entityId: id,
      });
    }
  }

  const { error } = await supabase.from('magistral_orders').delete().eq('id', id);
  if (error) throw new Error(error.message);
  return true;
}

export async function saveOrderFromForm(orderId, form, { sendEmail: doSend = false, userId = null } = {}) {
  const settings = await fetchSettings();
  const patient = form.patient || {};
  const dem = form.demande || {};
  const order = await updateOrder(orderId, {
    form_data: {
      pharmacie: form.pharmacie,
      demande: dem,
      patient: {
        ...patient,
        nom: (patient.nom || '').slice(0, 2).toUpperCase(),
        prenom: (patient.prenom || '').slice(0, 2).toUpperCase(),
      },
      analyse: form.analyse,
      patient_email: form.patient_email || null,
    },
    formule: dem.formule || '',
    forme: dem.forme || null,
    quantite: dem.quantite != null && dem.quantite !== '' ? Number(dem.quantite) : 1,
    patient_initiales: maskPatient(patient.nom, patient.prenom),
    patient_phone: (patient.phone || '').trim() || null,
    patient_email: form.patient_email || null,
  });
  if (doSend && settings?.provider_email) {
    await sendTemplatedMail(settings.provider_email, settings, 'maj', order, {
      subjectFallback: 'Mise à jour préparation magistrale',
      bodyFallback: buildHtmlShort(order, settings, 'Mise à jour'),
    });
    await updateOrder(orderId, { email_sent_at: new Date().toISOString() });
  }
  return order;
}

export async function fetchMyOrders(userId, { limit = 50 } = {}) {
  const { data, error } = await supabase
    .from('magistral_orders')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchOrders({ statut = null, limit = 200 } = {}) {
  let q = supabase.from('magistral_orders').select('*').order('created_at', { ascending: false }).limit(limit);
  if (statut) {
    if (Array.isArray(statut)) q = q.in('statut', statut);
    else q = q.eq('statut', statut);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchOrderById(id) {
  const { data, error } = await supabase.from('magistral_orders').select('*').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

export async function countAlerts() {
  const { data, error } = await supabase
    .from('magistral_orders')
    .select('id, statut')
    .in('statut', ['devis', 'a_controler', 'a_rappeler', 'receptionne']);
  if (error) throw new Error(error.message);
  const rows = data || [];
  return {
    devis: rows.filter((r) => r.statut === 'devis').length,
    a_controler: rows.filter((r) => r.statut === 'a_controler').length,
    a_rappeler: rows.filter((r) => r.statut === 'a_rappeler').length,
    a_dispenser: rows.filter((r) => r.statut === 'receptionne').length,
  };
}

export async function validateAnalyse(orderId, userId) {
  const order = await fetchOrderById(orderId);
  return updateOrder(orderId, {
    statut: 'analyse_ok',
    analyse_validated_at: new Date().toISOString(),
    analyse_validated_by: userId,
    status_history: pushHistory(order, 'analyse_ok', userId, 'analyse Annexe I validée'),
  });
}

export async function submitDraftToProvider(orderId, userId) {
  const settings = await ensureSettings();
  const order = await fetchOrderById(orderId);
  if (!order.patient_phone) throw new Error('Téléphone patient obligatoire avant envoi.');
  const nature = order.form_data?.demande?.nature;
  const statut = nature === 'commande' ? 'commande' : 'devis';
  const updated = await updateOrder(orderId, {
    statut,
    analyse_validated_at: order.analyse_validated_at || new Date().toISOString(),
    analyse_validated_by: order.analyse_validated_by || userId,
    status_history: pushHistory(order, statut, userId, 'envoi ST'),
  });
  if (settings?.provider_email) {
    try {
      await sendProviderEmail(
        updated,
        settings,
        statut === 'commande' ? 'commande' : 'devis',
        statut === 'commande'
          ? `Commande préparation magistrale #${orderId.slice(0, 8)}`
          : 'Demande de devis — préparation magistrale',
      );
    } catch (e) {
      console.warn('[magistral] mail ST:', e.message);
    }
  }
  await syncMagistralWorkflowTasks(updated, userId);
  return updated;
}

export async function validateDevis(orderId, { launchOrder = true, sendEmail: doSend = true, notifyPatient = false, userId = null } = {}) {
  const settings = await fetchSettings();
  const order = await fetchOrderById(orderId);

  if (!launchOrder) {
    // Refus patient → clôture (plus de suivi)
    const closed = await updateOrder(orderId, {
      statut: 'cloture',
      closed_at: new Date().toISOString(),
      closed_reason: 'Devis refusé par le patient',
      status_history: pushHistory(order, 'cloture', userId, 'devis refusé par le patient'),
    });
    await syncMagistralWorkflowTasks(closed, userId);
    return closed;
  }

  const updated = await updateOrder(orderId, {
    statut: 'commande',
    status_history: pushHistory(order, 'commande', userId, 'devis accepté par le patient → commande'),
  });
  if (doSend && settings?.provider_email) {
    await sendTemplatedMail(settings.provider_email, settings, 'commande', order, {
      subjectFallback: `Commande préparation magistrale #${orderId.slice(0, 8)}`,
      bodyFallback: buildHtmlShort(order, settings, 'Commande confirmée (devis accepté)'),
    });
    await updateOrder(orderId, { email_sent_at: new Date().toISOString() });
  }
  if (notifyPatient && order.patient_email) {
    await sendTemplatedMail(order.patient_email, settings, 'devis_valide_patient', order, {
      subjectFallback: 'Votre devis est validé',
    });
  }
  await syncMagistralWorkflowTasks(updated, userId);
  return updated;
}

/** Enregistre le devis reçu du prestataire (e-mail ST) avant appel patient. */
export async function recordProviderQuote(orderId, userId, { prixHt, tvaRate = 5.5, note = null } = {}) {
  if (prixHt == null || prixHt === '') throw new Error('Montant HT du devis prestataire obligatoire.');
  const settings = await ensureSettings();
  const order = await fetchOrderById(orderId);
  if (order.statut !== 'devis') throw new Error('Seuls les dossiers en statut devis peuvent recevoir un devis ST.');
  const ht = Number(prixHt);
  const tva = Number(tvaRate) || 0;
  const ttc = calcMagistralPrice(settings, ht, tva);
  const fd = { ...(order.form_data || {}) };
  fd.devis_st = {
    ht,
    tva,
    ttc,
    note: note || null,
    received_at: new Date().toISOString(),
    by: userId,
  };
  const updated = await updateOrder(orderId, {
    form_data: fd,
    prix_ht_net: ht,
    tva_rate: tva,
    prix_calcule: ttc,
    status_history: pushHistory(order, 'devis', userId, 'devis ST reçu — à présenter au patient'),
  });
  await syncMagistralWorkflowTasks({ ...updated, statut: 'devis' }, userId);
  return updated;
}

export function hasProviderQuote(order) {
  const st = order?.form_data?.devis_st;
  return !!(st && (st.ht != null || st.ttc != null));
}

export async function markInTransit(orderId, userId, providerRef = null) {
  const order = await fetchOrderById(orderId);
  const patch = {
    statut: 'en_transit',
    status_history: pushHistory(order, 'en_transit', userId),
  };
  if (providerRef) patch.provider_ref = providerRef;
  const updated = await updateOrder(orderId, patch);
  await syncMagistralWorkflowTasks(updated, userId);
  return updated;
}

export async function markArrived(orderId, userId) {
  const order = await fetchOrderById(orderId);
  const updated = await updateOrder(orderId, {
    statut: 'a_controler',
    status_history: pushHistory(order, 'a_controler', userId, 'arrivage physique'),
  });
  await syncMagistralWorkflowTasks(updated, userId);
  return updated;
}

/**
 * Phase A réception BPP 7.12 — checklist + prix + traçabilité lot.
 * Ne finalise pas le statut final (appel patient requis ensuite).
 */
export async function saveReceptionControl(orderId, userId, payload) {
  const {
    checklist,
    prixHtNet,
    tvaRate,
    portOverride = null,
    provider_lot,
    provider_ordonnancier,
    provider_ref,
    date_fabrication,
    date_peremption,
    liberationFile = null,
    nc = false,
    nc_reason = null,
  } = payload;

  const settings = await ensureSettings();
  const order = await fetchOrderById(orderId);
  const keys = RECEPTION_CHECKLIST_KEYS.map((k) => k.key);
  const allOk = keys.every((k) => checklist?.[k]);

  if (nc || !allOk) {
    const updated = await updateOrder(orderId, {
      statut: 'non_conforme',
      nc_reason: nc_reason || 'Contrôle réception non conforme',
      reception_checklist: checklist || {},
      reception_validated_by: userId,
      provider_lot: provider_lot || null,
      provider_ordonnancier: provider_ordonnancier || null,
      provider_ref: provider_ref || order.provider_ref || null,
      date_fabrication: date_fabrication || null,
      date_peremption: date_peremption || null,
      status_history: pushHistory(order, 'non_conforme', userId, nc_reason),
    });
    if (settings?.provider_email) {
      try {
        await sendTemplatedMail(settings.provider_email, settings, 'non_conforme', updated, {
          subjectFallback: `Non-conformité préparation #${orderId.slice(0, 8)}`,
          bodyFallback: `${buildHtmlShort(updated, settings, 'Non-conformité')}<p>${escHtml(nc_reason || '')}</p>`,
          extra: { nc_reason: nc_reason || '' },
        });
      } catch (e) {
        console.warn('[magistral] mail NC:', e.message);
      }
    }
    await syncMagistralWorkflowTasks(updated, userId);
    return updated;
  }

  const prix = calcMagistralPrice(settings, prixHtNet, tvaRate, portOverride);
  let liberation_path = order.liberation_path;
  if (liberationFile) {
    liberation_path = await uploadMagistralFile(orderId, liberationFile, 'liberation');
  }

  const okUpdated = await updateOrder(orderId, {
    reception_checklist: checklist,
    reception_validated_by: userId,
    prix_ht_net: prixHtNet,
    tva_rate: tvaRate,
    prix_calcule: prix,
    provider_lot: provider_lot || null,
    provider_ordonnancier: provider_ordonnancier || null,
    provider_ref: provider_ref || order.provider_ref || null,
    date_fabrication: date_fabrication || null,
    date_peremption: date_peremption || null,
    liberation_path: liberation_path || null,
    liberation_received_at: liberation_path ? new Date().toISOString() : order.liberation_received_at,
    // Statut temporaire : reste a_controler jusqu’à l’appel patient
    statut: 'a_controler',
    status_history: pushHistory(order, 'a_controler', userId, 'checklist BPP OK — appel patient'),
  });
  await syncMagistralWorkflowTasks(okUpdated, userId);
  return okUpdated;
}

/**
 * Phase B — journal appel patient (pattern Location Contact).
 * @param {{ did_call: boolean, resultat: string, statut: 'termine'|'a_rappeler', note?: string, notifyEmail?: boolean }} attempt
 * `termine` → order.statut `receptionne` (file « À dispenser ») ; sinon `a_rappeler`.
 */
export async function recordPatientCall(orderId, userId, attempt) {
  const settings = await ensureSettings();
  const order = await fetchOrderById(orderId);
  const prev = order.patient_call && typeof order.patient_call === 'object' ? order.patient_call : {};
  const attempts = Array.isArray(prev.attempts) ? [...prev.attempts] : [];
  const entry = {
    at: new Date().toISOString(),
    by_user_id: userId,
    did_call: !!attempt.did_call,
    resultat: attempt.resultat || null,
    statut: attempt.statut || 'a_rappeler',
    note: attempt.note || null,
  };
  attempts.push(entry);
  const patient_call = {
    attempts,
    last_statut: entry.statut,
    last_resultat: entry.resultat,
    last_at: entry.at,
    last_by: userId,
  };

  const nextStatut = entry.statut === 'termine' ? 'receptionne' : 'a_rappeler';
  const patch = {
    patient_call,
    statut: nextStatut,
    status_history: pushHistory(order, nextStatut, userId, entry.resultat),
  };
  if (nextStatut === 'receptionne' && !order.received_at) {
    patch.received_at = new Date().toISOString();
  }

  const updated = await updateOrder(orderId, patch);

  if (attempt.notifyEmail && updated.patient_email && nextStatut === 'receptionne') {
    try {
      await sendTemplatedMail(updated.patient_email, settings, 'disponible_patient', updated, {
        subjectFallback: 'Votre préparation magistrale est disponible',
      });
    } catch (e) {
      console.warn('[magistral] mail patient:', e.message);
    }
  }
  await syncMagistralWorkflowTasks(updated, userId);
  return updated;
}

/** @deprecated — utiliser saveReceptionControl + recordPatientCall */
export async function markOrderReceived(orderId, prixHtNet, tvaRate, notifyPatient = false) {
  const settings = await ensureSettings();
  const prix = calcMagistralPrice(settings, prixHtNet, tvaRate);
  const order = await fetchOrderById(orderId);
  const updated = await updateOrder(orderId, {
    statut: 'receptionne',
    prix_ht_net: prixHtNet,
    tva_rate: tvaRate,
    prix_calcule: prix,
    received_at: new Date().toISOString(),
    status_history: pushHistory(order, 'receptionne', null, 'réception rapide'),
  });
  if (notifyPatient && updated.patient_email) {
    await sendTemplatedMail(updated.patient_email, settings, 'disponible_patient', updated, {
      subjectFallback: 'Votre préparation magistrale est disponible',
    });
  }
  await syncMagistralWorkflowTasks(updated, order.created_by);
  return updated;
}

export async function receiveOrder(orderId, prixHtNet, opts = {}) {
  return markOrderReceived(orderId, prixHtNet, opts.tvaRate, opts.notifyPatient);
}

export async function dispenseOrder(orderId, userId, { ordonnancier_number, conseil_note = null } = {}) {
  if (!ordonnancier_number?.trim()) throw new Error('N° d’ordonnancier donneur d’ordre obligatoire.');
  const order = await fetchOrderById(orderId);
  const fd = { ...(order.form_data || {}) };
  if (conseil_note) fd.dispensation = { ...(fd.dispensation || {}), conseil_note };
  const updated = await updateOrder(orderId, {
    statut: 'dispense',
    ordonnancier_number: ordonnancier_number.trim(),
    dispensed_at: new Date().toISOString(),
    dispensed_by: userId,
    form_data: fd,
    status_history: pushHistory(order, 'dispense', userId),
  });
  await syncMagistralWorkflowTasks(updated, userId);
  return updated;
}

export async function closeOrder(orderId, reason = '', userId = null) {
  const order = await fetchOrderById(orderId);
  const updated = await updateOrder(orderId, {
    statut: 'cloture',
    closed_at: new Date().toISOString(),
    closed_reason: reason || null,
    status_history: pushHistory(order, 'cloture', userId, reason),
  });
  await syncMagistralWorkflowTasks(updated, userId);
  return updated;
}

export async function reopenNonConforme(orderId, userId) {
  const order = await fetchOrderById(orderId);
  const updated = await updateOrder(orderId, {
    statut: 'devis',
    nc_reason: null,
    status_history: pushHistory(order, 'devis', userId, 'relance après NC'),
  });
  await syncMagistralWorkflowTasks(updated, userId);
  return updated;
}

/** Convertit une ligne BDD en état formulaire partagé. */
export function orderToForm(order, settings = null) {
  const fd = order?.form_data || {};
  const base = structuredClone
    ? structuredClone(EMPTY_FORM)
    : JSON.parse(JSON.stringify(EMPTY_FORM));
  const ph = fd.pharmacie || {};
  const dem = fd.demande || {};
  const pat = fd.patient || {};
  const ana = fd.analyse || {};
  return {
    ...base,
    pharmacie: {
      nom: ph.nom || settings?.pharmacy_name || '',
      adresse: ph.adresse || settings?.pharmacy_address || '',
      email: ph.email || settings?.pharmacy_email || '',
      interlocuteur: ph.interlocuteur || settings?.pharmacy_interlocuteur || '',
    },
    demande: { ...base.demande, ...dem, forme: dem.forme || order?.forme || '', quantite: String(dem.quantite ?? order?.quantite ?? '1') },
    patient: {
      ...base.patient,
      ...pat,
      phone: order?.patient_phone || pat.phone || '',
    },
    analyse: { ...base.analyse, ...ana, justifications: ana.justifications || [] },
    patient_email: order?.patient_email || fd.patient_email || '',
    preparation_interne: !!order?.preparation_interne,
  };
}

export function formFromSettings(settings) {
  const base = JSON.parse(JSON.stringify(EMPTY_FORM));
  if (!settings) return base;
  return {
    ...base,
    pharmacie: {
      nom: settings.pharmacy_name || '',
      adresse: settings.pharmacy_address || '',
      email: settings.pharmacy_email || '',
      interlocuteur: settings.pharmacy_interlocuteur || '',
    },
  };
}

/** Alias legacy */
export async function saveOrderEdit(orderId, formData, opts = {}) {
  return saveOrderFromForm(orderId, {
    pharmacie: formData.pharmacie,
    demande: formData.demande,
    patient: formData.patient,
    analyse: formData.analyse,
    patient_email: formData.patient_email,
  }, opts);
}

function emptyToNull(v) {
  if (v == null) return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return v;
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * État brouillon admin (Suivi dashboard) — colonnes + form_data + checklist / appel.
 */
export function orderToAdminDraft(order, settings = null) {
  const form = orderToForm(order, settings);
  const checklist = { ...(order?.reception_checklist || {}) };
  RECEPTION_CHECKLIST_KEYS.forEach((k) => {
    if (checklist[k.key] == null) checklist[k.key] = false;
  });
  const call = order?.patient_call && typeof order.patient_call === 'object' ? order.patient_call : {};
  const lastAttempt = Array.isArray(call.attempts) && call.attempts.length
    ? call.attempts[call.attempts.length - 1]
    : null;
  return {
    statut: order?.statut || 'devis',
    formule: order?.formule || form.demande?.formule || '',
    forme: order?.forme || form.demande?.forme || '',
    quantite: order?.quantite != null ? String(order.quantite) : (form.demande?.quantite || '1'),
    patient_initiales: order?.patient_initiales || '',
    patient_phone: order?.patient_phone || form.patient?.phone || '',
    patient_email: order?.patient_email || form.patient_email || '',
    form,
    provider_ref: order?.provider_ref || '',
    provider_lot: order?.provider_lot || '',
    provider_ordonnancier: order?.provider_ordonnancier || '',
    date_fabrication: order?.date_fabrication || '',
    date_peremption: order?.date_peremption || '',
    reception_checklist: checklist,
    prix_ht_net: order?.prix_ht_net != null ? String(order.prix_ht_net) : '',
    tva_rate: order?.tva_rate != null ? String(order.tva_rate) : String(settings?.tva_rate ?? '5.5'),
    prix_calcule: order?.prix_calcule != null ? String(order.prix_calcule) : '',
    port_override: '',
    call_last_statut: call.last_statut || lastAttempt?.statut || '',
    call_last_resultat: call.last_resultat || lastAttempt?.resultat || '',
    call_note: lastAttempt?.note || call.admin_note || '',
    ordonnancier_number: order?.ordonnancier_number || '',
    dispensed_at: order?.dispensed_at ? String(order.dispensed_at).slice(0, 16) : '',
    dispensed_by: order?.dispensed_by || '',
    closed_at: order?.closed_at ? String(order.closed_at).slice(0, 16) : '',
    closed_reason: order?.closed_reason || '',
    notes: order?.notes || '',
    nc_reason: order?.nc_reason || '',
    preparation_interne: !!order?.preparation_interne,
    ordonnance_path: order?.ordonnance_path || '',
    liberation_path: order?.liberation_path || '',
  };
}

/**
 * Sauvegarde admin complète d’un dossier (pharmacien / administrateur).
 * @param {string} orderId
 * @param {ReturnType<typeof orderToAdminDraft>} draft
 * @param {{ userId?: string, ordonnanceFile?: File|null, liberationFile?: File|null, recalcPrice?: boolean }} [opts]
 */
export async function saveOrderAdmin(orderId, draft, opts = {}) {
  if (!orderId) throw new Error('Identifiant dossier manquant.');
  if (!draft?.statut || !MAGISTRAL_STATUTS[draft.statut]) {
    throw new Error('Statut invalide.');
  }

  const settings = await ensureSettings();
  const order = await fetchOrderById(orderId);
  const form = draft.form || {};
  const patient = { ...(form.patient || {}) };
  const dem = { ...(form.demande || {}) };

  const formule = (draft.formule != null && String(draft.formule).trim() !== '')
    ? draft.formule
    : (dem.formule || '');
  const forme = emptyToNull(draft.forme) ?? emptyToNull(dem.forme);
  const quantite = numOrNull(draft.quantite) ?? numOrNull(dem.quantite) ?? 1;
  dem.formule = formule;
  if (forme != null) dem.forme = forme;
  dem.quantite = quantite;

  if (draft.patient_phone != null) patient.phone = draft.patient_phone;

  const patient_email = emptyToNull(draft.patient_email ?? form.patient_email);
  const patient_initiales = (draft.patient_initiales || '').trim()
    || maskPatient(patient.nom, patient.prenom);

  let ordonnance_path = emptyToNull(draft.ordonnance_path) ?? order.ordonnance_path ?? null;
  let liberation_path = emptyToNull(draft.liberation_path) ?? order.liberation_path ?? null;
  if (opts.ordonnanceFile) {
    ordonnance_path = await uploadMagistralFile(orderId, opts.ordonnanceFile, 'ordonnance');
  }
  if (opts.liberationFile) {
    liberation_path = await uploadMagistralFile(orderId, opts.liberationFile, 'liberation');
  }

  const prixHt = numOrNull(draft.prix_ht_net);
  const tva = numOrNull(draft.tva_rate);
  const portOv = draft.port_override !== '' && draft.port_override != null
    ? Number(draft.port_override)
    : null;
  let prix_calcule = numOrNull(draft.prix_calcule);
  if (opts.recalcPrice !== false && prixHt != null && tva != null) {
    const calc = calcMagistralPrice(settings, prixHt, tva, portOv);
    if (calc != null) prix_calcule = calc;
  }

  const prevCall = order.patient_call && typeof order.patient_call === 'object' ? order.patient_call : {};
  const attempts = Array.isArray(prevCall.attempts) ? [...prevCall.attempts] : [];
  const call_last_statut = emptyToNull(draft.call_last_statut);
  const call_last_resultat = emptyToNull(draft.call_last_resultat);
  const call_note = emptyToNull(draft.call_note);
  if (call_last_statut || call_last_resultat || call_note) {
    if (attempts.length > 0) {
      const last = { ...attempts[attempts.length - 1] };
      if (call_last_statut) last.statut = call_last_statut;
      if (call_last_resultat) last.resultat = call_last_resultat;
      if (call_note != null) last.note = call_note;
      attempts[attempts.length - 1] = last;
    }
  }
  const patient_call = {
    ...prevCall,
    attempts,
    last_statut: call_last_statut || prevCall.last_statut || null,
    last_resultat: call_last_resultat || prevCall.last_resultat || null,
    last_at: prevCall.last_at || null,
    last_by: prevCall.last_by || null,
    admin_note: call_note,
  };

  const patch = {
    statut: draft.statut,
    formule,
    forme,
    quantite,
    patient_initiales: patient_initiales || null,
    patient_phone: emptyToNull(draft.patient_phone || patient.phone),
    patient_email,
    form_data: {
      pharmacie: form.pharmacie || {},
      demande: dem,
      patient: {
        ...patient,
        nom: (patient.nom || '').slice(0, 2).toUpperCase(),
        prenom: (patient.prenom || '').slice(0, 2).toUpperCase(),
      },
      analyse: form.analyse || {},
      patient_email,
      dispensation: order.form_data?.dispensation || undefined,
    },
    provider_ref: emptyToNull(draft.provider_ref),
    provider_lot: emptyToNull(draft.provider_lot),
    provider_ordonnancier: emptyToNull(draft.provider_ordonnancier),
    date_fabrication: emptyToNull(draft.date_fabrication),
    date_peremption: emptyToNull(draft.date_peremption),
    reception_checklist: draft.reception_checklist || {},
    prix_ht_net: prixHt,
    tva_rate: tva,
    prix_calcule,
    patient_call,
    ordonnancier_number: emptyToNull(draft.ordonnancier_number),
    dispensed_at: draft.dispensed_at
      ? new Date(draft.dispensed_at).toISOString()
      : null,
    dispensed_by: emptyToNull(draft.dispensed_by),
    closed_at: draft.closed_at
      ? new Date(draft.closed_at).toISOString()
      : null,
    closed_reason: emptyToNull(draft.closed_reason),
    notes: emptyToNull(draft.notes),
    nc_reason: emptyToNull(draft.nc_reason),
    preparation_interne: !!draft.preparation_interne,
    ordonnance_path,
    liberation_path,
  };

  if (draft.statut !== order.statut) {
    patch.status_history = pushHistory(order, draft.statut, opts.userId || null, 'édition admin');
  }

  return updateOrder(orderId, patch);
}
