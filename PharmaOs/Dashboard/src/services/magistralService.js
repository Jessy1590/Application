import { supabase } from './supabaseClient';

export function calcMagistralPrice(rule, quantite = 1) {
  if (!rule) return 0;
  const base = Number(rule.base_price) || 0;
  const coef = Number(rule.coefficient) || 1;
  const qty = Number(quantite) || 1;
  return Math.round(base * coef * qty * 100) / 100;
}

export async function fetchProviders() {
  const { data, error } = await supabase.from('magistral_providers').select('*').order('name');
  if (error) throw error;
  return data || [];
}

export async function upsertProvider(payload, id = null) {
  if (id) {
    const { data, error } = await supabase.from('magistral_providers').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('magistral_providers').insert([payload]).select().single();
  if (error) throw error;
  return data;
}

export async function fetchPriceRules() {
  const { data, error } = await supabase.from('magistral_price_rules').select('*').order('name');
  if (error) throw error;
  return data || [];
}

export async function upsertPriceRule(payload, id = null) {
  const row = { ...payload, updated_at: new Date().toISOString() };
  if (id) {
    const { data, error } = await supabase.from('magistral_price_rules').update(row).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('magistral_price_rules').insert([row]).select().single();
  if (error) throw error;
  return data;
}

export async function fetchOrders() {
  const { data, error } = await supabase
    .from('magistral_orders')
    .select('*, magistral_providers(name, email), magistral_price_rules(name)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createOrder(userId, payload) {
  const prix = calcMagistralPrice(payload.price_rule, payload.quantite);
  const { data, error } = await supabase
    .from('magistral_orders')
    .insert([{
      provider_id: payload.provider_id || null,
      price_rule_id: payload.price_rule_id || null,
      formule: payload.formule,
      patient_initiales: payload.patient_initiales || null,
      quantite: payload.quantite ?? 1,
      forme: payload.forme || null,
      prix_calcule: prix,
      statut: 'brouillon',
      created_by: userId,
      notes: payload.notes || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function sendOrderEmail(order, providerEmail) {
  const html = `
    <h2>Commande préparation magistrale</h2>
    <p><strong>Patient (initiales) :</strong> ${order.patient_initiales || '—'}</p>
    <p><strong>Forme / qté :</strong> ${order.forme || '—'} × ${order.quantite ?? 1}</p>
    <p><strong>Formule :</strong></p>
    <pre>${(order.formule || '').replace(/</g, '&lt;')}</pre>
    <p><strong>Prix indicatif :</strong> ${order.prix_calcule ?? '—'} €</p>
  `;

  const { data, error } = await supabase.functions.invoke('send-transactional-email', {
    body: {
      to: providerEmail,
      subject: `Commande préparation #${String(order.id).slice(0, 8)}`,
      html,
    },
  });
  if (error) throw error;

  const { data: updated, error: upErr } = await supabase
    .from('magistral_orders')
    .update({
      statut: 'envoye',
      email_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', order.id)
    .select()
    .single();
  if (upErr) throw upErr;
  return { order: updated, email: data };
}

export async function markReceived(orderId) {
  const { data, error } = await supabase
    .from('magistral_orders')
    .update({
      statut: 'recu',
      received_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
