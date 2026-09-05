import { supabase } from '../../../shared/supabaseClient.js';
import {
  fetchHealthProfessionals,
  updateContactSwitchRupture,
} from '../../directory/services/directoryService.js';

/**
 * Service unifié Act-IP (comptoir + dashboard).
 * Table : PharmaOs.act_ip_logs
 * statut_ip : Cloturee | En attente
 */

export { fetchHealthProfessionals };

export async function fetchRecentIpLogs(limit = 10) {
  const { data, error } = await supabase
    .from('act_ip_logs')
    .select('*, directory_contacts(nom, prenom)')
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data: data || [], error };
}

export async function insertIpLog(payload) {
  return supabase.from('act_ip_logs').insert([payload]);
}

export async function appendDoctorSwitchNote(medecinId, doctors, noteText) {
  const selectedDoc = doctors.find((d) => d.id === medecinId);
  const currentNotes = selectedDoc?.switch_rupture ? `${selectedDoc.switch_rupture}\n` : '';
  return updateContactSwitchRupture(medecinId, `${currentNotes}${noteText}`);
}

export async function fetchIps() {
  const { data, error } = await supabase
    .from('act_ip_logs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function updateIp(id, updates) {
  const { data, error } = await supabase
    .from('act_ip_logs')
    .update(updates)
    .eq('id', id)
    .select();
  if (error) throw error;
  return data;
}

export async function fetchIpsWithProfiles() {
  const { data: ips, error: ipError } = await supabase
    .from('act_ip_logs')
    .select('*')
    .order('created_at', { ascending: false });
  if (ipError) throw ipError;

  const { data: profiles, error: profError } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, display_name, role')
    .in('role', ['admin', 'équipe']);
  if (profError) throw profError;

  return (ips || []).map((ip) => ({
    ...ip,
    profile: profiles.find((p) => p.id === ip.user_id) || { display_name: 'Inconnu' },
  }));
}

export async function insertIpLogReturning(payload) {
  const { data, error } = await supabase.from('act_ip_logs').insert([payload]).select().single();
  if (error) throw error;
  return data;
}

export async function createPendingIpTask(ipRow, createdBy) {
  const { createTask } = await import('../../tasks/services/taskService.js');
  const titre = `IP à finaliser : ${ipRow.patient_initiales || ipRow.medicament_en_cause || 'brouillon'}`;
  return createTask(
    titre,
    JSON.stringify({
      type: 'ip_brouillon',
      ip_id: ipRow.id,
      patient_initiales: ipRow.patient_initiales,
      medicament: ipRow.medicament_en_cause,
    }),
    [createdBy],
    createdBy,
  );
}

export async function fetchPendingIps(userId = null) {
  let query = supabase
    .from('act_ip_logs')
    .select('*, directory_contacts(nom, prenom)')
    .eq('statut_ip', 'En attente')
    .order('created_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  return { data: data || [], error };
}

export async function cancelIp(ipId) {
  return updateIp(ipId, { statut_ip: 'Annulee' });
}

/** Clôture la tâche liée à une IP brouillon avec note de durée. */
export async function completePendingIpTask(ipId, displayName) {
  const { completeAssignmentByTaskId } = await import('../../tasks/services/taskService.js');
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, created_at, description')
    .order('created_at', { ascending: false })
    .limit(200);

  const task = (tasks || []).find((t) => {
    try {
      const d = JSON.parse(t.description || '{}');
      return d.type === 'ip_brouillon' && d.ip_id === ipId;
    } catch {
      return false;
    }
  });
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

/** Annule la tâche liée (commentaire d'annulation). */
export async function cancelPendingIpTask(ipId, displayName) {
  const { completeAssignmentByTaskId } = await import('../../tasks/services/taskService.js');
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, description')
    .order('created_at', { ascending: false })
    .limit(200);

  const task = (tasks || []).find((t) => {
    try {
      const d = JSON.parse(t.description || '{}');
      return d.type === 'ip_brouillon' && d.ip_id === ipId;
    } catch {
      return false;
    }
  });
  if (!task) return null;
  const now = new Date();
  const note = `Annulé par ${displayName || 'Utilisateur'} le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`;
  await completeAssignmentByTaskId(task.id, note);
  return task.id;
}

export function ipFormHasContent(form) {
  return Boolean(
    (form.patient_initiales && form.patient_initiales.trim())
    || (form.medicament_en_cause && form.medicament_en_cause.trim())
    || (form.commentaires && form.commentaires.trim())
    || form.medecin_id
    || (form.medecin_nom_libre && form.medecin_nom_libre.trim()),
  );
}

const IP_DEFAULT_PROBLEME = '1- Contre-indication/Non-conformité';
const IP_DEFAULT_INTERVENTION = '1. Adaptation posologique';
const IP_DEFAULT_DEVENIR = '1. Acceptée par le prescripteur';

export function ipRowToForm(row) {
  return {
    patient_initiales: row.patient_initiales || '',
    patient_age: row.patient_age ?? '',
    patient_sexe: row.patient_sexe || 'M',
    medecin_id: row.medecin_id || '',
    medecin_nom_libre: row.medecin_id ? '' : (row.medecin_nom || ''),
    medicament_en_cause: row.medicament_en_cause || '',
    probleme_identifie: row.probleme_identifie || IP_DEFAULT_PROBLEME,
    type_intervention: row.type_intervention || IP_DEFAULT_INTERVENTION,
    avis_prescripteur: row.avis_prescripteur || 'Non contacte',
    devenir_intervention: row.devenir_intervention || IP_DEFAULT_DEVENIR,
    mode_transmission: row.mode_transmission || 'Appel téléphonique',
    commentaires: row.commentaires || '',
  };
}

export function buildIpPayload(form, userId, doctors, statutIp) {
  let medecinFinalNom = form.medecin_nom_libre;
  if (form.medecin_id) {
    const selectedDoc = doctors.find((d) => d.id === form.medecin_id);
    if (selectedDoc) medecinFinalNom = `Dr ${selectedDoc.nom} ${selectedDoc.prenom}`.trim();
  }
  return {
    user_id: userId,
    patient_initiales: form.patient_initiales,
    patient_age: parseInt(form.patient_age, 10) || null,
    patient_sexe: form.patient_sexe,
    medecin_id: form.medecin_id || null,
    medecin_nom: medecinFinalNom,
    medicament_en_cause: form.medicament_en_cause,
    probleme_identifie: form.probleme_identifie,
    type_intervention: form.type_intervention,
    avis_prescripteur: form.avis_prescripteur,
    devenir_intervention: form.devenir_intervention,
    mode_transmission: form.mode_transmission,
    statut_ip: statutIp,
    commentaires: form.commentaires,
  };
}
