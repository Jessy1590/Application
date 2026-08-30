import { supabase } from './supabaseClient';

export async function fetchPerimes() {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('perimes')
    .select('*')
    .order('date_peremption', { ascending: true });
  if (error) throw error;
  return data;
}

export async function fetchPerimesExpiringSoon() {
  const today = new Date().toISOString().split('T')[0];
  const in3 = new Date();
  in3.setMonth(in3.getMonth() + 3);
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('perimes')
    .select('*')
    .eq('status', 'actif')
    .gte('date_peremption', today)
    .lte('date_peremption', in3.toISOString().split('T')[0])
    .order('date_peremption', { ascending: true });
  if (error) throw error;
  return data;
}

export async function updatePerimeStatus(id, status) {
  const { error } = await supabase
    .schema('PharmaOs')
    .from('perimes')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

/**
 * Crée une tâche mensuelle pour l'équipe : mettre en avant / promo les périmés à 3 mois.
 */
export async function createMonthlyPerimesTask(userId) {
  const list = await fetchPerimesExpiringSoon();
  const { data: profiles } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'équipe']);

  const assignees = profiles?.map(p => p.id) || [userId];
  const details = {
    type: 'perimes_mensuel',
    count: list.length,
    items: list.slice(0, 30).map(p => ({
      medicament: p.medicament,
      date_peremption: p.date_peremption,
      quantite: p.quantite,
    })),
    date: new Date().toISOString().split('T')[0],
  };

  const titre = `PÉRIMÉS — ${list.length} produit(s) à mettre en avant / promo (échéance 3 mois)`;
  const { data: task, error } = await supabase
    .schema('PharmaOs')
    .from('tasks')
    .insert([{ titre, description: JSON.stringify(details), created_by: userId }])
    .select()
    .single();
  if (error) throw error;

  await supabase.schema('PharmaOs').from('task_assignments').insert(
    assignees.map(uid => ({ task_id: task.id, user_id: uid, statut: 'en_cours' }))
  );
  return { task, count: list.length };
}
