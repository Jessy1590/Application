import { supabase } from './supabaseClient';

export async function fetchDocuments() {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('documents')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createDocument(doc, userId) {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('documents')
    .insert([{ ...doc, created_by: userId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDocument(id, updates) {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('documents')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchDocumentSignatures(documentId) {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('document_signatures')
    .select('*')
    .eq('document_id', documentId)
    .order('signed_at', { ascending: false });
  if (error) throw error;

  const userIds = [...new Set(data.map(s => s.user_id))];
  let profilesMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .schema('portail')
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    profiles?.forEach(p => { profilesMap[p.id] = p.display_name; });
  }

  return data.map(s => ({
    ...s,
    signer_name: profilesMap[s.user_id] || 'Inconnu',
  }));
}

export async function createRetraitLotTask({ laboratoire, medicament, lot, motif }, userId) {
  const { data: profiles, error: profError } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'équipe']);
  if (profError) throw profError;

  const assignees = profiles?.map(p => p.id) || [];
  const details = {
    type: 'retrait_lot',
    laboratoire,
    medicament,
    lot,
    motif,
    quantite_isolee: null,
    urgent: true,
    date: new Date().toISOString().split('T')[0],
  };

  const titre = `RETRAIT LOT — ${medicament} (Lot ${lot})`;

  const { data: task, error: taskError } = await supabase
    .schema('PharmaOs')
    .from('tasks')
    .insert([{ titre, description: JSON.stringify(details), created_by: userId }])
    .select()
    .single();
  if (taskError) throw taskError;

  if (assignees.length > 0) {
    const assignments = assignees.map(uid => ({
      task_id: task.id,
      user_id: uid,
      statut: 'en_cours',
    }));
    const { error: assignError } = await supabase
      .schema('PharmaOs')
      .from('task_assignments')
      .insert(assignments);
    if (assignError) throw assignError;
  }

  return task;
}
