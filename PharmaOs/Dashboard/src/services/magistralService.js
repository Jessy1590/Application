import { supabase } from './supabaseClient';

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
  if (error) throw error;
  return data;
}

export async function updateSettings(payload, id) {
  const row = { ...payload, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('magistral_settings').update(row).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function fetchOrders() {
  const { data, error } = await supabase.from('magistral_orders').select('*').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateOrder(id, payload) {
  const row = { ...payload, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('magistral_orders').update(row).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

async function sendEmail(to, subject, html) {
  if (!to) throw new Error('E-mail destinataire manquant.');
  const { data, error } = await supabase.functions.invoke('send-transactional-email', { body: { to, subject, html } });
  if (error || data?.error) {
    throw new Error(data?.error || error?.message || 'Échec envoi e-mail');
  }
  return data;
}

function buildHtml(order, settings, title) {
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

export async function validateDevis(orderId, { launchOrder = true, sendEmail: doSend = true, notifyPatient = false } = {}) {
  const settings = await fetchSettings();
  const { data: order, error } = await supabase.from('magistral_orders').select('*').eq('id', orderId).single();
  if (error) throw error;

  if (!launchOrder) {
    return updateOrder(orderId, { statut: 'cloture', closed_at: new Date().toISOString(), closed_reason: 'Devis refusé' });
  }

  const updated = await updateOrder(orderId, { statut: 'commande' });
  if (doSend && settings?.provider_email) {
    await sendEmail(settings.provider_email, `Commande préparation magistrale #${orderId.slice(0, 8)}`, buildHtml(order, settings, 'Commande confirmée'));
    await updateOrder(orderId, { email_sent_at: new Date().toISOString() });
  }
  if (notifyPatient && order.patient_email) {
    await sendEmail(order.patient_email, 'Votre devis est validé', '<p>Votre demande de préparation magistrale a été validée. La commande est lancée.</p>');
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
    await sendEmail(order.patient_email, 'Préparation disponible', `<p>Votre préparation est disponible.${prix != null ? ` Montant : ${prix} €` : ''}</p>`);
  }
  if (doSend && settings?.provider_email) {
    await sendEmail(settings.provider_email, 'Réception préparation', buildHtml(order, settings, 'Réception confirmée'));
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
    await sendEmail(settings.provider_email, 'Mise à jour préparation magistrale', buildHtml(order, settings, 'Mise à jour'));
  }
  return order;
}
