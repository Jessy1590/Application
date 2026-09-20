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

/**
 * Agrégats pour graphiques (échantillon large, colonnes légères).
 * @returns {{
 *   total: number,
 *   byLevel: { name: string, count: number }[],
 *   byCategory: { name: string, count: number }[],
 *   byEntity: { name: string, count: number }[],
 *   timeline: { label: string, total: number, info: number, warn: number, error: number }[],
 *   successVsError: { name: string, count: number }[],
 * }}
 */
export async function fetchAppLogStats({ sinceHours = 48 } = {}) {
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString();
  const { data, error } = await supabase
    .from('app_logs')
    .select('created_at, category, action, level, entity, source')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
    .limit(5000);
  if (error) throw error;
  return aggregateLogStats(data || [], sinceHours);
}

export function aggregateLogStats(rows, sinceHours = 48) {
  const levelMap = { debug: 0, info: 0, warn: 0, error: 0 };
  const catMap = new Map();
  const entityMap = new Map();
  const bucketMap = new Map();

  const useHours = sinceHours <= 48;
  const bucketMs = useHours ? 3600 * 1000 : 24 * 3600 * 1000;

  const pad = (n) => String(n).padStart(2, '0');
  const bucketKey = (iso) => {
    const d = new Date(iso);
    if (useHours) {
      return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}h`;
    }
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  };
  const bucketSortKey = (iso) => {
    const d = new Date(iso);
    if (useHours) {
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}`;
    }
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  let ok = 0;
  let bad = 0;

  for (const r of rows) {
    const lvl = r.level || 'info';
    if (levelMap[lvl] != null) levelMap[lvl] += 1;
    else levelMap.info += 1;

    const cat = r.category || 'autre';
    catMap.set(cat, (catMap.get(cat) || 0) + 1);

    let ent = r.entity || (r.source === 'trigger' ? 'données' : 'ui');
    // PharmaOs.table → table courte
    if (ent.includes('.')) ent = ent.split('.').pop();
    entityMap.set(ent, (entityMap.get(ent) || 0) + 1);

    if (lvl === 'error' || lvl === 'warn' || r.action === 'send_failed') bad += 1;
    else ok += 1;

    if (!r.created_at) continue;
    const label = bucketKey(r.created_at);
    const sort = bucketSortKey(r.created_at);
    if (!bucketMap.has(sort)) {
      bucketMap.set(sort, { label, sort, total: 0, info: 0, warn: 0, error: 0 });
    }
    const b = bucketMap.get(sort);
    b.total += 1;
    if (lvl === 'error') b.error += 1;
    else if (lvl === 'warn') b.warn += 1;
    else b.info += 1;
  }

  const byLevel = Object.entries(levelMap)
    .filter(([, c]) => c > 0)
    .map(([name, count]) => ({ name, count }));

  const byCategory = [...catMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);

  const byEntity = [...entityMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const timeline = [...bucketMap.values()]
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .map(({ label, total, info, warn, error }) => ({ label, total, info, warn, error }));

  // Remplir buckets vides pour lisibilité si peu de points
  void bucketMs;

  return {
    total: rows.length,
    byLevel,
    byCategory,
    byEntity,
    timeline,
    successVsError: [
      { name: 'OK / info', count: ok },
      { name: 'Warn / erreur', count: bad },
    ].filter((x) => x.count > 0),
  };
}
