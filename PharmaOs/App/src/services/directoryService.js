import { supabase } from './supabaseClient.js';

/**
 * Récupère tous les contacts de l'annuaire
 */
export async function fetchContacts() {
  const { data, error } = await supabase
    .from('directory_contacts')
    .select('*')
    .order('nom', { ascending: true });

  return { data: data || [], error };
}

/**
 * Ajoute un nouveau contact (Pro de santé ou Partenaire)
 */
export async function addContact(contactData) {
  const { data, error } = await supabase
    .from('directory_contacts')
    .insert([contactData])
    .select()
    .single();

  return { data, error };
}