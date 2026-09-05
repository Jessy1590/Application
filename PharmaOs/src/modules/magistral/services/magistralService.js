import { supabase } from '../../../shared/supabaseClient.js';

/** Prix vente = (HT net réception + frais port) × (1 + TVA%) × coefficient */
export function calcMagistralPrice(settings, prixHtNet, tvaRate) {
  if (!settings || prixHtNet == null) return null;
  const ht = Number(prixHtNet) || 0;
  const port = Number(settings.frais_port) || 0;
  const coef = Number(settings.coefficient) || 1;
  const tva = Number(tvaRate) || 0;
  const base = ht + port;
  const ttc = base * (1 + tva / 100);
  return Math.round(ttc * coef * 100) / 100;
}

export function maskPatient(nom, prenom) {
  return `${(prenom || '').slice(0, 2).toUpperCase()}${(nom || '').slice(0, 2).toUpperCase()}`;
}

export async function fetchSettings() {
  const { data, error } = await supabase.from('magistral_settings').select('*').limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateSettings(payload, id) {
  const row = { ...payload, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('magistral_settings').update(row).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createMagistralOrder(userId, payload) {
  const settings = await fetchSettings();
  const patient = payload.form_data?.patient || {};
  const masked = maskPatient(patient.nom, patient.prenom);

  const { data, error } = await supabase
    .from('magistral_orders')
    .insert([{
      formule: payload.form_data?.demande?.formule || payload.formule || '',
      patient_initiales: masked || null,
      form_data: payload.form_data || {},
      patient_email: payload.patient_email || null,
      ordonnance_path: payload.ordonnance_path || null,
      preparation_interne: !!payload.preparation_interne,
      statut: 'devis',
      created_by: userId,
      notes: payload.notes || null,
    }])
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (!payload.preparation_interne && settings?.provider_email) {
    try {
      await sendProviderEmail(data, settings, 'Demande de devis — préparation magistrale');
    } catch (mailErr) {
      console.warn('[magistral] e-mail prestataire non envoyé:', mailErr.message);
    }
  }
  return data;
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

function buildOrderHtml(order, settings, title) {
  const fd = order.form_data || {};
  const ph = fd.pharmacie || {};
  const dem = fd.demande || {};
  const pat = fd.patient || {};
  const ana = fd.analyse || {};
  return `
    <h2>${title}</h2>
    <h3>Pharmacie</h3>
    <p>${ph.nom || settings?.pharmacy_name || ''}<br>${ph.adresse || settings?.pharmacy_address || ''}<br>
    ${ph.email || settings?.pharmacy_email || ''} — ${ph.interlocuteur || settings?.pharmacy_interlocuteur || ''}</p>
    <h3>Demande</h3>
    <p>Nature : ${dem.nature || '—'} | Historique : ${dem.historique || '—'}<br>
    Prescripteur : ${dem.prescripteur || '—'} | Voie : ${dem.voie_admin || '—'}</p>
    <pre>${(dem.formule || order.formule || '').replace(/</g, '&lt;')}</pre>
    <h3>Patient (masqué)</h3>
    <p>${maskPatient(pat.nom, pat.prenom)} — Né(e) le ${pat.dob || '—'} — Type : ${pat.type_prep || '—'}</p>
    <h3>Analyse pharmaceutique</h3>
    <p>Dose/posologie vérifiées : ${ana.dose_posologie_ok ? 'OUI' : 'NON'}<br>
    CI : ${ana.contre_indications || '—'} | Interactions : ${ana.interactions || '—'}<br>
    Justifications : ${(ana.justifications || []).join(', ') || '—'}</p>
    <p>${ana.commentaires || ''}</p>
    ${order.prix_calcule != null ? `<p><strong>Prix :</strong> ${order.prix_calcule} € TTC</p>` : ''}
  `;
}

function buildHtmlShort(order, settings, title) {
  const fd = order.form_data || {};
  const dem = fd.demande || {};
  const pat = fd.patient || {};
  return `
    <h2>${title}</h2>
    <pre>${(dem.formule || order.formule || '').replace(/</g, '&lt;')}</pre>
    <p>Patient : ${maskPatient(pat.nom, pat.prenom)} — ${pat.dob || ''}</p>
    ${order.prix_calcule != null ? `<p>Prix TTC : <strong>${order.prix_calcule} €</strong></p>` : ''}
    <p>Pharmacie : ${settings?.pharmacy_name || ''}</p>
  `;
}

export async function sendProviderEmail(order, settings, subject) {
  const html = buildOrderHtml(order, settings, subject);
  await sendTransactionalEmail(settings.provider_email, subject, html);
  const { data, error } = await supabase
    .from('magistral_orders')
    .update({ email_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', order.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchMyOrders(userId) {
  const { data, error } = await supabase
    .from('magistral_orders')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function markOrderReceived(orderId, prixHtNet, tvaRate, notifyPatient = false) {
  const settings = await fetchSettings();
  const prix = calcMagistralPrice(settings, prixHtNet, tvaRate);

  const { data: order, error } = await supabase
    .from('magistral_orders')
    .update({
      statut: 'receptionne',
      prix_ht_net: prixHtNet,
      tva_rate: tvaRate,
      prix_calcule: prix,
      received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (notifyPatient && order.patient_email) {
    await sendTransactionalEmail(
      order.patient_email,
      'Votre préparation magistrale est disponible',
      `<p>Bonjour,</p><p>Votre préparation magistrale est réceptionnée et disponible en pharmacie.</p>
       ${prix != null ? `<p>Montant : <strong>${prix} €</strong></p>` : ''}`,
    );
  }
  return order;
}

export async function fetchOrders() {
  const { data, error } = await supabase.from('magistral_orders').select('*').order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateOrder(id, payload) {
  const row = { ...payload, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('magistral_orders').update(row).eq('id', id).select().single();
  if (error) throw new Error(error.message);
  return data;
}

export async function validateDevis(orderId, { launchOrder = true, sendEmail: doSend = true, notifyPatient = false } = {}) {
  const settings = await fetchSettings();
  const { data: order, error } = await supabase.from('magistral_orders').select('*').eq('id', orderId).single();
  if (error) throw new Error(error.message);

  if (!launchOrder) {
    return updateOrder(orderId, { statut: 'cloture', closed_at: new Date().toISOString(), closed_reason: 'Devis refusé' });
  }

  const updated = await updateOrder(orderId, { statut: 'commande' });
  if (doSend && settings?.provider_email) {
    await sendTransactionalEmail(settings.provider_email, `Commande préparation magistrale #${orderId.slice(0, 8)}`, buildHtmlShort(order, settings, 'Commande confirmée'));
    await updateOrder(orderId, { email_sent_at: new Date().toISOString() });
  }
  if (notifyPatient && order.patient_email) {
    await sendTransactionalEmail(order.patient_email, 'Votre devis est validé', '<p>Votre demande de préparation magistrale a été validée. La commande est lancée.</p>');
  }
  return updated;
}

export async function receiveOrder(orderId, prixHtNet, { tvaRate, notifyPatient = false, sendEmail: doSend = false } = {}) {
  const settings = await fetchSettings();
  const prix = calcMagistralPrice(settings, prixHtNet, tvaRate);
  const order = await updateOrder(orderId, {
    statut: 'receptionne',
    prix_ht_net: prixHtNet,
    tva_rate: tvaRate,
    prix_calcule: prix,
    received_at: new Date().toISOString(),
  });
  if (notifyPatient && order.patient_email) {
    await sendTransactionalEmail(order.patient_email, 'Préparation disponible', `<p>Votre préparation est disponible.${prix != null ? ` Montant : ${prix} €` : ''}</p>`);
  }
  if (doSend && settings?.provider_email) {
    await sendTransactionalEmail(settings.provider_email, 'Réception préparation', buildHtmlShort(order, settings, 'Réception confirmée'));
  }
  return order;
}

export async function closeOrder(orderId, reason = '') {
  return updateOrder(orderId, { statut: 'cloture', closed_at: new Date().toISOString(), closed_reason: reason || null });
}

export async function saveOrderEdit(orderId, formData, { sendEmail: doSend = false } = {}) {
  const settings = await fetchSettings();
  const pat = formData?.patient || {};
  const order = await updateOrder(orderId, {
    form_data: formData,
    formule: formData?.demande?.formule || '',
    patient_initiales: maskPatient(pat.nom, pat.prenom),
    patient_email: formData?.patient_email || null,
  });
  if (doSend && settings?.provider_email) {
    await sendTransactionalEmail(settings.provider_email, 'Mise à jour préparation magistrale', buildHtmlShort(order, settings, 'Mise à jour'));
  }
  return order;
}
