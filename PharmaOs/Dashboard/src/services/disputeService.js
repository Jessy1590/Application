import { supabase } from './supabaseClient';

export const DISPUTE_TYPES = [
  { value: 'commande', label: 'Commande' },
  { value: 'facturation', label: 'Facturation' },
  { value: 'perimes', label: 'Périmés' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'retrait_lot', label: 'Retrait de lot' },
  { value: 'autre', label: 'Autre' },
];

export async function fetchDisputes({ statut } = {}) {
  let q = supabase
    .from('supplier_disputes')
    .select('*')
    .order('created_at', { ascending: false });
  if (statut) q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function updateDisputeStatus(id, statut) {
  const updates = {
    statut,
    updated_at: new Date().toISOString(),
    closed_at: statut === 'clos' ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase
    .from('supplier_disputes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function createDisputeFromLotAlert(userId, alert, returnLocation) {
  const { data, error } = await supabase
    .from('supplier_disputes')
    .insert([{
      dispute_type: 'retrait_lot',
      fournisseur_nom: alert.laboratoire || 'Laboratoire',
      description: `Renvoi produits — alerte ${alert.alert_number} — ${alert.medicament} lot ${alert.lot}. Lieu: ${returnLocation || 'à préciser'}`,
      lot_alert_id: alert.id,
      pieces: returnLocation || null,
      statut: 'ouvert',
      created_by: userId,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}
