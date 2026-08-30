import { supabase } from './supabaseClient';

export async function fetchEquipments() {
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('equipment_calibrations')
    .select('*')
    .order('calibration_end_date', { ascending: true });
  if (error) throw error;
  return data;
}

/**
 * Crée ou met à jour un étalonnage.
 * Si next_visit_date est renseignée, crée une tâche admin pour prendre RDV.
 */
export async function upsertEquipment(payload, userId) {
  const row = {
    equipment_name: payload.equipment_name || 'Balance',
    calibration_end_date: payload.calibration_end_date,
    next_visit_date: payload.next_visit_date || null,
    notes: payload.notes || null,
    updated_at: new Date().toISOString(),
  };

  let equipment;
  if (payload.id) {
    const { data, error } = await supabase
      .schema('PharmaOs')
      .from('equipment_calibrations')
      .update(row)
      .eq('id', payload.id)
      .select()
      .single();
    if (error) throw error;
    equipment = data;
  } else {
    const { data, error } = await supabase
      .schema('PharmaOs')
      .from('equipment_calibrations')
      .insert([{ ...row, created_by: userId }])
      .select()
      .single();
    if (error) throw error;
    equipment = data;
  }

  if (payload.next_visit_date && payload.createRdvTask) {
    const { data: admins } = await supabase
      .schema('portail')
      .from('profiles')
      .select('id')
      .eq('role', 'admin');

    const assignees = admins?.map(a => a.id) || [userId];
    const details = {
      type: 'etalonnage_rdv',
      equipment_name: equipment.equipment_name,
      calibration_end_date: equipment.calibration_end_date,
      next_visit_date: equipment.next_visit_date,
      urgent: true,
      date: equipment.next_visit_date,
    };

    const titre = `RDV ÉTALONNAGE — ${equipment.equipment_name} (avant le ${new Date(equipment.next_visit_date).toLocaleDateString('fr-FR')})`;
    const { data: task, error: taskError } = await supabase
      .schema('PharmaOs')
      .from('tasks')
      .insert([{ titre, description: JSON.stringify(details), created_by: userId }])
      .select()
      .single();
    if (taskError) throw taskError;

    await supabase.schema('PharmaOs').from('task_assignments').insert(
      assignees.map(uid => ({ task_id: task.id, user_id: uid, statut: 'en_cours' }))
    );

    await supabase
      .schema('PharmaOs')
      .from('equipment_calibrations')
      .update({ last_task_id: task.id })
      .eq('id', equipment.id);
  }

  return equipment;
}

export async function fetchDailyControls(days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const { data, error } = await supabase
    .schema('PharmaOs')
    .from('daily_controls')
    .select('*')
    .gte('created_at', startDate.toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;

  const userIds = [...new Set(data.map(c => c.user_id))];
  let profilesMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.schema('portail').from('profiles').select('id, display_name').in('id', userIds);
    profiles?.forEach(p => { profilesMap[p.id] = p.display_name; });
  }
  return data.map(c => ({ ...c, author_name: profilesMap[c.user_id] || 'Inconnu' }));
}

export async function fetchControlsStats() {
  const controls = await fetchDailyControls(7);
  const todayStr = new Date().toISOString().split('T')[0];
  const todayControls = controls.filter(c => c.created_at.startsWith(todayStr));
  const nonCompliant = controls.filter(c => !c.is_compliant).length;
  const missingTempMorning = !todayControls.some(
    c => (c.control_type === 'temperature_frigo' || c.control_type === 'temperature_frigo_a') && c.shift === 'matin'
  );
  return { weekTotal: controls.length, todayTotal: todayControls.length, nonCompliant, missingTempMorning };
}
