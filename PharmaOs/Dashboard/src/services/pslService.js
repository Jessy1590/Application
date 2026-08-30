import { supabase } from './supabaseClient';

export async function fetchPslUnits({ statut } = {}) {
  let q = supabase.from('psl_units').select('*').order('created_at', { ascending: false });
  if (statut) q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchPslMovements(limit = 200) {
  const { data, error } = await supabase
    .from('psl_movements')
    .select('*, psl_units(code_produit, numero_unite, groupe_abo, rh)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export function exportPslRegisterCsv(movements) {
  const header = ['Date', 'Type', 'Code produit', 'N° unité', 'ABO', 'Rh', 'Patient', 'IPP', 'Notes'];
  const rows = movements.map((m) => [
    new Date(m.created_at).toLocaleString('fr-FR'),
    m.movement_type,
    m.psl_units?.code_produit || '',
    m.psl_units?.numero_unite || '',
    m.psl_units?.groupe_abo || '',
    m.psl_units?.rh || '',
    m.patient_initiales || '',
    m.patient_ipp || '',
    (m.notes || '').replace(/"/g, '""'),
  ]);
  const csv = [header, ...rows].map((r) => r.map((c) => `"${c}"`).join(';')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `registre_psl_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
