import { supabase } from './supabaseClient.js';

/** Produits périmant dans les 3 prochains mois (actifs) */
export async function fetchPerimesExpiringSoon() {
  const today = new Date();
  const in3Months = new Date();
  in3Months.setMonth(in3Months.getMonth() + 3);
  return supabase
    .from('perimes')
    .select('*')
    .eq('status', 'actif')
    .gte('date_peremption', today.toISOString().split('T')[0])
    .lte('date_peremption', in3Months.toISOString().split('T')[0])
    .order('date_peremption', { ascending: true });
}

export async function fetchAllPerimes() {
  return supabase
    .from('perimes')
    .select('*')
    .order('date_peremption', { ascending: true });
}

export async function insertPerime(userId, payload) {
  return supabase.from('perimes').insert({
    medicament: payload.medicament,
    cip: payload.cip || null,
    lot: payload.lot || null,
    date_peremption: payload.date_peremption,
    quantite: payload.quantite || 1,
    source: payload.source || 'reception',
    notes: payload.notes || null,
    created_by: userId,
    status: 'actif',
  }).select().single();
}

export async function updatePerimeStatus(id, status) {
  return supabase
    .from('perimes')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
}
