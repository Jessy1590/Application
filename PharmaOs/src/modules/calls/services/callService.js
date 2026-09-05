import { supabase } from '../../../shared/supabaseClient.js';
import { createTask, fetchAdminIds } from '../../tasks/services/taskService.js';

/**
 * Table : PharmaOs.call_logs
 * type : recu | envoye  (legacy : in | out | missed)
 * motif : intervention_pharmaceutique | commande_labo | reclamation_patient | reception_du | litige_fournisseur | autre
 * statut_traitement : resolu | a_rappeler | attente_pharmacien | cloture | brouillon | annule
 *   brouillon = saisie mise en attente (comme IP)
 *   cloture = pharmacien (dashboard) uniquement
 */

export const CALL_TYPES = [
  { value: 'recu', label: 'Appel reçu' },
  { value: 'envoye', label: 'Appel envoyé' },
];

export const CALL_MOTIFS = [
  { value: 'intervention_pharmaceutique', label: 'Intervention pharmaceutique' },
  { value: 'commande_labo', label: 'Commande labo' },
  { value: 'reclamation_patient', label: 'Réclamation patient' },
  { value: 'reception_du', label: 'Réception dû' },
  { value: 'litige_fournisseur', label: 'Litige fournisseur' },
  { value: 'autre', label: 'Autre' },
];

/** Motifs pour partenaires commerciaux (labo / grossiste). */
const MOTIFS_COMMERCIAL = ['litige_fournisseur', 'commande_labo', 'reception_du', 'autre'];

/** Motifs pour professionnels de santé. */
const MOTIFS_HEALTH_PRO = ['intervention_pharmaceutique', 'reclamation_patient', 'autre'];

/**
 * Motifs affichés selon le type de contact annuaire.
 * Sans type / saisie libre → liste complète.
 */
export function motifsForContactType(contactType) {
  if (contactType === 'commercial_partner') {
    return CALL_MOTIFS.filter((m) => MOTIFS_COMMERCIAL.includes(m.value));
  }
  if (contactType === 'health_professional') {
    return CALL_MOTIFS.filter((m) => MOTIFS_HEALTH_PRO.includes(m.value));
  }
  return CALL_MOTIFS;
}

export const CALL_STATUTS_COMPTOIR = [
  { value: 'resolu', label: 'Résolu' },
  { value: 'a_rappeler', label: 'À rappeler' },
  { value: 'attente_pharmacien', label: 'Attente pharmacien' },
];

export const CALL_STATUT_CLOTURE = { value: 'cloture', label: 'Clôturé' };

export const CALL_FORM_DEFAULTS = {
  type: 'recu',
  contact_nom: '',
  numero: '',
  contact_id: null,
  motif: 'autre',
  statut_traitement: 'resolu',
  notes_appel: '',
};

const TYPE_LABELS = {
  recu: 'Appel reçu',
  envoye: 'Appel envoyé',
  in: 'Appel reçu',
  out: 'Appel envoyé',
  missed: 'Appel reçu',
};

const MOTIF_LABELS = Object.fromEntries(CALL_MOTIFS.map((m) => [m.value, m.label]));
MOTIF_LABELS.information_medicale = 'Intervention pharmaceutique';
MOTIF_LABELS.renseignement_patient = 'Autre';

const STATUT_LABELS = {
  resolu: 'Résolu',
  a_rappeler: 'À rappeler',
  attente_pharmacien: 'Attente pharmacien',
  cloture: 'Clôturé',
  brouillon: 'En attente',
  annule: 'Annulé',
  transmis_pharmacien: 'Attente pharmacien',
  en_attente: 'Attente pharmacien',
};

export function labelCallType(value) {
  return TYPE_LABELS[value] || value || '—';
}

export function labelCallMotif(value) {
  return MOTIF_LABELS[value] || value || '—';
}

export function labelCallStatut(value) {
  return STATUT_LABELS[value] || value || '—';
}

export function isIpMotif(motif) {
  return motif === 'intervention_pharmaceutique' || motif === 'information_medicale';
}

export function isQualityMotif(motif) {
  return motif === 'reclamation_patient';
}

export function isDisputeMotif(motif) {
  return motif === 'litige_fournisseur';
}

export function callFormHasContent(form) {
  return Boolean(
    (form.numero && form.numero.trim())
    || (form.contact_nom && form.contact_nom.trim())
    || (form.notes_appel && form.notes_appel.trim())
    || form.contact_id,
  );
}

export function callRowToForm(row) {
  return {
    type: row.type || 'recu',
    contact_nom: row.contact_nom || '',
    numero: row.numero || '',
    contact_id: row.contact_id || null,
    motif: row.motif || 'autre',
    statut_traitement: row.statut_traitement === 'brouillon' || row.statut_traitement === 'annule'
      ? 'resolu'
      : (row.statut_traitement || 'resolu'),
    notes_appel: row.notes_appel || '',
    duree_secondes: row.duree_secondes || 0,
  };
}

function buildCallPayload(form, userId, statutTraitement) {
  return {
    user_id: userId,
    type: form.type || 'recu',
    contact_id: form.contact_id || null,
    contact_nom: form.contact_nom || null,
    numero: (form.numero && form.numero.trim()) || '—',
    motif: form.motif || 'autre',
    statut_traitement: statutTraitement,
    duree_secondes: parseInt(form.duree_secondes, 10) || 0,
    notes_appel: form.notes_appel || '',
  };
}

export async function fetchRecentCallLogs(limit = 10) {
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .neq('statut_traitement', 'annule')
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

export async function fetchPendingCalls(userId) {
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('statut_traitement', 'brouillon')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function insertCallLog(payload) {
  return supabase.from('call_logs').insert([payload]).select().single();
}

export async function insertCallLogReturning(payload) {
  const { data, error } = await insertCallLog(payload);
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchCallLogs() {
  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchCallLogsWithProfiles() {
  const logs = await fetchCallLogs();
  const { data: profiles, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, display_name');
  if (error) throw error;
  return logs.map((log) => ({
    ...log,
    profile: profiles?.find((p) => p.id === log.user_id) || { display_name: 'Inconnu' },
  }));
}

export async function updateCallLog(id, updates) {
  const { data, error } = await supabase
    .from('call_logs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function cancelCall(id) {
  return updateCallLog(id, { statut_traitement: 'annule' });
}

export async function createPharmacistCallTask(callRow, createdBy) {
  const adminIds = await fetchAdminIds();
  if (!adminIds.length) return null;
  const titre = `Appel — attente pharmacien : ${callRow.contact_nom || callRow.numero || 'sans contact'}`;
  return createTask(
    titre,
    JSON.stringify({
      type: 'appel_attente_pharmacien',
      call_id: callRow.id,
      contact_nom: callRow.contact_nom,
      numero: callRow.numero,
      motif: callRow.motif,
    }),
    adminIds,
    createdBy,
  );
}

export async function createPendingCallTask(row, createdBy) {
  const titre = `Appel à finaliser : ${row.contact_nom || row.numero || 'brouillon'}`;
  return createTask(
    titre,
    JSON.stringify({
      type: 'appel_brouillon',
      call_id: row.id,
      contact_nom: row.contact_nom,
      numero: row.numero,
      motif: row.motif,
    }),
    [createdBy],
    createdBy,
  );
}

async function findPendingCallTask(callId) {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, created_at, description')
    .order('created_at', { ascending: false })
    .limit(200);
  return (tasks || []).find((t) => {
    try {
      const d = JSON.parse(t.description || '{}');
      return d.type === 'appel_brouillon' && d.call_id === callId;
    } catch {
      return false;
    }
  }) || null;
}

export async function completePendingCallTask(callId, displayName) {
  const { completeAssignmentByTaskId } = await import('../../tasks/services/taskService.js');
  const task = await findPendingCallTask(callId);
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

export async function cancelPendingCallTask(callId, displayName) {
  const { completeAssignmentByTaskId } = await import('../../tasks/services/taskService.js');
  const task = await findPendingCallTask(callId);
  if (!task) return null;
  const now = new Date();
  const note = `Annulé par ${displayName || 'Utilisateur'} le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`;
  await completeAssignmentByTaskId(task.id, note);
  return task.id;
}

/**
 * Insert ou update appel + tâche admin si attente pharmacien.
 * @returns {{ data, switchToIp: boolean, switchToQuality: boolean, switchToDispute: boolean }}
 */
export async function submitCallLog(form, userId, { editingId = null, completeDraftTask = false, displayName } = {}) {
  const statut = form.statut_traitement || 'resolu';
  const payload = buildCallPayload(form, userId, statut);
  let data;
  if (editingId) {
    const { user_id, ...updates } = payload;
    data = await updateCallLog(editingId, updates);
    if (completeDraftTask) {
      await completePendingCallTask(editingId, displayName);
    }
  } else {
    data = await insertCallLogReturning(payload);
  }

  if (statut === 'attente_pharmacien') {
    await createPharmacistCallTask(data, userId);
  }

  return {
    data,
    switchToIp: isIpMotif(form.motif),
    switchToQuality: isQualityMotif(form.motif),
    switchToDispute: isDisputeMotif(form.motif),
  };
}

export async function saveCallPending(form, userId, editingId = null) {
  const payload = buildCallPayload(form, userId, 'brouillon');
  if (editingId) {
    const { user_id, ...updates } = payload;
    return updateCallLog(editingId, updates);
  }
  const row = await insertCallLogReturning(payload);
  await createPendingCallTask(row, userId);
  return row;
}

export { buildCallPayload };
