import { supabase } from '../../../shared/supabaseClient.js';

export async function fetchActiveDocuments() {
  return supabase
    .from('documents')
    .select('*')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });
}

export async function fetchMySignatures(userId) {
  return supabase
    .from('document_signatures')
    .select('document_id, document_version, signed_at')
    .eq('user_id', userId);
}

export async function signDocument(userId, documentId, documentVersion) {
  return supabase.from('document_signatures').insert({
    user_id: userId,
    document_id: documentId,
    document_version: documentVersion,
  });
}

export async function fetchDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createDocument(doc, userId) {
  const { data, error } = await supabase
    .from('documents')
    .insert([{ ...doc, created_by: userId }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateDocument(id, updates) {
  const { data, error } = await supabase
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
    .from('document_signatures')
    .select('*')
    .eq('document_id', documentId)
    .order('signed_at', { ascending: false });
  if (error) throw error;

  const userIds = [...new Set(data.map((s) => s.user_id))];
  let profilesMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .schema('portail')
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    profiles?.forEach((p) => { profilesMap[p.id] = p.display_name; });
  }

  return data.map((s) => ({
    ...s,
    signer_name: profilesMap[s.user_id] || 'Inconnu',
  }));
}
