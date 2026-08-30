import { supabase } from './supabaseClient';

export async function fetchStockErrors() {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('stock_errors')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const userIds = [...new Set(data.map(e => e.user_id))];
  let profilesMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.schema('portail').from('profiles').select('id, display_name').in('id', userIds);
    profiles?.forEach(p => { profilesMap[p.id] = p.display_name; });
  }
  return data.map(e => ({ ...e, author_name: profilesMap[e.user_id] || 'Inconnu' }));
}

/**
 * Admin : soit demande un recomptage (tâche équipe), soit valide erreur de commande.
 */
export async function resolveStockError(id, decision, adminNotes, adminUserId) {
  const { data: row, error: fetchErr } = await supabase
    .schema('PharmaOs')
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
    const assignees = profiles?.map(p => p.id) || [adminUserId];
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
      .schema('PharmaOs')
      .from('tasks')
      .insert([{ titre, description: JSON.stringify(details), created_by: adminUserId }])
      .select()
      .single();
    if (taskErr) throw taskErr;
    await supabase.schema('PharmaOs').from('task_assignments').insert(
      assignees.map(uid => ({ task_id: task.id, user_id: uid, statut: 'en_cours' }))
    );

    const { error } = await supabase.schema('PharmaOs').from('stock_errors').update({
      status: 'recompter',
      admin_decision: 'recompter',
      admin_notes: adminNotes || null,
      resolved_by: adminUserId,
    }).eq('id', id);
    if (error) throw error;
    return { decision: 'recompter', task };
  }

  // erreur_commande : validation admin, clôture
  const { error } = await supabase.schema('PharmaOs').from('stock_errors').update({
    status: 'erreur_commande',
    admin_decision: 'erreur_commande',
    admin_notes: adminNotes || null,
    resolved_by: adminUserId,
    resolved_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;

  // Clôturer la tâche admin liée si présente
  if (row.task_id) {
    await supabase.schema('PharmaOs').from('task_assignments')
      .update({
        statut: 'terminee',
        commentaire: `Erreur commande validée par admin. ${adminNotes || ''}`,
        completed_at: new Date().toISOString(),
      })
      .eq('task_id', row.task_id);
  }

  return { decision: 'erreur_commande' };
}
