import { supabase } from './supabaseClient.js';
import { logEvent } from './logService.js';

/**
 * Enregistre un événement de toggle de la Taskbar.
 * Double écriture volontaire :
 * 1) `app_logs` via logEvent (journal admin unifié)
 * 2) `taskbar_logs` (historique login/expand/collapse)
 * @param {string} userId
 * @param {'login' | 'expand' | 'collapse'} action
 */
export async function logTaskbarToggle(userId, action) {
  logEvent({
    category: 'ui',
    action: `taskbar_${action}`,
    entity: 'taskbar',
    message: `Taskbar ${action}`,
    surface: 'taskbar',
  });
  return supabase.from('taskbar_logs').insert({
    user_id: userId,
    action,
  });
}
