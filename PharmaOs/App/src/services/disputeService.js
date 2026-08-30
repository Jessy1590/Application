import { supabase } from './supabaseClient.js';

export const DISPUTE_TYPES = [
  { value: 'commande', label: 'Commande' },
  { value: 'facturation', label: 'Facturation' },
  { value: 'perimes', label: 'Périmés' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'retrait_lot', label: 'Retrait de lot' },
  { value: 'autre', label: 'Autre' },
];

export async function createDispute(userId, payload) {
  const { data, error } = await supabase
    .from('supplier_disputes')
    .insert([{
      dispute_type: payload.dispute_type,
      fournisseur_id: payload.fournisseur_id || null,
      fournisseur_nom: payload.fournisseur_nom || null,
      montant: payload.montant ?? null,
      description: payload.description || null,
      pieces: payload.pieces || null,
      lot_alert_id: payload.lot_alert_id || null,
      stock_error_id: payload.stock_error_id || null,
      statut: 'ouvert',
      created_by: userId,
    }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchMyDisputes(userId) {
  const { data, error } = await supabase
    .from('supplier_disputes')
    .select('*')
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchCommercialPartners() {
  const { data, error } = await supabase
    .from('directory_contacts')
    .select('id, nom, prenom')
    .eq('type', 'commercial_partner')
    .order('nom');
  if (error) throw new Error(error.message);
  return data || [];
}
