import { supabase } from '../../../shared/supabaseClient.js';

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
    nature: 'devis',
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

function escHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function templateOr(settings, key, fallback) {
  const t = settings?.mail_templates?.[key];
  return (t && String(t).trim()) || fallback;
}

/** Prix vente = (HT net réception + frais port) × (1 + TVA%) × coefficient */
export async function fetchSettings() {
  const { data, error } = await supabase.from('magistral_settings').select('*').limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Upsert : crée une ligne si absente. */
export async function ensureSettings(seed = {}) {
  const existing = await fetchSettings();
  if (existing) return existing;
  const row = {
    pharmacy_name: seed.pharmacy_name || 'Pharmacie',
    frais_port: seed.frais_port ?? 0,
    coefficient: seed.coefficient ?? 1,
    tva_rate: seed.tva_rate ?? 5.5,
    internal_prep_enabled: false,
    mail_templates: {},
    provider_forms: [],
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('magistral_settings').insert([row]).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSettings(payload, id) {
  const row = { ...payload, updated_at: new Date().toISOString() };
  if (!id) {
    const created = await ensureSettings(payload);
    return updateSettings(payload, created.id);
  }
  const { data, error } = await supabase.from('magistral_settings').update(row).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
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

export async function sendTransactionalEmail(to, subject, html) {
  if (!to) throw new Error('Adresse e-mail destinataire manquante.');
  const { data, error } = await supabase.functions.invoke('send-transactional-email', {
    body: { to, subject, html },
  });
  if (error || data?.error) {
    const msg = data?.error || error?.message || 'Échec envoi e-mail';
    throw new Error(msg);
  }
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
  const subject = templateOr(settings, subjectKey, subjectFallback);
  const html = buildOrderHtml(order, settings, subject);
  await sendTransactionalEmail(settings.provider_email, subject, html);
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
  const phone = (form.patient?.phone || '').trim();
  if (!asDraft && !phone) throw new Error('Téléphone patient obligatoire.');
  if (!asDraft && form.analyse?.decision === 'st' && !form.analyse?.dose_posologie_ok) {
    throw new Error('Valider l’analyse (dose/posologie) avant envoi au sous-traitant.');
  }

  const statut = asDraft ? 'brouillon' : (form.demande?.nature === 'commande' ? 'commande' : 'devis');
  let ordonnance_path = null;
  const row = formToRow(userId, form, {
    statut,
    analyseValidated: !asDraft && form.analyse?.decision === 'st',
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
    }
  }

  if (!asDraft && !form.preparation_interne && settings?.provider_email) {
    try {
      const subjKey = statut === 'commande' ? 'commande' : 'devis';
      const fallback = statut === 'commande'
        ? `Commande préparation magistrale #${data.id.slice(0, 8)}`
        : 'Demande de devis — préparation magistrale';
      await sendProviderEmail(data, settings, subjKey, fallback);
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
  };

  const phone = (form.patient?.phone || source.patient_phone || '').trim();
  if (!phone) throw new Error('Téléphone patient obligatoire pour renouveler.');
  form.patient = { ...form.patient, phone };

  if (form.analyse?.decision === 'st' && !form.analyse?.dose_posologie_ok) {
    throw new Error('Valider l’analyse (dose/posologie) avant envoi au sous-traitant.');
  }

  const statut = form.demande?.nature === 'commande' ? 'commande' : 'devis';
  const row = formToRow(userId, form, {
    statut,
    ordonnance_path: null,
    analyseValidated: form.analyse?.decision === 'st',
  });
  row.form_data = {
    ...row.form_data,
    renouvellement_de: source.id,
    demande: { ...row.form_data.demande, historique: 'renouvellement' },
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
      ordonnanceWarning =
        'Ordonnance : copie Storage échouée — référence du dossier source conservée.';
      try {
        await updateOrder(data.id, { ordonnance_path: source.ordonnance_path });
        data.ordonnance_path = source.ordonnance_path;
      } catch (e) {
        console.warn('[magistral] fallback path ordonnance:', e.message);
      }
    }
  }

  if (!form.preparation_interne && settings?.provider_email) {
    try {
      const subjKey = statut === 'commande' ? 'commande' : 'devis';
      const fallback = statut === 'commande'
        ? `Commande préparation magistrale #${data.id.slice(0, 8)} (renouvellement)`
        : 'Demande de devis — préparation magistrale (renouvellement)';
      await sendProviderEmail(data, settings, subjKey, fallback);
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
      if (storageErr) console.warn('[magistral] purge storage:', storageErr.message);
    } catch (e) {
      console.warn('[magistral] purge storage:', e?.message || e);
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
    await sendTransactionalEmail(
      settings.provider_email,
      templateOr(settings, 'maj', 'Mise à jour préparation magistrale'),
      buildHtmlShort(order, settings, 'Mise à jour'),
    );
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
  return updated;
}

export async function validateDevis(orderId, { launchOrder = true, sendEmail: doSend = true, notifyPatient = false, userId = null } = {}) {
  const settings = await fetchSettings();
  const order = await fetchOrderById(orderId);

  if (!launchOrder) {
    return updateOrder(orderId, {
      statut: 'refuse',
      closed_at: new Date().toISOString(),
      closed_reason: 'Devis refusé',
      status_history: pushHistory(order, 'refuse', userId, 'devis refusé'),
    });
  }

  const updated = await updateOrder(orderId, {
    statut: 'commande',
    status_history: pushHistory(order, 'commande', userId, 'devis accepté'),
  });
  if (doSend && settings?.provider_email) {
    await sendTransactionalEmail(
      settings.provider_email,
      templateOr(settings, 'commande', `Commande préparation magistrale #${orderId.slice(0, 8)}`),
      buildHtmlShort(order, settings, 'Commande confirmée'),
    );
    await updateOrder(orderId, { email_sent_at: new Date().toISOString() });
  }
  if (notifyPatient && order.patient_email) {
    await sendTransactionalEmail(
      order.patient_email,
      templateOr(settings, 'devis_valide_patient', 'Votre devis est validé'),
      '<p>Votre demande de préparation magistrale a été validée. La commande est lancée.</p>',
    );
  }
  return updated;
}

export async function markInTransit(orderId, userId, providerRef = null) {
  const order = await fetchOrderById(orderId);
  const patch = {
    statut: 'en_transit',
    status_history: pushHistory(order, 'en_transit', userId),
  };
  if (providerRef) patch.provider_ref = providerRef;
  return updateOrder(orderId, patch);
}

export async function markArrived(orderId, userId) {
  const order = await fetchOrderById(orderId);
  return updateOrder(orderId, {
    statut: 'a_controler',
    status_history: pushHistory(order, 'a_controler', userId, 'arrivage physique'),
  });
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
        await sendTransactionalEmail(
          settings.provider_email,
          templateOr(settings, 'non_conforme', `Non-conformité préparation #${orderId.slice(0, 8)}`),
          `${buildHtmlShort(updated, settings, 'Non-conformité')}<p>${escHtml(nc_reason || '')}</p>`,
        );
      } catch (e) {
        console.warn('[magistral] mail NC:', e.message);
      }
    }
    return updated;
  }

  const prix = calcMagistralPrice(settings, prixHtNet, tvaRate, portOverride);
  let liberation_path = order.liberation_path;
  if (liberationFile) {
    liberation_path = await uploadMagistralFile(orderId, liberationFile, 'liberation');
  }

  return updateOrder(orderId, {
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
      await sendTransactionalEmail(
        updated.patient_email,
        templateOr(settings, 'disponible_patient', 'Votre préparation magistrale est disponible'),
        `<p>Bonjour,</p><p>Votre préparation magistrale est réceptionnée et disponible en pharmacie.</p>
         ${updated.prix_calcule != null ? `<p>Montant : <strong>${escHtml(updated.prix_calcule)} €</strong></p>` : ''}`,
      );
    } catch (e) {
      console.warn('[magistral] mail patient:', e.message);
    }
  }
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
    await sendTransactionalEmail(
      updated.patient_email,
      'Votre préparation magistrale est disponible',
      `<p>Bonjour,</p><p>Votre préparation magistrale est réceptionnée et disponible en pharmacie.</p>
       ${prix != null ? `<p>Montant : <strong>${prix} €</strong></p>` : ''}`,
    );
  }
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
  return updateOrder(orderId, {
    statut: 'dispense',
    ordonnancier_number: ordonnancier_number.trim(),
    dispensed_at: new Date().toISOString(),
    dispensed_by: userId,
    form_data: fd,
    status_history: pushHistory(order, 'dispense', userId),
  });
}

export async function closeOrder(orderId, reason = '', userId = null) {
  const order = await fetchOrderById(orderId);
  return updateOrder(orderId, {
    statut: 'cloture',
    closed_at: new Date().toISOString(),
    closed_reason: reason || null,
    status_history: pushHistory(order, 'cloture', userId, reason),
  });
}

export async function reopenNonConforme(orderId, userId) {
  const order = await fetchOrderById(orderId);
  return updateOrder(orderId, {
    statut: 'devis',
    nc_reason: null,
    status_history: pushHistory(order, 'devis', userId, 'relance après NC'),
  });
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
