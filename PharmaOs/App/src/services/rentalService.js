import { supabase } from './supabaseClient.js';

const ASSET_TYPES = [
  { value: 'lit', label: 'Lit' },
  { value: 'tens', label: 'TENS' },
  { value: 'aerosol', label: 'Aérosol' },
  { value: 'balance_bebe', label: 'Balance bébé' },
  { value: 'tensiometre', label: 'Tensiomètre' },
  { value: 'fauteuil_roulant', label: 'Fauteuil roulant' },
  { value: 'autre', label: 'Autre' },
];

export { ASSET_TYPES };

export async function fetchAvailableAssets() {
  const { data, error } = await supabase
    .from('rental_assets')
    .select('*')
    .eq('status', 'disponible')
    .order('asset_type');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchOpenContracts() {
  const { data, error } = await supabase
    .from('rental_contracts')
    .select('*, rental_assets(*)')
    .eq('statut', 'en_cours')
    .order('date_sortie', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function startRental(userId, payload) {
  const { data: contract, error } = await supabase
    .from('rental_contracts')
    .insert([{
      asset_id: payload.asset_id,
      patient_nom: payload.patient_nom,
      patient_prenom: payload.patient_prenom,
      patient_dob: payload.patient_dob || null,
      addons: payload.addons || {},
      caution_type: payload.caution_type || null,
      caution_montant: payload.caution_montant ?? null,
      coverage_checked: !!payload.coverage_checked,
      checklist_iso: payload.checklist_iso || {},
      statut: 'en_cours',
      created_by: userId,
      notes: payload.notes || null,
    }])
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from('rental_assets').update({ status: 'loue', updated_at: new Date().toISOString() }).eq('id', payload.asset_id);
  await supabase.from('rental_events').insert([{
    contract_id: contract.id,
    event_type: 'sortie',
    user_id: userId,
    payload: { patient: `${payload.patient_prenom} ${payload.patient_nom}` },
  }]);

  return contract;
}

export async function returnRental(userId, contractId, payload) {
  const { data: contract, error } = await supabase
    .from('rental_contracts')
    .update({
      statut: 'retourne',
      date_retour: new Date().toISOString(),
      caution_restituee: !!payload.caution_restituee,
      checklist_iso: payload.checklist_iso || {},
      notes: payload.notes || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', contractId)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from('rental_assets').update({ status: 'disponible', updated_at: new Date().toISOString() }).eq('id', contract.asset_id);
  await supabase.from('rental_events').insert([{
    contract_id: contractId,
    event_type: 'retour',
    user_id: userId,
    payload: { etat: payload.etat || '', caution_restituee: !!payload.caution_restituee },
  }]);

  return contract;
}
