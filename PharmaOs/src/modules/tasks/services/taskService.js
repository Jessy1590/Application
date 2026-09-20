import { supabase } from '../../../shared/supabaseClient.js';
import { STAFF_ROLES, canonicalRole } from '../../../core/roles.js';
import { getTaskCategory, parseTaskDetails } from '../shared/taskDisplay.js';
import {
  TASK_RULE_CATEGORIES,
  TASK_MODULES,
  taskCategoriesForModule,
  getTaskRuleCategory,
} from '../shared/taskCatalog.js';

/**
 * Service unifié tâches (comptoir + dashboard).
 * Tables : PharmaOs.tasks, PharmaOs.task_assignments ; profils : portail.profiles.
 * Assignation via matrice task_role_rules (resolveAssigneeIds / ensureTaskEscalations).
 */

export {
  TASK_RULE_CATEGORIES,
  TASK_MODULES,
  taskCategoriesForModule,
  getTaskRuleCategory,
};

function rolesForMode(rules, mode) {
  return (rules || [])
    .filter((r) => r.mode === mode)
    .map((r) => canonicalRole(r.role));
}

async function fetchProfilesByCanonicalRoles(roles) {
  const wanted = new Set((roles || []).map(canonicalRole));
  if (!wanted.size) return [];
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, role')
    .in('role', STAFF_ROLES);
  if (error) throw error;
  return (data || []).filter((p) => wanted.has(canonicalRole(p.role)));
}

/**
 * Résout les destinataires immédiats pour une catégorie de tâche.
 * @param {string} category — id matrice (ex. appel_attente_pharmacien, commande)
 */
export async function resolveAssigneeIds(category) {
  if (!category) return [];
  const { data: rules, error } = await supabase
    .from('task_role_rules')
    .select('role, mode, delay_hours')
    .eq('category', category);
  if (error) throw error;

  const immediateRoles = rolesForMode(rules, 'immediate');
  if (!immediateRoles.length) return [];

  const profiles = await fetchProfilesByCanonicalRoles(immediateRoles);
  return profiles.map((p) => p.id);
}

/**
 * Escalade after_delay : RPC SECURITY DEFINER (bypass RLS pour scanner).
 * Appelé au load TasksManager / Taskbar / comptoir tâches.
 */
export async function ensureTaskEscalations() {
  const { data, error } = await supabase.rpc('ensure_task_escalations');
  if (error) {
    /* Fallback client si RPC absente (migration non appliquée) */
    return ensureTaskEscalationsClient();
  }
  return { escalated: data || 0 };
}

async function ensureTaskEscalationsClient() {
  const { data: rules, error: rulesErr } = await supabase
    .from('task_role_rules')
    .select('category, role, mode, delay_hours')
    .eq('mode', 'after_delay');
  if (rulesErr) throw rulesErr;
  if (!rules?.length) return { escalated: 0 };

  const byCategory = {};
  for (const r of rules) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  const { data: openTasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('id, titre, description, created_at, task_assignments(id, user_id, statut)')
    .order('created_at', { ascending: false })
    .limit(300);
  if (tasksErr) throw tasksErr;

  let escalated = 0;
  const now = Date.now();

  for (const task of openTasks || []) {
    const open = (task.task_assignments || []).some((a) => a.statut === 'en_cours');
    if (!open) continue;

    const details = parseTaskDetails(task.description);
    const category = details?.type || getTaskCategory(task.description, task.titre);
    const delayRules = byCategory[category];
    if (!delayRules?.length) continue;

    const created = new Date(task.created_at).getTime();
    const existing = new Set((task.task_assignments || []).map((a) => a.user_id));

    for (const rule of delayRules) {
      const hours = Number(rule.delay_hours) || 0;
      if (hours <= 0) continue;
      if (now < created + hours * 3600 * 1000) continue;

      const profiles = await fetchProfilesByCanonicalRoles([rule.role]);
      const toAdd = profiles.map((p) => p.id).filter((id) => !existing.has(id));
      if (!toAdd.length) continue;

      const { error: insErr } = await supabase.from('task_assignments').insert(
        toAdd.map((user_id) => ({
          task_id: task.id,
          user_id,
          statut: 'en_cours',
        })),
      );
      if (insErr) continue;
      toAdd.forEach((id) => existing.add(id));
      escalated += toAdd.length;
    }
  }

  return { escalated };
}

/** @deprecated Utiliser resolveAssigneeIds(category). */
export async function fetchAdminIds() {
  return resolveAssigneeIds('appel_attente_pharmacien');
}

/** @deprecated Utiliser resolveAssigneeIds('commande') ou catégorie dédiée. */
export async function fetchAssigneeIds() {
  return resolveAssigneeIds('commande');
}

export async function fetchTeamProfiles() {
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, display_name')
    .in('role', STAFF_ROLES);
  if (error) throw error;
  return data || [];
}

export async function fetchMyOpenAssignments(userId) {
  const { data, error } = await supabase
    .from('task_assignments')
    .select('id, task_id, statut, tasks(titre, description)')
    .eq('user_id', userId)
    .eq('statut', 'en_cours');
  return { data: data || [], error };
}

export async function updateTaskDescription(taskId, description) {
  return supabase.from('tasks').update({ description }).eq('id', taskId);
}

/**
 * Clôture toutes les assignations d'une tâche (comportement App comptoir).
 */
export async function completeAssignmentByTaskId(taskId, commentaire) {
  return supabase
    .from('task_assignments')
    .update({
      statut: 'terminee',
      commentaire,
      completed_at: new Date().toISOString(),
    })
    .eq('task_id', taskId);
}

function enrichTasks(tasks, profiles) {
  return (tasks || []).map((task) => {
    const isCompleted = (task.task_assignments || []).some((a) => a.statut === 'terminee');
    return {
      ...task,
      statutGlobal: isCompleted ? 'terminee' : 'en_cours',
      task_assignments: (task.task_assignments || []).map((a) => ({
        ...a,
        profiles: {
          display_name: profiles?.find((p) => p.id === a.user_id)?.display_name || 'Inconnu',
        },
      })),
    };
  });
}

export async function fetchTasks() {
  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*, task_assignments(*)')
    .order('created_at', { ascending: false });
  if (tasksError) throw tasksError;

  const { data: profiles } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, display_name');

  return enrichTasks(tasks, profiles);
}

/** Tâches où l’utilisateur est assigné (vue non-admin). */
export async function fetchMyTasks(userId) {
  if (!userId) return [];
  const { data: assignments, error: aErr } = await supabase
    .from('task_assignments')
    .select('task_id')
    .eq('user_id', userId);
  if (aErr) throw aErr;
  const ids = [...new Set((assignments || []).map((a) => a.task_id).filter(Boolean))];
  if (!ids.length) return [];

  const { data: tasks, error: tasksError } = await supabase
    .from('tasks')
    .select('*, task_assignments(*)')
    .in('id', ids)
    .order('created_at', { ascending: false });
  if (tasksError) throw tasksError;

  const { data: profiles } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, display_name');

  return enrichTasks(tasks, profiles);
}

/** Statuts de complétion pour une liste d'ids de tâches (au moins une assignation terminée). */
export async function fetchTasksCompletionMap(taskIds) {
  const ids = [...new Set((taskIds || []).filter(Boolean))];
  if (!ids.length) return {};

  const { data, error } = await supabase
    .from('task_assignments')
    .select('task_id, statut')
    .in('task_id', ids);
  if (error) throw error;

  const map = {};
  ids.forEach((id) => { map[id] = false; });
  (data || []).forEach((a) => {
    if (a.statut === 'terminee') map[a.task_id] = true;
  });
  return map;
}

export async function createTask(titre, description, userIds, createdBy) {
  const { data: task, error: taskError } = await supabase
    .from('tasks')
    .insert([{ titre, description, created_by: createdBy }])
    .select()
    .single();
  if (taskError) throw taskError;

  if (userIds?.length) {
    const assignments = userIds.map((userId) => ({
      task_id: task.id,
      user_id: userId,
      statut: 'en_cours',
    }));
    const { error: assignError } = await supabase.from('task_assignments').insert(assignments);
    if (assignError) throw assignError;
  }

  return task.id;
}

/**
 * Crée une tâche en résolvant les assignés via la matrice (catégorie).
 * Les IDs explicites (extraIds) sont toujours ajoutés (ex. créateur pour brouillon).
 */
export async function createTaskForCategory(category, titre, description, createdBy, extraIds = []) {
  const fromMatrix = await resolveAssigneeIds(category);
  const userIds = [...new Set([...(fromMatrix || []), ...(extraIds || [])].filter(Boolean))];
  if (!userIds.length && createdBy) userIds.push(createdBy);
  return createTask(titre, description, userIds, createdBy);
}

/**
 * Recherche une tâche ouverte récente dont details matche le prédicat.
 * @param {(details: object, task: object) => boolean} matchFn
 */
export async function findOpenTask(matchFn, { limit = 250 } = {}) {
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, titre, description, created_at, task_assignments(id, statut)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (tasks || []).find((t) => {
    const open = (t.task_assignments || []).some((a) => a.statut === 'en_cours');
    if (!open) return false;
    try {
      const details = parseTaskDetails(t.description);
      return matchFn(details, t);
    } catch {
      return false;
    }
  }) || null;
}

/**
 * Crée une tâche catégorie si aucune ouverte ne matche déjà (évite les doublons).
 * `details` doit contenir `type` (= category) + une clé métier stable.
 */
export async function ensureCategoryTask(category, titre, details, createdBy, {
  extraIds = [],
  matchKey,
  matchValue,
} = {}) {
  const key = matchKey || Object.keys(details).find((k) => k.endsWith('_id')) || null;
  const value = matchValue ?? (key ? details[key] : null);
  if (key && value != null) {
    const existing = await findOpenTask(
      (d) => d.type === category && d[key] === value,
    );
    if (existing) return existing.id;
  }
  const payload = { ...details, type: category };
  return createTaskForCategory(
    category,
    titre,
    JSON.stringify(payload),
    createdBy,
    extraIds,
  );
}

/** Clôture les tâches ouvertes d’une catégorie + clé métier. */
export async function completeCategoryTasks(category, matchKey, matchValue, commentaire = 'Clos automatiquement') {
  if (!category || !matchKey || matchValue == null) return 0;
  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, description, task_assignments(statut)')
    .order('created_at', { ascending: false })
    .limit(250);
  if (error) throw error;
  let n = 0;
  for (const t of tasks || []) {
    const open = (t.task_assignments || []).some((a) => a.statut === 'en_cours');
    if (!open) continue;
    const d = parseTaskDetails(t.description);
    if (d.type !== category || d[matchKey] !== matchValue) continue;
    await completeAssignmentByTaskId(t.id, commentaire);
    n += 1;
  }
  return n;
}

export async function completeTaskGlobal(taskId, commentaire, timeSeconds, completedBy) {
  const { error } = await supabase
    .from('task_assignments')
    .update({
      statut: 'terminee',
      completed_at: new Date(),
      completion_time_seconds: timeSeconds,
      commentaire: `${commentaire} (Validé par ${completedBy})`,
    })
    .eq('task_id', taskId);
  if (error) throw error;
}

export async function uncompleteTaskGlobal(taskId) {
  const { error } = await supabase
    .from('task_assignments')
    .update({
      statut: 'en_cours',
      completed_at: null,
      completion_time_seconds: null,
      commentaire: null,
    })
    .eq('task_id', taskId);
  if (error) throw error;
}

export async function updateTask(taskId, titre, description) {
  const { error } = await supabase.from('tasks').update({ titre, description }).eq('id', taskId);
  if (error) throw error;
}

/**
 * Création comptoir commande/facturation + événements agenda liés.
 * @param {'order'|'billing'} type
 */
export async function createComptoirQuickAction(type, form, userId) {
  const isOrder = type === 'order';
  const dbType = isOrder ? 'commande_med' : 'facturation';
  const category = isOrder ? 'commande' : 'facturation';
  const groupId = crypto.randomUUID();
  const assignees = await resolveAssigneeIds(category);

  const baseDetails = {
    type: category,
    nom: form.nom.toUpperCase(),
    prenom: form.prenom.toUpperCase(),
    dob: form.dob,
    commentaire: form.commentaire,
    groupId,
  };

  const eventsToInsert = [];

  if (isOrder) {
    baseDetails.medicament = form.medicament_ou_facture;
    baseDetails.cip = form.cip;
    baseDetails.recurrence_semaines = form.recurrence_semaines.toString();
    const reps = parseInt(form.repetitions, 10);
    const weeks = parseInt(form.recurrence_semaines, 10);

    for (let i = 0; i < reps; i++) {
      const eventDate = new Date(form.date);
      eventDate.setDate(eventDate.getDate() + i * weeks * 7);
      const isoDate = eventDate.toISOString();
      const displayDate = eventDate.toLocaleDateString('fr-FR');
      const titreTache = `Commande : ${baseDetails.medicament} (${i + 1}/${reps}) - Pour le ${displayDate}`;
      const detailsJson = {
        ...baseDetails,
        type: 'commande',
        seriesIndex: i + 1,
        totalSeries: reps,
        date: isoDate.split('T')[0],
      };

      const taskId = await createTask(titreTache, JSON.stringify(detailsJson), assignees, userId);
      eventsToInsert.push({
        type: dbType,
        date_evenement: isoDate,
        details: { ...detailsJson, taskId },
      });
    }
  } else {
    baseDetails.facture = form.medicament_ou_facture;
    baseDetails.date = form.date;
    const titreTache = `Facturation : ${baseDetails.facture || 'En attente'}`;
    const taskId = await createTask(titreTache, JSON.stringify(baseDetails), assignees, userId);
    eventsToInsert.push({
      type: dbType,
      date_evenement: form.date,
      details: { ...baseDetails, taskId },
    });
  }

  const { error: agendaError } = await supabase.from('agenda_events').insert(eventsToInsert);
  if (agendaError) throw new Error(`Erreur Agenda: ${agendaError.message}`);
}
