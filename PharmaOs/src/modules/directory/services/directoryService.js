import { supabase } from '../../../shared/supabaseClient.js';

/**
 * Service unifié annuaire (comptoir + dashboard).
 * Table : PharmaOs.directory_contacts
 * type : health_professional | commercial_partner
 * partenaire_type (si commercial_partner) :
 *   laboratoire | grossiste | plateforme | generiqueur | autre
 */

export const PARTENAIRE_TYPES = [
  { value: 'laboratoire', label: 'Laboratoire' },
  { value: 'grossiste', label: 'Grossiste' },
  { value: 'plateforme', label: 'Plateforme' },
  { value: 'generiqueur', label: 'Génériqueur' },
  { value: 'autre', label: 'Autres' },
];

export function labelPartenaireType(partenaireType, partenaireTypeAutre = '') {
  if (!partenaireType) return null;
  if (partenaireType === 'autre') {
    const custom = (partenaireTypeAutre || '').trim();
    return custom || 'Autres';
  }
  return PARTENAIRE_TYPES.find((t) => t.value === partenaireType)?.label || partenaireType;
}

/** Normalise le payload avant insert/update (CHECK SQL + champs conditionnels). */
export function sanitizeContactPayload(contactData) {
  const { id: _id, created_at: _ca, ...raw } = contactData || {};
  const payload = { ...raw };

  const emptyToNull = (v) => (v === '' || v === undefined ? null : v);

  if (payload.type === 'health_professional') {
    payload.partenaire_type = null;
    payload.partenaire_type_autre = null;
  } else if (payload.type === 'commercial_partner') {
    payload.partenaire_type = emptyToNull(payload.partenaire_type);
    if (payload.partenaire_type !== 'autre') {
      payload.partenaire_type_autre = null;
    } else {
      payload.partenaire_type_autre = emptyToNull(payload.partenaire_type_autre);
    }
  }

  return payload;
}

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
    .select('id, nom, prenom, type, telephone, telephone_prive, partenaire_type, partenaire_type_autre')
    .eq('id', id)
    .maybeSingle();
  return { data: data || null, error };
}

export async function insertContact(contactData) {
  const { data, error } = await supabase
    .from('directory_contacts')
    .insert([sanitizeContactPayload(contactData)])
    .select();
  if (error) throw error;
  return data;
}

export async function updateContact(id, contactData) {
  const dataToUpdate = sanitizeContactPayload(contactData);
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
