import { supabase } from './supabaseClient.js';

export async function receivePslUnit(userId, payload) {
  const { data: unit, error } = await supabase
    .from('psl_units')
    .insert([{
      code_produit: payload.code_produit,
      numero_unite: payload.numero_unite,
      groupe_abo: payload.groupe_abo || null,
      rh: payload.rh || null,
      date_peremption: payload.date_peremption || null,
      fournisseur: payload.fournisseur || null,
      statut: 'en_stock',
      created_by: userId,
    }])
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from('psl_movements').insert([{
    unit_id: unit.id,
    movement_type: 'reception',
    user_id: userId,
    notes: payload.notes || null,
  }]);

  return unit;
}

export async function deliverPslUnit(userId, unitId, payload) {
  const { data: unit, error } = await supabase
    .from('psl_units')
    .update({ statut: 'delivre', updated_at: new Date().toISOString() })
    .eq('id', unitId)
    .eq('statut', 'en_stock')
    .select()
    .single();
  if (error) throw new Error(error.message);

  await supabase.from('psl_movements').insert([{
    unit_id: unitId,
    movement_type: 'delivrance',
    patient_initiales: payload.patient_initiales || null,
    patient_ipp: payload.patient_ipp || null,
    user_id: userId,
    notes: payload.notes || null,
  }]);

  return unit;
}

export async function fetchStockUnits() {
  const { data, error } = await supabase
    .from('psl_units')
    .select('*')
    .eq('statut', 'en_stock')
    .order('date_peremption', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}
