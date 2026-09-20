/**
 * Catalogue applicatif des e-mails transactionnels (tous modules).
 * Stockage : PharmaOs.app_settings key = mail_templates
 * value = { magistral: { devis: { subject, body }, … }, cash: { … } }
 */

export const MAIL_MODULES = Object.freeze([
  { id: 'magistral', label: 'Préparations magistrales' },
  { id: 'cash', label: 'Caisse' },
]);

/** Placeholders communs + par module (affichés dans le bandeau). */
export const MAIL_PLACEHOLDERS_BY_MODULE = Object.freeze({
  magistral: [
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
  ],
  cash: [
    { key: 'year_month', label: 'Mois (AAAA-MM)' },
    { key: 'closures_count', label: 'Nb clôtures' },
    { key: 'total_ecart', label: 'Écart total €' },
    { key: 'table_html', label: 'Tableau HTML des clôtures' },
    { key: 'pharmacy_name', label: 'Nom pharmacie' },
    { key: 'date_aujourdhui', label: 'Date du jour' },
  ],
});

export const MAIL_TEMPLATE_DEFS = Object.freeze({
  magistral: [
    { id: 'devis', label: 'Demande de devis → ST', dest: 'prestataire' },
    { id: 'commande', label: 'Commande → ST', dest: 'prestataire' },
    { id: 'non_conforme', label: 'Non-conformité → ST', dest: 'prestataire' },
    { id: 'relance', label: 'Relance → ST', dest: 'prestataire' },
    { id: 'maj', label: 'Mise à jour → ST', dest: 'prestataire' },
    { id: 'disponible_patient', label: 'Disponible → patient', dest: 'patient' },
    { id: 'devis_valide_patient', label: 'Devis accepté → patient', dest: 'patient' },
  ],
  cash: [
    { id: 'rapport_mensuel', label: 'Rapport mensuel → comptable', dest: 'comptable' },
  ],
});

export const DEFAULT_MAIL_TEMPLATES = Object.freeze({
  magistral: {
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
  },
  cash: {
    rapport_mensuel: {
      subject: 'Clôtures caisse {year_month}',
      body: `<h2>Rapport clôtures caisse — {year_month}</h2>
<p>{closures_count} clôture(s) — Écart total : <strong>{total_ecart} €</strong></p>
{table_html}
<p>PharmaOS — export automatique — {date_aujourdhui}</p>`,
    },
  },
});

export function asTemplateObj(raw, def = { subject: '', body: '' }) {
  if (raw == null || raw === '') return { subject: def.subject || '', body: def.body || '' };
  if (typeof raw === 'string') {
    return { subject: raw.trim() || def.subject || '', body: def.body || '' };
  }
  return {
    subject: (raw.subject && String(raw.subject).trim()) || def.subject || '',
    body: (raw.body && String(raw.body).trim()) || def.body || '',
  };
}

export function getDefaultTemplate(moduleId, key) {
  return asTemplateObj(null, DEFAULT_MAIL_TEMPLATES[moduleId]?.[key] || { subject: '', body: '' });
}

export function renderPlaceholders(text, ctx) {
  return String(text || '').replace(/\{([a-z0-9_]+)\}/gi, (_, key) => {
    const v = ctx[key];
    return v == null ? '' : String(v);
  });
}
