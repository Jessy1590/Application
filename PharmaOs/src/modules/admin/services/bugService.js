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

/**
 * Agrégats bugs pour le tableau de bord (période glissante).
 */
export async function fetchBugStats({ days = 30 } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceIso = since.toISOString();

  const { data, error } = await supabase
    .from('bugs')
    .select('created_at, statut, user_name')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: true })
    .limit(3000);
  if (error) throw error;

  const rows = data || [];
  const byStatut = {};
  const byUser = {};
  const timelineMap = {};

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const [, m, day] = key.split('-');
    timelineMap[key] = { date: key, label: `${day}/${m}`, count: 0 };
  }

  rows.forEach((r) => {
    const st = r.statut || 'nouveau';
    byStatut[st] = (byStatut[st] || 0) + 1;
    const name = r.user_name || 'Inconnu';
    byUser[name] = (byUser[name] || 0) + 1;
    const key = String(r.created_at || '').slice(0, 10);
    if (timelineMap[key]) timelineMap[key].count += 1;
  });

  const toList = (obj, labels = {}) => Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name: labels[name] || name, count, id: name }));

  return {
    days,
    total: rows.length,
    byStatut: toList(byStatut, BUG_STATUT_LABELS),
    byUser: toList(byUser).slice(0, 8),
    timeline: Object.values(timelineMap),
    open: rows.filter((r) => r.statut === 'nouveau' || r.statut === 'en_cours').length,
  };
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
