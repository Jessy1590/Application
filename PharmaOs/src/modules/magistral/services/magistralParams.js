/**
 * Paramètres Magistrales — champs création + templates mail (placeholders).
 * Style Location : actif / obligatoire + bandeau masques {…}.
 */

export const CREATION_ETAPES = Object.freeze([
  { id: 'pharmacie', label: 'Pharmacie' },
  { id: 'demande', label: 'Demande' },
  { id: 'patient', label: 'Patient' },
  { id: 'analyse', label: 'Analyse' },
  { id: 'pieces', label: 'Pièces' },
]);

/** Champs paramétrables (code → section form + clé). */
export const CREATION_FIELD_DEFS = Object.freeze([
  { code: 'pharmacy_nom', etape: 'pharmacie', label: 'Nom pharmacie', path: ['pharmacie', 'nom'], defaultObligatoire: true },
  { code: 'pharmacy_adresse', etape: 'pharmacie', label: 'Adresse pharmacie', path: ['pharmacie', 'adresse'], defaultObligatoire: true },
  { code: 'pharmacy_email', etape: 'pharmacie', label: 'E-mail pharmacie', path: ['pharmacie', 'email'], defaultObligatoire: true },
  { code: 'pharmacy_interlocuteur', etape: 'pharmacie', label: 'Interlocuteur', path: ['pharmacie', 'interlocuteur'], defaultObligatoire: true },

  { code: 'demande_nature', etape: 'demande', label: 'Nature (devis/commande)', path: ['demande', 'nature'], defaultObligatoire: true },
  { code: 'demande_historique', etape: 'demande', label: 'Historique', path: ['demande', 'historique'], defaultObligatoire: true },
  { code: 'demande_prescripteur', etape: 'demande', label: 'Prescripteur', path: ['demande', 'prescripteur'], defaultObligatoire: true },
  { code: 'demande_date_ordo', etape: 'demande', label: 'Date ordonnance', path: ['demande', 'date_ordo'], defaultObligatoire: false },
  { code: 'demande_voie', etape: 'demande', label: 'Voie d’administration', path: ['demande', 'voie_admin'], defaultObligatoire: true },
  { code: 'demande_forme', etape: 'demande', label: 'Forme', path: ['demande', 'forme'], defaultObligatoire: true },
  { code: 'demande_quantite', etape: 'demande', label: 'Quantité', path: ['demande', 'quantite'], defaultObligatoire: true },
  { code: 'demande_posologie', etape: 'demande', label: 'Posologie', path: ['demande', 'posologie'], defaultObligatoire: false },
  { code: 'demande_duree', etape: 'demande', label: 'Durée', path: ['demande', 'duree'], defaultObligatoire: false },
  { code: 'demande_formule', etape: 'demande', label: 'Formule', path: ['demande', 'formule'], defaultObligatoire: true },

  { code: 'patient_nom', etape: 'patient', label: 'Nom (2 lettres)', path: ['patient', 'nom'], defaultObligatoire: true },
  { code: 'patient_prenom', etape: 'patient', label: 'Prénom (2 lettres)', path: ['patient', 'prenom'], defaultObligatoire: true },
  { code: 'patient_dob', etape: 'patient', label: 'Date de naissance', path: ['patient', 'dob'], defaultObligatoire: true },
  { code: 'patient_type', etape: 'patient', label: 'Type préparation', path: ['patient', 'type_prep'], defaultObligatoire: true },
  { code: 'patient_poids', etape: 'patient', label: 'Poids', path: ['patient', 'poids'], defaultObligatoire: false },
  { code: 'patient_phone', etape: 'patient', label: 'Téléphone', path: ['patient', 'phone'], defaultObligatoire: true },
  { code: 'patient_email', etape: 'patient', label: 'E-mail patient', path: ['patient_email'], defaultObligatoire: false },
  { code: 'patient_allergies', etape: 'patient', label: 'Allergies', path: ['patient', 'allergies'], defaultObligatoire: false },
  { code: 'patient_deglutition', etape: 'patient', label: 'Déglutition', path: ['patient', 'deglutition'], defaultObligatoire: false },
  { code: 'patient_grossesse', etape: 'patient', label: 'Grossesse / allaitement', path: ['patient', 'grossesse_allaitement'], defaultObligatoire: false },

  { code: 'analyse_dose', etape: 'analyse', label: 'Dose/posologie vérifiées', path: ['analyse', 'dose_posologie_ok'], type: 'bool', defaultObligatoire: true },
  { code: 'analyse_ci', etape: 'analyse', label: 'Contre-indications', path: ['analyse', 'contre_indications'], defaultObligatoire: false },
  { code: 'analyse_interactions', etape: 'analyse', label: 'Interactions', path: ['analyse', 'interactions'], defaultObligatoire: false },
  { code: 'analyse_justifs', etape: 'analyse', label: 'Justifications', path: ['analyse', 'justifications'], type: 'array', defaultObligatoire: false },
  { code: 'analyse_ameli', etape: 'analyse', label: 'Mention Ameli', path: ['analyse', 'mention_ameli'], defaultObligatoire: false },
  { code: 'analyse_risque', etape: 'analyse', label: 'Catégorie risque', path: ['analyse', 'risque_cat'], defaultObligatoire: false },
  { code: 'analyse_decision', etape: 'analyse', label: 'Décision', path: ['analyse', 'decision'], defaultObligatoire: true },
  { code: 'analyse_commentaires', etape: 'analyse', label: 'Commentaires analyse', path: ['analyse', 'commentaires'], defaultObligatoire: false },

  { code: 'ordonnance', etape: 'pieces', label: 'Ordonnance (fichier)', path: ['__ordonnance'], type: 'file', defaultObligatoire: false },
]);

/** Placeholders insérables dans les templates mail. */
export const MAIL_PLACEHOLDERS = Object.freeze([
  { key: 'pharmacy_name', label: 'Nom pharmacie' },
  { key: 'pharmacy_address', label: 'Adresse pharmacie' },
  { key: 'pharmacy_email', label: 'E-mail pharmacie' },
  { key: 'pharmacy_interlocuteur', label: 'Interlocuteur' },
  { key: 'provider_name', label: 'Nom prestataire' },
  { key: 'provider_email', label: 'E-mail prestataire' },
  { key: 'patient_initiales', label: 'Initiales patient' },
  { key: 'patient_phone', label: 'Tél. patient' },
  { key: 'patient_email', label: 'E-mail patient' },
  { key: 'patient_dob', label: 'Date naissance' },
  { key: 'formule', label: 'Formule' },
  { key: 'forme', label: 'Forme' },
  { key: 'quantite', label: 'Quantité' },
  { key: 'prescripteur', label: 'Prescripteur' },
  { key: 'voie_admin', label: 'Voie' },
  { key: 'nature', label: 'Nature devis/commande' },
  { key: 'order_id', label: 'Id dossier' },
  { key: 'order_id_short', label: 'Id court (8)' },
  { key: 'statut', label: 'Statut' },
  { key: 'prix_ht', label: 'Prix HT' },
  { key: 'prix_ttc', label: 'Prix TTC' },
  { key: 'tva', label: 'TVA %' },
  { key: 'provider_ref', label: 'Réf. ST' },
  { key: 'provider_lot', label: 'Lot ST' },
  { key: 'ordonnancier_number', label: 'N° ordonnancier DO' },
  { key: 'date_aujourdhui', label: 'Date du jour' },
  { key: 'nc_reason', label: 'Motif NC' },
]);

export const MAIL_TEMPLATE_KEYS = Object.freeze([
  { id: 'devis', label: 'Demande de devis → ST', dest: 'prestataire' },
  { id: 'commande', label: 'Commande → ST', dest: 'prestataire' },
  { id: 'non_conforme', label: 'Non-conformité → ST', dest: 'prestataire' },
  { id: 'relance', label: 'Relance → ST', dest: 'prestataire' },
  { id: 'maj', label: 'Mise à jour → ST', dest: 'prestataire' },
  { id: 'disponible_patient', label: 'Disponible → patient', dest: 'patient' },
  { id: 'devis_valide_patient', label: 'Devis accepté → patient', dest: 'patient' },
]);

export const DEFAULT_MAIL_TEMPLATES = Object.freeze({
  devis: {
    subject: 'Demande de devis — préparation magistrale #{order_id_short}',
    body: `<p>Bonjour,</p>
<p>Merci de nous établir un <strong>devis</strong> pour la préparation suivante.</p>
<p><strong>Pharmacie :</strong> {pharmacy_name}<br>
{pharmacy_address}<br>
{pharmacy_email} — {pharmacy_interlocuteur}</p>
<p><strong>Patient :</strong> {patient_initiales} — né(e) le {patient_dob}<br>
Tél. : {patient_phone}</p>
<p><strong>Prescription :</strong> {prescripteur} — voie {voie_admin} — forme {forme} — qté {quantite}</p>
<pre>{formule}</pre>
<p>Cordialement,<br>{pharmacy_name}</p>`,
  },
  commande: {
    subject: 'Commande préparation magistrale #{order_id_short}',
    body: `<p>Bonjour,</p>
<p>Nous vous confirmons la <strong>commande</strong> de la préparation suivante.</p>
<p><strong>Pharmacie :</strong> {pharmacy_name} — {pharmacy_email}</p>
<p><strong>Patient :</strong> {patient_initiales} — {patient_dob} — {patient_phone}</p>
<p><strong>Prescription :</strong> {prescripteur} — {voie_admin} — {forme} × {quantite}</p>
<pre>{formule}</pre>
<p>Réf. : #{order_id_short}</p>
<p>Cordialement,<br>{pharmacy_name}</p>`,
  },
  non_conforme: {
    subject: 'Non-conformité préparation #{order_id_short}',
    body: `<p>Bonjour,</p>
<p>La préparation <strong>#{order_id_short}</strong> présente une non-conformité à réception.</p>
<p><strong>Motif :</strong> {nc_reason}</p>
<p>Patient : {patient_initiales}<br>
Formule :</p>
<pre>{formule}</pre>
<p>Merci de nous recontacter.<br>{pharmacy_name}</p>`,
  },
  relance: {
    subject: 'Relance préparation magistrale #{order_id_short}',
    body: `<p>Bonjour,</p>
<p>Nous nous permettons de vous relancer concernant la préparation <strong>#{order_id_short}</strong> ({patient_initiales}).</p>
<pre>{formule}</pre>
<p>Cordialement,<br>{pharmacy_name}</p>`,
  },
  maj: {
    subject: 'Mise à jour préparation magistrale #{order_id_short}',
    body: `<p>Bonjour,</p>
<p>Mise à jour du dossier <strong>#{order_id_short}</strong> ({patient_initiales}).</p>
<pre>{formule}</pre>
<p>Statut : {statut}</p>
<p>{pharmacy_name}</p>`,
  },
  disponible_patient: {
    subject: 'Votre préparation magistrale est disponible',
    body: `<p>Bonjour,</p>
<p>Votre préparation magistrale est réceptionnée et <strong>disponible en pharmacie</strong>.</p>
<p>{prix_ttc}</p>
<p>Pharmacie {pharmacy_name}</p>`,
  },
  devis_valide_patient: {
    subject: 'Votre devis de préparation est validé',
    body: `<p>Bonjour,</p>
<p>Votre devis de préparation magistrale a été accepté. La commande est lancée auprès de notre prestataire.</p>
<p>Montant : {prix_ttc}</p>
<p>Pharmacie {pharmacy_name}</p>`,
  },
});

function pathGet(obj, path) {
  let cur = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

export function getCreationChamp(settings, code) {
  const def = CREATION_FIELD_DEFS.find((f) => f.code === code);
  const raw = settings?.creation_champs?.[code];
  const actif = raw?.actif !== false;
  const obligatoire = raw?.obligatoire != null
    ? !!raw.obligatoire && actif
    : !!(def?.defaultObligatoire && actif);
  return { actif, obligatoire, label: def?.label || code, etape: def?.etape, def };
}

export function listCreationFieldsForEtape(settings, etapeId) {
  return CREATION_FIELD_DEFS
    .filter((f) => f.etape === etapeId)
    .map((f) => ({ ...f, ...getCreationChamp(settings, f.code) }));
}

export function buildDefaultCreationChamps() {
  const out = {};
  for (const f of CREATION_FIELD_DEFS) {
    out[f.code] = { actif: true, obligatoire: !!f.defaultObligatoire };
  }
  return out;
}

/** Normalize UI map → payload creation_champs */
export function normalizeCreationChamps(uiMap) {
  const out = {};
  for (const f of CREATION_FIELD_DEFS) {
    const row = uiMap?.[f.code] || {};
    const actif = row.actif !== false;
    out[f.code] = {
      actif,
      obligatoire: actif && !!row.obligatoire,
    };
  }
  return out;
}

export function isFieldActive(settings, code) {
  return getCreationChamp(settings, code).actif;
}

export function isFieldRequired(settings, code) {
  return getCreationChamp(settings, code).obligatoire;
}

function isEmptyValue(val, type) {
  if (type === 'bool') return val !== true;
  if (type === 'array') return !Array.isArray(val) || val.length === 0;
  if (type === 'file') return !val;
  return val == null || String(val).trim() === '';
}

/**
 * Valide le formulaire selon creation_champs.
 * @returns {string|null} message d’erreur ou null
 */
export function validateCreationForm(form, settings, { asDraft = false, ordonnanceFile = null, existingOrdonnance = false } = {}) {
  if (asDraft) return null;
  const cfg = settings?.creation_champs || buildDefaultCreationChamps();
  const merged = { creation_champs: { ...buildDefaultCreationChamps(), ...cfg } };

  for (const f of CREATION_FIELD_DEFS) {
    const rule = getCreationChamp(merged, f.code);
    if (!rule.actif || !rule.obligatoire) continue;
    let val;
    if (f.type === 'file') {
      val = ordonnanceFile || existingOrdonnance || null;
    } else if (f.path[0] === 'patient_email') {
      val = form.patient_email;
    } else {
      val = pathGet(form, f.path);
    }
    if (isEmptyValue(val, f.type)) {
      return `Champ obligatoire : ${f.label}`;
    }
  }
  return null;
}

function asTemplateObj(raw, key) {
  const def = DEFAULT_MAIL_TEMPLATES[key] || { subject: '', body: '' };
  if (raw == null || raw === '') return { subject: def.subject, body: def.body };
  if (typeof raw === 'string') {
    // Legacy : seulement l’objet du mail
    return { subject: raw.trim() || def.subject, body: def.body };
  }
  return {
    subject: (raw.subject && String(raw.subject).trim()) || def.subject,
    body: (raw.body && String(raw.body).trim()) || def.body,
  };
}

export function getMailTemplate(settings, key) {
  return asTemplateObj(settings?.mail_templates?.[key], key);
}

export function buildMailContext(order, settings, extra = {}) {
  const fd = order?.form_data || {};
  const dem = fd.demande || {};
  const pat = fd.patient || {};
  const prixTtc = order?.prix_calcule != null ? `${order.prix_calcule} € TTC` : (extra.prix_ttc || '');
  const prixHt = order?.prix_ht_net != null ? `${order.prix_ht_net} €` : '';
  return {
    pharmacy_name: settings?.pharmacy_name || fd.pharmacie?.nom || '',
    pharmacy_address: settings?.pharmacy_address || fd.pharmacie?.adresse || '',
    pharmacy_email: settings?.pharmacy_email || fd.pharmacie?.email || '',
    pharmacy_interlocuteur: settings?.pharmacy_interlocuteur || fd.pharmacie?.interlocuteur || '',
    provider_name: settings?.provider_name || '',
    provider_email: settings?.provider_email || '',
    patient_initiales: order?.patient_initiales || '',
    patient_phone: order?.patient_phone || pat.phone || '',
    patient_email: order?.patient_email || fd.patient_email || '',
    patient_dob: pat.dob || '',
    formule: dem.formule || order?.formule || '',
    forme: dem.forme || order?.forme || '',
    quantite: dem.quantite ?? order?.quantite ?? '',
    prescripteur: dem.prescripteur || '',
    voie_admin: dem.voie_admin || '',
    nature: dem.nature || '',
    order_id: order?.id || '',
    order_id_short: order?.id ? String(order.id).slice(0, 8) : '',
    statut: order?.statut || '',
    prix_ht: prixHt,
    prix_ttc: prixTtc,
    tva: order?.tva_rate != null ? String(order.tva_rate) : '',
    provider_ref: order?.provider_ref || '',
    provider_lot: order?.provider_lot || '',
    ordonnancier_number: order?.ordonnancier_number || '',
    date_aujourdhui: new Date().toLocaleDateString('fr-FR'),
    nc_reason: order?.nc_reason || extra.nc_reason || '',
    ...extra,
  };
}

export function renderPlaceholders(text, ctx) {
  return String(text || '').replace(/\{([a-z0-9_]+)\}/gi, (_, key) => {
    const v = ctx[key];
    return v == null ? '' : String(v);
  });
}

/** Retourne { subject, body } rendus pour un type de mail. */
export function renderMailTemplate(settings, key, order, extra = {}) {
  const tpl = getMailTemplate(settings, key);
  const ctx = buildMailContext(order, settings, extra);
  return {
    subject: renderPlaceholders(tpl.subject, ctx),
    body: renderPlaceholders(tpl.body, ctx),
    ctx,
  };
}
