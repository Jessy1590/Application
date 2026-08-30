import { supabase } from './supabaseClient.js';

export function calcMagistralPrice(rule, quantite = 1) {
  if (!rule) return 0;
  const base = Number(rule.base_price) || 0;
  const coef = Number(rule.coefficient) || 1;
  const qty = Number(quantite) || 1;
  return Math.round(base * coef * qty * 100) / 100;
}

export async function fetchProviders() {
  const { data, error } = await supabase
    .from('magistral_providers')
    .select('*')
    .eq('actif', true)
    .order('name');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchPriceRules() {
  const { data, error } = await supabase
    .from('magistral_price_rules')
    .select('*')
    .eq('actif', true)
    .order('name');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createMagistralOrder(userId, payload) {
  const prix = calcMagistralPrice(payload.price_rule, payload.quantite);
  const { data, error } = await supabase
    .from('magistral_orders')
    .insert([{
      provider_id: payload.provider_id || null,
      price_rule_id: payload.price_rule_id || null,
      formule: payload.formule,
      patient_initiales: payload.patient_initiales || null,
      quantite: payload.quantite ?? 1,
      forme: payload.forme || payload.price_rule?.forme || null,
      prix_calcule: prix,
      statut: 'brouillon',
      created_by: userId,
      notes: payload.notes || null,
    }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function sendMagistralOrder(orderId, providerEmail, html) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Session expirée');

  const { data, error } = await supabase.functions.invoke('send-transactional-email', {
    body: {
      to: providerEmail,
      subject: `Commande préparation magistrale #${orderId.slice(0, 8)}`,
      html,
    },
  });
  if (error) throw new Error(error.message || 'Échec envoi e-mail');

  const { data: updated, error: upErr } = await supabase
    .from('magistral_orders')
    .update({
      statut: 'envoye',
      email_sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', orderId)
    .select()
    .single();
  if (upErr) throw new Error(upErr.message);
  return { order: updated, email: data };
}

export async function fetchMyOrders(userId) {
  const { data, error } = await supabase
    .from('magistral_orders')
    .select('*, magistral_providers(name, email)')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(15);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function markOrderReceived(orderId) {
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
  if (error) throw new Error(error.message);
  return data;
}
