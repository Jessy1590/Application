/**
 * Paramètres Magistrales — champs création + templates mail (placeholders).
 * Style Location : actif / obligatoire + bandeau masques {…}.
 * Templates mail : source de vérité = app_settings.mail_templates (admin) ;
 * magistral_settings.mail_templates reste un fallback legacy.
 */

import {
  DEFAULT_MAIL_TEMPLATES as ALL_MAIL_TEMPLATES,
  MAIL_TEMPLATE_DEFS,
  MAIL_PLACEHOLDERS_BY_MODULE,
  asTemplateObj as catalogAsTemplateObj,
} from '../../admin/services/mailTemplatesCatalog.js';

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
export const MAIL_PLACEHOLDERS = MAIL_PLACEHOLDERS_BY_MODULE.magistral;

export const MAIL_TEMPLATE_KEYS = MAIL_TEMPLATE_DEFS.magistral;

export const DEFAULT_MAIL_TEMPLATES = ALL_MAIL_TEMPLATES.magistral;
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
  return catalogAsTemplateObj(raw, def);
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
    pharmacy_phone: settings?.pharmacy_phone || '',
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
