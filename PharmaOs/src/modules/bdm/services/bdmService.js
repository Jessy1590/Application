/**
 * Client BDPM (schéma Supabase `bdm`).
 * Source officielle : base-donnees-publique.medicaments.gouv.fr
 */
import { supabase } from '../../../shared/supabaseClient.js';

const bdm = () => supabase.schema('bdm');

export async function fetchBdmStats() {
  const [s, p, c, g, m, meta] = await Promise.all([
    bdm().from('specialites').select('*', { count: 'exact', head: true }),
    bdm().from('presentations').select('*', { count: 'exact', head: true }),
    bdm().from('compositions').select('*', { count: 'exact', head: true }),
    bdm().from('generiques').select('*', { count: 'exact', head: true }),
    bdm().from('molecules').select('*', { count: 'exact', head: true }),
    bdm().from('sync_meta').select('*').eq('id', 1).maybeSingle(),
  ]);
  for (const r of [s, p, c, g, m]) {
    if (r.error) throw r.error;
  }
  return {
    specialites: s.count || 0,
    presentations: p.count || 0,
    compositions: c.count || 0,
    generiques: g.count || 0,
    molecules: m.count || 0,
    sync: meta.data || null,
  };
}

export async function searchProducts(query, limit = 50) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const { data, error } = await bdm().rpc('search_products', { q, lim: limit });
  if (error) throw error;
  return data || [];
}

export async function suggestBdm(query, limit = 20) {
  const q = (query || '').trim();
  if (q.length < 2) return [];
  const { data, error } = await bdm().rpc('suggest', { q, lim: limit });
  if (error) throw error;
  return data || [];
}

export async function getByCip(cip) {
  const { data, error } = await bdm().rpc('get_by_cip', { cip: String(cip || '').trim() });
  if (error) throw error;
  return data || [];
}

/** Déclenche la Edge Function sync-bdpm (JWT utilisateur requis). */
export async function triggerBdpmSync() {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error('Session requise pour synchroniser la BDPM.');

  const { data, error } = await supabase.functions.invoke('sync-bdpm', {
    body: { triggered_by: sessionData.session.user?.id || null },
  });
  if (error) throw error;
  if (data?.ok === false) throw new Error(data.error || 'Sync BDPM échouée');
  return data;
}

export const SUGGEST_KIND_LABELS = {
  dci: 'DCI / substance',
  groupe_generique: 'Groupe générique',
  specialite: 'Nom commercial',
  produit: 'Présentation / CIP',
};
