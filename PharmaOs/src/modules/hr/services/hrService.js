import { supabase } from '../../../shared/supabaseClient.js';

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
export { DAY_LABELS };

export const ABSENCE_TYPE_LABELS = {
  conge: 'Congé',
  absence: 'Absence',
  maladie: 'Maladie',
  rtt: 'RTT',
  formation: 'Formation',
  autre: 'Autre',
};

export const ABSENCE_STATUT_LABELS = {
  en_attente: 'En attente',
  validee: 'Validée',
  refusee: 'Refusée',
};

export const CHANGE_TYPE_LABELS = {
  retard: 'Retard',
  depart_anticipe: 'Départ anticipé',
  autre: 'Autre',
  changement_horaire: 'Changement d\'horaire',
};

export const WEEK_PATTERN_LABELS = {
  all: 'Toutes les semaines',
  even: 'Semaines paires',
  odd: 'Semaines impaires',
};

export function labelAbsenceType(type) {
  return ABSENCE_TYPE_LABELS[type] || type || '—';
}

export function labelAbsenceStatut(statut) {
  return ABSENCE_STATUT_LABELS[statut] || statut || '—';
}

export function labelChangeType(type) {
  return CHANGE_TYPE_LABELS[type] || type || '—';
}

export function labelWeekPattern(pattern) {
  return WEEK_PATTERN_LABELS[pattern] || pattern || '—';
}

function slotHours(startTime, endTime) {
  const [sh, sm] = String(startTime).split(':').map(Number);
  const [eh, em] = String(endTime).split(':').map(Number);
  return (eh + em / 60) - (sh + sm / 60);
}

function dateInRange(dateStr, from, to) {
  return dateStr >= from && dateStr <= to;
}

function eachDateInMonth(year, month) {
  const lastDay = new Date(year, month, 0).getDate();
  const dates = [];
  for (let day = 1; day <= lastDay; day += 1) {
    dates.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return dates;
}

function eachDateInRange(from, to) {
  const dates = [];
  const cur = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cur <= end) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function absenceCoversDate(absence, dateStr) {
  return dateStr >= absence.date_debut && dateStr <= absence.date_fin;
}

/** Lundi ISO de la semaine contenant dateStr (YYYY-MM-DD). */
export function mondayOfISOWeek(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Numéro de semaine ISO (1–53). */
export function getISOWeekNumber(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  return Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
}

/** 'even' | 'odd' selon semaine ISO. */
export function isoWeekParity(dateStr) {
  return getISOWeekNumber(dateStr) % 2 === 0 ? 'even' : 'odd';
}

export function weekMeta(dateStr) {
  const monday = mondayOfISOWeek(dateStr);
  const parity = isoWeekParity(dateStr);
  return {
    monday,
    weekNumber: getISOWeekNumber(dateStr),
    parity,
    parityLabel: parity === 'even' ? 'paire' : 'impaire',
  };
}

function isRecurringSlot(slot) {
  return !slot.exception_week_start;
}

function matchesWeekPattern(slot, dateStr) {
  const pattern = slot.week_pattern || 'all';
  if (pattern === 'all') return true;
  return pattern === isoWeekParity(dateStr);
}

/**
 * Créneaux effectifs pour un user à une date donnée.
 * Priorité : semaine exceptionnelle perso → récurrent perso (A/B) →
 * (si fallbackPharmacy) exception / récurrent pharmacie.
 */
export function effectiveSchedulesForDate(schedules, userId, dateStr, { fallbackPharmacy = true } = {}) {
  const monday = mondayOfISOWeek(dateStr);
  const dow = new Date(`${dateStr}T12:00:00`).getDay();
  const all = schedules || [];

  const userException = all.filter(
    (s) => s.user_id === userId && s.actif !== false && s.exception_week_start === monday,
  );
  if (userException.length) {
    return userException.filter((s) => s.day_of_week === dow);
  }

  const userRecurring = all.filter(
    (s) => s.user_id === userId && s.actif !== false && isRecurringSlot(s) && matchesWeekPattern(s, dateStr),
  );
  if (userRecurring.length) {
    return userRecurring.filter((s) => s.day_of_week === dow);
  }

  if (!fallbackPharmacy || userId == null) {
    if (userId == null) {
      const pharmacyException = all.filter(
        (s) => !s.user_id && s.actif !== false && s.exception_week_start === monday,
      );
      if (pharmacyException.length) {
        return pharmacyException.filter((s) => s.day_of_week === dow);
      }
      return all.filter(
        (s) => !s.user_id && s.actif !== false && isRecurringSlot(s)
          && matchesWeekPattern(s, dateStr) && s.day_of_week === dow,
      );
    }
    return [];
  }

  const pharmacyException = all.filter(
    (s) => !s.user_id && s.actif !== false && s.exception_week_start === monday,
  );
  if (pharmacyException.length) {
    return pharmacyException.filter((s) => s.day_of_week === dow);
  }

  return all.filter(
    (s) => !s.user_id && s.actif !== false && isRecurringSlot(s)
      && matchesWeekPattern(s, dateStr) && s.day_of_week === dow,
  );
}

/** Créneaux récurrents (sans exception) — vue planning « type ». */
export function effectiveSchedulesForUser(schedules, userId, { dateStr = null } = {}) {
  if (dateStr) return effectiveSchedulesForDate(schedules, userId, dateStr);

  const userSched = (schedules || []).filter(
    (s) => s.user_id === userId && s.actif !== false && isRecurringSlot(s),
  );
  if (userSched.length) return userSched;
  return (schedules || []).filter(
    (s) => !s.user_id && s.actif !== false && isRecurringSlot(s),
  );
}

/**
 * Grille Lun–Dim pour une semaine de référence (date quelconque dans la semaine).
 * Si weekDate fourni : créneaux effectifs de cette semaine (exceptions + A/B).
 * Sinon : créneaux récurrents « all » + even/odd annotés.
 */
export function buildWeekGrid(schedules, profiles, { weekDate = null } = {}) {
  const days = [1, 2, 3, 4, 5, 6, 0];
  const monday = weekDate ? mondayOfISOWeek(weekDate) : null;

  const slotsFor = (userId, dow) => {
    if (monday) {
      const dateStr = (() => {
        const d = new Date(`${monday}T12:00:00`);
        // lun=1 … dim=0 : offset from monday
        const offset = dow === 0 ? 6 : dow - 1;
        d.setDate(d.getDate() + offset);
        return d.toISOString().slice(0, 10);
      })();
      return effectiveSchedulesForDate(schedules, userId, dateStr);
    }
    const base = (schedules || []).filter((s) => {
      if (s.actif === false) return false;
      if (!isRecurringSlot(s)) return false;
      if (userId == null) return !s.user_id;
      return s.user_id === userId;
    });
    const perso = base.filter((s) => s.user_id === userId);
    const pool = perso.length || userId == null
      ? (userId == null ? base.filter((s) => !s.user_id) : perso)
      : (schedules || []).filter((s) => !s.user_id && s.actif !== false && isRecurringSlot(s));
    return pool.filter((s) => s.day_of_week === dow);
  };

  const pharmacyCells = days.map((dow) => slotsFor(null, dow));
  // For pharmacy row when weekDate set, use null userId path
  const pharmacyRow = {
    key: 'pharmacy',
    label: 'Pharmacie',
    user_id: null,
    cells: weekDate
      ? days.map((dow) => {
        const dateStr = (() => {
          const d = new Date(`${monday}T12:00:00`);
          const offset = dow === 0 ? 6 : dow - 1;
          d.setDate(d.getDate() + offset);
          return d.toISOString().slice(0, 10);
        })();
        return (schedules || []).filter((s) => {
          if (s.actif === false || s.user_id) return false;
          if (s.exception_week_start === monday) return s.day_of_week === dow;
          if (s.exception_week_start) return false;
          return s.day_of_week === dow && matchesWeekPattern(s, dateStr);
        });
      })
      : pharmacyCells,
  };

  // Fix pharmacy when not weekDate — slotsFor(null) already used
  if (!weekDate) {
    pharmacyRow.cells = days.map((dow) => (schedules || []).filter(
      (s) => !s.user_id && s.actif !== false && isRecurringSlot(s) && s.day_of_week === dow,
    ));
  }

  const rows = [
    pharmacyRow,
    ...(profiles || []).map((p) => ({
      key: p.id,
      label: p.display_name,
      user_id: p.id,
      cells: days.map((dow) => {
        if (weekDate) {
          const dateStr = (() => {
            const d = new Date(`${monday}T12:00:00`);
            const offset = dow === 0 ? 6 : dow - 1;
            d.setDate(d.getDate() + offset);
            return d.toISOString().slice(0, 10);
          })();
          return effectiveSchedulesForDate(schedules, p.id, dateStr);
        }
        const perso = (schedules || []).filter(
          (s) => s.user_id === p.id && s.actif !== false && isRecurringSlot(s) && s.day_of_week === dow,
        );
        return perso;
      }),
    })),
  ];
  return { days, dayLabels: days.map((d) => DAY_LABELS[d]), rows, monday, meta: weekDate ? weekMeta(weekDate) : null };
}

export async function fetchTeamProfiles() {
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .select('id, display_name, role, job_title')
    .in('role', ['admin', 'équipe'])
    .order('display_name');
  if (error) throw error;
  return (data || []).map((p) => ({
    ...p,
    job_title: p.job_title || 'autre',
  }));
}

export const JOB_TITLE_LABELS = {
  preparateur: 'Préparateur',
  pharmacien: 'Pharmacien',
  autre: 'Autre personnel',
};

export function labelJobTitle(job) {
  return JOB_TITLE_LABELS[job] || JOB_TITLE_LABELS.autre;
}

export async function updateProfileJobTitle(profileId, jobTitle) {
  if (!['preparateur', 'pharmacien', 'autre'].includes(jobTitle)) {
    throw new Error('Sous-type invalide');
  }
  const { data, error } = await supabase
    .schema('portail')
    .from('profiles')
    .update({ job_title: jobTitle })
    .eq('id', profileId)
    .select('id, display_name, role, job_title')
    .single();
  if (error) throw error;
  return data;
}

export async function fetchWorkSchedules({ includeInactive = false } = {}) {
  let q = supabase.from('work_schedules').select('*').order('day_of_week');
  if (!includeInactive) q = q.eq('actif', true);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

export async function upsertWorkSchedule(payload, id = null) {
  const exceptionWeek = payload.exception_week_start
    ? mondayOfISOWeek(payload.exception_week_start)
    : null;
  const row = {
    user_id: payload.user_id || null,
    day_of_week: Number(payload.day_of_week),
    start_time: payload.start_time,
    end_time: payload.end_time,
    label: payload.label || null,
    actif: payload.actif !== false,
    week_pattern: exceptionWeek ? 'all' : (payload.week_pattern || 'all'),
    exception_week_start: exceptionWeek,
    special_week_id: exceptionWeek ? (payload.special_week_id || null) : null,
    updated_at: new Date().toISOString(),
  };
  if (id) {
    const { data, error } = await supabase.from('work_schedules').update(row).eq('id', id).select().single();
    if (error) throw error;
    return data;
  }
  const { data, error } = await supabase.from('work_schedules').insert([row]).select().single();
  if (error) throw error;
  return data;
}

/** Crée le même créneau sur plusieurs jours (et éventuellement plusieurs lundis d'exception). */
export async function createScheduleSlots({
  user_id = null,
  daysOfWeek = [],
  start_time,
  end_time,
  label = null,
  week_pattern = 'all',
  exceptionMondays = [],
  special_week_id = null,
}) {
  const results = [];
  const mondays = exceptionMondays.length ? exceptionMondays : [null];
  for (const monday of mondays) {
    for (const dow of daysOfWeek) {
      const row = await upsertWorkSchedule({
        user_id,
        day_of_week: dow,
        start_time,
        end_time,
        label,
        week_pattern: monday ? 'all' : week_pattern,
        exception_week_start: monday,
        special_week_id: monday ? special_week_id : null,
      });
      results.push(row);
    }
  }
  return results;
}

export function sundayOfISOWeek(mondayStr) {
  const d = new Date(`${mondayStr}T12:00:00`);
  d.setDate(d.getDate() + 6);
  return d.toISOString().slice(0, 10);
}

/** Tous les lundis ISO couverts par [from, to]. */
export function mondaysInDateRange(from, to) {
  const mondays = [];
  let cur = mondayOfISOWeek(from);
  const end = to;
  while (cur <= end) {
    mondays.push(cur);
    const d = new Date(`${cur}T12:00:00`);
    d.setDate(d.getDate() + 7);
    cur = d.toISOString().slice(0, 10);
  }
  return mondays;
}

export async function fetchSpecialWeeks() {
  const { data, error } = await supabase
    .from('hr_special_weeks')
    .select('*')
    .order('week_start', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createSpecialWeek(createdBy, { label, week_start, week_end, note = null }) {
  const start = mondayOfISOWeek(week_start);
  const end = week_end ? week_end : sundayOfISOWeek(start);
  const { data, error } = await supabase
    .from('hr_special_weeks')
    .insert([{
      label: label.trim(),
      week_start: start,
      week_end: end >= start ? end : sundayOfISOWeek(start),
      note: note || null,
      created_by: createdBy || null,
    }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteSpecialWeek(id) {
  const { error } = await supabase.from('hr_special_weeks').delete().eq('id', id);
  if (error) throw error;
}

export function specialWeeksForMonday(specialWeeks, monday) {
  const sunday = sundayOfISOWeek(monday);
  return (specialWeeks || []).filter((s) => s.week_start <= sunday && s.week_end >= monday);
}

export const PLANNING_HOUR_START = 7;
export const PLANNING_HOUR_END = 21;
export const PLANNING_SLOT_MIN = 15;

export function minutesToTime(totalMin) {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeToMinutes(timeStr) {
  const [h, m] = String(timeStr).slice(0, 5).split(':').map(Number);
  return h * 60 + m;
}

export function snapMinutes(min, step = PLANNING_SLOT_MIN) {
  return Math.round(min / step) * step;
}

const PERSON_COLORS = [
  { bg: 'bg-indigo-500', soft: 'bg-indigo-100 border-indigo-300 text-indigo-900', hex: '#6366f1' },
  { bg: 'bg-emerald-500', soft: 'bg-emerald-100 border-emerald-300 text-emerald-900', hex: '#10b981' },
  { bg: 'bg-amber-500', soft: 'bg-amber-100 border-amber-300 text-amber-900', hex: '#f59e0b' },
  { bg: 'bg-rose-500', soft: 'bg-rose-100 border-rose-300 text-rose-900', hex: '#f43f5e' },
  { bg: 'bg-sky-500', soft: 'bg-sky-100 border-sky-300 text-sky-900', hex: '#0ea5e9' },
  { bg: 'bg-violet-500', soft: 'bg-violet-100 border-violet-300 text-violet-900', hex: '#8b5cf6' },
  { bg: 'bg-teal-500', soft: 'bg-teal-100 border-teal-300 text-teal-900', hex: '#14b8a6' },
  { bg: 'bg-orange-500', soft: 'bg-orange-100 border-orange-300 text-orange-900', hex: '#f97316' },
];

export function colorForUser(userId, profiles = []) {
  if (!userId) {
    return { bg: 'bg-slate-600', soft: 'bg-slate-200 border-slate-400 text-slate-900', hex: '#475569', label: 'Pharmacie' };
  }
  const idx = Math.abs(
    String(userId).split('').reduce((a, c) => a + c.charCodeAt(0), 0),
  ) % PERSON_COLORS.length;
  const name = profiles.find((p) => p.id === userId)?.display_name || 'Collab.';
  return { ...PERSON_COLORS[idx], label: name };
}

export async function deactivateWorkSchedule(id) {
  const { data, error } = await supabase
    .from('work_schedules')
    .update({ actif: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function fetchAbsences({ from, to, userId, statut } = {}) {
  let q = supabase.from('hr_absences').select('*').order('date_debut', { ascending: false });
  if (from) q = q.gte('date_fin', from);
  if (to) q = q.lte('date_debut', to);
  if (userId) q = q.eq('user_id', userId);
  if (statut) q = q.eq('statut', statut);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * @param {'admin'|'equipe'} [options.mode] admin → validee ; equipe → en_attente + tâche
 */
export async function createAbsence(createdBy, payload, { mode = 'admin' } = {}) {
  const statut = mode === 'equipe' ? 'en_attente' : (payload.statut || 'validee');
  const { data, error } = await supabase
    .from('hr_absences')
    .insert([{
      user_id: payload.user_id,
      absence_type: payload.absence_type,
      date_debut: payload.date_debut,
      date_fin: payload.date_fin,
      motif: payload.motif || null,
      statut,
      created_by: createdBy,
    }])
    .select()
    .single();
  if (error) throw error;

  if (mode === 'equipe' && statut === 'en_attente') {
    await createAbsenceRequestTask(data, createdBy);
  }
  return data;
}

export async function updateAbsence(id, updates) {
  const row = { ...updates };
  delete row.id;
  const { data, error } = await supabase
    .from('hr_absences')
    .update(row)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function reviewAbsence(id, reviewerId, { statut, review_note = null } = {}) {
  if (!['validee', 'refusee'].includes(statut)) {
    throw new Error('Statut de revue invalide');
  }
  const { data, error } = await supabase
    .from('hr_absences')
    .update({
      statut,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: review_note || null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  await completeAbsenceRequestTask(id, reviewerId);
  await createAbsenceResponseTask(data, reviewerId);
  return data;
}

export async function deleteAbsence(id) {
  const { error } = await supabase.from('hr_absences').delete().eq('id', id);
  if (error) throw error;
}

export async function createAbsenceRequestTask(absenceRow, createdBy) {
  const { createTask, fetchAdminIds } = await import('../../tasks/services/taskService.js');
  const adminIds = await fetchAdminIds();
  const assignees = adminIds.length ? adminIds : (createdBy ? [createdBy] : []);
  if (!assignees.length) return null;

  const typeLabel = labelAbsenceType(absenceRow.absence_type);
  const titre = `Demande d'absence : ${typeLabel} (${absenceRow.date_debut} → ${absenceRow.date_fin})`;
  return createTask(
    titre,
    JSON.stringify({
      type: 'hr_absence_demande',
      absence_id: absenceRow.id,
      user_id: absenceRow.user_id,
      absence_type: absenceRow.absence_type,
      date_debut: absenceRow.date_debut,
      date_fin: absenceRow.date_fin,
      motif: absenceRow.motif || null,
    }),
    assignees,
    createdBy || assignees[0],
  );
}

/** Notifie le salarié de la décision (tâche in-app ; mail SMTP plus tard). */
export async function createAbsenceResponseTask(absenceRow, createdBy) {
  const { createTask } = await import('../../tasks/services/taskService.js');
  if (!absenceRow?.user_id) return null;
  const decision = absenceRow.statut === 'validee' ? 'acceptée' : 'refusée';
  const typeLabel = labelAbsenceType(absenceRow.absence_type);
  const titre = `Réponse absence : ${typeLabel} ${decision} (${absenceRow.date_debut} → ${absenceRow.date_fin})`;
  return createTask(
    titre,
    JSON.stringify({
      type: 'hr_absence_reponse',
      absence_id: absenceRow.id,
      statut: absenceRow.statut,
      absence_type: absenceRow.absence_type,
      date_debut: absenceRow.date_debut,
      date_fin: absenceRow.date_fin,
      review_note: absenceRow.review_note || null,
    }),
    [absenceRow.user_id],
    createdBy || absenceRow.user_id,
  );
}

async function completeAbsenceRequestTask(absenceId, completedBy) {
  const { completeAssignmentByTaskId } = await import('../../tasks/services/taskService.js');
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, description')
    .order('created_at', { ascending: false })
    .limit(200);

  const task = (tasks || []).find((t) => {
    try {
      const d = JSON.parse(t.description || '{}');
      return d.type === 'hr_absence_demande' && d.absence_id === absenceId;
    } catch {
      return false;
    }
  });
  if (!task) return;
  await completeAssignmentByTaskId(task.id, `Revue RH (par ${completedBy})`);
}

export async function fetchScheduleChanges({ userId, statut, changeType } = {}) {
  let q = supabase.from('hr_schedule_changes').select('*').order('date_debut', { ascending: false });
  if (userId) q = q.eq('user_id', userId);
  if (statut) q = q.eq('statut', statut);
  if (changeType) q = q.eq('change_type', changeType);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * @param {'admin'|'equipe'} [options.mode]
 * equipe + changement_horaire → en_attente + tâche admin
 * retard / départ → validee immédiatement
 */
export async function createScheduleChange(createdBy, payload, { mode = 'admin' } = {}) {
  const changeType = payload.change_type || 'retard';
  if (!['retard', 'depart_anticipe', 'autre', 'changement_horaire'].includes(changeType)) {
    throw new Error('Type de changement invalide');
  }

  const needsApproval = mode === 'equipe' && changeType === 'changement_horaire';
  const statut = needsApproval ? 'en_attente' : (payload.statut || 'validee');
  const motif = payload.motif || CHANGE_TYPE_LABELS[changeType] || changeType;

  const row = {
    user_id: payload.user_id,
    motif,
    change_type: changeType,
    date_debut: payload.date_debut,
    heure_debut: payload.heure_prevue || payload.heure_debut || null,
    date_fin: payload.date_fin || null,
    heure_fin: payload.heure_fin || null,
    commentaire: payload.commentaire || null,
    heure_prevue: payload.heure_prevue || null,
    heure_arrivee: payload.heure_arrivee || null,
    statut,
    created_by: createdBy,
  };
  const { data, error } = await supabase.from('hr_schedule_changes').insert([row]).select().single();
  if (error) throw error;

  if (needsApproval) {
    await createScheduleChangeRequestTask(data, createdBy);
  }
  return data;
}

export async function reviewScheduleChange(id, reviewerId, { statut, review_note = null } = {}) {
  if (!['validee', 'refusee'].includes(statut)) {
    throw new Error('Statut de revue invalide');
  }
  const { data, error } = await supabase
    .from('hr_schedule_changes')
    .update({
      statut,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
      review_note: review_note || null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  await completeScheduleChangeRequestTask(id, reviewerId);
  await createScheduleChangeResponseTask(data, reviewerId);
  return data;
}

export async function deleteScheduleChange(id) {
  const { error } = await supabase.from('hr_schedule_changes').delete().eq('id', id);
  if (error) throw error;
}

export async function createScheduleChangeRequestTask(changeRow, createdBy) {
  const { createTask, fetchAdminIds } = await import('../../tasks/services/taskService.js');
  const adminIds = await fetchAdminIds();
  const assignees = adminIds.length ? adminIds : (createdBy ? [createdBy] : []);
  if (!assignees.length) return null;

  const titre = `Demande de changement d'horaire (${changeRow.date_debut})`;
  return createTask(
    titre,
    JSON.stringify({
      type: 'hr_horaire_demande',
      change_id: changeRow.id,
      user_id: changeRow.user_id,
      date_debut: changeRow.date_debut,
      heure_debut: changeRow.heure_debut || changeRow.heure_prevue || null,
      heure_fin: changeRow.heure_fin || null,
      commentaire: changeRow.commentaire || null,
    }),
    assignees,
    createdBy || assignees[0],
  );
}

export async function createScheduleChangeResponseTask(changeRow, createdBy) {
  const { createTask } = await import('../../tasks/services/taskService.js');
  if (!changeRow?.user_id) return null;
  const decision = changeRow.statut === 'validee' ? 'accepté' : 'refusé';
  const titre = `Réponse horaire : ${decision} (${changeRow.date_debut})`;
  return createTask(
    titre,
    JSON.stringify({
      type: 'hr_horaire_reponse',
      change_id: changeRow.id,
      statut: changeRow.statut,
      date_debut: changeRow.date_debut,
      heure_debut: changeRow.heure_debut || changeRow.heure_prevue || null,
      heure_fin: changeRow.heure_fin || null,
      review_note: changeRow.review_note || null,
    }),
    [changeRow.user_id],
    createdBy || changeRow.user_id,
  );
}

async function completeScheduleChangeRequestTask(changeId, completedBy) {
  const { completeAssignmentByTaskId } = await import('../../tasks/services/taskService.js');
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, description')
    .order('created_at', { ascending: false })
    .limit(200);

  const task = (tasks || []).find((t) => {
    try {
      const d = JSON.parse(t.description || '{}');
      return d.type === 'hr_horaire_demande' && d.change_id === changeId;
    } catch {
      return false;
    }
  });
  if (!task) return;
  await completeAssignmentByTaskId(task.id, `Revue RH horaire (par ${completedBy})`);
}

export const DEFAULT_MIN_STAFF = {
  preparateur: 1,
  pharmacien: 1,
  autre: 0,
};

/** Normalise seuils par métier (rétrocompat `{ min: N }`). */
export function normalizeMinStaff(value) {
  if (value && typeof value === 'object') {
    if (
      'preparateur' in value
      || 'pharmacien' in value
      || 'autre' in value
    ) {
      return {
        preparateur: Math.max(0, Number(value.preparateur) || 0),
        pharmacien: Math.max(0, Number(value.pharmacien) || 0),
        autre: Math.max(0, Number(value.autre) || 0),
      };
    }
    if (value.min != null) {
      const n = Math.max(0, Number(value.min) || 0);
      return { preparateur: n, pharmacien: 0, autre: 0 };
    }
  }
  return { ...DEFAULT_MIN_STAFF };
}

/**
 * Sous-effectif si un métier avec seuil > 0 n'atteint pas le seuil (count < seuil).
 */
export function isStaffingShortage(counts, thresholds) {
  const t = normalizeMinStaff(thresholds);
  const jobs = ['preparateur', 'pharmacien', 'autre'];
  return jobs.some((job) => t[job] > 0 && Number(counts[job] || 0) < t[job]);
}

export function staffingShortageDetails(counts, thresholds) {
  const t = normalizeMinStaff(thresholds);
  const details = {};
  ['preparateur', 'pharmacien', 'autre'].forEach((job) => {
    details[job] = t[job] > 0 && Number(counts[job] || 0) < t[job];
  });
  return details;
}

export async function fetchMinStaff() {
  const { data, error } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'hr_min_staff')
    .maybeSingle();
  if (error) throw error;
  return normalizeMinStaff(data?.value);
}

export async function saveMinStaff(thresholds) {
  const value = normalizeMinStaff(thresholds);
  const { error } = await supabase.from('app_settings').upsert({
    key: 'hr_min_staff',
    value,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return value;
}

/**
 * Jours en manque d'effectif sur [from, to].
 * Compte les collabs avec créneau effectif ce jour, hors absences validées.
 */
export async function fetchStaffingShortages({ from, to, minStaff = null } = {}) {
  const profiles = await fetchTeamProfiles();
  const schedules = await fetchWorkSchedules();
  const absences = (await fetchAbsences({ from, to })).filter((a) => a.statut === 'validee');
  const thresholds = normalizeMinStaff(minStaff ?? await fetchMinStaff());
  const dates = eachDateInRange(from, to);

  return dates.map((dateStr) => {
    const counts = { preparateur: 0, pharmacien: 0, autre: 0 };
    const names = [];
    profiles.forEach((p) => {
      const onAbsence = absences.some((a) => a.user_id === p.id && absenceCoversDate(a, dateStr));
      if (onAbsence) return;
      const slots = effectiveSchedulesForDate(schedules, p.id, dateStr, { fallbackPharmacy: false });
      if (!slots.length) return;
      const job = p.job_title || 'autre';
      counts[job] = (counts[job] || 0) + 1;
      names.push(p.display_name);
    });
    const open = effectiveSchedulesForDate(schedules, null, dateStr).length > 0
      || (counts.preparateur + counts.pharmacien + counts.autre) > 0;
    const shortage = open && isStaffingShortage(counts, thresholds);
    const byJob = staffingShortageDetails(counts, thresholds);
    return {
      date: dateStr,
      dow: new Date(`${dateStr}T12:00:00`).getDay(),
      open,
      count: counts.preparateur + counts.pharmacien + counts.autre,
      counts,
      min: thresholds,
      shortage,
      byJob,
      names,
    };
  }).filter((d) => d.open);
}

/**
 * Présence du jour via taskbar_logs.
 */
export async function fetchPresenceForDay(dateStr, { schedules = null, profiles = null } = {}) {
  const start = `${dateStr}T00:00:00`;
  const end = `${dateStr}T23:59:59`;
  const { data, error } = await supabase
    .from('taskbar_logs')
    .select('user_id, action, created_at')
    .gte('created_at', start)
    .lte('created_at', end)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const team = profiles || await fetchTeamProfiles();
  const sched = schedules || await fetchWorkSchedules();

  const byUser = {};
  (data || []).forEach((log) => {
    if (!byUser[log.user_id]) {
      byUser[log.user_id] = {
        present: true,
        arrival: null,
        last: log.created_at,
        actions: 0,
      };
    }
    byUser[log.user_id].last = log.created_at;
    byUser[log.user_id].actions += 1;
    if ((log.action === 'login' || log.action === 'expand') && !byUser[log.user_id].arrival) {
      byUser[log.user_id].arrival = log.created_at;
    }
  });

  return team.map((p) => {
    const info = byUser[p.id];
    const slots = effectiveSchedulesForDate(sched, p.id, dateStr, { fallbackPharmacy: false });
    const theoStart = slots.length
      ? slots.reduce((min, s) => {
        const t = String(s.start_time).slice(0, 5);
        return !min || t < min ? t : min;
      }, null)
      : null;
    return {
      user_id: p.id,
      display_name: p.display_name,
      job_title: p.job_title || 'autre',
      present: !!info,
      arrival: info?.arrival || null,
      last: info?.last || null,
      theo_start: theoStart,
      theo_slots: slots.map((s) => ({
        start: String(s.start_time).slice(0, 5),
        end: String(s.end_time).slice(0, 5),
        label: s.label,
      })),
    };
  });
}

export async function fetchMonthlyHoursRecap(year, month) {
  const profiles = await fetchTeamProfiles();
  const schedules = await fetchWorkSchedules();
  const dates = eachDateInMonth(year, month);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const { data: logs, error } = await supabase
    .from('taskbar_logs')
    .select('user_id, created_at')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`);
  if (error) throw error;

  const absences = (await fetchAbsences({ from, to })).filter((a) => a.statut === 'validee');
  const allAbsences = await fetchAbsences({ from, to });
  const changes = await fetchScheduleChanges();
  const monthChanges = (changes || []).filter(
    (c) => c.date_debut >= from && c.date_debut <= to,
  );

  const daysWithActivity = {};
  const arrivalsByDay = {};
  (logs || []).forEach((l) => {
    const d = String(l.created_at).slice(0, 10);
    if (!daysWithActivity[l.user_id]) daysWithActivity[l.user_id] = new Set();
    daysWithActivity[l.user_id].add(d);
    if (!arrivalsByDay[l.user_id]) arrivalsByDay[l.user_id] = {};
    if (!arrivalsByDay[l.user_id][d] || l.created_at < arrivalsByDay[l.user_id][d]) {
      arrivalsByDay[l.user_id][d] = l.created_at;
    }
  });

  const people = profiles.map((p) => {
    const userAbs = absences.filter((a) => a.user_id === p.id);
    const userAbsAll = allAbsences.filter((a) => a.user_id === p.id);
    const userChanges = monthChanges.filter((c) => c.user_id === p.id);

    let theoDays = 0;
    let theoHours = 0;
    dates.forEach((dateStr) => {
      const onAbsence = userAbs.some((a) => absenceCoversDate(a, dateStr));
      if (onAbsence) return;
      const slots = effectiveSchedulesForDate(schedules, p.id, dateStr, { fallbackPharmacy: false });
      if (!slots.length) return;
      theoDays += 1;
      slots.forEach((s) => {
        theoHours += slotHours(s.start_time, s.end_time);
      });
    });

    let absenceDays = 0;
    userAbs.forEach((a) => {
      dates.forEach((dateStr) => {
        if (absenceCoversDate(a, dateStr) && dateInRange(dateStr, from, to)) {
          absenceDays += 1;
        }
      });
    });

    const retards = userChanges.filter((c) => c.change_type === 'retard');

    return {
      user_id: p.id,
      display_name: p.display_name,
      job_title: p.job_title || 'autre',
      theo_days: theoDays,
      theo_hours: Math.round(theoHours * 10) / 10,
      present_days: daysWithActivity[p.id]?.size || 0,
      absence_days: absenceDays,
      retards_count: retards.length,
      absences: userAbsAll.map((a) => ({
        type: a.absence_type,
        debut: a.date_debut,
        fin: a.date_fin,
        statut: a.statut,
        motif: a.motif || '',
      })),
      changes: userChanges.map((c) => ({
        type: c.change_type,
        date: c.date_debut,
        prevue: c.heure_prevue ? String(c.heure_prevue).slice(0, 5) : '',
        arrivee: c.heure_arrivee ? String(c.heure_arrivee).slice(0, 5) : '',
        statut: c.statut,
        commentaire: c.commentaire || '',
      })),
      present_dates: [...(daysWithActivity[p.id] || [])].sort(),
    };
  });

  return people;
}

/** Données jour par jour du mois (présence + planning) pour export paie. */
export async function fetchMonthDailyPresence(year, month) {
  const profiles = await fetchTeamProfiles();
  const schedules = await fetchWorkSchedules();
  const dates = eachDateInMonth(year, month);
  const from = dates[0];
  const to = dates[dates.length - 1];

  const { data: logs, error } = await supabase
    .from('taskbar_logs')
    .select('user_id, action, created_at')
    .gte('created_at', `${from}T00:00:00`)
    .lte('created_at', `${to}T23:59:59`)
    .order('created_at', { ascending: true });
  if (error) throw error;

  const absences = (await fetchAbsences({ from, to })).filter((a) => a.statut === 'validee');

  return dates.map((dateStr) => {
    const dow = new Date(`${dateStr}T12:00:00`).getDay();
    const dayLogs = (logs || []).filter((l) => String(l.created_at).slice(0, 10) === dateStr);
    const firstByUser = {};
    const lastByUser = {};
    dayLogs.forEach((l) => {
      if (!firstByUser[l.user_id]) firstByUser[l.user_id] = l.created_at;
      lastByUser[l.user_id] = l.created_at;
    });

    const rows = profiles.map((p) => {
      const slots = effectiveSchedulesForDate(schedules, p.id, dateStr, { fallbackPharmacy: false });
      const onAbsence = absences.some((a) => a.user_id === p.id && absenceCoversDate(a, dateStr));
      return {
        user_id: p.id,
        display_name: p.display_name,
        job_title: p.job_title || 'autre',
        planned: slots.map((s) => `${String(s.start_time).slice(0, 5)}–${String(s.end_time).slice(0, 5)}`).join(', '),
        absence: onAbsence,
        present: !!firstByUser[p.id],
        arrival: firstByUser[p.id] || null,
        last: lastByUser[p.id] || null,
      };
    }).filter((r) => r.planned || r.present || r.absence);

    return { date: dateStr, dow, rows };
  });
}

export function plannedStartForDay(schedules, userId, dateStr) {
  const slots = effectiveSchedulesForDate(schedules, userId, dateStr);
  if (!slots.length) return '';
  return slots.reduce((min, s) => {
    const t = String(s.start_time).slice(0, 5);
    return !min || t < min ? t : min;
  }, '');
}
