import { supabase } from '../../../shared/supabaseClient.js';
import { logEvent } from '../../../shared/logService.js';

export const BUG_STATUTS = ['nouveau', 'en_cours', 'modifié', 'impossible'];

export const BUG_STATUT_LABELS = {
  nouveau: 'Nouveau',
  en_cours: 'En cours',
  modifié: 'Modifié',
  impossible: 'Impossible',
};

export async function createBug({ userId, userName, information }) {
  const info = String(information || '').trim();
  if (!info) {
    const err = new Error('empty');
    err.code = 'empty';
    throw err;
  }
  if (info.length > 20000) {
    const err = new Error('too-long');
    err.code = 'too-long';
    throw err;
  }

  const { data, error } = await supabase
    .from('bugs')
    .insert({
      user_id: userId,
      user_name: userName || 'Inconnu',
      information: info,
      statut: 'nouveau',
    })
    .select('id, created_at')
    .single();
  if (error) throw error;

  logEvent({
    category: 'bug',
    action: 'submit',
    entity: 'bugs',
    entityId: data.id,
    message: 'Signalement bug',
    details: { preview: info.slice(0, 240) },
    flush: true,
  });

  return data;
}

export async function fetchBugs({ statut = 'all' } = {}) {
  let q = supabase.from('bugs').select('*').order('created_at', { ascending: false });
  if (statut !== 'all') q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function updateBugStatut(id, statut, { userId, userName }) {
  if (!BUG_STATUTS.includes(statut)) throw new Error('Statut invalide');
  const { data, error } = await supabase
    .from('bugs')
    .update({
      statut,
      updated_by: userId || null,
      updated_by_name: userName || null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  logEvent({
    category: 'bug',
    action: 'update_statut',
    entity: 'bugs',
    entityId: id,
    message: `Statut bug → ${statut}`,
    details: { statut },
    flush: true,
  });

  return data;
}
