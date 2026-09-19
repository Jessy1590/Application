import { supabase } from '../../../shared/supabaseClient.js';

export async function fetchAppLogs({
  level = 'all',
  category = 'all',
  search = '',
  sinceHours = 48,
  limit = 200,
  offset = 0,
} = {}) {
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
  let q = supabase
    .from('app_logs')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (level !== 'all') q = q.eq('level', level);
  if (category !== 'all') q = q.eq('category', category);
  if (search.trim()) {
    const s = search.trim().replace(/[%_,()]/g, ' ').trim();
    if (s) {
      q = q.or(`message.ilike.%${s}%,action.ilike.%${s}%,user_name.ilike.%${s}%,entity.ilike.%${s}%`);
    }
  }

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function fetchLogCategories() {
  const { data, error } = await supabase
    .from('app_logs')
    .select('category')
    .limit(500);
  if (error) throw error;
  return [...new Set((data || []).map((r) => r.category).filter(Boolean))].sort();
}
