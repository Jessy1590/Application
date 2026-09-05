import { supabase } from '../../../shared/supabaseClient.js';

export const DISPUTE_TYPES = [
  { value: 'commande', label: 'Commande' },
  { value: 'facturation', label: 'Facturation' },
  { value: 'perimes', label: 'Périmés' },
  { value: 'challenge', label: 'Challenge' },
  { value: 'retrait_lot', label: 'Retrait de lot' },
  { value: 'autre', label: 'Autre' },
];

export const DISPUTE_FORM_DEFAULTS = {
  dispute_type: 'commande',
  fournisseur_id: '',
  fournisseur_nom: '',
  montant: '',
  description: '',
  pieces: '',
};

export function disputeFormHasContent(form) {
  return Boolean(
    (form.description && form.description.trim())
    || (form.fournisseur_nom && form.fournisseur_nom.trim())
    || form.fournisseur_id
    || form.montant
    || (form.pieces && form.pieces.trim()),
  );
}

export function disputeRowToForm(row) {
  return {
    dispute_type: row.dispute_type || 'commande',
    fournisseur_id: row.fournisseur_id || '',
    fournisseur_nom: row.fournisseur_nom || '',
    montant: row.montant ?? '',
    description: row.description || '',
    pieces: row.pieces || '',
  };
}

function buildInsertPayload(userId, payload, statut) {
  return {
    dispute_type: payload.dispute_type,
    fournisseur_id: payload.fournisseur_id || null,
    fournisseur_nom: payload.fournisseur_nom || null,
    montant: payload.montant !== '' && payload.montant != null ? Number(payload.montant) : null,
    description: payload.description || null,
    pieces: payload.pieces || null,
    lot_alert_id: payload.lot_alert_id || null,
    stock_error_id: payload.stock_error_id || null,
    perime_id: payload.perime_id || null,
    statut,
    created_by: userId,
  };
}

export async function createDispute(userId, payload, statut = 'ouvert') {
  const { data, error } = await supabase
    .from('supplier_disputes')
    .insert([buildInsertPayload(userId, payload, statut)])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateDispute(id, payload, statut) {
  const updates = {
    dispute_type: payload.dispute_type,
    fournisseur_id: payload.fournisseur_id || null,
    fournisseur_nom: payload.fournisseur_nom || null,
    montant: payload.montant !== '' && payload.montant != null ? Number(payload.montant) : null,
    description: payload.description || null,
    pieces: payload.pieces || null,
    updated_at: new Date().toISOString(),
  };
  if (statut) {
    updates.statut = statut;
    updates.closed_at = statut === 'clos' ? new Date().toISOString() : null;
  }
  const { data, error } = await supabase
    .from('supplier_disputes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function fetchMyDisputes(userId) {
  const { data, error } = await supabase
    .from('supplier_disputes')
    .select('*')
    .eq('created_by', userId)
    .neq('statut', 'annule')
    .order('created_at', { ascending: false })
    .limit(30);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchPendingDisputes(userId) {
  const { data, error } = await supabase
    .from('supplier_disputes')
    .select('*')
    .eq('created_by', userId)
    .eq('statut', 'en_attente')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function cancelDispute(id) {
  return updateDisputeStatus(id, 'annule');
}

export async function createPendingDisputeTask(row, createdBy) {
  const { createTask } = await import('../../tasks/services/taskService.js');
  const titre = `Litige à finaliser : ${row.fournisseur_nom || row.dispute_type || 'brouillon'}`;
  return createTask(
    titre,
    JSON.stringify({
      type: 'litige_brouillon',
      dispute_id: row.id,
      fournisseur_nom: row.fournisseur_nom,
      dispute_type: row.dispute_type,
    }),
    [createdBy],
    createdBy,
  );
}

async function findPendingDisputeTask(disputeId) {
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, created_at, description')
    .order('created_at', { ascending: false })
    .limit(200);
  return (tasks || []).find((t) => {
    try {
      const d = JSON.parse(t.description || '{}');
      return d.type === 'litige_brouillon' && d.dispute_id === disputeId;
    } catch {
      return false;
    }
  }) || null;
}

export async function completePendingDisputeTask(disputeId, displayName) {
  const { completeAssignmentByTaskId } = await import('../../tasks/services/taskService.js');
  const task = await findPendingDisputeTask(disputeId);
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

export async function cancelPendingDisputeTask(disputeId, displayName) {
  const { completeAssignmentByTaskId } = await import('../../tasks/services/taskService.js');
  const task = await findPendingDisputeTask(disputeId);
  if (!task) return null;
  const now = new Date();
  const note = `Annulé par ${displayName || 'Utilisateur'} le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`;
  await completeAssignmentByTaskId(task.id, note);
  return task.id;
}

export async function fetchCommercialPartners() {
  const { data, error } = await supabase
    .from('directory_contacts')
    .select('id, nom, prenom')
    .eq('type', 'commercial_partner')
    .order('nom');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchDisputes({ statut } = {}) {
  let q = supabase
    .from('supplier_disputes')
    .select('*')
    .order('created_at', { ascending: false });
  if (statut) q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function updateDisputeStatus(id, statut) {
  const updates = {
    statut,
    updated_at: new Date().toISOString(),
    closed_at: statut === 'clos' ? new Date().toISOString() : null,
  };
  const { data, error } = await supabase
    .from('supplier_disputes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function createDisputeFromLotAlert(userId, alert, returnLocation) {
  const { data, error } = await supabase
    .from('supplier_disputes')
    .insert([{
      dispute_type: 'retrait_lot',
      fournisseur_nom: alert.laboratoire || 'Laboratoire',
      description: `Renvoi produits — alerte ${alert.alert_number} — ${alert.medicament} lot ${alert.lot}. Lieu: ${returnLocation || 'à préciser'}`,
      lot_alert_id: alert.id,
      pieces: returnLocation || null,
      statut: 'ouvert',
      created_by: userId,
    }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}
