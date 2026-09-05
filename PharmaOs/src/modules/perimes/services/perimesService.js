import { supabase } from '../../../shared/supabaseClient.js';
import { createTask, fetchAdminIds, fetchAssigneeIds, completeAssignmentByTaskId } from '../../tasks/services/taskService.js';

export const PERIME_FORM_DEFAULTS = {
  medicament: '',
  code: '',
  cip: '',
  lot: '',
  date_peremption: '',
  quantite: 1,
  notes: '',
};

export const PERIME_STATUS_LABELS = {
  declare: 'Déclaré',
  a_decider: 'À décider',
  valorise: 'Valorisé',
  laisser_perimer: 'Laisser périmer',
  litige: 'Litige',
  association: 'Association',
  clos: 'Clos',
};

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

function addMonthsISO(isoDate, months) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

function subMonthsISO(isoDate, months) {
  const d = new Date(`${isoDate}T12:00:00`);
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split('T')[0];
}

export function validatePerimeHorizon(datePeremption) {
  if (!datePeremption) throw new Error('Date de péremption obligatoire.');
  const today = todayISO();
  const max = addMonthsISO(today, 12);
  if (datePeremption < today) {
    throw new Error('La date de péremption ne peut pas être dans le passé.');
  }
  if (datePeremption > max) {
    throw new Error('La péremption doit être dans les 12 mois glissants.');
  }
  return true;
}

export function isWithinDecisionWindow(datePeremption, asOf = todayISO()) {
  return subMonthsISO(datePeremption, 3) <= asOf;
}

// --- Emplacements (paramètres admin) ---

export async function fetchEmplacements({ actifsOnly = false } = {}) {
  let q = supabase
    .from('perime_emplacements')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });
  if (actifsOnly) q = q.eq('actif', true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createEmplacement(label) {
  const { data, error } = await supabase
    .from('perime_emplacements')
    .insert([{ label: label.trim(), actif: true }])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateEmplacement(id, updates) {
  const { data, error } = await supabase
    .from('perime_emplacements')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteEmplacement(id) {
  const { error } = await supabase.from('perime_emplacements').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// --- Fetchers ---

export async function fetchPerimes() {
  const { data, error } = await supabase
    .from('perimes')
    .select('*')
    .order('date_peremption', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchVisiblePerimes() {
  const { data, error } = await supabase
    .from('perimes')
    .select('*')
    .gte('date_peremption', todayISO())
    .neq('status', 'clos')
    .order('date_peremption', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

/** MEA / promo / challenges valables aujourd’hui (lecture équipe). */
export async function fetchTodayActions() {
  const today = todayISO();
  const { data, error } = await supabase
    .from('perimes')
    .select('*')
    .eq('status', 'valorise')
    .gte('date_peremption', today);
  if (error) throw new Error(error.message);

  const rows = data || [];
  return {
    mise_en_avant: rows.filter((p) => (
      p.mise_en_avant
      && p.mise_en_avant_debut
      && p.mise_en_avant_fin
      && p.mise_en_avant_debut <= today
      && p.mise_en_avant_fin >= today
    )),
    promo: rows.filter((p) => (
      p.promo
      && p.promo_debut
      && p.promo_fin
      && p.promo_debut <= today
      && p.promo_fin >= today
    )),
    challenges: rows.filter((p) => {
      if (!p.challenge_actif) return false;
      if (p.challenge_fin && p.challenge_fin < today) return false;
      // challenge "en cours" dès J-3 ou dès début MEA/promo si défini, sinon dès décision
      const start = p.decision_due_at || p.mise_en_avant_debut || p.promo_debut || today;
      return start <= today;
    }),
  };
}

export function splitTracking(items) {
  const today = todayISO();
  const valorises = (items || []).filter((p) => p.status === 'valorise');

  const meaPresent = valorises.filter((p) => (
    p.mise_en_avant && p.mise_en_avant_debut && p.mise_en_avant_fin
    && p.mise_en_avant_debut <= today && p.mise_en_avant_fin >= today
  ));
  const meaFuture = valorises.filter((p) => (
    p.mise_en_avant && p.mise_en_avant_debut && p.mise_en_avant_debut > today
  ));
  const promoPresent = valorises.filter((p) => (
    p.promo && p.promo_debut && p.promo_fin
    && p.promo_debut <= today && p.promo_fin >= today
  ));
  const promoFuture = valorises.filter((p) => (
    p.promo && p.promo_debut && p.promo_debut > today
  ));
  const challengesEnRoute = valorises.filter((p) => (
    p.challenge_actif && (!p.challenge_fin || p.challenge_fin >= today)
  ));

  return { meaPresent, meaFuture, promoPresent, promoFuture, challengesEnRoute };
}

// --- Tâches ---

export async function createPerimeDecisionTask(perime, createdBy) {
  if (perime.decision_task_id) return perime.decision_task_id;
  // Déjà décidé → pas de tâche admin
  if (['valorise', 'litige', 'association', 'laisser_perimer', 'clos'].includes(perime.status)) {
    return null;
  }

  const adminIds = await fetchAdminIds();
  const assignees = adminIds.length ? adminIds : (createdBy ? [createdBy] : []);
  if (!assignees.length) return null;

  const titre = `Périmé à décider : ${perime.medicament || 'produit'}`;
  const taskId = await createTask(
    titre,
    JSON.stringify({
      type: 'perime_decision',
      perime_id: perime.id,
      medicament: perime.medicament,
      code: perime.code,
      cip: perime.cip,
      lot: perime.lot,
      date_peremption: perime.date_peremption,
      quantite: perime.quantite,
    }),
    assignees,
    createdBy || assignees[0],
  );

  const { error } = await supabase
    .from('perimes')
    .update({
      decision_task_id: taskId,
      status: 'a_decider',
      updated_at: new Date().toISOString(),
    })
    .eq('id', perime.id)
    .in('status', ['declare', 'a_decider']);
  if (error) throw new Error(error.message);
  return taskId;
}

async function createMeaExecutionTask(perime, createdBy) {
  if (perime.mea_task_id || !perime.mise_en_avant) return perime.mea_task_id || null;
  let assignees = await fetchAssigneeIds();
  if (!assignees.length && createdBy) assignees = [createdBy];
  if (!assignees.length) return null;

  const montant = perime.mise_en_avant_montant != null ? `${perime.mise_en_avant_montant} €` : null;
  const titre = `Mise en avant : ${perime.medicament}${montant ? ` (${montant})` : ''}`;
  const taskId = await createTask(
    titre,
    JSON.stringify({
      type: 'perime_mea',
      perime_id: perime.id,
      medicament: perime.medicament,
      emplacement: perime.mise_en_avant_emplacement,
      montant: perime.mise_en_avant_montant,
      message: perime.mise_en_avant_message,
      debut: perime.mise_en_avant_debut,
      fin: perime.mise_en_avant_fin,
      date_peremption: perime.date_peremption,
    }),
    assignees,
    createdBy || assignees[0],
  );
  await supabase.from('perimes').update({ mea_task_id: taskId, updated_at: new Date().toISOString() }).eq('id', perime.id);
  return taskId;
}

async function createPromoExecutionTask(perime, createdBy) {
  if (perime.promo_task_id || !perime.promo) return perime.promo_task_id || null;
  let assignees = await fetchAssigneeIds();
  if (!assignees.length && createdBy) assignees = [createdBy];
  if (!assignees.length) return null;

  const montant = perime.promo_montant != null ? `${perime.promo_montant} €` : null;
  const titre = `Promotion : ${perime.medicament}${montant ? ` (${montant})` : ''}`;
  const taskId = await createTask(
    titre,
    JSON.stringify({
      type: 'perime_promo',
      perime_id: perime.id,
      medicament: perime.medicament,
      emplacement: perime.promo_emplacement,
      montant: perime.promo_montant,
      message: perime.promo_message,
      debut: perime.promo_debut,
      fin: perime.promo_fin,
      date_peremption: perime.date_peremption,
    }),
    assignees,
    createdBy || assignees[0],
  );
  await supabase.from('perimes').update({ promo_task_id: taskId, updated_at: new Date().toISOString() }).eq('id', perime.id);
  return taskId;
}

export async function createPerimeChallengeTask(perime, createdBy) {
  if (perime.challenge_task_id || !perime.challenge_actif) return perime.challenge_task_id || null;
  let assignees = await fetchAssigneeIds();
  if (!assignees.length && createdBy) assignees = [createdBy];
  if (!assignees.length) return null;

  const titre = `Challenge périmé : ${perime.challenge_titre || perime.medicament}`;
  const taskId = await createTask(
    titre,
    JSON.stringify({
      type: 'perime_challenge',
      perime_id: perime.id,
      medicament: perime.medicament,
      challenge_titre: perime.challenge_titre,
      challenge_objectif: perime.challenge_objectif,
      challenge_fin: perime.challenge_fin,
      challenge_message: perime.challenge_message,
      date_peremption: perime.date_peremption,
    }),
    assignees,
    createdBy || assignees[0],
  );

  await supabase
    .from('perimes')
    .update({ challenge_task_id: taskId, updated_at: new Date().toISOString() })
    .eq('id', perime.id);

  return taskId;
}

/**
 * À J−3 mois : crée les tâches équipe MEA / promo / challenge
 * pour les périmés déjà valorisés (décision anticipée possible).
 */
export async function ensurePerimeExecutionTasks(createdBy) {
  const today = todayISO();
  const { data: due, error } = await supabase
    .from('perimes')
    .select('*')
    .eq('status', 'valorise')
    .lte('decision_due_at', today);
  if (error) throw new Error(error.message);

  const created = [];
  for (const row of due || []) {
    if (row.mise_en_avant && !row.mea_task_id) {
      const id = await createMeaExecutionTask(row, createdBy || row.decided_by || row.created_by);
      if (id) created.push({ type: 'mea', perimeId: row.id, taskId: id });
    }
    if (row.promo && !row.promo_task_id) {
      const id = await createPromoExecutionTask(row, createdBy || row.decided_by || row.created_by);
      if (id) created.push({ type: 'promo', perimeId: row.id, taskId: id });
    }
    if (row.challenge_actif && !row.challenge_task_id) {
      const id = await createPerimeChallengeTask(row, createdBy || row.decided_by || row.created_by);
      if (id) created.push({ type: 'challenge', perimeId: row.id, taskId: id });
    }
  }
  return created;
}

export async function insertPerime(userId, form) {
  validatePerimeHorizon(form.date_peremption);
  const decisionDue = subMonthsISO(form.date_peremption, 3);
  const needsDecisionNow = decisionDue <= todayISO();

  const payload = {
    medicament: form.medicament.trim(),
    code: form.code?.trim() || null,
    cip: form.cip?.trim() || null,
    lot: form.lot?.trim() || null,
    date_peremption: form.date_peremption,
    quantite: Number(form.quantite) || 1,
    notes: form.notes?.trim() || null,
    source: form.source || 'reception',
    status: needsDecisionNow ? 'a_decider' : 'declare',
    decision_due_at: decisionDue,
    created_by: userId,
  };

  const { data, error } = await supabase
    .from('perimes')
    .insert([payload])
    .select()
    .single();
  if (error) throw new Error(error.message);

  if (needsDecisionNow) {
    await createPerimeDecisionTask(data, userId);
  }

  return data;
}

/** Scan : déclarés sans décision à J−3 → tâche admin. */
export async function ensurePerimeDecisionTasks(createdBy) {
  const today = todayISO();
  const { data: due, error } = await supabase
    .from('perimes')
    .select('*')
    .eq('status', 'declare')
    .lte('decision_due_at', today)
    .is('decision_task_id', null);
  if (error) throw new Error(error.message);

  const created = [];
  for (const row of due || []) {
    const taskId = await createPerimeDecisionTask(row, createdBy || row.created_by);
    if (taskId) created.push({ perimeId: row.id, taskId });
  }
  return created;
}

export async function ensureAllPerimeTasks(createdBy) {
  const decision = await ensurePerimeDecisionTasks(createdBy);
  const execution = await ensurePerimeExecutionTasks(createdBy);
  return { decision, execution };
}

export async function completePerimeDecisionTask(perimeId, displayName) {
  const { data: row } = await supabase
    .from('perimes')
    .select('decision_task_id')
    .eq('id', perimeId)
    .maybeSingle();
  if (!row?.decision_task_id) return null;

  const now = new Date();
  const note = `Décision prise par ${displayName || 'Admin'} le ${now.toLocaleDateString('fr-FR')} à ${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`;
  await completeAssignmentByTaskId(row.decision_task_id, note);
  return row.decision_task_id;
}

/**
 * Décision anticipée ou à J−3.
 * Les tâches équipe MEA/promo/challenge sont créées à J−3 (ou immédiatement si déjà dû).
 */
export async function applyValorisation(id, options, userId, displayName) {
  const {
    mise_en_avant = false,
    mise_en_avant_debut = null,
    mise_en_avant_fin = null,
    mise_en_avant_emplacement = null,
    mise_en_avant_montant = null,
    mise_en_avant_message = null,
    promo = false,
    promo_debut = null,
    promo_fin = null,
    promo_emplacement = null,
    promo_montant = null,
    promo_message = null,
    challenge = null,
  } = options;

  if (!mise_en_avant && !promo) {
    throw new Error('Choisissez au moins une mise en avant ou une promotion.');
  }
  if (mise_en_avant && (!mise_en_avant_debut || !mise_en_avant_fin)) {
    throw new Error('Indiquez les dates de début et fin pour la mise en avant.');
  }
  if (mise_en_avant && !mise_en_avant_emplacement) {
    throw new Error('Indiquez l’emplacement de la mise en avant.');
  }
  if (promo && (!promo_debut || !promo_fin)) {
    throw new Error('Indiquez les dates de début et fin pour la promotion.');
  }
  if (promo && !promo_emplacement) {
    throw new Error('Indiquez l’emplacement de la promotion.');
  }

  const updates = {
    status: 'valorise',
    mise_en_avant: Boolean(mise_en_avant),
    mise_en_avant_debut: mise_en_avant ? mise_en_avant_debut : null,
    mise_en_avant_fin: mise_en_avant ? mise_en_avant_fin : null,
    mise_en_avant_emplacement: mise_en_avant ? mise_en_avant_emplacement : null,
    mise_en_avant_montant: mise_en_avant && mise_en_avant_montant !== '' && mise_en_avant_montant != null
      ? Number(mise_en_avant_montant)
      : null,
    mise_en_avant_message: mise_en_avant ? (mise_en_avant_message || null) : null,
    promo: Boolean(promo),
    promo_debut: promo ? promo_debut : null,
    promo_fin: promo ? promo_fin : null,
    promo_emplacement: promo ? promo_emplacement : null,
    promo_montant: promo && promo_montant !== '' && promo_montant != null
      ? Number(promo_montant)
      : null,
    promo_message: promo ? (promo_message || null) : null,
    challenge_actif: Boolean(challenge?.actif),
    challenge_titre: challenge?.actif ? (challenge.titre || null) : null,
    challenge_objectif: challenge?.actif ? (challenge.objectif || null) : null,
    challenge_fin: challenge?.actif ? (challenge.fin || null) : null,
    challenge_message: challenge?.actif ? (challenge.message || null) : null,
    decided_at: new Date().toISOString(),
    decided_by: userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('perimes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await completePerimeDecisionTask(id, displayName);

  // Si déjà à J−3 (ou passé), créer immédiatement les tâches équipe
  const due = data.decision_due_at || subMonthsISO(data.date_peremption, 3);
  if (due <= todayISO()) {
    if (data.mise_en_avant) await createMeaExecutionTask(data, userId);
    if (data.promo) await createPromoExecutionTask(data, userId);
    if (data.challenge_actif) await createPerimeChallengeTask(data, userId);
  }

  return data;
}

export async function applyLaisserPerimer(id, destination, userId, displayName, notes) {
  if (!['litige', 'association'].includes(destination)) {
    throw new Error('Destination invalide (litige ou association).');
  }

  const updates = {
    status: destination === 'association' ? 'association' : 'laisser_perimer',
    destination,
    decided_at: new Date().toISOString(),
    decided_by: userId,
    updated_at: new Date().toISOString(),
  };
  if (notes != null) updates.notes = notes;

  const { data, error } = await supabase
    .from('perimes')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);

  await completePerimeDecisionTask(id, displayName);
  return data;
}

export async function linkDisputeFromPerime(perime, userId) {
  const description = [
    `Litige reprise périmé — ${perime.medicament}`,
    perime.code && `Code : ${perime.code}`,
    perime.cip && `CIP : ${perime.cip}`,
    perime.lot && `Lot : ${perime.lot}`,
    `DLC : ${perime.date_peremption}`,
    `Quantité : ${perime.quantite}`,
  ].filter(Boolean).join('\n');

  const pieces = [
    perime.cip && `CIP ${perime.cip}`,
    perime.lot && `Lot ${perime.lot}`,
    perime.code && `Code ${perime.code}`,
  ].filter(Boolean).join(' — ');

  const { data: dispute, error } = await supabase
    .from('supplier_disputes')
    .insert([{
      dispute_type: 'perimes',
      description,
      pieces: pieces || null,
      perime_id: perime.id,
      statut: 'ouvert',
      created_by: userId,
    }])
    .select()
    .single();
  if (error) throw new Error(error.message);

  const { data, error: upErr } = await supabase
    .from('perimes')
    .update({
      status: 'litige',
      destination: 'litige',
      dispute_id: dispute.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', perime.id)
    .select()
    .single();
  if (upErr) throw new Error(upErr.message);

  return { perime: data, dispute };
}

export async function attachDisputeToPerime(perimeId, disputeId) {
  const { data, error } = await supabase
    .from('perimes')
    .update({
      status: 'litige',
      destination: 'litige',
      dispute_id: disputeId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', perimeId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function markAssociation(id, notes, userId, displayName) {
  return applyLaisserPerimer(id, 'association', userId, displayName, notes);
}

export async function updatePerimeStatus(id, status) {
  const { error } = await supabase
    .from('perimes')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}
