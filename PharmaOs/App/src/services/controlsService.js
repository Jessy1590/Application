import { supabase } from './supabaseClient.js';

/** Contrôles adaptés pharmacie de ville : 1 frigo + stupéfiants + ménage */
export const CONTROL_TYPES = [
  { value: 'temperature_frigo', label: 'Température — Frigo (+2°C à +8°C)', hasValue: true, min: 2, max: 8 },
  { value: 'controle_stupefiants', label: 'Contrôle registre stupéfiants', hasValue: false },
  { value: 'menage_officine', label: 'Ménage officine', hasValue: false },
];

export const SHIFTS = [
  { value: 'matin', label: 'Matin' },
  { value: 'soir', label: 'Soir' },
];

export async function insertDailyControl(userId, payload) {
  const { controlType, shift, value, isCompliant, notes } = payload;
  return supabase.from('daily_controls').insert({
    user_id: userId,
    control_type: controlType,
    shift: shift || null,
    value: value ?? null,
    is_compliant: isCompliant,
    details: { notes: notes || '' },
  });
}

export async function fetchTodayControls(userId) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return supabase
    .from('daily_controls')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', start.toISOString())
    .order('created_at', { ascending: false });
}

export async function fetchEquipmentCalibrations() {
  return supabase
    .from('equipment_calibrations')
    .select('*')
    .order('calibration_end_date', { ascending: true });
}
