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

export async function createRetraitLotTask(form, userId) {
  const { createLotAlert } = await import('./lotAlertService');
  const result = await createLotAlert({
    alert_number: form.alert_number || `MANUEL-${Date.now()}`,
    laboratoire: form.laboratoire,
    medicament: form.medicament,
    lot: form.lot,
    motif: form.motif,
    requires_return: !!form.requires_return,
    return_location: form.return_location,
  }, userId);
  return result.task;
}
