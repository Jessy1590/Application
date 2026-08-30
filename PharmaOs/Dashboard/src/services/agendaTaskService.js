import { supabase } from './supabaseClient';

export const fetchProfiles = async () => {
  // Filtre uniquement les admins et l'équipe
  const { data, error } = await supabase.schema('portail')
    .from('profiles')
    .select('id, display_name')
    .in('role', ['admin', 'équipe']);
  if (error) throw error;
  return data;
};

export const fetchTasks = async () => {
  const { data: tasks, error: tasksError } = await supabase.schema('PharmaOs')
    .from('tasks').select(`*, task_assignments(*)`).order('created_at', { ascending: false });
  if (tasksError) throw tasksError;

  const { data: profiles } = await supabase.schema('portail').from('profiles').select('id, display_name');

  return tasks.map(task => {
    // Si une assignation est terminée, la tâche globale est considérée terminée
    const isCompleted = task.task_assignments.some(a => a.statut === 'terminee');
    return {
      ...task,
      statutGlobal: isCompleted ? 'terminee' : 'en_cours',
      task_assignments: task.task_assignments.map(a => ({
        ...a, profiles: { display_name: profiles.find(p => p.id === a.user_id)?.display_name || 'Inconnu' }
      }))
    };
  });
};

// On modifie createTask pour qu'elle retourne l'ID généré
export const createTask = async (titre, description, userIds, createdBy) => {
  const { data: task, error: taskError } = await supabase.schema('PharmaOs')
    .from('tasks').insert([{ titre, description, created_by: createdBy }]).select().single();
  if (taskError) throw taskError;

  const assignments = userIds.map(userId => ({ task_id: task.id, user_id: userId, statut: 'en_cours' }));
  const { error: assignError } = await supabase.schema('PharmaOs').from('task_assignments').insert(assignments);
  if (assignError) throw assignError;

  return task.id; // NOUVEAU : On retourne l'ID pour le lier à l'agenda
};

// Création d'événements : Une tâche distincte par récurrence
export const createAgendaEvent = async (type, startDate, details, assignees, createdBy) => {
  const groupId = crypto.randomUUID();
  let events = [];

  if (type === 'commande_med') {
    const reps = parseInt(details.repetitions);
    const weeks = parseInt(details.recurrence_semaines);
    
    for (let i = 0; i < reps; i++) {
      const eventDate = new Date(startDate);
      eventDate.setDate(eventDate.getDate() + (i * weeks * 7));
      const isoDate = eventDate.toISOString();

      // Création de la tâche spécifique pour cette date
      let taskId = null;
      if (assignees && assignees.length > 0) {
        const titre = `Commande : ${details.medicament} (${i + 1}/${reps}) - Pour le ${eventDate.toLocaleDateString('fr-FR')}`;
        taskId = await createTask(titre, JSON.stringify(details), assignees, createdBy);
      }

      events.push({ 
        type, 
        date_evenement: isoDate, 
        details: { ...details, groupId, seriesIndex: i + 1, totalSeries: reps, taskId } 
      });
    }
  } else {
    // Facturation ou Changement d'horaire
    let taskId = null;
    if (type !== 'changement_horaire' && assignees && assignees.length > 0) {
      const titre = `Facturation : ${details.facture || 'En attente'}`;
      taskId = await createTask(titre, JSON.stringify(details), assignees, createdBy);
    }
    events.push({ type, date_evenement: startDate, details: { ...details, groupId, taskId } });
  }

  const { error: eventError } = await supabase.schema('PharmaOs').from('agenda_events').insert(events);
  if (eventError) throw eventError;
};

// NOUVEAU : Valide la tâche pour tout le monde en même temps
export const completeTaskGlobal = async (taskId, commentaire, timeSeconds, completedBy) => {
  const { error } = await supabase.schema('PharmaOs').from('task_assignments')
    .update({ statut: 'terminee', completed_at: new Date(), completion_time_seconds: timeSeconds, commentaire: `${commentaire} (Validé par ${completedBy})` })
    .eq('task_id', taskId);
  if (error) throw error;
};


export const fetchAgendaEvents = async () => {
  const { data, error } = await supabase.schema('PharmaOs').from('agenda_events').select('*');
  if (error) throw error;
  return data;
};


// Dévalider une tâche (la repasser en cours)
export const uncompleteTaskGlobal = async (taskId) => {
  const { error } = await supabase.schema('PharmaOs').from('task_assignments')
    .update({ statut: 'en_cours', completed_at: null, completion_time_seconds: null, commentaire: null })
    .eq('task_id', taskId);
  if (error) throw error;
};

// Modifier le titre et la description d'une tâche
export const updateTask = async (taskId, titre, description) => {
  const { error } = await supabase.schema('PharmaOs').from('tasks')
    .update({ titre, description })
    .eq('id', taskId);
  if (error) throw error;
};

// Suppression : Nettoie les événements ET les tâches liées
export const deleteAgendaEvent = async (id, groupId = null, deleteFuture = false, dateEvenement = null) => {
  // 1. Cibler les événements
  let query = supabase.schema('PharmaOs').from('agenda_events').select('details');
  if (deleteFuture && groupId && dateEvenement) {
    query = query.eq('details->>groupId', groupId).gte('date_evenement', dateEvenement);
  } else {
    query = query.eq('id', id);
  }
  const { data: eventsToDelete, error: fetchError } = await query;
  if (fetchError) throw fetchError;

  // 2. Extraire les IDs des tâches et les supprimer (ON DELETE CASCADE gère les assignations)
  const taskIds = eventsToDelete.map(e => e.details?.taskId).filter(Boolean);
  if (taskIds.length > 0) {
    await supabase.schema('PharmaOs').from('tasks').delete().in('id', taskIds);
  }

  // 3. Supprimer les événements
  let delQuery = supabase.schema('PharmaOs').from('agenda_events').delete();
  if (deleteFuture && groupId && dateEvenement) {
    delQuery = delQuery.eq('details->>groupId', groupId).gte('date_evenement', dateEvenement);
  } else {
    delQuery = delQuery.eq('id', id);
  }
  const { error } = await delQuery;
  if (error) throw error;
};

// Modification : On passe désormais assignees et userId pour recréer proprement les tâches
export const updateAgendaEvent = async (eventId, groupId, oldDate, newData, updateFuture, assignees, userId) => {
  // On s'assure que le type est bien présent, sinon on récupère l'ancien type si besoin, 
  // ou on s'appuie sur ce qui est dans newData.
  const { id, date_evenement_originale, date, type, ...cleanDetails } = newData;

  // 1. Suppression propre de l'ancien événement (et des futurs si récurrence)
  await deleteAgendaEvent(eventId, groupId, updateFuture, oldDate);

  // 2. Recréation du ou des nouveaux événements avec leurs tâches propres
  if (updateFuture && type === 'commande_med') {
    // Si on modifie toute la série, on relance la création en chaîne
    await createAgendaEvent(type, date, cleanDetails, assignees, userId);
  } else {
    // Si c'est un événement unique, on force à 1 seule répétition
    const singleDetails = { ...cleanDetails, repetitions: 1 };
    await createAgendaEvent(type, date, singleDetails, assignees, userId);
  }
};