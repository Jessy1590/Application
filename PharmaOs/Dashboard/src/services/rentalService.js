import { supabase } from './supabaseClient';

export const ASSET_TYPES = [
  { value: 'lit', label: 'Lit' },
  { value: 'tens', label: 'TENS' },
  { value: 'aerosol', label: 'Aérosol' },
  { value: 'balance_bebe', label: 'Balance bébé' },
  { value: 'tensiometre', label: 'Tensiomètre' },
  { value: 'fauteuil_roulant', label: 'Fauteuil roulant' },
  { value: 'autre', label: 'Autre' },
];

export const SOURCE_TYPES = [
  { value: 'stock_pharma', label: 'Stock pharmacie' },
  { value: 'stock_presta', label: 'Stock dépôt / prestataire' },
  { value: 'commande', label: 'Commande produit' },
];

export const STATUT_LABELS = {
  attente_reception: 'En attente réception produit',
  en_cours: 'Location démarrée',
  retourne: 'Retournée',
  demande: 'En attente réception produit',
};

export async function fetchAssets() {
  const { data, error } = await supabase
    .from('rental_assets')
    .select('*')
    .order('asset_type');
  if (error) throw error;
  return data || [];
}

export async function upsertAsset(payload, id = null) {
  const row = {
    ...payload,
    requires_coverage_check: ['tens', 'aerosol', 'fauteuil_roulant'].includes(payload.asset_type)
      ? true
      : !!payload.requires_coverage_check,
    updated_at: new Date().toISOString(),
  };
  if (id) {
    const { data, error } = await supabase.from('rental_assets').update(row).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('rental_assets').insert([row]).select().single();
  if (error) throw error;
  return data;
}

export async function fetchContracts({ statut } = {}) {
  let q = supabase
    .from('rental_contracts')
    .select('*, rental_assets(*)')
    .order('created_at', { ascending: false });
  if (statut === 'attente_reception') {
    q = q.in('statut', ['attente_reception', 'demande']);
  } else if (statut) {
    q = q.eq('statut', statut);
  }
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchContractEvents(contractId) {
  const { data, error } = await supabase
    .from('rental_events')
    .select('*')
    .eq('contract_id', contractId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateContract(id, payload) {
  const row = { ...payload, updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from('rental_contracts').update(row).eq('id', id).select('*, rental_assets(*)').single();
  if (error) throw error;
  return data;
}

export async function updateAssetStatus(assetId, status) {
  const { data, error } = await supabase.from('rental_assets').update({ status, updated_at: new Date().toISOString() }).eq('id', assetId).select().single();
  if (error) throw error;
  return data;
}

export async function markBillingWeek(contractId, weekKey, ok = true) {
  const { data: c, error: e1 } = await supabase.from('rental_contracts').select('billing_weeks').eq('id', contractId).single();
  if (e1) throw e1;
  const weeks = Array.isArray(c.billing_weeks) ? [...c.billing_weeks] : [];
  if (!weeks.includes(weekKey)) weeks.push(weekKey);
  return updateContract(contractId, { billing_status: ok ? 'facture' : 'en_attente', billing_weeks: weeks });
}

export async function extendPrescription(contractId, validUntil) {
  return updateContract(contractId, { prescription_valid_until: validUntil });
}

export async function fetchOverdueContracts(days = 30) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const { data, error } = await supabase
    .from('rental_contracts')
    .select('*, rental_assets(*)')
    .eq('statut', 'en_cours')
    .lt('date_sortie', cutoff.toISOString());
  if (error) throw error;
  return data || [];
}
