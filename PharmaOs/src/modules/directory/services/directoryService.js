import { supabase } from '../../../shared/supabaseClient.js';

/**
 * Service unifié annuaire (comptoir + dashboard).
 * Table : PharmaOs.directory_contacts
 * type : health_professional | commercial_partner
 */

export async function fetchContacts() {
  const { data, error } = await supabase
    .from('directory_contacts')
    .select('*')
    .order('nom', { ascending: true });
  if (error) throw error;
  return data || [];
}

/** Variante soft pour le comptoir (retourne { data, error }). */
export async function fetchContactsSafe() {
  const { data, error } = await supabase
    .from('directory_contacts')
    .select('*')
    .order('nom', { ascending: true });
  return { data: data || [], error };
}

export async function fetchHealthProfessionals() {
  const { data, error } = await supabase
    .from('directory_contacts')
    .select('id, nom, prenom, switch_rupture')
    .eq('type', 'health_professional')
    .order('nom', { ascending: true });
  return { data: data || [], error };
}

/** Charge un contact (ex. type pour filtrer les motifs d'appel). */
export async function fetchContactById(id) {
  if (!id) return { data: null, error: null };
  const { data, error } = await supabase
    .from('directory_contacts')
    .select('id, nom, prenom, type, telephone, telephone_prive')
    .eq('id', id)
    .maybeSingle();
  return { data: data || null, error };
}

export async function insertContact(contactData) {
  const { data, error } = await supabase
    .from('directory_contacts')
    .insert([contactData])
    .select();
  if (error) throw error;
  return data;
}

export async function updateContact(id, contactData) {
  const { id: _id, created_at: _ca, ...dataToUpdate } = contactData;
  const { data, error } = await supabase
    .from('directory_contacts')
    .update(dataToUpdate)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data;
}

export async function updateContactSwitchRupture(id, switch_rupture) {
  return supabase.from('directory_contacts').update({ switch_rupture }).eq('id', id);
}

export async function deleteContact(id) {
  const { data, error } = await supabase.from('directory_contacts').delete().eq('id', id);
  if (error) throw error;
  return data;
}
