import { fetchMyOpenAssignments } from '../../tasks/services/taskService.js';
import { supabase } from '../../../shared/supabaseClient.js';

/**
 * Agrège les éléments « À traiter » + saisies corrigeables pour l’utilisateur courant.
 * Mes saisies (règle B) : créateur + created_at < 72h + non clôturé/annulé
 * + (updated_by null ou = user_id). Aligné RLS migrations 048 / 050.
 */

const EDITABLE_WINDOW_MS = 72 * 60 * 60 * 1000;

/** @param {string|null|undefined} createdAt */
export function isWithinEditableWindow(createdAt) {
  if (!createdAt) return false;
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < EDITABLE_WINDOW_MS;
}

/**
 * @param {{ updated_by?: string|null }} row
 * @param {string} userId
 */
export function isUnmodifiedByOthers(row, userId) {
  return row?.updated_by == null || row.updated_by === userId;
}

const STUPEFIANT_CLOSED = new Set([
  'ras', 'ras_recompte', 'corrige_compris', 'corrige_sans', 'erreur_reception',
]);

/** Colonne propriétaire selon le kind. */
export function ownerIdOf(kind, row) {
  if (!row) return null;
  if (kind === 'cash') return row.author_id;
  if (['call', 'ip', 'quality', 'stock', 'psl_movement'].includes(kind)) return row.user_id;
  return row.created_by ?? row.user_id ?? null;
}

/**
 * Filtre client aligné sur les policies own UPDATE (règle B).
 * @param {string} kind
 * @param {object} row
 * @param {string} userId
 */
export function isEditableSaisie(kind, row, userId) {
  if (!row || !userId) return false;
  const owner = ownerIdOf(kind, row);
  if (owner && owner !== userId) return false;
  if (!isWithinEditableWindow(row.created_at)) return false;
  if (!isUnmodifiedByOthers(row, userId)) return false;

  if (kind === 'call') {
    return !['cloture', 'annule'].includes(row.statut_traitement);
  }
  if (kind === 'ip') {
    return !['Cloturee', 'Annulee'].includes(row.statut_ip);
  }
  if (kind === 'quality') {
    return !['cloture', 'annule'].includes(row.status);
  }
  if (kind === 'stock') {
    return ['ouvert', 'pending', 'en_attente'].includes(row.status);
  }
  if (kind === 'dispute') {
    return !['clos', 'annule'].includes(row.statut);
  }
  if (kind === 'perime') {
    return row.status !== 'clos';
  }
  if (kind === 'magistral') {
    return !['cloture', 'dispense', 'refuse'].includes(row.statut);
  }
  if (kind === 'location_dossier') {
    return !['cloture', 'annule'].includes(row.statut);
  }
  if (kind === 'location_contact') {
    return !['resolu', 'annule'].includes(row.statut);
  }
  if (kind === 'hr_absence' || kind === 'hr_schedule') {
    return row.statut === 'en_attente';
  }
  if (kind === 'cash') {
    return true;
  }
  if (kind === 'stupefiant') {
    return !STUPEFIANT_CLOSED.has(row.status);
  }
  if (kind === 'psl_unit') {
    return row.statut === 'en_stock';
  }
  if (kind === 'psl_movement') {
    return true;
  }
  if (kind === 'document') {
    return true;
  }
  if (kind === 'conseil') {
    return row.is_active !== false;
  }
  return false;
}

function sortByCreatedDesc(a, b) {
  return new Date(b.created_at || 0) - new Date(a.created_at || 0);
}

function sinceIso() {
  return new Date(Date.now() - EDITABLE_WINDOW_MS).toISOString();
}

async function fetchOpenAssignmentsWithPeers(userId) {
  const { data, error } = await supabase
    .from('task_assignments')
    .select('id, task_id, statut, tasks(titre, description, task_assignments(id, statut, user_id))')
    .eq('user_id', userId)
    .eq('statut', 'en_cours');
  return { data: data || [], error };
}

function filterEditable(kind, rows, userId) {
  return (rows || []).filter((r) => isEditableSaisie(kind, r, userId)).sort(sortByCreatedDesc);
}

/**
 * Agrège À traiter + toutes les saisies corrigeables (règle B).
 * `editable` contient une clé par domaine ; `fetchMyEditableSaisies` expose uniquement editable.
 */
export async function fetchInboxItems(userId) {
  if (!userId) {
    return emptyInboxResult();
  }

  const since = sinceIso();

  const [
    assignmentsRes,
    callsRes,
    qualityRes,
    stockRes,
    ipsRes,
    disputesRes,
    perimesRes,
    magistralRes,
    locDossiersRes,
    locContactsRes,
    hrAbsRes,
    hrSchedRes,
    cashRes,
    stupRes,
    pslUnitsRes,
    pslMovRes,
    docsRes,
    conseilsRes,
  ] = await Promise.all([
    fetchOpenAssignmentsWithPeers(userId).catch(() => fetchMyOpenAssignments(userId)),
    supabase
      .from('call_logs')
      .select('id, user_id, type, contact_nom, numero, motif, statut_traitement, notes_appel, created_at, updated_at, updated_by')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('quality_events')
      .select('id, user_id, type, severity, status, data, created_at, updated_at, updated_by')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('stock_errors')
      .select('id, user_id, medicament, cip, status, description, quantite_theorique, quantite_constatee, created_at, updated_at, updated_by')
      .eq('user_id', userId)
      .gte('created_at', since)
      .in('status', ['ouvert', 'pending', 'en_attente'])
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('act_ip_logs')
      .select('id, user_id, patient_initiales, medicament_en_cause, probleme_identifie, statut_ip, created_at, updated_at, updated_by')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('supplier_disputes')
      .select('id, created_by, dispute_type, fournisseur_id, fournisseur_nom, montant, statut, description, pieces, created_at, updated_at, updated_by')
      .eq('created_by', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('perimes')
      .select('id, created_by, medicament, code, cip, lot, date_peremption, quantite, notes, status, created_at, updated_at, updated_by')
      .eq('created_by', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('magistral_orders')
      .select('id, created_by, formule, patient_initiales, quantite, forme, statut, notes, patient_phone, patient_email, created_at, updated_at, updated_by')
      .eq('created_by', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('location_dossiers')
      .select('id, created_by, code_op, statut, date_debut, notes, caution, created_at, updated_at, updated_by')
      .eq('created_by', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('location_contacts')
      .select('id, created_by, dossier_id, motif, statut, commentaire, resultat, canal, planned_at, created_at, updated_at, updated_by')
      .eq('created_by', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('hr_absences')
      .select('id, user_id, created_by, absence_type, date_debut, date_fin, motif, statut, created_at, updated_at, updated_by')
      .eq('created_by', userId)
      .eq('statut', 'en_attente')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('hr_schedule_changes')
      .select('id, user_id, created_by, change_type, motif, date_debut, heure_debut, date_fin, heure_fin, commentaire, statut, created_at, updated_at, updated_by')
      .eq('created_by', userId)
      .eq('statut', 'en_attente')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('cash_closures')
      .select('id, author_id, closure_date, fond_reel, fond_logiciel, montant_cb, argent_lieu_sur, nb_cheques, montant_cheques, garde, sortie_particuliere, sortie_montant, sortie_motif, notes, created_at, updated_at, updated_by')
      .eq('author_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('stupefiant_releves')
      .select('id, created_by, medicament, cip, produit_hors_bdm, nb_boites_recues, status, notes, bl_numero, armoire_boites, armoire_unites, stock_lgo_boites, stock_lgo_unites, created_at, updated_at, updated_by')
      .eq('created_by', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('psl_units')
      .select('id, created_by, denomination, code_produit, numero_unite, lot, date_peremption, fournisseur, statut, created_at, updated_at, updated_by')
      .eq('created_by', userId)
      .eq('statut', 'en_stock')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('psl_movements')
      .select('id, user_id, movement_type, denomination, patient_nom, patient_prenom, patient_initiales, notes, quantite, created_at, updated_at, updated_by')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('documents')
      .select('id, created_by, title, category, content, is_active, created_at, updated_at, updated_by')
      .eq('created_by', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('conseils')
      .select('id, created_by, target_type, label_snapshot, message, is_active, cis, cip13, created_at, updated_at, updated_by')
      .eq('created_by', userId)
      .eq('is_active', true)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const today = new Date().toISOString().split('T')[0];
  const tasks = (assignmentsRes.data || []).map((a) => {
    let meta = {};
    try { meta = JSON.parse(a.tasks?.description || '{}'); } catch { /* ignore */ }
    const peers = (a.tasks?.task_assignments || []).filter((p) => p.statut === 'en_cours');
    const assigneeCount = peers.length || 1;
    const date = meta.date || null;
    return {
      id: a.id,
      taskId: a.task_id,
      titre: a.tasks?.titre || 'Tâche',
      date,
      type: meta.type || null,
      dueToday: !date || date <= today,
      future: !!(date && date > today),
      multi: assigneeCount > 1,
      solo: assigneeCount <= 1,
      assigneeCount,
    };
  });

  const calls = callsRes.data || [];
  const quality = qualityRes.data || [];
  const stock = stockRes.data || [];
  const ips = ipsRes.data || [];

  const editable = {
    calls: filterEditable('call', calls, userId),
    ips: filterEditable('ip', ips, userId),
    quality: filterEditable('quality', quality, userId),
    stock: filterEditable('stock', stock, userId),
    disputes: filterEditable('dispute', disputesRes.data, userId),
    perimes: filterEditable('perime', perimesRes.data, userId),
    magistral: filterEditable('magistral', magistralRes.data, userId),
    location_dossiers: filterEditable('location_dossier', locDossiersRes.data, userId),
    location_contacts: filterEditable('location_contact', locContactsRes.data, userId),
    hr_absences: filterEditable('hr_absence', hrAbsRes.data, userId),
    hr_schedules: filterEditable('hr_schedule', hrSchedRes.data, userId),
    cash: filterEditable('cash', cashRes.data, userId),
    stupefiants: filterEditable('stupefiant', stupRes.data, userId),
    psl_units: filterEditable('psl_unit', pslUnitsRes.data, userId),
    psl_movements: filterEditable('psl_movement', pslMovRes.data, userId),
    documents: filterEditable('document', docsRes.data, userId),
    conseils: filterEditable('conseil', conseilsRes.data, userId),
  };

  return {
    tasks,
    calls: calls.filter((c) => ['a_rappeler', 'attente_pharmacien', 'brouillon', 'en_attente'].includes(c.statut_traitement)),
    quality: quality.filter((q) => q.status === 'en_attente' || q.status === 'ouvert'),
    stock: stock.filter((s) => ['ouvert', 'pending', 'en_attente'].includes(s.status)),
    ips: ips.filter((i) => i.statut_ip === 'En attente' || i.statut_ip === 'Déclaré'),
    editable,
    errors: {
      calls: callsRes.error?.message,
      quality: qualityRes.error?.message,
      stock: stockRes.error?.message,
      ips: ipsRes.error?.message,
      tasks: assignmentsRes.error?.message,
      disputes: disputesRes.error?.message,
      perimes: perimesRes.error?.message,
      magistral: magistralRes.error?.message,
      location_dossiers: locDossiersRes.error?.message,
      location_contacts: locContactsRes.error?.message,
      hr_absences: hrAbsRes.error?.message,
      hr_schedules: hrSchedRes.error?.message,
      cash: cashRes.error?.message,
      stupefiants: stupRes.error?.message,
      psl_units: pslUnitsRes.error?.message,
      psl_movements: pslMovRes.error?.message,
      documents: docsRes.error?.message,
      conseils: conseilsRes.error?.message,
    },
  };
}

function emptyInboxResult() {
  return {
    tasks: [],
    calls: [],
    quality: [],
    stock: [],
    ips: [],
    editable: {
      calls: [], ips: [], quality: [], stock: [],
      disputes: [], perimes: [], magistral: [],
      location_dossiers: [], location_contacts: [],
      hr_absences: [], hr_schedules: [], cash: [],
      stupefiants: [], psl_units: [], psl_movements: [],
      documents: [], conseils: [],
    },
  };
}

/** Uniquement les saisies corrigeables (sans file À traiter). */
export async function fetchMyEditableSaisies(userId) {
  const full = await fetchInboxItems(userId);
  return { editable: full.editable, errors: full.errors };
}

async function updateRow(table, id, updates) {
  const { data, error } = await supabase
    .from(table)
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateMyCall(id, updates) {
  return updateRow('call_logs', id, updates);
}

export async function updateMyIp(id, updates) {
  return updateRow('act_ip_logs', id, updates);
}

export async function updateMyQuality(id, updates) {
  return updateRow('quality_events', id, updates);
}

export async function updateMyStock(id, updates) {
  return updateRow('stock_errors', id, updates);
}

export async function updateMyDispute(id, updates) {
  return updateRow('supplier_disputes', id, updates);
}

export async function updateMyPerime(id, updates) {
  return updateRow('perimes', id, updates);
}

export async function updateMyMagistral(id, updates) {
  return updateRow('magistral_orders', id, updates);
}

export async function updateMyLocationDossier(id, updates) {
  return updateRow('location_dossiers', id, updates);
}

export async function updateMyLocationContact(id, updates) {
  return updateRow('location_contacts', id, updates);
}

export async function updateMyHrAbsence(id, updates) {
  return updateRow('hr_absences', id, updates);
}

export async function updateMyHrSchedule(id, updates) {
  return updateRow('hr_schedule_changes', id, updates);
}

export async function updateMyCash(id, updates) {
  return updateRow('cash_closures', id, updates);
}

export async function updateMyStupefiant(id, updates) {
  return updateRow('stupefiant_releves', id, updates);
}

export async function updateMyPslUnit(id, updates) {
  return updateRow('psl_units', id, updates);
}

export async function updateMyPslMovement(id, updates) {
  return updateRow('psl_movements', id, updates);
}

export async function updateMyDocument(id, updates) {
  return updateRow('documents', id, updates);
}

export async function updateMyConseil(id, updates) {
  return updateRow('conseils', id, updates);
}
