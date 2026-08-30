import { supabase } from './supabaseClient';
import { createDisputeFromLotAlert } from './disputeService';

export async function fetchLotAlerts() {
  const { data, error } = await supabase
    .from('lot_alerts')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchAcksForAlert(alertId) {
  const { data, error } = await supabase
    .from('lot_alert_acks')
    .select('*')
    .eq('alert_id', alertId);
  if (error) throw error;
  return data || [];
}

/**
 * Déclare une alerte lot enrichie + tâche équipe + litige auto si renvoi.
 */
export async function createLotAlert(payload, userId) {
  const { data: profiles, error: profError } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'équipe']);
  if (profError) throw profError;

  const assignees = profiles?.map((p) => p.id) || [];
  const details = {
    type: 'retrait_lot',
    alert_number: payload.alert_number,
    laboratoire: payload.laboratoire,
    medicament: payload.medicament,
    lot: payload.lot,
    motif: payload.motif,
    requires_return: !!payload.requires_return,
    urgent: true,
    date: new Date().toISOString().split('T')[0],
  };

  const titre = `RETRAIT LOT — ${payload.medicament} (Lot ${payload.lot}) [${payload.alert_number}]`;

  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert([{ titre, description: JSON.stringify(details), created_by: userId }])
    .select()
    .single();
  if (taskError) throw taskError;

  if (assignees.length > 0) {
    const { error: assignError } = await supabase.from('task_assignments').insert(
      assignees.map((uid) => ({ task_id: task.id, user_id: uid, statut: 'en_cours' })),
    );
    if (assignError) throw assignError;
  }

  const { data: alert, error: alertError } = await supabase
    .from('lot_alerts')
    .insert([{
      alert_number: payload.alert_number,
      declarant_id: userId,
      medicament: payload.medicament,
      lot: payload.lot,
      laboratoire: payload.laboratoire || null,
      motif: payload.motif || null,
      source: payload.source || 'manuel',
      external_ref: payload.external_ref || null,
      requires_return: !!payload.requires_return,
      return_location: payload.return_location || null,
      task_id: task.id,
      status: 'ouvert',
    }])
    .select()
    .single();
  if (alertError) throw alertError;

  let dispute = null;
  if (payload.requires_return) {
    dispute = await createDisputeFromLotAlert(userId, alert, payload.return_location);
  }

  return { alert, task, dispute };
}

export async function updateLotAlertSteps(id, { steps_done, reception_validated }) {
  const updates = {
    steps_done,
    updated_at: new Date().toISOString(),
  };
  if (reception_validated) {
    updates.reception_validated_at = new Date().toISOString();
    updates.status = 'en_cours';
  }
  const { data, error } = await supabase
    .from('lot_alerts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function closeLotAlert(id) {
  const { data, error } = await supabase
    .from('lot_alerts')
    .update({ status: 'clos', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** @deprecated préférer createLotAlert — conservé pour compat */
export async function createRetraitLotTask(form, userId) {
  return createLotAlert({
    alert_number: form.alert_number || `MANUEL-${Date.now()}`,
    laboratoire: form.laboratoire,
    medicament: form.medicament,
    lot: form.lot,
    motif: form.motif,
    requires_return: false,
  }, userId).then((r) => r.task);
}
