import { supabase } from './supabaseClient';

export const insertContact = async (contactData) => {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('directory_contacts')
    .insert([contactData])
    .select();

  if (error) {
    console.error("Erreur lors de l'ajout du contact:", error);
    throw error;
  }
  return data;
};

export const fetchContacts = async () => {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('directory_contacts')
    .select('*')
    .order('nom', { ascending: true });

  if (error) {
    console.error("Erreur lors de la récupération des contacts:", error);
    throw error;
  }
  return data;
};

export const updateContact = async (id, contactData) => {
  const { id: _, created_at: __, ...dataToUpdate } = contactData;

  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('directory_contacts')
    .update(dataToUpdate)
    .eq('id', id)
    .select();

  if (error) {
    console.error("Erreur lors de la modification du contact:", error);
    throw error;
  }
  return data;
};

export const deleteContact = async (id) => {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('directory_contacts')
    .delete()
    .eq('id', id);

  if (error) {
    console.error("Erreur lors de la suppression du contact:", error);
    throw error;
  }
  return data;
};