import { supabase } from './supabaseClient';

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export { DAY_LABELS };

export async function fetchTeamProfiles() {
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, display_name, role')
    .in('role', ['admin', 'équipe'])
    .order('display_name');
  if (error) throw error;
  return data || [];
}

export async function fetchWorkSchedules() {
  const { data, error } = await supabase
    .from('work_schedules')
    .select('*')
    .eq('actif', true)
    .order('day_of_week');
  if (error) throw error;
  return data || [];
}

export async function upsertWorkSchedule(payload, id = null) {
  const row = { ...payload, updated_at: new Date().toISOString() };
  if (id) {
    const { data, error } = await supabase.from('work_schedules').update(row).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('work_schedules').insert([row]).select().single();
  if (error) throw error;
  return data;
}

export async function deleteWorkSchedule(id) {
  const { error } = await supabase.from('work_schedules').delete().eq('id', id);
  if (error) throw error;
}

export async function fetchAbsences({ from, to } = {}) {
  let q = supabase.from('hr_absences').select('*').order('date_debut', { ascending: false });
  if (from) q = q.gte('date_fin', from);
  if (to) q = q.lte('date_debut', to);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function createAbsence(userId, payload) {
  const { data, error } = await supabase
    .from('hr_absences')
    .insert([{
      user_id: payload.user_id,
      absence_type: payload.absence_type,
      date_debut: payload.date_debut,
      date_fin: payload.date_fin,
      motif: payload.motif || null,
      created_by: userId,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteAbsence(id) {
  const { error } = await supabase.from('hr_absences').delete().eq('id', id);
  if (error) throw error;
}

/** Présence du jour + heuristique arrivée / dernière activité via taskbar_logs */
export async function fetchPresenceForDay(dateStr) {
  const start = `${dateStr}T00:00:00`;
  const end = `${dateStr}T23:59:59`;
  const { data, error } = await supabase
    .from('taskbar_logs')
    .select('user_id, action, created_at')
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const byUser = {};
  (data || []).forEach((log) => {
    if (!byUser[log.user_id]) {
      byUser[log.user_id] = { first: log.created_at, last: log.created_at, login: false, actions: 0 };
    }
    byUser[log.user_id].last = log.created_at;
    byUser[log.user_id].actions += 1;
    if (log.action === 'login') byUser[log.user_id].login = true;
  });
  return byUser;
}

/**
 * Récap mensuel : heures théoriques (work_schedules) vs jours avec pointage taskbar.
 */
export async function fetchMonthlyHoursRecap(year, month) {
  const profiles = await fetchTeamProfiles();
  const schedules = await fetchWorkSchedules();
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const { data: logs, error } = await supabase
    .from('taskbar_logs')
    .select('user_id, action, created_at')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`);
  if (error) throw error;

  const absences = await fetchAbsences({ from, to });

  const daysWithActivity = {};
  (logs || []).forEach((l) => {
    const d = l.created_at.slice(0, 10);
    if (!daysWithActivity[l.user_id]) daysWithActivity[l.user_id] = new Set();
    daysWithActivity[l.user_id].add(d);
  });

  return profiles.map((p) => {
    const userSched = schedules.filter((s) => s.user_id === p.id);
    const pharmacySched = schedules.filter((s) => !s.user_id);
    const effective = userSched.length > 0 ? userSched : pharmacySched;

    let theoHours = 0;
    for (let day = 1; day <= lastDay; day++) {
      const dt = new Date(year, month - 1, day);
      const dow = dt.getDay();
      const slots = effective.filter((s) => s.day_of_week === dow);
      slots.forEach((s) => {
        const [sh, sm] = String(s.start_time).split(':').map(Number);
        const [eh, em] = String(s.end_time).split(':').map(Number);
        theoHours += (eh + em / 60) - (sh + sm / 60);
      });
    }

    const userAbs = absences.filter((a) => a.user_id === p.id);
    let absenceDays = 0;
    userAbs.forEach((a) => {
      const d0 = new Date(a.date_debut);
      const d1 = new Date(a.date_fin);
      absenceDays += Math.floor((d1 - d0) / 86400000) + 1;
    });

    const presentDays = daysWithActivity[p.id]?.size || 0;

    return {
      user_id: p.id,
      display_name: p.display_name,
      theo_hours: Math.round(theoHours * 10) / 10,
      present_days: presentDays,
      absence_days: absenceDays,
    };
  });
}
