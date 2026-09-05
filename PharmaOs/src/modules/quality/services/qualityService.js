import { supabase } from '../../../shared/supabaseClient.js';

export const QUALITY_TYPES = [
  { value: 'erreur_delivrance', label: 'Erreur de délivrance' },
  { value: 'presqu_erreur', label: "Presqu'erreur" },
  { value: 'reclamation_patient', label: 'Réclamation patient' },
  { value: 'probleme_fournisseur', label: 'Problème fournisseur' },
];

export const SEVERITY_LEVELS = [
  { value: 'mineure', label: 'Mineure' },
  { value: 'majeure', label: 'Majeure' },
  { value: 'critique', label: 'Critique' },
];

export const QUALITY_FORM_DEFAULTS = {
  type: 'presqu_erreur',
  severity: 'mineure',
  description: '',
  immediateAction: '',
  location: '',
  medicament: '',
};

export function qualityFormHasContent(form) {
  return Boolean(
    (form.description && form.description.trim())
    || (form.immediateAction && form.immediateAction.trim())
    || (form.location && form.location.trim())
    || (form.medicament && form.medicament.trim()),
  );
}

export function qualityRowToForm(row) {
  const data = row.data || {};
  return {
    type: row.type || 'presqu_erreur',
    severity: row.severity || 'mineure',
    description: data.description || '',
    immediateAction: data.immediate_action || '',
    location: data.location || '',
    medicament: data.medicament || '',
  };
}

function buildQualityInsert(userId, payload, status) {
  const { type, description, severity, immediateAction, location, medicament } = payload;
  return {
    user_id: userId,
    type,
    status,
    severity: severity || 'mineure',
    data: {
      description: description || '',
      immediate_action: immediateAction || '',
      location: location || '',
      medicament: medicament || '',
    },
  };
}

export async function insertQualityEvent(userId, payload, status = 'ouvert') {
  return supabase.from('quality_events').insert(buildQualityInsert(userId, payload, status));
}

export async function insertQualityEventReturning(userId, payload, status = 'ouvert') {
  const { data, error } = await supabase
    .from('quality_events')
    .insert(buildQualityInsert(userId, payload, status))
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateQualityEventFull(id, payload, status) {
  const updates = {
    type: payload.type,
    severity: payload.severity || 'mineure',
    data: {
      description: payload.description || '',
      immediate_action: payload.immediateAction || '',
      location: payload.location || '',
      medicament: payload.medicament || '',
    },
  };
  if (status) updates.status = status;
  const { data, error } = await supabase
    .from('quality_events')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchMyQualityEvents(userId, limit = 10) {
  return supabase
    .from('quality_events')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'annule')
    .order('created_at', { ascending: false })
    .limit(limit);
}

export async function fetchPendingQualityEvents(userId) {
  const { data, error } = await supabase
    .from('quality_events')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'en_attente')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function cancelQualityEvent(id) {
  return updateQualityEvent(id, { status: 'annule' });
}

export async function createPendingQualityTask(row, createdBy) {
  const { createTask } = await import('../../tasks/services/taskService.js');
  const titre = `NC à finaliser : ${row.type || 'brouillon'}`;
  return createTask(
    titre,
    JSON.stringify({
      type: 'nc_brouillon',
      quality_id: row.id,
      event_type: row.type,
      severity: row.severity,
      description: row.data?.description,
    }),
    [createdBy],
    createdBy,
  );
}

async function findPendingQualityTask(qualityId) {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, created_at, description')
    .order('created_at', { ascending: false })
    .limit(200);
  return (tasks || []).find((t) => {
    try {
      const d = JSON.parse(t.description || '{}');
      return d.type === 'nc_brouillon' && d.quality_id === qualityId;
    } catch {
      return false;
    }
  }) || null;
}

export async function completePendingQualityTask(qualityId, displayName) {
  const { completeAssignmentByTaskId } = await import('../../tasks/services/taskService.js');
  const task = await findPendingQualityTask(qualityId);
  if (!task) return null;
  const started = new Date(task.created_at);
  const now = new Date();
  const mins = Math.max(1, Math.round((now - started) / 60000));
  const dateStr = now.toLocaleDateString('fr-FR');
  const timeStr = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const note = `Validé par ${displayName || 'Utilisateur'} le ${dateStr} à ${timeStr} soit ${mins} min après l'avoir commencé.`;
  await completeAssignmentByTaskId(task.id, note);
  return { taskId: task.id, note, mins };
}

export async function cancelPendingQualityTask(qualityId, displayName) {
  const { completeAssignmentByTaskId } = await import('../../tasks/services/taskService.js');
  const task = await findPendingQualityTask(qualityId);
  if (!task) return null;
  const now = new Date();
  const note = `Annulé par ${displayName || 'Utilisateur'} le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`;
  await completeAssignmentByTaskId(task.id, note);
  return task.id;
}

async function attachAuthorNames(rows) {
  const userIds = [...new Set(rows.map((e) => e.user_id).filter(Boolean))];
  let profilesMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .schema('portail')
      .from('profiles')
      .select('id, display_name')
      .in('id', userIds);
    profiles?.forEach((p) => { profilesMap[p.id] = p.display_name; });
  }
  return rows.map((e) => ({
    ...e,
    author_name: profilesMap[e.user_id] || 'Inconnu',
  }));
}

export async function fetchQualityEvents() {
  const { data, error } = await supabase
    .from('quality_events')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return attachAuthorNames(data || []);
}

export async function updateQualityEvent(id, updates) {
  const { data, error } = await supabase
    .from('quality_events')
    .update(updates)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data;
}

export async function fetchQualityStats() {
  const events = await fetchQualityEvents();
  const open = events.filter((e) => e.status === 'ouvert' || e.status === 'en_analyse').length;
  const closed = events.filter((e) => e.status === 'cloture').length;
  const critical = events.filter((e) => e.severity === 'critique' && e.status !== 'cloture').length;
  const capaPending = events.filter((e) => e.capa_status === 'en_attente' || e.capa_status === 'en_cours').length;
  const draftPending = events.filter((e) => e.status === 'en_attente').length;
  return { total: events.length, open, closed, critical, capaPending, draftPending };
}
