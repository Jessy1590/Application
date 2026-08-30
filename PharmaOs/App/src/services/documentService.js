import { supabase } from './supabaseClient.js';

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
