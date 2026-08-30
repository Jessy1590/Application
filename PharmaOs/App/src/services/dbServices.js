import { supabase } from './supabaseClient.js';

/**
 * Toutes les requêtes ci-dessous passent par le client `supabase` configuré
 * dans supabaseClient.js avec { db: { schema: 'PharmaOs' } } (règle stricte
 * du CLAUDE.md) : .from('table') cible donc PharmaOs.table, jamais public.table.
 *
 * Chaque fonction retourne { data, error } tel que renvoyé par Supabase,
 * pour laisser l'appelant décider comment gérer l'échec (aucun throw ici).
 */

/**
 * Enregistre un evenement de toggle de la Taskbar (barre du haut).
 * @param {string} userId - uuid de l'utilisateur (auth.users.id)
 * @param {'collapse' | 'expand'} action
 * Table attendue : PharmaOs.taskbar_logs (user_id uuid, action text, created_at timestamptz default now())
 */
export async function logTaskbarToggle(userId, action) {
  return supabase.from('taskbar_logs').insert({
    user_id: userId,
    action,
  });
}

/**
 * @deprecated Utiliser qualityService.insertQualityEvent
 */
export async function insertQualityEvent(userId, type, data) {
  return supabase.from('quality_events').insert({
    user_id: userId,
    type,
    status: 'ouvert',
    severity: data?.severity || 'mineure',
    data,
  });
}

/**
 * Prepare l'insertion d'un evenement Conseil (module /modules/Advice, Phase 2).
 * @param {string} userId - uuid de l'utilisateur
 * @param {string} type - type de conseil (ex: 'orientation', 'vente_associee')
 * @param {string} status - statut de l'evenement (ex: 'pending', 'done', 'cancelled')
 * @param {object} data - payload libre (stocke en jsonb)
 * Table attendue : PharmaOs.advice_events (user_id uuid, type text, status text, data jsonb, created_at timestamptz default now())
 */
export async function insertAdviceEvent(userId, type, status, data) {
  return supabase.from('advice_events').insert({
    user_id: userId,
    type,
    status,
    data,
  });
}
