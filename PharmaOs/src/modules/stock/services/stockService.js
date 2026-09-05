import { supabase } from '../../../shared/supabaseClient.js';

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

  const assignees = admins?.map((a) => a.id) || [];
  if (assignees.length === 0) assignees.push(userId);

  const titre = `ERREUR STOCK — ${payload.medicament}`;
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert([{ titre, description: JSON.stringify(details), created_by: userId }])
    .select()
    .single();
  if (taskError) throw new Error(taskError.message);

  const assignments = assignees.map((uid) => ({
    task_id: task.id,
    user_id: uid,
    statut: 'en_cours',
  }));
  const { error: assignError } = await supabase
    .from('task_assignments')
    .insert(assignments);
  if (assignError) throw new Error(assignError.message);

  const { data: stockRow, error: stockError } = await supabase
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

export async function fetchStockErrors() {
  const { data, error } = await supabase
    .from('stock_errors')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const userIds = [...new Set(data.map((e) => e.user_id))];
  let profilesMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .schema('portail')
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    profiles?.forEach((p) => { profilesMap[p.id] = p.display_name; });
  }
  return data.map((e) => ({ ...e, author_name: profilesMap[e.user_id] || 'Inconnu' }));
}

/**
 * Admin : soit demande un recomptage (tâche équipe), soit valide erreur de commande.
 */
export async function resolveStockError(id, decision, adminNotes, adminUserId) {
  const { data: row, error: fetchErr } = await supabase
    .from('stock_errors')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;

  if (decision === 'recompter') {
    const { data: profiles } = await supabase
      .schema('portail')
      .from('profiles')
      .select('id')
      .in('role', ['admin', 'équipe']);
    const assignees = profiles?.map((p) => p.id) || [adminUserId];
    const details = {
      type: 'stock_recompte',
      stock_error_id: id,
      medicament: row.medicament,
      cip: row.cip,
      urgent: true,
      date: new Date().toISOString().split('T')[0],
    };
    const titre = `RECOMPTAGE STOCK — ${row.medicament}`;
    const { data: task, error: taskErr } = await supabase
      .from('tasks')
      .insert([{ titre, description: JSON.stringify(details), created_by: adminUserId }])
      .select()
      .single();
    if (taskErr) throw taskErr;
    await supabase.from('task_assignments').insert(
      assignees.map((uid) => ({ task_id: task.id, user_id: uid, statut: 'en_cours' }))
    );

    const { error } = await supabase.from('stock_errors').update({
      status: 'recompter',
      admin_decision: 'recompter',
      admin_notes: adminNotes || null,
      resolved_by: adminUserId,
    }).eq('id', id);
    if (error) throw error;
    return { decision: 'recompter', task };
  }

  const { error } = await supabase.from('stock_errors').update({
    status: 'erreur_commande',
    admin_decision: 'erreur_commande',
    admin_notes: adminNotes || null,
    resolved_by: adminUserId,
    resolved_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;

  if (row.task_id) {
    await supabase.from('task_assignments')
      .update({
        statut: 'terminee',
        commentaire: `Erreur commande validée par admin. ${adminNotes || ''}`,
        completed_at: new Date().toISOString(),
      })
      .eq('task_id', row.task_id);
  }

  return { decision: 'erreur_commande' };
}
