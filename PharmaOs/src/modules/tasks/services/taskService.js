import { supabase } from '../../../shared/supabaseClient.js';

/**
 * Service unifié tâches (comptoir + dashboard).
 * Tables : PharmaOs.tasks, PharmaOs.task_assignments ; profils : portail.profiles.
 */

export async function fetchTeamProfiles() {
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, display_name')
    .in('role', ['admin', 'équipe']);
  if (error) throw error;
  return data || [];
}

export async function fetchAdminIds() {
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id')
    .eq('role', 'admin');
  if (error) throw error;
  return (data || []).map((p) => p.id);
}

/** Profils pour assignation QuickAction (admin + équipe). */
export async function fetchAssigneeIds() {
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id')
    .in('role', ['admin', 'équipe']);
  if (error) throw error;
  return (data || []).map((p) => p.id);
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
  const groupId = crypto.randomUUID();
  const assignees = await fetchAssigneeIds();

  const baseDetails = {
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
