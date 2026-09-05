import { supabase } from './supabaseClient.js';

/**
 * Enregistre un événement de toggle de la Taskbar.
 * @param {string} userId
 * @param {'login' | 'expand' | 'collapse'} action
 */
export async function logTaskbarToggle(userId, action) {
  return supabase.from('taskbar_logs').insert({
    user_id: userId,
    action,
  });
}
