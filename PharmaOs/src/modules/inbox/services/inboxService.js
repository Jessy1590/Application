import { fetchMyOpenAssignments } from '../../tasks/services/taskService.js';
import { supabase } from '../../../shared/supabaseClient.js';

/**
 * Agrège les éléments « À traiter » + saisies corrigeables pour l’utilisateur courant.
 */

export async function fetchInboxItems(userId) {
  if (!userId) {
    return { tasks: [], calls: [], quality: [], stock: [], ips: [], editable: { calls: [], ips: [], quality: [], stock: [] } };
  }

  const [
    assignmentsRes,
    callsRes,
    qualityRes,
    stockRes,
    ipsRes,
  ] = await Promise.all([
    fetchMyOpenAssignments(userId),
    supabase
      .from('call_logs')
      .select('id, type, contact_nom, numero, motif, statut_traitement, notes_appel, created_at')
      .eq('user_id', userId)
      .in('statut_traitement', ['a_rappeler', 'attente_pharmacien', 'resolu', 'brouillon', 'en_attente'])
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('quality_events')
      .select('id, type, severity, status, data, created_at')
      .eq('user_id', userId)
      .neq('status', 'cloture')
      .neq('status', 'annule')
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('stock_errors')
      .select('id, medicament, cip, status, description, quantite_theorique, quantite_constatee, created_at')
      .eq('user_id', userId)
      .in('status', ['ouvert', 'pending', 'en_attente'])
      .order('created_at', { ascending: false })
      .limit(30),
    supabase
      .from('act_ip_logs')
      .select('id, patient_initiales, medicament, probleme, statut_ip, created_at')
      .eq('user_id', userId)
      .neq('statut_ip', 'Cloturee')
      .neq('statut_ip', 'Annulee')
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  const today = new Date().toISOString().split('T')[0];
  const tasks = (assignmentsRes.data || [])
    .map((a) => {
      let meta = {};
      try { meta = JSON.parse(a.tasks?.description || '{}'); } catch { /* ignore */ }
      return {
        id: a.id,
        taskId: a.task_id,
        titre: a.tasks?.titre || 'Tâche',
        date: meta.date || null,
        type: meta.type || null,
        dueToday: !meta.date || meta.date <= today,
      };
    })
    .filter((t) => t.dueToday);

  const calls = callsRes.data || [];
  const quality = qualityRes.data || [];
  const stock = stockRes.data || [];
  const ips = ipsRes.data || [];

  const editableCalls = calls.filter((c) => !['cloture', 'annule'].includes(c.statut_traitement));
  const editableIps = ips.filter((i) => !['Cloturee', 'Annulee'].includes(i.statut_ip));
  const editableQuality = quality.filter((q) => !['cloture', 'annule'].includes(q.status));
  const editableStock = stock;

  return {
    tasks,
    calls: calls.filter((c) => ['a_rappeler', 'attente_pharmacien', 'brouillon', 'en_attente'].includes(c.statut_traitement)),
    quality: quality.filter((q) => q.status === 'en_attente' || q.status === 'ouvert'),
    stock: editableStock,
    ips: ips.filter((i) => i.statut_ip === 'En attente' || i.statut_ip === 'Déclaré'),
    editable: {
      calls: editableCalls,
      ips: editableIps,
      quality: editableQuality,
      stock: editableStock,
    },
    errors: {
      calls: callsRes.error?.message,
      quality: qualityRes.error?.message,
      stock: stockRes.error?.message,
      ips: ipsRes.error?.message,
      tasks: assignmentsRes.error?.message,
    },
  };
}

export async function updateMyCall(id, updates) {
  const { data, error } = await supabase
    .from('call_logs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateMyIp(id, updates) {
  const { data, error } = await supabase
    .from('act_ip_logs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateMyQuality(id, updates) {
  const { data, error } = await supabase
    .from('quality_events')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateMyStock(id, updates) {
  const { data, error } = await supabase
    .from('stock_errors')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
