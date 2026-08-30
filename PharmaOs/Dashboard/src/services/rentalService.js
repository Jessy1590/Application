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
    .order('date_sortie', { ascending: false });
  if (statut) q = q.eq('statut', statut);
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
