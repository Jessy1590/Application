import { supabase } from './supabaseClient.js';

export async function submitCashClosure(userId, authorName, payload) {
  const { data, error } = await supabase
    .from('cash_closures')
    .insert([{
      closure_date: payload.closure_date || new Date().toISOString().split('T')[0],
      author_id: userId,
      author_name: authorName || null,
      fond_reel: Number(payload.fond_reel) || 0,
      fond_logiciel: Number(payload.fond_logiciel) || 0,
      montant_cb: Number(payload.montant_cb) || 0,
      argent_lieu_sur: Number(payload.argent_lieu_sur) || 0,
      nb_cheques: Number(payload.nb_cheques) || 0,
      montant_cheques: Number(payload.montant_cheques) || 0,
      garde: !!payload.garde,
      sortie_particuliere: !!payload.sortie_particuliere,
      sortie_montant: Number(payload.sortie_montant) || 0,
      sortie_motif: payload.sortie_motif || null,
      notes: payload.notes || null,
    }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchMyClosures(userId) {
  const { data, error } = await supabase
    .from('cash_closures')
    .select('*')
    .eq('author_id', userId)
    .order('closure_date', { ascending: false })
    .limit(15);
  if (error) throw new Error(error.message);
  return data || [];
}

export function calcEcart(c) {
  return (Number(c.fond_reel) || 0) - (Number(c.fond_logiciel) || 0);
}
