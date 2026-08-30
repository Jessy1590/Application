import { supabase } from './supabaseClient.js';

/**
 * Déclare une erreur de stock et crée une tâche urgente pour les admins.
 */
export async function declareStockError(userId, payload) {
  const details = {
    type: 'stock_error',
    medicament: payload.medicament,
    cip: payload.cip || '',
    quantite_theorique: payload.quantite_theorique ?? null,
    quantite_constatee: payload.quantite_constatee ?? null,
    description: payload.description || '',
    urgent: true,
    date: new Date().toISOString().split('T')[0],
  };

  const { data: admins, error: admErr } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id')
    .eq('role', 'admin');
  if (admErr) throw new Error(admErr.message);

  const assignees = admins?.map(a => a.id) || [];
  if (assignees.length === 0) assignees.push(userId);

  const titre = `ERREUR STOCK — ${payload.medicament}`;
  const { data: task, error: taskError } = await supabase
    .schema('PharmaOs')
    .from('tasks')
    .insert([{ titre, description: JSON.stringify(details), created_by: userId }])
    .select()
    .single();
  if (taskError) throw new Error(taskError.message);

  const assignments = assignees.map(uid => ({
    task_id: task.id,
    user_id: uid,
    statut: 'en_cours',
  }));
  const { error: assignError } = await supabase
    .schema('PharmaOs')
    .from('task_assignments')
    .insert(assignments);
  if (assignError) throw new Error(assignError.message);

  const { data: stockRow, error: stockError } = await supabase
    .schema('PharmaOs')
    .from('stock_errors')
    .insert([{
      user_id: userId,
      medicament: payload.medicament,
      cip: payload.cip || null,
      quantite_theorique: payload.quantite_theorique ?? null,
      quantite_constatee: payload.quantite_constatee ?? null,
      description: payload.description || null,
      status: 'ouvert',
      task_id: task.id,
    }])
    .select()
    .single();
  if (stockError) throw new Error(stockError.message);

  return { task, stockError: stockRow };
}

export async function fetchMyStockErrors(userId) {
  return supabase
    .from('stock_errors')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(15);
}
