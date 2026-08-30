import { supabase } from './supabaseClient';

export async function fetchQualityEvents() {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('quality_events')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const userIds = [...new Set(data.map(e => e.user_id))];
  let profilesMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .schema('portail')
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    profiles?.forEach(p => { profilesMap[p.id] = p.display_name; });
  }

  return data.map(e => ({
    ...e,
    author_name: profilesMap[e.user_id] || 'Inconnu',
  }));
}

export async function updateQualityEvent(id, updates) {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('quality_events')
    .update(updates)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data;
}

export async function fetchQualityStats() {
  const events = await fetchQualityEvents();
  const open = events.filter(e => e.status === 'ouvert' || e.status === 'en_analyse').length;
  const closed = events.filter(e => e.status === 'cloture').length;
  const critical = events.filter(e => e.severity === 'critique' && e.status !== 'cloture').length;
  const capaPending = events.filter(e => e.capa_status === 'en_attente' || e.capa_status === 'en_cours').length;
  return { total: events.length, open, closed, critical, capaPending };
}
