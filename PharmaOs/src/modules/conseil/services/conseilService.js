import { supabase } from '../../../shared/supabaseClient.js';
import { STAFF_ROLES } from '../../../core/roles.js';

const pharma = () => supabase.schema('PharmaOs');

/** Conseils actifs pour le cache taskbar. */
export async function fetchActiveConseils() {
  const { data, error } = await pharma()
    .from('conseils')
    .select('id, target_type, cis, cip13, code_substance, label_snapshot, message, is_active, updated_at')
    .eq('is_active', true)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Liste complète (dashboard). */
export async function fetchConseils({ includeInactive = true } = {}) {
  let q = pharma()
    .from('conseils')
    .select('*')
    .order('updated_at', { ascending: false });
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * @param {object} payload
 * @param {string} userId
 */
export async function createConseil(payload, userId) {
  const row = {
    target_type: payload.target_type,
    cis: payload.cis || null,
    cip13: payload.cip13 || null,
    code_substance: payload.code_substance || null,
    label_snapshot: (payload.label_snapshot || '').trim(),
    message: (payload.message || '').trim(),
    is_active: payload.is_active !== false,
    created_by: userId || null,
    updated_at: new Date().toISOString(),
  };
  if (!row.message) throw new Error('Message du conseil requis.');
  if (!row.label_snapshot) throw new Error('Cible BDPM requise (libellé).');
  if (!['substance', 'specialite', 'presentation'].includes(row.target_type)) {
    throw new Error('Type de cible invalide.');
  }

  const { data, error } = await pharma().from('conseils').insert(row).select().single();
  if (error) throw error;
  return data;
}

export async function updateConseil(id, patch) {
  const row = {
    ...patch,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await pharma()
    .from('conseils')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function setConseilActive(id, isActive) {
  return updateConseil(id, { is_active: !!isActive });
}

/**
 * Traçabilité accepte / refuse (taskbar).
 * @param {{ conseil_id: string, user_id: string, status: 'accepte'|'refuse', matched_text?: string, source?: string }} event
 */
export async function insertConseilEvent(event) {
  if (!event?.conseil_id || !event?.user_id) throw new Error('conseil_id et user_id requis.');
  if (!['accepte', 'refuse'].includes(event.status)) throw new Error('Statut invalide.');

  const row = {
    conseil_id: event.conseil_id,
    user_id: event.user_id,
    status: event.status,
    matched_text: event.matched_text ? String(event.matched_text).slice(0, 500) : null,
    source: event.source || null,
  };

  const { data, error } = await pharma().from('conseil_events').insert(row).select().single();
  if (error) throw error;
  return data;
}

/**
 * Historique événements (admin voit tout via RLS ; équipe = own).
 */
export async function fetchConseilEvents({
  status = null,
  userId = null,
  since = null,
  until = null,
  limit = 200,
} = {}) {
  let q = pharma()
    .from('conseil_events')
    .select('id, conseil_id, user_id, status, matched_text, source, created_at, conseils(id, label_snapshot, message, target_type)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) q = q.eq('status', status);
  if (userId) q = q.eq('user_id', userId);
  if (since) q = q.gte('created_at', since);
  if (until) q = q.lte('created_at', until);

  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/** Stats home : acceptés / refusés / taux (ventes associées N/A). */
export async function fetchConseilStats({ days = 30 } = {}) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await pharma()
    .from('conseil_events')
    .select('id, status')
    .gte('created_at', since.toISOString());

  if (error) throw error;

  const rows = data || [];
  const accepte = rows.filter((r) => r.status === 'accepte').length;
  const refuse = rows.filter((r) => r.status === 'refuse').length;
  const total = accepte + refuse;
  const taux = total > 0 ? Math.round((accepte / total) * 100) : 0;

  return {
    days,
    accepte,
    refuse,
    total,
    conseilsDonnes: accepte,
    tauxAcceptation: taux,
    ventesAssociees: null,
  };
}

export async function fetchTeamProfiles() {
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, display_name, role')
    .in('role', STAFF_ROLES)
    .order('display_name');
  if (error) throw error;
  return data || [];
}
