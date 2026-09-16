import { supabase } from '../../../shared/supabaseClient.js';

export const STOCK_STATUS_LABELS = {
  ouvert: 'En attente admin',
  recompter: 'Recomptage demandé',
  attente_admin: 'À corriger (après recomptage)',
  erreur_commande: 'Erreur de commande',
  erreur_reception: 'Erreur de réception',
  cloture: 'Clôturé',
};

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

export async function fetchStockErrors({ status, decision } = {}) {
  let q = supabase
    .from('stock_errors')
    .select('*')
    .order('created_at', { ascending: false });
  if (status) q = q.eq('status', status);
  if (decision) q = q.eq('admin_decision', decision);
  const { data, error } = await q;
  if (error) throw error;

  const userIds = [...new Set([
    ...data.map((e) => e.user_id),
    ...data.map((e) => e.resolved_by).filter(Boolean),
  ])];
  let profilesMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .schema('portail')
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    profiles?.forEach((p) => { profilesMap[p.id] = p.display_name; });
  }
  return data.map((e) => ({
    ...e,
    author_name: profilesMap[e.user_id] || 'Inconnu',
    resolver_name: e.resolved_by ? (profilesMap[e.resolved_by] || 'Admin') : null,
  }));
}

/**
 * Admin : recomptage | erreur commande | erreur réception.
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
      quantite_theorique: row.quantite_theorique,
      quantite_constatee: row.quantite_constatee,
      description: row.description || '',
      urgent: true,
      date: new Date().toISOString().split('T')[0],
      instruction: 'Indiquer obligatoirement dans la note le nombre FINAL de boîtes comptées.',
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

  if (decision === 'erreur_reception') {
    const { error } = await supabase.from('stock_errors').update({
      status: 'erreur_reception',
      admin_decision: 'erreur_reception',
      admin_notes: adminNotes || null,
      resolved_by: adminUserId,
      resolved_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;

    if (row.task_id) {
      await supabase.from('task_assignments')
        .update({
          statut: 'terminee',
          commentaire: `Erreur de réception — clôturé. ${adminNotes || ''}`,
          completed_at: new Date().toISOString(),
        })
        .eq('task_id', row.task_id);
    }
    return { decision: 'erreur_reception' };
  }

  // erreur_commande (défaut)
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

/**
 * Après recomptage équipe : enregistre le nb final et crée une tâche admin
 * pour corriger le stock logiciel puis clôturer.
 */
export async function submitRecountResult({
  stockErrorId,
  taskId,
  quantiteFinale,
  note,
  userId,
  displayName,
}) {
  if (quantiteFinale === '' || quantiteFinale == null || Number.isNaN(Number(quantiteFinale))) {
    throw new Error('Indiquez obligatoirement le nombre final de boîtes comptées.');
  }
  const qte = parseInt(quantiteFinale, 10);
  if (qte < 0) throw new Error('La quantité finale doit être ≥ 0.');

  const { data: row, error: fetchErr } = await supabase
    .from('stock_errors')
    .select('*')
    .eq('id', stockErrorId)
    .single();
  if (fetchErr) throw new Error(fetchErr.message);

  const finalNote = [
    `Qté finale comptée : ${qte} boîte(s)`,
    note ? `Note : ${note}` : null,
    `(Validé par ${displayName || 'Utilisateur'})`,
  ].filter(Boolean).join(' — ');

  const { error: completeErr } = await supabase
    .from('task_assignments')
    .update({
      statut: 'terminee',
      commentaire: finalNote,
      completed_at: new Date().toISOString(),
    })
    .eq('task_id', taskId);
  if (completeErr) throw new Error(completeErr.message);

  const adminNotes = [
    row.admin_notes,
    `Recomptage : ${qte} boîte(s) finale(s)`,
    note || null,
  ].filter(Boolean).join('\n');

  const { error: updErr } = await supabase.from('stock_errors').update({
    status: 'attente_admin',
    admin_notes: adminNotes,
    quantite_constatee: qte,
  }).eq('id', stockErrorId);
  if (updErr) throw new Error(updErr.message);

  const { data: admins } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id')
    .eq('role', 'admin');
  const assignees = admins?.map((a) => a.id) || [userId];

  const details = {
    type: 'stock_recompte_result',
    stock_error_id: stockErrorId,
    medicament: row.medicament,
    cip: row.cip,
    quantite_theorique: row.quantite_theorique,
    quantite_finale: qte,
    note: note || '',
    urgent: true,
    date: new Date().toISOString().split('T')[0],
    instruction: 'Modifier le stock logiciel selon le recomptage, puis clôturer l’erreur.',
  };
  const titre = `CORRIGER STOCK — ${row.medicament} (recomptage : ${qte})`;
  const { data: task, error: taskErr } = await supabase
    .from('tasks')
    .insert([{ titre, description: JSON.stringify(details), created_by: userId }])
    .select()
    .single();
  if (taskErr) throw new Error(taskErr.message);

  await supabase.from('task_assignments').insert(
    assignees.map((uid) => ({ task_id: task.id, user_id: uid, statut: 'en_cours' }))
  );

  return { task, quantiteFinale: qte };
}

/** Admin clôture après correction du stock logiciel. */
export async function closeStockErrorAfterRecount(id, adminNotes, adminUserId) {
  const { data: row, error: fetchErr } = await supabase
    .from('stock_errors')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchErr) throw fetchErr;

  const notes = [row.admin_notes, adminNotes].filter(Boolean).join('\n');
  const { error } = await supabase.from('stock_errors').update({
    status: 'cloture',
    admin_decision: row.admin_decision || 'recompter',
    admin_notes: notes || null,
    resolved_by: adminUserId,
    resolved_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;

  // Clôturer les tâches admin liées au résultat de recomptage
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, description')
    .order('created_at', { ascending: false })
    .limit(100);
  const related = (tasks || []).filter((t) => {
    try {
      const d = JSON.parse(t.description || '{}');
      return d.type === 'stock_recompte_result' && d.stock_error_id === id;
    } catch {
      return false;
    }
  });
  for (const t of related) {
    await supabase.from('task_assignments')
      .update({
        statut: 'terminee',
        commentaire: `Stock corrigé et erreur clôturée. ${adminNotes || ''}`,
        completed_at: new Date().toISOString(),
      })
      .eq('task_id', t.id)
      .eq('statut', 'en_cours');
  }

  return { status: 'cloture' };
}
