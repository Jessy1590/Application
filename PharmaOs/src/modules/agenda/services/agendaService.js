import { supabase } from '../../../shared/supabaseClient.js';
import { createTask, fetchTeamProfiles } from '../../tasks/services/taskService.js';

/**
 * Service agenda (dashboard-only).
 * Table : PharmaOs.agenda_events (type, date_evenement, details jsonb).
 * Types : commande_med | facturation | changement_horaire
 */

export { fetchTeamProfiles as fetchProfiles };

export async function fetchAgendaEvents() {
  const { data, error } = await supabase.from('agenda_events').select('*');
  if (error) throw error;
  return data || [];
}

export async function createAgendaEvent(type, startDate, details, assignees, createdBy) {
  const groupId = crypto.randomUUID();
  const events = [];

  if (type === 'commande_med') {
    const reps = parseInt(details.repetitions, 10);
    const weeks = parseInt(details.recurrence_semaines, 10);

    for (let i = 0; i < reps; i++) {
      const eventDate = new Date(startDate);
      eventDate.setDate(eventDate.getDate() + i * weeks * 7);
      const isoDate = eventDate.toISOString();

      let taskId = null;
      if (assignees?.length) {
        const titre = `Commande : ${details.medicament} (${i + 1}/${reps}) - Pour le ${eventDate.toLocaleDateString('fr-FR')}`;
        taskId = await createTask(titre, JSON.stringify(details), assignees, createdBy);
      }

      events.push({
        type,
        date_evenement: isoDate,
        details: { ...details, groupId, seriesIndex: i + 1, totalSeries: reps, taskId },
      });
    }
  } else {
    let taskId = null;
    if (type !== 'changement_horaire' && assignees?.length) {
      const titre = `Facturation : ${details.facture || 'En attente'}`;
      taskId = await createTask(titre, JSON.stringify(details), assignees, createdBy);
    }
    events.push({ type, date_evenement: startDate, details: { ...details, groupId, taskId } });
  }

  const { error: eventError } = await supabase.from('agenda_events').insert(events);
  if (eventError) throw eventError;
}

export async function deleteAgendaEvent(id, groupId = null, deleteFuture = false, dateEvenement = null) {
  let query = supabase.from('agenda_events').select('details');
  if (deleteFuture && groupId && dateEvenement) {
    query = query.eq('details->>groupId', groupId).gte('date_evenement', dateEvenement);
  } else {
    query = query.eq('id', id);
  }
  const { data: eventsToDelete, error: fetchError } = await query;
  if (fetchError) throw fetchError;

  const taskIds = (eventsToDelete || []).map((e) => e.details?.taskId).filter(Boolean);
  if (taskIds.length > 0) {
    await supabase.from('tasks').delete().in('id', taskIds);
  }

  let delQuery = supabase.from('agenda_events').delete();
  if (deleteFuture && groupId && dateEvenement) {
    delQuery = delQuery.eq('details->>groupId', groupId).gte('date_evenement', dateEvenement);
  } else {
    delQuery = delQuery.eq('id', id);
  }
  const { error } = await delQuery;
  if (error) throw error;
}

export async function updateAgendaEvent(eventId, groupId, oldDate, newData, updateFuture, assignees, userId) {
  const { id, date_evenement_originale, date, type, ...cleanDetails } = newData;

  await deleteAgendaEvent(eventId, groupId, updateFuture, oldDate);

  if (updateFuture && type === 'commande_med') {
    await createAgendaEvent(type, date, cleanDetails, assignees, userId);
  } else {
    const singleDetails = { ...cleanDetails, repetitions: 1 };
    await createAgendaEvent(type, date, singleDetails, assignees, userId);
  }
}
