import { supabase } from './supabaseClient.js';

export async function fetchOpenLotAlerts() {
  const { data, error } = await supabase
    .from('lot_alerts')
    .select('*')
    .neq('status', 'clos')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchMyAcks(userId) {
  const { data, error } = await supabase
    .from('lot_alert_acks')
    .select('alert_id, read_at')
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function acknowledgeLotAlert(alertId, userId) {
  const { data, error } = await supabase
    .from('lot_alert_acks')
    .upsert([{ alert_id: alertId, user_id: userId, read_at: new Date().toISOString() }], {
      onConflict: 'alert_id,user_id',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
